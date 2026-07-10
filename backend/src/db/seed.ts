/**
 * Database seed runner
 * Runs all seed files in order
 */

import fs from 'fs';
import path from 'path';
import pool from './index';

const SEEDS_DIR = path.resolve(__dirname, '../../seeds');

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...');

  const seedFiles = [
    'seed_roles.sql',
    'seed_superadmin.sql',
  ];

  for (const file of seedFiles) {
    const filePath = path.join(SEEDS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('COMMIT');
      console.log(`  ✅ Seeded: ${file}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error(`  ❌ Seed failed: ${file}`, error);
      throw error;
    }
  }

  console.log('✅ Seeding complete');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed runner failed:', err);
  process.exit(1);
});
