/**
 * Authentication Controller
 */

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db';
import { env } from '../../config/env';
import { CONSTANTS } from '../../config/constants';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  try {
    // 1. Fetch user
    let loginEmail = email.toLowerCase().trim();
    if (loginEmail === 'superadmin') {
      loginEmail = (process.env.SUPERADMIN_EMAIL || 'superadmin@housieghar.in').toLowerCase().trim();
    }

    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.password_hash, u.temp_password_required, u.status,
              u.role_id, u.current_balance, u.is_cfo, u.town, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.email = $1`,
      [loginEmail]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    if (user.status !== 'Active') {
      res.status(403).json({ message: 'Account is suspended. Contact admin.' });
      return;
    }

    // 2. Verify password. A malformed or absent hash MUST fail closed — never fall
    //    back to a substring match or a hardcoded password (that was an auth bypass).
    let passwordMatch = false;
    try {
      if (typeof user.password_hash === 'string' && user.password_hash.length > 0) {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
      }
    } catch (e) {
      console.error('Password verification error for user', user.user_id, e);
      passwordMatch = false;
    }

    if (!passwordMatch) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // 3. Update last login
    await pool.query('UPDATE Users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    // 4. Sign JWT
    const payload = {
      userId: user.user_id,
      roleName: user.role_name,
      fullName: user.full_name,
      email: user.email,
    };

    const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
      algorithm: 'RS256' as any,
      expiresIn: env.JWT_EXPIRY as any,
    });

    // 5. Store in HttpOnly cookie
    res.cookie(CONSTANTS.JWT_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        role_id: user.role_id,
        role_name: user.role_name,
        email: user.email,
        current_balance: parseFloat(user.current_balance),
        temp_password_required: user.temp_password_required,
        is_cfo: user.is_cfo === true,
        town: user.town ?? null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export function logout(req: Request, res: Response): void {
  res.clearCookie(CONSTANTS.JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Successfully logged out' });
}

export async function getCurrentProfile(req: any, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.upi_id, u.town, u.status,
              u.role_id, u.current_balance, u.temp_password_required, u.is_cfo, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [req.user.userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const u = result.rows[0];
    res.json({
      user: {
        user_id: u.user_id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        upi_id: u.upi_id,
        town: u.town,
        status: u.status,
        role_id: u.role_id,
        role_name: u.role_name,
        current_balance: parseFloat(u.current_balance),
        temp_password_required: u.temp_password_required,
        is_cfo: u.is_cfo === true,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Self-service profile update — any authenticated staff member (Superadmin, Admin,
 * Operator, Agent, Promoter) updating their own Full Name / WhatsApp number / UPI ID.
 * Unlike users.controller's updateUser (Admin+ only, targets another user), this
 * always acts on req.user.userId and cannot touch status/role.
 */
export async function updateOwnProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { full_name, phone, upi_id } = req.body;
  const actor = req.user!;

  if (typeof full_name !== 'string' || !full_name.trim()) {
    res.status(400).json({ message: 'Full name is required' });
    return;
  }
  if (typeof phone !== 'string' || !phone.trim()) {
    res.status(400).json({ message: 'WhatsApp number is required' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Users
       SET full_name = $1,
           phone     = $2,
           upi_id    = COALESCE($3, upi_id)
       WHERE user_id = $4
       RETURNING user_id, full_name, email, phone, upi_id, town, status, role_id`,
      [full_name.trim(), phone.trim(), upi_id?.trim() || null, actor.userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: full_name.trim(),
      userRole: actor.roleName,
      action: 'UPDATE_OWN_PROFILE',
      targetType: 'User',
      targetId: actor.userId,
      targetDescription: 'Updated own profile',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ user: result.rows[0], message: 'Profile updated successfully' });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ message: 'That WhatsApp number is already in use by another account' });
      return;
    }
    console.error('Error updating own profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Self-service password change — any authenticated staff member (Superadmin,
 * Admin, Operator, Agent, Promoter) setting a new password for their own account.
 * Requires the current password for verification and clears the
 * temp_password_required flag once a fresh password is set.
 */
export async function changeOwnPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { current_password, new_password } = req.body;
  const actor = req.user!;

  if (typeof current_password !== 'string' || typeof new_password !== 'string') {
    res.status(400).json({ message: 'Current and new password are required' });
    return;
  }
  if (new_password.length < 6) {
    res.status(400).json({ message: 'New password must be at least 6 characters long' });
    return;
  }
  if (new_password === current_password) {
    res.status(400).json({ message: 'New password must be different from your current password' });
    return;
  }

  try {
    // 1. Load the current hash
    const result = await pool.query(
      `SELECT password_hash FROM Users WHERE user_id = $1`,
      [actor.userId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // 2. Verify the current password
    const passwordMatch = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!passwordMatch) {
      res.status(401).json({ message: 'Your current password is incorrect' });
      return;
    }

    // 3. Hash and store the new password (work factor 12, matching the seed)
    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `UPDATE Users
       SET password_hash = $1, temp_password_required = FALSE
       WHERE user_id = $2`,
      [newHash, actor.userId]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'CHANGE_OWN_PASSWORD',
      targetType: 'User',
      targetId: actor.userId,
      targetDescription: 'Changed own account password',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing own password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
