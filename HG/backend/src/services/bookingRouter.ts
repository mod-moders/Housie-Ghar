/**
 * bookingRouter — pure liquidity-aware round-robin selection.
 *
 * Given the active bookies (in a deterministic order), the round-robin cursor
 * (the last assigned agent), and the total payable amount, decide which bookie
 * should receive the booking. Bookies whose wallet balance cannot cover the
 * total are skipped. If no bookie qualifies, `assigned` is null and the caller
 * routes the booking to the Operator (overflow failsafe).
 *
 * This module is intentionally free of DB / IO so it can be unit-tested.
 */

export interface RoutableAgent {
  user_id: string;
  current_balance: number;
}

export interface RoutingResult<T extends RoutableAgent = RoutableAgent> {
  /** The bookie that should fulfil the booking, or null if all were skipped. */
  assigned: T | null;
  /** Bookies skipped (insufficient balance) before a match / before giving up. */
  skipped: T[];
}

/**
 * Select the next eligible bookie in round-robin order.
 *
 * @param agents       Active bookies in a stable order (e.g. by user_id).
 * @param lastAgentId  user_id of the most recently assigned bookie, or null.
 * @param totalAmount  Total payable for the requested tickets.
 */
export function selectAgentForBooking<T extends RoutableAgent>(
  agents: T[],
  lastAgentId: string | null,
  totalAmount: number
): RoutingResult<T> {
  const skipped: T[] = [];

  if (agents.length === 0) {
    return { assigned: null, skipped };
  }

  // Cursor starts at the agent *after* the last assigned one.
  const lastIndex = lastAgentId ? agents.findIndex((a) => a.user_id === lastAgentId) : -1;
  const start = lastIndex === -1 ? 0 : (lastIndex + 1) % agents.length;

  for (let step = 0; step < agents.length; step++) {
    const agent = agents[(start + step) % agents.length];
    if (agent.current_balance >= totalAmount) {
      return { assigned: agent, skipped };
    }
    skipped.push(agent);
  }

  // Full loop, nobody had sufficient inventory → overflow.
  return { assigned: null, skipped };
}
