import { Router } from 'express';
import {
  listAgentWallets,
  getMyLedger,
  listPendingTopUps,
  requestTopUp,
  approveTopUp,
  rejectTopUp,
  manualAdjust,
} from './wallet.controller';
import { authenticateToken, requireRole, requireFinancialOfficer } from '../../middleware/auth';

const router = Router();

// Admin oversight
router.get('/agents', authenticateToken, requireRole(['Admin', 'Superadmin']), listAgentWallets);
router.get('/topup/pending', authenticateToken, requireRole(['Admin', 'Superadmin']), listPendingTopUps);

// Agent self-service
router.get('/ledger', authenticateToken, requireRole(['Agent']), getMyLedger);
router.post('/topup/request', authenticateToken, requireRole(['Agent']), requestTopUp);

// Admin review
router.post('/topup/:id/approve', authenticateToken, requireRole(['Admin', 'Superadmin']), approveTopUp);
router.post('/topup/:id/reject', authenticateToken, requireRole(['Admin', 'Superadmin']), rejectTopUp);

// Financial Officer hub
router.post('/agents/:agentId/adjust', authenticateToken, requireFinancialOfficer, manualAdjust);

export default router;
