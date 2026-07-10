import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthenticatedPlayerRequest extends Request {
  player?: {
    playerId: string;
    fullName: string;
    housieName: string;
  };
}

export function authenticatePlayer(req: AuthenticatedPlayerRequest, res: Response, next: NextFunction): void {
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
