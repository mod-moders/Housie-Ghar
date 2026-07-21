import { Router } from 'express';
import { getBookieRewards, getPlayerRewards, getRewardsSummary } from './rewards.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { authenticatePlayer } from '../../middleware/playerAuth';

const router = Router();

// Bookie's own reward standing
router.get('/bookie', authenticateToken, requireRole(['Bookie']), getBookieRewards);

// Player's own referral standing
router.get('/player', authenticatePlayer, getPlayerRewards);

// Reward-cost P&L + abuse signals (financial oversight only)
router.get('/summary', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getRewardsSummary);

export default router;
