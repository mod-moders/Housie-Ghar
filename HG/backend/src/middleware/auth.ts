/**
 * Authentication and RBAC Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CONSTANTS } from '../config/constants';
import { RoleName } from '@shared/types/user';
import pool from '../db';
import { logger } from '../utils/logger';
import { getStaffAccessFlags } from '../modules/auth/auth.service';

// Routes a staff member may still call while their temp password is unchanged:
// enough to see who they are and set a real password, nothing else.
const TEMP_PASSWORD_ALLOWED_PATHS = new Set([
  '/api/auth/change-password',
  '/api/auth/me',
  '/api/auth/logout',
]);

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    roleName: RoleName;
    fullName: string;
    email: string;
  };
}

/**
 * Middleware to authenticate requests using JWT HttpOnly cookie.
 *
 * Beyond verifying the JWT, it re-checks the account's live DB flags on every
 * request so that suspension and temp-password enforcement apply immediately —
 * a still-valid cookie must not outlive either. Staff with
 * temp_password_required=TRUE are locked to the change-password/me/logout
 * routes (403 with code TEMP_PASSWORD_REQUIRED) until they set a real one.
 */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies[CONSTANTS.JWT_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ message: 'Authentication required. Please log in.' });
    return;
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
  } catch (error) {
    logger.warn({ err: error }, 'JWT verification failed');
    res.status(403).json({ message: 'Invalid or expired session. Please log in again.' });
    return;
  }

  req.user = {
    userId: decoded.userId,
    roleName: decoded.roleName,
    fullName: decoded.fullName,
    email: decoded.email,
  };

  try {
    const flags = await getStaffAccessFlags(pool, decoded.userId);
    if (!flags) {
      res.status(403).json({ message: 'Account no longer exists. Please log in again.' });
      return;
    }
    if (flags.status !== 'Active') {
      res.status(403).json({ message: 'Account is suspended. Contact admin.' });
      return;
    }
    const path = (req.originalUrl ?? '').split('?')[0];
    if (flags.temp_password_required && !TEMP_PASSWORD_ALLOWED_PATHS.has(path)) {
      res.status(403).json({
        code: 'TEMP_PASSWORD_REQUIRED',
        message: 'You must set a new password before continuing.',
      });
      return;
    }
    next();
  } catch (error) {
    logger.error({ err: error }, 'auth flags check failed');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Middleware to enforce role-based access control (RBAC)
 */
export function requireRole(allowedRoles: RoleName[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      res.status(403).json({
        message: `Forbidden: Access restricted to ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to restrict a route to the Financial Officer hub: the Superadmin,
 * or an Admin the Superadmin has designated as CFO (Users.is_cfo). The flag is
 * checked against the DB (not the JWT) so designation takes effect immediately.
 */
export async function requireFinancialOfficer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.user.roleName === 'Superadmin') {
    next();
    return;
  }

  if (req.user.roleName !== 'Admin') {
    res.status(403).json({ message: 'Forbidden: Financial Officer access required' });
    return;
  }

  try {
    const result = await pool.query(`SELECT is_cfo FROM Users WHERE user_id = $1`, [req.user.userId]);
    if (result.rows[0]?.is_cfo === true) {
      next();
      return;
    }
    res.status(403).json({ message: 'Forbidden: you are not designated as Financial Officer' });
  } catch (error) {
    logger.error({ err: error }, 'requireFinancialOfficer check failed');
    res.status(500).json({ message: 'Internal server error' });
  }
}
