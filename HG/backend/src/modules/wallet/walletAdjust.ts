export type AdjustType = 'Credit' | 'Debit';
export const MIN_REASON_LEN = 20;

export interface AdjustValidation {
  ok: boolean;
  error?: string;
  type?: AdjustType;
  amount?: number;
  reason?: string;
}

/** Validate a manual-adjust request body. Pure — no DB. */
export function validateAdjust(input: { type?: unknown; amount?: unknown; reason?: unknown }): AdjustValidation {
  const { type, amount, reason } = input;
  if (type !== 'Credit' && type !== 'Debit') {
    return { ok: false, error: "type must be 'Credit' or 'Debit'" };
  }
  const amt = typeof amount === 'string' ? parseFloat(amount) : (amount as number);
  if (typeof amt !== 'number' || isNaN(amt) || amt <= 0) {
    return { ok: false, error: 'amount must be a positive number' };
  }
  if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LEN) {
    return { ok: false, error: `reason is required and must be at least ${MIN_REASON_LEN} characters` };
  }
  return { ok: true, type, amount: amt, reason: reason.trim() };
}

export interface BalanceResult {
  ok: boolean;
  balance_after?: number;
  error?: string;
}

/** Compute the post-adjustment balance, rejecting debits that would go negative. */
export function computeBalanceAfter(current: number, type: AdjustType, amount: number): BalanceResult {
  if (type === 'Credit') return { ok: true, balance_after: current + amount };
  if (amount > current) return { ok: false, error: 'Debit would make the wallet balance negative' };
  return { ok: true, balance_after: current - amount };
}
