import { Router } from 'express';
import { signup, login, getProfile, updateProfile, logout, getPlayerStats, getAllPlayers, adminUpdatePlayerStatus, adminResetPlayerPassword, adminDeletePlayer, getPlayerWinnings, forgotPassword, resetPassword } from './player.controller';
import { authenticatePlayer } from '../../middleware/playerAuth';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
// Password recovery. Both are unauthenticated by necessity — the caller is locked out —
// so both sit behind the failed-attempt limiter in app.ts.
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticatePlayer, getProfile);
router.patch('/me', authenticatePlayer, updateProfile);
router.get('/stats', authenticatePlayer, getPlayerStats);
router.get('/winnings', authenticatePlayer, getPlayerWinnings);

// Administrative Player Management endpoints
router.get('/', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getAllPlayers);
router.patch('/:player_id/status', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), adminUpdatePlayerStatus);
// Last-resort recovery for a player with neither a phone on file nor a recognised
// device. Same role pair that can suspend an account; always audit-logged.
router.patch('/:player_id/password', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), adminResetPlayerPassword);
router.delete('/:player_id', authenticateToken, requireRole(['Superadmin']), adminDeletePlayer);

export default router;
