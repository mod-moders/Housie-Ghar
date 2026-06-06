import pool from './index';
import { generateTicketGrid } from '../utils/ticketGenerator';

export async function generateTicketsForGame(gameId: string, totalTickets: number): Promise<void> {
  console.log(`🎫 Generating ${totalTickets} tickets for game ${gameId}...`);

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
      console.error(`Error in ticket generation batch ${start}-${end}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`✅ Completed generating tickets for game ${gameId}`);
}
