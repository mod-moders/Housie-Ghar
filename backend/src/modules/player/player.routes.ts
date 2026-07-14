import { Router } from 'express';
import { signup, login, getProfile, updateProfile, logout, getPlayerStats, getAllPlayers, adminUpdatePlayerStatus, adminDeletePlayer } from './player.controller';
import { authenticatePlayer } from '../../middleware/playerAuth';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticatePlayer, getProfile);
router.patch('/me', authenticatePlayer, updateProfile);
router.get('/stats', authenticatePlayer, getPlayerStats);

// Administrative Player Management endpoints
router.get('/', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), getAllPlayers);
router.patch('/:player_id/status', authenticateToken, requireRole(['Superadmin', 'Financial Admin']), adminUpdatePlayerStatus);
router.delete('/:player_id', authenticateToken, requireRole(['Superadmin']), adminDeletePlayer);

export default router;
