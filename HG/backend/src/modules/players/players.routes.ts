import { Router } from 'express';
import { playerLogin, getCurrentPlayer, playerLogout } from './players.controller';

const router = Router();

router.post('/login', playerLogin);
router.get('/me', getCurrentPlayer);
router.post('/logout', playerLogout);

export default router;
