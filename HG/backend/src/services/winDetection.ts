/**
 * Pure win-detection logic for the Housie game engine.
 *
 * This module has ZERO IO and imports only types — no DB, Redis, Socket.io, or
 * env. That keeps it trivially unit-testable and lets the engine depend on a
 * small, well-understood surface.
 */

import { PrizePattern } from '@shared/types/game';
import { TicketGridData } from '@shared/types/ticket';

export interface DetectableTicket {
  ticketId: number;
  ticketNumber: number;
  ownerHousieName: string;
  gridData: TicketGridData;
}

export interface PatternWinner {
  ticketId: number;
  ticketNumber: number;
  housieName: string;
}

/** Non-null numbers of a single ticket row, left to right. */
function getRowNumbers(row: (number | null)[]): number[] {
  return row.filter((n): n is number => n !== null);
}

/** First & last real number of rows 1 and 3 (the four corners). */
function getFourCorners(grid: TicketGridData): number[] {
  const r1 = getRowNumbers(grid.row1);
  const r3 = getRowNumbers(grid.row3);
  return [r1[0], r1[r1.length - 1], r3[0], r3[r3.length - 1]];
}

/** True when every number in `subset` has been drawn. */
function isSubset(subset: number[], drawn: Set<number>): boolean {
  return subset.every((n) => drawn.has(n));
}

/** All non-null numbers on a ticket. */
function allTicketNumbers(grid: TicketGridData): number[] {
  return [
    ...getRowNumbers(grid.row1),
    ...getRowNumbers(grid.row2),
    ...getRowNumbers(grid.row3),
  ];
}

/** Centre cell of the ticket: the 3rd real number of the middle row. */
function getCenter(grid: TicketGridData): number {
  const r2 = getRowNumbers(grid.row2);
  return r2[2];
}

/**
 * The ordered Full House tiers plus the plain 'Full House' (used when a game
 * carries a single tier). A ticket may take only ONE tier, so the engine
 * excludes earlier tiers' winning tickets when checking the next tier.
 */
const FULL_HOUSE_PATTERNS: ReadonlySet<string> = new Set([
  'Full House',
  '1st Full House',
  '2nd Full House',
  '3rd Full House',
]);

export function isFullHousePattern(pattern: PrizePattern): boolean {
  return FULL_HOUSE_PATTERNS.has(pattern);
}

function ticketSatisfies(
  pattern: PrizePattern,
  grid: TicketGridData,
  drawn: Set<number>
): boolean {
  switch (pattern) {
    case 'Early Five':
      return allTicketNumbers(grid).filter((n) => drawn.has(n)).length >= 5;
    case 'Quick 7':
      return allTicketNumbers(grid).filter((n) => drawn.has(n)).length >= 7;
    case 'Top Line':
      return isSubset(getRowNumbers(grid.row1), drawn);
    case 'Middle Line':
      return isSubset(getRowNumbers(grid.row2), drawn);
    case 'Bottom Line':
      return isSubset(getRowNumbers(grid.row3), drawn);
    case 'Corner':
    case 'Four Corners':
      return isSubset(getFourCorners(grid), drawn);
    case 'Star':
      return isSubset(getFourCorners(grid), drawn) && drawn.has(getCenter(grid));
    case 'Box Bonus': {
      const rows = [grid.row1, grid.row2, grid.row3];
      return rows.every(
        (row) => getRowNumbers(row).filter((n) => drawn.has(n)).length >= 2
      );
    }
    case 'Full House':
    case '1st Full House':
    case '2nd Full House':
    case '3rd Full House':
      return isSubset(allTicketNumbers(grid), drawn);
    default:
      return false;
  }
}

/**
 * Every ticket that currently satisfies the given prize pattern. Tickets in
 * `excludeTicketIds` are skipped — the engine passes the ids that already took
 * an earlier Full House tier so 1st/2nd/3rd land on distinct tickets.
 */
export function detectPatternWinners(
  pattern: PrizePattern,
  tickets: DetectableTicket[],
  drawn: Set<number>,
  excludeTicketIds?: ReadonlySet<number>
): PatternWinner[] {
  const winners: PatternWinner[] = [];
  for (const t of tickets) {
    if (excludeTicketIds?.has(t.ticketId)) continue;
    if (ticketSatisfies(pattern, t.gridData, drawn)) {
      winners.push({
        ticketId: t.ticketId,
        ticketNumber: t.ticketNumber,
        housieName: t.ownerHousieName,
      });
    }
  }
  return winners;
}

/**
 * Split `amount` (rupees, 2 dp) into `n` shares that sum EXACTLY to `amount`.
 * Works in integer paise to avoid float drift; the first `remainder` winners
 * each receive one extra paisa.
 */
export function splitPrize(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const totalPaise = Math.round(amount * 100);
  const base = Math.floor(totalPaise / n);
  const remainder = totalPaise - base * n;
  const shares: number[] = [];
  for (let i = 0; i < n; i++) {
    const paise = base + (i < remainder ? 1 : 0);
    shares.push(paise / 100);
  }
  return shares;
}

/** True when every prize in the list is claimed (vacuously true if empty). */
export function allPrizesClaimed(prizes: Array<{ claimed: boolean }>): boolean {
  return prizes.every((p) => p.claimed);
}
