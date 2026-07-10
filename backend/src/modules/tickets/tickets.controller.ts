/**
 * Tickets Controller
 */

import { Request, Response } from 'express';
import pool from '../../db';

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
      `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name
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
    const result = await pool.query(
      `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name
       FROM Tickets
       WHERE game_id = $1 AND owner_housie_name = $2 AND status = 'Sold'
       ORDER BY ticket_number ASC`,
      [game_id, player.housieName]
    );

    res.json(result.rows.map(row => ({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      grid_data: row.grid_data,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
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
  const isNumber = !isNaN(Number(cleanQuery));

  try {
    let result;
    if (isNumber) {
      result = await pool.query(
        `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name
         FROM Tickets
         WHERE game_id = $1 AND (ticket_number = $2 OR LOWER(owner_housie_name) LIKE LOWER($3)) AND status = 'Sold'
         ORDER BY ticket_number ASC`,
        [game_id, Number(cleanQuery), `%${cleanQuery}%`]
      );
    } else {
      result = await pool.query(
        `SELECT ticket_id, ticket_number, grid_data, status, owner_housie_name
         FROM Tickets
         WHERE game_id = $1 AND LOWER(owner_housie_name) LIKE LOWER($2) AND status = 'Sold'
         ORDER BY ticket_number ASC`,
        [game_id, `%${cleanQuery}%`]
      );
    }

    res.json(result.rows.map(row => ({
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      grid_data: row.grid_data,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
    })));
  } catch (error) {
    console.error('Error searching game tickets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

