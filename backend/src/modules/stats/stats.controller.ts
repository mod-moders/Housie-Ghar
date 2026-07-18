/**
 * Stats Controller
 * Aggregate KPI numbers for the staff overview, plus the public Hall of Fame.
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { CONSTANTS } from '../../config/constants';

/**
 * Platform KPIs for the staff Overview section (Superadmin/Admin).
 */
export async function getOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [games, ticketsToday, grossToday, fill, staff, topups, walletBalances, totalRev, totalPayouts] = await Promise.all([
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
      pool.query(
        `SELECT COALESCE(SUM(balance_after), 0) AS wallet_balances
         FROM (
           SELECT DISTINCT ON (agent_id) balance_after
           FROM Wallet_Ledger
           ORDER BY agent_id, created_at DESC
         ) last_balances`
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
         FROM Bookings
         WHERE booking_status = 'Sold'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(prize_amount), 0) AS total_payouts
         FROM Prize_Pool
         WHERE claimed = TRUE`
      ),
    ]);

    const netRev = Math.max(0, parseFloat(totalRev.rows[0].total_revenue) - parseFloat(totalPayouts.rows[0].total_payouts));

    res.json({
      active_games: parseInt(games.rows[0].active_games, 10),
      scheduled_games: parseInt(games.rows[0].scheduled_games, 10),
      tickets_sold_today: parseInt(ticketsToday.rows[0].tickets_sold_today, 10),
      gross_revenue_today: parseFloat(grossToday.rows[0].gross_revenue_today),
      fill_rate_avg: parseFloat(fill.rows[0].fill_rate_avg),
      total_staff: parseInt(staff.rows[0].total_staff, 10),
      pending_topups: parseInt(topups.rows[0].pending_topups, 10),
      wallet_balances: parseFloat(walletBalances.rows[0].wallet_balances),
      net_revenue: netRev,
      pending_withdrawals: 0, // Mocked pending withdrawal requests
    });
  } catch (error) {
    console.error('Error fetching overview stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Public Hall of Fame — claimed prizes aggregated by housie name.
 */
export async function getHallOfFame(req: Request, res: Response): Promise<void> {
  try {
    const timeframe = req.query.timeframe as string || "all-time";
    let timeFilter = "";
    if (timeframe === "daily") {
      timeFilter = "AND claimed_at >= NOW() - INTERVAL '24 hours'";
    } else if (timeframe === "weekly") {
      timeFilter = "AND claimed_at >= NOW() - INTERVAL '7 days'";
    } else if (timeframe === "monthly") {
      timeFilter = "AND claimed_at >= NOW() - INTERVAL '30 days'";
    }

    const result = await pool.query(
      `SELECT trim(split_name) AS housie_name,
              COUNT(*)::INTEGER AS wins,
              COALESCE(SUM(COALESCE(amount_per_winner, prize_amount)), 0) AS total_won,
              COALESCE(MAX(COALESCE(amount_per_winner, prize_amount)), 0) AS biggest_win
       FROM Prize_Pool,
       LATERAL regexp_split_to_table(winner_housie_name, ',\\s*') AS split_name
       WHERE claimed = TRUE AND winner_housie_name IS NOT NULL AND trim(split_name) != '' ${timeFilter}
       GROUP BY trim(split_name)
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
    console.error('Error fetching hall of fame:', error);
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
    console.error('Error fetching lucky number:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Combined "Housie Ghar Analysis" visualizations for the Finance Hub:
 * a real trailing-7-day revenue/payout/volume/DAU-MAU series, today's
 * peak-hour ticket-sales heatmap, and today's new-vs-returning player split.
 * Replaces the panel's previous hardcoded demo numbers with actual rows from
 * Bookings/Tickets/Prize_Pool/Players.
 */
export async function getFinanceInsights(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [seriesResult, heatmapResult, retentionResult] = await Promise.all([
      pool.query(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', NOW()) - INTERVAL '6 days',
             date_trunc('day', NOW()),
             INTERVAL '1 day'
           )::date AS day
         ),
         revenue AS (
           SELECT confirmed_at::date AS day, SUM(total_amount) AS revenue
           FROM Bookings
           WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         ),
         payouts AS (
           SELECT claimed_at::date AS day, SUM(prize_amount) AS payouts
           FROM Prize_Pool
           WHERE claimed = TRUE AND claimed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         ),
         volume AS (
           SELECT confirmed_at::date AS day, COUNT(*) AS volume
           FROM Tickets
           WHERE status = 'Sold' AND confirmed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         ),
         dau AS (
           SELECT confirmed_at::date AS day, COUNT(DISTINCT housie_name) AS dau
           FROM Bookings
           WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
         )
         SELECT
           to_char(d.day, 'Dy') AS day_label,
           COALESCE(r.revenue, 0) AS revenue,
           COALESCE(p.payouts, 0) AS payouts,
           COALESCE(v.volume, 0) AS volume,
           COALESCE(a.dau, 0) AS dau,
           (SELECT COUNT(DISTINCT housie_name) FROM Bookings b2
              WHERE b2.booking_status = 'Sold'
                AND b2.confirmed_at::date BETWEEN d.day - INTERVAL '29 days' AND d.day) AS mau
         FROM days d
         LEFT JOIN revenue r ON r.day = d.day
         LEFT JOIN payouts p ON p.day = d.day
         LEFT JOIN volume v ON v.day = d.day
         LEFT JOIN dau a ON a.day = d.day
         ORDER BY d.day`
      ),
      pool.query(
        `SELECT EXTRACT(HOUR FROM confirmed_at)::INT AS hr, COUNT(*)::INT AS cnt
         FROM Tickets
         WHERE status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())
         GROUP BY 1`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE p.registered_at < date_trunc('day', NOW())) AS returning_users,
           COUNT(*) FILTER (WHERE p.registered_at >= date_trunc('day', NOW())) AS new_signups
         FROM (
           SELECT DISTINCT housie_name
           FROM Bookings
           WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())
         ) active
         JOIN Players p ON p.housie_name = active.housie_name`
      ),
    ]);

    const series = {
      days: seriesResult.rows.map((r) => r.day_label),
      revenue: seriesResult.rows.map((r) => parseFloat(r.revenue)),
      payouts: seriesResult.rows.map((r) => parseFloat(r.payouts)),
      net: seriesResult.rows.map((r) => Math.max(0, parseFloat(r.revenue) - parseFloat(r.payouts))),
      volume: seriesResult.rows.map((r) => parseInt(r.volume, 10)),
      dau: seriesResult.rows.map((r) => parseInt(r.dau, 10)),
      mau: seriesResult.rows.map((r) => parseInt(r.mau, 10)),
    };

    const HEATMAP_LABELS = ['12 AM', '2 AM', '4 AM', '6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM'];
    const bucketCounts = new Array(12).fill(0);
    for (const row of heatmapResult.rows) {
      bucketCounts[Math.floor(row.hr / 2)] += row.cnt;
    }
    const heatmap = HEATMAP_LABELS.map((label, i) => ({ label, value: bucketCounts[i] }));

    const returning = parseInt(retentionResult.rows[0].returning_users, 10);
    const newSignups = parseInt(retentionResult.rows[0].new_signups, 10);

    res.json({
      series,
      heatmap,
      retention: { returning, new_signups: newSignups, total: returning + newSignups },
    });
  } catch (error) {
    console.error('Error fetching finance insights:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getFinancialAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [grossRev, totalPayouts, ticketSales, walletBalances, recentGames] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(b.total_amount), 0) AS total_revenue
         FROM Bookings b
         JOIN Scheduled_Games g ON b.game_id = g.game_id
         WHERE b.booking_status = 'Sold' AND g.game_status = 'Completed'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(p.prize_amount), 0) AS total_payouts
         FROM Prize_Pool p
         JOIN Scheduled_Games g ON p.game_id = g.game_id
         WHERE p.claimed = TRUE AND g.game_status = 'Completed'`
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total_tickets_sold
         FROM Tickets t
         JOIN Scheduled_Games g ON t.game_id = g.game_id
         WHERE t.status = 'Sold' AND g.game_status = 'Completed'`
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
        // Per-game tickets_sold and payout are computed as independent scalar
        // subqueries. The previous version LEFT JOINed Tickets and Prize_Pool in one
        // query, producing a tickets×prizes cartesian product; the SUM(DISTINCT ...)
        // used to undo that collapsed two prizes of equal amount into one, undercounting
        // the payout. Subqueries sum every claimed prize exactly once.
        `SELECT
           g.game_id,
           g.title,
           g.completed_at,
           g.ticket_price,
           (SELECT COUNT(*) FROM Tickets t
              WHERE t.game_id = g.game_id AND t.status = 'Sold')::INTEGER AS tickets_sold,
           ((SELECT COUNT(*) FROM Tickets t
              WHERE t.game_id = g.game_id AND t.status = 'Sold') * g.ticket_price) AS gross_collection,
           COALESCE((SELECT SUM(p.prize_amount) FROM Prize_Pool p
              WHERE p.game_id = g.game_id AND p.claimed = TRUE), 0) AS payout
         FROM Scheduled_Games g
         WHERE g.game_status = 'Completed'
         ORDER BY g.completed_at DESC
         LIMIT 10`
      )
    ]);

    const collection = parseFloat(grossRev.rows[0].total_revenue);
    const payouts = parseFloat(totalPayouts.rows[0].total_payouts);
    const profit = Math.max(0, collection - payouts);
    const margin = collection > 0 ? (profit / collection) * 100 : 0;

    res.json({
      overall_collection: collection,
      total_payouts: payouts,
      overall_profit: profit,
      profit_margin: margin,
      total_tickets_sold: ticketSales.rows[0].total_tickets_sold,
      wallet_balances: parseFloat(walletBalances.rows[0].wallet_balances),
      recent_games: recentGames.rows.map((row: any) => {
        const gross = parseFloat(row.gross_collection);
        const pay = parseFloat(row.payout);
        const net = Math.max(0, gross - pay);
        const marg = gross > 0 ? (net / gross) * 100 : 0;
        return {
          game_id: row.game_id,
          title: row.title,
          completed_at: row.completed_at,
          ticket_price: parseFloat(row.ticket_price),
          tickets_sold: row.tickets_sold,
          gross_collection: gross,
          payout: pay,
          net_profit: net,
          profit_margin: marg
        };
      })
    });
  } catch (error) {
    console.error('Error fetching financial analysis:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

