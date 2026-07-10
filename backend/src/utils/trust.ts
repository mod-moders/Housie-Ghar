/**
 * Trust tier derivation for Bookies (Agents).
 * Derived from confirmed sales rather than stored, so it can never drift.
 */

export type TrustTier = 'veteran' | 'trusted' | 'new';

export function deriveTrust(soldBookings: number): TrustTier {
  if (soldBookings >= 50) return 'veteran';
  if (soldBookings >= 10) return 'trusted';
  return 'new';
}
