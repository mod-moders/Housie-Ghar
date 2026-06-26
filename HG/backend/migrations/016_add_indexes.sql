-- Performance indexes for the hot read paths on the live board and booking flow.
-- NOTE: plain CREATE INDEX (not CONCURRENTLY). The migration runner wraps every
-- file in a transaction, and Postgres forbids CREATE INDEX CONCURRENTLY inside a
-- transaction block — so CONCURRENTLY here failed and blocked all later
-- migrations. These tables are small; a brief lock at migrate time is fine. To
-- build these without a lock on a large live DB, run them out-of-band instead.
CREATE INDEX IF NOT EXISTS idx_game_logs_game_id  ON Game_Logs(game_id);
CREATE INDEX IF NOT EXISTS idx_bookings_game_id   ON Bookings(game_id);
CREATE INDEX IF NOT EXISTS idx_tickets_game_id    ON Tickets(game_id);
CREATE INDEX IF NOT EXISTS idx_prize_pool_game_id ON Prize_Pool(game_id);
