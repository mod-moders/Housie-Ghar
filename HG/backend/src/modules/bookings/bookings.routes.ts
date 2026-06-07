import { Router } from 'express';
import {
  lockTickets,
  getBookingStatus,
  getAgentQueue,
  confirmBooking,
  rejectBooking,
  directSale,
  getAgentSales,
} from './bookings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.post('/lock', lockTickets);
router.get('/status/:booking_id', getBookingStatus);

// Agent endpoints (Authenticated)
router.get('/agent/queue', authenticateToken, requireRole(['Agent']), getAgentQueue);
router.get('/agent/sales', authenticateToken, requireRole(['Agent']), getAgentSales);
router.post('/agent/direct-sale', authenticateToken, requireRole(['Agent']), directSale);
router.post('/agent/:booking_id/confirm', authenticateToken, requireRole(['Agent']), confirmBooking);
router.post('/agent/:booking_id/reject', authenticateToken, requireRole(['Agent']), rejectBooking);

export default router;
