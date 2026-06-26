import { Router } from 'express';
import { getSettlements, getPendingCount, postSettle } from './settlements.controller';
import { authenticateToken, requireFinancialOfficer } from '../../middleware/auth';

const router = Router();

router.get('/', authenticateToken, requireFinancialOfficer, getSettlements);
router.get('/pending/count', authenticateToken, requireFinancialOfficer, getPendingCount);
router.post('/:id/settle', authenticateToken, requireFinancialOfficer, postSettle);

export default router;
