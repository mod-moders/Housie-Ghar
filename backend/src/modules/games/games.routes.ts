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
  updateBulkMode,
} from './numberCalls.controller';

const router = Router();

// ==========================================
// 1. Static Routes (Must be declared first)
// ==========================================

// Public static routes
router.get('/number-calls', listNumberCalls);

// Superadmin static bulk endpoints
router.patch('/number-calls-bulk-volume', authenticateToken, requireRole(['Superadmin']), updateBulkVolume);
router.patch('/number-calls-bulk-mode', authenticateToken, requireRole(['Superadmin']), updateBulkMode);

// Superadmin individual call number static endpoints
router.patch('/number-calls/:number', authenticateToken, requireRole(['Superadmin']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Superadmin']), restoreDefaultCallText);
router.post('/number-calls/:number/upload', authenticateToken, requireRole(['Superadmin']), uploadNumberAudio);
router.delete('/number-calls/:number/audio', authenticateToken, requireRole(['Superadmin']), deleteNumberAudio);

// Financial Admin / Superadmin static dashboard/listing endpoints
router.get('/prize-claims/dashboard', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getPrizeClaimsDashboard);
router.get('/prize-claims', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getPrizeClaims);

// ==========================================
// 2. Collection Base Routes
// ==========================================
router.get('/', getGames);
router.post('/', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), createGame);

// ==========================================
// 3. Dynamic Parameterized Routes
// ==========================================
router.get('/:game_id', getGameById);
router.patch('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), updateGame);
router.delete('/:game_id', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), deleteGame);
router.get('/:game_id/drawn', getDrawnNumbers);
router.get('/:game_id/live-stream', liveStream);
router.post('/:game_id/reactions', sendEmojiReaction);

// Operator / Financial Admin / Superadmin control actions
router.post('/:game_id/start', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleStartGame);
router.post('/:game_id/pause', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handlePauseGame);
router.post('/:game_id/resume', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleResumeGame);
router.post('/:game_id/stop', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleStopGame);
router.post('/:game_id/speed', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), handleSpeedChange);
router.get('/:game_id/sales-details', authenticateToken, requireRole(['Operator', 'Financial Admin', 'Superadmin']), getGameSalesDetails);

// Prize claim specific parameterized endpoints
router.post('/:game_id/prizes/:prize_id/claim', claimPrize);
router.post('/:game_id/prizes/:prize_id/disburse', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), disbursePrize);

export default router;
