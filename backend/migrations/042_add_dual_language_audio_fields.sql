-- Migration 042: Add dual language audio fields (English & Nepali) to Number_Calls table
ALTER TABLE Number_Calls ADD COLUMN IF NOT EXISTS audio_url_en TEXT DEFAULT NULL;
ALTER TABLE Number_Calls ADD COLUMN IF NOT EXISTS audio_url_ne TEXT DEFAULT NULL;

-- Populate initial default audio_url_en from existing audio_url
UPDATE Number_Calls SET audio_url_en = audio_url WHERE audio_url IS NOT NULL AND audio_url_en IS NULL;
