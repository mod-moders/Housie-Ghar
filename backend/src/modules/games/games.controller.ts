/**
 * Games Controller
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import pool from '../../db';
import { io } from '../../server';
import { sseManager } from '../../utils/sseManager';
import { CONSTANTS } from '../../config/constants';
import { generateTicketsForGame } from '../../db/generateGameTickets';
import { logAuditEvent } from '../../services/audit.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  startGame,
  pauseGame,
  resumeGame,
  changeGameSpeed,
  completeGame,
  endGameDraw,
} from '../../services/gameEngine';

const VALID_PATTERNS = new Set<string>(CONSTANTS.PRIZE_PATTERNS as readonly string[]);

function isSubset(subset: number[], superset: Set<number>): boolean {
  return subset.every(num => superset.has(num));
}

function getRowNumbers(row: any[]): number[] {
  return row.filter(cell => cell && typeof cell === 'object' && cell.number !== null).map(cell => cell.number);
}

function getFourCorners(gridData: any): number[] {
  const row1 = gridData.row1;
  const row3 = gridData.row3;
  const corners: number[] = [];
  
  const r1Nums = row1.filter((c: any) => c && c.number !== null);
  if (r1Nums.length > 0) {
    corners.push(r1Nums[0].number);
    corners.push(r1Nums[r1Nums.length - 1].number);
  }
  
  const r3Nums = row3.filter((c: any) => c && c.number !== null);
  if (r3Nums.length > 0) {
    corners.push(r3Nums[0].number);
    corners.push(r3Nums[r3Nums.length - 1].number);
  }
  
  return corners;
}

function evaluateTicketPattern(gridData: any, drawnNumbers: number[], patternName: string): boolean {
  const drawnSet = new Set(drawnNumbers);
  const allNums = [
    ...getRowNumbers(gridData.row1),
    ...getRowNumbers(gridData.row2),
    ...getRowNumbers(gridData.row3),
  ];

  if (patternName === 'Early Five') {
    const matching = allNums.filter(n => drawnSet.has(n));
    return matching.length >= 5;
  } else if (patternName === 'Quick 7') {
    const matching = allNums.filter(n => drawnSet.has(n));
    return matching.length >= 7;
  } else if (patternName === 'Corner') {
    const corners = getFourCorners(gridData);
    return corners.length === 4 && isSubset(corners, drawnSet);
  } else if (patternName === 'Star') {
    const corners = getFourCorners(gridData);
    const row2Nums = getRowNumbers(gridData.row2);
    const centerNum = row2Nums[2];
    return corners.length === 4 && isSubset(corners, drawnSet) && drawnSet.has(centerNum);
  } else if (patternName === 'Top Line') {
    const row1 = getRowNumbers(gridData.row1);
    return isSubset(row1, drawnSet);
  } else if (patternName === 'Middle Line') {
    const row2 = getRowNumbers(gridData.row2);
    return isSubset(row2, drawnSet);
  } else if (patternName === 'Bottom Line') {
    const row3 = getRowNumbers(gridData.row3);
    return isSubset(row3, drawnSet);
  } else if (patternName === 'Box Bonus') {
    const row1 = getRowNumbers(gridData.row1).filter(n => drawnSet.has(n));
    const row2 = getRowNumbers(gridData.row2).filter(n => drawnSet.has(n));
    const row3 = getRowNumbers(gridData.row3).filter(n => drawnSet.has(n));
    return row1.length >= 2 && row2.length >= 2 && row3.length >= 2;
  } else if (
    patternName === 'Full House' ||
    patternName === '1st Full House' ||
    patternName === '2nd Full House' ||
    patternName === '3rd Full House'
  ) {
    return isSubset(allNums, drawnSet);
  }
  return false;
}

function formatPrizes(
  prizes: any[],
  gameId: string,
  drawnNumbers: number[],
  soldTickets: any[]
): any[] {
  const ticketMap = new Map<string, any[]>();
  for (const t of soldTickets) {
    const list = ticketMap.get(t.owner_housie_name) || [];
    list.push(t);
    ticketMap.set(t.owner_housie_name, list);
  }

  return prizes.map((row) => {
    let name = row.winner_housie_name;
    if (row.claimed && name && name.includes(',') && !name.includes('(')) {
      const names = name.split(',').map((n: string) => n.trim());
      const uniqueNames = Array.from(new Set(names)) as string[];
      
      const winnerParts = uniqueNames.map((pName) => {
        const pTickets = ticketMap.get(pName) || [];
        const winningNums: number[] = [];
        for (const t of pTickets) {
          if (evaluateTicketPattern(t.grid_data, drawnNumbers, row.pattern_name)) {
            winningNums.push(t.ticket_number);
          }
        }
        if (winningNums.length === 0) {
          return pName;
        } else if (winningNums.length === 1) {
          return `${pName} (${winningNums[0]})`;
        } else {
          return `${pName} (${winningNums.join(' & ')})`;
        }
      });
      name = winnerParts.join(' & ');
    }
    return {
      ...row,
      winner_housie_name: name,
    };
  });
}

/**
 * Get Financial Officer's WhatsApp number from config
 */
async function getFinancialOfficerWhatsApp(): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT config_value FROM Platform_Config WHERE config_key = 'financial_officer_whatsapp'`
    );
    if (result.rows.length > 0 && result.rows[0].config_value) {
      const val = result.rows[0].config_value;
      if (!val.includes('X') && !val.includes('x')) {
        return val;
      }
    }

    // Fallback: Fetch from active Financial Admin or Superadmin user
    const userResult = await pool.query(
      `SELECT u.phone 
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE (r.role_name = 'Financial Admin' OR r.role_name = 'Superadmin') 
         AND u.phone IS NOT NULL AND u.phone != '' AND u.phone NOT LIKE '%X%' AND u.phone NOT LIKE '%x%'
       ORDER BY CASE WHEN r.role_name = 'Financial Admin' THEN 1 ELSE 2 END
       LIMIT 1`
    );
    if (userResult.rows.length > 0 && userResult.rows[0].phone) {
      return userResult.rows[0].phone;
    }
  } catch (error) {
    console.error('Error fetching financial officer WhatsApp:', error);
  }
  return null;
}

/**
 * Get all games
 */
export async function getGames(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT game_id, title, scheduled_at, completed_at, ticket_price, total_tickets, game_status
       FROM Scheduled_Games
       ORDER BY scheduled_at ASC`
    );

    const games = [];
    for (const game of result.rows) {
      // Fetch counts: sold, locked, unique players
      const soldRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Sold'`, [game.game_id]);
      const lockedRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Locked'`, [game.game_id]);
      const playersRes = await pool.query(`SELECT COUNT(DISTINCT owner_housie_name) FROM Tickets WHERE game_id = $1 AND status = 'Sold'`, [game.game_id]);
      const soldCount = parseInt(soldRes.rows[0].count, 10);
      const lockedCount = parseInt(lockedRes.rows[0].count, 10);
      const playerCount = parseInt(playersRes.rows[0].count, 10);
      const totalCount = parseInt(game.total_tickets, 10);
      const availableCount = totalCount - (soldCount + lockedCount);

      // Fetch prize pool
      const prizesRes = await pool.query(
        `SELECT p.prize_id, p.pattern_name, p.prize_amount, p.claimed, p.winner_housie_name, p.claimed_at, p.split_count, p.amount_per_winner,
                t.ticket_number AS winner_ticket_number
         FROM Prize_Pool p
         LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
         WHERE p.game_id = $1
         ORDER BY p.prize_id ASC`,
        [game.game_id]
      );

      const splitWinnerNames = new Set<string>();
      prizesRes.rows.forEach((p) => {
        if (p.claimed && p.winner_housie_name && p.winner_housie_name.includes(',') && !p.winner_housie_name.includes('(')) {
          p.winner_housie_name.split(',').forEach((n: string) => splitWinnerNames.add(n.trim()));
        }
      });

      let ticketsRows = [];
      if (splitWinnerNames.size > 0) {
        const ticketsRes = await pool.query(
          `SELECT ticket_id, ticket_number, owner_housie_name, grid_data FROM Tickets WHERE game_id = $1 AND owner_housie_name = ANY($2) AND status = 'Sold'`,
          [game.game_id, Array.from(splitWinnerNames)]
        );
        ticketsRows = ticketsRes.rows;
      }

      const logRes = await pool.query(`SELECT drawn_numbers FROM game_logs WHERE game_id = $1`, [game.game_id]);
      const drawnNumbers = logRes.rows[0]?.drawn_numbers || [];
      const formattedPrizes = formatPrizes(prizesRes.rows, game.game_id, drawnNumbers, ticketsRows);

      games.push({
        game_id: game.game_id,
        title: game.title,
        scheduled_at: game.scheduled_at,
        completed_at: game.completed_at,
        ticket_price: parseFloat(game.ticket_price),
        total_tickets: totalCount,
        sold_count: soldCount,
        locked_count: lockedCount,
        available_count: availableCount,
        player_count: playerCount,
        fill_percentage: totalCount > 0 ? parseFloat(((soldCount / totalCount) * 100).toFixed(1)) : 0,
        game_status: game.game_status,
        prize_pool: formattedPrizes.map((row) => ({
          prize_id: row.prize_id,
          pattern_name: row.pattern_name,
          prize_amount: parseFloat(row.prize_amount),
          claimed: row.claimed,
          winner_housie_name: row.winner_housie_name,
          winner_ticket_number: row.winner_ticket_number,
          claimed_at: row.claimed_at,
          split_count: row.split_count,
          amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
        })),
      });
    }

    res.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get a single game by id (Player + staff)
 */
export async function getGameById(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT game_id, title, scheduled_at, completed_at, ticket_price, total_tickets, game_status
       FROM Scheduled_Games
       WHERE game_id = $1`,
      [game_id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const game = result.rows[0];
    const soldRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Sold'`, [game_id]);
    const lockedRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Locked'`, [game_id]);
    const playersRes = await pool.query(`SELECT COUNT(DISTINCT owner_housie_name) FROM Tickets WHERE game_id = $1 AND status = 'Sold'`, [game_id]);
    const soldCount = parseInt(soldRes.rows[0].count, 10);
    const lockedCount = parseInt(lockedRes.rows[0].count, 10);
    const playerCount = parseInt(playersRes.rows[0].count, 10);
    const totalCount = parseInt(game.total_tickets, 10);

    const prizesRes = await pool.query(
      `SELECT p.prize_id, p.pattern_name, p.prize_amount, p.claimed, p.winner_housie_name, p.claimed_at, p.split_count, p.amount_per_winner,
              p.player_claimed, p.disbursed,
              t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.game_id = $1
       ORDER BY p.prize_id ASC`,
      [game_id]
    );

    const splitWinnerNames = new Set<string>();
    prizesRes.rows.forEach((p) => {
      if (p.claimed && p.winner_housie_name && p.winner_housie_name.includes(',') && !p.winner_housie_name.includes('(')) {
        p.winner_housie_name.split(',').forEach((n: string) => splitWinnerNames.add(n.trim()));
      }
    });

    let ticketsRows = [];
    if (splitWinnerNames.size > 0) {
      const ticketsRes = await pool.query(
        `SELECT ticket_id, ticket_number, owner_housie_name, grid_data FROM Tickets WHERE game_id = $1 AND owner_housie_name = ANY($2) AND status = 'Sold'`,
        [game_id, Array.from(splitWinnerNames)]
      );
      ticketsRows = ticketsRes.rows;
    }

    const logRes = await pool.query(`SELECT drawn_numbers FROM game_logs WHERE game_id = $1`, [game_id]);
    const drawnNumbers = logRes.rows[0]?.drawn_numbers || [];
    const formattedPrizes = formatPrizes(prizesRes.rows, game_id as string, drawnNumbers, ticketsRows);

    res.json({
      game_id: game.game_id,
      title: game.title,
      scheduled_at: game.scheduled_at,
      completed_at: game.completed_at,
      ticket_price: parseFloat(game.ticket_price),
      total_tickets: totalCount,
      sold_count: soldCount,
      locked_count: lockedCount,
      available_count: totalCount - (soldCount + lockedCount),
      player_count: playerCount,
      fill_percentage: totalCount > 0 ? parseFloat(((soldCount / totalCount) * 100).toFixed(1)) : 0,
      game_status: game.game_status,
      prize_pool: formattedPrizes.map((row) => ({
        prize_id: row.prize_id,
        pattern_name: row.pattern_name,
        prize_amount: parseFloat(row.prize_amount),
        claimed: row.claimed,
        winner_housie_name: row.winner_housie_name,
        winner_ticket_number: row.winner_ticket_number,
        claimed_at: row.claimed_at,
        split_count: row.split_count,
        amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
        player_claimed: row.player_claimed,
        disbursed: row.disbursed,
      })),
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Create a new game, its prize pool, and pre-generate tickets (Admin+)
 * Body: { title, scheduled_at, ticket_price, total_tickets, operator_id?, prizes: [{ pattern_name, prize_amount }] }
 */
export async function createGame(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { title, scheduled_at, ticket_price, total_tickets, operator_id, prizes } = req.body;
  const actor = req.user!;

  // 1. Validation
  if (!title || !scheduled_at || ticket_price == null || total_tickets == null) {
    res.status(400).json({ message: 'title, scheduled_at, ticket_price and total_tickets are required' });
    return;
  }

  const price = parseFloat(ticket_price);
  const tickets = parseInt(total_tickets, 10);

  if (isNaN(price) || price <= 0) {
    res.status(400).json({ message: 'ticket_price must be a positive number' });
    return;
  }
  if (isNaN(tickets) || tickets <= 0) {
    res.status(400).json({ message: 'total_tickets must be a positive integer' });
    return;
  }
  if (!Array.isArray(prizes) || prizes.length === 0) {
    res.status(400).json({ message: 'At least one prize pattern is required' });
    return;
  }

  // 2. Validate prize patterns and enforce the 80% prize-pool cap
  let totalPrize = 0;
  const seenPatterns = new Set<string>();
  for (const p of prizes) {
    if (!p.pattern_name || !VALID_PATTERNS.has(p.pattern_name)) {
      res.status(400).json({ message: `Invalid prize pattern: ${p.pattern_name}` });
      return;
    }
    if (seenPatterns.has(p.pattern_name)) {
      res.status(400).json({ message: `Duplicate prize pattern: ${p.pattern_name}` });
      return;
    }
    seenPatterns.add(p.pattern_name);

    const amount = parseFloat(p.prize_amount);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ message: `Invalid prize_amount for ${p.pattern_name}` });
      return;
    }
    totalPrize += amount;
  }

  const grossRevenue = price * tickets;
  if (totalPrize > grossRevenue) {
    res.status(400).json({
      message: `Total prize pool (â‚¹${totalPrize}) exceeds projected collection (â‚¹${grossRevenue.toFixed(2)})`,
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 3. Insert the game
    const gameRes = await client.query(
      `INSERT INTO Scheduled_Games (title, scheduled_at, total_tickets, ticket_price, game_status, operator_id, created_by)
       VALUES ($1, $2, $3, $4, 'Scheduled', $5, $6)
       RETURNING game_id`,
      [title.trim(), scheduled_at, tickets, price, operator_id || null, actor.userId]
    );
    const gameId = gameRes.rows[0].game_id;

    // 4. Insert prize pool rows
    for (const p of prizes) {
      await client.query(
        `INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed)
         VALUES ($1, $2, $3, FALSE)`,
        [gameId, p.pattern_name, parseFloat(p.prize_amount)]
      );
    }

    await client.query('COMMIT');

    // 5. Pre-generate tickets (own transactions, outside the game insert)
    await generateTicketsForGame(gameId, tickets);

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'CREATE_GAME',
      targetType: 'Scheduled_Game',
      targetId: gameId,
      targetDescription: `Created game "${title}" with ${tickets} tickets`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.emit('game_list_update', { action: 'create', game_id: gameId });

    res.status(201).json({ game_id: gameId, message: 'Game created and tickets generated' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating game:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Start Game (Operator/Admin)
 */
export async function handleStartGame(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;
  const operatorId = req.user.userId;

  try {
    await startGame(game_id, operatorId);
    io.emit('game_list_update', { action: 'start', game_id });
    res.json({ message: 'Game started successfully' });
  } catch (error: any) {
    console.error('Error starting game:', error);
    res.status(400).json({ message: error.message || 'Failed to start game' });
  }
}

/**
 * Pause Game (Operator/Admin)
 */
export async function handlePauseGame(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;
  const operatorId = req.user.userId;

  try {
    await pauseGame(game_id, operatorId);
    io.emit('game_list_update', { action: 'pause', game_id });
    res.json({ message: 'Game paused successfully' });
  } catch (error: any) {
    console.error('Error pausing game:', error);
    res.status(400).json({ message: error.message || 'Failed to pause game' });
  }
}

/**
 * Resume Game (Operator/Admin)
 */
export async function handleResumeGame(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;
  const operatorId = req.user.userId;

  try {
    await resumeGame(game_id, operatorId);
    io.emit('game_list_update', { action: 'resume', game_id });
    res.json({ message: 'Game resumed successfully' });
  } catch (error: any) {
    console.error('Error resuming game:', error);
    res.status(400).json({ message: error.message || 'Failed to resume game' });
  }
}

/**
 * Stop/Complete Game Early (Operator/Admin)
 */
export async function handleStopGame(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;

  try {
    await endGameDraw(game_id);
    io.emit('game_list_update', { action: 'stop', game_id });
    res.json({ message: 'Game completed/stopped successfully' });
  } catch (error: any) {
    console.error('Error stopping game:', error);
    res.status(400).json({ message: error.message || 'Failed to stop game' });
  }
}

/**
 * Change Game Speed (Operator/Admin)
 */
export async function handleSpeedChange(req: any, res: Response): Promise<void> {
  const { game_id } = req.params;
  const { interval_ms } = req.body;
  const operatorId = req.user.userId;

  if (!interval_ms || typeof interval_ms !== 'number') {
    res.status(400).json({ message: 'Invalid interval value' });
    return;
  }

  try {
    await changeGameSpeed(game_id, interval_ms, operatorId);
    io.emit('game_list_update', { action: 'speed', game_id });
    res.json({ message: 'Speed updated successfully' });
  } catch (error: any) {
    console.error('Error changing speed:', error);
    res.status(400).json({ message: error.message || 'Failed to change speed' });
  }
}

/**
 * Get game's drawn numbers (RNG cache / history)
 */
export async function getDrawnNumbers(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT drawn_numbers, current_index FROM Game_Logs WHERE game_id = $1`,
      [game_id]
    );

    if (result.rowCount === 0) {
      res.json({ drawn_numbers: [], current_index: 0 });
      return;
    }

    res.json({
      drawn_numbers: result.rows[0].drawn_numbers || [],
      current_index: result.rows[0].current_index,
    });
  } catch (error) {
    console.error('Error fetching drawn numbers:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Server-Sent Events (SSE) Live Feed (Player View)
 */
export async function liveStream(req: Request, res: Response): Promise<void> {
  const game_id = req.params.game_id as string;

  // 1. Establish SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // 'no-transform' is critical: without it, a gzipping proxy (Next dev proxy,
    // nginx, some CDNs) buffers the whole stream and the browser's EventSource
    // receives headers but never any events.
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // For Nginx compatibility
  });

  // Keep-alive heartbeat interval (every 15s)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // 2. Register response with SSE Manager
  sseManager.register(game_id, res);

  // Send initial payload immediately
  try {
    const gameRes = await pool.query(
      `SELECT game_status, title FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );
    const gameLogRes = await pool.query(
      `SELECT drawn_numbers, current_index FROM Game_Logs WHERE game_id = $1`,
      [game_id]
    );
    const prizesRes = await pool.query(
      `SELECT p.pattern_name, p.winner_housie_name, p.amount_per_winner, p.claimed,
              p.player_claimed, p.disbursed,
              t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.game_id = $1`,
      [game_id]
    );

    const splitWinnerNames = new Set<string>();
    prizesRes.rows.forEach((p) => {
      if (p.claimed && p.winner_housie_name && p.winner_housie_name.includes(',') && !p.winner_housie_name.includes('(')) {
        p.winner_housie_name.split(',').forEach((n: string) => splitWinnerNames.add(n.trim()));
      }
    });

    let ticketsRows = [];
    if (splitWinnerNames.size > 0) {
      const ticketsRes = await pool.query(
        `SELECT ticket_id, ticket_number, owner_housie_name, grid_data FROM Tickets WHERE game_id = $1 AND owner_housie_name = ANY($2) AND status = 'Sold'`,
        [game_id, Array.from(splitWinnerNames)]
      );
      ticketsRows = ticketsRes.rows;
    }

    const formattedPrizes = formatPrizes(prizesRes.rows, game_id, gameLogRes.rows[0]?.drawn_numbers || [], ticketsRows);

    const initialPayload = {
      event: 'initial_state',
      title: gameRes.rows[0]?.title || '',
      game_status: gameRes.rows[0]?.game_status || 'Scheduled',
      drawn_numbers: gameLogRes.rows[0]?.drawn_numbers || [],
      total_drawn: gameLogRes.rows[0]?.current_index || 0,
      claimed_prizes: formattedPrizes.map((row) => ({
        pattern_name: row.pattern_name,
        claimed: row.claimed,
        winner_housie_name: row.winner_housie_name,
        winner_ticket_number: row.winner_ticket_number,
        amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
        player_claimed: row.player_claimed,
        disbursed: row.disbursed,
      })),
    };

    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
  } catch (error) {
    console.error('Error writing initial SSE payload:', error);
  }

  // Cleanup on close
  res.on('close', () => {
    clearInterval(heartbeat);
    sseManager.unregister(game_id, res);
  });
}

/**
 * Delete a game (Admin+)
 */
export async function deleteGame(req: AuthenticatedRequest, res: Response): Promise<void> {
  const game_id = req.params.game_id as string;
  const actor = req.user!;

  try {
    // Check if game exists and is not Live or Paused
    const gameRes = await pool.query(
      `SELECT game_status, title FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );

    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const game = gameRes.rows[0];
    if (game.game_status === 'Live' || game.game_status === 'Paused') {
      res.status(400).json({ message: 'Cannot delete a game that is currently live or paused' });
      return;
    }

    // Delete related records manually because foreign keys have NO ACTION
    await pool.query(`DELETE FROM Bookings WHERE game_id = $1`, [game_id]);
    await pool.query(`DELETE FROM Game_Logs WHERE game_id = $1`, [game_id]);
    await pool.query(`DELETE FROM Skip_Alerts WHERE game_id = $1`, [game_id]);

    // Delete the game (cascades to Tickets and Prize_Pool)
    await pool.query(`DELETE FROM Scheduled_Games WHERE game_id = $1`, [game_id]);

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'DELETE_GAME',
      targetType: 'Scheduled_Game',
      targetId: game_id,
      targetDescription: `Deleted game "${game.title}"`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.emit('game_list_update', { action: 'delete', game_id });
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update a game (Admin+)
 * Body: { title, scheduled_at, ticket_price, total_tickets, prizes: [{ pattern_name, prize_amount }] }
 */
export async function updateGame(req: AuthenticatedRequest, res: Response): Promise<void> {
  const game_id = req.params.game_id as string;
  const { title, scheduled_at, ticket_price, total_tickets, prizes } = req.body;
  const actor = req.user!;

  try {
    // 1. Fetch current game state
    const gameRes = await pool.query(
      `SELECT game_status, title, ticket_price, total_tickets FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );

    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const game = gameRes.rows[0];
    if (game.game_status !== 'Scheduled' && game.game_status !== 'Postponed') {
      res.status(400).json({ message: `Cannot edit a game that is in status: ${game.game_status}` });
      return;
    }

    // 2. Check if tickets are already booked or sold
    const soldRes = await pool.query(
      `SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND (status = 'Sold' OR status = 'Locked')`,
      [game_id]
    );
    const bookingsCount = parseInt(soldRes.rows[0].count, 10);

    // If tickets are already sold, we cannot change ticket price, total tickets, or prize structure
    const priceChanged = ticket_price !== undefined && parseFloat(ticket_price) !== parseFloat(game.ticket_price);
    const totalTicketsChanged = total_tickets !== undefined && parseInt(total_tickets, 10) !== parseInt(game.total_tickets, 10);
    const prizesChanged = prizes !== undefined;

    if (bookingsCount > 0 && (priceChanged || totalTicketsChanged || prizesChanged)) {
      res.status(400).json({
        message: 'Cannot update ticket price, ticket volume, or prizes because tickets are already booked or sold',
      });
      return;
    }

    // 3. Validation for updated fields
    const updatedTitle = title !== undefined ? title.trim() : game.title;
    const updatedScheduledAt = scheduled_at !== undefined ? scheduled_at : game.scheduled_at;
    const updatedPrice = ticket_price !== undefined ? parseFloat(ticket_price) : parseFloat(game.ticket_price);
    const updatedTickets = total_tickets !== undefined ? parseInt(total_tickets, 10) : parseInt(game.total_tickets, 10);

    if (isNaN(updatedPrice) || updatedPrice <= 0) {
      res.status(400).json({ message: 'ticket_price must be a positive number' });
      return;
    }
    if (isNaN(updatedTickets) || updatedTickets <= 0) {
      res.status(400).json({ message: 'total_tickets must be a positive integer' });
      return;
    }

    if (prizesChanged) {
      if (!Array.isArray(prizes) || prizes.length === 0) {
        res.status(400).json({ message: 'At least one prize pattern is required' });
        return;
      }

      let totalPrize = 0;
      const seenPatterns = new Set<string>();
      for (const p of prizes) {
        if (!p.pattern_name || !VALID_PATTERNS.has(p.pattern_name)) {
          res.status(400).json({ message: `Invalid prize pattern: ${p.pattern_name}` });
          return;
        }
        if (seenPatterns.has(p.pattern_name)) {
          res.status(400).json({ message: `Duplicate prize pattern: ${p.pattern_name}` });
          return;
        }
        seenPatterns.add(p.pattern_name);

        const amount = parseFloat(p.prize_amount);
        if (isNaN(amount) || amount <= 0) {
          res.status(400).json({ message: `Invalid prize_amount for ${p.pattern_name}` });
          return;
        }
        totalPrize += amount;
      }

      const grossRevenue = updatedPrice * updatedTickets;
      if (totalPrize > grossRevenue) {
        res.status(400).json({
          message: `Total prize pool (â‚¹${totalPrize}) exceeds projected collection (â‚¹${grossRevenue.toFixed(2)})`,
        });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 4. Update the game details
      await client.query(
        `UPDATE Scheduled_Games
         SET title = $1, scheduled_at = $2, ticket_price = $3, total_tickets = $4
         WHERE game_id = $5`,
        [updatedTitle, updatedScheduledAt, updatedPrice, updatedTickets, game_id]
      );

      // 5. Update prizes if provided
      if (prizesChanged) {
        // Delete existing prizes
        await client.query(`DELETE FROM Prize_Pool WHERE game_id = $1`, [game_id]);
        // Insert new prizes
        for (const p of prizes) {
          await client.query(
            `INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed)
             VALUES ($1, $2, $3, FALSE)`,
            [game_id, p.pattern_name, parseFloat(p.prize_amount)]
          );
        }
      }

      // 6. Regenerate tickets if total_tickets changed
      if (totalTicketsChanged) {
        // Delete old tickets
        await client.query(`DELETE FROM Tickets WHERE game_id = $1`, [game_id]);
      }

      await client.query('COMMIT');

      // If tickets changed, generate new ones outside transaction block
      if (totalTicketsChanged) {
        await generateTicketsForGame(game_id, updatedTickets);
      }

      await logAuditEvent({
        userId: actor.userId,
        userName: actor.fullName,
        userRole: actor.roleName,
        action: 'UPDATE_GAME',
        targetType: 'Scheduled_Game',
        targetId: game_id,
        targetDescription: `Updated game "${updatedTitle}" details`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      io.emit('game_list_update', { action: 'update', game_id });
      res.json({ message: 'Game updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
}
  } catch (error) {
    console.error('Error claiming prize:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Send Emoji Reaction (Player / Staff)
 */
export async function sendEmojiReaction(req: Request, res: Response): Promise<void> {
  const game_id = req.params.game_id as string;
  const { emoji } = req.body;

  if (!emoji) {
    res.status(400).json({ message: 'emoji is required' });
    return;
  }

  let resolvedName = '';

  // 1. Try player session token (check Authorization header first, then cookies)
  let playerToken = null;
  if (req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      playerToken = authHeader.substring(7);
    }
  }
  if (!playerToken) {
    playerToken = req.cookies?.[`hg_player_token_${game_id}`] || req.cookies?.hg_player_token;
  }

  if (playerToken) {
    try {
      const decoded = jwt.verify(playerToken, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
      if (decoded && decoded.housieName) {
        resolvedName = decoded.housieName;
      }
    } catch (err) {
      // Ignored
    }
  }

  // 2. Try staff session token if not resolved as player (check cookies or Authorization header)
  if (!resolvedName) {
    let staffToken = req.cookies?.[CONSTANTS.JWT_COOKIE_NAME];
    if (!staffToken && req.headers['authorization']) {
      const authHeader = req.headers['authorization'] as string;
      if (authHeader.startsWith('Bearer ')) {
        staffToken = authHeader.substring(7);
      }
    }

    if (staffToken) {
      try {
        const decoded = jwt.verify(staffToken, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
        if (decoded && decoded.fullName) {
          resolvedName = decoded.fullName;
        }
      } catch (err) {
        // Ignored
      }
    }
  }

  // Reject if not authenticated
  if (!resolvedName) {
    res.status(401).json({ message: 'Unauthorized: Registered player or staff session required' });
    return;
  }

  // Broadcast to all SSE clients listening to this game
  sseManager.broadcast(game_id, {
    event: 'emoji_reaction',
    emoji,
    player_id: resolvedName,
  });

  res.json({ success: true });
}

/**
 * Fetch detailed booking sales (ticket list & agent summary) for a game (Staff only)
 */
export async function getGameSalesDetails(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  try {
    const gameRes = await pool.query('SELECT game_id, title FROM Scheduled_Games WHERE game_id = $1', [game_id]);
    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const ticketsRes = await pool.query(
      `SELECT t.ticket_number, t.status, t.owner_housie_name,
              u.email as bookie_username, u.full_name as bookie_name,
              r.role_name as bookie_role
       FROM Tickets t
       LEFT JOIN Bookings b ON (b.booking_id = t.locked_by_booking) OR (t.status = 'Sold' AND t.ticket_id = ANY(b.ticket_ids) AND b.game_id = t.game_id AND b.booking_status = 'Sold')
       LEFT JOIN Users u ON u.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
       LEFT JOIN Roles r ON u.role_id = r.role_id
       WHERE t.game_id = $1 AND t.status IN ('Sold', 'Locked')
       ORDER BY t.ticket_number ASC`,
      [game_id]
    );

    const tickets = ticketsRes.rows.map(row => ({
      ticket_number: row.ticket_number,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
      bookie_username: row.bookie_username || 'System/Operator',
      bookie_name: row.bookie_name || 'System/Operator',
      bookie_role: row.bookie_role || 'System'
    }));

    // Aggregate Agent Total Sales count
    const agentMap = new Map<string, { name: string; role: string; total: number }>();
    tickets.forEach((t) => {
      if (t.status === 'Sold') {
        const username = t.bookie_username;
        const name = t.bookie_name;
        const role = t.bookie_role;
        const existing = agentMap.get(username);
        if (existing) {
          existing.total += 1;
        } else {
          agentMap.set(username, { name, role, total: 1 });
        }
      }
    });

    const agents = Array.from(agentMap.entries()).map(([username, data]) => ({
      bookie_username: username,
      bookie_name: data.name,
      bookie_role: data.role,
      total_sold: data.total
    })).sort((a, b) => b.total_sold - a.total_sold);

    res.json({
      game_id,
      title: gameRes.rows[0].title,
      tickets,
      agents
    });
  } catch (error) {
    console.error('Error fetching game sales details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Claim a prize (Player)
 */
export async function claimPrize(req: Request, res: Response): Promise<void> {
  const { game_id, prize_id } = req.params;

  // Get player identity from token (check Authorization header first, then cookies)
  let playerToken = null;
  if (req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      playerToken = authHeader.substring(7);
    }
  }
  if (!playerToken) {
    playerToken = req.cookies?.[`hg_player_token_${game_id}`] || req.cookies?.hg_player_token;
  }

  if (!playerToken) {
    res.status(401).json({ message: 'Player authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(playerToken, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
    const playerHousieName = decoded.housieName;

    if (!playerHousieName) {
      res.status(401).json({ message: 'Invalid player token' });
      return;
    }

    // Verify the game is completed
    const gameRes = await pool.query(
      `SELECT game_status FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );

    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const status = gameRes.rows[0].game_status;
    if (status !== 'Completed' && status !== 'Draw_Ended') {
      res.status(400).json({ message: 'Game is not completed/ended yet' });
      return;
    }

    // Check if this prize belongs to this player and is claimed
    const prizeRes = await pool.query(
      `SELECT p.prize_id, p.pattern_name, p.claimed, p.winner_housie_name, p.amount_per_winner, p.prize_amount, p.split_count,
              p.winner_ticket_id, t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.prize_id = $1 AND p.game_id = $2`,
      [prize_id, game_id]
    );

    if (prizeRes.rowCount === 0) {
      res.status(404).json({ message: 'Prize not found' });
      return;
    }

    const prize = prizeRes.rows[0];

    if (!prize.claimed) {
      res.status(400).json({ message: 'Prize has not been claimed yet' });
      return;
    }

    const isWinner = (prize.winner_housie_name?.toLowerCase() === playerHousieName.toLowerCase()) ||
      (prize.winner_housie_name && prize.winner_housie_name.split(/[,&()]/).map((s: string) => s.trim().toLowerCase()).includes(playerHousieName.toLowerCase()));
    if (!isWinner) {
      res.status(403).json({ message: 'You are not the winner of this prize' });
      return;
    }

    // Fetch game details for WhatsApp message
    const gameDetailRes = await pool.query(
      `SELECT title, scheduled_at FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );
    const game = gameDetailRes.rows[0] || { title: 'Housie Ghar Game', scheduled_at: null };

    // Check if already claimed by player
    if (prize.player_claimed) {
      res.json({
        message: 'Prize already claimed',
        prize: {
          prize_id: prize.prize_id,
          pattern_name: prize.pattern_name,
          amount: prize.amount_per_winner ?? prize.prize_amount,
          winner_ticket_number: prize.winner_ticket_number,
          split_count: prize.split_count,
          player_claimed: true,
          player_claimed_at: prize.player_claimed_at,
        },
      });
      return;
    }

    // Mark as player claimed
    await pool.query(
      `UPDATE Prize_Pool 
       SET player_claimed = TRUE, player_claimed_at = NOW()
       WHERE prize_id = $1`,
      [prize_id]
    );

    // Notify financial admins via sockets
    io.emit('prize_claim_received', { game_id, prize_id, player_housie_name: playerHousieName });
    io.emit('ticket_status_change');

    // Get Financial Officer's WhatsApp
    const foWhatsApp = await getFinancialOfficerWhatsApp();
    
    // Fetch bookie details
    let bookieInfo = '';
    if (prize.winner_ticket_id) {
      const bookieRes = await pool.query(
        `SELECT u.full_name 
         FROM Bookings b
         JOIN Users u ON u.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
         WHERE $1 = ANY(b.ticket_ids) AND b.booking_status = 'Sold'
         LIMIT 1`,
        [prize.winner_ticket_id]
      );
      if (bookieRes.rows.length > 0) {
        bookieInfo = bookieRes.rows[0].full_name;
      }
    }

    // Format game date/time
    const gameDateFormatted = gameDetailRes.rows[0]?.scheduled_at
      ? new Date(gameDetailRes.rows[0].scheduled_at).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '';

    // Generate WhatsApp message
    const amount = parseFloat(prize.amount_per_winner ?? prize.prize_amount);
    let ticketDisplay = prize.winner_ticket_number ? `#${prize.winner_ticket_number}` : '';
    if (prize.winner_housie_name) {
      const match = prize.winner_housie_name.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        ticketDisplay = `#${match[1]}`;
      }
    }

    const whatsappMessage = `Hi, I am *${playerHousieName}* and I am claiming my prize on Housie Ghar!

*Claim Details:*
- *Game:* ${gameDetailRes.rows[0]?.title || 'Housie Ghar Game'} (${gameDateFormatted})
- *Prize:* ${prize.pattern_name}
- *Ticket:* ${ticketDisplay}
${bookieInfo ? `- *Bookie:* ${bookieInfo}\n` : ''}- *Prize Amount:* ₹${amount.toFixed(2)}

Here is my UPI ID/QR Code for disbursement:`;

    const whatsappUrl = foWhatsApp 
      ? `https://wa.me/${foWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

    res.json({
      message: 'Prize claim confirmed',
      prize: {
        prize_id: prize.prize_id,
        pattern_name: prize.pattern_name,
        amount: amount,
        winner_ticket_number: prize.winner_ticket_number,
        split_count: prize.split_count,
        player_claimed: true,
        player_claimed_at: new Date().toISOString(),
      },
      whatsapp_url: whatsappUrl,
      whatsapp_message: whatsappMessage,
    });
  } catch (error) {
    console.error('Error claiming prize:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Claim ALL prizes won by the player for a game at once
 */
export async function claimAllPrizes(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;

  let playerToken = null;
  if (req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      playerToken = authHeader.substring(7);
    }
  }
  if (!playerToken) {
    playerToken = req.cookies?.[`hg_player_token_${game_id}`] || req.cookies?.hg_player_token;
  }

  if (!playerToken) {
    res.status(401).json({ message: 'Player authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(playerToken, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
    const playerHousieName = decoded.housieName;

    if (!playerHousieName) {
      res.status(401).json({ message: 'Invalid player token' });
      return;
    }

    const gameRes = await pool.query(
      `SELECT game_status, title, scheduled_at FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );

    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const game = gameRes.rows[0];

    // Fetch all claimed prizes for this game where the player is a winner and player_claimed is FALSE
    const prizesRes = await pool.query(
      `SELECT p.prize_id, p.pattern_name, p.claimed, p.winner_housie_name, p.amount_per_winner, p.prize_amount, p.split_count,
              p.winner_ticket_id, t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.game_id = $1 AND p.claimed = TRUE AND p.player_claimed = FALSE`,
      [game_id]
    );

    const myWonPrizes = prizesRes.rows.filter(p => {
      if (!p.winner_housie_name) return false;
      const lowerWinner = p.winner_housie_name.toLowerCase();
      const lowerPlayer = playerHousieName.toLowerCase();
      return lowerWinner === lowerPlayer || lowerWinner.split(/[,&()]/).map((s: string) => s.trim().toLowerCase()).includes(lowerPlayer);
    });

    if (myWonPrizes.length === 0) {
      res.status(400).json({ message: 'No unclaimed prizes found for you in this game' });
      return;
    }

    const prizeIds = myWonPrizes.map(p => p.prize_id);

    // Update all to player_claimed = true
    await pool.query(
      `UPDATE Prize_Pool
       SET player_claimed = TRUE, player_claimed_at = NOW()
       WHERE prize_id = ANY($1::integer[])`,
      [prizeIds]
    );

    // Notify financial admins via sockets
    for (const p of myWonPrizes) {
      io.emit('prize_claim_received', { game_id, prize_id: p.prize_id, player_housie_name: playerHousieName });
    }
    io.emit('ticket_status_change');

    const foWhatsApp = await getFinancialOfficerWhatsApp();

    const totalAmount = myWonPrizes.reduce((sum, p) => sum + parseFloat(p.amount_per_winner ?? p.prize_amount), 0);

    const gameDateFormatted = game.scheduled_at
      ? new Date(game.scheduled_at).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '';

    const prizeLines = myWonPrizes.map((p, idx) => {
      const amt = parseFloat(p.amount_per_winner ?? p.prize_amount);
      const tk = p.winner_ticket_number ? ` (Tk #${p.winner_ticket_number})` : '';
      return `${idx + 1}. *${p.pattern_name}* — ₹${amt.toFixed(2)}${tk}`;
    }).join('\n');

    const whatsappMessage = `Hi, I am *${playerHousieName}* and I am claiming my prize rewards on Housie Ghar!

*Consolidated Claim Details:*
- *Game:* ${game.title || 'Housie Ghar Game'} (${gameDateFormatted})
- *Prizes Won (${myWonPrizes.length}):*
${prizeLines}

- *Total Prize Claim:* ₹${totalAmount.toFixed(2)}

Here is my UPI ID / QR Code for disbursement:`;

    const whatsappUrl = foWhatsApp 
      ? `https://wa.me/${foWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

    res.json({
      message: 'All prizes claimed successfully',
      claimed_count: myWonPrizes.length,
      total_amount: totalAmount,
      whatsapp_url: whatsappUrl,
      whatsapp_message: whatsappMessage,
    });
  } catch (error) {
    console.error('Error claiming all prizes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get all pending prize claims for Financial Admin dashboard
 */
export async function getPrizeClaims(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Only allow Financial Admin and Superadmin
    if (req.user!.roleName !== 'Financial Admin' && req.user!.roleName !== 'Superadmin') {
      res.status(403).json({ message: 'Forbidden: Financial Admin access required' });
      return;
    }

    const result = await pool.query(
      `(
        SELECT 
          p.prize_id,
          p.game_id,
          p.pattern_name,
          p.amount_per_winner,
          p.prize_amount,
          p.player_claimed,
          p.player_claimed_at,
          p.disbursed,
          p.disbursed_at,
          p.winner_housie_name,
          p.winner_ticket_id,
          t.ticket_number AS winner_ticket_number,
          sg.title AS game_title,
          sg.scheduled_at AS game_date,
          bu.full_name AS bookie_name,
          bu.phone AS bookie_phone,
          1 AS sort_order
         FROM Prize_Pool p
         LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
         LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
         LEFT JOIN Bookings b ON (b.booking_status = 'Sold' AND t.ticket_id = ANY(b.ticket_ids) AND b.game_id = p.game_id)
         LEFT JOIN Users bu ON bu.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
         WHERE p.player_claimed = TRUE AND (p.disbursed = FALSE OR p.disbursed IS NULL)
      )
      UNION ALL
      (
        SELECT 
          p.prize_id,
          p.game_id,
          p.pattern_name,
          p.amount_per_winner,
          p.prize_amount,
          p.player_claimed,
          p.player_claimed_at,
          p.disbursed,
          p.disbursed_at,
          p.winner_housie_name,
          p.winner_ticket_id,
          t.ticket_number AS winner_ticket_number,
          sg.title AS game_title,
          sg.scheduled_at AS game_date,
          bu.full_name AS bookie_name,
          bu.phone AS bookie_phone,
          2 AS sort_order
         FROM Prize_Pool p
         LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
         LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
         LEFT JOIN Bookings b ON (b.booking_status = 'Sold' AND t.ticket_id = ANY(b.ticket_ids) AND b.game_id = p.game_id)
         LEFT JOIN Users bu ON bu.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
         WHERE p.player_claimed = TRUE AND p.disbursed = TRUE
         ORDER BY p.disbursed_at DESC
         LIMIT 10
      )
      ORDER BY sort_order ASC, COALESCE(player_claimed_at, disbursed_at) DESC`
    );

    const claims = result.rows.map((row) => ({
      game_id: row.game_id,
      prize_id: row.prize_id,
      game_title: row.game_title,
      game_date: row.game_date,
      pattern_name: row.pattern_name,
      amount: parseFloat(row.amount_per_winner ?? row.prize_amount),
      winner_housie_name: row.winner_housie_name,
      winner_ticket_number: row.winner_ticket_number,
      player_claimed_at: row.player_claimed_at,
      disbursed: row.disbursed,
      disbursed_at: row.disbursed_at,
      bookie_name: row.bookie_name || 'System/Operator',
      bookie_phone: row.bookie_phone || '',
    }));

    res.json(claims);
  } catch (error) {
    console.error('Error fetching prize claims:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get prize claims dashboard statistics and past 10 history records
 */
export async function getPrizeClaimsDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user!.roleName !== 'Financial Admin' && req.user!.roleName !== 'Superadmin') {
      res.status(403).json({ message: 'Forbidden: Financial Admin access required' });
      return;
    }

    const overallClaimsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE`
    );
    const overallDisbursalsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE AND p.disbursed = TRUE`
    );
    const dailyClaimsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE AND p.player_claimed_at >= date_trunc('day', NOW())`
    );
    const dailyDisbursalsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE AND p.disbursed = TRUE AND p.disbursed_at >= date_trunc('day', NOW())`
    );
    const weeklyClaimsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE AND p.player_claimed_at >= NOW() - INTERVAL '7 days'`
    );
    const weeklyDisbursalsRes = await pool.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(p.amount_per_winner), 0)::float AS amount 
       FROM Prize_Pool p
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.player_claimed = TRUE AND p.disbursed = TRUE AND p.disbursed_at >= NOW() - INTERVAL '7 days'`
    );

    const historyRes = await pool.query(
      `SELECT 
        p.prize_id,
        p.game_id,
        p.pattern_name,
        p.amount_per_winner,
        p.prize_amount,
        p.player_claimed,
        p.player_claimed_at,
        p.disbursed,
        p.disbursed_at,
        p.winner_housie_name,
        p.winner_ticket_id,
        t.ticket_number AS winner_ticket_number,
        sg.title AS game_title,
        sg.scheduled_at AS game_date,
        bu.full_name AS bookie_name
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       LEFT JOIN Bookings b ON (b.booking_status = 'Sold' AND t.ticket_id = ANY(b.ticket_ids) AND b.game_id = p.game_id)
       LEFT JOIN Users bu ON bu.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
       WHERE p.player_claimed = TRUE
       ORDER BY COALESCE(p.player_claimed_at, p.disbursed_at) DESC
       LIMIT 10`
    );

    const history = historyRes.rows.map((row) => ({
      game_id: row.game_id,
      prize_id: row.prize_id,
      game_title: row.game_title,
      game_date: row.game_date,
      pattern_name: row.pattern_name,
      amount: parseFloat(row.amount_per_winner ?? row.prize_amount),
      winner_housie_name: row.winner_housie_name,
      winner_ticket_number: row.winner_ticket_number,
      player_claimed_at: row.player_claimed_at,
      disbursed: row.disbursed,
      disbursed_at: row.disbursed_at,
      bookie_name: row.bookie_name || 'System/Operator',
    }));

    res.json({
      stats: {
        overall_claims_count: overallClaimsRes.rows[0].count,
        overall_claims_amount: overallClaimsRes.rows[0].amount,
        overall_disbursals_count: overallDisbursalsRes.rows[0].count,
        overall_disbursals_amount: overallDisbursalsRes.rows[0].amount,
        daily_claims_count: dailyClaimsRes.rows[0].count,
        daily_claims_amount: dailyClaimsRes.rows[0].amount,
        daily_disbursals_count: dailyDisbursalsRes.rows[0].count,
        daily_disbursals_amount: dailyDisbursalsRes.rows[0].amount,
        weekly_claims_count: weeklyClaimsRes.rows[0].count,
        weekly_claims_amount: weeklyClaimsRes.rows[0].amount,
        weekly_disbursals_count: weeklyDisbursalsRes.rows[0].count,
        weekly_disbursals_amount: weeklyDisbursalsRes.rows[0].amount,
      },
      history
    });
  } catch (error) {
    console.error('Error fetching prize claims dashboard stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Disburse a prize (Financial Admin)
 */
export async function disbursePrize(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { game_id, prize_id } = req.params;
  const admin = req.user!;

  try {
    // Verify the game exists
    const gameRes = await pool.query(
      `SELECT game_status FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );

    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    // Get prize details
    const prizeRes = await pool.query(
      `SELECT p.prize_id, p.pattern_name, p.amount_per_winner, p.prize_amount, p.player_claimed, p.claimed, p.disbursed, p.winner_housie_name, p.winner_ticket_id,
              t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.prize_id = $1 AND p.game_id = $2`,
      [prize_id, game_id]
    );

    if (prizeRes.rowCount === 0) {
      res.status(404).json({ message: 'Prize not found' });
      return;
    }

    const prize = prizeRes.rows[0];

    // Allow manual disbursement if either manually claimed by player OR won during game
    if (!prize.player_claimed && !prize.claimed) {
      res.status(400).json({ message: 'Prize has neither been won during the game nor claimed by the player' });
      return;
    }

    if (prize.disbursed) {
      res.json({
        message: 'Prize already disbursed',
        prize: {
          prize_id: prize.prize_id,
          pattern_name: prize.pattern_name,
          amount: prize.amount_per_winner ?? prize.prize_amount,
          winner_ticket_number: prize.winner_ticket_number,
          disbursed: true,
          disbursed_at: prize.disbursed_at,
        },
      });
      return;
    }

    // Mark as disbursed (and auto-set player_claimed to true so reporting aligns)
    await pool.query(
      `UPDATE Prize_Pool 
       SET disbursed = TRUE, 
           disbursed_at = NOW(), 
           disbursed_by = $1,
           player_claimed = TRUE,
           player_claimed_at = COALESCE(player_claimed_at, NOW())
       WHERE prize_id = $2`,
      [admin.userId, prize_id]
    );

    io.emit('prize_disbursed', { game_id, prize_id });
    io.emit('ticket_status_change');

    // Check if all won prizes for this game are now disbursed
    const allPrizesRes = await pool.query(
      `SELECT COUNT(*)::integer as total_won, COUNT(*) FILTER (WHERE disbursed = TRUE)::integer as disbursed_count
       FROM Prize_Pool 
       WHERE game_id = $1 AND claimed = TRUE`,
      [game_id]
    );

    const { total_won, disbursed_count } = allPrizesRes.rows[0];

    // If all won prizes (claims) are disbursed, mark game as Completed
    if (parseInt(total_won) === parseInt(disbursed_count)) {
      await pool.query(
        `UPDATE Scheduled_Games 
         SET game_status = 'Completed', completed_at = NOW()
         WHERE game_id = $1 AND game_status != 'Completed'`,
        [game_id]
      );
      io.emit('game_list_update');
    }

    res.json({
      message: 'Prize disbursed successfully',
      prize: {
        prize_id: prize.prize_id,
        pattern_name: prize.pattern_name,
        amount: prize.amount_per_winner ?? prize.prize_amount,
        winner_ticket_number: prize.winner_ticket_number,
        disbursed: true,
        disbursed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error disbursing prize:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
