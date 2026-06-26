import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
  freshGameWithAgent,
  createPrize,
  createTicket,
  createBooking,
} from '../test-support/db';
import { recordSettlementsForPrize } from './settlements.service';

after(async () => {
  if (hasTestDb) await closeTestPool();
});

test('recordSettlementsForPrize inserts an Owed row resolved from the Sold booking', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent();
  const prizeId = await createPrize(gameId, 'Top Line', 100);
  const ticketId = await createTicket(gameId, 1);
  await createBooking({ gameId, ticketIds: [ticketId], agentId, housieName: 'Asha' });

  const client = await getTestPool().connect();
  try {
    await client.query('BEGIN');
    await recordSettlementsForPrize(client, {
      gameId,
      prizeId,
      patternName: 'Top Line',
      winners: [{ ticketId, ticketNumber: 1, amount: 100 }],
    });
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const rows = (await getTestPool().query(
    'SELECT * FROM Prize_Settlements WHERE prize_id = $1',
    [prizeId]
  )).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'Owed');
  assert.equal(rows[0].agent_id, agentId);
  assert.equal(rows[0].winner_housie_name, 'Asha');
  assert.equal(parseFloat(rows[0].amount), 100);
});

test('recordSettlementsForPrize is idempotent on replay (UNIQUE prize_id, ticket_id)', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent();
  const prizeId = await createPrize(gameId, 'Top Line', 100);
  const ticketId = await createTicket(gameId, 1);
  await createBooking({ gameId, ticketIds: [ticketId], agentId, housieName: 'Asha' });

  for (let i = 0; i < 2; i++) {
    const client = await getTestPool().connect();
    try {
      await client.query('BEGIN');
      await recordSettlementsForPrize(client, {
        gameId,
        prizeId,
        patternName: 'Top Line',
        winners: [{ ticketId, ticketNumber: 1, amount: 100 }],
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  const count = (await getTestPool().query(
    'SELECT COUNT(*)::int AS c FROM Prize_Settlements WHERE prize_id = $1',
    [prizeId]
  )).rows[0].c;
  assert.equal(count, 1);
});

test('recordSettlementsForPrize skips (does not throw) when no Sold booking owns the ticket', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { gameId } = await freshGameWithAgent();
  const prizeId = await createPrize(gameId, 'Top Line', 100);
  const ticketId = await createTicket(gameId, 1); // no booking created

  const client = await getTestPool().connect();
  try {
    await client.query('BEGIN');
    await recordSettlementsForPrize(client, {
      gameId,
      prizeId,
      patternName: 'Top Line',
      winners: [{ ticketId, ticketNumber: 1, amount: 100 }],
    });
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const count = (await getTestPool().query(
    'SELECT COUNT(*)::int AS c FROM Prize_Settlements WHERE prize_id = $1',
    [prizeId]
  )).rows[0].c;
  assert.equal(count, 0);
});
