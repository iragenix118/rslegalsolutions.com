const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { auth, checkPermission } = require('../middleware/auth');

// Get all services (public route)
router.get('/', async (req, res) => {
  try {
    const filters = { isActive: true };
    
    // Apply category filter if provided
    if (req.query.category) {
      filters.category = req.query.category;
    }

    const services = await Service.find(filters)
      .sort({ category: 1, title: 1 });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get service by slug (public route)
router.get('/:slug', async (req, res) => {
  try {
    const service = await Service.findOne({ 
      slug: req.params.slug,
      isActive: true 
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new service (protected route)
router.post('/', auth, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = new Service({
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      features: req.body.features,
      icon: req.body.icon
    });

    const savedService = await service.save();
    res.status(201).json(savedService);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update service (protected route)
router.patch('/:id', auth, checkPermission('manage_services'), async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['title', 'description', 'category', 'features', 'icon', 'isActive'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ message: 'Invalid updates' });
  }

  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    updates.forEach(update => service[update] = req.body[update]);
    const updatedService = await service.save();
    
    res.json(updatedService);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete service (protected route)
router.delete('/:id', auth, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Soft delete by setting isActive to false
    service.isActive = false;
    await service.save();
    
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get services by category
router.get('/category/:category', async (req, res) => {
  try {
    const services = await Service.find({
      category: req.params.category,
      isActive: true
    }).sort({ title: 1 });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Service.distinct('category', { isActive: true });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk update services (protected route)
router.patch('/bulk/update', auth, checkPermission('manage_services'), async (req, res) => {
  try {
    const { services } = req.body;
    
    if (!Array.isArray(services)) {
      return res.status(400).json({ message: 'Invalid request format' });
    }

    const updates = await Promise.all(
      services.map(async ({ id, ...updates }) => {
        const service = await Service.findById(id);
        if (!service) return null;

        Object.assign(service, updates);
        return service.save();
      })
    );

    const updatedServices = updates.filter(Boolean);
    res.json(updatedServices);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
