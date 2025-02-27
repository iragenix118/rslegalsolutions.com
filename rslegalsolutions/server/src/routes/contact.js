const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { auth, checkPermission } = require('../middleware/auth');

// Submit contact form (public route)
router.post('/', async (req, res) => {
  try {
    const contact = new Contact({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      subject: req.body.subject,
      message: req.body.message,
      serviceInterest: req.body.serviceInterest,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        referrer: req.headers.referer
      }
    });

    const savedContact = await contact.save();

    // TODO: Send acknowledgment email to user
    // TODO: Send notification email to admin

    res.status(201).json({
      message: 'Thank you for contacting us. We will get back to you shortly.',
      contact: savedContact
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all contacts (protected route)
router.get('/', auth, checkPermission('view_contacts'), async (req, res) => {
  try {
    const filters = {};
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Apply status filter
    if (req.query.status) {
      filters.status = req.query.status;
    }

    // Apply priority filter
    if (req.query.priority) {
      filters.priority = req.query.priority;
    }

    // Apply date range filter
    if (req.query.startDate && req.query.endDate) {
      filters.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const contacts = await Contact.find(filters)
      .populate('serviceInterest', 'title category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Contact.countDocuments(filters);

    res.json({
      contacts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get contact by ID (protected route)
router.get('/:id', auth, checkPermission('view_contacts'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('serviceInterest', 'title category');

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update contact status and add response (protected route)
router.patch('/:id/respond', auth, checkPermission('respond_contacts'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    contact.status = req.body.status || 'responded';
    contact.response = {
      content: req.body.response,
      respondedAt: new Date(),
      respondedBy: req.user.name
    };
    contact.assignedTo = req.user.name;

    const updatedContact = await contact.save();

    // TODO: Send response email to contact

    res.json({
      message: 'Response sent successfully',
      contact: updatedContact
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update contact priority (protected route)
router.patch('/:id/priority', auth, checkPermission('respond_contacts'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    contact.priority = req.body.priority;
    const updatedContact = await contact.save();

    res.json({
      message: 'Priority updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Assign contact to staff (protected route)
router.patch('/:id/assign', auth, checkPermission('respond_contacts'), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    contact.assignedTo = req.body.assignedTo;
    contact.status = 'in-progress';
    
    const updatedContact = await contact.save();

    res.json({
      message: 'Contact assigned successfully',
      contact: updatedContact
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get contact statistics (protected route)
router.get('/stats/overview', auth, checkPermission('view_contacts'), async (req, res) => {
  try {
    const stats = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await Contact.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const newToday = await Contact.countDocuments({
      createdAt: { $gte: today }
    });

    res.json({
      statusStats: stats,
      priorityStats,
      newToday
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
