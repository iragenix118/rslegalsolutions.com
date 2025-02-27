const logger = require('./logger');

// Base Error class for application-specific errors
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// HTTP 400 - Bad Request
class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

// HTTP 401 - Unauthorized
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// HTTP 403 - Forbidden
class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// HTTP 404 - Not Found
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

// HTTP 409 - Conflict
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

// HTTP 422 - Unprocessable Entity
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// HTTP 429 - Too Many Requests
class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

// Database Error
class DatabaseError extends AppError {
  constructor(message = 'Database error occurred') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

// Third Party Service Error
class ServiceError extends AppError {
  constructor(message = 'Service error occurred', serviceName = 'unknown') {
    super(message, 503, 'SERVICE_ERROR');
    this.serviceName = serviceName;
  }
}

// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error
  logger.error('Error occurred:', {
    error: {
      message: err.message,
      stack: err.stack,
      code: err.errorCode,
      status: err.statusCode
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userId: req.user?.id
    }
  });

  // Development error response
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      status: err.status,
      error: {
        message: err.message,
        code: err.errorCode,
        stack: err.stack,
        ...(err.errors && { errors: err.errors })
      }
    });
  }

  // Production error response
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      code: err.errorCode,
      ...(err.errors && { errors: err.errors })
    });
  }

  // Generic error message for non-operational errors in production
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
    code: 'INTERNAL_ERROR'
  });
};

// Async Error Handler
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error Monitor
class ErrorMonitor {
  constructor() {
    this.errorCounts = new Map();
    this.errorThreshold = parseInt(process.env.ERROR_THRESHOLD) || 10;
    this.timeWindow = parseInt(process.env.ERROR_TIME_WINDOW) || 300000; // 5 minutes
  }

  // Track error occurrence
  trackError(error) {
    const errorKey = `${error.errorCode}:${error.message}`;
    const now = Date.now();
    
    if (!this.errorCounts.has(errorKey)) {
      this.errorCounts.set(errorKey, []);
    }

    const occurrences = this.errorCounts.get(errorKey);
    occurrences.push(now);

    // Remove old occurrences
    const cutoff = now - this.timeWindow;
    while (occurrences.length > 0 && occurrences[0] < cutoff) {
      occurrences.shift();
    }

    // Check if threshold is exceeded
    if (occurrences.length >= this.errorThreshold) {
      this.handleThresholdExceeded(error, occurrences.length);
      this.errorCounts.delete(errorKey); // Reset counter
    }
  }

  // Handle threshold exceeded
  async handleThresholdExceeded(error, count) {
    logger.error('Error threshold exceeded:', {
      error: {
        code: error.errorCode,
        message: error.message
      },
      occurrences: count,
      timeWindow: `${this.timeWindow / 1000} seconds`
    });

    // Send notification to administrators
    try {
      const mailer = require('./mailer');
      await mailer.sendAdminNotification({
        subject: 'Error Threshold Exceeded',
        message: `Error ${error.errorCode} occurred ${count} times in the last ${this.timeWindow / 1000} seconds`,
        error: error
      });
    } catch (err) {
      logger.error('Failed to send error notification:', err);
    }
  }

  // Clean up old error counts
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.timeWindow;

    for (const [key, occurrences] of this.errorCounts.entries()) {
      // Remove old occurrences
      while (occurrences.length > 0 && occurrences[0] < cutoff) {
        occurrences.shift();
      }

      // Remove empty entries
      if (occurrences.length === 0) {
        this.errorCounts.delete(key);
      }
    }
  }
}

// Create error monitor instance
const errorMonitor = new ErrorMonitor();

// Start periodic cleanup
setInterval(() => {
  errorMonitor.cleanup();
}, 60000); // Run every minute

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  DatabaseError,
  ServiceError,
  errorHandler,
  catchAsync,
  errorMonitor
};
