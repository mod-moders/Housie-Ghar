-- Migration 021: Add receive_overflow column to Users table
ALTER TABLE Users ADD COLUMN IF NOT EXISTS receive_overflow BOOLEAN DEFAULT TRUE;
