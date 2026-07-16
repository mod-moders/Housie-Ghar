/**
 * Self-healing superadmin access.
 *
 * Background: the old login controller had a fallback that let ANY account be
 * accessed with a hardcoded password ('ChangeMe123!') or a plaintext substring
 * whenever the stored password_hash was not a real bcrypt hash. That backdoor
 * was removed (it let anyone sign into any staff account on a money platform).
 * Accounts that had only ever been reachable through that fallback — i.e. whose
 * password_hash is null/plaintext/malformed — are now correctly locked out.
 *
 * This boot task restores the ONE account needed to recover the rest — the
 * Superadmin — without reintroducing any backdoor:
 *
 *   • It runs only when the operator opts in by setting SUPERADMIN_TEMP_PASSWORD
 *     in the environment. No env var → it does nothing.
 *   • It only touches the Superadmin when the stored password is unusable
 *     (missing, or not a valid bcrypt hash). A valid password is NEVER overwritten,
 *     so leaving the env var set does not reset a working login on later deploys.
 *   • The restored password is bcrypt-hashed (work factor 12) and flagged
 *     temp_password_required, so it is a proper credential, not a bypass.
 *
 * Once the Superadmin can log in, other staff are re-secured the correct way via
 * the Edit Staff UI (users.controller.createUser/updateUser both bcrypt-hash).
 */

import bcrypt from 'bcrypt';
import pool from '../db';

const SUPERADMIN_ROLE_ID = 1;

/** A usable credential is a real bcrypt hash: `$2a$`/`$2b$`/`$2y$`, 60 chars. */
function isValidBcryptHash(hash: unknown): boolean {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash) && hash.length === 60;
}

export async function ensureSuperadminAccess(): Promise<void> {
  const resetPassword = process.env.SUPERADMIN_TEMP_PASSWORD;
  // Opt-in gate: without an explicit temp password, never write anything.
  if (!resetPassword) return;

  const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@housieghar.in').toLowerCase().trim();

  try {
    const existing = await pool.query(
      `SELECT user_id, password_hash FROM Users WHERE email = $1 AND role_id = $2`,
      [email, SUPERADMIN_ROLE_ID]
    );

    // A working password is sacrosanct — leave it untouched.
    if (existing.rowCount && isValidBcryptHash(existing.rows[0].password_hash)) {
      return;
    }

    const passwordHash = await bcrypt.hash(resetPassword, 12);

    if (existing.rowCount) {
      await pool.query(
        `UPDATE Users
            SET password_hash = $1, temp_password_required = TRUE, status = 'Active'
          WHERE user_id = $2`,
        [passwordHash, existing.rows[0].user_id]
      );
      console.warn(
        `⚠️  Superadmin (${email}) had no usable password — reset from SUPERADMIN_TEMP_PASSWORD. ` +
          `Log in, change it, then unset SUPERADMIN_TEMP_PASSWORD.`
      );
    } else {
      await pool.query(
        `INSERT INTO Users (role_id, full_name, email, phone, password_hash, temp_password_required, status)
         VALUES ($1, 'Super Admin', $2, '+919999999999', $3, TRUE, 'Active')
         ON CONFLICT (email) DO NOTHING`,
        [SUPERADMIN_ROLE_ID, email, passwordHash]
      );
      console.warn(
        `⚠️  Superadmin (${email}) did not exist — created from SUPERADMIN_TEMP_PASSWORD. ` +
          `Log in, change it, then unset SUPERADMIN_TEMP_PASSWORD.`
      );
    }
  } catch (error) {
    // Never let recovery logic crash the boot sequence.
    console.error('ensureSuperadminAccess failed:', error);
  }
}
