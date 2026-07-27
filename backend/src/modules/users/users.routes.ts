import { Router } from 'express';
import { listUsers, createUser, updateUser, resetUserPassword, deleteUser, designateCfo, getOverflowSettings, updateOverflowSettings, createBookieApplication, listBookiesStats, updateBookieReceiveBookings, getBookieApplications, updateBookieApplicationStatus, getBookiePersonalStats } from './users.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

import { uuidParam } from '../../middleware/validateParams';

const router = Router();

// Reject malformed ids up front so a bad link 404s instead of surfacing a
// Postgres type error as a 500. See middleware/validateParams.ts.
router.param('id', uuidParam('Record'));
router.param('user_id', uuidParam('User'));


// Public Bookie application submission
router.post('/apply-bookie', createBookieApplication);

// Bookie personal stats endpoint
router.get('/bookie/personal-stats', authenticateToken, requireRole(['Bookie']), getBookiePersonalStats);

// Bookie Management — Superadmin, Financial Admin, and Operator
router.get('/bookies-stats', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), listBookiesStats);
router.patch('/bookie/:id/receive-bookings', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), updateBookieReceiveBookings);
router.get('/bookie-applications', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), getBookieApplications);
router.patch('/bookie-applications/:id/status', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), updateBookieApplicationStatus);

// Overflow settings — Superadmin only
router.get('/overflow-settings', authenticateToken, requireRole(['Superadmin']), getOverflowSettings);
router.patch('/:user_id/overflow-settings', authenticateToken, requireRole(['Superadmin']), updateOverflowSettings);

// Staff management (Financial Admin or Superadmin)
router.get('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), listUsers);
router.post('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), createUser);
router.patch('/:id', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), updateUser);
router.post('/:id/reset-password', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), resetUserPassword);
router.delete('/:id', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), deleteUser);

// CFO designation — Superadmin only
router.patch('/:id/cfo', authenticateToken, requireRole(['Superadmin']), designateCfo);

export default router;
