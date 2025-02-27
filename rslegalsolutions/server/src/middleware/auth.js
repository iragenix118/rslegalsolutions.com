const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate user using JWT
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findOne({ _id: decoded.id, isActive: true });

    if (!user) {
      throw new Error();
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Please authenticate' });
  }
};

// Middleware to check user role
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied: insufficient permissions' 
      });
    }
    next();
  };
};

// Middleware to check specific permissions
const checkPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const hasPermission = requiredPermissions.every(permission =>
      req.user.permissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        message: 'Access denied: insufficient permissions' 
      });
    }
    next();
  };
};

// Rate limiting middleware
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token'
    });
  }

  res.status(500).json({
    message: 'Internal server error'
  });
};

module.exports = {
  auth,
  checkRole,
  checkPermission,
  rateLimit,
  errorHandler
};
