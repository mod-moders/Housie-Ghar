/**
 * Database migration runner
 * Runs SQL migration files in numeric order on startup
 */

import fs from 'fs';
import path from 'path';
import pool from './index';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function migrate(): Promise<void> {
  logger.info('running database migrations');

  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Get list of already executed migrations
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const executedMigrations = new Set(result.rows.map((row: any) => row.name));

  // Get all migration files sorted by name
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (executedMigrations.has(file)) {
      logger.debug({ file }, 'migration already executed, skipping');
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      logger.info({ file }, 'migration executed');
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error({ err: error, file }, 'migration failed');
      throw error;
    }
  }

  logger.info('all migrations complete');
  await pool.end();
}

migrate().catch((err) => {
  logger.error({ err }, 'migration runner failed');
  process.exit(1);
});
