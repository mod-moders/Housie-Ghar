import { Router } from 'express';
import {
  lockTickets,
  getBookingStatus,
  getAgentQueue,
  confirmBooking,
  rejectBooking,
} from './bookings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.post('/lock', lockTickets);
router.get('/status/:booking_id', getBookingStatus);

// Agent endpoints (Authenticated)
router.get('/agent/queue', authenticateToken, requireRole(['Agent']), getAgentQueue);
router.post('/agent/:booking_id/confirm', authenticateToken, requireRole(['Agent']), confirmBooking);
router.post('/agent/:booking_id/reject', authenticateToken, requireRole(['Agent']), rejectBooking);

export default router;
