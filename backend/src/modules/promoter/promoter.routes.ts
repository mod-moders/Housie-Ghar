import { Router } from 'express';
import { getReferrals, getEarnings } from './promoter.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/referrals', authenticateToken, requireRole(['Promoter'] as any), getReferrals);
router.get('/earnings', authenticateToken, requireRole(['Promoter'] as any), getEarnings);

export default router;
