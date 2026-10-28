const NodeCache = require('node-cache');
const redisService = require('./redis.service');

// Standard TTL of 5 minutes (300 seconds), check for expired keys every 320s
const localCache = new NodeCache({ stdTTL: 300, checkperiod: 320 });
const USE_REDIS = process.env.USE_REDIS_CACHE !== 'false';

class CacheService {
  /**
   * Get a cached value (Redis first, then local)
   */
  async get(key) {
    // 1. Try ultra-fast L1 local memory cache first (< 0.1ms)
    const localVal = localCache.get(key);
    if (localVal !== undefined) return localVal;

    // 2. Try Redis L2 distributed cache if available
    if (USE_REDIS && redisService.isReady) {
      try {
        const val = await redisService.get(key);
        if (val !== null && val !== undefined) {
          localCache.set(key, val, 60); // Store in L1 for 60s
          return val;
        }
      } catch (err) {
        console.warn('[Cache] Redis GET failed:', err.message);
      }
    }
    return null;
  }

  /**
   * Set a cached value (both Redis and local)
   * @param {string} key 
   * @param {any} value 
   * @param {number} [ttlSeconds] - TTL in seconds (default: 300)
   */
  async set(key, value, ttlSeconds = 300) {
    // Write to local cache immediately (fast)
    localCache.set(key, value, ttlSeconds);
    
    // Async write to Redis
    if (USE_REDIS && redisService.isReady) {
      redisService.set(key, value, ttlSeconds).catch(err => {
        console.warn('[Cache] Redis SET failed:', err.message);
      });
    }
    return true;
  }

  /**
   * Delete a cached value (both Redis and local)
   */
  async delete(key) {
    localCache.del(key);
    
    if (USE_REDIS && redisService.isReady) {
      redisService.del(key).catch(err => {
        console.warn('[Cache] Redis DEL failed:', err.message);
      });
    }
    return true;
  }

  /**
   * Delete by pattern (Redis only, local cache flush)
   */
  async deletePattern(pattern) {
    if (USE_REDIS && redisService.isReady) {
      await redisService.delPattern(pattern).catch(err => {
        console.warn('[Cache] Redis DEL pattern failed:', err.message);
      });
    }
    // Local cache doesn't support pattern delete, flush all
    localCache.flushAll();
    return true;
  }

  /**
   * Clear everything
   */
  async clear() {
    localCache.flushAll();
    
    if (USE_REDIS && redisService.isReady) {
      try {
        await redisService.client.flushdb();
      } catch (err) {
        console.warn('[Cache] Redis FLUSHDB failed:', err.message);
      }
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      local: {
        keys: localCache.keys().length,
        stats: localCache.getStats()
      },
      redis: {
        connected: redisService.isReady
      }
    };
  }
}

// Export singleton instance
module.exports = new CacheService();
