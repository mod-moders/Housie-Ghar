import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCurrentDayStreak } from './stats.controller';

test('empty history has no streak', () => {
  assert.equal(computeCurrentDayStreak([], '2026-07-25'), 0);
});

test('a single play today is a 1-day streak', () => {
  assert.equal(computeCurrentDayStreak(['2026-07-25'], '2026-07-25'), 1);
});

test('a single play yesterday is still current (1-day streak)', () => {
  assert.equal(computeCurrentDayStreak(['2026-07-24'], '2026-07-25'), 1);
});

test('a last play two or more days ago has an expired streak', () => {
  assert.equal(computeCurrentDayStreak(['2026-07-23'], '2026-07-25'), 0);
  assert.equal(computeCurrentDayStreak(['2026-06-01'], '2026-07-25'), 0);
});

test('three consecutive days ending today is a 3-day streak', () => {
  assert.equal(
    computeCurrentDayStreak(['2026-07-25', '2026-07-24', '2026-07-23'], '2026-07-25'),
    3
  );
});

test('a gap in the middle stops counting at the gap', () => {
  assert.equal(
    computeCurrentDayStreak(['2026-07-25', '2026-07-24', '2026-07-20'], '2026-07-25'),
    2
  );
});

test('a duplicate date does not break the streak (caller is expected to pass distinct dates, but this is defensive)', () => {
  assert.equal(
    computeCurrentDayStreak(['2026-07-25', '2026-07-25', '2026-07-24'], '2026-07-25'),
    2
  );
});

test('streak is unaffected by month/year boundaries', () => {
  assert.equal(
    computeCurrentDayStreak(['2026-08-01', '2026-07-31', '2026-07-30'], '2026-08-01'),
    3
  );
});
