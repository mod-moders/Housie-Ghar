-- Migration 054: Add preferred_language column to Users and Players tables
ALTER TABLE Users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'ne';
ALTER TABLE Players ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'ne';
