-- Migration 026: Add username column, make email nullable

ALTER TABLE Users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;

-- Populate username for existing users
UPDATE Users SET username = email WHERE username IS NULL;

-- Set constraints
ALTER TABLE Users ALTER COLUMN username SET NOT NULL;
ALTER TABLE Users ALTER COLUMN email DROP NOT NULL;
