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
  disbursePrize,
  getPrizeClaims,
  getPrizeClaimsDashboard,
} from './games.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';
import {
  listNumberCalls,
  updateNumberCall,
  restoreDefaultCallText,
  uploadNumberAudio,
  deleteNumberAudio,
  updateBulkVolume,
} from './numberCalls.controller';

const router = Router();

// Player endpoints (Public)
router.get('/number-calls', listNumberCalls);
router.get('/', getGames);
router.post('/:game_id/prizes/:prize_id/claim', claimPrize);

// Financial Admin - Prize Claims
router.get('/prize-claims/dashboard', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getPrizeClaimsDashboard);
router.get('/prize-claims', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getPrizeClaims);

// Game creation (Financial Admin or Superadmin)
router.post('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), createGame);
router.patch('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), updateGame);
router.delete('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), deleteGame);
router.patch('/number-calls-bulk-volume', authenticateToken, requireRole(['Superadmin']), updateBulkVolume);
router.patch('/number-calls/:number', authenticateToken, requireRole(['Superadmin']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Superadmin']), restoreDefaultCallText);
router.post('/number-calls/:number/upload', authenticateToken, requireRole(['Superadmin']), uploadNumberAudio);
router.delete('/number-calls/:number/audio', authenticateToken, requireRole(['Superadmin']), deleteNumberAudio);
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
router.post('/:game_id/prizes/:prize_id/disburse', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), disbursePrize);

export default router;
