/**
 * Pure builders for the WhatsApp messages that carry the prize-payout flow.
 * Money moves person-to-person on WhatsApp (winner ← bookie ← CFO); the app
 * only records it, so these prefilled texts are the actual payment rails.
 * DB lookups and wa.me link assembly happen in the controllers; this module
 * stays pure so it can be unit-tested.
 */

export interface ClaimItem {
  pattern_name: string;
  amount: number;
  ticket_number: number;
  game_title: string;
}

/** Bookie → Financial Officer: claim owed prize money back into the wallet. */
export function buildClaimMessage(agentName: string, items: ClaimItem[]): string {
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const lines = items
    .map((i) => `• ${i.pattern_name} ₹${i.amount} (ticket #${i.ticket_number}, ${i.game_title})`)
    .join('\n');
  return (
    `Hi, I am ${agentName} (Bookie). I am owed ₹${total} in prize payouts:\n${lines}\n` +
    `I am paying the winner(s) in cash — please verify and credit my wallet.`
  );
}

export interface CollectParams {
  winnerName: string;
  agentName: string;
  patternName: string;
  amount: number;
  ticketNumber: number;
  gameTitle: string;
}

/** Winner → Bookie: collect the cash prize from the bookie who sold the ticket. */
export function buildCollectMessage(p: CollectParams): string {
  return (
    `Hi ${p.agentName}, this is ${p.winnerName}! My ticket #${p.ticketNumber} won ` +
    `${p.patternName} (₹${p.amount}) in "${p.gameTitle}". Collecting my prize — how do I get paid?`
  );
}

/** Financial Officer → Bookie: coordinate/confirm a settlement from the payouts panel. */
export function buildSettleNoticeMessage(
  agentName: string,
  patternName: string,
  amount: number,
  ticketNumber: number,
  winnerName: string | null
): string {
  const who = winnerName ? ` won by ${winnerName}` : '';
  return (
    `Hi ${agentName}, about the ${patternName} prize of ₹${amount}` +
    `${who} (ticket #${ticketNumber}) — settling it against your wallet now.`
  );
}
