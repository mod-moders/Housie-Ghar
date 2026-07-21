/**
 * Rewards Controller — read surfaces for the loyalty layer.
 *
 * Accrual and redemption happen inside the booking transactions (see
 * bookings.controller.ts); everything here is read-only reporting:
 *   - getBookieRewards  : a bookie's own points, progress and redemption history
 *   - getPlayerRewards  : a player's referral code, ladder progress and referees
 *   - getRewardsSummary : the CFO's reward-cost P&L line plus abuse signals
 */

import { Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { AuthenticatedPlayerRequest } from '../../middleware/playerAuth';
import {
  getLoyaltyConfig,
  computeBookiePoints,
  computePlayerRewards,
} from '../../services/loyalty';

/**
 * GET /api/rewards/bookie — the authenticated bookie's own reward standing.
 */
export async function getBookieRewards(req: AuthenticatedRequest, res: Response): Promise<void> {
  const agentId = req.user!.userId;
  const client = await pool.connect();

  try {
    const cfg = await getLoyaltyConfig(client);

    const userRes = await client.query(
      `SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1`,
      [agentId]
    );
    if (userRes.rows.length === 0) {
      res.status(404).json({ message: 'Bookie not found' });
      return;
    }

    const view = computeBookiePoints(
      userRes.rows[0].lifetime_tickets_sold,
      userRes.rows[0].reward_points_redeemed,
      cfg
    );

    const historyRes = await client.query(
      `SELECT r.redemption_id, r.units_spent, r.amount_waived, r.created_at,
              b.formatted_booking_id, g.title AS game_title
         FROM Reward_Redemptions r
         LEFT JOIN Bookings b        ON b.booking_id = r.booking_id
         LEFT JOIN Scheduled_Games g ON g.game_id    = r.game_id
        WHERE r.bookie_id = $1 AND r.redeemer_type = 'Bookie'
        ORDER BY r.created_at DESC
        LIMIT 20`,
      [agentId]
    );

    res.json({
      enabled: cfg.enabled,
      tickets_per_point: cfg.ticketsPerPoint,
      points_per_free_ticket: cfg.pointsPerFreeTicket,
      lifetime_tickets_sold: view.lifetimeTicketsSold,
      points_earned: view.pointsEarned,
      points_redeemed: view.pointsRedeemed,
      points_available: view.pointsAvailable,
      free_tickets_available: view.freeTicketsAvailable,
      tickets_to_next_point: view.ticketsToNextPoint,
      points_to_next_free_ticket: view.pointsToNextFreeTicket,
      history: historyRes.rows.map((r) => ({
        redemption_id: r.redemption_id,
        units_spent: r.units_spent,
        amount_waived: parseFloat(r.amount_waived),
        created_at: r.created_at,
        booking_ref: r.formatted_booking_id ?? null,
        game_title: r.game_title ?? null,
      })),
    });
  } catch (error) {
    console.error('Error loading bookie rewards:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/rewards/player — the authenticated player's referral standing.
 */
export async function getPlayerRewards(req: AuthenticatedPlayerRequest, res: Response): Promise<void> {
  const playerId = req.player!.playerId;
  const client = await pool.connect();

  try {
    const cfg = await getLoyaltyConfig(client);

    const playerRes = await client.query(
      `SELECT player_code, qualified_referrals, reward_credits_redeemed FROM Players WHERE player_id = $1`,
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    const row = playerRes.rows[0];

    const view = computePlayerRewards(row.qualified_referrals, row.reward_credits_redeemed, cfg);

    // Everyone this player brought in, qualified or not. Pending rows are what make
    // the ladder feel alive ("2 friends signed up, waiting on their first ticket").
    const refereesRes = await client.query(
      `SELECT housie_name, registered_at, referral_qualified_at
         FROM Players
        WHERE referred_by = $1
        ORDER BY registered_at DESC
        LIMIT 50`,
      [playerId]
    );

    res.json({
      enabled: cfg.enabled,
      referral_code: row.player_code,
      ladder: cfg.referralThresholds,
      ladder_repeat_step: cfg.referralRepeatStep,
      qualified_referrals: view.qualifiedReferrals,
      pending_referrals: refereesRes.rows.filter((r) => !r.referral_qualified_at).length,
      credits_earned: view.creditsEarned,
      credits_redeemed: view.creditsRedeemed,
      credits_available: view.creditsAvailable,
      next_rung_at: view.nextRungAt,
      referrals_to_next_rung: view.referralsToNextRung,
      referees: refereesRes.rows.map((r) => ({
        housie_name: r.housie_name,
        registered_at: r.registered_at,
        qualified: !!r.referral_qualified_at,
      })),
    });
  } catch (error) {
    console.error('Error loading player rewards:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/rewards/summary — Financial Admin / Superadmin only.
 *
 * bookieNF.md §5.2 asks for reward cost to sit in the P&L from day one, and §5.8
 * asks for fraud controls on any points-for-volume incentive. This endpoint is both:
 * total rupees given away, split by program, plus the two abuse signals that
 * actually matter here.
 */
export async function getRewardsSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    const cfg = await getLoyaltyConfig(client);

    // Cost, all-time and last 30 days, split by who redeemed.
    const costRes = await client.query(
      `SELECT redeemer_type,
              COUNT(*)::int                                        AS redemptions,
              COALESCE(SUM(amount_waived), 0)                      AS total_waived,
              COALESCE(SUM(amount_waived) FILTER (
                WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS waived_30d,
              COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '30 days')::int AS redemptions_30d
         FROM Reward_Redemptions
        GROUP BY redeemer_type`
    );

    const byType: Record<string, { redemptions: number; total_waived: number; waived_30d: number; redemptions_30d: number }> = {};
    for (const r of costRes.rows) {
      byType[r.redeemer_type] = {
        redemptions: r.redemptions,
        total_waived: parseFloat(r.total_waived),
        waived_30d: parseFloat(r.waived_30d),
        redemptions_30d: r.redemptions_30d,
      };
    }

    const bookieCost = byType.Bookie ?? { redemptions: 0, total_waived: 0, waived_30d: 0, redemptions_30d: 0 };
    const playerCost = byType.Player ?? { redemptions: 0, total_waived: 0, waived_30d: 0, redemptions_30d: 0 };

    // Per-bookie standing plus the direct-sale share.
    //
    // Abuse signal rationale: points only accrue on a SOLD booking, so the way a
    // bookie inflates them is by self-issuing direct sales to names nobody will
    // ever claim. A bookie whose volume is overwhelmingly direct-sale is the shape
    // worth a human look — it is a prompt to check, not an accusation.
    const bookiesRes = await client.query(
      `SELECT u.user_id,
              u.full_name,
              u.lifetime_tickets_sold,
              u.reward_points_redeemed,
              COALESCE(SUM(CASE WHEN b.confirmed_by = u.user_id AND b.assigned_agent_id = u.user_id
                                 AND b.locked_at = b.confirmed_at
                            THEN COALESCE(array_length(b.ticket_ids, 1), 0) ELSE 0 END), 0)::int AS direct_sale_tickets,
              COALESCE(SUM(CASE WHEN b.booking_status = 'Sold'
                            THEN COALESCE(array_length(b.ticket_ids, 1), 0) ELSE 0 END), 0)::int AS sold_tickets,
              COALESCE((SELECT SUM(amount_waived) FROM Reward_Redemptions rr
                         WHERE rr.bookie_id = u.user_id), 0) AS reward_cost
         FROM Users u
         LEFT JOIN Bookings b ON b.assigned_agent_id = u.user_id AND b.booking_status = 'Sold'
        WHERE u.role_id = 4
        GROUP BY u.user_id, u.full_name, u.lifetime_tickets_sold, u.reward_points_redeemed
        ORDER BY u.lifetime_tickets_sold DESC`
    );

    const bookies = bookiesRes.rows.map((r) => {
      const view = computeBookiePoints(r.lifetime_tickets_sold, r.reward_points_redeemed, cfg);
      const sold = r.sold_tickets as number;
      const direct = r.direct_sale_tickets as number;
      const directShare = sold > 0 ? direct / sold : 0;
      return {
        user_id: r.user_id,
        full_name: r.full_name,
        lifetime_tickets_sold: view.lifetimeTicketsSold,
        points_available: view.pointsAvailable,
        points_redeemed: view.pointsRedeemed,
        free_tickets_available: view.freeTicketsAvailable,
        reward_cost: parseFloat(r.reward_cost),
        sold_tickets: sold,
        direct_sale_tickets: direct,
        direct_sale_share: Math.round(directShare * 100),
        // Only meaningful once there is enough volume for the ratio to mean anything.
        flagged: sold >= 20 && directShare >= 0.9,
      };
    });

    // Referral abuse signal: accounts created and qualified in a very short window
    // are the classic self-referral farm shape.
    const suspiciousReferralsRes = await client.query(
      `SELECT p.housie_name        AS referee,
              r.housie_name        AS referrer,
              p.registered_at,
              p.referral_qualified_at,
              EXTRACT(EPOCH FROM (p.referral_qualified_at - p.registered_at))::int AS seconds_to_qualify
         FROM Players p
         JOIN Players r ON r.player_id = p.referred_by
        WHERE p.referral_qualified_at IS NOT NULL
          AND p.referral_qualified_at - p.registered_at < INTERVAL '5 minutes'
        ORDER BY p.referral_qualified_at DESC
        LIMIT 25`
    );

    const totalCost = bookieCost.total_waived + playerCost.total_waived;
    const totalCost30d = bookieCost.waived_30d + playerCost.waived_30d;

    res.json({
      enabled: cfg.enabled,
      config: {
        tickets_per_point: cfg.ticketsPerPoint,
        points_per_free_ticket: cfg.pointsPerFreeTicket,
        referral_ladder: cfg.referralThresholds,
        referral_repeat_step: cfg.referralRepeatStep,
      },
      cost: {
        total_all_time: totalCost,
        total_30d: totalCost30d,
        bookie_all_time: bookieCost.total_waived,
        bookie_30d: bookieCost.waived_30d,
        player_all_time: playerCost.total_waived,
        player_30d: playerCost.waived_30d,
        redemptions_all_time: bookieCost.redemptions + playerCost.redemptions,
        redemptions_30d: bookieCost.redemptions_30d + playerCost.redemptions_30d,
      },
      bookies,
      // Outstanding liability: rewards earned but not yet spent. This is the number
      // that is invisible in a naive P&L and the one §3 warns about.
      outstanding_free_tickets: bookies.reduce((sum, b) => sum + b.free_tickets_available, 0),
      suspicious_referrals: suspiciousReferralsRes.rows.map((r) => ({
        referee: r.referee,
        referrer: r.referrer,
        registered_at: r.registered_at,
        qualified_at: r.referral_qualified_at,
        seconds_to_qualify: r.seconds_to_qualify,
      })),
    });
  } catch (error) {
    console.error('Error loading rewards summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}
