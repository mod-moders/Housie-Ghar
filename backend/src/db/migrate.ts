/**
 * Database migration runner
 * Runs SQL migration files in numeric order on startup
 */

import fs from 'fs';
import path from 'path';
import pool from './index';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function migrate(): Promise<void> {
  console.log('🔄 Running database migrations...');

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
      console.log(`  ⏭ Skipping (already executed): ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`  ✅ Executed: ${file}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error(`  ❌ Failed: ${file}`, error);
      throw error;
    }
  }

  console.log('✅ All migrations complete');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
