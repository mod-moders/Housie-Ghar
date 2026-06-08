import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAdjust, computeBalanceAfter, MIN_REASON_LEN } from './walletAdjust';

const goodReason = 'Correcting a bounced bank transfer from yesterday';

test('rejects invalid type', () => {
  const v = validateAdjust({ type: 'Foo', amount: 100, reason: goodReason });
  assert.equal(v.ok, false);
});

test('rejects non-positive amount', () => {
  assert.equal(validateAdjust({ type: 'Credit', amount: 0, reason: goodReason }).ok, false);
  assert.equal(validateAdjust({ type: 'Credit', amount: -5, reason: goodReason }).ok, false);
});

test(`rejects reason shorter than ${MIN_REASON_LEN} chars`, () => {
  assert.equal(validateAdjust({ type: 'Credit', amount: 100, reason: 'too short' }).ok, false);
});

test('accepts a valid credit and coerces amount to number', () => {
  const v = validateAdjust({ type: 'Credit', amount: '150.5', reason: goodReason });
  assert.equal(v.ok, true);
  assert.equal(v.amount, 150.5);
  assert.equal(v.type, 'Credit');
});

test('credit increases balance', () => {
  const r = computeBalanceAfter(100, 'Credit', 50);
  assert.deepEqual(r, { ok: true, balance_after: 150 });
});

test('debit decreases balance', () => {
  const r = computeBalanceAfter(100, 'Debit', 40);
  assert.deepEqual(r, { ok: true, balance_after: 60 });
});

test('debit that would go negative is rejected', () => {
  const r = computeBalanceAfter(30, 'Debit', 40);
  assert.equal(r.ok, false);
});

test('debit exactly equal to balance is allowed (zeroes the wallet)', () => {
  const r = computeBalanceAfter(50, 'Debit', 50);
  assert.deepEqual(r, { ok: true, balance_after: 0 });
});

test('rejects an absent reason', () => {
  const v = validateAdjust({ type: 'Credit', amount: 100 });
  assert.equal(v.ok, false);
});
