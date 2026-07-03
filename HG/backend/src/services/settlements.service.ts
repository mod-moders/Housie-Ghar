/**
 * Prize-settlement data layer.
 *
 * Every function takes the `pg` handle it should use (a Pool or an open
 * PoolClient) instead of importing the env-bound singleton, so these functions
 * can be integration-tested against a scratch DB without booting the app.
 */

import { Pool, PoolClient } from 'pg';
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

export interface RecordedSettlement {
  settlementId: string;
  agentId: string;
  patternName: string;
  ticketNumber: number;
  winnerHousieName: string | null;
  amount: number;
}

/**
 * Record one 'Owed' settlement per winning ticket, resolving the responsible
 * agent + (optional) player from the ticket's Sold booking. Call this inside
 * the same transaction that claims the prize so a win and its payable are
 * always consistent. Idempotent: ON CONFLICT (prize_id, ticket_id) DO NOTHING.
 *
 * Returns the rows actually inserted (replays and unowned tickets return
 * nothing) so the caller can notify the owed agents after the txn commits.
 */
export async function recordSettlementsForPrize(
  client: PoolClient,
  params: RecordSettlementsParams
): Promise<RecordedSettlement[]> {
  const recorded: RecordedSettlement[] = [];
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
    const ins = await client.query(
      `INSERT INTO Prize_Settlements
         (game_id, prize_id, pattern_name, ticket_id, ticket_number,
          player_id, winner_housie_name, agent_id, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Owed')
       ON CONFLICT (prize_id, ticket_id) DO NOTHING
       RETURNING settlement_id`,
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
    if (ins.rowCount) {
      recorded.push({
        settlementId: ins.rows[0].settlement_id,
        agentId: b.assigned_agent_id,
        patternName: params.patternName,
        ticketNumber: w.ticketNumber,
        winnerHousieName: b.housie_name ?? null,
        amount: w.amount,
      });
    }
  }
  return recorded;
}

export interface SettlementFilter {
  gameId?: string;
  status?: string;
}

/** List settlements, optionally filtered by game and/or status, newest first. */
export async function listSettlements(
  db: Pool,
  filter: SettlementFilter
): Promise<any[]> {
  const res = await db.query(
    `SELECT s.*, u.full_name AS agent_name, u.town AS agent_town, u.phone AS agent_phone
     FROM Prize_Settlements s
     JOIN Users u ON u.user_id = s.agent_id
     WHERE ($1::uuid IS NULL OR s.game_id = $1)
       AND ($2::text IS NULL OR s.status = $2)
     ORDER BY s.created_at DESC`,
    [filter.gameId ?? null, filter.status ?? null]
  );
  return res.rows;
}

/**
 * A Bookie's own prize ledger: what the platform owes them for winning tickets
 * they sold, owed rows first. Joined with the game title so the WhatsApp claim
 * message can name the game.
 */
export async function listAgentSettlements(db: Pool, agentId: string): Promise<any[]> {
  const res = await db.query(
    `SELECT s.settlement_id, s.game_id, s.pattern_name, s.ticket_number,
            s.winner_housie_name, s.amount, s.status, s.created_at, s.settled_at,
            g.title AS game_title
     FROM Prize_Settlements s
     JOIN Scheduled_Games g ON g.game_id = s.game_id
     WHERE s.agent_id = $1
     ORDER BY (s.status = 'Owed') DESC, s.created_at DESC
     LIMIT 100`,
    [agentId]
  );
  return res.rows;
}

/**
 * A player's wins, joined with the selling agent's contact so the winner can
 * be pointed at the right bookie's WhatsApp to collect the cash.
 */
export async function listPlayerWins(
  db: Pool,
  playerId: string,
  gameId?: string
): Promise<any[]> {
  const res = await db.query(
    `SELECT s.settlement_id, s.game_id, s.pattern_name, s.ticket_number,
            s.winner_housie_name, s.amount, s.created_at,
            g.title AS game_title,
            u.full_name AS agent_name, u.phone AS agent_phone, u.town AS agent_town
     FROM Prize_Settlements s
     JOIN Scheduled_Games g ON g.game_id = s.game_id
     JOIN Users u ON u.user_id = s.agent_id
     WHERE s.player_id = $1
       AND ($2::uuid IS NULL OR s.game_id = $2)
     ORDER BY s.created_at DESC
     LIMIT 100`,
    [playerId, gameId ?? null]
  );
  return res.rows;
}

export interface SettleResult {
  status: 'settled' | 'already_paid' | 'not_found';
  settlement?: any;
  newBalance?: number;
}

/**
 * Mark a settlement Paid and credit the selling agent's wallet, in one
 * transaction. Row-locked and idempotent: a second call returns 'already_paid'
 * without crediting again. A zero-amount share flips to Paid without touching
 * the wallet (Wallet_Ledger.amount has a CHECK > 0).
 */
export async function settleSettlement(
  db: Pool,
  settlementId: string,
  financeUserId: string
): Promise<SettleResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const sRes = await client.query(
      `SELECT * FROM Prize_Settlements WHERE settlement_id = $1 FOR UPDATE`,
      [settlementId]
    );
    if (sRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }
    const s = sRes.rows[0];
    if (s.status === 'Paid') {
      await client.query('ROLLBACK');
      return { status: 'already_paid', settlement: s };
    }

    const amount = parseFloat(s.amount);
    let newBalance: number | undefined;

    if (amount > 0) {
      const uRes = await client.query(
        `SELECT current_balance FROM Users WHERE user_id = $1 FOR UPDATE`,
        [s.agent_id]
      );
      const balance = parseFloat(uRes.rows[0].current_balance);
      newBalance = balance + amount;
      await client.query(`UPDATE Users SET current_balance = $1 WHERE user_id = $2`, [
        newBalance,
        s.agent_id,
      ]);
      await client.query(
        `INSERT INTO Wallet_Ledger
           (agent_id, transaction_type, amount, balance_after,
            reference_type, reference_id, description, performed_by)
         VALUES ($1, 'Credit', $2, $3, 'Prize', $4, $5, $6)`,
        [
          s.agent_id,
          amount,
          newBalance,
          settlementId,
          `Prize payout: ${s.pattern_name} — ${s.winner_housie_name || 'winner'} (ticket #${s.ticket_number})`,
          financeUserId,
        ]
      );
    }

    const upd = await client.query(
      `UPDATE Prize_Settlements
       SET status = 'Paid', settled_at = NOW(), settled_by = $2
       WHERE settlement_id = $1
       RETURNING *`,
      [settlementId, financeUserId]
    );

    await client.query('COMMIT');
    return { status: 'settled', settlement: upd.rows[0], newBalance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
