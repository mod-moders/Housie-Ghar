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
import bcrypt from 'bcrypt';
import pool from '../../db';
import { env } from '../../config/env';
import { listPlayerWins } from '../../services/settlements.service';
import { buildWaLink } from '../../utils/waLink';
import { buildCollectMessage } from '../settlements/payoutMessages';
import { logAuditEvent } from '../../services/audit.service';
import { logger } from '../../utils/logger';
import { BCRYPT_WORK_FACTOR } from '../auth/auth.service';

export const PLAYER_COOKIE_NAME = 'hg_player_token';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Players log in with just their username by default; this is the minimum
// length for the optional real password they can layer on top in Profile.
const MIN_PLAYER_PASSWORD_LENGTH = 6;

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
    phone: row.phone ?? null,
    email: row.email ?? null,
    sound_enabled: row.sound_enabled !== false,
    has_password: row.password_hash != null,
  };
}

/**
 * POST /api/players/login
 * Register-or-login. New username → requires full_name + date_of_birth and
 * creates the account (password = username). Existing username → the entered
 * username is checked against the stored password, which logs the player in
 * — unless the player has opted into a real password from Profile, in which
 * case that takes over and a bare username is rejected with `password_required`.
 */
export async function playerLogin(req: Request, res: Response): Promise<void> {
  const { username, full_name, date_of_birth, password } = req.body ?? {};

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
      `SELECT player_id, username, password, password_hash, full_name, date_of_birth, phone, email, sound_enabled, status
       FROM Player_Logins WHERE username = $1`,
      [uname]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const player = existing.rows[0];
      if (player.password_hash) {
        if (!password || typeof password !== 'string') {
          res.status(401).json({ message: 'Password required', password_required: true });
          return;
        }
        const match = await bcrypt.compare(password, player.password_hash);
        if (!match) {
          res.status(401).json({ message: 'Invalid password' });
          return;
        }
      } else if (player.password !== uname) {
        // The username doubles as the password for accounts that haven't
        // set a real one yet.
        res.status(401).json({ message: 'Invalid username' });
        return;
      }
      if (player.status === 'Suspended') {
        res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
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
      `SELECT player_id, username, full_name, date_of_birth, phone, email, sound_enabled, password_hash, status
       FROM Player_Logins WHERE player_id = $1`,
      [decoded.playerId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    if (result.rows[0].status === 'Suspended') {
      res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
      return;
    }
    res.json({ player: toPlayerPayload(result.rows[0]) });
  } catch {
    res.status(403).json({ message: 'Invalid or expired session' });
  }
}

/**
 * PATCH /api/players/me — self-service profile edit: full name, phone,
 * email, the caller/beep sound preference, and an optional real password
 * that upgrades the account beyond username-only login (set via `password`,
 * removed via `remove_password: true`, reverting to username-only).
 */
export async function updatePlayerProfile(req: Request, res: Response): Promise<void> {
  const playerId = getPlayerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ message: 'Not logged in' });
    return;
  }
  const { full_name, phone, email, sound_enabled, password, remove_password } = req.body ?? {};

  if (full_name !== undefined && (typeof full_name !== 'string' || full_name.trim().length < 2)) {
    res.status(400).json({ message: 'Full name looks too short' });
    return;
  }
  if (email !== undefined && email !== null && email !== '' && !EMAIL_RE.test(String(email).trim())) {
    res.status(400).json({ message: 'Enter a valid email address' });
    return;
  }

  try {
    let shouldUpdatePassword = false;
    let passwordHash: string | null = null;
    if (remove_password === true) {
      shouldUpdatePassword = true;
      passwordHash = null;
    } else if (typeof password === 'string' && password.length > 0) {
      if (password.length < MIN_PLAYER_PASSWORD_LENGTH) {
        res.status(400).json({ message: `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters` });
        return;
      }
      shouldUpdatePassword = true;
      passwordHash = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
    }

    // phone/email use an explicit "was this key present" flag rather than
    // COALESCE, so a partial PATCH (e.g. just a password change) can't wipe
    // them out the way a plain `phone = $2` assignment would when the caller
    // omits the field entirely.
    const result = await pool.query(
      `UPDATE Player_Logins
       SET full_name = COALESCE($1, full_name),
           phone = CASE WHEN $2 THEN $3 ELSE phone END,
           email = CASE WHEN $4 THEN $5 ELSE email END,
           sound_enabled = COALESCE($6, sound_enabled),
           password_hash = CASE WHEN $7 THEN $8 ELSE password_hash END
       WHERE player_id = $9
       RETURNING player_id, username, full_name, date_of_birth, phone, email, sound_enabled, password_hash`,
      [
        typeof full_name === 'string' ? full_name.trim().slice(0, 100) : null,
        phone !== undefined,
        typeof phone === 'string' ? phone.trim().slice(0, 20) || null : null,
        email !== undefined,
        typeof email === 'string' ? email.trim().slice(0, 255) || null : null,
        typeof sound_enabled === 'boolean' ? sound_enabled : null,
        shouldUpdatePassword,
        passwordHash,
        playerId,
      ]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    res.json({ player: toPlayerPayload(result.rows[0]) });
  } catch (error) {
    logger.error({ err: error }, 'error updating player profile');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * GET /api/players/me/stats — the logged-in player's lifetime engagement and
 * winnings, computed from Bookings.player_id and the Prize_Settlements
 * ledger (every settlement row is a genuine claimed win).
 */
export async function getMyPlayerStats(req: Request, res: Response): Promise<void> {
  const playerId = getPlayerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ message: 'Not logged in' });
    return;
  }
  try {
    const memberRes = await pool.query(`SELECT created_at FROM Player_Logins WHERE player_id = $1`, [playerId]);
    if (memberRes.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }

    const bookingsRes = await pool.query(
      `SELECT
         COUNT(DISTINCT game_id)::INTEGER AS games_played,
         COALESCE(SUM(array_length(ticket_ids, 1)), 0)::INTEGER AS tickets_bought,
         COALESCE(SUM(total_amount), 0)::FLOAT AS total_expenditure
       FROM Bookings
       WHERE player_id = $1 AND booking_status = 'Sold'`,
      [playerId]
    );
    const bStats = bookingsRes.rows[0];

    const winsRes = await pool.query(
      `SELECT
         COUNT(*)::INTEGER AS total_wins,
         COUNT(*) FILTER (WHERE pattern_name ILIKE '%Full House%')::INTEGER AS full_house_wins,
         COUNT(*) FILTER (WHERE pattern_name ILIKE '%Line%')::INTEGER AS line_wins,
         COUNT(*) FILTER (WHERE pattern_name NOT ILIKE '%Full House%' AND pattern_name NOT ILIKE '%Line%')::INTEGER AS other_wins,
         COALESCE(SUM(amount), 0)::FLOAT AS amount_won
       FROM Prize_Settlements
       WHERE player_id = $1`,
      [playerId]
    );
    const wStats = winsRes.rows[0];

    const highestGameRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::FLOAT AS game_total
       FROM Prize_Settlements
       WHERE player_id = $1
       GROUP BY game_id
       ORDER BY game_total DESC
       LIMIT 1`,
      [playerId]
    );
    const highestAmountSingleGame = (highestGameRes.rowCount ?? 0) > 0 ? highestGameRes.rows[0].game_total : 0;

    const luckiestRes = await pool.query(
      `SELECT ticket_number
       FROM Prize_Settlements
       WHERE player_id = $1
       GROUP BY ticket_number
       ORDER BY COUNT(*) DESC, ticket_number ASC
       LIMIT 1`,
      [playerId]
    );
    const luckiestTicketNumber = (luckiestRes.rowCount ?? 0) > 0 ? luckiestRes.rows[0].ticket_number : null;

    const gamesRes = await pool.query(
      `SELECT g.game_id,
         EXISTS(
           SELECT 1 FROM Prize_Settlements ps WHERE ps.game_id = g.game_id AND ps.player_id = $1
         ) AS won
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       WHERE b.player_id = $1 AND b.booking_status = 'Sold'
       GROUP BY g.game_id, g.scheduled_at
       ORDER BY g.scheduled_at ASC`,
      [playerId]
    );

    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;
    for (const row of gamesRes.rows) {
      if (row.won) {
        currentWinStreak++;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        currentLossStreak = 0;
      } else {
        currentLossStreak++;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        currentWinStreak = 0;
      }
    }

    res.json({
      member_since: memberRes.rows[0].created_at,
      games_played: bStats.games_played,
      tickets_bought: bStats.tickets_bought,
      total_expenditure: bStats.total_expenditure,
      total_wins: wStats.total_wins,
      full_house_wins: wStats.full_house_wins,
      line_wins: wStats.line_wins,
      other_wins: wStats.other_wins,
      amount_won: wStats.amount_won,
      highest_amount_single_game: highestAmountSingleGame,
      luckiest_ticket_number: luckiestTicketNumber,
      longest_winning_run: maxWinStreak,
      unluckiest_run: maxLossStreak,
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching player stats');
    res.status(500).json({ message: 'Internal server error' });
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

/**
 * GET /api/players — staff (Superadmin/Admin): every player account with
 * engagement stats. Spend comes from Sold bookings stamped with player_id
 * (anonymous bookings are invisible here by design); winnings come from the
 * Prize_Settlements ledger.
 */
export async function getAllPlayers(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT
         p.player_id, p.username, p.full_name, p.date_of_birth, p.created_at, p.last_login, p.status,
         COUNT(DISTINCT b.game_id)::INTEGER AS games_played,
         COALESCE(SUM(array_length(b.ticket_ids, 1)), 0)::INTEGER AS tickets_bought,
         COALESCE(SUM(b.total_amount), 0)::FLOAT AS total_expenditure,
         (SELECT COUNT(*)::INTEGER FROM Prize_Settlements ps WHERE ps.player_id = p.player_id) AS total_wins,
         (SELECT COALESCE(SUM(ps.amount), 0)::FLOAT FROM Prize_Settlements ps WHERE ps.player_id = p.player_id) AS total_won
       FROM Player_Logins p
       LEFT JOIN Bookings b ON b.player_id = p.player_id AND b.booking_status = 'Sold'
       GROUP BY p.player_id
       ORDER BY p.created_at DESC`
    );
    res.json({ players: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'error fetching all players');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * PATCH /api/players/:player_id/status — staff (Superadmin/Admin): suspend or
 * reactivate a player. A suspended player can't log in and their live session
 * dies at the next /me check.
 */
export async function updatePlayerStatus(req: any, res: Response): Promise<void> {
  const player_id = req.params.player_id as string;
  const { status } = req.body ?? {};
  const actor = req.user!;

  if (status !== 'Active' && status !== 'Suspended') {
    res.status(400).json({ message: "status must be 'Active' or 'Suspended'" });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Player_Logins SET status = $1 WHERE player_id = $2
       RETURNING player_id, username, status`,
      [status, player_id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: status === 'Suspended' ? 'SUSPEND_PLAYER' : 'REACTIVATE_PLAYER',
      targetType: 'Player',
      targetId: player_id,
      targetDescription: `${status === 'Suspended' ? 'Suspended' : 'Reactivated'} player "${result.rows[0].username}"`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: `Player ${status === 'Suspended' ? 'suspended' : 'reactivated'}`, player: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'error updating player status');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * DELETE /api/players/:player_id — Superadmin only. Bookings and settlements
 * are history that must survive the account, so their player_id stamps are
 * NULLed (back to anonymous) before the login row is removed.
 */
export async function deletePlayer(req: any, res: Response): Promise<void> {
  const player_id = req.params.player_id as string;
  const actor = req.user!;

  try {
    const existing = await pool.query(
      `SELECT username FROM Player_Logins WHERE player_id = $1`,
      [player_id]
    );
    if (existing.rowCount === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    const username = existing.rows[0].username;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE Bookings SET player_id = NULL WHERE player_id = $1`, [player_id]);
      await client.query(`UPDATE Prize_Settlements SET player_id = NULL WHERE player_id = $1`, [player_id]);
      await client.query(`DELETE FROM Player_Logins WHERE player_id = $1`, [player_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'DELETE_PLAYER',
      targetType: 'Player',
      targetId: player_id,
      targetDescription: `Deleted player account "${username}"`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Player account deleted', deleted_player_id: player_id });
  } catch (error) {
    logger.error({ err: error }, 'error deleting player');
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
