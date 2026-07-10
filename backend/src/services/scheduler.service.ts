/**
 * Auto-Expiry Sweeper
 * Background cron job that runs every 30 seconds to reclaim expired ticket locks
 */

import cron from 'node-cron';
import pool from '../db';
import { io } from '../server';

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
      console.log(`🧹 Found ${expiredBookings.length} expired bookings to sweep.`);

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

        console.log(`🧹 Swept and expired booking ${booking.booking_id}`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in Auto-Expiry Sweeper:', error);
    } finally {
      client.release();
    }
  });

  console.log('⏰ Auto-Expiry Sweeper scheduled (every 30s)');
}
