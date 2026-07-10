import { Router } from 'express';
import { getOverview, getHallOfFame, getLuckyNumber, getFinancialAnalysis } from './stats.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/overview', authenticateToken, requireRole(['Superadmin', 'Admin']), getOverview);
router.get('/financial-analysis', authenticateToken, requireRole(['Superadmin', 'Admin']), getFinancialAnalysis);
router.get('/hall-of-fame', getHallOfFame);
router.get('/lucky-number', getLuckyNumber);

export default router;
