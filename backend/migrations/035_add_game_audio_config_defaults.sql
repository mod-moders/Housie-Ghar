-- Migration 035: Seed the game-audio Platform_Config keys that were never inserted.
--
-- LiveBoardContent.tsx gates the ENTIRE audio system (number calls, greeting,
-- celebration, background music) on `config.english_caller_enabled === "true"`
-- (useGameAudio.ts englishCallerEnabled param). getPublicConfig only returns keys
-- already present in Platform_Config, and updateConfig only UPDATEs pre-existing
-- keys ("config keys are not free-form" — an INSERT was never wired up). Since no
-- seed or prior migration ever inserted 'english_caller_enabled' (or the newer
-- audio keys added alongside it: cage/celebration sound toggles, welcome/
-- instruction voice url+text, background music url/enabled/volume, and the master
-- calls volume), every one of these reads back as undefined:
--   - englishCallerEnabled is permanently false -> no game audio plays anywhere,
--     for any game, for any user (staff live HUD or player live board).
--   - the Superadmin's "LIVE Game Audio Calls" checkbox in CallVoiceSettings can
--     never be turned on either: its PUT hits rowCount === 0 -> 400 "Unknown
--     config key" -> the checkbox silently reverts.
-- Defaults below match the values the frontend already falls back to inline
-- (see useGameAudio.ts / CallVoiceSettings.tsx) so behavior doesn't jump the
-- moment this migration runs.
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
  ('english_caller_enabled', 'true', 'Master switch for live English number-caller audio (MP3/TTS) in games'),
  ('cage_sound_enabled', 'true', 'Enable/disable the ball-draw cage sound effect'),
  ('celebration_sound_enabled', 'true', 'Enable/disable the prize-win celebration sound'),
  ('welcome_voice_url', '', 'Optional MP3 URL for the game-start welcome announcement (falls back to TTS)'),
  ('instruction_voice_url', '', 'Optional MP3 URL for the game-start instructions announcement (falls back to TTS)'),
  ('welcome_voice_text', 'Welcome to Housie Ghar. The game is starting now! Best of luck.', 'TTS fallback text for the welcome announcement'),
  ('instruction_voice_text', 'Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.', 'TTS fallback text for the instructions announcement'),
  ('background_music_url', '', 'Optional looping background music URL played while a game is live'),
  ('background_music_enabled', 'false', 'Enable/disable looping background music during live games'),
  ('background_music_volume', '0.15', 'Background music volume (0.0-1.0)'),
  ('master_calls_volume', '1.0', 'Master volume multiplier applied to every number-call audio (0.0-1.0)')
ON CONFLICT (config_key) DO NOTHING;
