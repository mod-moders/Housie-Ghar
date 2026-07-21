/**
 * Loyalty Service — bookie reward points and player referral ladder.
 *
 * Design notes (see migration 043 and bookieNF.md):
 *
 *  - Bookie points are DERIVED, never stored. `Users.lifetime_tickets_sold` is the
 *    single accrual counter and points are always `floor(lifetime / ticketsPerPoint)`.
 *    That makes the "sold 3 tickets, then 2 tickets" case award exactly 1 point with
 *    no per-booking remainder to track, and makes the counter impossible to drift.
 *
 *  - Player referral rewards are derived the same way from `qualified_referrals`,
 *    which only ever increments via a one-time flip of the referred player's
 *    `referral_qualified_at`.
 *
 *  - The house absorbs every redemption. Redemptions are recorded twice on purpose:
 *    `Reward_Redemptions` (the reward-program audit trail) and `Wallet_Ledger`
 *    (so the waived rupees show up in the same place as every other money movement).
 */

import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface LoyaltyConfig {
  enabled: boolean;
  /** Tickets a bookie must sell to earn one point. */
  ticketsPerPoint: number;
  /** Points a bookie spends for one free ticket. */
  pointsPerFreeTicket: number;
  /** Cumulative qualified-referral counts that each grant one free-ticket credit. */
  referralThresholds: number[];
  /** After the last threshold, grant another credit every N referrals. 0 disables. */
  referralRepeatStep: number;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: true,
  ticketsPerPoint: 5,
  pointsPerFreeTicket: 10,
  referralThresholds: [10, 15, 20],
  referralRepeatStep: 10,
};

/**
 * Parse a "10,15,20" config string into ascending, de-duplicated positive integers.
 * Junk entries are dropped rather than throwing — a malformed config row must never
 * take down the booking path.
 */
export function parseThresholds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of String(raw).split(',')) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function parsePositiveInt(raw: string | undefined, fallback: number, allowZero = false): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  if (n === 0 && !allowZero) return fallback;
  return n;
}

/** Read the tunable rates from Platform_Config, falling back to defaults per-key. */
export async function getLoyaltyConfig(client: PoolClient): Promise<LoyaltyConfig> {
  const res = await client.query(
    `SELECT config_key, config_value FROM Platform_Config WHERE config_key = ANY($1)`,
    [[
      'loyalty_rewards_enabled',
      'bookie_tickets_per_point',
      'bookie_points_per_free_ticket',
      'referral_ladder_thresholds',
      'referral_ladder_repeat_step',
    ]]
  );

  const map = new Map<string, string>();
  for (const row of res.rows) map.set(row.config_key, row.config_value);

  const thresholds = parseThresholds(map.get('referral_ladder_thresholds'));

  return {
    enabled: (map.get('loyalty_rewards_enabled') ?? 'true').toLowerCase() !== 'false',
    ticketsPerPoint: parsePositiveInt(map.get('bookie_tickets_per_point'), DEFAULT_LOYALTY_CONFIG.ticketsPerPoint),
    pointsPerFreeTicket: parsePositiveInt(
      map.get('bookie_points_per_free_ticket'),
      DEFAULT_LOYALTY_CONFIG.pointsPerFreeTicket
    ),
    referralThresholds: thresholds.length > 0 ? thresholds : DEFAULT_LOYALTY_CONFIG.referralThresholds,
    referralRepeatStep: parsePositiveInt(
      map.get('referral_ladder_repeat_step'),
      DEFAULT_LOYALTY_CONFIG.referralRepeatStep,
      true
    ),
  };
}

// ---------------------------------------------------------------------------
// Pure math — bookie points
// ---------------------------------------------------------------------------

/** Total points a bookie has ever earned. */
export function pointsEarned(lifetimeTicketsSold: number, ticketsPerPoint: number): number {
  if (!Number.isFinite(lifetimeTicketsSold) || lifetimeTicketsSold <= 0) return 0;
  if (!Number.isFinite(ticketsPerPoint) || ticketsPerPoint <= 0) return 0;
  return Math.floor(lifetimeTicketsSold / ticketsPerPoint);
}

export interface BookiePointsView {
  lifetimeTicketsSold: number;
  pointsEarned: number;
  pointsRedeemed: number;
  pointsAvailable: number;
  /** Whole free tickets the available points can currently buy. */
  freeTicketsAvailable: number;
  /** Tickets still to sell before the next point lands. */
  ticketsToNextPoint: number;
  /** Points still to earn before the next free ticket unlocks. */
  pointsToNextFreeTicket: number;
}

export function computeBookiePoints(
  lifetimeTicketsSold: number,
  pointsRedeemed: number,
  cfg: Pick<LoyaltyConfig, 'ticketsPerPoint' | 'pointsPerFreeTicket'>
): BookiePointsView {
  const lifetime = Math.max(0, Math.floor(lifetimeTicketsSold || 0));
  const redeemed = Math.max(0, Math.floor(pointsRedeemed || 0));
  const earned = pointsEarned(lifetime, cfg.ticketsPerPoint);
  // clamp: a config change that lowers ticketsPerPoint must never show negative balance
  const available = Math.max(0, earned - redeemed);
  const perFree = cfg.pointsPerFreeTicket > 0 ? cfg.pointsPerFreeTicket : DEFAULT_LOYALTY_CONFIG.pointsPerFreeTicket;
  const freeTickets = Math.floor(available / perFree);

  const remainderTickets = cfg.ticketsPerPoint > 0 ? lifetime % cfg.ticketsPerPoint : 0;
  const ticketsToNextPoint = cfg.ticketsPerPoint > 0 ? cfg.ticketsPerPoint - remainderTickets : 0;

  return {
    lifetimeTicketsSold: lifetime,
    pointsEarned: earned,
    pointsRedeemed: redeemed,
    pointsAvailable: available,
    freeTicketsAvailable: freeTickets,
    ticketsToNextPoint,
    pointsToNextFreeTicket: perFree - (available % perFree),
  };
}

// ---------------------------------------------------------------------------
// Pure math — player referral ladder
// ---------------------------------------------------------------------------

/**
 * Free-ticket credits earned for a given number of QUALIFIED referrals.
 *
 * Thresholds are cumulative (the D1 decision): with [10,15,20] and step 10 a player
 * earns a credit at their 10th, 15th and 20th qualified referral, then one more
 * every 10 after that (30th, 40th, ...).
 */
export function referralRewardsEarned(
  qualifiedReferrals: number,
  thresholds: number[],
  repeatStep: number
): number {
  const n = Math.max(0, Math.floor(qualifiedReferrals || 0));
  if (n === 0) return 0;

  const sorted = [...thresholds].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return repeatStep > 0 ? Math.floor(n / repeatStep) : 0;
  }

  let earned = sorted.filter((t) => n >= t).length;

  const last = sorted[sorted.length - 1];
  if (repeatStep > 0 && n > last) {
    earned += Math.floor((n - last) / repeatStep);
  }
  return earned;
}

/**
 * The referral count at which the NEXT credit unlocks, or null when the ladder has
 * no further rungs (no repeat step configured and every threshold already passed).
 */
export function nextReferralRung(
  qualifiedReferrals: number,
  thresholds: number[],
  repeatStep: number
): number | null {
  const n = Math.max(0, Math.floor(qualifiedReferrals || 0));
  const sorted = [...thresholds].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return repeatStep > 0 ? (Math.floor(n / repeatStep) + 1) * repeatStep : null;
  }

  const upcoming = sorted.find((t) => t > n);
  if (upcoming !== undefined) return upcoming;

  if (repeatStep <= 0) return null;

  const last = sorted[sorted.length - 1];
  return last + (Math.floor((n - last) / repeatStep) + 1) * repeatStep;
}

export interface PlayerRewardsView {
  qualifiedReferrals: number;
  creditsEarned: number;
  creditsRedeemed: number;
  creditsAvailable: number;
  nextRungAt: number | null;
  referralsToNextRung: number | null;
}

export function computePlayerRewards(
  qualifiedReferrals: number,
  creditsRedeemed: number,
  cfg: Pick<LoyaltyConfig, 'referralThresholds' | 'referralRepeatStep'>
): PlayerRewardsView {
  const qualified = Math.max(0, Math.floor(qualifiedReferrals || 0));
  const redeemed = Math.max(0, Math.floor(creditsRedeemed || 0));
  const earned = referralRewardsEarned(qualified, cfg.referralThresholds, cfg.referralRepeatStep);
  const next = nextReferralRung(qualified, cfg.referralThresholds, cfg.referralRepeatStep);

  return {
    qualifiedReferrals: qualified,
    creditsEarned: earned,
    creditsRedeemed: redeemed,
    creditsAvailable: Math.max(0, earned - redeemed),
    nextRungAt: next,
    referralsToNextRung: next === null ? null : next - qualified,
  };
}

// ---------------------------------------------------------------------------
// DB side effects — all take an in-transaction client from the caller
// ---------------------------------------------------------------------------

/**
 * Credit a bookie with the tickets they just sold. Called from every path where an
 * agent's wallet funds a sale. Overflow/staff bookings do NOT call this — no bookie
 * funded them, so no bookie earns points for them.
 */
export async function awardBookieTickets(
  client: PoolClient,
  agentId: string,
  ticketCount: number
): Promise<void> {
  if (!agentId || !Number.isFinite(ticketCount) || ticketCount <= 0) return;
  await client.query(
    `UPDATE Users SET lifetime_tickets_sold = lifetime_tickets_sold + $1 WHERE user_id = $2`,
    [Math.floor(ticketCount), agentId]
  );
}

/**
 * Flip a player from "referred" to "qualified" on their first Sold booking and
 * credit the referrer.
 *
 * Idempotent by construction: the UPDATE only matches while `referral_qualified_at`
 * is still NULL, so a player's second, third and hundredth booking are all no-ops.
 * Returns the referrer's player_id when a rung was actually crossed, so the caller
 * can push a socket update.
 */
export async function qualifyReferralOnFirstSale(
  client: PoolClient,
  housieName: string
): Promise<{ referrerId: string; referrerQualified: number } | null> {
  if (!housieName) return null;

  // Single statement: claim the qualification and read back the referrer atomically.
  const claimed = await client.query(
    `UPDATE Players
        SET referral_qualified_at = NOW()
      WHERE housie_name = $1
        AND referral_qualified_at IS NULL
        AND referred_by IS NOT NULL
      RETURNING referred_by`,
    [housieName.trim()]
  );

  if (claimed.rows.length === 0) return null;

  const referrerId: string = claimed.rows[0].referred_by;
  const bumped = await client.query(
    `UPDATE Players
        SET qualified_referrals = qualified_referrals + 1
      WHERE player_id = $1
      RETURNING qualified_referrals`,
    [referrerId]
  );

  if (bumped.rows.length === 0) return null;
  return { referrerId, referrerQualified: bumped.rows[0].qualified_referrals as number };
}

/**
 * Spend a bookie's points on one free ticket.
 *
 * Re-reads and locks the bookie row inside the caller's transaction so two
 * concurrent confirms can't both spend the same points. Returns the rupee amount to
 * waive, or 0 when the bookie can't afford a free ticket (in which case the caller
 * proceeds with a normal full-price sale rather than failing the booking).
 */
export async function redeemBookieFreeTicket(
  client: PoolClient,
  agentId: string,
  ticketPrice: number,
  cfg: LoyaltyConfig
): Promise<{ amountWaived: number; pointsSpent: number }> {
  const none = { amountWaived: 0, pointsSpent: 0 };
  if (!cfg.enabled || !agentId || !Number.isFinite(ticketPrice) || ticketPrice <= 0) return none;

  const res = await client.query(
    `SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1 FOR UPDATE`,
    [agentId]
  );
  if (res.rows.length === 0) return none;

  const view = computeBookiePoints(
    res.rows[0].lifetime_tickets_sold,
    res.rows[0].reward_points_redeemed,
    cfg
  );
  if (view.freeTicketsAvailable < 1) return none;

  await client.query(
    `UPDATE Users SET reward_points_redeemed = reward_points_redeemed + $1 WHERE user_id = $2`,
    [cfg.pointsPerFreeTicket, agentId]
  );

  return { amountWaived: ticketPrice, pointsSpent: cfg.pointsPerFreeTicket };
}

/**
 * Spend one of a player's referral credits. Same locking rationale as the bookie
 * path. Returns 0 when the player has no credit, so booking proceeds at full price.
 */
export async function redeemPlayerCredit(
  client: PoolClient,
  housieName: string,
  ticketPrice: number,
  cfg: LoyaltyConfig
): Promise<{ amountWaived: number; playerId: string | null }> {
  const none = { amountWaived: 0, playerId: null };
  if (!cfg.enabled || !housieName || !Number.isFinite(ticketPrice) || ticketPrice <= 0) return none;

  const res = await client.query(
    `SELECT player_id, qualified_referrals, reward_credits_redeemed
       FROM Players WHERE housie_name = $1 FOR UPDATE`,
    [housieName.trim()]
  );
  if (res.rows.length === 0) return none;

  const row = res.rows[0];
  const view = computePlayerRewards(row.qualified_referrals, row.reward_credits_redeemed, cfg);
  if (view.creditsAvailable < 1) return none;

  await client.query(
    `UPDATE Players SET reward_credits_redeemed = reward_credits_redeemed + 1 WHERE player_id = $1`,
    [row.player_id]
  );

  return { amountWaived: ticketPrice, playerId: row.player_id as string };
}

/**
 * Give a player's credit back when a lock is released without a sale (expired or
 * rejected). Without this, a player who locks tickets and lets them time out would
 * silently lose a reward they earned.
 *
 * Idempotent: the UPDATE only matches while `player_credit_applied` is still TRUE,
 * so the sweeper and a manual reject racing on the same booking refund exactly once.
 * The audit row is deleted rather than kept because the redemption did not happen.
 */
export async function refundPlayerCreditForBooking(
  client: PoolClient,
  bookingId: string
): Promise<boolean> {
  if (!bookingId) return false;

  const released = await client.query(
    `UPDATE Bookings
        SET player_credit_applied = FALSE, reward_amount_waived = 0
      WHERE booking_id = $1 AND player_credit_applied = TRUE
      RETURNING housie_name`,
    [bookingId]
  );
  if (released.rows.length === 0) return false;

  await client.query(
    `UPDATE Players
        SET reward_credits_redeemed = GREATEST(reward_credits_redeemed - 1, 0)
      WHERE housie_name = $1`,
    [released.rows[0].housie_name]
  );

  await client.query(`DELETE FROM Reward_Redemptions WHERE booking_id = $1 AND redeemer_type = 'Player'`, [
    bookingId,
  ]);

  return true;
}

/** Write the immutable audit row for a redemption. */
export async function recordRedemption(
  client: PoolClient,
  params: {
    redeemerType: 'Bookie' | 'Player';
    bookieId?: string | null;
    playerId?: string | null;
    bookingId?: string | null;
    gameId?: string | null;
    unitsSpent: number;
    amountWaived: number;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO Reward_Redemptions
       (redeemer_type, bookie_id, player_id, booking_id, game_id, units_spent, amount_waived)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      params.redeemerType,
      params.bookieId ?? null,
      params.playerId ?? null,
      params.bookingId ?? null,
      params.gameId ?? null,
      params.unitsSpent,
      params.amountWaived,
    ]
  );
}
