const axios = require('axios');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class LegalResearchService {
  constructor() {
    this.providers = {
      INDIAN_KANOON: 'indian_kanoon',
      MANUPATRA: 'manupatra',
      SCCONLINE: 'scconline',
      WESTLAW: 'westlaw'
    };

    this.searchTypes = {
      CASE_LAW: 'case_law',
      STATUTE: 'statute',
      COMMENTARY: 'commentary',
      JOURNAL: 'journal',
      NOTIFICATION: 'notification'
    };

    this.jurisdictions = {
      SUPREME_COURT: 'supreme_court',
      HIGH_COURT: 'high_court',
      DISTRICT_COURT: 'district_court',
      TRIBUNAL: 'tribunal'
    };

    this.initialize();
  }

  // Initialize legal research service
  async initialize() {
    try {
      await this.setupAPIClients();
      await this.loadCitations();
      logger.info('Legal research service initialized');
    } catch (error) {
      logger.error('Legal research service initialization failed:', error);
      throw new ServiceError('Legal research service initialization failed', 'legal_research');
    }
  }

  // Setup API clients
  async setupAPIClients() {
    this.clients = {
      [this.providers.INDIAN_KANOON]: axios.create({
        baseURL: process.env.INDIAN_KANOON_API_URL,
        headers: {
          'Authorization': `Bearer ${process.env.INDIAN_KANOON_API_KEY}`
        }
      }),
      [this.providers.MANUPATRA]: axios.create({
        baseURL: process.env.MANUPATRA_API_URL,
        headers: {
          'API-Key': process.env.MANUPATRA_API_KEY
        }
      }),
      // Add other providers...
    };
  }

  // Search legal documents
  async search(query, options = {}) {
    try {
      const {
        provider = this.providers.INDIAN_KANOON,
        type = this.searchTypes.CASE_LAW,
        jurisdiction,
        startDate,
        endDate,
        page = 1,
        limit = 10
      } = options;

      // Check cache first
      const cacheKey = this.generateCacheKey(query, options);
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      // Perform search based on provider
      const results = await this.searchByProvider(provider, {
        query,
        type,
        jurisdiction,
        startDate,
        endDate,
        page,
        limit
      });

      // Cache results
      await cache.set(cacheKey, results, 3600); // Cache for 1 hour

      // Log search
      await this.logSearch(query, options, results.total);

      return results;
    } catch (error) {
      logger.error('Legal search failed:', error);
      throw error;
    }
  }

  // Search by provider
  async searchByProvider(provider, params) {
    try {
      switch (provider) {
        case this.providers.INDIAN_KANOON:
          return await this.searchIndianKanoon(params);
        case this.providers.MANUPATRA:
          return await this.searchManupatra(params);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`Search failed for provider ${provider}:`, error);
      throw error;
    }
  }

  // Search Indian Kanoon
  async searchIndianKanoon(params) {
    try {
      const response = await this.clients[this.providers.INDIAN_KANOON].get('/search', {
        params: {
          q: params.query,
          type: params.type,
          court: params.jurisdiction,
          from_date: params.startDate,
          to_date: params.endDate,
          page: params.page,
          size: params.limit
        }
      });

      return this.formatSearchResults(response.data, this.providers.INDIAN_KANOON);
    } catch (error) {
      logger.error('Indian Kanoon search failed:', error);
      throw error;
    }
  }

  // Get case details
  async getCaseDetails(caseId, provider) {
    try {
      // Check cache
      const cacheKey = `case:${provider}:${caseId}`;
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const details = await this.getCaseByProvider(caseId, provider);

      // Cache results
      await cache.set(cacheKey, details, 86400); // Cache for 24 hours

      return details;
    } catch (error) {
      logger.error('Failed to get case details:', error);
      throw error;
    }
  }

  // Get statute details
  async getStatuteDetails(statuteId, provider) {
    try {
      // Check cache
      const cacheKey = `statute:${provider}:${statuteId}`;
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const details = await this.getStatuteByProvider(statuteId, provider);

      // Cache results
      await cache.set(cacheKey, details, 86400); // Cache for 24 hours

      return details;
    } catch (error) {
      logger.error('Failed to get statute details:', error);
      throw error;
    }
  }

  // Save research
  async saveResearch(userId, data) {
    try {
      const research = await mongoose.model('Research').create({
        userId,
        ...data,
        savedAt: new Date()
      });

      // Add to user's saved research
      await mongoose.model('User').findByIdAndUpdate(userId, {
        $push: { savedResearch: research._id }
      });

      return research;
    } catch (error) {
      logger.error('Failed to save research:', error);
      throw error;
    }
  }

  // Get citation suggestions
  async getCitationSuggestions(text) {
    try {
      const citations = await this.extractCitations(text);
      const suggestions = [];

      for (const citation of citations) {
        const cases = await this.searchByCitation(citation);
        if (cases.length > 0) {
          suggestions.push({
            citation,
            cases
          });
        }
      }

      return suggestions;
    } catch (error) {
      logger.error('Failed to get citation suggestions:', error);
      throw error;
    }
  }

  // Extract legal principles
  async extractLegalPrinciples(text) {
    try {
      // Use NLP to identify legal principles
      const principles = await this.analyzeLegalText(text);

      return principles.map(principle => ({
        text: principle.text,
        confidence: principle.confidence,
        references: principle.references
      }));
    } catch (error) {
      logger.error('Failed to extract legal principles:', error);
      throw error;
    }
  }

  // Generate case summary
  async generateCaseSummary(caseId, provider) {
    try {
      const caseDetails = await this.getCaseDetails(caseId, provider);
      
      const summary = {
        title: caseDetails.title,
        citation: caseDetails.citation,
        court: caseDetails.court,
        date: caseDetails.date,
        judges: caseDetails.judges,
        keyPoints: await this.extractKeyPoints(caseDetails.content),
        holdings: await this.extractHoldings(caseDetails.content),
        analysis: await this.analyzeCaseContent(caseDetails)
      };

      return summary;
    } catch (error) {
      logger.error('Failed to generate case summary:', error);
      throw error;
    }
  }

  // Compare cases
  async compareCases(caseIds) {
    try {
      const cases = await Promise.all(
        caseIds.map(id => this.getCaseDetails(id.caseId, id.provider))
      );

      return {
        similarities: await this.findSimilarities(cases),
        differences: await this.findDifferences(cases),
        timeline: this.createCaseTimeline(cases),
        principles: await this.compareLegalPrinciples(cases)
      };
    } catch (error) {
      logger.error('Failed to compare cases:', error);
      throw error;
    }
  }

  // Helper: Format search results
  formatSearchResults(data, provider) {
    return {
      total: data.total,
      page: data.page,
      results: data.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        citation: doc.citation,
        court: doc.court,
        date: doc.date,
        snippet: doc.snippet,
        provider
      }))
    };
  }

  // Helper: Generate cache key
  generateCacheKey(query, options) {
    return `search:${options.provider}:${query}:${JSON.stringify(options)}`;
  }

  // Helper: Log search
  async logSearch(query, options, resultCount) {
    try {
      await mongoose.model('SearchLog').create({
        query,
        options,
        resultCount,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to log search:', error);
    }
  }

  // Helper: Extract citations
  async extractCitations(text) {
    // Implementation of citation extraction using regex patterns
    const citations = [];
    // Add citation extraction logic
    return citations;
  }

  // Helper: Analyze legal text
  async analyzeLegalText(text) {
    // Implementation of legal text analysis using NLP
    const principles = [];
    // Add text analysis logic
    return principles;
  }

  // Helper: Extract key points
  async extractKeyPoints(content) {
    // Implementation of key points extraction
    const keyPoints = [];
    // Add extraction logic
    return keyPoints;
  }
}

// Export singleton instance
module.exports = new LegalResearchService();
