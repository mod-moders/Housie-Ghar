/**
 * Audit Log Controller
 * Read-only, paginated access to the immutable audit trail (Superadmin).
 */

import { Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';

const MAX_LIMIT = 100;

/**
 * Paginated audit log with optional filters by action and actor.
 * Query: ?page=1&limit=50&action=APPROVE_TOPUP&user_id=<uuid>
 */
export async function getAuditLog(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const offset = (page - 1) * limit;

  const { action, user_id } = req.query;

  const filters: string[] = [];
  const params: any[] = [];

  if (action) {
    params.push(action);
    filters.push(`action = $${params.length}`);
  }
  if (user_id) {
    params.push(user_id);
    filters.push(`user_id = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM Audit_Log ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT log_id, timestamp, user_id, user_name, user_role, action,
              target_type, target_id, target_description, ip_address
       FROM Audit_Log
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      entries: dataRes.rows,
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
