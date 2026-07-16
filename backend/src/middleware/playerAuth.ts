import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../db';

export interface AuthenticatedPlayerRequest extends Request {
  player?: {
    playerId: string;
    fullName: string;
    housieName: string;
  };
}

export async function authenticatePlayer(req: AuthenticatedPlayerRequest, res: Response, next: NextFunction): Promise<void> {
  let token = null;

  if (req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    token = req.cookies['hg_player_token'];
  }

  if (!token) {
    res.status(401).json({ message: 'Player authentication required. Please sign up or log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;

    // Check player status in DB
    const dbPlayer = await pool.query('SELECT status FROM Players WHERE player_id = $1', [decoded.playerId]);
    if (dbPlayer.rowCount === 0 || dbPlayer.rows[0].status === 'Suspended') {
      res.clearCookie('hg_player_token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      res.status(401).json({ message: 'Your session has expired or account is deactivated.' });
      return;
    }

    req.player = {
      playerId: decoded.playerId,
      fullName: decoded.fullName,
      housieName: decoded.housieName,
    };
    next();
  } catch (error) {
    console.error('Player JWT Verification failed:', error);
    res.status(403).json({ message: 'Invalid or expired player session. Please log in again.' });
  }
}
