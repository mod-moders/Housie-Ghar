/**
 * Authentication Controller
 */

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db';
import { env } from '../../config/env';
import { CONSTANTS } from '../../config/constants';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit.service';
import { changeStaffPassword, MIN_PASSWORD_LENGTH } from './auth.service';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  try {
    // 1. Fetch user
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.password_hash, u.temp_password_required, u.status,
              u.role_id, u.current_balance, u.is_cfo, u.town, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
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

    // 2. Verify password — a malformed stored hash must fail closed
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch (e) {
      logger.warn({ userId: user.user_id }, 'stored password hash is not a valid bcrypt hash');
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
    logger.error({ err: error }, 'login error');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * POST /api/auth/change-password
 * Self-service password change for staff. Clearing temp_password_required is
 * what releases a first-login account from the middleware gate.
 */
export async function changePassword(req: any, res: Response): Promise<void> {
  const { current_password, new_password } = req.body ?? {};

  if (!current_password || !new_password) {
    res.status(400).json({ message: 'current_password and new_password are required' });
    return;
  }

  try {
    const result = await changeStaffPassword(pool, {
      userId: req.user.userId,
      currentPassword: current_password,
      newPassword: new_password,
    });

    if (!result.ok) {
      switch (result.reason) {
        case 'too_short':
          res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        case 'unchanged':
          res.status(400).json({ message: 'New password must be different from the current one' });
          return;
        case 'wrong_password':
          res.status(401).json({ message: 'Current password is incorrect' });
          return;
        case 'not_found':
          res.status(404).json({ message: 'User not found' });
          return;
      }
    }

    await logAuditEvent({
      userId: req.user.userId,
      userName: req.user.fullName,
      userRole: req.user.roleName,
      action: 'CHANGE_PASSWORD',
      targetType: 'User',
      targetId: req.user.userId,
      targetDescription: 'Changed own password',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Password updated', temp_password_required: false });
  } catch (error) {
    logger.error({ err: error }, 'change password error');
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
    logger.error({ err: error }, 'error fetching profile');
    res.status(500).json({ message: 'Internal server error' });
  }
}
