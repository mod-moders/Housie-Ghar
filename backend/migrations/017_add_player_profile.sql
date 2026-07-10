-- Migration 017: Add Player Profile and Preferences

ALTER TABLE Players
ADD COLUMN phone VARCHAR(20),
ADD COLUMN email VARCHAR(255),
ADD COLUMN theme_preference VARCHAR(50),
ADD COLUMN sound_enabled BOOLEAN DEFAULT TRUE;
