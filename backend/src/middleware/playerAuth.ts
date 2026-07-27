import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import {
  extractPlayerToken,
  resolvePlayerIdentity,
  PlayerIdentity,
} from '../utils/playerIdentity';

export interface AuthenticatedPlayerRequest extends Request {
  player?: PlayerIdentity;
}

/**
 * Require a signed-in player. `req.player` carries the name as it is stored in
 * the database right now, not the one baked into the token — see
 * utils/playerIdentity.ts for why that distinction is load-bearing.
 */
export async function authenticatePlayer(
  req: AuthenticatedPlayerRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractPlayerToken(req);

  if (!token) {
    res.status(401).json({ message: 'Player authentication required. Please sign up or log in.' });
    return;
  }

  let identity: PlayerIdentity | null;
  try {
    identity = await resolvePlayerIdentity(req);
  } catch (error) {
    console.error('Player identity lookup failed:', error);
    res.status(500).json({ message: 'Internal server error' });
    return;
  }

  if (!identity) {
    // Deliberately one message for "bad signature", "deleted account" and
    // "suspended": a caller probing with a forged token learns nothing about
    // which accounts exist.
    res.clearCookie('hg_player_token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(401).json({ message: 'Your session has expired or account is deactivated.' });
    return;
  }

  req.player = identity;
  next();
}
