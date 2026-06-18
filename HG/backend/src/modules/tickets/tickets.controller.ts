/**
 * Tickets Controller
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { logger } from '../../utils/logger';

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
    logger.error({ err: error }, 'error fetching tickets grid');
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
    logger.error({ err: error }, 'error fetching ticket grid data');
    res.status(500).json({ message: 'Internal server error' });
  }
}
