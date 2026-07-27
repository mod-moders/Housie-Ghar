import { Router } from 'express';
import { getGameTicketsGrid, getTicketGridData, getGameMyTickets, searchGameTickets, updateTicketDisplayName } from './tickets.controller';
import { authenticatePlayer } from '../../middleware/playerAuth';

import { intParam, uuidParam } from '../../middleware/validateParams';

const router = Router();

// Reject malformed ids up front so a bad link 404s instead of surfacing a
// Postgres type error as a 500. See middleware/validateParams.ts.
router.param('game_id', uuidParam('Game'));
router.param('ticket_id', intParam('Ticket'));


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
