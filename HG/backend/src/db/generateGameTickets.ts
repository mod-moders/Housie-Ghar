import pool from './index';
import { generateTicketGrid } from '../utils/ticketGenerator';
import { logger } from '../utils/logger';

export async function generateTicketsForGame(gameId: string, totalTickets: number): Promise<void> {
  logger.info({ gameId, totalTickets }, 'generating tickets');

  // Insert in batches of 50 to avoid overloading or exceeding limits
  const batchSize = 50;
  for (let start = 1; start <= totalTickets; start += batchSize) {
    const end = Math.min(start + batchSize - 1, totalTickets);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let ticketNum = start; ticketNum <= end; ticketNum++) {
        const gridData = generateTicketGrid();
        await client.query(
          `INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
           VALUES ($1, $2, $3, 'Available')
           ON CONFLICT ON CONSTRAINT uq_game_ticket DO NOTHING`,
          [gameId, ticketNum, JSON.stringify(gridData)]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, gameId, start, end }, 'error in ticket generation batch');
      throw error;
    } finally {
      client.release();
    }
  }

  logger.info({ gameId }, 'ticket generation complete');
}
