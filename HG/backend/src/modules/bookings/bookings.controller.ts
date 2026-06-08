/**
 * Bookings Controller
 */

import { Request, Response } from 'express';
import pool from '../../db';
import { io } from '../../server';
import { AuthenticatedRequest } from '../../middleware/auth';
import { selectAgentForBooking } from '../../services/bookingRouter';
import { buildWaLink } from '../../utils/waLink';

/**
 * Lock tickets and initiate the WhatsApp P2P workflow
 */
export async function lockTickets(req: Request, res: Response): Promise<void> {
  const { game_id, ticket_ids, housie_name } = req.body;

  // 1. Basic validation
  if (!game_id || !ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0 || !housie_name) {
    res.status(400).json({ message: 'Missing or invalid parameters' });
    return;
  }

  if (housie_name.length < 3 || housie_name.length > 20) {
    res.status(400).json({ message: 'Housie Name must be between 3 and 20 characters' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Concurrency control: Lock the rows for update
    const lockTicketsRes = await client.query(
      `SELECT ticket_id, ticket_number, status, locked_until
       FROM Tickets
       WHERE ticket_id = ANY($1) AND game_id = $2
       FOR UPDATE`,
      [ticket_ids, game_id]
    );

    if (lockTicketsRes.rows.length !== ticket_ids.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some selected tickets do not exist in this game' });
      return;
    }

    // Check availability
    const unavailableTickets = lockTicketsRes.rows.filter((t) => t.status !== 'Available');
    if (unavailableTickets.length > 0) {
      await client.query('ROLLBACK');
      const ticketNums = unavailableTickets.map((t) => `#${t.ticket_number}`).join(', ');
      res.status(409).json({ message: `Tickets ${ticketNums} are already locked or sold` });
      return;
    }

    // 3. Fetch ticket price to calculate total amount
    const gameRes = await client.query(
      `SELECT ticket_price, title FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );
    const game = gameRes.rows[0];
    const ticketPrice = parseFloat(game.ticket_price);
    const totalAmount = ticketPrice * ticket_ids.length;

    // 4. Liquidity-Aware Round-Robin: only route to a bookie who can fund the order.
    // Role 4 represents Agent (Bookie).
    const agentsRes = await client.query(
      `SELECT user_id, full_name, phone, current_balance
       FROM Users
       WHERE role_id = 4 AND status = 'Active'
       ORDER BY user_id`
    );
    const agents = agentsRes.rows.map((a) => ({
      user_id: a.user_id as string,
      full_name: a.full_name as string,
      phone: (a.phone as string) ?? '',
      current_balance: parseFloat(a.current_balance),
    }));

    // Round-robin cursor: continue after the last *bookie-assigned* booking.
    const lastBookingRes = await client.query(
      `SELECT assigned_agent_id FROM Bookings
       WHERE is_overflow = FALSE
       ORDER BY locked_at DESC LIMIT 1`
    );
    const lastAgentId: string | null = lastBookingRes.rows[0]?.assigned_agent_id ?? null;

    const { assigned, skipped } = selectAgentForBooking(agents, lastAgentId, totalAmount);

    // Log every skipped bookie for the FOMO alert + Financial Officer view.
    for (const s of skipped) {
      await client.query(
        `INSERT INTO Skip_Alerts (agent_id, game_id, booking_amount, agent_balance)
         VALUES ($1, $2, $3, $4)`,
        [s.user_id, game_id, totalAmount, s.current_balance]
      );
    }

    const lockDurationMinutes = 10;
    const lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
    const ticketNumbers = lockTicketsRes.rows.map((t) => t.ticket_number);
    const ticketNumbersList = ticketNumbers.join(', ');

    // Notify skipped bookies (after commit). Captured here, emitted post-COMMIT.
    const emitSkips = () => {
      for (const s of skipped) {
        io.to(`agent-${s.user_id}`).emit('booking_skipped', {
          event: 'booking_skipped',
          game_id,
          booking_amount: totalAmount,
          agent_balance: s.current_balance,
        });
      }
    };

    const makeBookingWaLink = (phone: string, fullName: string, bookingId: string): string => {
      const msg = `Hi ${fullName}, I am ${housie_name}. I want to book Ticket(s): [${ticketNumbersList}] for "${game.title}". Booking ID: #${bookingId.substring(0, 8).toUpperCase()}. Amount: ₹${totalAmount}.`;
      return buildWaLink(phone, msg);
    };

    // 5. Overflow Failsafe: no bookie had sufficient inventory → route to the Operator.
    if (!assigned) {
      const opRes = await client.query(
        `SELECT u.user_id, u.full_name, u.phone, u.status
         FROM Scheduled_Games g
         JOIN Users u ON u.user_id = g.operator_id
         WHERE g.game_id = $1`,
        [game_id]
      );
      const operator = opRes.rows[0];
      if (!operator || operator.status !== 'Active' || !operator.phone) {
        await client.query('ROLLBACK');
        res.status(503).json({
          message:
            'All booking agents are low on balance and no operator is available to fulfil this order. Please try again shortly.',
        });
        return;
      }

      const overflowRes = await client.query(
        `INSERT INTO Bookings (
           game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
           booking_status, locked_at, locked_until, is_overflow
         ) VALUES ($1, $2, $3, $4, $5, 'Locked', NOW(), $6, TRUE)
         RETURNING booking_id`,
        [game_id, ticket_ids, housie_name, operator.user_id, totalAmount, lockedUntil]
      );
      const overflowBookingId = overflowRes.rows[0].booking_id;

      await client.query(
        `UPDATE Tickets SET status = 'Locked', locked_by_booking = $1, locked_until = $2
         WHERE ticket_id = ANY($3)`,
        [overflowBookingId, lockedUntil, ticket_ids]
      );

      await client.query('COMMIT');
      emitSkips();

      io.to(`operator-${operator.user_id}`).emit('overflow_booking', {
        event: 'overflow_booking',
        booking_id: overflowBookingId,
        housie_name,
        game_title: game.title,
        ticket_numbers: ticketNumbers,
        total_amount: totalAmount,
        locked_until: lockedUntil.toISOString(),
      });

      res.json({
        booking_id: overflowBookingId,
        locked_until: lockedUntil.toISOString(),
        agent_name: operator.full_name,
        agent_phone: operator.phone,
        total_amount: totalAmount,
        whatsapp_link: makeBookingWaLink(operator.phone, operator.full_name, overflowBookingId),
        is_overflow: true,
      });
      return;
    }

    // 6. Normal path: assign to the selected bookie.
    const bookingRes = await client.query(
      `INSERT INTO Bookings (
        game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
        booking_status, locked_at, locked_until
      ) VALUES ($1, $2, $3, $4, $5, 'Locked', NOW(), $6)
      RETURNING booking_id`,
      [game_id, ticket_ids, housie_name, assigned.user_id, totalAmount, lockedUntil]
    );
    const bookingId = bookingRes.rows[0].booking_id;

    await client.query(
      `UPDATE Tickets
       SET status = 'Locked', locked_by_booking = $1, locked_until = $2
       WHERE ticket_id = ANY($3)`,
      [bookingId, lockedUntil, ticket_ids]
    );

    await client.query('COMMIT');
    emitSkips();

    io.to(`agent-${assigned.user_id}`).emit('new_booking_request', {
      booking_id: bookingId,
      housie_name,
      game_title: game.title,
      ticket_numbers: ticketNumbers,
      total_amount: totalAmount,
      locked_at: new Date().toISOString(),
      locked_until: lockedUntil.toISOString(),
    });

    res.json({
      booking_id: bookingId,
      locked_until: lockedUntil.toISOString(),
      agent_phone: assigned.phone,
      agent_name: assigned.full_name,
      total_amount: totalAmount,
      whatsapp_link: makeBookingWaLink(assigned.phone, assigned.full_name, bookingId),
      is_overflow: false,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Booking lock error:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Poll Booking Status (Player UI)
 */
export async function getBookingStatus(req: Request, res: Response): Promise<void> {
  const { booking_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT booking_id, booking_status, confirmed_at
       FROM Bookings
       WHERE booking_id = $1`,
      [booking_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }

    res.json({
      booking_id: result.rows[0].booking_id,
      booking_status: result.rows[0].booking_status,
      confirmed_at: result.rows[0].confirmed_at,
    });
  } catch (error) {
    console.error('Error fetching booking status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get active booking requests for Agent
 */
export async function getAgentQueue(req: any, res: Response): Promise<void> {
  const agentId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT b.booking_id, b.housie_name, b.total_amount, b.locked_at, b.locked_until,
              g.title as game_title, g.scheduled_at as game_time, b.ticket_ids
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       WHERE b.assigned_agent_id = $1 AND b.booking_status = 'Locked' AND b.locked_until > NOW()
       ORDER BY b.locked_at ASC`,
      [agentId]
    );

    // Fetch ticket numbers for each booking
    const bookings = [];
    for (const row of result.rows) {
      const ticketsRes = await pool.query(
        `SELECT ticket_number FROM Tickets WHERE ticket_id = ANY($1)`,
        [row.ticket_ids]
      );
      bookings.push({
        booking_id: row.booking_id,
        housie_name: row.housie_name,
        game_title: row.game_title,
        game_time: row.game_time,
        ticket_numbers: ticketsRes.rows.map((t) => t.ticket_number),
        total_amount: parseFloat(row.total_amount),
        locked_at: row.locked_at,
        locked_until: row.locked_until,
        time_remaining_ms: new Date(row.locked_until).getTime() - Date.now(),
      });
    }

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching agent queue:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Confirm Payment & Approve Booking (Agent Command)
 */
export async function confirmBooking(req: any, res: Response): Promise<void> {
  const { booking_id } = req.params;
  const agentId = req.user.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch booking with row lock
    const bookingRes = await client.query(
      `SELECT booking_id, ticket_ids, total_amount, booking_status, housie_name, game_id, assigned_agent_id
       FROM Bookings
       WHERE booking_id = $1 AND assigned_agent_id = $2
       FOR UPDATE`,
      [booking_id, agentId]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Booking not found or not assigned to you' });
      return;
    }

    const booking = bookingRes.rows[0];

    if (booking.booking_status !== 'Locked') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `Booking cannot be confirmed from status: ${booking.booking_status}` });
      return;
    }

    // 2. Fetch agent's balance to ensure they have enough credits
    const agentRes = await client.query(
      `SELECT current_balance FROM Users WHERE user_id = $1 FOR UPDATE`,
      [agentId]
    );
    const balance = parseFloat(agentRes.rows[0].current_balance);
    const amount = parseFloat(booking.total_amount);

    if (balance < amount) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Insufficient wallet balance. Please top up your wallet.' });
      return;
    }

    // 3. Deduct agent balance
    const newBalance = balance - amount;
    await client.query(
      `UPDATE Users SET current_balance = $1 WHERE user_id = $2`,
      [newBalance, agentId]
    );

    // 4. Record wallet ledger entry
    await client.query(
      `INSERT INTO Wallet_Ledger (agent_id, transaction_type, amount, balance_after, reference_type, reference_id, description, performed_by)
       VALUES ($1, 'Debit', $2, $3, 'Booking', $4, $5, $1)`,
      [
        agentId,
        amount,
        newBalance,
        booking_id,
        `Approved booking #${booking_id.substring(0, 8).toUpperCase()} for Player ${booking.housie_name}`,
      ]
    );

    // 5. Update Booking record
    await client.query(
      `UPDATE Bookings
       SET booking_status = 'Sold', confirmed_at = NOW(), confirmed_by = $1
       WHERE booking_id = $2`,
      [agentId, booking_id]
    );

    // 6. Finalize Tickets status and assign owner name
    await client.query(
      `UPDATE Tickets
       SET status = 'Sold',
           owner_housie_name = $1,
           confirmed_at = NOW(),
           locked_until = NULL,
           locked_by_booking = NULL
       WHERE ticket_id = ANY($2)`,
      [booking.housie_name, booking.ticket_ids]
    );

    await client.query('COMMIT');

    // Notify all players of ticket status changes (SSE relay)
    for (const ticketId of booking.ticket_ids) {
      const ticketNumRes = await pool.query('SELECT ticket_number FROM Tickets WHERE ticket_id = $1', [ticketId]);
      const ticketNumber = ticketNumRes.rows[0]?.ticket_number;
      io.emit('ticket_status_change', {
        event: 'ticket_status_change',
        ticket_id: ticketId,
        new_status: 'Sold',
      });
    }

    res.json({ message: 'Booking approved and tickets successfully sold.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Reject Booking (Agent Command)
 */
export async function rejectBooking(req: any, res: Response): Promise<void> {
  const { booking_id } = req.params;
  const agentId = req.user.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch booking with lock
    const bookingRes = await client.query(
      `SELECT booking_id, ticket_ids, booking_status
       FROM Bookings
       WHERE booking_id = $1 AND assigned_agent_id = $2
       FOR UPDATE`,
      [booking_id, agentId]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Booking not found or not assigned to you' });
      return;
    }

    const booking = bookingRes.rows[0];

    if (booking.booking_status !== 'Locked') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `Booking cannot be rejected from status: ${booking.booking_status}` });
      return;
    }

    // 2. Mark Booking = Cancelled
    await client.query(
      `UPDATE Bookings
       SET booking_status = 'Cancelled', rejected_at = NOW()
       WHERE booking_id = $1`,
      [booking_id]
    );

    // 3. Unlock Tickets
    await client.query(
      `UPDATE Tickets
       SET status = 'Available',
           locked_by_booking = NULL,
           locked_until = NULL
       WHERE locked_by_booking = $1`,
      [booking_id]
    );

    await client.query('COMMIT');

    // Notify ticket updates
    for (const ticketId of booking.ticket_ids) {
      io.emit('ticket_status_change', {
        event: 'ticket_status_change',
        ticket_id: ticketId,
        new_status: 'Available',
      });
    }

    res.json({ message: 'Booking successfully rejected.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error rejecting booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Agent-initiated direct sale — atomically lock + confirm tickets in one transaction
 */
export async function directSale(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { game_id, ticket_ids } = req.body;
  const housie_name: string = (req.body.housie_name ?? '').trim();
  const agentId = req.user!.userId;

  if (!game_id || !Array.isArray(ticket_ids) || ticket_ids.length === 0 || !housie_name) {
    res.status(400).json({ message: 'game_id, ticket_ids, and housie_name are required' });
    return;
  }
  if (ticket_ids.length > 6) {
    res.status(400).json({ message: 'A maximum of 6 tickets can be purchased per sale' });
    return;
  }
  if (housie_name.length < 3 || housie_name.length > 20) {
    res.status(400).json({ message: 'Housie Name must be between 3 and 20 characters' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify game accepts sales
    const gameRes = await client.query(
      `SELECT game_id, title, ticket_price, game_status FROM Scheduled_Games WHERE game_id = $1`,
      [game_id]
    );
    if (gameRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Game not found' });
      return;
    }
    const game = gameRes.rows[0];
    if (!['Scheduled', 'Live'].includes(game.game_status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Game is not accepting sales' });
      return;
    }

    // 2. Lock ticket rows and verify availability
    const ticketsRes = await client.query(
      `SELECT ticket_id, ticket_number, status
       FROM Tickets
       WHERE ticket_id = ANY($1) AND game_id = $2
       FOR UPDATE`,
      [ticket_ids, game_id]
    );
    if (ticketsRes.rows.length !== ticket_ids.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Some tickets do not exist in this game' });
      return;
    }
    const unavailable = ticketsRes.rows.filter((t) => t.status !== 'Available');
    if (unavailable.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: `Tickets ${unavailable.map((t) => `#${t.ticket_number}`).join(', ')} are not available`,
      });
      return;
    }

    // 3. Check agent wallet balance
    const agentRes = await client.query(
      `SELECT current_balance FROM Users WHERE user_id = $1 FOR UPDATE`,
      [agentId]
    );
    if (agentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Agent user not found' });
      return;
    }
    const balance = parseFloat(agentRes.rows[0].current_balance);
    const ticketPrice = parseFloat(game.ticket_price);
    const totalAmount = ticketPrice * ticket_ids.length;
    if (balance < totalAmount) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Insufficient wallet balance' });
      return;
    }

    // 4. Create Booking — immediately Sold
    const now = new Date();
    const bookingRes = await client.query(
      `INSERT INTO Bookings (
         game_id, ticket_ids, housie_name, assigned_agent_id, total_amount,
         booking_status, locked_at, locked_until, confirmed_at, confirmed_by
       ) VALUES ($1, $2, $3, $4, $5, 'Sold', $6, $6, $6, $4)
       RETURNING booking_id`,
      [game_id, ticket_ids, housie_name, agentId, totalAmount, now]
    );
    const bookingId = bookingRes.rows[0].booking_id;

    // 5. Mark tickets Sold
    await client.query(
      `UPDATE Tickets
       SET status = 'Sold',
           owner_housie_name = $1,
           confirmed_at = $2,
           locked_by_booking = $3,
           locked_until = NULL
       WHERE ticket_id = ANY($4)`,
      [housie_name, now, bookingId, ticket_ids]
    );

    // 6. Deduct agent balance and record ledger entry
    const newBalance = balance - totalAmount;
    await client.query(
      `UPDATE Users SET current_balance = $1 WHERE user_id = $2`,
      [newBalance, agentId]
    );
    await client.query(
      `INSERT INTO Wallet_Ledger (
         agent_id, transaction_type, amount, balance_after,
         reference_type, reference_id, description, performed_by
       ) VALUES ($1, 'Debit', $2, $3, 'Booking', $4, $5, $1)`,
      [
        agentId, totalAmount, newBalance, bookingId,
        `Direct sale #${bookingId.substring(0, 8).toUpperCase()} for ${housie_name}`,
      ]
    );

    await client.query('COMMIT');

    // Notify all connected clients that these tickets are now Sold
    for (const ticketId of ticket_ids) {
      io.emit('ticket_status_change', {
        event: 'ticket_status_change',
        ticket_id: ticketId,
        new_status: 'Sold',
      });
    }

    res.status(201).json({
      booking_id: bookingId,
      total_amount: totalAmount,
      balance_after: newBalance,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Direct sale error:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Get all confirmed sales for the authenticated Agent
 */
export async function getAgentSales(req: AuthenticatedRequest, res: Response): Promise<void> {
  const agentId = req.user!.userId;

  try {
    // confirmed_by = agentId: returns sales *this agent confirmed*, not just assigned to them
    const result = await pool.query(
      `SELECT b.booking_id, b.housie_name, b.total_amount, b.confirmed_at,
              g.title AS game_title,
              array_agg(t.ticket_number ORDER BY t.ticket_number) AS ticket_numbers
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       JOIN Tickets t ON t.ticket_id = ANY(b.ticket_ids)
       WHERE b.confirmed_by = $1 AND b.booking_status = 'Sold'
       GROUP BY b.booking_id, b.housie_name, b.total_amount, b.confirmed_at, g.title
       ORDER BY b.confirmed_at DESC
       LIMIT 200`,
      [agentId]
    );

    const sales = result.rows.map((row) => ({
      booking_id: row.booking_id,
      housie_name: row.housie_name,
      game_title: row.game_title,
      ticket_numbers: row.ticket_numbers as number[],
      total_amount: parseFloat(row.total_amount),
      confirmed_at: row.confirmed_at,
    }));

    res.json(sales);
  } catch (error) {
    console.error('Error fetching agent sales:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Operator Overflow Queue — bookings routed to this Operator because every
 * active bookie lacked sufficient wallet balance (the failsafe).
 */
export async function getOperatorOverflowQueue(req: AuthenticatedRequest, res: Response): Promise<void> {
  const operatorId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT b.booking_id, b.housie_name, b.total_amount, b.locked_at, b.locked_until, b.ticket_ids,
              g.title AS game_title, g.scheduled_at AS game_time
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       WHERE b.assigned_agent_id = $1
         AND b.is_overflow = TRUE
         AND b.booking_status = 'Locked'
         AND b.locked_until > NOW()
       ORDER BY b.locked_at ASC`,
      [operatorId]
    );

    const bookings = [];
    for (const row of result.rows) {
      const ticketsRes = await pool.query(
        `SELECT ticket_number FROM Tickets WHERE ticket_id = ANY($1) ORDER BY ticket_number`,
        [row.ticket_ids]
      );
      bookings.push({
        booking_id: row.booking_id,
        housie_name: row.housie_name,
        game_title: row.game_title,
        game_time: row.game_time,
        ticket_numbers: ticketsRes.rows.map((t) => t.ticket_number),
        total_amount: parseFloat(row.total_amount),
        locked_at: row.locked_at,
        locked_until: row.locked_until,
        time_remaining_ms: new Date(row.locked_until).getTime() - Date.now(),
      });
    }

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching operator overflow queue:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Force Confirm (Operator) — a direct-to-platform sale for an overflow booking.
 * Locks the tickets as Sold WITHOUT any wallet deduction (the Operator is an
 * internal staff member acting as the ultimate backstop).
 */
export async function forceConfirmBooking(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { booking_id } = req.params;
  const operatorId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT booking_id, ticket_ids, booking_status, housie_name, is_overflow
       FROM Bookings
       WHERE booking_id = $1 AND assigned_agent_id = $2
       FOR UPDATE`,
      [booking_id, operatorId]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Overflow booking not found or not assigned to you' });
      return;
    }

    const booking = bookingRes.rows[0];
    if (!booking.is_overflow) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'This booking is not an overflow booking' });
      return;
    }
    if (booking.booking_status !== 'Locked') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `Booking cannot be force-confirmed from status: ${booking.booking_status}` });
      return;
    }

    await client.query(
      `UPDATE Bookings
       SET booking_status = 'Sold', confirmed_at = NOW(), confirmed_by = $1
       WHERE booking_id = $2`,
      [operatorId, booking_id]
    );

    await client.query(
      `UPDATE Tickets
       SET status = 'Sold', owner_housie_name = $1, confirmed_at = NOW(),
           locked_until = NULL, locked_by_booking = NULL
       WHERE ticket_id = ANY($2)`,
      [booking.housie_name, booking.ticket_ids]
    );

    await client.query('COMMIT');

    for (const ticketId of booking.ticket_ids) {
      io.emit('ticket_status_change', {
        event: 'ticket_status_change',
        ticket_id: ticketId,
        new_status: 'Sold',
      });
    }

    res.json({ message: 'Overflow booking force-confirmed. Tickets sold direct-to-platform.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error force-confirming booking:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Skip Alerts (Agent) — returns the bookie's unseen FOMO skip events and marks
 * them seen. Powers the dashboard "you missed a booking" banner on reload.
 */
export async function getSkipAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const agentId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT alert_id, booking_amount, agent_balance, created_at
       FROM Skip_Alerts
       WHERE agent_id = $1 AND seen = FALSE
       ORDER BY created_at DESC
       LIMIT 50`,
      [agentId]
    );

    if (result.rows.length > 0) {
      await pool.query(
        `UPDATE Skip_Alerts SET seen = TRUE WHERE alert_id = ANY($1)`,
        [result.rows.map((r) => r.alert_id)]
      );
    }

    res.json(
      result.rows.map((r) => ({
        alert_id: r.alert_id,
        booking_amount: parseFloat(r.booking_amount),
        agent_balance: parseFloat(r.agent_balance),
        created_at: r.created_at,
      }))
    );
  } catch (error) {
    console.error('Error fetching skip alerts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
