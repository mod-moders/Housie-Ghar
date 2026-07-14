import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPatternWinners,
  splitPrize,
  allPrizesClaimed,
  DetectableTicket,
} from './winDetection';
import { TicketGridData } from '@shared/types/ticket';

// Build a 3x9 grid from three rows of (number | null).
function grid(
  row1: (number | null)[],
  row2: (number | null)[],
  row3: (number | null)[]
): TicketGridData {
  return { row1, row2, row3 } as TicketGridData;
}

function ticket(id: number, g: TicketGridData): DetectableTicket {
  return { ticketId: id, ticketNumber: id, ownerHousieName: `P${id}`, gridData: g };
}

// A ticket whose row1 = 1..5, row2 = 11..15, row3 = 21..25 (rest null).
const T1 = ticket(
  1,
  grid(
    [1, 2, 3, 4, 5, null, null, null, null],
    [11, 12, 13, 14, 15, null, null, null, null],
    [21, 22, 23, 24, 25, null, null, null, null]
  )
);

test('Top Line wins only when the whole first row is drawn', () => {
  const incomplete = detectPatternWinners('Top Line', [T1], new Set([1, 2, 3, 4]));
  assert.deepEqual(incomplete, []);
  const complete = detectPatternWinners('Top Line', [T1], new Set([1, 2, 3, 4, 5]));
  assert.deepEqual(complete.map((w) => w.ticketId), [1]);
});

test('Middle Line and Bottom Line target their own rows', () => {
  assert.deepEqual(
    detectPatternWinners('Middle Line', [T1], new Set([11, 12, 13, 14, 15])).map((w) => w.ticketId),
    [1]
  );
  assert.deepEqual(
    detectPatternWinners('Bottom Line', [T1], new Set([21, 22, 23, 24, 25])).map((w) => w.ticketId),
    [1]
  );
  // Top row drawn does not win the bottom line.
  assert.deepEqual(detectPatternWinners('Bottom Line', [T1], new Set([1, 2, 3, 4, 5])), []);
});

test('Early Five wins at exactly five marked numbers, not four', () => {
  assert.deepEqual(detectPatternWinners('Early Five', [T1], new Set([1, 2, 3, 4])), []);
  assert.deepEqual(
    detectPatternWinners('Early Five', [T1], new Set([1, 2, 3, 4, 5])).map((w) => w.ticketId),
    [1]
  );
});

test('Four Corners uses first & last real number of rows 1 and 3, ignoring null gaps', () => {
  // row1 corners = 1 and 9; row3 corners = 80 and 90.
  const g = grid(
    [1, null, null, null, null, null, null, null, 9],
    [40, null, null, null, null, null, null, null, null],
    [80, null, null, null, null, null, null, null, 90]
  );
  const tk = ticket(7, g);
  assert.deepEqual(detectPatternWinners('Four Corners', [tk], new Set([1, 9, 80])), []);
  assert.deepEqual(
    detectPatternWinners('Four Corners', [tk], new Set([1, 9, 80, 90])).map((w) => w.ticketId),
    [7]
  );
});

test('Full House wins only when every number on the ticket is drawn', () => {
  const all = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25];
  assert.deepEqual(detectPatternWinners('Full House', [T1], new Set(all.slice(0, 14))), []);
  assert.deepEqual(
    detectPatternWinners('Full House', [T1], new Set(all)).map((w) => w.ticketId),
    [1]
  );
});

test('detectPatternWinners returns every ticket that satisfies the pattern', () => {
  const T2 = ticket(
    2,
    grid(
      [1, 2, 3, 4, 5, null, null, null, null],
      [31, 32, 33, 34, 35, null, null, null, null],
      [41, 42, 43, 44, 45, null, null, null, null]
    )
  );
  const winners = detectPatternWinners('Top Line', [T1, T2], new Set([1, 2, 3, 4, 5]));
  assert.deepEqual(winners.map((w) => w.ticketId).sort(), [1, 2]);
});

test('Quick 7 wins at exactly seven marked numbers, not six', () => {
  assert.deepEqual(detectPatternWinners('Quick 7', [T1], new Set([1, 2, 3, 4, 5, 11])), []);
  assert.deepEqual(
    detectPatternWinners('Quick 7', [T1], new Set([1, 2, 3, 4, 5, 11, 12])).map((w) => w.ticketId),
    [1]
  );
});

test('Corner is an alias of Four Corners', () => {
  const g = grid(
    [1, null, null, null, null, null, null, null, 9],
    [40, null, null, null, null, null, null, null, null],
    [80, null, null, null, null, null, null, null, 90]
  );
  const tk = ticket(7, g);
  assert.deepEqual(detectPatternWinners('Corner', [tk], new Set([1, 9, 80])), []);
  assert.deepEqual(
    detectPatternWinners('Corner', [tk], new Set([1, 9, 80, 90])).map((w) => w.ticketId),
    [7]
  );
});

test('Star needs the four corners plus the centre (3rd number of the middle row)', () => {
  // Corners = 1, 9, 80, 90; centre = 33 (third real number of row2).
  const g = grid(
    [1, null, null, null, null, null, null, null, 9],
    [31, 32, 33, 34, 35, null, null, null, null],
    [80, null, null, null, null, null, null, null, 90]
  );
  const tk = ticket(8, g);
  assert.deepEqual(detectPatternWinners('Star', [tk], new Set([1, 9, 80, 90])), []);
  assert.deepEqual(detectPatternWinners('Star', [tk], new Set([1, 9, 80, 90, 32])), []);
  assert.deepEqual(
    detectPatternWinners('Star', [tk], new Set([1, 9, 80, 90, 33])).map((w) => w.ticketId),
    [8]
  );
});

test('Box Bonus needs at least two marked numbers in every row', () => {
  // Two in rows 1 and 2, only one in row 3 — not yet.
  assert.deepEqual(
    detectPatternWinners('Box Bonus', [T1], new Set([1, 2, 11, 12, 21])),
    []
  );
  assert.deepEqual(
    detectPatternWinners('Box Bonus', [T1], new Set([1, 2, 11, 12, 21, 22])).map((w) => w.ticketId),
    [1]
  );
});

test('Full House tiers behave as full house and honour the exclusion set', () => {
  const all = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25];
  assert.deepEqual(
    detectPatternWinners('1st Full House', [T1], new Set(all)).map((w) => w.ticketId),
    [1]
  );
  // Ticket 1 already took an earlier tier → excluded from the next tier.
  assert.deepEqual(
    detectPatternWinners('2nd Full House', [T1], new Set(all), new Set([1])),
    []
  );
  const T9 = ticket(
    9,
    grid(
      [1, 2, 3, 4, 5, null, null, null, null],
      [11, 12, 13, 14, 15, null, null, null, null],
      [21, 22, 23, 24, 26, null, null, null, null]
    )
  );
  // With ticket 1 excluded, another completed ticket takes the 2nd tier.
  assert.deepEqual(
    detectPatternWinners('2nd Full House', [T1, T9], new Set([...all, 26]), new Set([1])).map((w) => w.ticketId),
    [9]
  );
});

test('splitPrize distributes the full amount with no lost paisa', () => {
  assert.deepEqual(splitPrize(100, 1), [100]);
  assert.deepEqual(splitPrize(100, 2), [50, 50]);
  const three = splitPrize(100, 3);
  assert.deepEqual(three, [33.34, 33.33, 33.33]);
  assert.equal(
    three.reduce((a, b) => a + b, 0).toFixed(2),
    '100.00'
  );
});

test('splitPrize handles amounts too small to divide evenly', () => {
  // 1 paisa split 3 ways: one winner gets it, the rest get zero, sum preserved.
  assert.deepEqual(splitPrize(0.01, 3), [0.01, 0, 0]);
});

test('allPrizesClaimed is true only when every prize is claimed', () => {
  assert.equal(allPrizesClaimed([{ claimed: true }, { claimed: true }]), true);
  assert.equal(allPrizesClaimed([{ claimed: true }, { claimed: false }]), false);
  assert.equal(allPrizesClaimed([]), true);
});
