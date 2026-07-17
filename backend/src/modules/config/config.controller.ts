/**
 * Platform Config Controller
 * Key-value platform settings, editable only by a Superadmin.
 */

import { Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { io } from '../../server';

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
    console.error('Error reading platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Read public platform configuration (Unauthenticated)
 */
export async function getPublicConfig(req: any, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_key, config_value
       FROM Platform_Config
       WHERE config_key IN ('active_theme', 'marquee_text', 'announcement_text', 'site_title', 'maintenance_mode', 'english_caller_enabled', 'announcements_list', 'announcement_speed', 'announcements_muted', 'bookie_commission_per_ticket', 'cage_sound_enabled', 'celebration_sound_enabled')`
    );
    // Convert to a simple key-value object
    const configObj = result.rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {} as Record<string, string>);
    
    res.json(configObj);
  } catch (error) {
    console.error('Error reading public platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Operator-safe read of the WhatsApp destinations configured by Superadmin.
 * The links are intentionally kept out of the public configuration payload.
 */
export async function getShareGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_value FROM Platform_Config WHERE config_key = 'whatsapp_share_groups'`
    );
    const raw = result.rows[0]?.config_value ?? '[]';
    let groups: unknown = [];
    try { groups = JSON.parse(raw); } catch { groups = []; }

    if (!Array.isArray(groups)) {
      res.json({ groups: [] });
      return;
    }

    const safeGroups = groups
      .filter((group): group is { name: string; url: string } =>
        !!group && typeof group === 'object' &&
        typeof (group as { name?: unknown }).name === 'string' &&
        typeof (group as { url?: unknown }).url === 'string'
      )
      .map((group) => ({ name: group.name.trim(), url: group.url.trim() }))
      .filter((group) => group.name && /^https:\/\/(chat\.whatsapp\.com|web\.whatsapp\.com|wa\.me)\//i.test(group.url));

    res.json({ groups: safeGroups });
  } catch (error) {
    console.error('Error reading WhatsApp share groups:', error);
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

    // Broadcast config updates to all connected players/clients instantly
    const publicKeys = ['active_theme', 'marquee_text', 'announcement_text', 'site_title', 'maintenance_mode', 'english_caller_enabled', 'announcements_list', 'announcement_speed', 'announcements_muted', 'bookie_commission_per_ticket', 'cage_sound_enabled', 'celebration_sound_enabled'];
    const publicUpdates: Record<string, string> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (publicKeys.includes(key)) {
        publicUpdates[key] = String(val);
      }
    }
    if (Object.keys(publicUpdates).length > 0) {
      io.emit('config_update', publicUpdates);
    }

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
    console.error('Error updating platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
