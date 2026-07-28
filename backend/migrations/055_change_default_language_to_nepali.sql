-- Migration 055: Set default preferred_language to 'ne' and update existing rows
ALTER TABLE Users ALTER COLUMN preferred_language SET DEFAULT 'ne';
ALTER TABLE Players ALTER COLUMN preferred_language SET DEFAULT 'ne';
UPDATE Users SET preferred_language = 'ne' WHERE preferred_language IS NULL OR preferred_language = 'en';
UPDATE Players SET preferred_language = 'ne' WHERE preferred_language IS NULL OR preferred_language = 'en';
