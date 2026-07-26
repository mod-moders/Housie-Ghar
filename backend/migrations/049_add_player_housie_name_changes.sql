-- Migration 049: Add housie_name_changes column to Players to track Housie Name edits
ALTER TABLE Players ADD COLUMN IF NOT EXISTS housie_name_changes INTEGER NOT NULL DEFAULT 0;
