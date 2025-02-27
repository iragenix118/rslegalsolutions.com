const os = require('os');
const { performance } = require('perf_hooks');
const mongoose = require('mongoose');
const logger = require('./logger');
const cache = require('./cache');
const monitor = require('./monitor');
const { ServiceError } = require('./errors');
require('dotenv').config();

class PerformanceService {
  constructor() {
    this.metrics = {
      CPU_USAGE: 'cpu_usage',
      MEMORY_USAGE: 'memory_usage',
      RESPONSE_TIME: 'response_time',
      DATABASE_QUERIES: 'database_queries',
      CACHE_HITS: 'cache_hits',
      API_LATENCY: 'api_latency',
      ERROR_RATE: 'error_rate'
    };

    this.thresholds = {
      CPU_WARNING: 70, // 70% CPU usage
      CPU_CRITICAL: 90, // 90% CPU usage
      MEMORY_WARNING: 80, // 80% memory usage
      MEMORY_CRITICAL: 95, // 95% memory usage
      RESPONSE_TIME_WARNING: 1000, // 1 second
      RESPONSE_TIME_CRITICAL: 3000, // 3 seconds
      ERROR_RATE_WARNING: 5, // 5% error rate
      ERROR_RATE_CRITICAL: 10 // 10% error rate
    };

    this.initialize();
  }

  // Initialize performance service
  async initialize() {
    try {
      await this.setupMetricsCollection();
      await this.startPerformanceMonitoring();
      logger.info('Performance service initialized');
    } catch (error) {
      logger.error('Performance service initialization failed:', error);
      throw new ServiceError('Performance service initialization failed', 'performance');
    }
  }

  // Start performance monitoring
  async startPerformanceMonitoring() {
    this.monitorSystemResources();
    this.monitorDatabasePerformance();
    this.monitorCachePerformance();
    this.monitorAPIPerformance();
  }

  // Monitor system resources
  monitorSystemResources() {
    setInterval(async () => {
      try {
        const metrics = {
          cpu: await this.getCPUUsage(),
          memory: this.getMemoryUsage(),
          uptime: os.uptime(),
          loadAverage: os.loadavg()
        };

        await this.saveMetrics('system', metrics);
        await this.checkResourceThresholds(metrics);
      } catch (error) {
        logger.error('Failed to monitor system resources:', error);
      }
    }, 60000); // Every minute
  }

  // Monitor database performance
  monitorDatabasePerformance() {
    mongoose.connection.on('query', async (query) => {
      const startTime = performance.now();
      
      query.then(() => {
        const duration = performance.now() - startTime;
        this.trackQueryPerformance(query, duration);
      }).catch(error => {
        logger.error('Database query error:', error);
      });
    });
  }

  // Monitor cache performance
  monitorCachePerformance() {
    const originalGet = cache.get;
    const originalSet = cache.set;

    cache.get = async function(...args) {
      const startTime = performance.now();
      try {
        const result = await originalGet.apply(this, args);
        const duration = performance.now() - startTime;
        await this.trackCacheOperation('get', result !== null, duration);
        return result;
      } catch (error) {
        logger.error('Cache get error:', error);
        throw error;
      }
    }.bind(this);

    cache.set = async function(...args) {
      const startTime = performance.now();
      try {
        const result = await originalSet.apply(this, args);
        const duration = performance.now() - startTime;
        await this.trackCacheOperation('set', true, duration);
        return result;
      } catch (error) {
        logger.error('Cache set error:', error);
        throw error;
      }
    }.bind(this);
  }

  // Monitor API performance
  monitorAPIPerformance() {
    return async (req, res, next) => {
      const startTime = performance.now();
      const originalEnd = res.end;

      res.end = function(...args) {
        const duration = performance.now() - startTime;
        this.trackAPIRequest(req, res, duration);
        originalEnd.apply(res, args);
      }.bind(this);

      next();
    };
  }

  // Get CPU usage
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const userCPUUsage = (endUsage.user / 1000000); // Convert to seconds
        const systemCPUUsage = (endUsage.system / 1000000);
        
        resolve({
          user: userCPUUsage,
          system: systemCPUUsage,
          total: userCPUUsage + systemCPUUsage
        });
      }, 100);
    });
  }

  // Get memory usage
  getMemoryUsage() {
    const used = process.memoryUsage();
    return {
      heapTotal: used.heapTotal,
      heapUsed: used.heapUsed,
      external: used.external,
      rss: used.rss,
      percentage: (used.heapUsed / used.heapTotal) * 100
    };
  }

  // Track query performance
  async trackQueryPerformance(query, duration) {
    try {
      await mongoose.model('QueryMetric').create({
        operation: query.op,
        collection: query.model?.collection?.name,
        query: JSON.stringify(query.getQuery()),
        duration,
        timestamp: new Date()
      });

      // Check for slow queries
      if (duration > this.thresholds.RESPONSE_TIME_WARNING) {
        await this.handleSlowQuery(query, duration);
      }
    } catch (error) {
      logger.error('Failed to track query performance:', error);
    }
  }

  // Track cache operation
  async trackCacheOperation(operation, hit, duration) {
    try {
      await mongoose.model('CacheMetric').create({
        operation,
        hit,
        duration,
        timestamp: new Date()
      });

      await this.updateCacheStats(operation, hit);
    } catch (error) {
      logger.error('Failed to track cache operation:', error);
    }
  }

  // Track API request
  async trackAPIRequest(req, res, duration) {
    try {
      await mongoose.model('APIMetric').create({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date()
      });

      // Check for slow responses
      if (duration > this.thresholds.RESPONSE_TIME_WARNING) {
        await this.handleSlowResponse(req, duration);
      }
    } catch (error) {
      logger.error('Failed to track API request:', error);
    }
  }

  // Generate performance report
  async generatePerformanceReport(startDate, endDate) {
    try {
      const [
        systemMetrics,
        queryMetrics,
        cacheMetrics,
        apiMetrics
      ] = await Promise.all([
        this.getSystemMetrics(startDate, endDate),
        this.getQueryMetrics(startDate, endDate),
        this.getCacheMetrics(startDate, endDate),
        this.getAPIMetrics(startDate, endDate)
      ]);

      const report = {
        period: { startDate, endDate },
        system: {
          averageCPU: this.calculateAverage(systemMetrics, 'cpu.total'),
          averageMemory: this.calculateAverage(systemMetrics, 'memory.percentage'),
          peakCPU: this.findPeak(systemMetrics, 'cpu.total'),
          peakMemory: this.findPeak(systemMetrics, 'memory.percentage')
        },
        database: {
          averageQueryTime: this.calculateAverage(queryMetrics, 'duration'),
          slowestQueries: this.findSlowestQueries(queryMetrics),
          queriesPerMinute: this.calculateRate(queryMetrics)
        },
        cache: {
          hitRate: this.calculateCacheHitRate(cacheMetrics),
          averageLatency: this.calculateAverage(cacheMetrics, 'duration'),
          mostCachedKeys: await this.getMostCachedKeys()
        },
        api: {
          averageResponseTime: this.calculateAverage(apiMetrics, 'duration'),
          errorRate: this.calculateErrorRate(apiMetrics),
          mostUsedEndpoints: this.getMostUsedEndpoints(apiMetrics)
        },
        recommendations: await this.generateOptimizationRecommendations()
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      throw error;
    }
  }

  // Optimize database indexes
  async optimizeDatabaseIndexes() {
    try {
      const collections = await mongoose.connection.db.collections();
      
      for (const collection of collections) {
        // Analyze index usage
        const indexStats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();

        // Find unused indexes
        const unusedIndexes = indexStats.filter(stat => stat.accesses.ops === 0);
        
        // Drop unused indexes (except _id)
        for (const index of unusedIndexes) {
          if (index.name !== '_id_') {
            await collection.dropIndex(index.name);
            logger.info(`Dropped unused index ${index.name} from ${collection.collectionName}`);
          }
        }

        // Suggest new indexes based on query patterns
        const suggestedIndexes = await this.analyzeSuggestedIndexes(collection);
        
        // Create suggested indexes
        for (const index of suggestedIndexes) {
          await collection.createIndex(index.fields, index.options);
          logger.info(`Created suggested index on ${collection.collectionName}:`, index.fields);
        }
      }
    } catch (error) {
      logger.error('Failed to optimize database indexes:', error);
      throw error;
    }
  }

  // Generate optimization recommendations
  async generateOptimizationRecommendations() {
    try {
      const recommendations = [];

      // Check system resources
      const systemMetrics = await this.getRecentSystemMetrics();
      if (systemMetrics.cpu.total > this.thresholds.CPU_WARNING) {
        recommendations.push({
          type: 'system',
          severity: 'high',
          message: 'High CPU usage detected',
          action: 'Consider scaling up CPU resources'
        });
      }

      // Check database performance
      const slowQueries = await this.getSlowQueries();
      if (slowQueries.length > 0) {
        recommendations.push({
          type: 'database',
          severity: 'medium',
          message: 'Slow queries detected',
          action: 'Review and optimize database queries',
          details: slowQueries
        });
      }

      // Check cache performance
      const cacheStats = await this.getCacheStats();
      if (cacheStats.hitRate < 0.8) { // Less than 80% hit rate
        recommendations.push({
          type: 'cache',
          severity: 'medium',
          message: 'Low cache hit rate',
          action: 'Review cache strategy and TTL settings'
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to generate optimization recommendations:', error);
      throw error;
    }
  }

  // Helper: Calculate average
  calculateAverage(metrics, field) {
    if (!metrics.length) return 0;
    const sum = metrics.reduce((acc, metric) => {
      return acc + this.getNestedValue(metric, field);
    }, 0);
    return sum / metrics.length;
  }

  // Helper: Find peak value
  findPeak(metrics, field) {
    if (!metrics.length) return 0;
    return Math.max(...metrics.map(metric => this.getNestedValue(metric, field)));
  }

  // Helper: Get nested object value
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current[key], obj);
  }

  // Helper: Calculate rate
  calculateRate(metrics) {
    if (!metrics.length) return 0;
    const timeSpan = (metrics[metrics.length - 1].timestamp - metrics[0].timestamp) / 60000; // minutes
    return metrics.length / timeSpan;
  }
}

// Export singleton instance
module.exports = new PerformanceService();
