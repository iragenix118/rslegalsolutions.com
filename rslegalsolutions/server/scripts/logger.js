const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { format } = winston;
const path = require('path');
require('dotenv').config();

class Logger {
  constructor() {
    this.logDir = process.env.LOG_DIR || 'logs';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.environment = process.env.NODE_ENV || 'development';

    this.setupLogger();
    this.setupErrorHandling();
  }

  setupLogger() {
    // Custom format for logs
    const customFormat = format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.errors({ stack: true }),
      format.metadata(),
      format.json()
    );

    // Console format with colors
    const consoleFormat = format.combine(
      format.colorize(),
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.printf(({ timestamp, level, message, metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (metadata && Object.keys(metadata).length > 0) {
          msg += `\n${JSON.stringify(metadata, null, 2)}`;
        }
        return msg;
      })
    );

    // Create logger instance
    this.logger = winston.createLogger({
      level: this.logLevel,
      format: customFormat,
      defaultMeta: { service: 'rs-legal-solutions', environment: this.environment },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: consoleFormat
        }),

        // Info log file
        new DailyRotateFile({
          filename: path.join(this.logDir, 'application-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info'
        }),

        // Error log file
        new DailyRotateFile({
          filename: path.join(this.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error'
        }),

        // Access log file
        new DailyRotateFile({
          filename: path.join(this.logDir, 'access-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '7d',
          level: 'http'
        })
      ]
    });

    // Add MongoDB transport if configured
    if (process.env.MONGODB_LOG_URI) {
      require('winston-mongodb');
      this.logger.add(new winston.transports.MongoDB({
        db: process.env.MONGODB_LOG_URI,
        collection: 'logs',
        options: { useUnifiedTopology: true },
        level: 'info',
        metaKey: 'metadata'
      }));
    }
  }

  setupErrorHandling() {
    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new DailyRotateFile({
        filename: path.join(this.logDir, 'exceptions-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d'
      })
    );

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (error) => {
      this.error('Unhandled Promise Rejection', { error });
    });
  }

  // Logging methods
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  http(message, meta = {}) {
    this.logger.http(message, meta);
  }

  // Request logging middleware
  requestLogger() {
    return (req, res, next) => {
      const startTime = new Date();

      // Log request
      this.http('Incoming Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      // Log response
      res.on('finish', () => {
        const duration = new Date() - startTime;
        this.http('Request Completed', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`
        });
      });

      next();
    };
  }

  // Error logging middleware
  errorLogger() {
    return (err, req, res, next) => {
      this.error('Express Error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      next(err);
    };
  }

  // Performance monitoring
  startTimer() {
    return process.hrtime();
  }

  endTimer(start) {
    const diff = process.hrtime(start);
    return (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to milliseconds
  }

  // Log performance metrics
  logPerformance(operation, duration, meta = {}) {
    this.info(`Performance: ${operation}`, {
      ...meta,
      duration: `${duration.toFixed(2)}ms`
    });
  }

  // Log API metrics
  logAPIMetrics(req, res, duration) {
    this.info('API Metrics', {
      method: req.method,
      endpoint: req.originalUrl,
      status: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
  }

  // System metrics logging
  logSystemMetrics() {
    const metrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      timestamp: new Date()
    };

    this.info('System Metrics', metrics);
  }

  // Start periodic system metrics logging
  startSystemMetricsLogging(interval = 300000) { // Default: 5 minutes
    setInterval(() => this.logSystemMetrics(), interval);
  }

  // Get log streams for analysis
  getLogStream(type = 'application', date = new Date()) {
    const filename = path.join(
      this.logDir,
      `${type}-${date.toISOString().split('T')[0]}.log`
    );
    return require('fs').createReadStream(filename);
  }
}

// Export singleton instance
module.exports = new Logger();
