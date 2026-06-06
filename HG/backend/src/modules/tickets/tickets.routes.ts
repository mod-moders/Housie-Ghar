import { Router } from 'express';
import { getGameTicketsGrid, getTicketGridData } from './tickets.controller';

const router = Router();

router.get('/games/:game_id/tickets', getGameTicketsGrid);
router.get('/tickets/:ticket_id', getTicketGridData);

export default router;
