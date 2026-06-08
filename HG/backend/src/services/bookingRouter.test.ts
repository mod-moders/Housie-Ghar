import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAgentForBooking, RoutableAgent } from './bookingRouter';

const a = (id: string, bal: number): RoutableAgent => ({ user_id: id, current_balance: bal });

test('assigns the first agent when no prior booking and balance suffices', () => {
  const agents = [a('A', 100), a('B', 100), a('C', 100)];
  const r = selectAgentForBooking(agents, null, 50);
  assert.equal(r.assigned?.user_id, 'A');
  assert.deepEqual(r.skipped, []);
});

test('round-robin advances to the agent after the last assigned', () => {
  const agents = [a('A', 100), a('B', 100), a('C', 100)];
  const r = selectAgentForBooking(agents, 'A', 50);
  assert.equal(r.assigned?.user_id, 'B');
});

test('wraps around to the first agent after the last in the list', () => {
  const agents = [a('A', 100), a('B', 100), a('C', 100)];
  const r = selectAgentForBooking(agents, 'C', 50);
  assert.equal(r.assigned?.user_id, 'A');
});

test('skips agents with insufficient balance, assigns the next eligible one', () => {
  const agents = [a('A', 100), a('B', 10), a('C', 100)];
  const r = selectAgentForBooking(agents, 'A', 50); // start at B
  assert.equal(r.assigned?.user_id, 'C');
  assert.deepEqual(r.skipped.map((s) => s.user_id), ['B']);
});

test('boundary: balance exactly equal to total is eligible', () => {
  const agents = [a('A', 50)];
  const r = selectAgentForBooking(agents, null, 50);
  assert.equal(r.assigned?.user_id, 'A');
});

test('overflow: all agents insufficient → assigned null, all skipped', () => {
  const agents = [a('A', 10), a('B', 20), a('C', 5)];
  const r = selectAgentForBooking(agents, 'B', 50); // start at C
  assert.equal(r.assigned, null);
  // every agent is skipped, in circular order starting at C
  assert.deepEqual(r.skipped.map((s) => s.user_id), ['C', 'A', 'B']);
});

test('empty agent list → overflow with no skips', () => {
  const r = selectAgentForBooking([], null, 50);
  assert.equal(r.assigned, null);
  assert.deepEqual(r.skipped, []);
});

test('unknown lastAgentId falls back to start at index 0', () => {
  const agents = [a('A', 100), a('B', 100)];
  const r = selectAgentForBooking(agents, 'ZZZ', 50);
  assert.equal(r.assigned?.user_id, 'A');
});

test('single agent with insufficient balance → overflow', () => {
  const agents = [a('A', 10)];
  const r = selectAgentForBooking(agents, null, 50);
  assert.equal(r.assigned, null);
  assert.deepEqual(r.skipped.map((s) => s.user_id), ['A']);
});
