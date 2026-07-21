import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseThresholds,
  pointsEarned,
  computeBookiePoints,
  referralRewardsEarned,
  nextReferralRung,
  computePlayerRewards,
  DEFAULT_LOYALTY_CONFIG,
} from './loyalty';

const BOOKIE_CFG = { ticketsPerPoint: 5, pointsPerFreeTicket: 10 };
const LADDER = { referralThresholds: [10, 15, 20], referralRepeatStep: 10 };

// ---------------------------------------------------------------------------
// parseThresholds
// ---------------------------------------------------------------------------

test('parseThresholds reads a well-formed config string', () => {
  assert.deepEqual(parseThresholds('10,15,20'), [10, 15, 20]);
});

test('parseThresholds tolerates whitespace, junk, dupes and disorder', () => {
  assert.deepEqual(parseThresholds(' 20, 10 ,abc,15,,10,-4,0 '), [10, 15, 20]);
});

test('parseThresholds returns empty for null/undefined/empty input', () => {
  assert.deepEqual(parseThresholds(null), []);
  assert.deepEqual(parseThresholds(undefined), []);
  assert.deepEqual(parseThresholds(''), []);
});

// ---------------------------------------------------------------------------
// Bookie points accrual
// ---------------------------------------------------------------------------

test('pointsEarned floors at the configured rate', () => {
  assert.equal(pointsEarned(0, 5), 0);
  assert.equal(pointsEarned(4, 5), 0);
  assert.equal(pointsEarned(5, 5), 1);
  assert.equal(pointsEarned(9, 5), 1);
  assert.equal(pointsEarned(50, 5), 10);
});

test('pointsEarned is defensive about nonsense inputs', () => {
  assert.equal(pointsEarned(-10, 5), 0);
  assert.equal(pointsEarned(10, 0), 0);
  assert.equal(pointsEarned(10, -5), 0);
  assert.equal(pointsEarned(Number.NaN, 5), 0);
});

test('remainder carries across bookings — 3 tickets then 2 tickets is 1 point', () => {
  // The whole reason accrual is a single lifetime counter instead of per-booking math.
  assert.equal(computeBookiePoints(3, 0, BOOKIE_CFG).pointsEarned, 0);
  assert.equal(computeBookiePoints(3 + 2, 0, BOOKIE_CFG).pointsEarned, 1);
});

test('50 tickets sold buys exactly one free ticket at the documented 2% rate', () => {
  // bookieNF.md §3: "₹100 free per 50 tickets sold".
  const v = computeBookiePoints(50, 0, BOOKIE_CFG);
  assert.equal(v.pointsEarned, 10);
  assert.equal(v.freeTicketsAvailable, 1);
});

test('redeemed points are subtracted from available', () => {
  const v = computeBookiePoints(100, 10, BOOKIE_CFG);
  assert.equal(v.pointsEarned, 20);
  assert.equal(v.pointsAvailable, 10);
  assert.equal(v.freeTicketsAvailable, 1);
});

test('available points never go negative if the rate is retuned downward', () => {
  // Bookie redeemed 20 points under an old rate; config now yields fewer earned points.
  const v = computeBookiePoints(10, 20, BOOKIE_CFG);
  assert.equal(v.pointsEarned, 2);
  assert.equal(v.pointsAvailable, 0);
  assert.equal(v.freeTicketsAvailable, 0);
});

test('progress counters point at the next milestone', () => {
  const v = computeBookiePoints(7, 0, BOOKIE_CFG); // 1 point, 2 tickets into the next
  assert.equal(v.pointsEarned, 1);
  assert.equal(v.ticketsToNextPoint, 3);
  assert.equal(v.pointsToNextFreeTicket, 9);
});

test('a bookie at exactly zero shows a full run to the first point', () => {
  const v = computeBookiePoints(0, 0, BOOKIE_CFG);
  assert.equal(v.ticketsToNextPoint, 5);
  assert.equal(v.pointsToNextFreeTicket, 10);
  assert.equal(v.freeTicketsAvailable, 0);
});

test('computeBookiePoints falls back when pointsPerFreeTicket is misconfigured to 0', () => {
  const v = computeBookiePoints(100, 0, { ticketsPerPoint: 5, pointsPerFreeTicket: 0 });
  assert.equal(v.freeTicketsAvailable, 2); // uses the 10-point default, not a divide-by-zero
});

// ---------------------------------------------------------------------------
// Referral ladder — the D1 decision: CUMULATIVE thresholds
// ---------------------------------------------------------------------------

test('no credits before the first rung', () => {
  for (const n of [0, 1, 5, 9]) {
    assert.equal(referralRewardsEarned(n, LADDER.referralThresholds, LADDER.referralRepeatStep), 0);
  }
});

test('cumulative rungs fire at 10, 15 and 20', () => {
  const r = (n: number) => referralRewardsEarned(n, LADDER.referralThresholds, LADDER.referralRepeatStep);
  assert.equal(r(10), 1);
  assert.equal(r(14), 1);
  assert.equal(r(15), 2);
  assert.equal(r(19), 2);
  assert.equal(r(20), 3);
});

test('after the last threshold the ladder repeats every 10', () => {
  const r = (n: number) => referralRewardsEarned(n, LADDER.referralThresholds, LADDER.referralRepeatStep);
  assert.equal(r(29), 3);
  assert.equal(r(30), 4);
  assert.equal(r(39), 4);
  assert.equal(r(40), 5);
  assert.equal(r(100), 11);
});

test('repeat step of 0 caps the ladder at the last threshold', () => {
  assert.equal(referralRewardsEarned(20, [10, 15, 20], 0), 3);
  assert.equal(referralRewardsEarned(999, [10, 15, 20], 0), 3);
});

test('empty thresholds degrade to a pure repeating ladder', () => {
  assert.equal(referralRewardsEarned(9, [], 10), 0);
  assert.equal(referralRewardsEarned(10, [], 10), 1);
  assert.equal(referralRewardsEarned(25, [], 10), 2);
});

test('empty thresholds with no repeat step grants nothing', () => {
  assert.equal(referralRewardsEarned(1000, [], 0), 0);
});

test('referralRewardsEarned handles unsorted and negative input', () => {
  assert.equal(referralRewardsEarned(15, [20, 10, 15], 10), 2);
  assert.equal(referralRewardsEarned(-5, LADDER.referralThresholds, 10), 0);
});

// ---------------------------------------------------------------------------
// Next rung (drives the progress bar)
// ---------------------------------------------------------------------------

test('nextReferralRung walks the thresholds then the repeat step', () => {
  const n = (x: number) => nextReferralRung(x, LADDER.referralThresholds, LADDER.referralRepeatStep);
  assert.equal(n(0), 10);
  assert.equal(n(9), 10);
  assert.equal(n(10), 15);
  assert.equal(n(15), 20);
  assert.equal(n(20), 30);
  assert.equal(n(25), 30);
  assert.equal(n(30), 40);
});

test('nextReferralRung returns null when the ladder is finished', () => {
  assert.equal(nextReferralRung(20, [10, 15, 20], 0), null);
  assert.equal(nextReferralRung(50, [10, 15, 20], 0), null);
});

test('nextReferralRung handles the empty-threshold case', () => {
  assert.equal(nextReferralRung(0, [], 10), 10);
  assert.equal(nextReferralRung(10, [], 10), 20);
  assert.equal(nextReferralRung(5, [], 0), null);
});

// ---------------------------------------------------------------------------
// Player rewards view
// ---------------------------------------------------------------------------

test('computePlayerRewards nets redeemed credits off earned', () => {
  const v = computePlayerRewards(20, 1, LADDER);
  assert.equal(v.creditsEarned, 3);
  assert.equal(v.creditsRedeemed, 1);
  assert.equal(v.creditsAvailable, 2);
  assert.equal(v.nextRungAt, 30);
  assert.equal(v.referralsToNextRung, 10);
});

test('computePlayerRewards clamps at zero when redeemed exceeds earned', () => {
  const v = computePlayerRewards(10, 5, LADDER);
  assert.equal(v.creditsEarned, 1);
  assert.equal(v.creditsAvailable, 0);
});

test('a brand new player sees the first rung as their target', () => {
  const v = computePlayerRewards(0, 0, LADDER);
  assert.equal(v.creditsAvailable, 0);
  assert.equal(v.nextRungAt, 10);
  assert.equal(v.referralsToNextRung, 10);
});

test('a finished ladder reports no next rung', () => {
  const v = computePlayerRewards(25, 0, { referralThresholds: [10, 15, 20], referralRepeatStep: 0 });
  assert.equal(v.nextRungAt, null);
  assert.equal(v.referralsToNextRung, null);
});

// ---------------------------------------------------------------------------
// Defaults match the document
// ---------------------------------------------------------------------------

test('shipped defaults match bookieNF.md', () => {
  assert.equal(DEFAULT_LOYALTY_CONFIG.ticketsPerPoint, 5); // "1 point per 5 tickets sold"
  assert.equal(DEFAULT_LOYALTY_CONFIG.pointsPerFreeTicket, 10); // "10 points = 1 free ticket"
  assert.deepEqual(DEFAULT_LOYALTY_CONFIG.referralThresholds, [10, 15, 20]); // "10 → 15 → 20"
});
