const mongoose = require('mongoose');
const logger = require('./logger');
const { DatabaseError } = require('./errors');
require('dotenv').config();

class Database {
  constructor() {
    this.uri = process.env.MONGODB_URI;
    this.options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: process.env.NODE_ENV !== 'production',
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    };

    // Bind event handlers
    this.handleConnection = this.handleConnection.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);

    // Initialize monitoring
    this.initializeMonitoring();
  }

  // Connect to database
  async connect() {
    try {
      if (!this.uri) {
        throw new DatabaseError('MongoDB URI is not defined');
      }

      // Set up event listeners
      mongoose.connection.on('connected', this.handleConnection);
      mongoose.connection.on('error', this.handleError);
      mongoose.connection.on('disconnected', this.handleDisconnect);

      // Handle process termination
      process.on('SIGINT', this.cleanup.bind(this));
      process.on('SIGTERM', this.cleanup.bind(this));

      // Connect to MongoDB
      await mongoose.connect(this.uri, this.options);

      return mongoose.connection;
    } catch (error) {
      logger.error('Database connection error:', error);
      throw new DatabaseError('Failed to connect to database');
    }
  }

  // Handle successful connection
  handleConnection() {
    logger.info('Connected to MongoDB');
    this.startHealthCheck();
  }

  // Handle connection errors
  handleError(error) {
    logger.error('MongoDB connection error:', error);
    this.monitorConnectionStatus();
  }

  // Handle disconnection
  handleDisconnect() {
    logger.warn('MongoDB disconnected');
    this.monitorConnectionStatus();
  }

  // Monitor connection status
  monitorConnectionStatus() {
    if (mongoose.connection.readyState === 0) { // disconnected
      logger.info('Attempting to reconnect to MongoDB...');
      setTimeout(() => {
        this.connect().catch(error => {
          logger.error('Reconnection failed:', error);
        });
      }, 5000); // Wait 5 seconds before reconnecting
    }
  }

  // Initialize database monitoring
  initializeMonitoring() {
    this.healthCheckInterval = null;
    this.metricsInterval = null;
  }

  // Start health check
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await mongoose.connection.db.admin().ping();
        logger.debug('Database health check: OK');
      } catch (error) {
        logger.error('Database health check failed:', error);
        this.monitorConnectionStatus();
      }
    }, 30000); // Check every 30 seconds
  }

  // Collect database metrics
  async collectMetrics() {
    try {
      const stats = await mongoose.connection.db.stats();
      const serverStatus = await mongoose.connection.db.admin().serverStatus();

      const metrics = {
        collections: stats.collections,
        documents: stats.objects,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        connections: {
          current: serverStatus.connections.current,
          available: serverStatus.connections.available,
          totalCreated: serverStatus.connections.totalCreated
        },
        operations: {
          insert: serverStatus.opcounters.insert,
          query: serverStatus.opcounters.query,
          update: serverStatus.opcounters.update,
          delete: serverStatus.opcounters.delete
        },
        network: {
          bytesIn: serverStatus.network.bytesIn,
          bytesOut: serverStatus.network.bytesOut,
          numRequests: serverStatus.network.numRequests
        },
        memory: {
          resident: serverStatus.mem.resident,
          virtual: serverStatus.mem.virtual,
          mapped: serverStatus.mem.mapped
        }
      };

      logger.info('Database metrics:', metrics);
      return metrics;
    } catch (error) {
      logger.error('Failed to collect database metrics:', error);
      throw error;
    }
  }

  // Start metrics collection
  startMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error('Metrics collection failed:', error);
      });
    }, 300000); // Collect metrics every 5 minutes
  }

  // Create indexes
  async createIndexes() {
    try {
      const models = mongoose.modelNames();
      for (const modelName of models) {
        const model = mongoose.model(modelName);
        await model.createIndexes();
        logger.info(`Created indexes for ${modelName}`);
      }
    } catch (error) {
      logger.error('Failed to create indexes:', error);
      throw error;
    }
  }

  // Validate collections
  async validateCollections() {
    try {
      const collections = await mongoose.connection.db.collections();
      const results = [];

      for (const collection of collections) {
        const validation = await collection.validate();
        results.push({
          collection: collection.collectionName,
          isValid: validation.valid,
          errors: validation.errors
        });

        if (!validation.valid) {
          logger.warn(`Collection validation failed: ${collection.collectionName}`, validation.errors);
        }
      }

      return results;
    } catch (error) {
      logger.error('Collection validation failed:', error);
      throw error;
    }
  }

  // Clean up old data
  async cleanupOldData() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Clean up old logs
      if (mongoose.models.Log) {
        await mongoose.models.Log.deleteMany({
          createdAt: { $lt: thirtyDaysAgo }
        });
      }

      // Clean up expired sessions
      if (mongoose.models.Session) {
        await mongoose.models.Session.deleteMany({
          expires: { $lt: new Date() }
        });
      }

      logger.info('Old data cleanup completed');
    } catch (error) {
      logger.error('Data cleanup failed:', error);
      throw error;
    }
  }

  // Cleanup resources
  async cleanup() {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info('Database connection closed');
      }
    } catch (error) {
      logger.error('Error during cleanup:', error);
      process.exit(1);
    }
  }

  // Get connection status
  getStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }
}

// Export singleton instance
module.exports = new Database();
