/**
 * Audit Logging Service
 * Logs state-changing actions performed by staff members
 */

import pool from '../db';
import { logger } from '../utils/logger';

interface AuditLogPayload {
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetDescription?: string;
  ipAddress?: string;
  userAgent?: string | string[];
}

export async function logAuditEvent(payload: AuditLogPayload): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO Audit_Log (
        user_id, user_name, user_role, action,
        target_type, target_id, target_description,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        payload.userId,
        payload.userName,
        payload.userRole,
        payload.action,
        payload.targetType || null,
        payload.targetId || null,
        payload.targetDescription || null,
        payload.ipAddress || null,
        Array.isArray(payload.userAgent) ? payload.userAgent.join(', ') : payload.userAgent || null,
      ]
    );
  } catch (error) {
    logger.error({ err: error }, 'failed to write audit log entry');
  }
}
