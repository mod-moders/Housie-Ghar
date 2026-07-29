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
  staffManualBooking,
  getAgentHistory,
  getStaffDues,
  settleStaffDue,
  cancelBooking,
} from './bookings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

import { uuidParam } from '../../middleware/validateParams';

const router = Router();

// Reject malformed ids up front so a bad link 404s instead of surfacing a
// Postgres type error as a 500. See middleware/validateParams.ts.
router.param('booking_id', uuidParam('Booking'));


// Player endpoints (Public)
router.post('/lock', lockTickets);
router.get('/status/:booking_id', getBookingStatus);

// Bookie endpoints (Authenticated)
router.get('/agent/queue', authenticateToken, requireRole(['Bookie']), getAgentQueue);
router.get('/agent/sales', authenticateToken, requireRole(['Bookie']), getAgentSales);
router.get('/agent/history', authenticateToken, requireRole(['Bookie']), getAgentHistory);
router.get('/agent/skip-alerts', authenticateToken, requireRole(['Bookie']), getSkipAlerts);
router.post('/agent/direct-sale', authenticateToken, requireRole(['Bookie']), directSale);
router.post('/agent/:booking_id/confirm', authenticateToken, requireRole(['Bookie']), confirmBooking);
router.post('/agent/:booking_id/reject', authenticateToken, requireRole(['Bookie']), rejectBooking);

// Operator overflow failsafe endpoints (Authenticated)
router.get('/operator/overflow-queue', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), getOperatorOverflowQueue);
router.get('/operator/overflow-history', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), getAgentHistory);
router.post('/operator/:booking_id/force-confirm', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), forceConfirmBooking);
router.post('/operator/:booking_id/force-reject', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), rejectBooking);
router.post('/operator/:booking_id/cancel', authenticateToken, requireRole(['Superadmin']), cancelBooking);
router.post('/staff/manual-book', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), staffManualBooking);

// Staff Dues financial tracking
router.get('/operator/staff-dues', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), getStaffDues);
router.post('/operator/:booking_id/settle-due', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), settleStaffDue);

export default router;
