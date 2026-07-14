/**
 * Stats Controller
 * Aggregate KPI numbers for the staff overview, plus the public Hall of Fame.
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { CONSTANTS } from '../../config/constants';
import { logger } from '../../utils/logger';

/**
 * Platform KPIs for the staff Overview section (Superadmin/Admin).
 */
export async function getOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [games, ticketsToday, grossToday, fill, staff, topups] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE game_status IN ('Live', 'Paused')) AS active_games,
           COUNT(*) FILTER (WHERE game_status = 'Scheduled')          AS scheduled_games
         FROM Scheduled_Games`
      ),
      pool.query(
        `SELECT COUNT(*) AS tickets_sold_today
         FROM Tickets
         WHERE status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS gross_revenue_today
         FROM Bookings
         WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COALESCE(ROUND(AVG(fill), 1), 0) AS fill_rate_avg
         FROM (
           SELECT COUNT(*) FILTER (WHERE t.status = 'Sold')::DECIMAL / NULLIF(COUNT(*), 0) * 100 AS fill
           FROM Scheduled_Games g
           JOIN Tickets t ON t.game_id = g.game_id
           WHERE g.game_status IN ('Scheduled', 'Live', 'Paused')
           GROUP BY g.game_id
         ) fills`
      ),
      pool.query(`SELECT COUNT(*) AS total_staff FROM Users WHERE status = 'Active'`),
      pool.query(`SELECT COUNT(*) AS pending_topups FROM TopUp_Requests WHERE request_status = 'Pending'`),
    ]);

    res.json({
      active_games: parseInt(games.rows[0].active_games, 10),
      scheduled_games: parseInt(games.rows[0].scheduled_games, 10),
      tickets_sold_today: parseInt(ticketsToday.rows[0].tickets_sold_today, 10),
      gross_revenue_today: parseFloat(grossToday.rows[0].gross_revenue_today),
      fill_rate_avg: parseFloat(fill.rows[0].fill_rate_avg),
      total_staff: parseInt(staff.rows[0].total_staff, 10),
      pending_topups: parseInt(topups.rows[0].pending_topups, 10),
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching overview stats');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Public Hall of Fame — claimed prizes aggregated by housie name.
 */
export async function getHallOfFame(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT winner_housie_name AS housie_name,
              COUNT(*)::INTEGER AS wins,
              COALESCE(SUM(COALESCE(amount_per_winner, prize_amount)), 0) AS total_won,
              COALESCE(MAX(COALESCE(amount_per_winner, prize_amount)), 0) AS biggest_win
       FROM Prize_Pool
       WHERE claimed = TRUE AND winner_housie_name IS NOT NULL
       GROUP BY winner_housie_name
       ORDER BY wins DESC, total_won DESC
       LIMIT 20`
    );

    res.json(
      result.rows.map((row) => ({
        housie_name: row.housie_name,
        wins: row.wins,
        total_won: parseFloat(row.total_won),
        biggest_win: parseFloat(row.biggest_win),
      }))
    );
  } catch (error) {
    logger.error({ err: error }, 'error fetching hall of fame');
    res.status(500).json({ message: 'Internal server error' });
  }
}

const LUCKY_CYCLE_MS = CONSTANTS.LUCKY_NUMBER_CYCLE_DAYS * 24 * 60 * 60 * 1000;

interface LuckyNumberBody {
  lucky_number: number | null;
  refreshes_at: string;
}

// Pure function of the DB per cycle, so this cache is only an optimization —
// restarts and parallel instances all recompute the identical value.
let luckyMemo: { cycleIndex: number; body: LuckyNumberBody } | null = null;

/**
 * Public Lucky Number — most frequent winning ticket number across the 60
 * games completed most recently before the current 12-day cycle started.
 */
export async function getLuckyNumber(req: Request, res: Response): Promise<void> {
  try {
    const cycleIndex = Math.max(
      0,
      Math.floor((Date.now() - CONSTANTS.LUCKY_NUMBER_EPOCH_MS) / LUCKY_CYCLE_MS)
    );
    if (luckyMemo && luckyMemo.cycleIndex === cycleIndex) {
      res.json(luckyMemo.body);
      return;
    }

    const cycleStartMs = CONSTANTS.LUCKY_NUMBER_EPOCH_MS + cycleIndex * LUCKY_CYCLE_MS;
    const result = await pool.query(
      `SELECT t.ticket_number, p.claimed_at
       FROM (
         SELECT game_id
         FROM Scheduled_Games
         WHERE game_status = 'Completed' AND completed_at < $1
         ORDER BY completed_at DESC
         LIMIT $2
       ) g
       JOIN Prize_Pool p ON p.game_id = g.game_id
                        AND p.claimed = TRUE
                        AND p.winner_ticket_id IS NOT NULL
       JOIN Tickets t    ON t.ticket_id = p.winner_ticket_id`,
      [new Date(cycleStartMs), CONSTANTS.LUCKY_NUMBER_SAMPLE_GAMES]
    );

    const tallies = new Map<number, { count: number; latestWinMs: number }>();
    for (const row of result.rows) {
      const n: number = row.ticket_number;
      const winMs = row.claimed_at ? new Date(row.claimed_at).getTime() : 0;
      const tally = tallies.get(n);
      if (tally) {
        tally.count += 1;
        if (winMs > tally.latestWinMs) tally.latestWinMs = winMs;
      } else {
        tallies.set(n, { count: 1, latestWinMs: winMs });
      }
    }

    // Mode with a total tie-break (count DESC, latest win DESC, lower number)
    // so the result is always exactly one number.
    let luckyNumber: number | null = null;
    let best: { count: number; latestWinMs: number } | null = null;
    for (const [n, tally] of tallies) {
      if (
        luckyNumber === null || best === null ||
        tally.count > best.count ||
        (tally.count === best.count &&
          (tally.latestWinMs > best.latestWinMs ||
            (tally.latestWinMs === best.latestWinMs && n < luckyNumber)))
      ) {
        luckyNumber = n;
        best = tally;
      }
    }

    const body: LuckyNumberBody = {
      lucky_number: luckyNumber,
      refreshes_at: new Date(cycleStartMs + LUCKY_CYCLE_MS).toISOString(),
    };
    luckyMemo = { cycleIndex, body };
    res.json(body);
  } catch (error) {
    logger.error({ err: error }, 'error fetching lucky number');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * GET /api/stats/financial-analysis (Superadmin/Admin)
 * The Finance Hub's Analysis tab: lifetime totals over completed games, a
 * per-game breakdown of the last 10, plus real time series for the widgets —
 * 7-day daily revenue/payouts/tickets, today's hourly ticket buckets, and
 * new-vs-returning buyers (only bookings stamped with player_id count;
 * anonymous sales are invisible to retention by design).
 */
export async function getFinancialAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [totals, walletBalances, recentGames, daily, hourly, retention] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(b.total_amount), 0)
            FROM Bookings b JOIN Scheduled_Games g ON b.game_id = g.game_id
            WHERE b.booking_status = 'Sold' AND g.game_status = 'Completed') AS total_revenue,
           (SELECT COALESCE(SUM(p.prize_amount), 0)
            FROM Prize_Pool p JOIN Scheduled_Games g ON p.game_id = g.game_id
            WHERE p.claimed = TRUE AND g.game_status = 'Completed') AS total_payouts,
           (SELECT COUNT(*)
            FROM Tickets t JOIN Scheduled_Games g ON t.game_id = g.game_id
            WHERE t.status = 'Sold' AND g.game_status = 'Completed') AS total_tickets_sold`
      ),
      pool.query(
        `SELECT COALESCE(SUM(balance_after), 0) AS wallet_balances
         FROM (
           SELECT DISTINCT ON (agent_id) balance_after
           FROM Wallet_Ledger
           ORDER BY agent_id, created_at DESC
         ) last_balances`
      ),
      pool.query(
        `SELECT g.game_id, g.title, g.completed_at, g.ticket_price,
           (SELECT COUNT(*) FROM Tickets t WHERE t.game_id = g.game_id AND t.status = 'Sold')::INTEGER AS tickets_sold,
           (SELECT COALESCE(SUM(p.prize_amount), 0) FROM Prize_Pool p WHERE p.game_id = g.game_id AND p.claimed = TRUE) AS payout
         FROM Scheduled_Games g
         WHERE g.game_status = 'Completed'
         ORDER BY g.completed_at DESC NULLS LAST
         LIMIT 10`
      ),
      pool.query(
        `SELECT d::date AS day,
           COALESCE(r.revenue, 0)::FLOAT AS revenue,
           COALESCE(r.tickets, 0)::INTEGER AS tickets,
           COALESCE(p.payouts, 0)::FLOAT AS payouts
         FROM generate_series(date_trunc('day', NOW()) - INTERVAL '6 days', date_trunc('day', NOW()), '1 day') d
         LEFT JOIN (
           SELECT date_trunc('day', confirmed_at) AS day,
                  SUM(total_amount) AS revenue,
                  SUM(COALESCE(array_length(ticket_ids, 1), 0)) AS tickets
           FROM Bookings
           WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         ) r ON r.day = d
         LEFT JOIN (
           SELECT date_trunc('day', claimed_at) AS day, SUM(prize_amount) AS payouts
           FROM Prize_Pool
           WHERE claimed = TRUE AND claimed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         ) p ON p.day = d
         ORDER BY d`
      ),
      pool.query(
        `SELECT h AS hour, COALESCE(t.tickets, 0)::INTEGER AS tickets
         FROM generate_series(0, 23) h
         LEFT JOIN (
           SELECT EXTRACT(HOUR FROM confirmed_at)::INTEGER AS hour, COUNT(*) AS tickets
           FROM Tickets
           WHERE status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())
           GROUP BY 1
         ) t ON t.hour = h
         ORDER BY h`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE first_buy >= date_trunc('day', NOW()) - INTERVAL '6 days')::INTEGER AS new_players,
           COUNT(*) FILTER (WHERE first_buy <  date_trunc('day', NOW()) - INTERVAL '6 days')::INTEGER AS returning_players
         FROM (
           SELECT player_id, MIN(confirmed_at) AS first_buy
           FROM Bookings
           WHERE booking_status = 'Sold' AND player_id IS NOT NULL
           GROUP BY player_id
           HAVING MAX(confirmed_at) >= date_trunc('day', NOW()) - INTERVAL '6 days'
         ) buyers_this_week`
      ),
    ]);

    const collection = parseFloat(totals.rows[0].total_revenue);
    const payouts = parseFloat(totals.rows[0].total_payouts);
    const profit = collection - payouts;
    const margin = collection > 0 ? (profit / collection) * 100 : 0;

    res.json({
      overall_collection: collection,
      total_payouts: payouts,
      overall_profit: profit,
      profit_margin: margin,
      total_tickets_sold: parseInt(totals.rows[0].total_tickets_sold, 10),
      wallet_balances: parseFloat(walletBalances.rows[0].wallet_balances),
      recent_games: recentGames.rows.map((row: any) => {
        const price = parseFloat(row.ticket_price);
        const gross = row.tickets_sold * price;
        const pay = parseFloat(row.payout);
        const net = gross - pay;
        return {
          game_id: row.game_id,
          title: row.title,
          completed_at: row.completed_at,
          ticket_price: price,
          tickets_sold: row.tickets_sold,
          gross_collection: gross,
          payout: pay,
          net_profit: net,
          profit_margin: gross > 0 ? (net / gross) * 100 : 0,
        };
      }),
      daily: daily.rows.map((row: any) => ({
        day: row.day,
        revenue: row.revenue,
        payouts: row.payouts,
        net: row.revenue - row.payouts,
        tickets: row.tickets,
      })),
      hourly_today: hourly.rows,
      retention: retention.rows[0],
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching financial analysis');
    res.status(500).json({ message: 'Internal server error' });
  }
}
