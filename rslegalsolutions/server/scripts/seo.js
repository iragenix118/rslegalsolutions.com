const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class SEOService {
  constructor() {
    this.sitemapDir = path.join(__dirname, '../public');
    this.cachePrefix = 'seo:';
    this.cacheDuration = 86400; // 24 hours
    this.baseUrl = process.env.CLIENT_URL || 'https://rslegalsolutions.com';

    this.initialize();
  }

  // Initialize SEO service
  async initialize() {
    try {
      await fs.mkdir(this.sitemapDir, { recursive: true });
      logger.info('SEO service initialized');
    } catch (error) {
      logger.error('SEO service initialization failed:', error);
      throw new ServiceError('SEO service initialization failed', 'seo');
    }
  }

  // Generate sitemap
  async generateSitemap() {
    try {
      const smStream = new SitemapStream({ hostname: this.baseUrl });
      const pipeline = smStream.pipe(createGzip());

      // Add static pages
      this.addStaticPages(smStream);

      // Add dynamic pages
      await Promise.all([
        this.addServicePages(smStream),
        this.addBlogPages(smStream),
        this.addLawyerPages(smStream)
      ]);

      smStream.end();

      const sitemap = await streamToPromise(pipeline);
      const sitemapPath = path.join(this.sitemapDir, 'sitemap.xml.gz');
      await fs.writeFile(sitemapPath, sitemap);

      logger.info('Sitemap generated successfully');
      return sitemapPath;
    } catch (error) {
      logger.error('Failed to generate sitemap:', error);
      throw error;
    }
  }

  // Add static pages to sitemap
  addStaticPages(smStream) {
    const staticPages = [
      { url: '/', changefreq: 'daily', priority: 1.0 },
      { url: '/about', changefreq: 'monthly', priority: 0.8 },
      { url: '/services', changefreq: 'weekly', priority: 0.9 },
      { url: '/contact', changefreq: 'monthly', priority: 0.7 },
      { url: '/blog', changefreq: 'daily', priority: 0.8 },
      { url: '/appointments', changefreq: 'monthly', priority: 0.6 }
    ];

    staticPages.forEach(page => smStream.write(page));
  }

  // Add service pages to sitemap
  async addServicePages(smStream) {
    try {
      const services = await mongoose.model('Service')
        .find({ isActive: true })
        .select('slug updatedAt')
        .lean();

      services.forEach(service => {
        smStream.write({
          url: `/services/${service.slug}`,
          changefreq: 'weekly',
          priority: 0.8,
          lastmod: service.updatedAt
        });
      });
    } catch (error) {
      logger.error('Failed to add service pages to sitemap:', error);
      throw error;
    }
  }

  // Add blog pages to sitemap
  async addBlogPages(smStream) {
    try {
      const blogs = await mongoose.model('Blog')
        .find({ status: 'published' })
        .select('slug publishedAt')
        .lean();

      blogs.forEach(blog => {
        smStream.write({
          url: `/blog/${blog.slug}`,
          changefreq: 'monthly',
          priority: 0.7,
          lastmod: blog.publishedAt
        });
      });
    } catch (error) {
      logger.error('Failed to add blog pages to sitemap:', error);
      throw error;
    }
  }

  // Add lawyer pages to sitemap
  async addLawyerPages(smStream) {
    try {
      const lawyers = await mongoose.model('User')
        .find({ role: 'lawyer', isActive: true })
        .select('slug updatedAt')
        .lean();

      lawyers.forEach(lawyer => {
        smStream.write({
          url: `/lawyers/${lawyer.slug}`,
          changefreq: 'weekly',
          priority: 0.8,
          lastmod: lawyer.updatedAt
        });
      });
    } catch (error) {
      logger.error('Failed to add lawyer pages to sitemap:', error);
      throw error;
    }
  }

  // Generate meta tags for a page
  async generateMetaTags(page, data = {}) {
    try {
      const cacheKey = `${this.cachePrefix}meta:${page}:${JSON.stringify(data)}`;
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const meta = await this.getMetaTagsForPage(page, data);
      await cache.set(cacheKey, meta, this.cacheDuration);
      return meta;
    } catch (error) {
      logger.error('Failed to generate meta tags:', error);
      throw error;
    }
  }

  // Get meta tags for specific page
  async getMetaTagsForPage(page, data) {
    const baseMetaTags = {
      'og:site_name': 'RS Legal Solutions',
      'twitter:card': 'summary_large_image',
      'twitter:site': '@rslegalsolutions'
    };

    let pageMeta = {};

    switch (page) {
      case 'home':
        pageMeta = {
          title: 'RS Legal Solutions - Expert Legal Services in India',
          description: 'Leading law firm providing comprehensive legal services with expertise in corporate, civil, and criminal law. Schedule a consultation today.',
          'og:type': 'website'
        };
        break;

      case 'service':
        pageMeta = await this.getServiceMetaTags(data.slug);
        break;

      case 'blog':
        pageMeta = await this.getBlogMetaTags(data.slug);
        break;

      case 'lawyer':
        pageMeta = await this.getLawyerMetaTags(data.slug);
        break;

      // Add more page types as needed
    }

    return {
      ...baseMetaTags,
      ...pageMeta,
      canonical: this.getCanonicalUrl(page, data)
    };
  }

  // Get meta tags for service page
  async getServiceMetaTags(slug) {
    const service = await mongoose.model('Service')
      .findOne({ slug })
      .select('title description category')
      .lean();

    if (!service) return {};

    return {
      title: `${service.title} - RS Legal Solutions`,
      description: service.description,
      'og:title': service.title,
      'og:description': service.description,
      'og:type': 'service',
      keywords: `legal services, ${service.category}, ${service.title}, law firm india`
    };
  }

  // Get meta tags for blog page
  async getBlogMetaTags(slug) {
    const blog = await mongoose.model('Blog')
      .findOne({ slug, status: 'published' })
      .select('title excerpt author publishedAt')
      .populate('author', 'name')
      .lean();

    if (!blog) return {};

    return {
      title: `${blog.title} - RS Legal Solutions Blog`,
      description: blog.excerpt,
      'og:title': blog.title,
      'og:description': blog.excerpt,
      'og:type': 'article',
      'article:published_time': blog.publishedAt,
      'article:author': blog.author.name
    };
  }

  // Get canonical URL
  getCanonicalUrl(page, data = {}) {
    switch (page) {
      case 'home':
        return this.baseUrl;
      case 'service':
        return `${this.baseUrl}/services/${data.slug}`;
      case 'blog':
        return `${this.baseUrl}/blog/${data.slug}`;
      case 'lawyer':
        return `${this.baseUrl}/lawyers/${data.slug}`;
      default:
        return `${this.baseUrl}/${page}`;
    }
  }

  // Generate structured data
  async generateStructuredData(type, data) {
    try {
      switch (type) {
        case 'organization':
          return this.generateOrganizationSchema();
        case 'service':
          return this.generateServiceSchema(data);
        case 'article':
          return this.generateArticleSchema(data);
        case 'person':
          return this.generatePersonSchema(data);
        default:
          throw new Error(`Unknown schema type: ${type}`);
      }
    } catch (error) {
      logger.error('Failed to generate structured data:', error);
      throw error;
    }
  }

  // Generate organization schema
  generateOrganizationSchema() {
    return {
      '@context': 'https://schema.org',
      '@type': 'LegalService',
      name: 'RS Legal Solutions',
      description: 'Expert legal services in India',
      url: this.baseUrl,
      logo: `${this.baseUrl}/logo.png`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Legal Street',
        addressLocality: 'New Delhi',
        addressRegion: 'Delhi',
        postalCode: '110001',
        addressCountry: 'IN'
      },
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: process.env.CONTACT_PHONE,
        contactType: 'customer service'
      }
    };
  }

  // Generate service schema
  generateServiceSchema(service) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.title,
      description: service.description,
      provider: {
        '@type': 'LegalService',
        name: 'RS Legal Solutions'
      },
      areaServed: {
        '@type': 'Country',
        name: 'India'
      },
      category: service.category
    };
  }

  // Generate robots.txt content
  generateRobotsTxt() {
    return `
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /private/

Sitemap: ${this.baseUrl}/sitemap.xml
    `.trim();
  }

  // Update robots.txt file
  async updateRobotsTxt() {
    try {
      const content = this.generateRobotsTxt();
      const robotsPath = path.join(this.sitemapDir, 'robots.txt');
      await fs.writeFile(robotsPath, content);
      logger.info('robots.txt updated successfully');
    } catch (error) {
      logger.error('Failed to update robots.txt:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new SEOService();
