/**
 * Tickets Controller
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { normalizeHousieName, validateHousieName } from '../../utils/housieName';

/** Neutralise LIKE wildcards in user input. Pair with `ESCAPE '\'` in the query. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function getGameTicketsGrid(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;

  try {
    // 1. Check if game exists
    const gameRes = await pool.query('SELECT game_id FROM Scheduled_Games WHERE game_id = $1', [game_id]);
    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    // 2. Fetch all tickets for this game
    const ticketsRes = await pool.query(
      `SELECT ticket_id, ticket_number, status
       FROM Tickets
       WHERE game_id = $1
       ORDER BY ticket_number ASC`,
      [game_id]
    );

    const tickets = ticketsRes.rows.map((row) => ({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      status: row.status,
      is_selected: false,
    }));

    // 3. Count statuses
    let available = 0;
    let locked = 0;
    let sold = 0;

    tickets.forEach((t) => {
      if (t.status === 'Available') available++;
      else if (t.status === 'Locked') locked++;
      else if (t.status === 'Sold') sold++;
    });

    res.json({
      game_id,
      tickets,
      total: tickets.length,
      available,
      locked,
      sold,
    });
  } catch (error) {
    console.error('Error fetching tickets grid:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Fetch a single ticket's full grid layout (rows and columns)
 */
export async function getTicketGridData(req: Request, res: Response): Promise<void> {
  const { ticket_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name, display_name
       FROM Tickets
       WHERE ticket_id = $1`,
      [ticket_id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Ticket not found' });
      return;
    }

    const ticket = result.rows[0];
    res.json({
      ticket_id: ticket.ticket_id,
      ticket_number: ticket.ticket_number,
      grid_data: ticket.grid_data,
      status: ticket.status,
      owner_housie_name: ticket.owner_housie_name,
      display_name: ticket.display_name,
    });
  } catch (error) {
    console.error('Error fetching ticket grid data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Fetch tickets for a game owned by the logged-in player
 */
export async function getGameMyTickets(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;
  const player = req.player;

  if (!player) {
    res.status(401).json({ message: 'Player authentication required' });
    return;
  }

  try {
    // Matched case-insensitively, the same way normalizeHousieName() compares
    // names everywhere else (including updateTicketDisplayName below). This was
    // an exact `=` match, so a ticket booked as `monk` was invisible to the
    // account `Monk` — no Purchased Tickets card, no rename, no claim — while
    // the rename endpoint right below happily accepted it. Migration 047 made
    // names case-insensitively unique, so only legacy rows can differ.
    const result = await pool.query(
      `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name, display_name
       FROM Tickets
       WHERE game_id = $1 AND LOWER(TRIM(owner_housie_name)) = LOWER(TRIM($2)) AND status = 'Sold'
       ORDER BY ticket_number ASC`,
      [game_id, player.housieName]
    );

    res.json(result.rows.map(row => ({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      grid_data: row.grid_data,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
      display_name: row.display_name,
    })));
  } catch (error) {
    console.error('Error fetching player tickets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Search tickets by number or housie name within a specific game
 */
export async function searchGameTickets(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;
  const { query } = req.query;

  if (!query) {
    res.status(400).json({ message: 'Search query is required' });
    return;
  }

  const cleanQuery = String(query).trim();

  // `!isNaN(Number(q))` also accepted "Infinity", "1e999" and values past
  // int4 — each of which reached Postgres as a ticket_number comparison and
  // came back as a 500 on a PUBLIC, unauthenticated endpoint. Only a plain
  // in-range integer is a ticket number; everything else is a name search.
  const asInt = /^\d+$/.test(cleanQuery) ? Number(cleanQuery) : NaN;
  const isTicketNumber = Number.isSafeInteger(asInt) && asInt >= 0 && asInt <= 2147483647;

  // `%` and `_` are LIKE wildcards. Interpolated raw, a query of "%" matched
  // every sold ticket in the game and dumped every buyer's name — the whole
  // point of searching by name is that you already know the one you want.
  const likePattern = `%${escapeLike(cleanQuery)}%`;

  try {
    let result;
    if (isTicketNumber) {
      result = await pool.query(
        `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name, display_name
         FROM Tickets
         WHERE game_id = $1 AND (ticket_number = $2 OR LOWER(owner_housie_name) LIKE LOWER($3) ESCAPE '\\'
                                 OR LOWER(display_name) LIKE LOWER($3) ESCAPE '\\') AND status = 'Sold'
         ORDER BY ticket_number ASC`,
        [game_id, asInt, likePattern]
      );
    } else {
      result = await pool.query(
        `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name, display_name
         FROM Tickets
         WHERE game_id = $1 AND (LOWER(owner_housie_name) LIKE LOWER($2) ESCAPE '\\'
                                 OR LOWER(display_name) LIKE LOWER($2) ESCAPE '\\') AND status = 'Sold'
         ORDER BY ticket_number ASC`,
        [game_id, likePattern]
      );
    }

    res.json(result.rows.map(row => ({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      grid_data: row.grid_data,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
      display_name: row.display_name,
    })));
  } catch (error) {
    console.error('Error searching game tickets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Rename one of the caller's own purchased tickets.
 *
 * Writes `display_name` ONLY. `owner_housie_name` is the key every ownership
 * and prize query resolves a player by (getGameMyTickets above, claimAllPrizes,
 * the "total won" stats), so letting a player write to it would detach the
 * ticket from them and silently break their claims — see migration 050.
 *
 * Editing closes when the draw starts: from that point the board is being read
 * live by everyone and any prize already recorded has the old name baked into
 * `winner_housie_name`, which no rename here can rewrite.
 */
export async function updateTicketDisplayName(req: any, res: Response): Promise<void> {
  const { ticket_id } = req.params;
  const player = req.player;
  const { display_name } = req.body;

  if (!player) {
    res.status(401).json({ message: 'Player authentication required' });
    return;
  }

  // An empty string or null clears the nickname and falls back to the owner name.
  const clearing = display_name === null || display_name === undefined || String(display_name).trim() === '';

  if (!clearing) {
    // Same rules as every other name on the platform. The charset matters even
    // for a label: & ( ) and , are exactly what corrupts the winner-string
    // grammar, and a nickname is shown next to names that are parsed with it.
    const check = validateHousieName(display_name);
    if (!check.ok) {
      res.status(400).json({ message: check.error, alternatives: check.alternatives });
      return;
    }
  }

  try {
    const ticketRes = await pool.query(
      `SELECT t.ticket_id, t.status, t.owner_housie_name, g.game_status
       FROM Tickets t
       JOIN Scheduled_Games g ON g.game_id = t.game_id
       WHERE t.ticket_id = $1`,
      [ticket_id]
    );

    if (ticketRes.rowCount === 0) {
      res.status(404).json({ message: 'Ticket not found' });
      return;
    }

    const ticket = ticketRes.rows[0];

    // One message for "not yours" and "not sold yet" on purpose: a stranger
    // probing ticket ids should not learn which ones are sold and to whom.
    const isOwner =
      ticket.status === 'Sold' &&
      normalizeHousieName(ticket.owner_housie_name) === normalizeHousieName(player.housieName);
    if (!isOwner) {
      res.status(403).json({ message: 'You can only rename a ticket you have bought.' });
      return;
    }

    if (ticket.game_status !== 'Scheduled' && ticket.game_status !== 'Postponed') {
      res.status(409).json({ message: 'Ticket names are locked once the game starts.' });
      return;
    }

    const cleanName = clearing ? null : String(display_name).trim().replace(/\s+/g, ' ');

    const updated = await pool.query(
      `UPDATE Tickets SET display_name = $1 WHERE ticket_id = $2
       RETURNING ticket_id, ticket_number, grid_data, status, owner_housie_name, display_name`,
      [cleanName, ticket_id]
    );

    const row = updated.rows[0];
    res.json({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      grid_data: row.grid_data,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
      display_name: row.display_name,
    });
  } catch (error) {
    console.error('Error updating ticket display name:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

