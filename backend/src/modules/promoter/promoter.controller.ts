import { Response } from 'express';
import pool from '../../db';

export async function getReferrals(req: any, res: Response): Promise<void> {
  const promoterId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT p.player_id, p.full_name, p.housie_name, pr.referred_at
       FROM Promoter_Referrals pr
       JOIN Players p ON pr.player_id = p.player_id
       WHERE pr.promoter_id = $1
       ORDER BY pr.referred_at DESC`,
      [promoterId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching promoter referrals:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getEarnings(req: any, res: Response): Promise<void> {
  const promoterId = req.user.userId;

  try {
    // 1. Fetch historical commissions list
    const commissionsResult = await pool.query(
      `SELECT pc.commission_id, pc.booking_id, pc.amount, pc.created_at,
              g.title as game_title, b.housie_name as player_housie_name
       FROM Promoter_Commissions pc
       JOIN Scheduled_Games g ON pc.game_id = g.game_id
       JOIN Bookings b ON pc.booking_id::uuid = b.booking_id
       WHERE pc.promoter_id = $1
       ORDER BY pc.created_at DESC`,
      [promoterId]
    );

    // 2. Fetch current balance & lifetime earnings
    const statsResult = await pool.query(
      `SELECT current_balance, 
              (SELECT COALESCE(SUM(amount), 0) FROM Promoter_Commissions WHERE promoter_id = $1) as lifetime_commissions
       FROM Users 
       WHERE user_id = $1`,
      [promoterId]
    );

    const stats = statsResult.rows[0] || { current_balance: 0, lifetime_commissions: 0 };

    res.json({
      current_balance: parseFloat(stats.current_balance),
      lifetime_earnings: parseFloat(stats.lifetime_commissions),
      commissions: commissionsResult.rows.map((r) => ({
        commission_id: r.commission_id,
        booking_id: r.booking_id,
        amount: parseFloat(r.amount),
        created_at: r.created_at,
        game_title: r.game_title,
        player_housie_name: r.player_housie_name,
      })),
    });
  } catch (error) {
    console.error('Error fetching promoter earnings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
