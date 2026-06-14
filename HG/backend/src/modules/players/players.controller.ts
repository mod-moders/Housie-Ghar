/**
 * Player Authentication Controller
 *
 * Public players register/login with a single card: username, full name,
 * date of birth. Per product spec, the username is stored as the player's
 * password — entering an existing username logs the player back in.
 * Staff credentials live in Users; players live in Player_Logins.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../../db';
import { env } from '../../config/env';

export const PLAYER_COOKIE_NAME = 'hg_player_token';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,18}$/;

function setPlayerCookie(res: Response, payload: object): void {
  const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256' as any,
    expiresIn: '30d' as any,
  });
  res.cookie(PLAYER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function toPlayerPayload(row: any) {
  return {
    player_id: row.player_id,
    username: row.username,
    full_name: row.full_name,
    date_of_birth: row.date_of_birth,
  };
}

/**
 * POST /api/players/login
 * Register-or-login. New username → requires full_name + date_of_birth and
 * creates the account (password = username). Existing username → the entered
 * username is checked against the stored password, which logs the player in.
 */
export async function playerLogin(req: Request, res: Response): Promise<void> {
  const { username, full_name, date_of_birth } = req.body ?? {};

  if (!username || typeof username !== 'string') {
    res.status(400).json({ message: 'Username is required' });
    return;
  }
  const uname = username.trim().toLowerCase();
  if (!USERNAME_RE.test(uname)) {
    res.status(400).json({ message: 'Username must be 3–18 letters, numbers or underscores (no spaces)' });
    return;
  }

  try {
    const existing = await pool.query(
      `SELECT player_id, username, password, full_name, date_of_birth
       FROM Player_Logins WHERE username = $1`,
      [uname]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const player = existing.rows[0];
      // The username doubles as the password for returning players.
      if (player.password !== uname) {
        res.status(401).json({ message: 'Invalid username' });
        return;
      }
      await pool.query('UPDATE Player_Logins SET last_login = NOW() WHERE player_id = $1', [player.player_id]);
      setPlayerCookie(res, { playerId: player.player_id, username: player.username });
      res.json({ player: toPlayerPayload(player), returning: true });
      return;
    }

    // New player — full name and date of birth are required to register.
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      res.status(400).json({ message: 'Full name is required' });
      return;
    }
    if (!date_of_birth || isNaN(Date.parse(date_of_birth))) {
      res.status(400).json({ message: 'A valid date of birth is required' });
      return;
    }
    if (new Date(date_of_birth) >= new Date()) {
      res.status(400).json({ message: 'Date of birth must be in the past' });
      return;
    }

    const created = await pool.query(
      `INSERT INTO Player_Logins (username, password, full_name, date_of_birth)
       VALUES ($1, $1, $2, $3)
       RETURNING player_id, username, full_name, date_of_birth`,
      [uname, full_name.trim().slice(0, 100), date_of_birth]
    );
    const player = created.rows[0];
    setPlayerCookie(res, { playerId: player.player_id, username: player.username });
    res.status(201).json({ player: toPlayerPayload(player), returning: false });
  } catch (error) {
    console.error('Player login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/** GET /api/players/me — current player from the hg_player_token cookie. */
export async function getCurrentPlayer(req: Request, res: Response): Promise<void> {
  const token = req.cookies[PLAYER_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ message: 'Not logged in' });
    return;
  }
  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
    const result = await pool.query(
      `SELECT player_id, username, full_name, date_of_birth
       FROM Player_Logins WHERE player_id = $1`,
      [decoded.playerId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    res.json({ player: toPlayerPayload(result.rows[0]) });
  } catch {
    res.status(403).json({ message: 'Invalid or expired session' });
  }
}

/** POST /api/players/logout */
export function playerLogout(_req: Request, res: Response): void {
  res.clearCookie(PLAYER_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out' });
}
