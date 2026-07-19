-- Add call_mode column to Scheduled_Games table
ALTER TABLE Scheduled_Games 
ADD COLUMN IF NOT EXISTS call_mode VARCHAR(10) DEFAULT 'TTS' CHECK (call_mode IN ('TTS', 'Audio', 'Text'));
