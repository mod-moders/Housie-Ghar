/**
 * Loyalty layer — end-to-end verification against a real Postgres.
 *
 * Kept OUT of `npm test` on purpose: that suite is pure-function only and must stay
 * runnable without a database. Run this one explicitly:
 *
 *   npx ts-node scripts/verify-loyalty.ts
 *
 * Everything happens inside a transaction that is ALWAYS rolled back, so it is safe
 * to point at a database with real data in it.
 */

import pool from '../src/db';
import type { PoolClient } from 'pg';
import {
  getLoyaltyConfig,
  awardBookieTickets,
  qualifyReferralOnFirstSale,
  redeemBookieFreeTicket,
  redeemPlayerCredit,
  refundPlayerCreditForBooking,
  recordRedemption,
  computeBookiePoints,
  computePlayerRewards,
} from '../src/services/loyalty';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✘\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

async function makeBookie(client: PoolClient, name: string): Promise<string> {
  const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const r = await client.query(
    `INSERT INTO Users (role_id, full_name, username, email, password_hash, current_balance, status)
     VALUES (4, $1, $2, $3, 'x', 100000, 'Active') RETURNING user_id`,
    [name, `verify_${uniq}`, `verify-${uniq}@verify.local`]
  );
  return r.rows[0].user_id;
}

async function makePlayer(client: PoolClient, housie: string, referredBy: string | null = null): Promise<string> {
  const r = await client.query(
    `INSERT INTO Players (housie_name, referred_by) VALUES ($1, $2) RETURNING player_id`,
    [housie, referredBy]
  );
  return r.rows[0].player_id;
}

async function main(): Promise<void> {
  const client = await pool.connect();
  const stamp = Date.now();

  try {
    await client.query('BEGIN');

    const cfg = await getLoyaltyConfig(client);
    console.log('\nConfig loaded from Platform_Config:');
    console.log(`  ${cfg.ticketsPerPoint} tickets/point · ${cfg.pointsPerFreeTicket} points/free ticket · ladder ${cfg.referralThresholds.join(',')} step ${cfg.referralRepeatStep}\n`);

    // -----------------------------------------------------------------------
    console.log('Bookie point accrual');
    // -----------------------------------------------------------------------
    const bookie = await makeBookie(client, 'Verify Bookie');

    await awardBookieTickets(client, bookie, 3);
    let row = (await client.query(`SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1`, [bookie])).rows[0];
    eq('3 tickets sold earns 0 points', computeBookiePoints(row.lifetime_tickets_sold, row.reward_points_redeemed, cfg).pointsEarned, 0);

    // The remainder-carry case: a second booking of 2 completes the first point.
    await awardBookieTickets(client, bookie, 2);
    row = (await client.query(`SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1`, [bookie])).rows[0];
    eq('3 then 2 tickets carries the remainder into 1 point', computeBookiePoints(row.lifetime_tickets_sold, row.reward_points_redeemed, cfg).pointsEarned, 1);

    await awardBookieTickets(client, bookie, 0);
    await awardBookieTickets(client, bookie, -5);
    row = (await client.query(`SELECT lifetime_tickets_sold FROM Users WHERE user_id = $1`, [bookie])).rows[0];
    eq('zero and negative ticket counts are ignored', row.lifetime_tickets_sold, 5);

    // -----------------------------------------------------------------------
    console.log('\nBookie redemption');
    // -----------------------------------------------------------------------
    let redeem = await redeemBookieFreeTicket(client, bookie, 100, cfg);
    eq('cannot redeem with only 1 point', redeem.amountWaived, 0);

    await awardBookieTickets(client, bookie, 45); // 50 total = 10 points
    row = (await client.query(`SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1`, [bookie])).rows[0];
    eq('50 tickets = 1 free ticket available', computeBookiePoints(row.lifetime_tickets_sold, row.reward_points_redeemed, cfg).freeTicketsAvailable, 1);

    redeem = await redeemBookieFreeTicket(client, bookie, 100, cfg);
    eq('redeems ₹100', redeem.amountWaived, 100);
    eq('spends 10 points', redeem.pointsSpent, 10);

    row = (await client.query(`SELECT lifetime_tickets_sold, reward_points_redeemed FROM Users WHERE user_id = $1`, [bookie])).rows[0];
    eq('points balance drops to 0 after redeeming', computeBookiePoints(row.lifetime_tickets_sold, row.reward_points_redeemed, cfg).freeTicketsAvailable, 0);

    const second = await redeemBookieFreeTicket(client, bookie, 100, cfg);
    eq('cannot double-spend the same points', second.amountWaived, 0);

    const zeroPrice = await redeemBookieFreeTicket(client, bookie, 0, cfg);
    eq('a zero ticket price waives nothing', zeroPrice.amountWaived, 0);

    const disabled = await redeemBookieFreeTicket(client, bookie, 100, { ...cfg, enabled: false });
    eq('master switch off blocks redemption', disabled.amountWaived, 0);

    // -----------------------------------------------------------------------
    console.log('\nReferral qualification');
    // -----------------------------------------------------------------------
    const referrer = await makePlayer(client, `ref_${stamp}`);
    const referee = await makePlayer(client, `friend_${stamp}`, referrer);
    await makePlayer(client, `solo_${stamp}`); // no referrer

    const bump = await qualifyReferralOnFirstSale(client, `friend_${stamp}`);
    eq('first sale qualifies the referral', bump?.referrerQualified, 1);

    const again = await qualifyReferralOnFirstSale(client, `friend_${stamp}`);
    check('second booking by the same player does not re-qualify', again === null);

    const noRef = await qualifyReferralOnFirstSale(client, `solo_${stamp}`);
    check('a player with no referrer never qualifies anyone', noRef === null);

    const ghost = await qualifyReferralOnFirstSale(client, `does_not_exist_${stamp}`);
    check('an unknown housie name is a safe no-op', ghost === null);

    // -----------------------------------------------------------------------
    console.log('\nReferral ladder against live data');
    // -----------------------------------------------------------------------
    // Walk the referrer up to 20 qualified referrals and assert each rung.
    for (let i = 2; i <= 20; i++) {
      await makePlayer(client, `f${i}_${stamp}`, referrer);
      await qualifyReferralOnFirstSale(client, `f${i}_${stamp}`);
    }
    const refRow = (await client.query(`SELECT qualified_referrals, reward_credits_redeemed FROM Players WHERE player_id = $1`, [referrer])).rows[0];
    eq('20 friends bought tickets', refRow.qualified_referrals, 20);
    eq('20 qualified referrals = 3 credits', computePlayerRewards(refRow.qualified_referrals, refRow.reward_credits_redeemed, cfg).creditsEarned, 3);

    // -----------------------------------------------------------------------
    console.log('\nPlayer credit redemption and refund');
    // -----------------------------------------------------------------------
    const pRedeem = await redeemPlayerCredit(client, `ref_${stamp}`, 100, cfg);
    eq('player redeems one ₹100 credit', pRedeem.amountWaived, 100);

    const noCredit = await redeemPlayerCredit(client, `solo_${stamp}`, 100, cfg);
    eq('a player with no credits waives nothing', noCredit.amountWaived, 0);

    const unknownPlayer = await redeemPlayerCredit(client, `nobody_${stamp}`, 100, cfg);
    eq('unknown player waives nothing', unknownPlayer.amountWaived, 0);

    // Build a real booking carrying an applied credit, then release it.
    const game = (await client.query(`SELECT game_id FROM Scheduled_Games ORDER BY created_at DESC LIMIT 1`)).rows[0];
    if (game) {
      const bk = (await client.query(
        `INSERT INTO Bookings (game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
                               booking_status, locked_until, player_credit_applied, reward_amount_waived)
         VALUES ($1, ARRAY[]::integer[], $2, $3, 200, 'Locked', NOW() + INTERVAL '10 minutes', TRUE, 100)
         RETURNING booking_id`,
        [game.game_id, `ref_${stamp}`, bookie]
      )).rows[0];

      await recordRedemption(client, {
        redeemerType: 'Player', playerId: referrer, bookingId: bk.booking_id,
        gameId: game.game_id, unitsSpent: 1, amountWaived: 100,
      });

      const before = (await client.query(`SELECT reward_credits_redeemed FROM Players WHERE player_id = $1`, [referrer])).rows[0].reward_credits_redeemed;
      const refunded = await refundPlayerCreditForBooking(client, bk.booking_id);
      const after = (await client.query(`SELECT reward_credits_redeemed FROM Players WHERE player_id = $1`, [referrer])).rows[0].reward_credits_redeemed;

      check('an expired/rejected lock refunds the credit', refunded && after === before - 1, `before=${before} after=${after}`);

      const twice = await refundPlayerCreditForBooking(client, bk.booking_id);
      check('refunding the same booking twice is a no-op', twice === false);

      const auditGone = (await client.query(`SELECT COUNT(*)::int AS n FROM Reward_Redemptions WHERE booking_id = $1`, [bk.booking_id])).rows[0].n;
      eq('the refunded redemption is removed from the audit trail', auditGone, 0);

      // The unique index must stop the same booking being waived twice.
      await recordRedemption(client, {
        redeemerType: 'Bookie', bookieId: bookie, bookingId: bk.booking_id,
        gameId: game.game_id, unitsSpent: 10, amountWaived: 100,
      });
      await recordRedemption(client, {
        redeemerType: 'Bookie', bookieId: bookie, bookingId: bk.booking_id,
        gameId: game.game_id, unitsSpent: 10, amountWaived: 100,
      });
      const dupes = (await client.query(`SELECT COUNT(*)::int AS n FROM Reward_Redemptions WHERE booking_id = $1`, [bk.booking_id])).rows[0].n;
      eq('one booking can only ever carry one redemption', dupes, 1);
    } else {
      console.log('  \x1b[33m•\x1b[0m skipped booking-level checks (no games in this database)');
    }

    const noBooking = await refundPlayerCreditForBooking(client, '');
    check('refunding an empty booking id is a safe no-op', noBooking === false);

    // -----------------------------------------------------------------------
    console.log('\nDatabase constraints');
    // -----------------------------------------------------------------------
    try {
      await client.query('SAVEPOINT s1');
      await client.query(`UPDATE Players SET referred_by = player_id WHERE player_id = $1`, [referrer]);
      await client.query('RELEASE SAVEPOINT s1');
      check('self-referral is rejected by the database', false, 'the UPDATE succeeded');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT s1');
      check('self-referral is rejected by the database', true);
    }

    try {
      await client.query('SAVEPOINT s2');
      await client.query(`UPDATE Users SET reward_points_redeemed = -1 WHERE user_id = $1`, [bookie]);
      await client.query('RELEASE SAVEPOINT s2');
      check('negative redeemed points are rejected', false, 'the UPDATE succeeded');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT s2');
      check('negative redeemed points are rejected', true);
    }

    try {
      await client.query('SAVEPOINT s3');
      await client.query(
        `INSERT INTO Reward_Redemptions (redeemer_type, units_spent, amount_waived) VALUES ('Bookie', 10, 100)`
      );
      await client.query('RELEASE SAVEPOINT s3');
      check('a redemption with no actor is rejected', false, 'the INSERT succeeded');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT s3');
      check('a redemption with no actor is rejected', true);
    }

    void referee;
  } finally {
    // Always roll back — this script must never leave data behind.
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nVerification crashed:', err);
  process.exit(1);
});
