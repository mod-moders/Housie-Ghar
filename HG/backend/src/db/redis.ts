/**
 * Redis client + pub/sub channel setup
 */

import { createClient } from 'redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Main Redis client (for cache operations)
const redisClient = createClient({
  url: env.REDIS_URL,
});

// Pub/Sub publisher
const redisPublisher = createClient({
  url: env.REDIS_URL,
});

// Pub/Sub subscriber
const redisSubscriber = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => logger.error({ err }, 'Redis client error'));
redisPublisher.on('error', (err) => logger.error({ err }, 'Redis publisher error'));
redisSubscriber.on('error', (err) => logger.error({ err }, 'Redis subscriber error'));

export async function connectRedis(): Promise<void> {
  await Promise.all([
    redisClient.connect(),
    redisPublisher.connect(),
    redisSubscriber.connect(),
  ]);
  logger.info('all Redis connections established');
}

export { redisClient, redisPublisher, redisSubscriber };
