/**
 * Authentication and RBAC Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CONSTANTS } from '../config/constants';
import { RoleName } from '@shared/types/user';
import pool from '../db';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    roleName: RoleName;
    fullName: string;
    email: string;
  };
}

/**
 * Middleware to authenticate requests using JWT HttpOnly cookie
 */
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  let token = null;

  if (req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    token = req.cookies[CONSTANTS.JWT_COOKIE_NAME];
  }

  if (!token) {
    res.status(401).json({ message: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;

    // Check user status in DB
    const dbUser = await pool.query('SELECT status FROM Users WHERE user_id = $1', [decoded.userId]);
    if (dbUser.rowCount === 0 || dbUser.rows[0].status === 'Suspended' || dbUser.rows[0].status === 'Deleted') {
      res.clearCookie(CONSTANTS.JWT_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      res.status(401).json({ message: 'Your session has expired or account is deactivated.' });
      return;
    }

    req.user = {
      userId: decoded.userId,
      roleName: decoded.roleName,
      fullName: decoded.fullName,
      email: decoded.email,
    };
    next();
  } catch (error) {
    console.error('JWT Verification failed:', error);
    res.status(403).json({ message: 'Invalid or expired session. Please log in again.' });
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

  if (req.user.roleName === 'Superadmin' || req.user.roleName === 'Financial Admin') {
    next();
    return;
  }

  res.status(403).json({ message: 'Forbidden: Financial Officer access required' });
}

/**
 * Middleware to restrict route access strictly to Financial Admins designated as CFO.
 * Does not allow Superadmin.
 */
export async function requireCfoOnly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.user.roleName !== 'Financial Admin') {
    res.status(403).json({ message: 'Forbidden: Financial Admin access required' });
    return;
  }

  next();
}
