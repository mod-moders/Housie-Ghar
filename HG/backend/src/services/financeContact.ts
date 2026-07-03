/**
 * Resolve the person a Bookie should WhatsApp about money: the Active Admin
 * designated CFO, else an Active Superadmin. Both the recharge (top-up) flow
 * and the prize-claim flow route through this one contact so all wallet money
 * conversations land in the same chat.
 *
 * Takes the `pg` handle as a parameter (never the env-bound singleton) so it
 * is integration-testable.
 */

import { Pool, PoolClient } from 'pg';

export interface FinanceContact {
  full_name: string;
  phone: string;
}

export async function findFinanceContact(db: Pool | PoolClient): Promise<FinanceContact | null> {
  const res = await db.query(
    `SELECT full_name, phone
     FROM Users
     WHERE status = 'Active' AND phone IS NOT NULL
       AND ((role_id = 2 AND is_cfo = TRUE) OR role_id = 1)
     ORDER BY (role_id = 2 AND is_cfo = TRUE) DESC, role_id ASC
     LIMIT 1`
  );
  if (res.rowCount === 0 || !res.rows[0].phone) return null;
  return { full_name: res.rows[0].full_name, phone: res.rows[0].phone };
}
