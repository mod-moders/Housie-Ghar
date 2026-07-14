/**
 * Platform Config Controller
 * Key-value platform settings, editable only by a Superadmin.
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { logger } from '../../utils/logger';

/** Config keys safe to expose to unauthenticated players. */
const PUBLIC_CONFIG_KEYS = [
  'marquee_text',
  'support_email',
  'support_phone',
  'announcements_list',
  'announcement_speed',
  'announcements_muted',
  'english_caller_enabled',
] as const;

/**
 * Read the player-visible subset of the platform configuration (no auth).
 * Missing keys come back as null so a fresh database never breaks the lobby.
 */
export async function getPublicConfig(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_key, config_value FROM Platform_Config WHERE config_key = ANY($1)`,
      [PUBLIC_CONFIG_KEYS]
    );
    const out: Record<string, string | null> = {};
    for (const key of PUBLIC_CONFIG_KEYS) {
      const row = result.rows.find((r) => r.config_key === key);
      out[key] = row ? row.config_value : null;
    }
    res.json(out);
  } catch (error) {
    logger.error({ err: error }, 'error reading public platform config');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Read the entire platform configuration (Superadmin)
 */
export async function getConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_key, config_value, description, updated_at
       FROM Platform_Config
       ORDER BY config_key ASC`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'error reading platform config');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update one or more config keys (Superadmin)
 * Body: { "lock_duration_minutes": "12", "marquee_text": "..." }
 */
export async function updateConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  const updates = req.body;
  const actor = req.user!;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
    res.status(400).json({ message: 'Request body must be a non-empty object of config_key: value pairs' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [key, value] of Object.entries(updates)) {
      // Only update keys that already exist — config keys are not free-form
      const result = await client.query(
        `UPDATE Platform_Config
         SET config_value = $1, updated_by = $2, updated_at = NOW()
         WHERE config_key = $3
         RETURNING config_key`,
        [String(value), actor.userId, key]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: `Unknown config key: ${key}` });
        return;
      }
    }

    await client.query('COMMIT');

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_PLATFORM_CONFIG',
      targetType: 'Platform_Config',
      targetDescription: `Updated keys: ${Object.keys(updates).join(', ')}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const refreshed = await pool.query(
      `SELECT config_key, config_value, description, updated_at FROM Platform_Config ORDER BY config_key ASC`
    );
    res.json({ message: 'Configuration updated', config: refreshed.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'error updating platform config');
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
