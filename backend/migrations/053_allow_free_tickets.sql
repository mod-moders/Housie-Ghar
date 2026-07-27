-- Migration 053: Allow free tickets (price = 0) in Scheduled_Games
ALTER TABLE Scheduled_Games DROP CONSTRAINT IF EXISTS scheduled_games_ticket_price_check;
ALTER TABLE Scheduled_Games ADD CONSTRAINT scheduled_games_ticket_price_check CHECK (ticket_price >= 0);
