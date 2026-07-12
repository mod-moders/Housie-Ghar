/**
 * Users service — staff-account operations that need to be integration-testable.
 * Takes a `pg` handle as a parameter (never the env-bound singleton), matching
 * auth.service.ts / settlements.service.ts.
 */

import { Pool, PoolClient } from 'pg';

export type DeleteStaffResult =
  | { ok: true; deleted: { user_id: string; full_name: string; email: string; role_id: number } }
  | { ok: false; reason: 'not_found' | 'self' | 'has_history' };

/**
 * Hard-delete a staff account. Refuses to delete the caller's own account, and
 * relies on the schema's FK constraints to protect history: any account still
 * referenced by bookings, wallet entries, games, top-ups, settlements or other
 * users maps to `has_history` (the caller should suspend instead). Audit_Log
 * deliberately has no FK on user_id (migration 019) so the immutable trail
 * never blocks deletion.
 */
export async function deleteStaffUser(
  db: Pool | PoolClient,
  args: { targetId: string; actorId: string }
): Promise<DeleteStaffResult> {
  if (args.targetId === args.actorId) return { ok: false, reason: 'self' };

  try {
    const res = await db.query(
      `DELETE FROM Users WHERE user_id = $1
       RETURNING user_id, full_name, email, role_id`,
      [args.targetId]
    );
    if (res.rowCount === 0) return { ok: false, reason: 'not_found' };
    const row = res.rows[0];
    return {
      ok: true,
      deleted: {
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        role_id: row.role_id,
      },
    };
  } catch (error: any) {
    if (error?.code === '23503') return { ok: false, reason: 'has_history' }; // FK violation
    if (error?.code === '22P02') return { ok: false, reason: 'not_found' }; // malformed uuid
    throw error;
  }
}
