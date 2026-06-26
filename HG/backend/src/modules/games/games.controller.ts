/**
 * Games Controller
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { sseManager } from '../../utils/sseManager';
import { CONSTANTS } from '../../config/constants';
import { generateTicketsForGame } from '../../db/generateGameTickets';
import { logAuditEvent } from '../../services/audit.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import {
  startGame,
  pauseGame,
  resumeGame,
  changeGameSpeed,
} from '../../services/gameEngine';

const VALID_PATTERNS = new Set<string>(CONSTANTS.PRIZE_PATTERNS as readonly string[]);

/**
 * Get all games
 */
export async function getGames(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT game_id, title, scheduled_at, ticket_price, total_tickets, game_status
       FROM Scheduled_Games
       ORDER BY scheduled_at ASC`
    );

    const games = [];
    for (const game of result.rows) {
      // Fetch counts: sold, locked
      const soldRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Sold'`, [game.game_id]);
      const lockedRes = await pool.query(`SELECT COUNT(*) FROM Tickets WHERE game_id = $1 AND status = 'Locked'`, [game.game_id]);
      const soldCount = parseInt(soldRes.rows[0].count, 10);
      const lockedCount = parseInt(lockedRes.rows[0].count, 10);
      const totalCount = parseInt(game.total_tickets, 10);
      const availableCount = totalCount - (soldCount + lockedCount);

      // Fetch prize pool
      const prizesRes = await pool.query(
        `SELECT prize_id, pattern_name, prize_amount, claimed, winner_housie_name, claimed_at, split_count, amount_per_winner
         FROM Prize_Pool
         WHERE game_id = $1
         ORDER BY prize_id ASC`,
        [game.game_id]
      );

      games.push({
        game_id: game.game_id,
        title: game.title,
        scheduled_at: game.scheduled_at,
        ticket_price: parseFloat(game.ticket_price),
        total_tickets: totalCount,
        sold_count: soldCount,
        locked_count: lockedCount,
        available_count: availableCount,
        fill_percentage: totalCount > 0 ? parseFloat(((soldCount / totalCount) * 100).toFixed(1)) : 0,
        game_status: game.game_status,
        prize_pool: prizesRes.rows.map((row) => ({
          prize_id: row.prize_id,
          pattern_name: row.pattern_name,
          prize_amount: parseFloat(row.prize_amount),
          claimed: row.claimed,
          winner_housie_name: row.winner_housie_name,
          claimed_at: row.claimed_at,
          split_count: row.split_count,
          amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
        })),
      });
    }

    res.json(games);
  } catch (error) {
    logger.error({ err: error }, 'error fetching games');
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
      `SELECT game_id, title, scheduled_at, ticket_price, total_tickets, game_status
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
    const soldCount = parseInt(soldRes.rows[0].count, 10);
    const lockedCount = parseInt(lockedRes.rows[0].count, 10);
    const totalCount = parseInt(game.total_tickets, 10);

    const prizesRes = await pool.query(
      `SELECT prize_id, pattern_name, prize_amount, claimed, winner_housie_name, claimed_at, split_count, amount_per_winner
       FROM Prize_Pool
       WHERE game_id = $1
       ORDER BY prize_id ASC`,
      [game_id]
    );

    res.json({
      game_id: game.game_id,
      title: game.title,
      scheduled_at: game.scheduled_at,
      ticket_price: parseFloat(game.ticket_price),
      total_tickets: totalCount,
      sold_count: soldCount,
      locked_count: lockedCount,
      available_count: totalCount - (soldCount + lockedCount),
      fill_percentage: totalCount > 0 ? parseFloat(((soldCount / totalCount) * 100).toFixed(1)) : 0,
      game_status: game.game_status,
      prize_pool: prizesRes.rows.map((row) => ({
        prize_id: row.prize_id,
        pattern_name: row.pattern_name,
        prize_amount: parseFloat(row.prize_amount),
        claimed: row.claimed,
        winner_housie_name: row.winner_housie_name,
        claimed_at: row.claimed_at,
        split_count: row.split_count,
        amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'error fetching game');
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
  const cap = grossRevenue * CONSTANTS.MAX_PRIZE_POOL_PERCENTAGE;
  if (totalPrize > cap) {
    res.status(400).json({
      message: `Total prize (₹${totalPrize}) exceeds ${CONSTANTS.MAX_PRIZE_POOL_PERCENTAGE * 100}% of gross revenue (cap ₹${cap.toFixed(2)})`,
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

    res.status(201).json({ game_id: gameId, message: 'Game created and tickets generated' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'error creating game');
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
    res.json({ message: 'Game started successfully' });
  } catch (error: any) {
    logger.error({ err: error }, 'error starting game');
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
    res.json({ message: 'Game paused successfully' });
  } catch (error: any) {
    logger.error({ err: error }, 'error pausing game');
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
    res.json({ message: 'Game resumed successfully' });
  } catch (error: any) {
    logger.error({ err: error }, 'error resuming game');
    res.status(400).json({ message: error.message || 'Failed to resume game' });
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
    res.json({ message: 'Speed updated successfully' });
  } catch (error: any) {
    logger.error({ err: error }, 'error changing speed');
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
    logger.error({ err: error }, 'error fetching drawn numbers');
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
    // no-transform stops intermediaries from gzipping the stream. Critical:
    // the Next dev proxy and nginx both gzip by default, and gzip buffers —
    // the browser's EventSource gets headers but never the trickled events.
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // For Nginx compatibility
  });
  res.flushHeaders?.();

  // Padding preamble: ~2KB of SSE comment. Buffering proxies (Cloudflare
  // tunnels, some CDNs) withhold a streamed body until they've seen enough
  // bytes; this pushes past that threshold so events flush immediately.
  res.write(`:${' '.repeat(2048)}\n\n`);

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
      `SELECT pattern_name, winner_housie_name, amount_per_winner, claimed
       FROM Prize_Pool
       WHERE game_id = $1`,
      [game_id]
    );

    const initialPayload = {
      event: 'initial_state',
      title: gameRes.rows[0]?.title || '',
      game_status: gameRes.rows[0]?.game_status || 'Scheduled',
      drawn_numbers: gameLogRes.rows[0]?.drawn_numbers || [],
      total_drawn: gameLogRes.rows[0]?.current_index || 0,
      claimed_prizes: prizesRes.rows.map((row) => ({
        pattern_name: row.pattern_name,
        claimed: row.claimed,
        winner_housie_name: row.winner_housie_name,
        amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
      })),
    };

    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
  } catch (error) {
    logger.error({ err: error }, 'error writing initial SSE payload');
  }

  // Cleanup on close
  res.on('close', () => {
    clearInterval(heartbeat);
    sseManager.unregister(game_id, res);
  });
}
