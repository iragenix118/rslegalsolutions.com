const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const { auth, checkPermission } = require('../middleware/auth');

// Get all published blogs (public route)
router.get('/', async (req, res) => {
  try {
    const filters = { status: 'published' };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Apply category filter
    if (req.query.category) {
      filters.category = req.query.category;
    }

    // Apply tag filter
    if (req.query.tag) {
      filters.tags = req.query.tag;
    }

    const blogs = await Blog.find(filters)
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    const total = await Blog.countDocuments(filters);

    res.json({
      blogs,
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

// Get blog by slug (public route)
router.get('/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOne({ 
      slug: req.params.slug,
      status: 'published'
    }).populate('relatedPosts', 'title slug category publishedAt');

    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Increment view count
    blog.meta.views += 1;
    await blog.save();

    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new blog post (protected route)
router.post('/', auth, checkPermission('manage_blogs'), async (req, res) => {
  try {
    const blog = new Blog({
      title: req.body.title,
      content: req.body.content,
      category: req.body.category,
      author: {
        name: req.user.name,
        bio: req.body.authorBio,
        avatar: req.user.avatar
      },
      tags: req.body.tags,
      featuredImage: req.body.featuredImage,
      status: req.body.status || 'draft',
      references: req.body.references,
      relatedPosts: req.body.relatedPosts
    });

    const savedBlog = await blog.save();
    res.status(201).json(savedBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update blog post (protected route)
router.patch('/:id', auth, checkPermission('manage_blogs'), async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = [
    'title', 'content', 'category', 'tags', 'featuredImage',
    'status', 'references', 'relatedPosts'
  ];
  
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ message: 'Invalid updates' });
  }

  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    updates.forEach(update => blog[update] = req.body[update]);
    const updatedBlog = await blog.save();
    
    res.json(updatedBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete blog post (protected route)
router.delete('/:id', auth, checkPermission('manage_blogs'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Archive instead of delete
    blog.status = 'archived';
    await blog.save();
    
    res.json({ message: 'Blog post archived successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get blogs by category
router.get('/category/:category', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const blogs = await Blog.find({
      category: req.params.category,
      status: 'published'
    })
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    const total = await Blog.countDocuments({
      category: req.params.category,
      status: 'published'
    });

    res.json({
      blogs,
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

// Get blogs by tag
router.get('/tag/:tag', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const blogs = await Blog.find({
      tags: req.params.tag,
      status: 'published'
    })
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    const total = await Blog.countDocuments({
      tags: req.params.tag,
      status: 'published'
    });

    res.json({
      blogs,
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

// Like blog post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    blog.meta.likes += 1;
    await blog.save();

    res.json({ likes: blog.meta.likes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get blog statistics (protected route)
router.get('/stats/overview', auth, checkPermission('manage_blogs'), async (req, res) => {
  try {
    const stats = await Blog.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$meta.views' },
          totalLikes: { $sum: '$meta.likes' }
        }
      }
    ]);

    const topPosts = await Blog.find({ status: 'published' })
      .sort({ 'meta.views': -1 })
      .limit(5)
      .select('title slug meta.views meta.likes publishedAt');

    res.json({
      stats,
      topPosts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
