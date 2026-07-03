import { Router } from 'express';
import { playerLogin, getCurrentPlayer, getMyTickets, getMyWins, playerLogout } from './players.controller';

const router = Router();

router.post('/login', playerLogin);
router.get('/me', getCurrentPlayer);
router.get('/me/tickets', getMyTickets);
router.get('/me/wins', getMyWins);
router.post('/logout', playerLogout);

export default router;
