const { Client } = require('@elastic/elasticsearch');
const logger = require('./logger');
const { ServiceError } = require('./errors');
require('dotenv').config();

class SearchService {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      },
      maxRetries: 3,
      requestTimeout: 10000
    });

    this.indices = {
      services: 'services',
      blogs: 'blogs',
      lawyers: 'lawyers',
      cases: 'cases'
    };

    this.initialize();
  }

  // Initialize Elasticsearch
  async initialize() {
    try {
      await this.checkConnection();
      await this.createIndices();
      logger.info('Elasticsearch initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch:', error);
      throw new ServiceError('Search service initialization failed', 'elasticsearch');
    }
  }

  // Check connection
  async checkConnection() {
    try {
      const health = await this.client.cluster.health();
      logger.info('Elasticsearch cluster health:', health);
      return health;
    } catch (error) {
      logger.error('Elasticsearch connection failed:', error);
      throw new ServiceError('Search service unavailable', 'elasticsearch');
    }
  }

  // Create necessary indices
  async createIndices() {
    const indices = Object.values(this.indices);
    for (const index of indices) {
      try {
        const exists = await this.client.indices.exists({ index });
        if (!exists) {
          await this.createIndex(index);
          logger.info(`Created index: ${index}`);
        }
      } catch (error) {
        logger.error(`Failed to create index ${index}:`, error);
        throw error;
      }
    }
  }

  // Create individual index with mapping
  async createIndex(index) {
    const mappings = {
      [this.indices.services]: {
        properties: {
          title: { type: 'text', analyzer: 'english' },
          description: { type: 'text', analyzer: 'english' },
          category: { type: 'keyword' },
          tags: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' }
        }
      },
      [this.indices.blogs]: {
        properties: {
          title: { type: 'text', analyzer: 'english' },
          content: { type: 'text', analyzer: 'english' },
          category: { type: 'keyword' },
          tags: { type: 'keyword' },
          author: { type: 'keyword' },
          publishedAt: { type: 'date' }
        }
      },
      [this.indices.lawyers]: {
        properties: {
          name: { type: 'text' },
          specialization: { type: 'keyword' },
          experience: { type: 'integer' },
          qualifications: { type: 'keyword' },
          bio: { type: 'text', analyzer: 'english' }
        }
      },
      [this.indices.cases]: {
        properties: {
          title: { type: 'text', analyzer: 'english' },
          description: { type: 'text', analyzer: 'english' },
          category: { type: 'keyword' },
          status: { type: 'keyword' },
          clientName: { type: 'text' },
          assignedLawyer: { type: 'keyword' },
          startDate: { type: 'date' }
        }
      }
    };

    await this.client.indices.create({
      index,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              legal_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'stop', 'snowball']
              }
            }
          }
        },
        mappings: mappings[index]
      }
    });
  }

  // Index a document
  async indexDocument(index, document) {
    try {
      const result = await this.client.index({
        index,
        id: document._id?.toString(),
        body: document
      });
      logger.debug(`Indexed document in ${index}:`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to index document in ${index}:`, error);
      throw error;
    }
  }

  // Bulk index documents
  async bulkIndex(index, documents) {
    try {
      const operations = documents.flatMap(doc => [
        { index: { _index: index, _id: doc._id?.toString() } },
        doc
      ]);

      const result = await this.client.bulk({ body: operations });
      logger.debug(`Bulk indexed documents in ${index}:`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to bulk index documents in ${index}:`, error);
      throw error;
    }
  }

  // Search documents
  async search(index, query, options = {}) {
    try {
      const {
        from = 0,
        size = 10,
        sort = [],
        filters = {},
        highlight = true
      } = options;

      const searchBody = {
        from,
        size,
        sort,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'description', 'content'],
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: Object.entries(filters).map(([field, value]) => ({
              term: { [field]: value }
            }))
          }
        }
      };

      if (highlight) {
        searchBody.highlight = {
          fields: {
            title: {},
            description: {},
            content: {}
          }
        };
      }

      const result = await this.client.search({
        index,
        body: searchBody
      });

      return this.formatSearchResults(result);
    } catch (error) {
      logger.error(`Search failed in ${index}:`, error);
      throw error;
    }
  }

  // Format search results
  formatSearchResults(result) {
    const hits = result.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      highlights: hit.highlight
    }));

    return {
      total: result.hits.total.value,
      hits,
      aggregations: result.aggregations
    };
  }

  // Update document
  async updateDocument(index, id, document) {
    try {
      const result = await this.client.update({
        index,
        id,
        body: { doc: document }
      });
      logger.debug(`Updated document in ${index}:`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to update document in ${index}:`, error);
      throw error;
    }
  }

  // Delete document
  async deleteDocument(index, id) {
    try {
      const result = await this.client.delete({
        index,
        id
      });
      logger.debug(`Deleted document from ${index}:`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to delete document from ${index}:`, error);
      throw error;
    }
  }

  // Sync data from MongoDB
  async syncFromMongoDB(model, index) {
    try {
      const documents = await model.find().lean();
      await this.bulkIndex(index, documents);
      logger.info(`Synced ${documents.length} documents to ${index}`);
    } catch (error) {
      logger.error(`Failed to sync data to ${index}:`, error);
      throw error;
    }
  }

  // Get suggestions
  async getSuggestions(index, prefix, field = 'title', size = 5) {
    try {
      const result = await this.client.search({
        index,
        body: {
          size,
          query: {
            prefix: { [field]: prefix }
          }
        }
      });

      return result.hits.hits.map(hit => hit._source[field]);
    } catch (error) {
      logger.error(`Failed to get suggestions from ${index}:`, error);
      throw error;
    }
  }

  // Close connection
  async close() {
    try {
      await this.client.close();
      logger.info('Elasticsearch connection closed');
    } catch (error) {
      logger.error('Failed to close Elasticsearch connection:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new SearchService();
