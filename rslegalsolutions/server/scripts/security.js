const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const logger = require('./logger');
const cache = require('./cache');
require('dotenv').config();

class SecurityManager {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.trustProxy = process.env.TRUST_PROXY === 'true';
    this.corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
  }

  // Configure security middleware
  getMiddleware() {
    return [
      this.configureHelmet(),
      this.configureCors(),
      this.configureRateLimit(),
      this.configureMongoSanitize(),
      this.configureXss(),
      this.configureHpp(),
      this.requestSizeLimit(),
      this.securityHeaders()
    ];
  }

  // Configure Helmet middleware
  configureHelmet() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'self'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" }
    });
  }

  // Configure CORS
  configureCors() {
    return cors({
      origin: (origin, callback) => {
        if (!origin || this.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours
    });
  }

  // Configure rate limiting
  configureRateLimit() {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skip: this.shouldSkipRateLimit.bind(this),
      keyGenerator: this.generateRateLimitKey.bind(this),
      handler: this.handleRateLimitExceeded.bind(this)
    });

    // Specific limiters for different routes
    const authLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 attempts per hour
      message: 'Too many login attempts, please try again later.'
    });

    const apiLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 60 // 60 requests per minute
    });

    return {
      global: limiter,
      auth: authLimiter,
      api: apiLimiter
    };
  }

  // Configure MongoDB sanitization
  configureMongoSanitize() {
    return mongoSanitize({
      replaceWith: '_'
    });
  }

  // Configure XSS protection
  configureXss() {
    return xss();
  }

  // Configure HPP (HTTP Parameter Pollution)
  configureHpp() {
    return hpp({
      whitelist: [
        'order',
        'sort',
        'page',
        'limit',
        'fields'
      ]
    });
  }

  // Configure request size limits
  requestSizeLimit() {
    return {
      json: { limit: '10kb' },
      urlencoded: { extended: true, limit: '10kb' }
    };
  }

  // Additional security headers
  securityHeaders() {
    return (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      next();
    };
  }

  // Rate limit helpers
  shouldSkipRateLimit(req) {
    // Skip rate limiting for trusted IPs or admin users
    return (
      this.isWhitelistedIP(req.ip) ||
      (req.user && req.user.role === 'admin')
    );
  }

  generateRateLimitKey(req) {
    if (this.trustProxy) {
      return req.headers['x-forwarded-for'] || req.ip;
    }
    return req.ip;
  }

  async handleRateLimitExceeded(req, res) {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.'
    });
  }

  // IP whitelist management
  isWhitelistedIP(ip) {
    const whitelistedIPs = process.env.IP_WHITELIST?.split(',') || [];
    return whitelistedIPs.includes(ip);
  }

  // Authentication middleware
  authenticate(options = {}) {
    return async (req, res, next) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          throw new Error('No token provided');
        }

        const decoded = await this.verifyToken(token);
        req.user = decoded;

        if (options.roles && !options.roles.includes(req.user.role)) {
          throw new Error('Unauthorized role');
        }

        next();
      } catch (error) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication failed'
        });
      }
    };
  }

  // Token helpers
  extractToken(req) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return req.headers.authorization.split(' ')[1];
    }
    return null;
  }

  async verifyToken(token) {
    // Check cache first
    const cached = await cache.get(`token:${token}`);
    if (cached) {
      return cached;
    }

    // Verify and decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Cache the result
    await cache.set(`token:${token}`, decoded, 3600); // Cache for 1 hour
    
    return decoded;
  }

  // Request validation middleware
  validateRequest(schema) {
    return (req, res, next) => {
      const { error } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid request data',
          details: error.details.map(detail => detail.message)
        });
      }
      next();
    };
  }

  // SQL injection prevention
  preventSQLInjection(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/['";\\]/g, '');
  }

  // Clean user input
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .trim();
  }
}

// Export singleton instance
module.exports = new SecurityManager();
