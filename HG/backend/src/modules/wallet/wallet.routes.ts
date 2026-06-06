import { Router } from 'express';
import {
  listAgentWallets,
  requestTopUp,
  approveTopUp,
  rejectTopUp,
} from './wallet.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Admin oversight
router.get('/agents', authenticateToken, requireRole(['Admin', 'Superadmin']), listAgentWallets);

// Agent self-service
router.post('/topup/request', authenticateToken, requireRole(['Agent']), requestTopUp);

// Admin review
router.post('/topup/:id/approve', authenticateToken, requireRole(['Admin', 'Superadmin']), approveTopUp);
router.post('/topup/:id/reject', authenticateToken, requireRole(['Admin', 'Superadmin']), rejectTopUp);

export default router;
