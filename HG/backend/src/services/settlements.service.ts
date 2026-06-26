/**
 * Prize-settlement data layer.
 *
 * Every function takes the `pg` handle it should use (a Pool or an open
 * PoolClient) instead of importing the env-bound singleton, so these functions
 * can be integration-tested against a scratch DB without booting the app.
 */

import { PoolClient } from 'pg';
import { logger } from '../utils/logger';

export interface SettlementWinnerInput {
  ticketId: number;
  ticketNumber: number;
  amount: number;
}

export interface RecordSettlementsParams {
  gameId: string;
  prizeId: number;
  patternName: string;
  winners: SettlementWinnerInput[];
}

/**
 * Record one 'Owed' settlement per winning ticket, resolving the responsible
 * agent + (optional) player from the ticket's Sold booking. Call this inside
 * the same transaction that claims the prize so a win and its payable are
 * always consistent. Idempotent: ON CONFLICT (prize_id, ticket_id) DO NOTHING.
 */
export async function recordSettlementsForPrize(
  client: PoolClient,
  params: RecordSettlementsParams
): Promise<void> {
  for (const w of params.winners) {
    const bookingRes = await client.query(
      `SELECT assigned_agent_id, player_id, housie_name
       FROM Bookings
       WHERE game_id = $1 AND booking_status = 'Sold' AND $2 = ANY(ticket_ids)
       LIMIT 1`,
      [params.gameId, w.ticketId]
    );

    if (bookingRes.rowCount === 0) {
      logger.warn(
        { gameId: params.gameId, prizeId: params.prizeId, ticketId: w.ticketId },
        'no Sold booking found for winning ticket; settlement skipped'
      );
      continue;
    }

    const b = bookingRes.rows[0];
    await client.query(
      `INSERT INTO Prize_Settlements
         (game_id, prize_id, pattern_name, ticket_id, ticket_number,
          player_id, winner_housie_name, agent_id, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Owed')
       ON CONFLICT (prize_id, ticket_id) DO NOTHING`,
      [
        params.gameId,
        params.prizeId,
        params.patternName,
        w.ticketId,
        w.ticketNumber,
        b.player_id,
        b.housie_name,
        b.assigned_agent_id,
        w.amount,
      ]
    );
  }
}
