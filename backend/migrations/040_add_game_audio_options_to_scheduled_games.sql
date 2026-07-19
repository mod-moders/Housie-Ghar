-- Add bg_music_enabled, intro_mode, and outro_mode columns to Scheduled_Games
ALTER TABLE Scheduled_Games 
ADD COLUMN IF NOT EXISTS bg_music_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS intro_mode VARCHAR(10) DEFAULT 'Audio' CHECK (intro_mode IN ('TTS', 'Audio', 'Text')),
ADD COLUMN IF NOT EXISTS outro_mode VARCHAR(10) DEFAULT 'TTS' CHECK (outro_mode IN ('TTS', 'Audio', 'Text'));
