/**
 * Users Controller
 * Staff account management (Admin + Superadmin)
 */

import { Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';

const VALID_ROLE_IDS = new Set([1, 2, 3, 4]);

/**
 * List all staff users with assigned game counts (Admin+)
 */
export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.upi_id, u.status,
              u.current_balance, u.last_login, r.role_name,
              (SELECT COUNT(*) FROM Scheduled_Games g WHERE g.operator_id = u.user_id) AS assigned_games_count
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       ORDER BY u.role_id ASC, u.created_at ASC`
    );

    res.json(
      result.rows.map((row) => ({
        user_id: row.user_id,
        full_name: row.full_name,
        role_name: row.role_name,
        email: row.email,
        phone: row.phone,
        upi_id: row.upi_id,
        status: row.status,
        current_balance: parseFloat(row.current_balance),
        assigned_games_count: parseInt(row.assigned_games_count, 10),
        last_login: row.last_login,
      }))
    );
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Create a new staff account (Admin+)
 * Admins may create Operators and Agents; only a Superadmin may create Admins.
 */
export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { full_name, email, phone, upi_id, role_id, password } = req.body;
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
      `INSERT INTO Users (role_id, full_name, email, phone, upi_id, password_hash, temp_password_required, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'Active', $7)
       RETURNING user_id, full_name, email, role_id, status`,
      [
        Number(role_id),
        full_name.trim(),
        email.toLowerCase().trim(),
        phone || null,
        upi_id || null,
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
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update / suspend / reactivate a staff account (Admin+)
 */
export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { full_name, phone, upi_id, status } = req.body;
  const actor = req.user!;

  if (status && !['Active', 'Suspended'].includes(status)) {
    res.status(400).json({ message: "status must be 'Active' or 'Suspended'" });
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

    const result = await pool.query(
      `UPDATE Users
       SET full_name = COALESCE($1, full_name),
           phone     = COALESCE($2, phone),
           upi_id    = COALESCE($3, upi_id),
           status    = COALESCE($4, status)
       WHERE user_id = $5
       RETURNING user_id, full_name, status`,
      [full_name ?? null, phone ?? null, upi_id ?? null, status ?? null, id]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: status ? `SET_USER_STATUS_${status.toUpperCase()}` : 'UPDATE_USER',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `Updated ${target.full_name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ user: result.rows[0], message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
