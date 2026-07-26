import { test } from 'node:test';
import assert from 'node:assert';
import {
  normalizeHousieName,
  validateHousieName,
  parseWinnerNames,
  winnerStringIncludes,
  ticketCountForPlayer,
} from './housieName';

// --- normalization ---------------------------------------------------------

test('normalizeHousieName lowercases, trims and collapses whitespace', () => {
  assert.strictEqual(normalizeHousieName('  RajaBabu  '), 'rajababu');
  assert.strictEqual(normalizeHousieName('Ram   Kumar'), 'ram kumar');
  assert.strictEqual(normalizeHousieName('R.K.Singh'), 'r.k.singh');
});

test('normalizeHousieName folds case variants together', () => {
  // The exact collision that let an attacker claim another player's prizes.
  assert.strictEqual(normalizeHousieName('RajaBabu'), normalizeHousieName('rajababu'));
});

test('normalizeHousieName handles null/undefined without throwing', () => {
  assert.strictEqual(normalizeHousieName(undefined as unknown as string), '');
  assert.strictEqual(normalizeHousieName(null as unknown as string), '');
});

// --- validation ------------------------------------------------------------

test('validateHousieName accepts alphanumeric names, underscores, and periods', () => {
  for (const name of ['RajaBabu', 'R_K_Singh', 'R.K.Singh', 'player_123', 'admin.99', 'ab']) {
    assert.strictEqual(validateHousieName(name).ok, true, `expected ${name} to be valid`);
  }
});

test('validateHousieName rejects spaces, emojis, and special characters', () => {
  for (const name of ['Ram Kumar', 'Housie!Ghar', 'Housie@Ghar', 'player_🌟', 'abc?', 'hello#world']) {
    const res = validateHousieName(name);
    assert.strictEqual(res.ok, false, `expected ${name} to be rejected`);
    assert.strictEqual(Array.isArray(res.alternatives), true, `expected alternatives for ${name}`);
    assert.strictEqual(res.alternatives!.length, 3, `expected 3 alternatives for ${name}`);
  }
});

test('validateHousieName enforces length bounds (2 to 16 characters)', () => {
  assert.strictEqual(validateHousieName('a').ok, false); // too short
  assert.strictEqual(validateHousieName('a'.repeat(17)).ok, false); // too long
  assert.strictEqual(validateHousieName('ab').ok, true); // valid min
  assert.strictEqual(validateHousieName('a'.repeat(16)).ok, true); // valid max
});

test('validateHousieName rejects non-string input', () => {
  assert.strictEqual(validateHousieName(undefined).ok, false);
  assert.strictEqual(validateHousieName(42).ok, false);
  assert.strictEqual(validateHousieName({}).ok, false);
});

// --- winner-string parsing -------------------------------------------------

test('parseWinnerNames handles a single winner with one ticket', () => {
  assert.deepStrictEqual(parseWinnerNames('Alice (5)'), [
    { name: 'Alice', normalized: 'alice', ticketNumbers: [5] },
  ]);
});

test('parseWinnerNames does not split on the & inside a ticket list', () => {
  // The bug fixed in 191b154 — regression guard.
  const parsed = parseWinnerNames('Alice (5 & 12) & Bob (7)');
  assert.strictEqual(parsed.length, 2);
  assert.deepStrictEqual(parsed[0], { name: 'Alice', normalized: 'alice', ticketNumbers: [5, 12] });
  assert.deepStrictEqual(parsed[1], { name: 'Bob', normalized: 'bob', ticketNumbers: [7] });
});

test('parseWinnerNames handles comma and "and" separators', () => {
  assert.strictEqual(parseWinnerNames('Alice (1), Bob (2)').length, 2);
  assert.strictEqual(parseWinnerNames('Alice (1) and Bob (2)').length, 2);
});

test('parseWinnerNames tolerates a missing ticket list', () => {
  assert.deepStrictEqual(parseWinnerNames('Alice'), [
    { name: 'Alice', normalized: 'alice', ticketNumbers: [] },
  ]);
});

test('parseWinnerNames returns empty for null/blank', () => {
  assert.deepStrictEqual(parseWinnerNames(null), []);
  assert.deepStrictEqual(parseWinnerNames(''), []);
  assert.deepStrictEqual(parseWinnerNames('   '), []);
});

// --- matching --------------------------------------------------------------

test('winnerStringIncludes matches regardless of case', () => {
  assert.strictEqual(winnerStringIncludes('RajaBabu (5)', 'rajababu'), true);
  assert.strictEqual(winnerStringIncludes('rajababu (5)', 'RajaBabu'), true);
});

test('winnerStringIncludes does not match a different player', () => {
  assert.strictEqual(winnerStringIncludes('Alice (5)', 'Bob'), false);
});

test('winnerStringIncludes does not match a ticket number as a name', () => {
  // 'Alice (5)' must never be claimable by a player whose name normalizes to '5'.
  assert.strictEqual(winnerStringIncludes('Alice (5)', '5'), false);
});

test('winnerStringIncludes does not substring-match', () => {
  assert.strictEqual(winnerStringIncludes('Alexander (5)', 'Alex'), false);
});

// --- payout share ----------------------------------------------------------

test('ticketCountForPlayer counts every ticket credited to the player', () => {
  // Alice holds 2 of the 3 winning tickets: her share is 2/3 of the prize,
  // reconstructed by callers as amount_per_winner * 2.
  assert.strictEqual(ticketCountForPlayer('Alice (5 & 12) & Bob (7)', 'Alice'), 2);
  assert.strictEqual(ticketCountForPlayer('Alice (5 & 12) & Bob (7)', 'Bob'), 1);
});

test('ticketCountForPlayer works for names containing punctuation', () => {
  // The underpayment bug: punctuation used to break the match and silently
  // drop the player to a single-ticket share.
  assert.strictEqual(ticketCountForPlayer('R.K.Singh (3 & 9)', 'R.K.Singh'), 2);
  assert.strictEqual(ticketCountForPlayer("D'Souza (1 & 2 & 3)", "d'souza"), 3);
});

test('ticketCountForPlayer returns 0 when the player is not credited', () => {
  assert.strictEqual(ticketCountForPlayer('Alice (5)', 'Bob'), 0);
});

test('ticketCountForPlayer counts a bare name as one ticket', () => {
  assert.strictEqual(ticketCountForPlayer('Alice', 'Alice'), 1);
});
