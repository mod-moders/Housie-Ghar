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
import { listPlayerWins } from '../../services/settlements.service';
import { buildWaLink } from '../../utils/waLink';
import { buildCollectMessage } from '../settlements/payoutMessages';
import { logger } from '../../utils/logger';

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
    logger.error({ err: error }, 'player login error');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Decode the player session cookie and return the player_id, or null when no
 * valid session is present. Used by routes where a player session is optional
 * (e.g. anonymous booking still works) as well as player-only endpoints.
 */
export function getPlayerIdFromRequest(req: Request): string | null {
  const token = req.cookies?.[PLAYER_COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
    return decoded.playerId ?? null;
  } catch {
    return null;
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

/**
 * GET /api/players/me/tickets?game_id=...
 * Tickets the logged-in player has booked — optionally scoped to one game.
 * Resolved from Bookings.ticket_ids (which persists after a sale clears the
 * ticket's locked_by_booking link), so it covers both locked and sold tickets.
 */
export async function getMyTickets(req: Request, res: Response): Promise<void> {
  const playerId = getPlayerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ message: 'Not logged in' });
    return;
  }
  const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : null;
  try {
    const params: any[] = [playerId];
    let gameFilter = '';
    if (gameId) {
      params.push(gameId);
      gameFilter = 'AND b.game_id = $2';
    }
    const result = await pool.query(
      `SELECT t.ticket_id, t.ticket_number, t.grid_data, t.status, t.game_id
       FROM Tickets t
       WHERE t.ticket_id IN (
         SELECT unnest(b.ticket_ids) FROM Bookings b
         WHERE b.player_id = $1
           AND b.booking_status IN ('Locked', 'Sold')
           ${gameFilter}
       )
       ${gameId ? 'AND t.game_id = $2' : ''}
       ORDER BY t.game_id, t.ticket_number`,
      params
    );
    res.json({
      tickets: result.rows.map((row) => ({
        ticket_id: row.ticket_id,
        ticket_number: row.ticket_number,
        grid_data: row.grid_data,
        status: row.status,
        game_id: row.game_id,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching player tickets');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * GET /api/players/me/wins?game_id=...
 * The logged-in player's prize wins — optionally scoped to one game. Each win
 * carries a prefilled WhatsApp link to the bookie who sold the ticket: prize
 * money is collected from that bookie in person, the same channel the ticket
 * was paid through. The app never moves the cash itself.
 */
export async function getMyWins(req: Request, res: Response): Promise<void> {
  const playerId = getPlayerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ message: 'Not logged in' });
    return;
  }
  const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : undefined;
  try {
    const rows = await listPlayerWins(pool, playerId, gameId);
    res.json({
      wins: rows.map((r) => {
        const amount = Number(r.amount);
        const whatsapp_link = r.agent_phone
          ? buildWaLink(
              r.agent_phone,
              buildCollectMessage({
                winnerName: r.winner_housie_name ?? 'a winner',
                agentName: r.agent_name,
                patternName: r.pattern_name,
                amount,
                ticketNumber: r.ticket_number,
                gameTitle: r.game_title,
              })
            )
          : null;
        return {
          settlement_id: r.settlement_id,
          game_id: r.game_id,
          game_title: r.game_title,
          pattern_name: r.pattern_name,
          ticket_number: r.ticket_number,
          amount,
          agent_name: r.agent_name,
          agent_town: r.agent_town,
          whatsapp_link,
          created_at: r.created_at,
        };
      }),
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching player wins');
    res.status(500).json({ message: 'Internal server error' });
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
