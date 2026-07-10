import { Router } from 'express';
import { getGameTicketsGrid, getTicketGridData, getGameMyTickets, searchGameTickets } from './tickets.controller';
import { authenticatePlayer } from '../../middleware/playerAuth';

const router = Router();

router.get('/games/:game_id/tickets', getGameTicketsGrid);
router.get('/games/:game_id/my-tickets', authenticatePlayer, getGameMyTickets);
router.get('/games/:game_id/search-tickets', searchGameTickets);
router.get('/tickets/:ticket_id', getTicketGridData);

export default router;
