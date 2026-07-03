import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
  createStaff,
} from '../test-support/db';
import { findFinanceContact } from './financeContact';

after(async () => {
  if (hasTestDb) await closeTestPool();
});

test('findFinanceContact prefers the Active CFO Admin over a Superadmin', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  await createStaff({ roleId: 1, roleName: 'Superadmin', phone: '+911111111111' });
  const cfoId = await createStaff({ roleId: 2, roleName: 'Admin', isCfo: true, phone: '+912222222222' });

  const contact = await findFinanceContact(getTestPool());
  assert.ok(contact);
  assert.equal(contact!.phone, '+912222222222');

  // Sanity: the row we matched really is the CFO
  const row = (await getTestPool().query('SELECT user_id FROM Users WHERE phone = $1', [contact!.phone])).rows[0];
  assert.equal(row.user_id, cfoId);
});

test('findFinanceContact falls back to a Superadmin and skips phoneless/suspended staff', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  await createStaff({ roleId: 2, roleName: 'Admin', isCfo: true, phone: null }); // CFO without a phone
  await createStaff({ roleId: 1, roleName: 'Superadmin', phone: '+913333333333', status: 'Suspended' });
  await createStaff({ roleId: 1, roleName: 'Superadmin', phone: '+914444444444' });

  const contact = await findFinanceContact(getTestPool());
  assert.ok(contact);
  assert.equal(contact!.phone, '+914444444444');
});

test('findFinanceContact returns null when no reachable finance staff exists', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  await createStaff({ roleId: 4, roleName: 'Agent', phone: '+915555555555' }); // agents don't count

  const contact = await findFinanceContact(getTestPool());
  assert.equal(contact, null);
});
