/**
 * Auto-Expiry Sweeper
 * Background cron job that runs every 30 seconds to reclaim expired ticket locks
 */

import cron from 'node-cron';
import pool from '../db';
import { io } from '../server';
import { logger } from '../utils/logger';

export function startExpirySweeper(): void {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Find all expired bookings that are still in 'Locked' status
      const expiredResult = await client.query(
        `SELECT booking_id, assigned_agent_id, ticket_ids
         FROM Bookings
         WHERE booking_status = 'Locked' AND locked_until < NOW()`
      );

      if (expiredResult.rowCount === 0) {
        await client.query('COMMIT');
        return;
      }

      const expiredBookings = expiredResult.rows;
      logger.info({ count: expiredBookings.length }, 'sweeping expired bookings');

      for (const booking of expiredBookings) {
        // 2. Set Booking status = 'Expired'
        await client.query(
          `UPDATE Bookings
           SET booking_status = 'Expired'
           WHERE booking_id = $1`,
          [booking.booking_id]
        );

        // 3. Unlock the tickets associated with this booking
        await client.query(
          `UPDATE Tickets
           SET status = 'Available',
               locked_by_booking = NULL,
               locked_until = NULL
           WHERE locked_by_booking = $1`,
          [booking.booking_id]
        );

        // 4. Send WebSocket notification to the assigned Agent
        io.to(`agent-${booking.assigned_agent_id}`).emit('booking_expired', {
          booking_id: booking.booking_id,
        });

        logger.info({ bookingId: booking.booking_id }, 'booking expired and swept');
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'error in auto-expiry sweeper');
    } finally {
      client.release();
    }
  });

  logger.info('auto-expiry sweeper scheduled (every 30s)');
}
