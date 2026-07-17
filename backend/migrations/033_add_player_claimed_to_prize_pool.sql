-- Migration 033: Add player_claimed and disbursed columns to Prize_Pool
-- Tracks whether the winning player has claimed their prize and if it's been disbursed

ALTER TABLE Prize_Pool 
ADD COLUMN IF NOT EXISTS player_claimed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS player_claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disbursed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disbursed_by UUID REFERENCES Users(user_id);