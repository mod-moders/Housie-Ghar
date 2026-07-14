-- Migration 021: Platform_Config keys for the announcements manager and the
-- live-board audio caller. Inserted here (not just seeded) because
-- updateConfig is UPDATE-only — a missing key can never be edited.
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
('announcements_list', '[]', 'Lobby announcements as a JSON array of up to 5 {id, text, muted} items'),
('announcement_speed', '10', 'Seconds each lobby announcement stays on screen before rotating'),
('announcements_muted', 'false', 'Whether all lobby announcements are hidden'),
('english_caller_enabled', 'true', 'Whether the live board speaks each drawn number (TTS / MP3)')
ON CONFLICT (config_key) DO NOTHING;
