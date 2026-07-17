-- Add volume column to Number_Calls table
ALTER TABLE Number_Calls ADD COLUMN IF NOT EXISTS volume FLOAT DEFAULT 1.0;
