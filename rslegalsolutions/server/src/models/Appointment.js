const mongoose = require('mongoose');
const validator = require('validator');

const appointmentSchema = new mongoose.Schema({
  clientName: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email'
    }
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  serviceType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: [true, 'Service type is required']
  },
  appointmentDate: {
    type: Date,
    required: [true, 'Appointment date is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Appointment date must be in the future'
    }
  },
  preferredTime: {
    type: String,
    required: [true, 'Preferred time is required'],
    enum: [
      '09:00 AM', '10:00 AM', '11:00 AM',
      '12:00 PM', '02:00 PM', '03:00 PM',
      '04:00 PM', '05:00 PM'
    ]
  },
  message: {
    type: String,
    trim: true,
    maxLength: [500, 'Message cannot exceed 500 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  confirmationCode: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Generate unique confirmation code before saving
appointmentSchema.pre('save', function(next) {
  if (!this.confirmationCode) {
    this.confirmationCode = Math.random().toString(36).substring(2, 15) + 
                           Math.random().toString(36).substring(2, 15);
  }
  next();
});

// Index for efficient queries
appointmentSchema.index({ appointmentDate: 1, status: 1 });
appointmentSchema.index({ email: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
