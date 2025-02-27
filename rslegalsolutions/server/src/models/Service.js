const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Corporate and Commercial Law',
      'Dispute Resolution',
      'Petitions and Applications',
      'Real Estate and Property Law',
      'Registrations and Compliances',
      'Wills Trusts and Estate Planning'
    ]
  },
  features: [{
    type: String,
    trim: true
  }],
  icon: {
    type: String,
    default: 'default-service-icon.png'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create URL-friendly slug from title
serviceSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  next();
});

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
