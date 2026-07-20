import { Router } from 'express';
import {
  getOverview,
  getHallOfFame,
  getLuckyNumber,
  getFinancialAnalysis,
  getFinanceInsights,
  getOperatorStats,
  getBookieStats,
} from './stats.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/overview', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getOverview);
router.get('/financial-analysis', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getFinancialAnalysis);
router.get('/finance-insights', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getFinanceInsights);
router.get('/operator', authenticateToken, requireRole(['Operator', 'Superadmin', 'Financial Admin']), getOperatorStats);
router.get('/bookie', authenticateToken, requireRole(['Bookie', 'Superadmin', 'Financial Admin']), getBookieStats);
router.get('/hall-of-fame', getHallOfFame);
router.get('/lucky-number', getLuckyNumber);

export default router;
