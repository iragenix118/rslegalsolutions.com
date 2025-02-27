const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const PDFDocument = require('pdfkit');
const logger = require('./logger');
const payment = require('./payment');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class BillingService {
  constructor() {
    this.invoiceStatuses = {
      DRAFT: 'draft',
      PENDING: 'pending',
      PAID: 'paid',
      OVERDUE: 'overdue',
      CANCELLED: 'cancelled',
      REFUNDED: 'refunded'
    };

    this.paymentMethods = {
      CREDIT_CARD: 'credit_card',
      BANK_TRANSFER: 'bank_transfer',
      UPI: 'upi',
      CASH: 'cash',
      CHEQUE: 'cheque'
    };

    this.taxRates = {
      GST: 0.18, // 18% GST
      CESS: 0.01 // 1% CESS
    };

    this.initialize();
  }

  // Initialize billing service
  async initialize() {
    try {
      await this.setupAutomatedBilling();
      logger.info('Billing service initialized');
    } catch (error) {
      logger.error('Billing service initialization failed:', error);
      throw new ServiceError('Billing service initialization failed', 'billing');
    }
  }

  // Create new invoice
  async createInvoice(data) {
    try {
      const invoiceNumber = await this.generateInvoiceNumber();
      
      const invoice = await mongoose.model('Invoice').create({
        ...data,
        invoiceNumber,
        status: this.invoiceStatuses.DRAFT,
        timeline: [{
          action: 'Invoice Created',
          description: 'New invoice created',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Calculate totals
      await this.calculateInvoiceTotals(invoice);

      // Generate PDF
      await this.generateInvoicePDF(invoice);

      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice:', error);
      throw error;
    }
  }

  // Update invoice
  async updateInvoice(invoiceId, updates, userId) {
    try {
      const invoice = await mongoose.model('Invoice').findById(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Validate status transition
      if (updates.status) {
        this.validateStatusTransition(invoice.status, updates.status);
      }

      // Track changes
      const changes = this.trackChanges(invoice, updates);

      // Update invoice
      Object.assign(invoice, updates);

      // Recalculate totals if items changed
      if (updates.items) {
        await this.calculateInvoiceTotals(invoice);
      }

      // Add timeline entry
      if (changes.length > 0) {
        invoice.timeline.push({
          action: 'Invoice Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      await invoice.save();

      // Regenerate PDF if needed
      if (changes.length > 0) {
        await this.generateInvoicePDF(invoice);
      }

      return invoice;
    } catch (error) {
      logger.error('Failed to update invoice:', error);
      throw error;
    }
  }

  // Process payment
  async processPayment(invoiceId, paymentData) {
    try {
      const invoice = await mongoose.model('Invoice').findById(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Process payment through payment service
      const paymentResult = await payment.processPayment({
        amount: invoice.totalAmount,
        currency: invoice.currency,
        method: paymentData.method,
        ...paymentData
      });

      // Update invoice status
      invoice.status = this.invoiceStatuses.PAID;
      invoice.paymentDetails = {
        method: paymentData.method,
        transactionId: paymentResult.transactionId,
        paidAt: new Date()
      };

      invoice.timeline.push({
        action: 'Payment Processed',
        description: `Payment received via ${paymentData.method}`,
        performedBy: paymentData.processedBy,
        timestamp: new Date()
      });

      await invoice.save();

      // Send payment confirmation
      await this.sendPaymentConfirmation(invoice);

      return invoice;
    } catch (error) {
      logger.error('Failed to process payment:', error);
      throw error;
    }
  }

  // Calculate invoice totals
  async calculateInvoiceTotals(invoice) {
    try {
      let subtotal = 0;
      let taxTotal = 0;

      // Calculate subtotal
      invoice.items.forEach(item => {
        const itemTotal = item.quantity * item.rate;
        subtotal += itemTotal;
        item.total = itemTotal;
      });

      // Calculate taxes
      if (invoice.taxable) {
        const gstAmount = subtotal * this.taxRates.GST;
        const cessAmount = subtotal * this.taxRates.CESS;
        taxTotal = gstAmount + cessAmount;

        invoice.taxes = {
          GST: gstAmount,
          CESS: cessAmount
        };
      }

      // Apply discounts
      let discountAmount = 0;
      if (invoice.discount) {
        if (invoice.discount.type === 'percentage') {
          discountAmount = subtotal * (invoice.discount.value / 100);
        } else {
          discountAmount = invoice.discount.value;
        }
      }

      // Calculate final total
      invoice.subtotal = subtotal;
      invoice.taxTotal = taxTotal;
      invoice.discountAmount = discountAmount;
      invoice.totalAmount = subtotal + taxTotal - discountAmount;

      await invoice.save();
      return invoice;
    } catch (error) {
      logger.error('Failed to calculate invoice totals:', error);
      throw error;
    }
  }

  // Generate invoice PDF
  async generateInvoicePDF(invoice) {
    try {
      const doc = new PDFDocument();
      const filename = `invoice-${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(__dirname, '../invoices', filename);

      // Add company logo
      doc.image('path/to/logo.png', 50, 45, { width: 150 });

      // Add invoice header
      doc.fontSize(20)
         .text('INVOICE', 50, 200)
         .fontSize(10)
         .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 220)
         .text(`Date: ${DateTime.fromJSDate(invoice.createdAt).toFormat('dd/MM/yyyy')}`, 50, 235);

      // Add client information
      doc.text(`Client: ${invoice.client.name}`, 50, 270)
         .text(`Address: ${invoice.client.address}`, 50, 285)
         .text(`Email: ${invoice.client.email}`, 50, 300);

      // Add items table
      let yPos = 350;
      doc.fontSize(12)
         .text('Description', 50, yPos)
         .text('Quantity', 200, yPos)
         .text('Rate', 300, yPos)
         .text('Amount', 400, yPos);

      yPos += 20;
      invoice.items.forEach(item => {
        doc.fontSize(10)
           .text(item.description, 50, yPos)
           .text(item.quantity.toString(), 200, yPos)
           .text(item.rate.toString(), 300, yPos)
           .text(item.total.toString(), 400, yPos);
        yPos += 20;
      });

      // Add totals
      yPos += 20;
      doc.text('Subtotal:', 300, yPos)
         .text(invoice.subtotal.toString(), 400, yPos);

      if (invoice.taxable) {
        yPos += 15;
        doc.text('GST:', 300, yPos)
           .text(invoice.taxes.GST.toString(), 400, yPos);
        yPos += 15;
        doc.text('CESS:', 300, yPos)
           .text(invoice.taxes.CESS.toString(), 400, yPos);
      }

      if (invoice.discountAmount > 0) {
        yPos += 15;
        doc.text('Discount:', 300, yPos)
           .text(`-${invoice.discountAmount.toString()}`, 400, yPos);
      }

      yPos += 20;
      doc.fontSize(12)
         .text('Total Amount:', 300, yPos)
         .text(invoice.totalAmount.toString(), 400, yPos);

      // Add payment instructions
      doc.fontSize(10)
         .text('Payment Instructions:', 50, yPos + 50)
         .text('Bank: Example Bank', 50, yPos + 65)
         .text('Account: 1234567890', 50, yPos + 80)
         .text('IFSC: EXMP0001234', 50, yPos + 95);

      // Add footer
      doc.fontSize(8)
         .text('Thank you for your business', 50, 700)
         .text('Terms & Conditions Apply', 50, 715);

      doc.end();

      // Save file path in invoice
      invoice.pdfPath = filepath;
      await invoice.save();

      return filepath;
    } catch (error) {
      logger.error('Failed to generate invoice PDF:', error);
      throw error;
    }
  }

  // Send invoice email
  async sendInvoiceEmail(invoiceId) {
    try {
      const invoice = await mongoose.model('Invoice')
        .findById(invoiceId)
        .populate('client');

      await mailer.sendMail({
        to: invoice.client.email,
        subject: `Invoice #${invoice.invoiceNumber} from RS Legal Solutions`,
        template: 'invoice',
        context: {
          invoice,
          dueDate: DateTime.fromJSDate(invoice.dueDate).toFormat('dd/MM/yyyy')
        },
        attachments: [{
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          path: invoice.pdfPath
        }]
      });

      invoice.timeline.push({
        action: 'Invoice Sent',
        description: `Invoice sent to ${invoice.client.email}`,
        timestamp: new Date()
      });

      await invoice.save();
    } catch (error) {
      logger.error('Failed to send invoice email:', error);
      throw error;
    }
  }

  // Helper: Generate invoice number
  async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Invoice').countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });

    return `INV-${year}-${(count + 1).toString().padStart(4, '0')}`;
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Validate status transition
  validateStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = {
      [this.invoiceStatuses.DRAFT]: [
        this.invoiceStatuses.PENDING,
        this.invoiceStatuses.CANCELLED
      ],
      [this.invoiceStatuses.PENDING]: [
        this.invoiceStatuses.PAID,
        this.invoiceStatuses.OVERDUE,
        this.invoiceStatuses.CANCELLED
      ],
      [this.invoiceStatuses.PAID]: [
        this.invoiceStatuses.REFUNDED
      ]
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }
}

// Export singleton instance
module.exports = new BillingService();
