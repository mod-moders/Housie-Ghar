import { Router } from 'express';
import { getGameTicketsGrid, getTicketGridData, getGameMyTickets, searchGameTickets, updateTicketDisplayName } from './tickets.controller';
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
// Player renames one of their own purchased tickets. Writes display_name only —
// owner_housie_name stays the ownership key (see the controller).
router.patch('/tickets/:ticket_id/display-name', authenticatePlayer, updateTicketDisplayName);

export default router;
