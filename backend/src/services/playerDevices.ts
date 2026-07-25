/**
 * Known-device registry for passwordless player accounts.
 *
 * Player signup is deliberately frictionless: a housie name, no password. But
 * housie names are PUBLIC (leaderboard, live board, ticket search), so
 * "name is enough to log in" meant anyone could read a winner's name off the
 * leaderboard and sign in as them — then claim their prizes, or set a password
 * and lock the real owner out permanently.
 *
 * This closes that without adding a signup step: a passwordless account can
 * only be logged into from a device it has been seen on before. Setting a
 * password lifts the restriction (password holders can sign in anywhere).
 *
 * Device ids are client-generated random values stored in localStorage. They
 * are hashed (SHA-256) before storage because for a passwordless account the
 * device id IS the credential — a database read must not be enough to
 * impersonate someone.
 */

import crypto from 'crypto';
import { PoolClient } from 'pg';
import pool from '../db';

/** Minimum entropy we'll accept from a client-supplied device id. */
const MIN_DEVICE_ID_LENGTH = 16;

export function hashDeviceId(deviceId: string): string {
  return crypto.createHash('sha256').update(String(deviceId), 'utf8').digest('hex');
}

export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && deviceId.trim().length >= MIN_DEVICE_ID_LENGTH;
}

/**
 * Record a device against a player. Idempotent — re-seeing a known device just
 * refreshes `last_seen_at`.
 */
export async function registerDevice(
  playerId: string,
  deviceId: string,
  userAgent?: string | null,
  client?: PoolClient
): Promise<void> {
  if (!isValidDeviceId(deviceId)) return;
  const db = client ?? pool;
  await db.query(
    `INSERT INTO Player_Devices (player_id, device_hash, user_agent)
     VALUES ($1, $2, $3)
     ON CONFLICT (player_id, device_hash)
     DO UPDATE SET last_seen_at = NOW()`,
    [playerId, hashDeviceId(deviceId), userAgent ? String(userAgent).slice(0, 500) : null]
  );
}

export interface DeviceCheck {
  /** This exact device has been seen on this account before. */
  known: boolean;
  /** The account has no registered devices at all. */
  firstEver: boolean;
}

export async function checkDevice(playerId: string, deviceId: unknown): Promise<DeviceCheck> {
  const totalRes = await pool.query(
    'SELECT COUNT(*)::int AS count FROM Player_Devices WHERE player_id = $1',
    [playerId]
  );
  const total: number = totalRes.rows[0]?.count ?? 0;

  if (total === 0) return { known: false, firstEver: true };
  if (!isValidDeviceId(deviceId)) return { known: false, firstEver: false };

  const res = await pool.query(
    'SELECT 1 FROM Player_Devices WHERE player_id = $1 AND device_hash = $2',
    [playerId, hashDeviceId(deviceId)]
  );

  return { known: (res.rowCount ?? 0) > 0, firstEver: false };
}
