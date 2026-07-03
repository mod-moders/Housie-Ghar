import { Router } from 'express';
import { getSettlements, getMySettlements, getPendingCount, postSettle } from './settlements.controller';
import { authenticateToken, requireFinancialOfficer, requireRole } from '../../middleware/auth';

const router = Router();

// Bookie self-service: own prize ledger + WhatsApp claim link
router.get('/mine', authenticateToken, requireRole(['Agent']), getMySettlements);

// Financial Officer
router.get('/', authenticateToken, requireFinancialOfficer, getSettlements);
router.get('/pending/count', authenticateToken, requireFinancialOfficer, getPendingCount);
router.post('/:id/settle', authenticateToken, requireFinancialOfficer, postSettle);

export default router;
