const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const dayjs = require('dayjs');

class EmailTemplates {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.layoutsDir = path.join(this.templatesDir, 'layouts');
    this.cache = new Map();
    this.defaultContext = {
      currentYear: new Date().getFullYear(),
      websiteUrl: process.env.CLIENT_URL || 'https://rslegalsolutions.com',
      officeAddress: process.env.OFFICE_ADDRESS,
      contactPhone: process.env.CONTACT_PHONE,
      contactEmail: process.env.CONTACT_EMAIL,
      socialLinks: {
        facebook: process.env.FACEBOOK_URL,
        twitter: process.env.TWITTER_URL,
        linkedin: process.env.LINKEDIN_URL
      },
      logo: process.env.EMAIL_LOGO_URL
    };

    this.initializeTemplates();
    this.registerHelpers();
  }

  // Initialize and cache templates
  initializeTemplates() {
    try {
      // Register base layout
      const baseLayout = fs.readFileSync(
        path.join(this.layoutsDir, 'base.hbs'),
        'utf8'
      );
      handlebars.registerPartial('base', baseLayout);

      // Load and cache all templates
      const templates = fs.readdirSync(this.templatesDir);
      templates.forEach(file => {
        if (file.endsWith('.hbs') && !file.includes('layouts')) {
          const templateName = path.basename(file, '.hbs');
          const templateContent = fs.readFileSync(
            path.join(this.templatesDir, file),
            'utf8'
          );
          this.cache.set(templateName, handlebars.compile(templateContent));
        }
      });
    } catch (error) {
      console.error('Error initializing templates:', error);
    }
  }

  // Register custom Handlebars helpers
  registerHelpers() {
    handlebars.registerHelper('formatDate', function(date, format) {
      return dayjs(date).format(format || 'MMMM D, YYYY');
    });

    handlebars.registerHelper('formatTime', function(time) {
      return dayjs(time, 'HH:mm').format('h:mm A');
    });

    handlebars.registerHelper('formatCurrency', function(amount) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
    });

    handlebars.registerHelper('truncate', function(text, length) {
      if (text.length > length) {
        return text.substring(0, length) + '...';
      }
      return text;
    });

    handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    handlebars.registerHelper('ifNotEquals', function(arg1, arg2, options) {
      return arg1 !== arg2 ? options.fn(this) : options.inverse(this);
    });
  }

  // Render a template with data
  async render(templateName, data = {}) {
    try {
      const template = this.cache.get(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Merge default context with provided data
      const context = {
        ...this.defaultContext,
        ...data,
        timestamp: dayjs().format('MMMM D, YYYY h:mm A')
      };

      return template(context);
    } catch (error) {
      console.error(`Error rendering template '${templateName}':`, error);
      throw error;
    }
  }

  // Template-specific render methods
  async renderAppointmentConfirmation(appointment) {
    return this.render('appointment-confirmation', {
      title: 'Appointment Confirmation',
      clientName: appointment.clientName,
      date: dayjs(appointment.appointmentDate).format('MMMM D, YYYY'),
      time: appointment.preferredTime,
      serviceName: appointment.serviceType.title,
      confirmationCode: appointment.confirmationCode,
      appointmentUrl: `${this.defaultContext.websiteUrl}/appointments/${appointment.confirmationCode}`
    });
  }

  async renderAppointmentReminder(appointment) {
    return this.render('appointment-reminder', {
      title: 'Appointment Reminder',
      clientName: appointment.clientName,
      date: dayjs(appointment.appointmentDate).format('MMMM D, YYYY'),
      time: appointment.preferredTime,
      serviceName: appointment.serviceType.title,
      confirmationCode: appointment.confirmationCode,
      mapImageUrl: process.env.OFFICE_MAP_IMAGE_URL
    });
  }

  async renderPasswordReset(user, resetToken) {
    return this.render('password-reset', {
      title: 'Password Reset Request',
      name: user.name,
      email: user.email,
      resetUrl: `${this.defaultContext.websiteUrl}/reset-password?token=${resetToken}`,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE
    });
  }

  async renderWelcome(user) {
    return this.render('welcome', {
      title: 'Welcome to RS Legal Solutions',
      name: user.name,
      email: user.email,
      loginUrl: `${this.defaultContext.websiteUrl}/login`,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE
    });
  }

  async renderContactAcknowledgment(contact) {
    return this.render('contact-acknowledgment', {
      title: 'Thank You for Contacting Us',
      name: contact.name,
      email: contact.email,
      subject: contact.subject,
      message: contact.message
    });
  }

  async renderNewsletter(newsletter, subscriber) {
    return this.render('newsletter', {
      title: newsletter.title,
      issueDate: dayjs().format('MMMM YYYY'),
      issueNumber: newsletter.issueNumber,
      featuredArticle: newsletter.featuredArticle,
      articles: newsletter.articles,
      upcomingEvents: newsletter.events,
      unsubscribeUrl: `${this.defaultContext.websiteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`
    });
  }

  async renderErrorNotification(error) {
    return this.render('error-notification', {
      title: 'System Error Alert',
      error: {
        message: error.message,
        stack: error.stack,
        type: error.name,
        severity: error.severity || 'high',
        location: error.location || 'Unknown',
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        context: error.context
      },
      system: {
        environment: process.env.NODE_ENV,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    });
  }

  async renderAdminNotification(notification) {
    return this.render('admin-notification', {
      title: 'Admin Notification',
      subject: notification.subject,
      message: notification.message,
      priority: notification.priority || 'medium',
      metrics: notification.metrics,
      details: notification.details,
      actionItems: notification.actionItems,
      relatedLinks: notification.relatedLinks,
      dashboardUrl: `${this.defaultContext.websiteUrl}/admin/dashboard`,
      systemInfo: {
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version
      }
    });
  }
}

// Export singleton instance
module.exports = new EmailTemplates();
