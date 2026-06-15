import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

let redisClient: RedisClientType;

export async function initializeRedis(): Promise<void> {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => logger.error('Redis error', err));

    await redisClient.connect();
    logger.info('Redis connection successful');
  } catch (error) {
    logger.error('Redis connection failed', error);
    throw error;
  }
}

export function getRedis(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis not initialized');
  }
  return redisClient;
}

export async function set(key: string, value: string, ttl?: number): Promise<void> {
  if (ttl) {
    await redisClient.setEx(key, ttl, value);
  } else {
    await redisClient.set(key, value);
  }
}

export async function get(key: string): Promise<string | null> {
  return await redisClient.get(key);
}

export async function del(key: string): Promise<void> {
  await redisClient.del(key);
}
