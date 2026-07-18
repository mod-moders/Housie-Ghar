-- Migration 036: Add index on Tickets(game_id, owner_housie_name) to speed up player-ticket and prize check queries
CREATE INDEX IF NOT EXISTS idx_tickets_game_owner ON Tickets(game_id, owner_housie_name);
