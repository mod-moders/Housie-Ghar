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
  // Tickets that have already won any Full House tier (1st/2nd/3rd/generic).
  // A ticket that completes all 15 numbers stays "isSubset(allNums, drawnSet)"
  // for the rest of the game, so if 2+ Full House tiers are still unclaimed
  // when it completes, it would otherwise match every one of them in the same
  // tick and sweep 1st+2nd+3rd itself. Once a ticket lands here it's excluded
  // from matching any further Full House tier — those must go to a different ticket.
  fullHouseWinnerTicketIds: Set<number>;
}

function isFullHousePattern(patternName: PrizePattern): boolean {
  return (
    patternName === 'Full House' ||
    patternName === '1st Full House' ||
    patternName === '2nd Full House' ||
    patternName === '3rd Full House'
  );
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
  console.log('📢 Game Engine Redis Pub/Sub initialized');
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
    `SELECT prize_id, pattern_name, prize_amount, claimed, winner_ticket_id
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

  // Seed already-won Full House tickets so a resume after a process restart
  // (game.game_status === 'Paused') still excludes them. Best-effort: split
  // wins only persist the first winner's ticket_id (see checkWins), so a
  // resumed game could in theory miss a split partner here — pre-existing
  // limitation of winner_ticket_id, not something this fix introduces.
  const fullHouseWinnerTicketIds = new Set<number>(
    prizes
      .filter((p) => p.claimed && isFullHousePattern(p.patternName))
      .map((p) => prizesRes.rows.find((r) => r.prize_id === p.prizeId)?.winner_ticket_id)
      .filter((id): id is number => id != null)
  );

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
    intervalMs: 12000, // 12s default interval between calls
    timer: null,
    tickets,
    prizes,
    fullHouseWinnerTicketIds,
  };

  activeGames.set(gameId, activeGame);
  console.log(`🎮 Game started: ${game.title} (ID: ${gameId}). Total tickets: ${tickets.length}`);

  // Start conduction ticks (53s initial delay for fresh games — must match the frontend's
  // fixed startup sequence in LiveBoardContent.tsx: 10s hold + 10s welcome banner + 10s hold
  // + 20s intro audio + 3s hold, then the cage rolls and this first draw is revealed).
  const initialDelay = currentIndex === 0 ? 53000 : 3000;
  runConductorTick(gameId, initialDelay);
}

/**
 * Main game loop tick
 */
function runConductorTick(gameId: string, customDelayMs?: number): void {
  const game = activeGames.get(gameId);
  if (!game) return;

  const delayMs = customDelayMs !== undefined ? customDelayMs : game.intervalMs;

  game.timer = setTimeout(async () => {
    try {
      await processNextDraw(gameId);
    } catch (err) {
      console.error(`Error in game tick for game ${gameId}:`, err);
      // Reschedule tick on failure to keep game running
      runConductorTick(gameId);
    }
  }, delayMs);
}

/**
 * Core game tick logic: draw number, check wins, pause if winner, complete if done
 */
async function processNextDraw(gameId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  if (game.currentIndex >= 90) {
    await endGameDraw(gameId);
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

  console.log(`🎲 Game ${gameId} Drew: ${drawNumber} (${game.currentIndex}/90)`);

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
        winner_ticket_number: win.ticketNumber,
        amount: win.amountPerWinner,
        split_count: win.splitCount,
      };
      await publishGameEvent(gameId, winnerEvent);
    }

    const allPrizesClaimed = game.prizes.every(p => p.claimed);

    // Add a 4-second pause to the next tick as specified in PDR Chapter 7.4
    console.log(`🏆 Winners announced! Pausing conductor for 4 seconds...`);
    game.timer = setTimeout(() => {
      if (allPrizesClaimed) {
        endGameDraw(gameId).catch(err => console.error("Error ending draw:", err));
      } else {
        runConductorTick(gameId);
      }
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

    const lastDrawn = game.drawnNumbers[game.drawnNumbers.length - 1];
    const patternWinners: WinMatch[] = [];

    for (const t of game.tickets) {
      const allNums = [
        ...getRowNumbers(t.gridData.row1),
        ...getRowNumbers(t.gridData.row2),
        ...getRowNumbers(t.gridData.row3),
      ];
      if (lastDrawn !== undefined && !allNums.includes(lastDrawn)) continue;

      let isWinner = false;

      if (prize.patternName === 'Early Five') {
        // Intersection size >= 5
        const matching = allNums.filter((n) => drawnSet.has(n));
        isWinner = matching.length >= 5;
      } else if (prize.patternName === 'Quick 7') {
        const matching = allNums.filter((n) => drawnSet.has(n));
        isWinner = matching.length >= 7;
      } else if (prize.patternName === 'Corner') {
        const corners = getFourCorners(t.gridData);
        isWinner = isSubset(corners, drawnSet);
      } else if (prize.patternName === 'Star') {
        const corners = getFourCorners(t.gridData);
        const row2Nums = getRowNumbers(t.gridData.row2);
        const centerNum = row2Nums[2];
        isWinner = isSubset(corners, drawnSet) && drawnSet.has(centerNum);
      } else if (prize.patternName === 'Top Line') {
        const row1 = getRowNumbers(t.gridData.row1);
        isWinner = isSubset(row1, drawnSet);
      } else if (prize.patternName === 'Middle Line') {
        const row2 = getRowNumbers(t.gridData.row2);
        isWinner = isSubset(row2, drawnSet);
      } else if (prize.patternName === 'Bottom Line') {
        const row3 = getRowNumbers(t.gridData.row3);
        isWinner = isSubset(row3, drawnSet);
      } else if (prize.patternName === 'Box Bonus') {
        const row1 = getRowNumbers(t.gridData.row1).filter((n) => drawnSet.has(n));
        const row2 = getRowNumbers(t.gridData.row2).filter((n) => drawnSet.has(n));
        const row3 = getRowNumbers(t.gridData.row3).filter((n) => drawnSet.has(n));
        isWinner = row1.length >= 2 && row2.length >= 2 && row3.length >= 2;
      } else if (isFullHousePattern(prize.patternName)) {
        // A ticket that already won a Full House tier stays fully-marked for
        // the rest of the game, so without this check it would also win
        // every other still-unclaimed Full House tier — 1st, 2nd and 3rd
        // must go to different tickets.
        isWinner = isSubset(allNums, drawnSet) && !game.fullHouseWinnerTicketIds.has(t.ticketId);
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
      // Split amount if multiple winners on the same draw tick
      const splitCount = patternWinners.length;
      const amountPerWinner = parseFloat((prize.prizeAmount / splitCount).toFixed(2));

      // Persist the claim FIRST. Only after the DB commit succeeds do we mark the
      // prize claimed in memory and add it to the announced winners. If the write
      // fails we roll back and leave the prize unclaimed (in memory and in the DB)
      // so a later tick can retry — we never announce a winner that was never
      // recorded. (Previously prize.claimed was flipped before the write and not
      // reset on rollback, so a DB failure announced a phantom, unpersisted win.)
      const client = await pool.connect();
      let committed = false;

      const grouped = new Map<string, number[]>();
      patternWinners.forEach((w) => {
        const list = grouped.get(w.housieName) || [];
        list.push(w.ticketNumber);
        grouped.set(w.housieName, list);
      });

      const formattedWinnerName = Array.from(grouped.entries()).map(([name, ticketNums]) => {
        if (ticketNums.length === 1) {
          return `${name} (${ticketNums[0]})`;
        } else {
          return `${name} (${ticketNums.join(' & ')})`;
        }
      }).join(' & ');

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
            patternWinners[0].ticketId,
            formattedWinnerName,
            splitCount,
            amountPerWinner,
            prize.prizeId,
          ]
        );
        await client.query('COMMIT');
        committed = true;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating prize claim in DB:', err);
      } finally {
        client.release();
      }

      if (committed) {
        prize.claimed = true;
        if (isFullHousePattern(prize.patternName)) {
          patternWinners.forEach((win) => game.fullHouseWinnerTicketIds.add(win.ticketId));
        }
        patternWinners.forEach((win) => {
          const ticketNums = grouped.get(win.housieName) || [win.ticketNumber];
          const formattedName = ticketNums.length === 1 
            ? `${win.housieName} (${ticketNums[0]})`
            : `${win.housieName} (${ticketNums.join(' & ')})`;

          detectedWinners.push({
            ...win,
            housieName: formattedName,
            amountPerWinner,
            splitCount,
          });
        });
      }
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
  console.log(`⏸ Game ${gameId} paused by Operator ${operatorId}`);
}

/**
 * Resume a paused game loop
 */
export async function resumeGame(gameId: string, operatorId: string): Promise<void> {
  const game = activeGames.get(gameId);

  // If the process restarted while the game was Paused, the in-memory runtime
  // state is gone. Rebuild it from Game_Logs via startGame (which accepts the
  // Paused state and restores drawn_numbers/current_index and the conductor loop)
  // rather than failing with "Game state not loaded".
  if (!game) {
    await startGame(gameId, operatorId);
    const resumeEvent = {
      event: 'game_resumed' as const,
      timestamp: new Date().toISOString(),
      interval_ms: activeGames.get(gameId)?.intervalMs,
    };
    await publishGameEvent(gameId, resumeEvent);
    console.log(`▶ Game ${gameId} resumed (rebuilt from logs) by Operator ${operatorId}`);
    return;
  }

  await pool.query(
    `UPDATE Scheduled_Games SET game_status = 'Live' WHERE game_id = $1`,
    [gameId]
  );

  const resumeEvent = {
    event: 'game_resumed' as const,
    timestamp: new Date().toISOString(),
    interval_ms: game.intervalMs,
  };
  await publishGameEvent(gameId, resumeEvent);
  console.log(`▶ Game ${gameId} resumed by Operator ${operatorId}`);

  runConductorTick(gameId);
}

/**
 * Change draw interval speed (seconds)
 */
export async function changeGameSpeed(gameId: string, intervalMs: number, operatorId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) throw new Error('Game state not loaded');

  game.intervalMs = intervalMs;
  console.log(`⚡ Speed updated for Game ${gameId}: ${intervalMs}ms by Operator ${operatorId}`);
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

  console.log(`🏁 Game ${gameId} Completed! leaderboard:`, leaderboard);
}

/**
 * End draw loop when all prizes are won
 */
export async function endGameDraw(gameId: string): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }

  // Check if any prizes were actually won/claimed during the game
  const wonPrizesRes = await pool.query(
    `SELECT COUNT(*)::integer as won_count FROM Prize_Pool WHERE game_id = $1 AND claimed = TRUE`,
    [gameId]
  );
  const wonCount = parseInt(wonPrizesRes.rows[0].won_count || '0');

  if (wonCount === 0) {
    // If no claims are to be made for the game, treat it as completed immediately!
    await pool.query(
      `UPDATE Scheduled_Games
       SET game_status = 'Completed', completed_at = NOW()
       WHERE game_id = $1`,
      [gameId]
    );
    // Broadcast list update so it shifts to past games
    io.emit('game_list_update');
  } else {
    await pool.query(
      `UPDATE Scheduled_Games
       SET game_status = 'Draw_Ended'
       WHERE game_id = $1`,
      [gameId]
    );
  }

  // Fetch final leaderboard (all claimed/won prizes)
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

  const drawEndedEvent = {
    event: 'draw_ended' as const,
    final_leaderboard: leaderboard,
  };

  await publishGameEvent(gameId, drawEndedEvent);
  activeGames.delete(gameId);

  console.log(`🏁 Game ${gameId} Draw Ended! leaderboard:`, leaderboard);
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

  console.log(`🔄 Resuming ${res.rowCount} interrupted game(s)…`);

  for (const row of res.rows) {
    try {
      await pool.query(
        `UPDATE Scheduled_Games SET game_status = 'Paused' WHERE game_id = $1`,
        [row.game_id]
      );
      await startGame(row.game_id, 'system-boot');
      console.log(`✅ Resumed: ${row.title} (${row.game_id})`);
    } catch (err) {
      console.error(`⚠️  Could not resume game ${row.game_id}:`, err);
    }
  }
}
