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
        prize_pool: prizesRes.rows.map((row) => ({
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
              t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.game_id = $1
       ORDER BY p.prize_id ASC`,
      [game_id]
    );

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
      prize_pool: prizesRes.rows.map((row) => ({
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
      message: `Total prize pool (₹${totalPrize}) exceeds projected collection (₹${grossRevenue.toFixed(2)})`,
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
    res.json({ message: 'Game resumed successfully' });
  } catch (error: any) {
    console.error('Error resuming game:', error);
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
    'Cache-Control': 'no-cache',
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
              t.ticket_number AS winner_ticket_number
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       WHERE p.game_id = $1`,
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
        winner_ticket_number: row.winner_ticket_number,
        amount_per_winner: row.amount_per_winner ? parseFloat(row.amount_per_winner) : null,
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
          message: `Total prize pool (₹${totalPrize}) exceeds projected collection (₹${grossRevenue.toFixed(2)})`,
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

      res.json({ message: 'Game updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error updating game:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

/**
 * Fetch detailed booking sales (ticket list & agent summary) for a game (Staff only)
 */
export async function getGameSalesDetails(req: Request, res: Response): Promise<void> {
  const { game_id } = req.params;

  try {
    const gameRes = await pool.query('SELECT game_id, title FROM Scheduled_Games WHERE game_id = $1', [game_id]);
    if (gameRes.rowCount === 0) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const ticketsRes = await pool.query(
      `SELECT t.ticket_number, t.status, t.owner_housie_name,
              u.email as bookie_username, u.full_name as bookie_name
       FROM Tickets t
       LEFT JOIN Bookings b ON (b.booking_id = t.locked_by_booking) OR (t.status = 'Sold' AND t.ticket_id = ANY(b.ticket_ids) AND b.game_id = t.game_id AND b.booking_status = 'Sold')
       LEFT JOIN Users u ON u.user_id = COALESCE(b.confirmed_by, b.assigned_agent_id)
       WHERE t.game_id = $1 AND t.status IN ('Sold', 'Locked')
       ORDER BY t.ticket_number ASC`,
      [game_id]
    );

    const tickets = ticketsRes.rows.map(row => ({
      ticket_number: row.ticket_number,
      status: row.status,
      owner_housie_name: row.owner_housie_name,
      bookie_username: row.bookie_username || 'System/Operator',
      bookie_name: row.bookie_name || 'System/Operator'
    }));

    // Aggregate Agent Total Sales count
    const agentMap = new Map<string, { name: string; total: number }>();
    tickets.forEach((t) => {
      if (t.status === 'Sold') {
        const username = t.bookie_username;
        const name = t.bookie_name;
        const existing = agentMap.get(username);
        if (existing) {
          existing.total += 1;
        } else {
          agentMap.set(username, { name, total: 1 });
        }
      }
    });

    const agents = Array.from(agentMap.entries()).map(([username, data]) => ({
      bookie_username: username,
      bookie_name: data.name,
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
