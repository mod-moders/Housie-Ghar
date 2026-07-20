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

/**
 * Personal analytics dashboard for an Operator user.
 */
export async function getOperatorStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const operatorId = req.user?.userId || (req.user as any)?.user_id;
    if (!operatorId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const [gamesSummary, numbersCalled, ticketsAndPayout, recentGames] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::INTEGER AS total_games,
           COUNT(*) FILTER (WHERE game_status = 'Completed')::INTEGER AS completed_games,
           COUNT(*) FILTER (WHERE game_status IN ('Live', 'Paused'))::INTEGER AS live_games,
           COUNT(*) FILTER (WHERE game_status = 'Scheduled')::INTEGER AS scheduled_games
         FROM Scheduled_Games
         WHERE operator_id = $1`,
        [operatorId]
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total_calls
         FROM Number_Calls nc
         JOIN Scheduled_Games g ON g.game_id = nc.game_id
         WHERE g.operator_id = $1`,
        [operatorId]
      ),
      pool.query(
        `SELECT
           COALESCE(COUNT(DISTINCT t.ticket_id), 0)::INTEGER AS total_tickets_sold,
           COALESCE(SUM(p.prize_amount) FILTER (WHERE p.claimed = TRUE), 0) AS total_payouts_disbursed,
           COALESCE(COUNT(DISTINCT p.prize_id) FILTER (WHERE p.claimed = TRUE), 0)::INTEGER AS total_prizes_claimed
         FROM Scheduled_Games g
         LEFT JOIN Tickets t ON t.game_id = g.game_id AND t.status = 'Sold'
         LEFT JOIN Prize_Pool p ON p.game_id = g.game_id
         WHERE g.operator_id = $1`,
        [operatorId]
      ),
      pool.query(
        `SELECT
           g.game_id,
           g.title,
           g.scheduled_at,
           g.completed_at,
           g.game_status,
           g.total_tickets,
           g.ticket_price,
           (SELECT COUNT(*)::INTEGER FROM Tickets t WHERE t.game_id = g.game_id AND t.status = 'Sold') AS tickets_sold,
           (SELECT COUNT(*)::INTEGER FROM Number_Calls nc WHERE nc.game_id = g.game_id) AS numbers_called,
           COALESCE((SELECT SUM(p.prize_amount) FROM Prize_Pool p WHERE p.game_id = g.game_id AND p.claimed = TRUE), 0) AS total_payout
         FROM Scheduled_Games g
         WHERE g.operator_id = $1
         ORDER BY g.created_at DESC
         LIMIT 20`,
        [operatorId]
      ),
    ]);

    const summary = gamesSummary.rows[0];
    const tickets = ticketsAndPayout.rows[0];

    res.json({
      total_games_operated: summary.total_games || 0,
      completed_games: summary.completed_games || 0,
      live_games: summary.live_games || 0,
      scheduled_games: summary.scheduled_games || 0,
      total_numbers_called: numbersCalled.rows[0].total_calls || 0,
      total_tickets_sold: tickets.total_tickets_sold || 0,
      total_payouts_disbursed: parseFloat(tickets.total_payouts_disbursed || '0'),
      total_prizes_claimed: tickets.total_prizes_claimed || 0,
      recent_games: recentGames.rows.map((row: any) => ({
        game_id: row.game_id,
        title: row.title,
        scheduled_at: row.scheduled_at,
        completed_at: row.completed_at,
        game_status: row.game_status,
        total_tickets: row.total_tickets,
        ticket_price: parseFloat(row.ticket_price),
        tickets_sold: row.tickets_sold,
        numbers_called: row.numbers_called,
        total_payout: parseFloat(row.total_payout),
        fill_rate: row.total_tickets > 0 ? Math.round((row.tickets_sold / row.total_tickets) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching operator stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Personal analytics dashboard for a Bookie / Promoter user.
 */
export async function getBookieStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const bookieId = req.user?.userId || (req.user as any)?.user_id;
    if (!bookieId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const [salesTimeframes, bookingStatusCounts, walletBalance, topupStats, recentBookings] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(array_length(ticket_ids, 1)) FILTER (WHERE booking_status = 'Sold'), 0)::INTEGER AS total_tickets_sold,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'Sold'), 0) AS total_gross_collection,

           COALESCE(SUM(array_length(ticket_ids, 1)) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '24 hours'), 0)::INTEGER AS tickets_sold_daily,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '24 hours'), 0) AS collection_daily,

           COALESCE(SUM(array_length(ticket_ids, 1)) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '7 days'), 0)::INTEGER AS tickets_sold_weekly,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '7 days'), 0) AS collection_weekly,

           COALESCE(SUM(array_length(ticket_ids, 1)) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '30 days'), 0)::INTEGER AS tickets_sold_monthly,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '30 days'), 0) AS collection_monthly
         FROM Bookings
         WHERE assigned_agent_id = $1`,
        [bookieId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::INTEGER AS total_bookings_attempted,
           COUNT(*) FILTER (WHERE booking_status = 'Sold')::INTEGER AS confirmed_count,
           COUNT(*) FILTER (WHERE booking_status = 'Expired')::INTEGER AS expired_missed_count,
           COUNT(*) FILTER (WHERE booking_status IN ('Cancelled', 'Rejected'))::INTEGER AS cancelled_count
         FROM Bookings
         WHERE assigned_agent_id = $1`,
        [bookieId]
      ),
      pool.query(
        `SELECT balance_after
         FROM Wallet_Ledger
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [bookieId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE request_status = 'Approved')::INTEGER AS approved_recharges_count,
           COALESCE(SUM(requested_amount) FILTER (WHERE request_status = 'Approved'), 0) AS total_recharged_amount,
           COUNT(*) FILTER (WHERE request_status = 'Pending')::INTEGER AS pending_recharges_count
         FROM TopUp_Requests
         WHERE agent_id = $1`,
        [bookieId]
      ),
      pool.query(
        `SELECT
           b.booking_id,
           b.game_id,
           g.title AS game_title,
           b.housie_name,
           array_length(b.ticket_ids, 1)::INTEGER AS ticket_count,
           b.total_amount,
           b.booking_status,
           b.locked_at,
           b.confirmed_at
         FROM Bookings b
         JOIN Scheduled_Games g ON g.game_id = b.game_id
         WHERE b.assigned_agent_id = $1
         ORDER BY b.locked_at DESC
         LIMIT 20`,
        [bookieId]
      )
    ]);

    const sales = salesTimeframes.rows[0];
    const status = bookingStatusCounts.rows[0];
    const balance = walletBalance.rows[0]?.balance_after ? parseFloat(walletBalance.rows[0].balance_after) : 0;
    const topups = topupStats.rows[0];

    const totalAttempted = status.total_bookings_attempted || 0;
    const confirmedCount = status.confirmed_count || 0;
    const conversionRate = totalAttempted > 0 ? Math.round((confirmedCount / totalAttempted) * 100) : 0;

    res.json({
      sales: {
        total_tickets_sold: sales.total_tickets_sold || 0,
        total_gross_collection: parseFloat(sales.total_gross_collection || '0'),
        daily: {
          tickets_sold: sales.tickets_sold_daily || 0,
          collection: parseFloat(sales.collection_daily || '0'),
        },
        weekly: {
          tickets_sold: sales.tickets_sold_weekly || 0,
          collection: parseFloat(sales.collection_weekly || '0'),
        },
        monthly: {
          tickets_sold: sales.tickets_sold_monthly || 0,
          collection: parseFloat(sales.collection_monthly || '0'),
        },
      },
      bookings: {
        total_attempted: totalAttempted,
        confirmed_count: confirmedCount,
        expired_missed_count: status.expired_missed_count || 0,
        cancelled_count: status.cancelled_count || 0,
        conversion_rate: conversionRate,
      },
      wallet: {
        current_balance: balance,
        approved_recharges_count: topups.approved_recharges_count || 0,
        total_recharged_amount: parseFloat(topups.total_recharged_amount || '0'),
        pending_recharges_count: topups.pending_recharges_count || 0,
      },
      recent_bookings: recentBookings.rows.map((r: any) => ({
        booking_id: r.booking_id,
        game_id: r.game_id,
        game_title: r.game_title,
        housie_name: r.housie_name,
        ticket_count: r.ticket_count || 0,
        total_amount: parseFloat(r.total_amount),
        booking_status: r.booking_status,
        locked_at: r.locked_at,
        confirmed_at: r.confirmed_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching bookie stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


