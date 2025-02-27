const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxLength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  content: {
    type: String,
    required: [true, 'Content is required']
  },
  category: {
    type: String,
    required: true,
    enum: ['Case Law', 'Legal News', 'Updates', 'Research']
  },
  author: {
    name: {
      type: String,
      required: true
    },
    bio: String,
    avatar: String
  },
  featuredImage: {
    type: String,
    default: 'default-blog-image.jpg'
  },
  tags: [{
    type: String,
    trim: true
  }],
  meta: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    readTime: {
      type: Number,  // in minutes
      default: 5
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  publishedAt: {
    type: Date
  },
  references: [{
    title: String,
    url: String
  }],
  relatedPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog'
  }]
}, {
  timestamps: true
});

// Create URL-friendly slug from title
blogSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  
  // Set publishedAt date when post is published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Indexes for efficient queries
blogSchema.index({ slug: 1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ 'meta.views': -1 });
blogSchema.index({ publishedAt: -1 });

// Virtual for formatted date
blogSchema.virtual('formattedDate').get(function() {
  return this.publishedAt ? this.publishedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : null;
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
