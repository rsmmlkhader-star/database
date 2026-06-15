import { getRedis } from '../../cache/redis';
import logger from '../../utils/logger';

export class CacheService {
  /**
   * Get cached schema
   */
  async getCachedSchema(connectionId: string, tableName: string): Promise<any | null> {
    try {
      const redis = getRedis();
      const key = `schema:${connectionId}:${tableName}`;
      const cached = await redis.get(key);

      if (cached) {
        logger.info(`Cache hit for schema: ${key}`);
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.error('Cache get failed', error);
      return null;
    }
  }

  /**
   * Set cached schema
   */
  async setCachedSchema(
    connectionId: string,
    tableName: string,
    schema: any,
    ttlSeconds: number = 86400
  ): Promise<void> {
    try {
      const redis = getRedis();
      const key = `schema:${connectionId}:${tableName}`;
      await redis.setEx(key, ttlSeconds, JSON.stringify(schema));

      logger.info(`Cached schema: ${key}`);
    } catch (error) {
      logger.error('Cache set failed', error);
    }
  }

  /**
   * Get cached connection
   */
  async getCachedConnection(connectionId: string): Promise<any | null> {
    try {
      const redis = getRedis();
      const key = `connection:${connectionId}`;
      const cached = await redis.get(key);

      if (cached) {
        logger.info(`Cache hit for connection: ${key}`);
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.error('Cache get failed', error);
      return null;
    }
  }

  /**
   * Set cached connection
   */
  async setCachedConnection(
    connectionId: string,
    config: any,
    ttlSeconds: number = 3600
  ): Promise<void> {
    try {
      const redis = getRedis();
      const key = `connection:${connectionId}`;
      await redis.setEx(key, ttlSeconds, JSON.stringify(config));

      logger.info(`Cached connection: ${key}`);
    } catch (error) {
      logger.error('Cache set failed', error);
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidateCache(key: string): Promise<void> {
    try {
      const redis = getRedis();
      await redis.del(key);

      logger.info(`Invalidated cache: ${key}`);
    } catch (error) {
      logger.error('Cache invalidation failed', error);
    }
  }

  /**
   * Invalidate all cache for a connection
   */
  async invalidateConnectionCache(connectionId: string): Promise<void> {
    try {
      const redis = getRedis();
      // This is a simplified version - in production, use SCAN or maintain a set of keys
      await redis.del(`connection:${connectionId}`);

      logger.info(`Invalidated all cache for connection: ${connectionId}`);
    } catch (error) {
      logger.error('Cache invalidation failed', error);
    }
  }
}
