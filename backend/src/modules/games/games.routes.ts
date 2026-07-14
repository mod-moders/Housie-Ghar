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
  updateGame,
  deleteGame,
  getGameSalesDetails,
} from './games.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';
import {
  listNumberCalls,
  updateNumberCall,
  restoreDefaultCallText,
  uploadNumberAudio,
} from './numberCalls.controller';

const router = Router();

// Player endpoints (Public)
router.get('/number-calls', listNumberCalls);
router.get('/', getGames);

// Game creation (Financial Admin or Superadmin)
router.post('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), createGame);
router.patch('/:game_id', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), updateGame);
router.delete('/:game_id', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), deleteGame);
router.patch('/number-calls/:number', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), restoreDefaultCallText);
router.post('/number-calls/:number/upload', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), uploadNumberAudio);
router.get('/:game_id/drawn', getDrawnNumbers);
router.get('/:game_id/live-stream', liveStream);
router.get('/:game_id', getGameById);

// Staff control endpoints (Authenticated Operator or higher)
router.post('/:game_id/start', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleStartGame);
router.post('/:game_id/pause', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handlePauseGame);
router.post('/:game_id/resume', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleResumeGame);
router.post('/:game_id/speed', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleSpeedChange);
router.get('/:game_id/sales-details', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), getGameSalesDetails);

export default router;
