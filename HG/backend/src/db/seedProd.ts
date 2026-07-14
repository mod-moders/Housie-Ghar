/**
 * Production bootstrap seed — the ONLY seed safe to run in production.
 *
 * A freshly migrated database has no Roles, no Platform_Config, and no
 * Superadmin, so the app is unusable until this runs once. Everything here is
 * idempotent: re-running never overwrites data that already exists.
 *
 * Usage (Railway shell or any host):  npm run seed:prod
 *
 * The Superadmin is created from SUPERADMIN_EMAIL + SUPERADMIN_TEMP_PASSWORD
 * with temp_password_required = TRUE, so the first login forces a password
 * change (enforced by the auth middleware). In production this script refuses
 * to run with the well-known dev defaults still in place.
 */

import bcrypt from 'bcrypt';
import pool from './index';
import { env } from '../config/env';

const DEV_DEFAULT_EMAIL = 'superadmin@housieghar.local';
const DEV_DEFAULT_PASSWORD = 'ChangeMe123!';

async function seedProd(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    if (env.SUPERADMIN_EMAIL === DEV_DEFAULT_EMAIL || env.SUPERADMIN_TEMP_PASSWORD === DEV_DEFAULT_PASSWORD) {
      throw new Error(
        'Refusing to bootstrap production with dev defaults — set real SUPERADMIN_EMAIL and SUPERADMIN_TEMP_PASSWORD first'
      );
    }
  }

  console.log('🚀 Bootstrapping database (idempotent)...');

  // 1. Roles — fixed IDs the RBAC layer depends on.
  await pool.query(
    `INSERT INTO Roles (role_id, role_name, description) VALUES
     (1, 'Superadmin', 'Unrestricted administrative control across the system'),
     (2, 'Admin', 'Workforce management, game planning, and wallet audits'),
     (3, 'Operator', 'Dedicated control of the live game board and draw speed'),
     (4, 'Agent', 'Local sales, payment confirmation, and ticket provisioning')
     ON CONFLICT (role_id) DO NOTHING`
  );
  console.log('  ✅ Roles');

  // 2. Platform config defaults — never overwrite live values on re-run.
  await pool.query(
    `INSERT INTO Platform_Config (config_key, config_value, description) VALUES
     ('support_email', 'support@housieghar.com', 'Support email address shown to players'),
     ('support_phone', '+91-XXXXXXXXXX', 'Support phone number shown to players'),
     ('marquee_text', 'Welcome to Housie Ghar!', 'Scrolling text banner on the homepage'),
     ('terms_text', 'Housie Ghar is for recreational play. All transactions are peer-to-peer.', 'Platform Terms and Conditions'),
     ('lock_duration_minutes', '10', 'Number of minutes a ticket booking soft-lock is held'),
     ('low_balance_threshold', '500', 'Alert threshold for Agent wallet balance'),
     ('spam_flag_threshold', '3', 'Number of spam flags before a player is soft-banned'),
     ('announcements_list', '[]', 'Lobby announcements as a JSON array of up to 5 {id, text, muted} items'),
     ('announcement_speed', '10', 'Seconds each lobby announcement stays on screen before rotating'),
     ('announcements_muted', 'false', 'Whether all lobby announcements are hidden'),
     ('english_caller_enabled', 'true', 'Whether the live board speaks each drawn number (TTS / MP3)')
     ON CONFLICT (config_key) DO NOTHING`
  );
  console.log('  ✅ Platform_Config defaults');

  // 3. One Superadmin, only if none exists yet.
  const existing = await pool.query(`SELECT user_id, email FROM Users WHERE role_id = 1 LIMIT 1`);
  if (existing.rowCount && existing.rowCount > 0) {
    console.log(`  ⏭  Superadmin already exists (${existing.rows[0].email}) — skipping`);
  } else {
    const hash = await bcrypt.hash(env.SUPERADMIN_TEMP_PASSWORD, 12);
    await pool.query(
      `INSERT INTO Users (role_id, full_name, email, password_hash, temp_password_required, status)
       VALUES (1, 'Super Admin', $1, $2, TRUE, 'Active')`,
      [env.SUPERADMIN_EMAIL.toLowerCase().trim(), hash]
    );
    console.log(`  ✅ Superadmin created (${env.SUPERADMIN_EMAIL}) — temp password, must change on first login`);
  }

  console.log('✨ Bootstrap complete');
}

seedProd()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ Bootstrap failed:', err);
    pool.end();
    process.exit(1);
  });
