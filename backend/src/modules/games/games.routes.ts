import { Router } from 'express';
import {
  getGames,
  getGameById,
  createGame,
  handleStartGame,
  handlePauseGame,
  handleResumeGame,
  handleStopGame,
  handleSpeedChange,
  getDrawnNumbers,
  liveStream,
  updateGame,
  deleteGame,
  getGameSalesDetails,
  sendEmojiReaction,
  claimPrize,
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
router.post('/:game_id/prizes/:prize_id/claim', claimPrize);

// Game creation (Financial Admin, Superadmin or Operator)
router.post('/', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), createGame);
router.patch('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), updateGame);
router.delete('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), deleteGame);
router.patch('/number-calls/:number', authenticateToken, requireRole(['Superadmin']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Superadmin']), restoreDefaultCallText);
router.post('/number-calls/:number/upload', authenticateToken, requireRole(['Superadmin']), uploadNumberAudio);
router.get('/:game_id/drawn', getDrawnNumbers);
router.get('/:game_id/live-stream', liveStream);
router.get('/:game_id', getGameById);
router.post('/:game_id/reactions', sendEmojiReaction);

// Staff control endpoints (Authenticated Financial Admin or higher)
router.post('/:game_id/start', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleStartGame);
router.post('/:game_id/pause', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handlePauseGame);
router.post('/:game_id/resume', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleResumeGame);
router.post('/:game_id/stop', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleStopGame);
router.post('/:game_id/speed', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleSpeedChange);
router.get('/:game_id/sales-details', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), getGameSalesDetails);

export default router;
