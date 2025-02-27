const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class PaymentService {
  constructor() {
    this.stripe = stripe;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.currency = process.env.PAYMENT_CURRENCY || 'inr';
    this.invoiceDir = path.join(__dirname, '../invoices');
    
    this.initialize();
  }

  // Initialize payment service
  async initialize() {
    try {
      await fs.mkdir(this.invoiceDir, { recursive: true });
      await this.validateStripeConfig();
      logger.info('Payment service initialized successfully');
    } catch (error) {
      logger.error('Payment service initialization failed:', error);
      throw new ServiceError('Payment service initialization failed', 'payment');
    }
  }

  // Validate Stripe configuration
  async validateStripeConfig() {
    try {
      await this.stripe.paymentMethods.list({ limit: 1 });
    } catch (error) {
      logger.error('Invalid Stripe configuration:', error);
      throw new ServiceError('Invalid payment configuration', 'stripe');
    }
  }

  // Create payment intent
  async createPaymentIntent(amount, metadata = {}) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: this.convertToSmallestUnit(amount),
        currency: this.currency,
        metadata,
        payment_method_types: ['card'],
        capture_method: 'manual'
      });

      logger.info('Payment intent created:', paymentIntent.id);
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create payment intent:', error);
      throw new ServiceError('Payment intent creation failed', 'stripe');
    }
  }

  // Capture payment
  async capturePayment(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.capture(paymentIntentId);
      logger.info('Payment captured:', paymentIntentId);
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to capture payment:', error);
      throw new ServiceError('Payment capture failed', 'stripe');
    }
  }

  // Process refund
  async processRefund(paymentIntentId, amount = null) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        ...(amount && { amount: this.convertToSmallestUnit(amount) })
      });

      logger.info('Refund processed:', refund.id);
      return refund;
    } catch (error) {
      logger.error('Failed to process refund:', error);
      throw new ServiceError('Refund processing failed', 'stripe');
    }
  }

  // Create customer
  async createCustomer(data) {
    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        phone: data.phone,
        metadata: data.metadata
      });

      logger.info('Customer created:', customer.id);
      return customer;
    } catch (error) {
      logger.error('Failed to create customer:', error);
      throw new ServiceError('Customer creation failed', 'stripe');
    }
  }

  // Save card for future use
  async saveCard(customerId, paymentMethodId) {
    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      logger.info('Card saved for customer:', customerId);
      return true;
    } catch (error) {
      logger.error('Failed to save card:', error);
      throw new ServiceError('Card saving failed', 'stripe');
    }
  }

  // Generate invoice
  async generateInvoice(data) {
    try {
      const doc = new PDFDocument();
      const invoicePath = path.join(this.invoiceDir, `invoice-${data.invoiceNumber}.pdf`);
      const writeStream = fs.createWriteStream(invoicePath);

      // Set up PDF document
      doc.pipe(writeStream);

      // Add company logo
      doc.image('path/to/logo.png', 50, 45, { width: 150 });

      // Add invoice header
      doc.fontSize(20)
         .text('INVOICE', 50, 200)
         .fontSize(10)
         .text(`Invoice Number: ${data.invoiceNumber}`, 50, 220)
         .text(`Date: ${new Date().toLocaleDateString()}`, 50, 235);

      // Add client information
      doc.text(`Client: ${data.clientName}`, 50, 270)
         .text(`Email: ${data.clientEmail}`, 50, 285)
         .text(`Phone: ${data.clientPhone}`, 50, 300);

      // Add service details
      doc.moveDown()
         .fontSize(12)
         .text('Services:', 50, 340);

      let yPos = 370;
      data.services.forEach(service => {
        doc.fontSize(10)
           .text(service.name, 50, yPos)
           .text(service.description, 200, yPos)
           .text(`₹${service.amount}`, 400, yPos);
        yPos += 20;
      });

      // Add total
      doc.moveDown()
         .fontSize(12)
         .text(`Total Amount: ₹${data.totalAmount}`, 400, yPos + 20);

      // Add payment details
      doc.moveDown()
         .fontSize(10)
         .text('Payment Details:', 50, yPos + 60)
         .text(`Payment ID: ${data.paymentId}`, 50, yPos + 75)
         .text(`Payment Date: ${data.paymentDate}`, 50, yPos + 90);

      // Add footer
      doc.fontSize(8)
         .text('Thank you for choosing RS Legal Solutions', 50, 700)
         .text('For any queries, please contact us at contact@rslegalsolutions.com', 50, 715);

      doc.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      logger.info('Invoice generated:', invoicePath);
      return invoicePath;
    } catch (error) {
      logger.error('Failed to generate invoice:', error);
      throw new ServiceError('Invoice generation failed', 'pdf');
    }
  }

  // Send invoice email
  async sendInvoiceEmail(email, invoicePath, data) {
    try {
      await mailer.sendMail({
        to: email,
        subject: `Invoice #${data.invoiceNumber} from RS Legal Solutions`,
        template: 'invoice',
        context: {
          invoiceNumber: data.invoiceNumber,
          amount: data.totalAmount,
          date: new Date().toLocaleDateString()
        },
        attachments: [{
          filename: `invoice-${data.invoiceNumber}.pdf`,
          path: invoicePath
        }]
      });

      logger.info('Invoice email sent:', email);
      return true;
    } catch (error) {
      logger.error('Failed to send invoice email:', error);
      throw new ServiceError('Invoice email sending failed', 'email');
    }
  }

  // Handle webhook events
  async handleWebhook(body, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        this.webhookSecret
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        // Add more event handlers as needed
      }

      return { received: true };
    } catch (error) {
      logger.error('Webhook handling failed:', error);
      throw new ServiceError('Webhook handling failed', 'stripe');
    }
  }

  // Handle successful payment
  async handlePaymentSuccess(paymentIntent) {
    try {
      // Update order status
      // Generate and send invoice
      // Send confirmation email
      logger.info('Payment successful:', paymentIntent.id);
    } catch (error) {
      logger.error('Failed to handle payment success:', error);
    }
  }

  // Handle failed payment
  async handlePaymentFailure(paymentIntent) {
    try {
      // Update order status
      // Notify customer
      logger.info('Payment failed:', paymentIntent.id);
    } catch (error) {
      logger.error('Failed to handle payment failure:', error);
    }
  }

  // Convert amount to smallest currency unit
  convertToSmallestUnit(amount) {
    return Math.round(amount * 100);
  }

  // Convert from smallest currency unit
  convertFromSmallestUnit(amount) {
    return amount / 100;
  }
}

// Export singleton instance
module.exports = new PaymentService();
