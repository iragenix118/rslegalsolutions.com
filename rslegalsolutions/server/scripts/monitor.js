const os = require('os');
const promClient = require('prom-client');
const logger = require('./logger');
const database = require('./database');
const cache = require('./cache');
require('dotenv').config();

class Monitor {
  constructor() {
    this.register = new promClient.Registry();
    this.collectInterval = parseInt(process.env.METRICS_INTERVAL) || 15000; // 15 seconds
    this.metricsEnabled = process.env.ENABLE_METRICS === 'true';

    this.initializeMetrics();
    if (this.metricsEnabled) {
      this.startCollection();
    }
  }

  // Initialize Prometheus metrics
  initializeMetrics() {
    // System metrics
    this.cpuUsage = new promClient.Gauge({
      name: 'system_cpu_usage',
      help: 'System CPU usage'
    });

    this.memoryUsage = new promClient.Gauge({
      name: 'system_memory_usage_bytes',
      help: 'System memory usage in bytes'
    });

    this.processMemory = new promClient.Gauge({
      name: 'process_memory_usage_bytes',
      help: 'Process memory usage in bytes',
      labelNames: ['type']
    });

    // HTTP metrics
    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status']
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });

    // Database metrics
    this.dbConnectionsActive = new promClient.Gauge({
      name: 'mongodb_connections_active',
      help: 'Number of active MongoDB connections'
    });

    this.dbOperationsTotal = new promClient.Counter({
      name: 'mongodb_operations_total',
      help: 'Total number of MongoDB operations',
      labelNames: ['type']
    });

    // Cache metrics
    this.cacheHits = new promClient.Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits'
    });

    this.cacheMisses = new promClient.Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses'
    });

    // Business metrics
    this.activeUsers = new promClient.Gauge({
      name: 'active_users',
      help: 'Number of active users'
    });

    this.appointmentsTotal = new promClient.Counter({
      name: 'appointments_total',
      help: 'Total number of appointments',
      labelNames: ['status']
    });

    // Register all metrics
    this.register.setDefaultLabels({
      app: 'rs-legal-solutions',
      environment: process.env.NODE_ENV
    });

    promClient.collectDefaultMetrics({ register: this.register });
  }

  // Start metrics collection
  startCollection() {
    this.collectionInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error('Error collecting metrics:', error);
      });
    }, this.collectInterval);
  }

  // Collect all metrics
  async collectMetrics() {
    try {
      await Promise.all([
        this.collectSystemMetrics(),
        this.collectDatabaseMetrics(),
        this.collectCacheMetrics(),
        this.collectBusinessMetrics()
      ]);

      logger.debug('Metrics collected successfully');
    } catch (error) {
      logger.error('Failed to collect metrics:', error);
      throw error;
    }
  }

  // Collect system metrics
  async collectSystemMetrics() {
    // CPU usage
    const cpus = os.cpus();
    const totalCpu = cpus.reduce((acc, cpu) => {
      acc.idle += cpu.times.idle;
      acc.total += Object.values(cpu.times).reduce((a, b) => a + b);
      return acc;
    }, { idle: 0, total: 0 });
    const cpuUsage = (1 - totalCpu.idle / totalCpu.total) * 100;
    this.cpuUsage.set(cpuUsage);

    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    this.memoryUsage.set(usedMemory);

    // Process memory
    const processMemory = process.memoryUsage();
    Object.entries(processMemory).forEach(([type, bytes]) => {
      this.processMemory.labels(type).set(bytes);
    });
  }

  // Collect database metrics
  async collectDatabaseMetrics() {
    try {
      const dbStats = await database.collectMetrics();
      this.dbConnectionsActive.set(dbStats.connections.current);
      
      Object.entries(dbStats.operations).forEach(([type, count]) => {
        this.dbOperationsTotal.labels(type).inc(count);
      });
    } catch (error) {
      logger.error('Failed to collect database metrics:', error);
    }
  }

  // Collect cache metrics
  async collectCacheMetrics() {
    try {
      const cacheStats = await cache.getStats();
      if (cacheStats) {
        this.cacheHits.inc(parseInt(cacheStats.hits) || 0);
        this.cacheMisses.inc(parseInt(cacheStats.misses) || 0);
      }
    } catch (error) {
      logger.error('Failed to collect cache metrics:', error);
    }
  }

  // Collect business metrics
  async collectBusinessMetrics() {
    try {
      // Active users (users with sessions in the last 15 minutes)
      const activeUsers = await this.getActiveUsers();
      this.activeUsers.set(activeUsers);

      // Appointments by status
      const appointments = await this.getAppointmentStats();
      Object.entries(appointments).forEach(([status, count]) => {
        this.appointmentsTotal.labels(status).inc(count);
      });
    } catch (error) {
      logger.error('Failed to collect business metrics:', error);
    }
  }

  // Get active users count
  async getActiveUsers() {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      return await database.models.Session.countDocuments({
        lastActivity: { $gte: fifteenMinutesAgo }
      });
    } catch (error) {
      logger.error('Failed to get active users count:', error);
      return 0;
    }
  }

  // Get appointment statistics
  async getAppointmentStats() {
    try {
      const stats = await database.models.Appointment.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      return stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});
    } catch (error) {
      logger.error('Failed to get appointment stats:', error);
      return {};
    }
  }

  // HTTP request middleware
  requestMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime();

      res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationSeconds = duration[0] + duration[1] / 1e9;

        this.httpRequestsTotal.labels(req.method, req.path, res.statusCode).inc();
        this.httpRequestDuration.labels(req.method, req.path, res.statusCode)
          .observe(durationSeconds);
      });

      next();
    };
  }

  // Get metrics endpoint handler
  async getMetricsHandler(req, res) {
    try {
      const metrics = await this.register.metrics();
      res.set('Content-Type', this.register.contentType);
      res.end(metrics);
    } catch (error) {
      logger.error('Error generating metrics:', error);
      res.status(500).send('Error generating metrics');
    }
  }

  // Stop metrics collection
  stop() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    logger.info('Metrics collection stopped');
  }
}

// Export singleton instance
module.exports = new Monitor();
