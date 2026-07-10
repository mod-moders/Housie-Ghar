/**
 * Redis client + pub/sub channel setup
 */

import { createClient } from 'redis';
import { env } from '../config/env';

// Main Redis client (for cache operations)
const redisClient = createClient({
  url: env.REDIS_URL,
  RESP: 2,
});

// Pub/Sub publisher
const redisPublisher = createClient({
  url: env.REDIS_URL,
  RESP: 2,
});

// Pub/Sub subscriber
const redisSubscriber = createClient({
  url: env.REDIS_URL,
  RESP: 2,
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));

redisClient.on('connect', () => console.log('🔴 Redis client connected'));
redisPublisher.on('connect', () => console.log('🔴 Redis publisher connected'));
redisSubscriber.on('connect', () => console.log('🔴 Redis subscriber connected'));

export async function connectRedis(): Promise<void> {
  await Promise.all([
    redisClient.connect(),
    redisPublisher.connect(),
    redisSubscriber.connect(),
  ]);
  console.log('✅ All Redis connections established');
}

export { redisClient, redisPublisher, redisSubscriber };
