import { Router } from 'express';
import {
  playerLogin,
  getCurrentPlayer,
  updatePlayerProfile,
  getMyPlayerStats,
  getMyTickets,
  getMyWins,
  playerLogout,
  getAllPlayers,
  updatePlayerStatus,
  deletePlayer,
} from './players.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

router.post('/login', playerLogin);
router.get('/me', getCurrentPlayer);
router.patch('/me', updatePlayerProfile);
router.get('/me/stats', getMyPlayerStats);
router.get('/me/tickets', getMyTickets);
router.get('/me/wins', getMyWins);
router.post('/logout', playerLogout);

// Staff player management
router.get('/', authenticateToken, requireRole(['Admin', 'Superadmin']), getAllPlayers);
router.patch('/:player_id/status', authenticateToken, requireRole(['Admin', 'Superadmin']), updatePlayerStatus);
router.delete('/:player_id', authenticateToken, requireRole(['Superadmin']), deletePlayer);

export default router;
