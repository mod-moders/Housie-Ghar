import { Router } from 'express';
import {
  listAgentWallets,
  getMyLedger,
  listPendingTopUps,
  requestTopUp,
  approveTopUp,
  rejectTopUp,
  manualAdjust,
  getFinancialHud,
  getMasterLedger,
} from './wallet.controller';
import { authenticateToken, requireRole, requireFinancialOfficer } from '../../middleware/auth';

const router = Router();

// Financial Admin oversight
router.get('/agents', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), listAgentWallets);

// Bookie self-service
router.get('/ledger', authenticateToken, requireRole(['Bookie']), getMyLedger);
router.post('/topup/request', authenticateToken, requireRole(['Bookie']), requestTopUp);

// Financial Officer review
router.get('/topup/pending', authenticateToken, requireFinancialOfficer, listPendingTopUps);
router.post('/topup/:id/approve', authenticateToken, requireFinancialOfficer, approveTopUp);
router.post('/topup/:id/reject', authenticateToken, requireFinancialOfficer, rejectTopUp);

// Financial Officer hub
router.post('/agents/:agentId/adjust', authenticateToken, requireFinancialOfficer, manualAdjust);
router.get('/hud', authenticateToken, requireFinancialOfficer, getFinancialHud);
router.get('/master-ledger', authenticateToken, requireFinancialOfficer, getMasterLedger);

export default router;
