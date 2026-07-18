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
      `SELECT u.user_id, u.full_name, u.email, u.username, u.password_hash, u.temp_password_required, u.status,
              u.role_id, u.current_balance, u.is_cfo, u.town, u.receive_overflow, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.email = $1 OR u.username = $1 OR u.username = $2 OR (r.role_name = 'Superadmin' AND $1 = 'superadmin@housieghar.in')`,
      [loginEmail, email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      // Diagnostic only — the client still sees the generic message below. This
      // distinguishes "no such account" from a password mismatch in the logs.
      console.warn(`[login] 401 no-account-found identifier="${loginEmail}"`);
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
    const hashPresent = typeof user.password_hash === 'string' && user.password_hash.length > 0;
    const hashLooksBcrypt = hashPresent && /^\$2[aby]\$/.test(user.password_hash) && user.password_hash.length === 60;
    let passwordMatch = false;
    try {
      if (hashPresent) {
        passwordMatch = await bcrypt.compare(password, user.password_hash);
      }
    } catch (e) {
      console.error('Password verification error for user', user.user_id, e);
      passwordMatch = false;
    }

    if (!passwordMatch) {
      // Diagnostic only (never logs the password). `hashLooksBcrypt=false` means the
      // account is locked out by a malformed/stale hash and needs an admin reset;
      // `hashLooksBcrypt=true` means the account is fine and the typed password is wrong.
      console.warn(
        `[login] 401 password-mismatch user_id=${user.user_id} email="${user.email}" ` +
        `username="${user.username}" hashPresent=${hashPresent} hashLooksBcrypt=${hashLooksBcrypt}`
      );
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
      username: user.username,
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
        username: user.username,
        current_balance: parseFloat(user.current_balance),
        temp_password_required: user.temp_password_required,
        is_cfo: user.is_cfo === true,
        town: user.town ?? null,
        receive_overflow: user.receive_overflow === true,
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
      `SELECT u.user_id, u.full_name, u.email, u.username, u.phone, u.upi_id, u.town, u.status,
              u.role_id, u.current_balance, u.temp_password_required, u.is_cfo, u.receive_overflow, u.nationality, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [req.user.userId]
    );

    if (result.rowCount === 0 || result.rows[0].status === 'Deleted' || result.rows[0].status === 'Suspended') {
      res.clearCookie(CONSTANTS.JWT_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      res.status(401).json({ message: 'Account is deactivated, deleted, or suspended.' });
      return;
    }

    const u = result.rows[0];
    res.json({
      user: {
        user_id: u.user_id,
        full_name: u.full_name,
        email: u.email,
        username: u.username,
        phone: u.phone,
        upi_id: u.upi_id,
        town: u.town,
        status: u.status,
        role_id: u.role_id,
        role_name: u.role_name,
        current_balance: parseFloat(u.current_balance),
        temp_password_required: u.temp_password_required,
        is_cfo: u.is_cfo === true,
        receive_overflow: u.receive_overflow === true,
        nationality: u.nationality,
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
  const { full_name, phone, upi_id, email, receive_overflow, nationality } = req.body;
  const actor = req.user!;

  try {
    const currentRes = await pool.query(
      `SELECT full_name, phone, upi_id, email, receive_overflow, nationality FROM Users WHERE user_id = $1`,
      [actor.userId]
    );

    if (currentRes.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const current = currentRes.rows[0];

    const targetFullName = typeof full_name !== 'undefined' ? full_name : current.full_name;
    const targetPhone = typeof phone !== 'undefined' ? phone : current.phone;
    const targetUpiId = typeof upi_id !== 'undefined' ? upi_id : current.upi_id;
    const targetEmail = typeof email !== 'undefined' ? (email && email.trim() ? email.toLowerCase().trim() : null) : current.email;
    const targetReceiveOverflow = typeof receive_overflow !== 'undefined' ? receive_overflow : current.receive_overflow;
    const targetNationality = typeof nationality !== 'undefined' ? (nationality && nationality.trim() ? nationality.trim() : null) : current.nationality;

    if (typeof targetFullName === 'string' && !targetFullName.trim()) {
      res.status(400).json({ message: 'Full name is required' });
      return;
    }
    if (typeof targetPhone === 'string' && !targetPhone.trim()) {
      res.status(400).json({ message: 'WhatsApp number is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE Users
       SET full_name = $1,
           phone     = $2,
           upi_id    = $3,
           email     = $4,
           receive_overflow = $5,
           nationality = $6
       WHERE user_id = $7
       RETURNING user_id, full_name, email, username, phone, upi_id, status, role_id, receive_overflow, nationality`,
      [
        typeof targetFullName === 'string' ? targetFullName.trim() : targetFullName,
        typeof targetPhone === 'string' ? targetPhone.trim() : targetPhone,
        typeof targetUpiId === 'string' ? targetUpiId.trim() : targetUpiId,
        targetEmail,
        targetReceiveOverflow,
        targetNationality,
        actor.userId
      ]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: result.rows[0].full_name,
      userRole: actor.roleName,
      action: 'UPDATE_OWN_PROFILE',
      targetType: 'User',
      targetId: actor.userId,
      targetDescription: 'Updated own profile',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      user: {
        ...result.rows[0],
        role_name: actor.roleName
      },
      message: 'Profile updated successfully'
    });
  } catch (error: any) {
    if (error.code === '23505') {
      const detail = error.detail || '';
      if (detail.includes('email')) {
        res.status(409).json({ message: 'That email address is already in use by another account' });
      } else {
        res.status(409).json({ message: 'That WhatsApp number is already in use by another account' });
      }
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
