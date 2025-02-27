const Joi = require('joi');
const sanitizeHtml = require('sanitize-html');
const logger = require('./logger');

class Validator {
  constructor() {
    this.customMessages = {
      'string.empty': '{#label} cannot be empty',
      'string.min': '{#label} should have at least {#limit} characters',
      'string.max': '{#label} should have at most {#limit} characters',
      'string.email': 'Please provide a valid email address',
      'string.pattern.base': '{#label} contains invalid characters',
      'number.base': '{#label} must be a number',
      'number.min': '{#label} must be greater than or equal to {#limit}',
      'number.max': '{#label} must be less than or equal to {#limit}',
      'date.base': '{#label} must be a valid date',
      'array.min': '{#label} must contain at least {#limit} items',
      'array.max': '{#label} must contain at most {#limit} items',
      'object.base': '{#label} must be an object'
    };
  }

  // Common validation schemas
  get schemas() {
    return {
      // User schemas
      user: {
        create: Joi.object({
          name: this.name().required(),
          email: this.email().required(),
          password: this.password().required(),
          role: Joi.string().valid('user', 'admin', 'staff').default('user'),
          phone: this.phone().optional()
        }),
        update: Joi.object({
          name: this.name().optional(),
          email: this.email().optional(),
          password: this.password().optional(),
          phone: this.phone().optional()
        })
      },

      // Authentication schemas
      auth: {
        login: Joi.object({
          email: this.email().required(),
          password: Joi.string().required()
        }),
        register: Joi.object({
          name: this.name().required(),
          email: this.email().required(),
          password: this.password().required(),
          confirmPassword: Joi.string().valid(Joi.ref('password')).required()
            .messages({ 'any.only': 'Passwords must match' })
        }),
        resetPassword: Joi.object({
          token: Joi.string().required(),
          password: this.password().required(),
          confirmPassword: Joi.string().valid(Joi.ref('password')).required()
            .messages({ 'any.only': 'Passwords must match' })
        })
      },

      // Appointment schemas
      appointment: {
        create: Joi.object({
          clientName: this.name().required(),
          email: this.email().required(),
          phone: this.phone().required(),
          serviceType: Joi.string().required(),
          appointmentDate: Joi.date().greater('now').required(),
          preferredTime: Joi.string().required(),
          message: this.text().optional()
        }),
        update: Joi.object({
          status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed'),
          notes: this.text().optional()
        })
      },

      // Blog post schemas
      blog: {
        create: Joi.object({
          title: this.title().required(),
          content: this.content().required(),
          category: Joi.string().required(),
          tags: Joi.array().items(Joi.string()).min(1).max(5),
          status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
          featuredImage: Joi.string().uri().optional()
        }),
        update: Joi.object({
          title: this.title().optional(),
          content: this.content().optional(),
          category: Joi.string().optional(),
          tags: Joi.array().items(Joi.string()).min(1).max(5).optional(),
          status: Joi.string().valid('draft', 'published', 'archived').optional()
        })
      },

      // Contact form schema
      contact: {
        create: Joi.object({
          name: this.name().required(),
          email: this.email().required(),
          phone: this.phone().optional(),
          subject: this.title().required(),
          message: this.text().required(),
          serviceInterest: Joi.string().optional()
        })
      },

      // Service schemas
      service: {
        create: Joi.object({
          title: this.title().required(),
          description: this.text().required(),
          category: Joi.string().required(),
          price: Joi.number().min(0).optional(),
          duration: Joi.number().min(15).max(480).optional(), // in minutes
          isActive: Joi.boolean().default(true)
        }),
        update: Joi.object({
          title: this.title().optional(),
          description: this.text().optional(),
          category: Joi.string().optional(),
          price: Joi.number().min(0).optional(),
          duration: Joi.number().min(15).max(480).optional(),
          isActive: Joi.boolean().optional()
        })
      }
    };
  }

  // Common field validators
  name() {
    return Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s.'-]+$/)
      .messages(this.customMessages);
  }

  email() {
    return Joi.string()
      .email()
      .max(255)
      .lowercase()
      .messages(this.customMessages);
  }

  password() {
    return Joi.string()
      .min(8)
      .max(72)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
      .messages({
        ...this.customMessages,
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
  }

  phone() {
    return Joi.string()
      .pattern(/^\+?[\d\s-]{10,}$/)
      .messages({
        ...this.customMessages,
        'string.pattern.base': 'Please provide a valid phone number'
      });
  }

  title() {
    return Joi.string()
      .min(3)
      .max(200)
      .messages(this.customMessages);
  }

  text() {
    return Joi.string()
      .min(10)
      .max(5000)
      .messages(this.customMessages);
  }

  content() {
    return Joi.string()
      .min(50)
      .max(50000)
      .messages(this.customMessages);
  }

  // Validation middleware
  validate(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Validation error:', { errors, path: req.path });

        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors
        });
      }

      // Sanitize validated data
      req.body = this.sanitizeData(value);
      next();
    };
  }

  // Sanitize data
  sanitizeData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Sanitize HTML content for rich text fields
        if (key === 'content') {
          sanitized[key] = sanitizeHtml(value, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              img: ['src', 'alt']
            }
          });
        } else {
          // Basic sanitization for other string fields
          sanitized[key] = this.sanitizeString(value);
        }
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // Basic string sanitization
  sanitizeString(str) {
    return str
      .trim()
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  }

  // Custom validation rules
  custom() {
    return {
      password: (value, helpers) => {
        if (value.toLowerCase().includes('password')) {
          return helpers.error('password.unsafe');
        }
        return value;
      },
      objectId: (value, helpers) => {
        if (!/^[0-9a-fA-F]{24}$/.test(value)) {
          return helpers.error('objectId.invalid');
        }
        return value;
      }
    };
  }
}

// Export singleton instance
module.exports = new Validator();
