/**
 * Integration-test database harness.
 *
 * Points a dedicated pool at TEST_DATABASE_URL (e.g. a `housie_ghar_test`
 * database), runs the real migrations against it, and provides truncation +
 * fixture helpers. Imports only `pg` and Node stdlib — never config/env or the
 * singleton pool — so importing it costs nothing when TEST_DATABASE_URL is unset.
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Whether DB-integration tests should run. */
export const hasTestDb = Boolean(TEST_DATABASE_URL);

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL });
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/** Apply any not-yet-applied migrations to the test DB (mirrors migrate.ts). */
export async function runMigrations(): Promise<void> {
  const p = getTestPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const done = new Set(
    (await p.query('SELECT name FROM _migrations')).rows.map((r: any) => r.name)
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await p.query('BEGIN');
    try {
      await p.query(sql);
      await p.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await p.query('COMMIT');
    } catch (err) {
      await p.query('ROLLBACK');
      throw err;
    }
  }
}

/**
 * Wipe all per-test data. Truncating the three root tables CASCADEs to every
 * dependent table (Bookings, Tickets, Prize_Pool, Wallet_Ledger,
 * Prize_Settlements, Game_Logs, …). Roles is preserved.
 */
export async function truncateAll(): Promise<void> {
  const p = getTestPool();
  await p.query(
    'TRUNCATE Users, Scheduled_Games, Player_Logins RESTART IDENTITY CASCADE'
  );
}

/** Ensure a role row exists for user fixtures. */
export async function ensureRole(roleId: number, roleName: string): Promise<void> {
  const p = getTestPool();
  await p.query(
    `INSERT INTO Roles (role_id, role_name) VALUES ($1, $2)
     ON CONFLICT (role_id) DO NOTHING`,
    [roleId, roleName]
  );
}

/** Ensure the Agent role (role_id 4) exists for user fixtures. */
export async function ensureAgentRole(): Promise<void> {
  await ensureRole(4, 'Agent');
}

let emailSeq = 0;

/** Create an Agent user with the given wallet balance; returns user_id. */
export async function createAgent(balance: number): Promise<string> {
  const p = getTestPool();
  emailSeq += 1;
  const res = await p.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, current_balance, status)
     VALUES (4, $1, $2, 'x', $3, 'Active')
     RETURNING user_id`,
    [`Agent ${emailSeq}`, `agent${emailSeq}@test.local`, balance]
  );
  return res.rows[0].user_id;
}

/** Create a staff user (any role); returns user_id. */
export async function createStaff(args: {
  roleId: number;
  roleName: string;
  isCfo?: boolean;
  phone?: string | null;
  status?: string;
}): Promise<string> {
  const p = getTestPool();
  await ensureRole(args.roleId, args.roleName);
  emailSeq += 1;
  const res = await p.query(
    `INSERT INTO Users (role_id, full_name, email, phone, password_hash, is_cfo, status)
     VALUES ($1, $2, $3, $4, 'x', $5, $6)
     RETURNING user_id`,
    [
      args.roleId,
      `${args.roleName} ${emailSeq}`,
      `staff${emailSeq}@test.local`,
      args.phone ?? null,
      args.isCfo ?? false,
      args.status ?? 'Active',
    ]
  );
  return res.rows[0].user_id;
}

/** Create a Player_Logins row; returns player_id. */
export async function createPlayer(username: string): Promise<string> {
  const p = getTestPool();
  const res = await p.query(
    `INSERT INTO Player_Logins (username, password, full_name, date_of_birth)
     VALUES ($1, $1, $2, '2000-01-01')
     RETURNING player_id`,
    [username, `Player ${username}`]
  );
  return res.rows[0].player_id;
}

/** Create a Scheduled_Games row; returns game_id. */
export async function createGame(): Promise<string> {
  const p = getTestPool();
  const res = await p.query(
    `INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price)
     VALUES ('Test Game', NOW(), 100, 10)
     RETURNING game_id`
  );
  return res.rows[0].game_id;
}

/** Create a Prize_Pool row; returns prize_id. */
export async function createPrize(
  gameId: string,
  patternName: string,
  amount: number
): Promise<number> {
  const p = getTestPool();
  const res = await p.query(
    `INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount)
     VALUES ($1, $2, $3)
     RETURNING prize_id`,
    [gameId, patternName, amount]
  );
  return res.rows[0].prize_id;
}

/** Create a Sold ticket; returns ticket_id. */
export async function createTicket(
  gameId: string,
  ticketNumber: number
): Promise<number> {
  const p = getTestPool();
  const grid = {
    row1: [ticketNumber, null, null, null, null, null, null, null, null],
    row2: [null, null, null, null, null, null, null, null, null],
    row3: [null, null, null, null, null, null, null, null, null],
  };
  const res = await p.query(
    `INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
     VALUES ($1, $2, $3, 'Sold')
     RETURNING ticket_id`,
    [gameId, ticketNumber, JSON.stringify(grid)]
  );
  return res.rows[0].ticket_id;
}

/** Create a Sold booking that owns `ticketIds`; returns booking_id. */
export async function createBooking(args: {
  gameId: string;
  ticketIds: number[];
  agentId: string;
  housieName: string;
  playerId?: string | null;
  totalAmount?: number;
}): Promise<string> {
  const p = getTestPool();
  const res = await p.query(
    `INSERT INTO Bookings
       (game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
        booking_status, locked_until, player_id)
     VALUES ($1, $2, $3, $4, $5, 'Sold', NOW() + INTERVAL '10 min', $6)
     RETURNING booking_id`,
    [
      args.gameId,
      args.ticketIds,
      args.housieName,
      args.agentId,
      args.totalAmount ?? 10,
      args.playerId ?? null,
    ]
  );
  return res.rows[0].booking_id;
}

/** Convenience: agent + game + role, all ready to use. */
export async function freshGameWithAgent(balance = 1000): Promise<{
  agentId: string;
  gameId: string;
}> {
  await ensureAgentRole();
  const agentId = await createAgent(balance);
  const gameId = await createGame();
  return { agentId, gameId };
}
