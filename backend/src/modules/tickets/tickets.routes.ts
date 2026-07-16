import { Router } from 'express';
import { getGameTicketsGrid, getTicketGridData, getGameMyTickets, searchGameTickets } from './tickets.controller';
import { authenticatePlayer } from '../../middleware/playerAuth';

const router = Router();

router.get('/games/:game_id/tickets', getGameTicketsGrid);
// Alias consumed by the staff manual-booking modal (AdminSections). Same payload
// as /api/games/:game_id/tickets — declared before /tickets/:ticket_id so the
// extra path segments don't get swallowed by the single-param route.
router.get('/tickets/games/:game_id/tickets', getGameTicketsGrid);
router.get('/games/:game_id/my-tickets', authenticatePlayer, getGameMyTickets);
router.get('/games/:game_id/search-tickets', searchGameTickets);
router.get('/tickets/:ticket_id', getTicketGridData);

export default router;
