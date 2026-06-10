/**
 * Stats Controller
 * Aggregate KPI numbers for the staff overview, plus the public Hall of Fame.
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';

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
    console.error('Error fetching overview stats:', error);
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
    console.error('Error fetching hall of fame:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
