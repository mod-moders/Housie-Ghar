/**
 * Database seed runner
 * Runs all seed files in order
 */

import fs from 'fs';
import path from 'path';
import pool from './index';

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed.ts must never run in production');
}

const SEEDS_DIR = path.resolve(__dirname, '../../seeds');

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...');

  const seedFiles = [
    'seed_roles.sql',
    'seed_superadmin.sql',
    'seed_sample_game.sql',
    'seed_sample_staff.sql', // after sample_game: assigns the seeded operator to it
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

  console.log('✅ Base seeds complete, starting ticket generation...');

  const { generateTicketsForGame } = require('./generateGameTickets');

  // Generate tickets for both sample games
  await generateTicketsForGame('00000000-0000-0000-0000-000000000001', 120);
  await generateTicketsForGame('00000000-0000-0000-0000-000000000002', 90);

  console.log('✅ Seeding complete');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed runner failed:', err);
  process.exit(1);
});
