import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
  freshGameWithAgent,
  createAgent,
  createPlayer,
  createPrize,
  createTicket,
  createBooking,
} from '../test-support/db';
import {
  recordSettlementsForPrize,
  listSettlements,
  listAgentSettlements,
  listPlayerWins,
  settleSettlement,
} from './settlements.service';

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
  let recorded;
  try {
    await client.query('BEGIN');
    recorded = await recordSettlementsForPrize(client, {
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

  // It reports what it inserted so the engine can notify the owed agent.
  assert.equal(recorded!.length, 1);
  assert.equal(recorded![0].agentId, agentId);
  assert.equal(recorded![0].settlementId, rows[0].settlement_id);
  assert.equal(recorded![0].amount, 100);
});

test('recordSettlementsForPrize is idempotent on replay (UNIQUE prize_id, ticket_id)', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent();
  const prizeId = await createPrize(gameId, 'Top Line', 100);
  const ticketId = await createTicket(gameId, 1);
  await createBooking({ gameId, ticketIds: [ticketId], agentId, housieName: 'Asha' });

  const recordedCounts: number[] = [];
  for (let i = 0; i < 2; i++) {
    const client = await getTestPool().connect();
    try {
      await client.query('BEGIN');
      const recorded = await recordSettlementsForPrize(client, {
        gameId,
        prizeId,
        patternName: 'Top Line',
        winners: [{ ticketId, ticketNumber: 1, amount: 100 }],
      });
      recordedCounts.push(recorded.length);
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
  // The replay inserted nothing, so it must also report nothing to notify.
  assert.deepEqual(recordedCounts, [1, 0]);
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

// Helper: seed one Owed settlement and return its id + agent.
async function seedOwed(amount: number): Promise<{ settlementId: string; agentId: string; gameId: string }> {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent(1000);
  const prizeId = await createPrize(gameId, 'Full House', amount);
  const ticketId = await createTicket(gameId, 1);
  await createBooking({ gameId, ticketIds: [ticketId], agentId, housieName: 'Asha' });
  const client = await getTestPool().connect();
  try {
    await client.query('BEGIN');
    await recordSettlementsForPrize(client, {
      gameId,
      prizeId,
      patternName: 'Full House',
      winners: [{ ticketId, ticketNumber: 1, amount }],
    });
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  const sid = (await getTestPool().query(
    'SELECT settlement_id FROM Prize_Settlements WHERE prize_id = $1',
    [prizeId]
  )).rows[0].settlement_id;
  return { settlementId: sid, agentId, gameId };
}

test('listSettlements filters by game and status and includes the agent name', { skip: !hasTestDb }, async () => {
  const { gameId } = await seedOwed(100);
  const all = await listSettlements(getTestPool(), { gameId });
  assert.equal(all.length, 1);
  // The JOIN onto Users must populate the agent's display name. (Agent fixtures
  // are numbered by a global counter, so don't hard-code which number it is.)
  assert.match(all[0].agent_name, /^Agent \d+$/);
  const owed = await listSettlements(getTestPool(), { gameId, status: 'Owed' });
  assert.equal(owed.length, 1);
  const paid = await listSettlements(getTestPool(), { gameId, status: 'Paid' });
  assert.equal(paid.length, 0);
});

test('settleSettlement flips Owed->Paid and credits the agent wallet exactly once', { skip: !hasTestDb }, async () => {
  const { settlementId, agentId } = await seedOwed(100);
  const before = parseFloat((await getTestPool().query(
    'SELECT current_balance FROM Users WHERE user_id = $1', [agentId]
  )).rows[0].current_balance);

  const result = await settleSettlement(getTestPool(), settlementId, agentId);
  assert.equal(result.status, 'settled');

  const after = parseFloat((await getTestPool().query(
    'SELECT current_balance FROM Users WHERE user_id = $1', [agentId]
  )).rows[0].current_balance);
  assert.equal(after, before + 100);

  const row = (await getTestPool().query(
    'SELECT status, settled_at FROM Prize_Settlements WHERE settlement_id = $1', [settlementId]
  )).rows[0];
  assert.equal(row.status, 'Paid');
  assert.ok(row.settled_at);

  const ledger = (await getTestPool().query(
    `SELECT transaction_type, amount, reference_type, reference_id
     FROM Wallet_Ledger WHERE agent_id = $1`, [agentId]
  )).rows;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].transaction_type, 'Credit');
  assert.equal(ledger[0].reference_type, 'Prize');
  assert.equal(ledger[0].reference_id, settlementId);
});

test('settleSettlement is a no-op the second time (idempotent, no double credit)', { skip: !hasTestDb }, async () => {
  const { settlementId, agentId } = await seedOwed(100);
  await settleSettlement(getTestPool(), settlementId, agentId);
  const second = await settleSettlement(getTestPool(), settlementId, agentId);
  assert.equal(second.status, 'already_paid');

  const ledgerCount = (await getTestPool().query(
    'SELECT COUNT(*)::int AS c FROM Wallet_Ledger WHERE agent_id = $1', [agentId]
  )).rows[0].c;
  assert.equal(ledgerCount, 1);
});

test('settleSettlement reports not_found for an unknown id', { skip: !hasTestDb }, async () => {
  await seedOwed(100);
  const r = await settleSettlement(
    getTestPool(),
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
  );
  assert.equal(r.status, 'not_found');
});

test('listAgentSettlements returns only that agent\'s rows, owed first, with the game title', { skip: !hasTestDb }, async () => {
  const { settlementId, agentId, gameId } = await seedOwed(100);

  // A second win for the same agent, already settled → should sort after the owed row.
  const prize2 = await createPrize(gameId, 'Top Line', 40);
  const ticket2 = await createTicket(gameId, 2);
  await createBooking({ gameId, ticketIds: [ticket2], agentId, housieName: 'Binod' });
  const client = await getTestPool().connect();
  try {
    await client.query('BEGIN');
    await recordSettlementsForPrize(client, {
      gameId, prizeId: prize2, patternName: 'Top Line',
      winners: [{ ticketId: ticket2, ticketNumber: 2, amount: 40 }],
    });
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  const paidId = (await getTestPool().query(
    'SELECT settlement_id FROM Prize_Settlements WHERE prize_id = $1', [prize2]
  )).rows[0].settlement_id;
  await settleSettlement(getTestPool(), paidId, agentId);

  // A different agent's win must not leak in.
  const otherAgent = await createAgent(500);
  const prize3 = await createPrize(gameId, 'Middle Line', 60);
  const ticket3 = await createTicket(gameId, 3);
  await createBooking({ gameId, ticketIds: [ticket3], agentId: otherAgent, housieName: 'Cara' });
  const client2 = await getTestPool().connect();
  try {
    await client2.query('BEGIN');
    await recordSettlementsForPrize(client2, {
      gameId, prizeId: prize3, patternName: 'Middle Line',
      winners: [{ ticketId: ticket3, ticketNumber: 3, amount: 60 }],
    });
    await client2.query('COMMIT');
  } finally {
    client2.release();
  }

  const rows = await listAgentSettlements(getTestPool(), agentId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].settlement_id, settlementId); // Owed sorts first
  assert.equal(rows[0].status, 'Owed');
  assert.equal(rows[0].game_title, 'Test Game');
  assert.equal(rows[1].status, 'Paid');

  const otherRows = await listAgentSettlements(getTestPool(), otherAgent);
  assert.equal(otherRows.length, 1);
  assert.equal(otherRows[0].pattern_name, 'Middle Line');
});

test('listPlayerWins returns the stamped player\'s wins with the selling agent\'s contact', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const { agentId, gameId } = await freshGameWithAgent();
  await getTestPool().query(`UPDATE Users SET phone = '+919999000011', town = 'Shillong' WHERE user_id = $1`, [agentId]);
  const playerId = await createPlayer('asha_w');
  const stranger = await createPlayer('someone_else');

  const prizeId = await createPrize(gameId, 'Full House', 500);
  const ticketId = await createTicket(gameId, 9);
  await createBooking({ gameId, ticketIds: [ticketId], agentId, housieName: 'Asha', playerId });

  const client = await getTestPool().connect();
  try {
    await client.query('BEGIN');
    await recordSettlementsForPrize(client, {
      gameId, prizeId, patternName: 'Full House',
      winners: [{ ticketId, ticketNumber: 9, amount: 500 }],
    });
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const wins = await listPlayerWins(getTestPool(), playerId, gameId);
  assert.equal(wins.length, 1);
  assert.equal(wins[0].pattern_name, 'Full House');
  assert.equal(parseFloat(wins[0].amount), 500);
  assert.equal(wins[0].agent_phone, '+919999000011');
  assert.equal(wins[0].game_title, 'Test Game');
  assert.equal(wins[0].winner_housie_name, 'Asha');

  // Scoped to the player and (optionally) the game.
  assert.equal((await listPlayerWins(getTestPool(), stranger, gameId)).length, 0);
  assert.equal((await listPlayerWins(getTestPool(), playerId)).length, 1);
});
