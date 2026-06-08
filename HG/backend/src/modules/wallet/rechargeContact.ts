/**
 * Pure builder for the recharge-request WhatsApp message a Bookie sends to the
 * Financial Officer. The CFO/Superadmin lookup itself happens in the controller
 * (it needs the DB); this stays pure so it can be unit-tested.
 */
export function buildRechargeMessage(agentName: string, amount: number, reference: string): string {
  return `Hi, I am ${agentName} (Bookie). I have sent ₹${amount} for a wallet recharge. Reference: ${reference}. Please verify and credit my wallet.`;
}
