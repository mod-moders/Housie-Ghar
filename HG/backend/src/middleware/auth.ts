/**
 * Authentication and RBAC Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CONSTANTS } from '../config/constants';
import { RoleName } from '@shared/types/user';

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
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies[CONSTANTS.JWT_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ message: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
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
