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
  claimAllPrizes,
  disbursePrize,
  disburseConsolidatedClaim,
  getClaimRequests,
  getPrizeClaimsDashboard,
} from './games.controller';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { authenticatePlayer } from '../../middleware/playerAuth';
import {
  listNumberCalls,
  updateNumberCall,
  restoreDefaultCallText,
  uploadNumberAudio,
  deleteNumberAudio,
  updateBulkVolume,
  updateBulkMode,
} from './numberCalls.controller';

import { intParam, uuidParam } from '../../middleware/validateParams';

const router = Router();

// Reject malformed ids up front so a bad link 404s instead of surfacing a
// Postgres type error as a 500. See middleware/validateParams.ts.
router.param('game_id', uuidParam('Game'));
router.param('prize_id', intParam('Prize'));


// ==========================================
// 1. Static Routes (Must be declared first)
// ==========================================

// Public static routes
router.get('/number-calls', listNumberCalls);

// Staff static bulk endpoints
router.patch('/number-calls-bulk-volume', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), updateBulkVolume);
router.patch('/number-calls-bulk-mode', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), updateBulkMode);

// Staff individual call number static endpoints
router.patch('/number-calls/:number', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), updateNumberCall);
router.post('/number-calls/:number/restore', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), restoreDefaultCallText);
router.post('/number-calls/:number/upload', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), uploadNumberAudio);
router.delete('/number-calls/:number/audio', authenticateToken, requireRole(['Superadmin', 'Financial Admin', 'Operator']), deleteNumberAudio);

// Financial Admin / Superadmin static dashboard/listing endpoints
router.get('/prize-claims/dashboard', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getPrizeClaimsDashboard);
router.get('/prize-claims', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), getClaimRequests);

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
// Both claim routes verified the player token inline before, which meant they
// also skipped the suspended-account check the middleware performs and trusted
// the housie name baked into the token. See utils/playerIdentity.ts.
router.post('/:game_id/claim-all', authenticatePlayer, claimAllPrizes);
router.post('/:game_id/prizes/:prize_id/claim', authenticatePlayer, claimPrize);
router.post('/:game_id/prizes/:prize_id/disburse', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), disbursePrize);
router.post('/:game_id/disburse-consolidated', authenticateToken, requireRole(['Financial Admin', 'Superadmin']), disburseConsolidatedClaim);

export default router;
