import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
  createStaff,
} from '../../test-support/db';
import { deleteStaffUser } from './users.service';

after(async () => {
  if (hasTestDb) await closeTestPool();
});

test('deleteStaffUser removes a clean staff account and returns its details', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });
  const target = await createStaff({ roleId: 2, roleName: 'Admin' });

  const result = await deleteStaffUser(getTestPool(), { targetId: target, actorId: actor });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.deleted.user_id, target);
    assert.equal(result.deleted.role_id, 2);
  }
  const gone = await getTestPool().query('SELECT 1 FROM Users WHERE user_id = $1', [target]);
  assert.equal(gone.rowCount, 0);
});

test('deleteStaffUser refuses to delete your own account', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });

  const result = await deleteStaffUser(getTestPool(), { targetId: actor, actorId: actor });

  assert.deepEqual(result, { ok: false, reason: 'self' });
  const still = await getTestPool().query('SELECT 1 FROM Users WHERE user_id = $1', [actor]);
  assert.equal(still.rowCount, 1);
});

test('deleteStaffUser reports not_found for an unknown id', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });

  const result = await deleteStaffUser(getTestPool(), {
    targetId: '00000000-0000-4000-8000-000000000000',
    actorId: actor,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

test('deleteStaffUser reports not_found for a malformed id instead of throwing', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });

  const result = await deleteStaffUser(getTestPool(), { targetId: 'not-a-uuid', actorId: actor });

  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

test('deleteStaffUser keeps accounts that other records point at (has_history)', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });
  const target = await createStaff({ roleId: 2, roleName: 'Admin' });
  const protege = await createStaff({ roleId: 3, roleName: 'Operator' });
  // The target created another staff account — Users.created_by references them.
  await getTestPool().query('UPDATE Users SET created_by = $1 WHERE user_id = $2', [target, protege]);

  const result = await deleteStaffUser(getTestPool(), { targetId: target, actorId: actor });

  assert.deepEqual(result, { ok: false, reason: 'has_history' });
  const still = await getTestPool().query('SELECT 1 FROM Users WHERE user_id = $1', [target]);
  assert.equal(still.rowCount, 1);
});

test('deleteStaffUser succeeds even when the account appears in the audit log', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const actor = await createStaff({ roleId: 1, roleName: 'Superadmin' });
  const target = await createStaff({ roleId: 2, roleName: 'Admin' });
  // e.g. the admin logged in and changed their temp password before being removed.
  await getTestPool().query(
    `INSERT INTO Audit_Log (user_id, user_name, user_role, action) VALUES ($1, 'Some Admin', 'Admin', 'CHANGE_PASSWORD')`,
    [target]
  );

  const result = await deleteStaffUser(getTestPool(), { targetId: target, actorId: actor });

  assert.equal(result.ok, true);
  const gone = await getTestPool().query('SELECT 1 FROM Users WHERE user_id = $1', [target]);
  assert.equal(gone.rowCount, 0);
  // The audit trail itself is untouched.
  const audit = await getTestPool().query('SELECT user_name FROM Audit_Log WHERE user_id = $1', [target]);
  assert.equal(audit.rowCount, 1);
});
