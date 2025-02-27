const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const search = require('./search');
const fileManager = require('./fileManager');
const { ServiceError } = require('./errors');
require('dotenv').config();

class KnowledgeBaseService {
  constructor() {
    this.articleTypes = {
      LEGAL_UPDATE: 'legal_update',
      CASE_SUMMARY: 'case_summary',
      PROCEDURE: 'procedure',
      GUIDELINE: 'guideline',
      TEMPLATE: 'template',
      FAQ: 'faq'
    };

    this.categories = {
      CIVIL_LAW: 'civil_law',
      CRIMINAL_LAW: 'criminal_law',
      CORPORATE_LAW: 'corporate_law',
      FAMILY_LAW: 'family_law',
      PROPERTY_LAW: 'property_law',
      INTELLECTUAL_PROPERTY: 'intellectual_property',
      TAXATION: 'taxation'
    };

    this.initialize();
  }

  // Initialize knowledge base service
  async initialize() {
    try {
      await this.setupSearchIndexes();
      await this.loadTaxonomies();
      logger.info('Knowledge base service initialized');
    } catch (error) {
      logger.error('Knowledge base service initialization failed:', error);
      throw new ServiceError('Knowledge base service initialization failed', 'knowledge');
    }
  }

  // Create new article
  async createArticle(data) {
    try {
      const article = await mongoose.model('KnowledgeArticle').create({
        ...data,
        status: 'draft',
        version: 1,
        timeline: [{
          action: 'Article Created',
          description: 'New article created',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Index article for search
      await this.indexArticle(article);

      // Generate related articles
      await this.generateRelatedArticles(article);

      return article;
    } catch (error) {
      logger.error('Failed to create article:', error);
      throw error;
    }
  }

  // Update article
  async updateArticle(articleId, updates, userId) {
    try {
      const article = await mongoose.model('KnowledgeArticle').findById(articleId);
      if (!article) {
        throw new Error('Article not found');
      }

      // Track changes
      const changes = this.trackChanges(article, updates);

      // Create new version if content changed
      if (updates.content && updates.content !== article.content) {
        await this.createArticleVersion(article);
        article.version += 1;
      }

      // Update article
      Object.assign(article, updates);

      // Add timeline entry
      if (changes.length > 0) {
        article.timeline.push({
          action: 'Article Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      await article.save();

      // Update search index
      await this.updateArticleIndex(article);

      // Update related articles
      await this.updateRelatedArticles(article);

      return article;
    } catch (error) {
      logger.error('Failed to update article:', error);
      throw error;
    }
  }

  // Search knowledge base
  async searchKnowledgeBase(query, options = {}) {
    try {
      const {
        type,
        category,
        tags,
        page = 1,
        limit = 10,
        sortBy = 'relevance'
      } = options;

      const searchQuery = {
        bool: {
          must: [
            { multi_match: {
              query,
              fields: ['title^3', 'content^2', 'tags'],
              fuzziness: 'AUTO'
            }}
          ]
        }
      };

      // Add filters
      if (type) {
        searchQuery.bool.filter = [{ term: { type } }];
      }
      if (category) {
        searchQuery.bool.filter = [...(searchQuery.bool.filter || []), { term: { category } }];
      }
      if (tags) {
        searchQuery.bool.filter = [...(searchQuery.bool.filter || []), { terms: { tags } }];
      }

      const results = await search.search('knowledge_articles', searchQuery, {
        from: (page - 1) * limit,
        size: limit,
        sort: this.getSortOptions(sortBy)
      });

      return {
        articles: results.hits,
        total: results.total,
        page,
        pages: Math.ceil(results.total / limit)
      };
    } catch (error) {
      logger.error('Failed to search knowledge base:', error);
      throw error;
    }
  }

  // Get article recommendations
  async getRecommendations(userId, options = {}) {
    try {
      const user = await mongoose.model('User').findById(userId)
        .populate('recentSearches')
        .populate('viewedArticles');

      // Get user's interests and behavior
      const userProfile = await this.getUserProfile(user);

      // Get recommendations based on user profile
      const recommendations = await this.generateRecommendations(userProfile);

      return recommendations;
    } catch (error) {
      logger.error('Failed to get recommendations:', error);
      throw error;
    }
  }

  // Add article comment
  async addComment(articleId, comment) {
    try {
      const article = await mongoose.model('KnowledgeArticle').findById(articleId);
      if (!article) {
        throw new Error('Article not found');
      }

      article.comments.push({
        ...comment,
        timestamp: new Date()
      });

      article.timeline.push({
        action: 'Comment Added',
        description: `Comment added by ${comment.author}`,
        performedBy: comment.author,
        timestamp: new Date()
      });

      await article.save();

      // Notify article author and subscribers
      await this.notifyNewComment(article, comment);

      return article;
    } catch (error) {
      logger.error('Failed to add comment:', error);
      throw error;
    }
  }

  // Generate article citations
  async generateCitations(articleId) {
    try {
      const article = await mongoose.model('KnowledgeArticle')
        .findById(articleId)
        .populate('references');

      const citations = {
        apa: this.formatCitationAPA(article),
        mla: this.formatCitationMLA(article),
        chicago: this.formatCitationChicago(article),
        bluebook: this.formatCitationBluebook(article)
      };

      return citations;
    } catch (error) {
      logger.error('Failed to generate citations:', error);
      throw error;
    }
  }

  // Export article
  async exportArticle(articleId, format = 'pdf') {
    try {
      const article = await mongoose.model('KnowledgeArticle')
        .findById(articleId)
        .populate('author')
        .populate('references');

      switch (format.toLowerCase()) {
        case 'pdf':
          return await this.exportToPDF(article);
        case 'word':
          return await this.exportToWord(article);
        case 'markdown':
          return await this.exportToMarkdown(article);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export article:', error);
      throw error;
    }
  }

  // Generate related articles
  async generateRelatedArticles(article) {
    try {
      const searchQuery = {
        bool: {
          must: [
            { multi_match: {
              query: `${article.title} ${article.tags.join(' ')}`,
              fields: ['title^2', 'content', 'tags']
            }}
          ],
          must_not: [
            { term: { _id: article._id }}
          ]
        }
      };

      const results = await search.search('knowledge_articles', searchQuery, {
        size: 5
      });

      article.relatedArticles = results.hits.map(hit => hit._id);
      await article.save();

      return results.hits;
    } catch (error) {
      logger.error('Failed to generate related articles:', error);
      throw error;
    }
  }

  // Create article version
  async createArticleVersion(article) {
    try {
      await mongoose.model('ArticleVersion').create({
        articleId: article._id,
        version: article.version,
        content: article.content,
        updatedBy: article.updatedBy,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create article version:', error);
      throw error;
    }
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Format citations
  formatCitationAPA(article) {
    const author = article.author.name;
    const year = DateTime.fromJSDate(article.publishedAt).year;
    const title = article.title;
    
    return `${author} (${year}). ${title}. RS Legal Solutions Knowledge Base.`;
  }

  formatCitationMLA(article) {
    const author = article.author.name;
    const title = article.title;
    const date = DateTime.fromJSDate(article.publishedAt).toFormat('d MMM yyyy');
    
    return `${author}. "${title}." RS Legal Solutions Knowledge Base, ${date}.`;
  }

  formatCitationChicago(article) {
    const author = article.author.name;
    const title = article.title;
    const date = DateTime.fromJSDate(article.publishedAt).toFormat('MMMM d, yyyy');
    
    return `${author}, "${title}," RS Legal Solutions Knowledge Base, last modified ${date}.`;
  }

  formatCitationBluebook(article) {
    const author = article.author.name;
    const title = article.title;
    const date = DateTime.fromJSDate(article.publishedAt).toFormat('MMM. d, yyyy');
    
    return `${author}, ${title}, RS Legal Solutions Knowledge Base (${date}).`;
  }

  // Helper: Get sort options
  getSortOptions(sortBy) {
    const sortOptions = {
      relevance: [{ _score: 'desc' }],
      date: [{ publishedAt: 'desc' }],
      views: [{ viewCount: 'desc' }],
      rating: [{ averageRating: 'desc' }]
    };

    return sortOptions[sortBy] || sortOptions.relevance;
  }
}

// Export singleton instance
module.exports = new KnowledgeBaseService();
