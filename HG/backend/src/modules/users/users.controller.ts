/**
 * Users Controller
 * Staff account management (Admin + Superadmin)
 */

import { Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { deriveTrust } from '../../utils/trust';
import { logger } from '../../utils/logger';

const VALID_ROLE_IDS = new Set([1, 2, 3, 4]);

/**
 * List all staff users with assigned game counts (Admin+)
 */
export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.upi_id, u.town, u.status,
              u.current_balance, u.last_login, u.role_id, u.is_cfo, r.role_name,
              (SELECT COUNT(*) FROM Scheduled_Games g WHERE g.operator_id = u.user_id) AS assigned_games_count,
              (SELECT COUNT(*) FROM Bookings b
               WHERE b.assigned_agent_id = u.user_id AND b.booking_status = 'Sold')::INTEGER AS sold_count
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       ORDER BY u.role_id ASC, u.created_at ASC`
    );

    res.json(
      result.rows.map((row) => ({
        user_id: row.user_id,
        full_name: row.full_name,
        role_name: row.role_name,
        role_id: row.role_id,
        is_cfo: row.is_cfo === true,
        email: row.email,
        phone: row.phone,
        upi_id: row.upi_id,
        town: row.town,
        status: row.status,
        current_balance: parseFloat(row.current_balance),
        assigned_games_count: parseInt(row.assigned_games_count, 10),
        trust: row.role_id === 4 ? deriveTrust(row.sold_count) : null,
        last_login: row.last_login,
      }))
    );
  } catch (error) {
    logger.error({ err: error }, 'error listing users');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Create a new staff account (Admin+)
 * Admins may create Operators and Agents; only a Superadmin may create Admins.
 */
export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { full_name, email, phone, upi_id, town, role_id, password } = req.body;
  const actor = req.user!;

  if (!full_name || !email || !role_id || !password) {
    res.status(400).json({ message: 'full_name, email, role_id and password are required' });
    return;
  }

  if (!VALID_ROLE_IDS.has(Number(role_id))) {
    res.status(400).json({ message: 'Invalid role_id' });
    return;
  }

  // Only a Superadmin may create Admins or other Superadmins
  if (Number(role_id) <= 2 && actor.roleName !== 'Superadmin') {
    res.status(403).json({ message: 'Only a Superadmin can create Admin or Superadmin accounts' });
    return;
  }

  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO Users (role_id, full_name, email, phone, upi_id, town, password_hash, temp_password_required, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'Active', $8)
       RETURNING user_id, full_name, email, role_id, status`,
      [
        Number(role_id),
        full_name.trim(),
        email.toLowerCase().trim(),
        phone || null,
        upi_id || null,
        town || null,
        passwordHash,
        actor.userId,
      ]
    );

    const created = result.rows[0];

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'CREATE_USER',
      targetType: 'User',
      targetId: created.user_id,
      targetDescription: `Created ${full_name} (role_id ${role_id})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user_id: created.user_id, message: 'User created successfully' });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ message: 'A user with this email or phone already exists' });
      return;
    }
    logger.error({ err: error }, 'error creating user');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update / suspend / reactivate a staff account (Admin+)
 */
export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { full_name, phone, upi_id, town, status, password } = req.body;
  const actor = req.user!;

  if (status && !['Active', 'Suspended'].includes(status)) {
    res.status(400).json({ message: "status must be 'Active' or 'Suspended'" });
    return;
  }

  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    res.status(400).json({ message: 'Password must be at least 8 characters' });
    return;
  }

  // Password resets are for other people's forgotten passwords; changing your
  // own goes through /api/auth/change-password (which clears the temp flag).
  if (password && id === actor.userId) {
    res.status(400).json({ message: 'Use change-password to update your own password' });
    return;
  }

  // Guard: a user cannot suspend their own account
  if (status === 'Suspended' && id === actor.userId) {
    res.status(400).json({ message: 'You cannot suspend your own account' });
    return;
  }

  try {
    const existing = await pool.query(
      `SELECT u.user_id, u.full_name, u.role_id, r.role_name
       FROM Users u JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const target = existing.rows[0];

    // An Admin may not modify a Superadmin or another Admin
    if (actor.roleName === 'Admin' && target.role_id <= 2) {
      res.status(403).json({ message: 'Admins cannot modify Admin or Superadmin accounts' });
      return;
    }

    // A reset password is always temporary: the staffer must set their own on
    // next login (enforced by the auth middleware).
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    const result = await pool.query(
      `UPDATE Users
       SET full_name = COALESCE($1, full_name),
           phone     = COALESCE($2, phone),
           upi_id    = COALESCE($3, upi_id),
           town      = COALESCE($4, town),
           status    = COALESCE($5, status),
           password_hash = COALESCE($6, password_hash),
           temp_password_required = (CASE WHEN $6::TEXT IS NOT NULL THEN TRUE ELSE temp_password_required END)
       WHERE user_id = $7
       RETURNING user_id, full_name, status`,
      [full_name ?? null, phone ?? null, upi_id ?? null, town ?? null, status ?? null, passwordHash, id]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: passwordHash
        ? 'RESET_USER_PASSWORD'
        : status
          ? `SET_USER_STATUS_${status.toUpperCase()}`
          : 'UPDATE_USER',
      targetType: 'User',
      targetId: String(id),
      targetDescription: passwordHash
        ? `Reset password for ${target.full_name} (temp until next login)`
        : `Updated ${target.full_name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ user: result.rows[0], message: 'User updated successfully' });
  } catch (error) {
    logger.error({ err: error }, 'error updating user');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Designate (or revoke) an Admin as the Financial Officer (Superadmin only).
 * Single-FO model: designating one Admin clears the flag from every other.
 */
export async function designateCfo(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const actor = req.user!;
  const makeCfo = req.body?.is_cfo !== false; // default: designate

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query(
      `SELECT user_id, full_name, role_id FROM Users WHERE user_id = $1 FOR UPDATE`,
      [id]
    );
    if (target.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (target.rows[0].role_id !== 2) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Only an Admin can be designated as Financial Officer' });
      return;
    }

    if (makeCfo) {
      await client.query(`UPDATE Users SET is_cfo = FALSE WHERE is_cfo = TRUE AND user_id <> $1`, [id]);
      await client.query(`UPDATE Users SET is_cfo = TRUE WHERE user_id = $1`, [id]);
    } else {
      await client.query(`UPDATE Users SET is_cfo = FALSE WHERE user_id = $1`, [id]);
    }

    await client.query('COMMIT');

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: makeCfo ? 'DESIGNATE_CFO' : 'REVOKE_CFO',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `${makeCfo ? 'Designated' : 'Revoked'} ${target.rows[0].full_name} as Financial Officer`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: makeCfo
        ? `${target.rows[0].full_name} is now the Financial Officer`
        : `${target.rows[0].full_name} is no longer the Financial Officer`,
      is_cfo: makeCfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'error designating CFO');
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
