/**
 * Themes Controller
 * Global UI theme listing and activation (Superadmin sets the active theme).
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { io } from '../../server';
import { sseManager } from '../../utils/sseManager';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';

/**
 * List all themes and flag the active one (Public — clients need it to render).
 */
export async function listThemes(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT theme_id, theme_name, css_class, is_active, preview_image_url
       FROM Themes
       ORDER BY theme_id ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing themes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Set the active theme (Superadmin). Broadcasts the change to all clients.
 * Body: { theme_id }
 */
export async function setActiveTheme(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { theme_id } = req.body;
  const actor = req.user!;

  if (!theme_id) {
    res.status(400).json({ message: 'theme_id is required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const themeRes = await client.query(
      `SELECT theme_id, theme_name, css_class FROM Themes WHERE theme_id = $1`,
      [theme_id]
    );

    if (themeRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Theme not found' });
      return;
    }

    const theme = themeRes.rows[0];

    // Exactly one active theme
    await client.query(`UPDATE Themes SET is_active = FALSE WHERE is_active = TRUE`);
    await client.query(`UPDATE Themes SET is_active = TRUE WHERE theme_id = $1`, [theme_id]);

    await client.query('COMMIT');

    // Broadcast to players (SSE) and staff (Socket.io)
    const payload = { event: 'theme_change' as const, theme_class: theme.css_class };
    sseManager.broadcastAll(payload);
    io.emit('theme_change', payload);

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'SET_ACTIVE_THEME',
      targetType: 'Theme',
      targetId: String(theme_id),
      targetDescription: `Activated theme "${theme.theme_name}"`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Active theme updated', theme });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error setting active theme:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
