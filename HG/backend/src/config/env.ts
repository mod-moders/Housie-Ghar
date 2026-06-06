/**
 * Environment configuration
 * Reads and validates all environment variables (throws on missing)
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Redis
  REDIS_URL: requireEnv('REDIS_URL'),

  // Authentication
  JWT_PRIVATE_KEY: requireEnv('JWT_PRIVATE_KEY'),
  JWT_PUBLIC_KEY: requireEnv('JWT_PUBLIC_KEY'),
  JWT_EXPIRY: optionalEnv('JWT_EXPIRY', '24h'),

  // Application
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(optionalEnv('PORT', '4000'), 10),
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // Admin Seed
  SUPERADMIN_EMAIL: optionalEnv('SUPERADMIN_EMAIL', 'superadmin@housieghar.local'),
  SUPERADMIN_TEMP_PASSWORD: optionalEnv('SUPERADMIN_TEMP_PASSWORD', 'ChangeMe123!'),

  // Security
  LOCK_DURATION_MINUTES: parseInt(optionalEnv('LOCK_DURATION_MINUTES', '10'), 10),
  MAX_LOCK_ATTEMPTS_PER_MINUTE: parseInt(optionalEnv('MAX_LOCK_ATTEMPTS_PER_MINUTE', '5'), 10),
  SPAM_FLAG_THRESHOLD: parseInt(optionalEnv('SPAM_FLAG_THRESHOLD', '3'), 10),
  LOW_BALANCE_THRESHOLD: parseInt(optionalEnv('LOW_BALANCE_THRESHOLD', '500'), 10),
};
