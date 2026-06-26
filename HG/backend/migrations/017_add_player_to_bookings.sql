-- Migration 016: link bookings to player accounts.
-- Nullable on purpose: anonymous bookings (no player session) keep player_id
-- NULL, so this is fully backward-compatible with existing rows and flows.
-- A logged-in player's bookings carry their player_id, which is how the live
-- board and "my tickets" resolve a player's tickets across devices.

ALTER TABLE Bookings
  ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES Player_Logins(player_id);

CREATE INDEX IF NOT EXISTS idx_bookings_player ON Bookings(player_id);
