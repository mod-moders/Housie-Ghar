import { Router } from 'express';
import { getOverview, getHallOfFame, getLuckyNumber } from './stats.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/overview', authenticateToken, requireRole(['Superadmin', 'Admin']), getOverview);
router.get('/hall-of-fame', getHallOfFame);
router.get('/lucky-number', getLuckyNumber);

export default router;
