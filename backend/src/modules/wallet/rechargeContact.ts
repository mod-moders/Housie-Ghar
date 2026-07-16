/**
 * Pure builder for the recharge-request WhatsApp message a Bookie sends to the
 * Financial Officer. The CFO/Superadmin lookup itself happens in the controller
 * (it needs the DB); this stays pure so it can be unit-tested.
 */
export function buildRechargeMessage(
  agentName: string,
  walletAmount: number,
  payableAmount: number,
  commPerTicket: number
): string {
  return `Hi, I am ${agentName} (Bookie). I have requested a wallet recharge of ₹${walletAmount}. Based on the commission rate of ₹${commPerTicket} per ₹100, I have to pay the discounted amount of ₹${payableAmount}. Please send your QR/UPI ID for the payment.`;
}
