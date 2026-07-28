/**
 * PostgreSQL connection pool
 */

import { Pool } from 'pg';
import { env } from '../config/env';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,              // Maximum number of connections in the pool
  idleTimeoutMillis: 30000,
  // Was 2000. Every controller wraps its queries in try/catch and answers a failure
  // with `500 {"message":"Internal server error"}`, so a pool that could not hand
  // out a connection within 2s surfaced to players as a hard server error on
  // whatever page they were on — signup and login included. Two seconds is easy to
  // exceed in a burst: a live game has the draw engine, every viewer's SSE
  // reconnects and their /api/games + /api/config/public + /api/player/me calls all
  // contending for the same 20 connections. Waiting longer turns a spike into a
  // slower request instead of a scary error.
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // Deliberately does NOT exit. This fires for an error on an IDLE pooled client —
  // a connection the database or the network dropped underneath us — which `pg`
  // already handles by discarding that client from the pool. The previous
  // `process.exit(-1)` here turned a single recoverable dropped connection into a
  // full backend outage: every player mid-game disconnected, and everyone signing
  // up or signing in got an error until Railway finished restarting the process.
  // Losing one pooled connection is not worth taking the platform down for.
  console.error('Unexpected error on idle PostgreSQL client (connection discarded):', err);
});

pool.on('connect', () => {
  console.log('📦 PostgreSQL client connected');
});

export default pool;
