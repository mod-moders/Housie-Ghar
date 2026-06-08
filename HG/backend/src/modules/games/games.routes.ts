import { Router } from 'express';
import {
  getGames,
  getGameById,
  createGame,
  handleStartGame,
  handlePauseGame,
  handleResumeGame,
  handleSpeedChange,
  getDrawnNumbers,
  liveStream,
} from './games.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.get('/', getGames);

// Game creation (Admin or Superadmin)
router.post('/', authenticateToken, requireRole(['Admin', 'Superadmin']), createGame);
router.get('/:game_id/drawn', getDrawnNumbers);
router.get('/:game_id/live-stream', liveStream);
router.get('/:game_id', getGameById);

// Staff control endpoints (Authenticated Operator or higher)
router.post('/:game_id/start', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleStartGame);
router.post('/:game_id/pause', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handlePauseGame);
router.post('/:game_id/resume', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleResumeGame);
router.post('/:game_id/speed', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleSpeedChange);

export default router;
