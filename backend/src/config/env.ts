/**
 * Environment configuration
 * Reads and validates all environment variables (throws on missing)
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env from the project root (HG/.env). Resolve it across all the ways
// the app is launched — ts-node dev, the compiled dist (whatever its nesting),
// and from either the backend/ or HG/ working directory. In Docker the vars are
// injected directly, so a missing file is fine (existing process.env wins).
const ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../../.env'),
];
const envPath = ENV_CANDIDATES.find((p) => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
}

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

const JWT_PRIVATE_KEY = requireEnv('JWT_PRIVATE_KEY');

/**
 * The verification key is DERIVED from the signing key so the pair can never
 * drift apart. A JWT_PUBLIC_KEY env var from a different keypair breaks auth
 * in the worst possible way: login succeeds (signing only needs the private
 * key), but every subsequent request 403s at jwt.verify — so staff "log in"
 * and silently bounce straight back to the login page.
 *
 * An explicit JWT_PUBLIC_KEY is only consulted as a fallback when derivation
 * is impossible (non-RSA/encrypted key). If one is set but disagrees with the
 * derived key, we log loudly and use the derived (correct) one.
 */
function resolveJwtPublicKey(): string {
  let derived: string;
  try {
    derived = crypto.createPublicKey(JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString();
  } catch {
    console.warn('⚠️  Could not derive a public key from JWT_PRIVATE_KEY — falling back to the JWT_PUBLIC_KEY env var.');
    return requireEnv('JWT_PUBLIC_KEY');
  }

  const explicit = process.env.JWT_PUBLIC_KEY;
  if (explicit) {
    try {
      // Normalize to SPKI PEM before comparing so a pkcs1-formatted env var
      // doesn't false-alarm.
      const normalized = crypto.createPublicKey(explicit).export({ type: 'spki', format: 'pem' }).toString();
      if (normalized !== derived) {
        console.error(
          '❌ JWT_PUBLIC_KEY does not match JWT_PRIVATE_KEY (they are halves of different keypairs). ' +
            'Using the public key derived from JWT_PRIVATE_KEY instead — update or remove the JWT_PUBLIC_KEY env var.'
        );
      }
    } catch {
      console.error('❌ JWT_PUBLIC_KEY env var is not a parseable public key. Using the key derived from JWT_PRIVATE_KEY.');
    }
  }
  return derived;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Redis
  REDIS_URL: requireEnv('REDIS_URL'),

  // Authentication
  JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY: resolveJwtPublicKey(),
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
  RATE_LIMIT_GLOBAL_MAX: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_MAX', '1200'), 10),
};
