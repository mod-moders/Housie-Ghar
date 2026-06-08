import { Router } from 'express';
import {
  lockTickets,
  getBookingStatus,
  getAgentQueue,
  confirmBooking,
  rejectBooking,
  directSale,
  getAgentSales,
  getOperatorOverflowQueue,
  forceConfirmBooking,
  getSkipAlerts,
} from './bookings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.post('/lock', lockTickets);
router.get('/status/:booking_id', getBookingStatus);

// Agent endpoints (Authenticated)
router.get('/agent/queue', authenticateToken, requireRole(['Agent']), getAgentQueue);
router.get('/agent/sales', authenticateToken, requireRole(['Agent']), getAgentSales);
router.get('/agent/skip-alerts', authenticateToken, requireRole(['Agent']), getSkipAlerts);
router.post('/agent/direct-sale', authenticateToken, requireRole(['Agent']), directSale);
router.post('/agent/:booking_id/confirm', authenticateToken, requireRole(['Agent']), confirmBooking);
router.post('/agent/:booking_id/reject', authenticateToken, requireRole(['Agent']), rejectBooking);

// Operator overflow failsafe endpoints (Authenticated)
router.get('/operator/overflow-queue', authenticateToken, requireRole(['Operator']), getOperatorOverflowQueue);
router.post('/operator/:booking_id/force-confirm', authenticateToken, requireRole(['Operator']), forceConfirmBooking);

export default router;
