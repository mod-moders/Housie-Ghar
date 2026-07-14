import { Router } from 'express';
import {
  getGames,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
  handleStartGame,
  handlePauseGame,
  handleResumeGame,
  handleSpeedChange,
  getDrawnNumbers,
  liveStream,
} from './games.controller';
import {
  listNumberCalls,
  updateNumberCall,
  restoreDefaultCallText,
  uploadNumberAudio,
} from './numberCalls.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Player endpoints (Public)
router.get('/', getGames);

// Caller voice settings — must be declared before the /:game_id param routes
router.get('/number-calls', listNumberCalls); // public: the live board reads phrases/audio
router.patch('/number-calls/:number', authenticateToken, requireRole(['Admin', 'Superadmin']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Admin', 'Superadmin']), restoreDefaultCallText);
router.post('/number-calls/:number/audio', authenticateToken, requireRole(['Admin', 'Superadmin']), uploadNumberAudio);

// Game creation (Admin or Superadmin)
router.post('/', authenticateToken, requireRole(['Admin', 'Superadmin']), createGame);
router.get('/:game_id/drawn', getDrawnNumbers);
router.get('/:game_id/live-stream', liveStream);
router.get('/:game_id', getGameById);
router.patch('/:game_id', authenticateToken, requireRole(['Admin', 'Superadmin']), updateGame);
router.delete('/:game_id', authenticateToken, requireRole(['Admin', 'Superadmin']), deleteGame);

// Staff control endpoints (Authenticated Operator or higher)
router.post('/:game_id/start', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleStartGame);
router.post('/:game_id/pause', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handlePauseGame);
router.post('/:game_id/resume', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleResumeGame);
router.post('/:game_id/speed', authenticateToken, requireRole(['Operator', 'Admin', 'Superadmin']), handleSpeedChange);

export default router;
