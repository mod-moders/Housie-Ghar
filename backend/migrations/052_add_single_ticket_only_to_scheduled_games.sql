-- Migration 052: Add single ticket only toggle to Scheduled_Games
ALTER TABLE Scheduled_Games ADD COLUMN IF NOT EXISTS single_ticket_only BOOLEAN DEFAULT FALSE;
