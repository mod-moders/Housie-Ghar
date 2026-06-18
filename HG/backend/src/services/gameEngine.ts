/**
 * Conductor (Live Game Engine Loop) and Win Detection Engine
 */

import crypto from 'crypto';
import pool from '../db';
import { redisPublisher, redisSubscriber } from '../db/redis';
import { sseManager } from '../utils/sseManager';
import { io } from '../server';
import { PrizePattern } from '@shared/types/game';
import { TicketGridData } from '@shared/types/ticket';
import { logger } from '../utils/logger';

// In-memory runtime state for active games
interface ActiveGame {
  gameId: string;
  drawSequence: number[];
  drawnNumbers: number[];
  currentIndex: number;
  intervalMs: number;
  timer: NodeJS.Timeout | null;
  tickets: Array<{
    ticketId: number;
    ticketNumber: number;
    ownerHousieName: string;
    gridData: TicketGridData;
  }>;
  prizes: Array<{
    prizeId: number;
    patternName: PrizePattern;
    prizeAmount: number;
    claimed: boolean;
  }>;
}

const activeGames = new Map<string, ActiveGame>();

// Redis Pub/Sub Channels
const GAME_EVENTS_CHANNEL = 'game_events';

/**
 * Initialize Redis Pub/Sub subscription for game events
 */
export async function initGameEngineSubscription(): Promise<void> {
  await redisSubscriber.subscribe(GAME_EVENTS_CHANNEL, (message) => {
    const { gameId, payload } = JSON.parse(message);
    // Relays the event to SSE players and WebSockets operators/agents
    if (payload.event === 'draw') {
      sseManager.broadcast(gameId, payload);
      io.to(`game-${gameId}`).emit('draw_update', payload);
    } else if (payload.event === 'winner') {
      sseManager.broadcast(gameId, payload);
      io.to(`game-${gameId}`).emit('winner_announced', payload);
    } else if (payload.event === 'game_paused') {
      sseManager.broadcast(gameId, { ...payload, event: 'paused' });
      io.to(`game-${gameId}`).emit('paused', payload);
    } else if (payload.event === 'game_resumed') {
      sseManager.broadcast(gameId, { ...payload, event: 'resumed' });
      io.to(`game-${gameId}`).emit('resumed', payload);
    } else if (payload.event === 'game_completed') {
      sseManager.broadcast(gameId, { ...payload, event: 'completed' });
      io.to(`game-${gameId}`).emit('completed', payload);
    }
  });
  logger.info('Game Engine Redis Pub/Sub initialized');
}

/**
 * Publish game event to Redis Pub/Sub
 */
async function publishGameEvent(gameId: string, payload: any): Promise<void> {
  await redisPublisher.publish(GAME_EVENTS_CHANNEL, JSON.stringify({ gameId, payload }));
}

/**
 * Generate a pre-shuffled draw sequence of 1-90 using Fisher-Yates with CSPRNG
 */
function generateDrawSequence(): number[] {
  const sequence = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = sequence.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
  }
  return sequence;
}

/**
 * Extract numbers from ticket row
 */
function getRowNumbers(row: (number | null)[]): number[] {
  return row.filter((n): n is number => n !== null);
}

/**
 * Four corners detection helper
 */
function getFourCorners(grid: TicketGridData): number[] {
  const r1Nums = getRowNumbers(grid.row1);
  const r3Nums = getRowNumbers(grid.row3);
  return [
    r1Nums[0],                  // First number of Row 1
    r1Nums[r1Nums.length - 1],  // Last number of Row 1
    r3Nums[0],                  // First number of Row 3
    r3Nums[r3Nums.length - 1],  // Last number of Row 3
  ];
}

/**
 * Check if a sub-sequence is fully drawn
 */
function isSubset(subset: number[], set: Set<number>): boolean {
  return subset.every((num) => set.has(num));
}

/**
 * Start a scheduled game (Operator Command)
 */
export async function startGame(gameId: string, operatorId: string): Promise<void> {
  if (activeGames.has(gameId)) {
    throw new Error('Game is already active');
  }

  // 1. Fetch game details
  const gameRes = await pool.query(
    `SELECT game_status, title FROM Scheduled_Games WHERE game_id = $1`,
    [gameId]
  );
  if (gameRes.rowCount === 0) throw new Error('Game not found');
  const game = gameRes.rows[0];
  if (game.game_status !== 'Scheduled' && game.game_status !== 'Paused') {
    throw new Error(`Game cannot be started from state: ${game.game_status}`);
  }

  // 2. Fetch prizes
  const prizesRes = await pool.query(
    `SELECT prize_id, pattern_name, prize_amount, claimed
     FROM Prize_Pool
     WHERE game_id = $1`,
    [gameId]
  );
  const prizes = prizesRes.rows.map((row) => ({
    prizeId: row.prize_id,
    patternName: row.pattern_name as PrizePattern,
    prizeAmount: parseFloat(row.prize_amount),
    claimed: row.claimed,
  }));

  // 3. Fetch sold tickets with their owner names
  const ticketsRes = await pool.query(
    `SELECT ticket_id, ticket_number, owner_housie_name, grid_data
     FROM Tickets
     WHERE game_id = $1 AND status = 'Sold'`,
    [gameId]
  );
  const tickets = ticketsRes.rows.map((row) => ({
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    ownerHousieName: row.owner_housie_name,
    gridData: row.grid_data as TicketGridData,
  }));

  // 4. Generate or restore draw sequence
  let drawSequence = generateDrawSequence();
  let drawnNumbers: number[] = [];
  let currentIndex = 0;

  // Insert or fetch Game Logs (audit)
  const logRes = await pool.query(
    `INSERT INTO Game_Logs (game_id, draw_sequence, drawn_numbers, current_index, sequence_generated_at, last_draw_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (game_id) DO UPDATE SET last_draw_at = NOW()
     RETURNING draw_sequence, drawn_numbers, current_index`,
    [gameId, drawSequence, drawnNumbers, currentIndex]
  );

  if (logRes.rows[0]) {
    drawSequence = logRes.rows[0].draw_sequence;
    drawnNumbers = logRes.rows[0].drawn_numbers || [];
    currentIndex = logRes.rows[0].current_index;
  }

  // Update game status to Live
  await pool.query(
    `UPDATE Scheduled_Games
     SET game_status = 'Live', started_at = COALESCE(started_at, NOW())
     WHERE game_id = $1`,
    [gameId]
  );

  // Initialize runtime state
  const activeGame: ActiveGame = {
    gameId,
    drawSequence,
    drawnNumbers,
    currentIndex,
    intervalMs: 8000, // Default 8s
    timer: null,
    tickets,
    prizes,
  };

  activeGames.set(gameId, activeGame);
  logger.info({ gameId, title: game.title, ticketCount: tickets.length }, 'game started');

  // Start conduction ticks
  runConductorTick(gameId);
}

/**
 * Main game loop tick
 */
function runConductorTick(gameId: string): void {
  const game = activeGames.get(gameId);
  if (!game) return;

  game.timer = setTimeout(async () => {
    try {
      await processNextDraw(gameId);
    } catch (err) {
      logger.error({ err, gameId }, 'error in game tick');
      // Reschedule tick on failure to keep game running
      runConductorTick(gameId);
    }
  }, game.intervalMs);
}

/**
 * Core game tick logic: draw number, check wins, pause if winner, complete if done
 */
async function processNextDraw(gameId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  if (game.currentIndex >= 90) {
    await completeGame(gameId);
    return;
  }

  // 1. Draw next number from pre-generated sequence
  const drawNumber = game.drawSequence[game.currentIndex];
  game.drawnNumbers.push(drawNumber);
  game.currentIndex++;

  // 2. Update database logs
  await pool.query(
    `UPDATE Game_Logs
     SET drawn_numbers = $1, current_index = $2, last_draw_at = NOW(), total_drawn = $2
     WHERE game_id = $3`,
    [game.drawnNumbers, game.currentIndex, gameId]
  );

  logger.info({ gameId, drawNumber, total: game.currentIndex }, 'number drawn');

  // 3. Broadcast draw event
  const drawEvent = {
    event: 'draw' as const,
    draw_number: drawNumber,
    total_drawn: game.currentIndex,
    timestamp: new Date().toISOString(),
  };
  await publishGameEvent(gameId, drawEvent);

  // 4. Run Win Detection
  const winners = await checkWins(game);

  if (winners.length > 0) {
    // There are winner(s) on this tick!
    // Broadcast win announcements
    for (const win of winners) {
      const winnerEvent = {
        event: 'winner' as const,
        prize: win.patternName,
        housie_name: win.housieName,
        ticket_id: win.ticketId,
        amount: win.amountPerWinner,
        split_count: win.splitCount,
      };
      await publishGameEvent(gameId, winnerEvent);
    }

    logger.info({ gameId, count: winners.length }, 'winner(s) announced — conductor pausing 4s');
    game.timer = setTimeout(() => {
      runConductorTick(gameId);
    }, 4000);
  } else {
    // Continue loop normally
    runConductorTick(gameId);
  }
}

interface WinMatch {
  patternName: PrizePattern;
  ticketId: number;
  ticketNumber: number;
  housieName: string;
}

/**
 * Evaluate all winning patterns for all sold tickets
 */
async function checkWins(game: ActiveGame): Promise<Array<WinMatch & { amountPerWinner: number; splitCount: number }>> {
  const drawnSet = new Set(game.drawnNumbers);
  const detectedWinners: Array<WinMatch & { amountPerWinner: number; splitCount: number }> = [];

  // Evaluate each unclaimed prize
  for (const prize of game.prizes) {
    if (prize.claimed) continue;

    const patternWinners: WinMatch[] = [];

    for (const t of game.tickets) {
      let isWinner = false;

      if (prize.patternName === 'Early Five') {
        const allNums = [
          ...getRowNumbers(t.gridData.row1),
          ...getRowNumbers(t.gridData.row2),
          ...getRowNumbers(t.gridData.row3),
        ];
        // Intersection size >= 5
        const matching = allNums.filter((n) => drawnSet.has(n));
        isWinner = matching.length >= 5;
      } else if (prize.patternName === 'Top Line') {
        const row1 = getRowNumbers(t.gridData.row1);
        isWinner = isSubset(row1, drawnSet);
      } else if (prize.patternName === 'Middle Line') {
        const row2 = getRowNumbers(t.gridData.row2);
        isWinner = isSubset(row2, drawnSet);
      } else if (prize.patternName === 'Bottom Line') {
        const row3 = getRowNumbers(t.gridData.row3);
        isWinner = isSubset(row3, drawnSet);
      } else if (prize.patternName === 'Four Corners') {
        const corners = getFourCorners(t.gridData);
        isWinner = isSubset(corners, drawnSet);
      } else if (prize.patternName === 'Full House') {
        const allNums = [
          ...getRowNumbers(t.gridData.row1),
          ...getRowNumbers(t.gridData.row2),
          ...getRowNumbers(t.gridData.row3),
        ];
        isWinner = isSubset(allNums, drawnSet);
      }

      if (isWinner) {
        patternWinners.push({
          patternName: prize.patternName,
          ticketId: t.ticketId,
          ticketNumber: t.ticketNumber,
          housieName: t.ownerHousieName,
        });
      }
    }

    if (patternWinners.length > 0) {
      // Mark prize as claimed in memory
      prize.claimed = true;

      // Split amount if multiple winners on the same draw tick
      const splitCount = patternWinners.length;
      const amountPerWinner = parseFloat((prize.prizeAmount / splitCount).toFixed(2));

      // Record winners in database
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Update Prize_Pool
        await client.query(
          `UPDATE Prize_Pool
           SET claimed = TRUE,
               winner_ticket_id = $1,
               winner_housie_name = $2,
               claimed_at = NOW(),
               split_count = $3,
               amount_per_winner = $4
           WHERE prize_id = $5`,
          [
            patternWinners[0].ticketId, // Stores first winner's ID or comma separated
            patternWinners.map((w) => w.housieName).join(', '),
            splitCount,
            amountPerWinner,
            prize.prizeId,
          ]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, 'error updating prize claim in DB');
      } finally {
        client.release();
      }

      patternWinners.forEach((win) => {
        detectedWinners.push({
          ...win,
          amountPerWinner,
          splitCount,
        });
      });
    }
  }

  return detectedWinners;
}

/**
 * Pause the active game loop
 */
export async function pauseGame(gameId: string, operatorId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) throw new Error('Game is not actively running');

  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }

  await pool.query(
    `UPDATE Scheduled_Games SET game_status = 'Paused' WHERE game_id = $1`,
    [gameId]
  );

  const pauseEvent = {
    event: 'game_paused' as const,
    timestamp: new Date().toISOString(),
  };
  await publishGameEvent(gameId, pauseEvent);
  logger.info({ gameId, operatorId }, 'game paused');
}

/**
 * Resume a paused game loop
 */
export async function resumeGame(gameId: string, operatorId: string): Promise<void> {
  // If the process was restarted while this game was Paused, its in-memory
  // state is gone — boot-time auto-resume only rehydrates games left in the
  // 'Live' state. Rather than stranding it with "Game state not loaded",
  // rebuild from Game_Logs: startGame accepts the 'Paused' state, restores the
  // drawn progress, flips status to Live and restarts the conductor (a full
  // resume). Otherwise just restart the loop on the live in-memory state.
  if (!activeGames.has(gameId)) {
    await startGame(gameId, operatorId);
  } else {
    await pool.query(
      `UPDATE Scheduled_Games SET game_status = 'Live' WHERE game_id = $1`,
      [gameId]
    );
    runConductorTick(gameId);
  }

  const game = activeGames.get(gameId);
  const resumeEvent = {
    event: 'game_resumed' as const,
    timestamp: new Date().toISOString(),
    interval_ms: game?.intervalMs,
  };
  await publishGameEvent(gameId, resumeEvent);
  logger.info({ gameId, operatorId }, 'game resumed');
}

/**
 * Change draw interval speed (seconds)
 */
export async function changeGameSpeed(gameId: string, intervalMs: number, operatorId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) throw new Error('Game state not loaded');

  game.intervalMs = intervalMs;
  logger.info({ gameId, intervalMs, operatorId }, 'game speed updated');
}

/**
 * Complete game when draw ends or all prizes claimed
 */
export async function completeGame(gameId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }

  await pool.query(
    `UPDATE Scheduled_Games
     SET game_status = 'Completed', completed_at = NOW()
     WHERE game_id = $1`,
    [gameId]
  );

  // Fetch final leaderboard (all claimed prizes)
  const prizesRes = await pool.query(
    `SELECT pattern_name, winner_housie_name, amount_per_winner
     FROM Prize_Pool
     WHERE game_id = $1 AND claimed = TRUE`,
    [gameId]
  );

  const leaderboard = prizesRes.rows.map((row) => ({
    prize: row.pattern_name,
    housie_name: row.winner_housie_name || 'No Winner',
    amount: parseFloat(row.amount_per_winner || '0'),
  }));

  const completeEvent = {
    event: 'game_completed' as const,
    final_leaderboard: leaderboard,
  };

  await publishGameEvent(gameId, completeEvent);
  activeGames.delete(gameId);

  logger.info({ gameId, leaderboard }, 'game completed');
}

/**
 * On boot, find any games that were Live when the process last died,
 * flip them to Paused (so startGame's status gate passes), then restart
 * the conductor loop — restoring draw progress from Game_Logs.
 */
export async function resumeInterruptedGames(): Promise<void> {
  const res = await pool.query<{ game_id: string; title: string }>(
    `SELECT game_id, title FROM Scheduled_Games WHERE game_status = 'Live'`
  );
  if (res.rowCount === 0) return;

  logger.info({ count: res.rowCount }, 'resuming interrupted games');

  for (const row of res.rows) {
    try {
      await pool.query(
        `UPDATE Scheduled_Games SET game_status = 'Paused' WHERE game_id = $1`,
        [row.game_id]
      );
      await startGame(row.game_id, 'system-boot');
      logger.info({ gameId: row.game_id, title: row.title }, 'game resumed on boot');
    } catch (err) {
      logger.error({ err, gameId: row.game_id }, 'could not resume game on boot');
    }
  }
}
