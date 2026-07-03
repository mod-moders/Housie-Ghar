import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimMessage, buildCollectMessage, buildSettleNoticeMessage } from './payoutMessages';

test('buildClaimMessage totals the owed rows and itemises each win', () => {
  const msg = buildClaimMessage('Bah Khrawbor', [
    { pattern_name: 'Early Five', amount: 50, ticket_number: 12, game_title: 'Sunday Mega' },
    { pattern_name: 'Top Line', amount: 100, ticket_number: 4, game_title: 'Sunday Mega' },
  ]);
  assert.match(msg, /Bah Khrawbor \(Bookie\)/);
  assert.match(msg, /₹150 in prize payouts/);
  assert.match(msg, /Early Five ₹50 \(ticket #12, Sunday Mega\)/);
  assert.match(msg, /Top Line ₹100 \(ticket #4, Sunday Mega\)/);
  assert.match(msg, /credit my wallet/);
});

test('buildCollectMessage names both parties, the win and the game', () => {
  const msg = buildCollectMessage({
    winnerName: 'Asha',
    agentName: 'Kong Daphi',
    patternName: 'Full House',
    amount: 500,
    ticketNumber: 7,
    gameTitle: 'Friday Night',
  });
  assert.match(msg, /Hi Kong Daphi/);
  assert.match(msg, /this is Asha/);
  assert.match(msg, /ticket #7 won Full House \(₹500\) in "Friday Night"/);
});

test('buildSettleNoticeMessage handles a missing winner name', () => {
  const withName = buildSettleNoticeMessage('Bah', 'Top Line', 100, 3, 'Asha');
  assert.match(withName, /won by Asha/);
  const anon = buildSettleNoticeMessage('Bah', 'Top Line', 100, 3, null);
  assert.doesNotMatch(anon, /won by/);
  assert.match(anon, /Top Line prize of ₹100 \(ticket #3\)/);
});
