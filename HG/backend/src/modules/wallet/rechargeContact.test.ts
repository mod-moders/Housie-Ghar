import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRechargeMessage } from './rechargeContact';

test('recharge message includes agent name, amount, and reference', () => {
  const msg = buildRechargeMessage('Ramesh K.', 5000, 'UPI-8841');
  assert.ok(msg.includes('Ramesh K.'));
  assert.ok(msg.includes('5000'));
  assert.ok(msg.includes('UPI-8841'));
});
