const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const { auth, checkPermission } = require('../middleware/auth');

// Create new appointment (public route)
router.post('/', async (req, res) => {
  try {
    // Verify service exists
    const service = await Service.findById(req.body.serviceType);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Check if time slot is available
    const existingAppointment = await Appointment.findOne({
      appointmentDate: req.body.appointmentDate,
      preferredTime: req.body.preferredTime,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingAppointment) {
      return res.status(400).json({ 
        message: 'This time slot is already booked. Please select another time.' 
      });
    }

    const appointment = new Appointment({
      clientName: req.body.clientName,
      email: req.body.email,
      phone: req.body.phone,
      serviceType: req.body.serviceType,
      appointmentDate: req.body.appointmentDate,
      preferredTime: req.body.preferredTime,
      message: req.body.message
    });

    const savedAppointment = await appointment.save();

    // TODO: Send confirmation email to client
    
    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: savedAppointment,
      confirmationCode: savedAppointment.confirmationCode
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all appointments (protected route)
router.get('/', auth, checkPermission('manage_appointments'), async (req, res) => {
  try {
    const filters = {};
    
    // Apply date filter
    if (req.query.date) {
      const date = new Date(req.query.date);
      filters.appointmentDate = {
        $gte: new Date(date.setHours(0,0,0)),
        $lt: new Date(date.setHours(23,59,59))
      };
    }

    // Apply status filter
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const appointments = await Appointment.find(filters)
      .populate('serviceType', 'title category')
      .sort({ appointmentDate: 1, preferredTime: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get appointment by confirmation code (public route)
router.get('/confirm/:code', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ 
      confirmationCode: req.params.code 
    }).populate('serviceType', 'title category');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update appointment status (protected route)
router.patch('/:id/status', auth, checkPermission('manage_appointments'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    appointment.status = req.body.status;
    const updatedAppointment = await appointment.save();

    // TODO: Send status update email to client

    res.json({
      message: 'Appointment status updated successfully',
      appointment: updatedAppointment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get available time slots for a date
router.get('/available-slots/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const bookedSlots = await Appointment.find({
      appointmentDate: {
        $gte: new Date(date.setHours(0,0,0)),
        $lt: new Date(date.setHours(23,59,59))
      },
      status: { $in: ['pending', 'confirmed'] }
    }).select('preferredTime -_id');

    const allTimeSlots = [
      '09:00 AM', '10:00 AM', '11:00 AM',
      '12:00 PM', '02:00 PM', '03:00 PM',
      '04:00 PM', '05:00 PM'
    ];

    const bookedTimeSlots = bookedSlots.map(slot => slot.preferredTime);
    const availableSlots = allTimeSlots.filter(slot => !bookedTimeSlots.includes(slot));

    res.json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel appointment (public route with confirmation code)
router.post('/cancel/:code', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ 
      confirmationCode: req.params.code,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (!appointment) {
      return res.status(404).json({ 
        message: 'Appointment not found or already cancelled/completed' 
      });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    // TODO: Send cancellation confirmation email

    res.json({ message: 'Appointment cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get appointments statistics (protected route)
router.get('/stats', auth, checkPermission('manage_appointments'), async (req, res) => {
  try {
    const stats = await Appointment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const today = new Date();
    const upcomingAppointments = await Appointment.find({
      appointmentDate: { $gte: today },
      status: { $in: ['pending', 'confirmed'] }
    }).count();

    res.json({
      statusStats: stats,
      upcomingAppointments
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
