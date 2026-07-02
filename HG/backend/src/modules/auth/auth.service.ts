/**
 * Staff auth service — password lifecycle + per-request access flags.
 *
 * Takes a pg Pool/PoolClient parameter (never the env-bound singleton) so it
 * stays integration-testable, mirroring settlements.service.ts.
 */

import bcrypt from 'bcrypt';
import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export const MIN_PASSWORD_LENGTH = 8;
export const BCRYPT_WORK_FACTOR = 12;

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_password' | 'too_short' | 'unchanged' };

/**
 * Verify the caller's current password and replace it. Clearing
 * temp_password_required in the same statement is what releases a
 * first-login account from the middleware's TEMP_PASSWORD_REQUIRED gate.
 */
export async function changeStaffPassword(
  db: Db,
  args: { userId: string; currentPassword: string; newPassword: string }
): Promise<ChangePasswordResult> {
  const { userId, currentPassword, newPassword } = args;

  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }
  if (newPassword === currentPassword) {
    return { ok: false, reason: 'unchanged' };
  }

  const res = await db.query('SELECT password_hash FROM Users WHERE user_id = $1', [userId]);
  if (res.rowCount === 0) return { ok: false, reason: 'not_found' };

  let matches = false;
  try {
    matches = await bcrypt.compare(currentPassword, res.rows[0].password_hash);
  } catch {
    matches = false; // malformed stored hash — fail closed, never grant access
  }
  if (!matches) return { ok: false, reason: 'wrong_password' };

  const newHash = await bcrypt.hash(newPassword, BCRYPT_WORK_FACTOR);
  await db.query(
    'UPDATE Users SET password_hash = $1, temp_password_required = FALSE WHERE user_id = $2',
    [newHash, userId]
  );
  return { ok: true };
}

export interface StaffAccessFlags {
  status: string;
  temp_password_required: boolean;
}

/**
 * Live account flags checked on every authenticated request (not baked into
 * the JWT) so suspension and temp-password enforcement apply immediately.
 */
export async function getStaffAccessFlags(
  db: Db,
  userId: string
): Promise<StaffAccessFlags | null> {
  const res = await db.query(
    'SELECT status, temp_password_required FROM Users WHERE user_id = $1',
    [userId]
  );
  if (res.rowCount === 0) return null;
  return {
    status: res.rows[0].status,
    temp_password_required: res.rows[0].temp_password_required === true,
  };
}
