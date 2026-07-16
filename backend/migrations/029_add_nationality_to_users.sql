-- Migration 029: Add nationality to Users table
ALTER TABLE Users ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);

-- Backfill nationality from town
UPDATE Users SET nationality = town WHERE nationality IS NULL AND town IS NOT NULL;
