import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
  freshGameWithAgent,
  createPrize,
} from './db';

test('harness: migrations + fixtures round-trip', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent(500);
  const prizeId = await createPrize(gameId, 'Top Line', 100);

  const p = getTestPool();
  const agent = await p.query('SELECT current_balance FROM Users WHERE user_id = $1', [agentId]);
  assert.equal(parseFloat(agent.rows[0].current_balance), 500);
  const prize = await p.query('SELECT prize_amount FROM Prize_Pool WHERE prize_id = $1', [prizeId]);
  assert.equal(parseFloat(prize.rows[0].prize_amount), 100);

  await closeTestPool();
});
