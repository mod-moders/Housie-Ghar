import { Router } from 'express';
import { getOverview, getHallOfFame } from './stats.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/overview', authenticateToken, requireRole(['Superadmin', 'Admin']), getOverview);
router.get('/hall-of-fame', getHallOfFame);

export default router;
