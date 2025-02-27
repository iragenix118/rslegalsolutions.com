const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'staff'],
    default: 'staff'
  },
  avatar: {
    type: String,
    default: 'default-avatar.png'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  permissions: [{
    type: String,
    enum: [
      'manage_services',
      'manage_appointments',
      'manage_blogs',
      'manage_users',
      'view_contacts',
      'respond_contacts'
    ]
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Set default permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'admin':
        this.permissions = [
          'manage_services',
          'manage_appointments',
          'manage_blogs',
          'manage_users',
          'view_contacts',
          'respond_contacts'
        ];
        break;
      case 'editor':
        this.permissions = [
          'manage_blogs',
          'view_contacts'
        ];
        break;
      case 'staff':
        this.permissions = [
          'view_contacts',
          'respond_contacts'
        ];
        break;
    }
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      role: this.role,
      permissions: this.permissions
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
};

// Update last login
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save();
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = async function() {
  const resetToken = jwt.sign(
    { id: this._id },
    process.env.JWT_RESET_SECRET || 'reset-secret-key',
    { expiresIn: '1h' }
  );

  this.passwordResetToken = resetToken;
  this.passwordResetExpires = Date.now() + 3600000; // 1 hour
  await this.save();

  return resetToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
