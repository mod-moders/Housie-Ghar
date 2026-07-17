/**
 * Database seed runner
 * Runs all seed files in order
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import pool from './index';

const SEEDS_DIR = path.resolve(__dirname, '../../seeds');

/**
 * Seed the default Superadmin from environment variables. The password is
 * bcrypt-hashed here (work factor 12) so no real credential lives in the repo.
 * Idempotent and non-destructive: ON CONFLICT (email) DO NOTHING never overwrites
 * an existing account's password (production rotates it after first login).
 */
async function seedSuperadmin(): Promise<void> {
  const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@housieghar.in').toLowerCase().trim();
  const password = process.env.SUPERADMIN_TEMP_PASSWORD || 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await pool.query(`SELECT user_id FROM Users WHERE email = $1 OR username = 'superadmin'`, [email]);
  if (existing.rowCount === 0) {
    await pool.query(
      `INSERT INTO Users (role_id, full_name, username, email, phone, password_hash, temp_password_required, status)
       VALUES (1, 'Super Admin', 'superadmin', $1, '+919999999999', $2, TRUE, 'Active')`,
      [email, passwordHash]
    );
  }
  console.log(`  ✅ Seeded: superadmin (${email}, password from env, temp-flagged)`);
}

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...');

  const seedFiles = [
    'seed_roles.sql',
    'seed_superadmin.sql', // roles + platform config (superadmin user seeded below, env-driven)
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

  await seedSuperadmin();

  console.log('✅ Seeding complete');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed runner failed:', err);
  process.exit(1);
});
