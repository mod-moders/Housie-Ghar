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

test('validateHousieName accepts ordinary names', () => {
  for (const name of ['RajaBabu', 'Ram Kumar', 'R.K.Singh', "D'Souza", 'Anu-Priya', 'प्रिया देवी']) {
    assert.strictEqual(validateHousieName(name).ok, true, `expected ${name} to be valid`);
  }
});

test('validateHousieName rejects winner-string separator characters', () => {
  // These are what corrupt `winner_housie_name` and let one player's prize
  // match another player's name.
  for (const name of ['Ram & Sham', 'Alice (5)', 'Ram, Sham', 'a;b', 'a|b', 'a<b', 'a>b']) {
    assert.strictEqual(validateHousieName(name).ok, false, `expected ${name} to be rejected`);
  }
});

test('validateHousieName rejects a standalone "and" but allows it inside a word', () => {
  assert.strictEqual(validateHousieName('Ram and Sham').ok, false);
  assert.strictEqual(validateHousieName('Anand').ok, true);
  assert.strictEqual(validateHousieName('Chandni').ok, true);
});

test('validateHousieName enforces length bounds', () => {
  assert.strictEqual(validateHousieName('ab').ok, false);
  assert.strictEqual(validateHousieName('a'.repeat(21)).ok, false);
  assert.strictEqual(validateHousieName('abc').ok, true);
  assert.strictEqual(validateHousieName('a'.repeat(20)).ok, true);
});

test('validateHousieName rejects names with no alphanumeric content', () => {
  assert.strictEqual(validateHousieName('...').ok, false);
  assert.strictEqual(validateHousieName('---').ok, false);
});

test('validateHousieName rejects control characters', () => {
  assert.strictEqual(validateHousieName('ab\x00cd').ok, false);
  assert.strictEqual(validateHousieName('ab\x07cd').ok, false);
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
