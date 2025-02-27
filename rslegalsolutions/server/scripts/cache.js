const Redis = require('ioredis');
const logger = require('./logger');
require('dotenv').config();

class CacheManager {
  constructor() {
    this.defaultTTL = parseInt(process.env.CACHE_TTL) || 3600; // 1 hour in seconds
    this.prefix = process.env.CACHE_PREFIX || 'rslegal:';
    
    this.initializeRedis();
    this.setupEvents();
  }

  // Initialize Redis connection
  initializeRedis() {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    };

    this.client = new Redis(config);
    this.subscriber = new Redis(config);
  }

  // Setup Redis event handlers
  setupEvents() {
    this.client.on('connect', () => {
      logger.info('Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });

    this.subscriber.subscribe('cache:invalidate');
    this.subscriber.on('message', (channel, message) => {
      if (channel === 'cache:invalidate') {
        this.handleInvalidation(message);
      }
    });
  }

  // Generate cache key
  generateKey(key) {
    return `${this.prefix}${key}`;
  }

  // Set cache value
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const cacheKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setex(cacheKey, ttl, serializedValue);
      } else {
        await this.client.set(cacheKey, serializedValue);
      }

      logger.debug(`Cache set: ${cacheKey}`);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  // Get cache value
  async get(key) {
    try {
      const cacheKey = this.generateKey(key);
      const value = await this.client.get(cacheKey);
      
      if (!value) return null;

      logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  // Delete cache value
  async del(key) {
    try {
      const cacheKey = this.generateKey(key);
      await this.client.del(cacheKey);
      logger.debug(`Cache deleted: ${cacheKey}`);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  // Set multiple cache values
  async mset(entries, ttl = this.defaultTTL) {
    try {
      const pipeline = this.client.pipeline();
      
      entries.forEach(([key, value]) => {
        const cacheKey = this.generateKey(key);
        const serializedValue = JSON.stringify(value);
        
        if (ttl) {
          pipeline.setex(cacheKey, ttl, serializedValue);
        } else {
          pipeline.set(cacheKey, serializedValue);
        }
      });

      await pipeline.exec();
      logger.debug(`Cache mset: ${entries.length} entries`);
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  // Get multiple cache values
  async mget(keys) {
    try {
      const cacheKeys = keys.map(key => this.generateKey(key));
      const values = await this.client.mget(cacheKeys);
      
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  // Cache decorator for functions
  cache(key, ttl = this.defaultTTL) {
    return function(target, propertyKey, descriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function(...args) {
        const cacheKey = typeof key === 'function' 
          ? key.apply(this, args)
          : `${key}:${JSON.stringify(args)}`;

        const cachedValue = await this.get(cacheKey);
        if (cachedValue !== null) {
          return cachedValue;
        }

        const result = await originalMethod.apply(this, args);
        await this.set(cacheKey, result, ttl);
        return result;
      };

      return descriptor;
    };
  }

  // Handle cache invalidation
  async handleInvalidation(pattern) {
    try {
      const keys = await this.client.keys(this.generateKey(pattern));
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info(`Cache invalidated: ${pattern}, ${keys.length} keys removed`);
      }
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }
  }

  // Invalidate cache by pattern
  async invalidate(pattern) {
    await this.client.publish('cache:invalidate', pattern);
  }

  // Clear all cache
  async clear() {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info(`Cache cleared: ${keys.length} keys removed`);
      }
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  // Get cache stats
  async getStats() {
    try {
      const info = await this.client.info();
      const keys = await this.client.keys(`${this.prefix}*`);
      
      return {
        totalKeys: keys.length,
        info: this.parseRedisInfo(info),
        prefix: this.prefix
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }

  // Parse Redis INFO command output
  parseRedisInfo(info) {
    const result = {};
    const lines = info.split('\n');
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    });

    return result;
  }

  // Middleware for caching HTTP responses
  cacheMiddleware(options = {}) {
    const {
      ttl = this.defaultTTL,
      key = req => `${req.method}:${req.originalUrl}`,
      condition = () => true
    } = options;

    return async (req, res, next) => {
      if (!condition(req)) {
        return next();
      }

      const cacheKey = typeof key === 'function' ? key(req) : key;
      const cachedResponse = await this.get(cacheKey);

      if (cachedResponse) {
        return res.json(cachedResponse);
      }

      const originalJson = res.json;
      res.json = function(body) {
        this.set(cacheKey, body, ttl);
        originalJson.call(this, body);
      };

      next();
    };
  }

  // Close Redis connections
  async close() {
    await this.client.quit();
    await this.subscriber.quit();
    logger.info('Redis connections closed');
  }
}

// Export singleton instance
module.exports = new CacheManager();
