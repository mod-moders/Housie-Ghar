-- Performance indexes for the hot read paths on the live board and booking flow.
-- CONCURRENTLY means these can run while the app is live (no table lock).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_logs_game_id  ON Game_Logs(game_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_game_id   ON Bookings(game_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_game_id    ON Tickets(game_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prize_pool_game_id ON Prize_Pool(game_id);
