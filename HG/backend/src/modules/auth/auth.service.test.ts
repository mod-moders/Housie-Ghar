import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  hasTestDb,
  runMigrations,
  truncateAll,
  closeTestPool,
  getTestPool,
} from '../../test-support/db';
import { changeStaffPassword, getStaffAccessFlags } from './auth.service';

after(async () => {
  if (hasTestDb) await closeTestPool();
});

/** Insert a staff user with a real bcrypt hash; returns user_id. */
async function createStaffUser(args: {
  password: string;
  tempRequired?: boolean;
  status?: string;
  rawHash?: string;
}): Promise<string> {
  const p = getTestPool();
  await p.query(
    `INSERT INTO Roles (role_id, role_name) VALUES (3, 'Operator')
     ON CONFLICT (role_id) DO NOTHING`
  );
  const hash = args.rawHash ?? (await bcrypt.hash(args.password, 4));
  const res = await p.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, temp_password_required, status)
     VALUES (3, 'Test Staff', $1, $2, $3, $4)
     RETURNING user_id`,
    [
      `staff${Date.now()}${Math.floor(Math.random() * 1e6)}@test.local`,
      hash,
      args.tempRequired ?? true,
      args.status ?? 'Active',
    ]
  );
  return res.rows[0].user_id;
}

test('changeStaffPassword updates the hash and clears temp_password_required', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const userId = await createStaffUser({ password: 'OldPass123!', tempRequired: true });

  const result = await changeStaffPassword(getTestPool(), {
    userId,
    currentPassword: 'OldPass123!',
    newPassword: 'NewPass456!',
  });

  assert.deepEqual(result, { ok: true });
  const row = (
    await getTestPool().query(
      'SELECT password_hash, temp_password_required FROM Users WHERE user_id = $1',
      [userId]
    )
  ).rows[0];
  assert.equal(row.temp_password_required, false);
  assert.equal(await bcrypt.compare('NewPass456!', row.password_hash), true);
  assert.equal(await bcrypt.compare('OldPass123!', row.password_hash), false);
});

test('changeStaffPassword rejects a wrong current password and leaves the row untouched', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const userId = await createStaffUser({ password: 'OldPass123!', tempRequired: true });

  const result = await changeStaffPassword(getTestPool(), {
    userId,
    currentPassword: 'not-the-password',
    newPassword: 'NewPass456!',
  });

  assert.deepEqual(result, { ok: false, reason: 'wrong_password' });
  const row = (
    await getTestPool().query(
      'SELECT password_hash, temp_password_required FROM Users WHERE user_id = $1',
      [userId]
    )
  ).rows[0];
  assert.equal(row.temp_password_required, true);
  assert.equal(await bcrypt.compare('OldPass123!', row.password_hash), true);
});

test('changeStaffPassword rejects short and unchanged new passwords', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const userId = await createStaffUser({ password: 'OldPass123!' });

  assert.deepEqual(
    await changeStaffPassword(getTestPool(), {
      userId,
      currentPassword: 'OldPass123!',
      newPassword: 'short',
    }),
    { ok: false, reason: 'too_short' }
  );
  assert.deepEqual(
    await changeStaffPassword(getTestPool(), {
      userId,
      currentPassword: 'OldPass123!',
      newPassword: 'OldPass123!',
    }),
    { ok: false, reason: 'unchanged' }
  );
});

test('changeStaffPassword never matches against a malformed stored hash', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  // Regression for the removed login backdoor: a non-bcrypt stored hash must
  // fail closed, not open — no password (incl. ChangeMe123!) may pass.
  const userId = await createStaffUser({ password: 'irrelevant', rawHash: 'x' });

  assert.deepEqual(
    await changeStaffPassword(getTestPool(), {
      userId,
      currentPassword: 'ChangeMe123!',
      newPassword: 'NewPass456!',
    }),
    { ok: false, reason: 'wrong_password' }
  );
});

test('changeStaffPassword reports a missing user', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  assert.deepEqual(
    await changeStaffPassword(getTestPool(), {
      userId: '00000000-0000-0000-0000-000000000000',
      currentPassword: 'whatever1',
      newPassword: 'NewPass456!',
    }),
    { ok: false, reason: 'not_found' }
  );
});

test('getStaffAccessFlags returns status + temp flag, and null for a missing user', { skip: !hasTestDb }, async () => {
  await runMigrations();
  await truncateAll();
  const userId = await createStaffUser({
    password: 'OldPass123!',
    tempRequired: true,
    status: 'Suspended',
  });

  assert.deepEqual(await getStaffAccessFlags(getTestPool(), userId), {
    status: 'Suspended',
    temp_password_required: true,
  });
  assert.equal(
    await getStaffAccessFlags(getTestPool(), '00000000-0000-0000-0000-000000000000'),
    null
  );
});
