-- Migration 042: Add dual language audio fields (English & Nepali) to Number_Calls table
ALTER TABLE Number_Calls ADD COLUMN IF NOT EXISTS audio_url_en TEXT DEFAULT NULL;
ALTER TABLE Number_Calls ADD COLUMN IF NOT EXISTS audio_url_ne TEXT DEFAULT NULL;

-- Existing uploaded audio files for numbers 1-90 are NEPALI: map audio_url to audio_url_ne
UPDATE Number_Calls SET audio_url_ne = audio_url WHERE audio_url IS NOT NULL;
UPDATE Number_Calls SET audio_url_en = NULL WHERE audio_url_en IS NOT NULL AND audio_url_ne = audio_url_en;

-- Existing Intro message (welcome_voice_url) is NEPALI: map to welcome_voice_url_ne
INSERT INTO Platform_Config (config_key, config_value)
SELECT 'welcome_voice_url_ne', config_value FROM Platform_Config WHERE config_key = 'welcome_voice_url' AND config_value IS NOT NULL AND config_value != ''
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;

-- Existing Outro message (instruction_voice_url) is ENGLISH: map to instruction_voice_url_en
INSERT INTO Platform_Config (config_key, config_value)
SELECT 'instruction_voice_url_en', config_value FROM Platform_Config WHERE config_key = 'instruction_voice_url' AND config_value IS NOT NULL AND config_value != ''
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
