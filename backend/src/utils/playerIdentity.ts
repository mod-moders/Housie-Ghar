/**
 * Player identity resolution — one implementation for every route that needs to
 * know which player is calling.
 *
 * This used to be reimplemented inline at seven call sites (the player auth
 * middleware, lockTickets, getGames, getGameById, sendEmojiReaction, claimPrize
 * and claimAllPrizes). All seven read the housie name straight out of the JWT,
 * and that is the bug this module exists to close.
 *
 * `housie_name` is not a display string — it is the ownership KEY. Tickets are
 * resolved to their owner by `Tickets.owner_housie_name` and prizes by
 * `Prize_Pool.winner_housie_name`, both string-compared against it (there is no
 * player_id on Tickets — see the Ticket-name model in CLAUDE.md). Players may
 * change their name once, and tokens are signed with a 10-year expiry, so a
 * token minted before a rename keeps asserting the OLD name forever. Once that
 * name is free, a different player can register it — at which point the holder
 * of the stale token resolves to their tickets and their unclaimed prizes.
 *
 * So the name is always read live from the database, exactly like the staff
 * middleware already reads the live role rather than the one baked into its
 * token. Reading it live also means a suspension takes effect on the very next
 * request instead of surviving for the token's full lifetime.
 */

import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../db';

export interface PlayerIdentity {
  playerId: string;
  housieName: string;
  fullName: string;
}

/**
 * Pull a player token off the request: bearer header first, then the
 * per-game cookie, then the shared one. Header-first matters because a staff
 * member can be signed into both dashboards in the same browser.
 */
export function extractPlayerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (!cookies) return null;

  const gameId =
    req.params?.game_id ||
    req.params?.gameId ||
    (req.query?.game_id as string | undefined) ||
    (req.query?.gameId as string | undefined) ||
    req.body?.game_id ||
    req.body?.gameId;

  if (gameId) {
    const scoped = cookies[`hg_player_token_${gameId}`];
    if (scoped) return scoped;
  }

  return cookies['hg_player_token'] ?? null;
}

/** Verify a player token's signature. Returns its playerId, or null. */
export function verifyPlayerToken(token: string): { playerId: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as { playerId?: string };
    if (!decoded?.playerId) return null;
    return { playerId: decoded.playerId };
  } catch {
    return null;
  }
}

/**
 * Resolve the calling player from the request, reading their CURRENT name and
 * status from the database. Returns null when there is no token, the token is
 * invalid, the account no longer exists, or it is suspended.
 *
 * Never throws on a bad token — callers decide whether an unauthenticated
 * request is acceptable for what they are about to do.
 */
export async function resolvePlayerIdentity(req: Request): Promise<PlayerIdentity | null> {
  const token = extractPlayerToken(req);
  if (!token) return null;

  const verified = verifyPlayerToken(token);
  if (!verified) return null;

  const result = await pool.query(
    `SELECT player_id, housie_name, full_name, status FROM Players WHERE player_id = $1`,
    [verified.playerId]
  );

  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  if (row.status === 'Suspended') return null;
  if (!row.housie_name) return null;

  return {
    playerId: row.player_id,
    housieName: row.housie_name,
    fullName: row.full_name,
  };
}
