/**
 * Route parameter shape guards.
 *
 * Every id in a URL is fed straight into a query, and Postgres rejects a
 * malformed uuid/integer with a type error rather than an empty result. That
 * surfaced through the generic catch blocks as a 500: `/api/games/not-a-uuid`,
 * `/api/tickets/abc`, `/api/bookings/status/nope` and several others all
 * answered "Internal server error" for what is really just a bad link.
 *
 * Registered with `router.param()`, these run once per router and cover every
 * route that names the parameter, so a new route cannot forget the check.
 * A well-formed id that simply does not exist still reaches the handler and
 * gets that handler's own 404 — this only rejects values that could never
 * match anything.
 */

import { RequestParamHandler } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Largest value a Postgres `integer` column can hold. */
const INT4_MAX = 2147483647;

/** Reject anything that is not a well-formed UUID. */
export function uuidParam(label: string): RequestParamHandler {
  return (_req, res, next, value) => {
    if (typeof value === 'string' && UUID_RE.test(value)) {
      next();
      return;
    }
    res.status(404).json({ message: `${label} not found` });
  };
}

/** Reject anything that is not a non-negative integer a Postgres `integer` can hold. */
export function intParam(label: string): RequestParamHandler {
  return (_req, res, next, value) => {
    const raw = String(value);
    if (/^\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed) && parsed <= INT4_MAX) {
        next();
        return;
      }
    }
    res.status(404).json({ message: `${label} not found` });
  };
}
