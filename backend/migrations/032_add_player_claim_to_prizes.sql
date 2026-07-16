-- Migration 032: Add player claim tracking to Prize_Pool
-- Add columns to track when player claims their prize and when financial admin marks as disbursed

ALTER TABLE Prize_Pool
  ADD COLUMN IF NOT EXISTS player_claimed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS player_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disbursed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disbursed_by UUID REFERENCES Users(user_id);

-- Add index for faster queries on player claims
CREATE INDEX IF NOT EXISTS idx_prize_pool_player_claimed ON Prize_Pool(game_id, player_claimed);
CREATE INDEX IF NOT EXISTS idx_prize_pool_disbursed ON Prize_Pool(game_id, disbursed);