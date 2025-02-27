const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
require('dotenv').config();

class Mailer {
  constructor() {
    // Create mail transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Template directory
    this.templateDir = path.join(__dirname, '../templates/emails');

    // Default sender
    this.defaultFrom = process.env.EMAIL_FROM || 'RS Legal Solutions <noreply@rslegalsolutions.com>';
  }

  // Load and compile email template
  async loadTemplate(templateName, data) {
    const filePath = path.join(this.templateDir, `${templateName}.hbs`);
    const template = fs.readFileSync(filePath, 'utf-8');
    const compiled = handlebars.compile(template);
    return compiled(data);
  }

  // Send email
  async sendMail(options) {
    try {
      const mailOptions = {
        from: options.from || this.defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // Send appointment confirmation
  async sendAppointmentConfirmation(appointment) {
    const template = await this.loadTemplate('appointment-confirmation', {
      clientName: appointment.clientName,
      date: new Date(appointment.appointmentDate).toLocaleDateString(),
      time: appointment.preferredTime,
      confirmationCode: appointment.confirmationCode,
      serviceName: appointment.serviceType.title,
    });

    return this.sendMail({
      to: appointment.email,
      subject: 'Appointment Confirmation - RS Legal Solutions',
      html: template,
    });
  }

  // Send appointment reminder
  async sendAppointmentReminder(appointment) {
    const template = await this.loadTemplate('appointment-reminder', {
      clientName: appointment.clientName,
      date: new Date(appointment.appointmentDate).toLocaleDateString(),
      time: appointment.preferredTime,
      serviceName: appointment.serviceType.title,
    });

    return this.sendMail({
      to: appointment.email,
      subject: 'Appointment Reminder - RS Legal Solutions',
      html: template,
    });
  }

  // Send contact form acknowledgment
  async sendContactAcknowledgment(contact) {
    const template = await this.loadTemplate('contact-acknowledgment', {
      name: contact.name,
      subject: contact.subject,
      message: contact.message,
    });

    return this.sendMail({
      to: contact.email,
      subject: 'Thank You for Contacting RS Legal Solutions',
      html: template,
    });
  }

  // Send password reset email
  async sendPasswordReset(user, resetToken) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    const template = await this.loadTemplate('password-reset', {
      name: user.name,
      resetUrl,
    });

    return this.sendMail({
      to: user.email,
      subject: 'Password Reset Request - RS Legal Solutions',
      html: template,
    });
  }

  // Send welcome email
  async sendWelcomeEmail(user) {
    const template = await this.loadTemplate('welcome', {
      name: user.name,
      loginUrl: `${process.env.CLIENT_URL}/login`,
    });

    return this.sendMail({
      to: user.email,
      subject: 'Welcome to RS Legal Solutions',
      html: template,
    });
  }

  // Send newsletter
  async sendNewsletter(subscribers, newsletter) {
    const template = await this.loadTemplate('newsletter', {
      content: newsletter.content,
      unsubscribeUrl: `${process.env.CLIENT_URL}/unsubscribe`,
    });

    // Send in batches to avoid rate limits
    const batchSize = 50;
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      const bcc = batch.map(subscriber => subscriber.email).join(',');

      await this.sendMail({
        bcc,
        subject: newsletter.subject,
        html: template,
      });

      // Wait between batches
      if (i + batchSize < subscribers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Send admin notification
  async sendAdminNotification(subject, content) {
    const template = await this.loadTemplate('admin-notification', {
      subject,
      content,
    });

    return this.sendMail({
      to: process.env.ADMIN_EMAIL,
      subject: `[Admin] ${subject}`,
      html: template,
    });
  }

  // Send error notification
  async sendErrorNotification(error) {
    const template = await this.loadTemplate('error-notification', {
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
    });

    return this.sendMail({
      to: process.env.ERROR_REPORTING_EMAIL,
      subject: '[Error] System Error Notification',
      html: template,
    });
  }

  // Verify email configuration
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('Email server connection verified');
      return true;
    } catch (error) {
      console.error('Email server connection failed:', error);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new Mailer();
