-- Seed platform config and the default Superadmin.
--
-- NOTE: the Superadmin *user* is no longer created here. It is seeded by
-- src/db/seed.ts, which bcrypt-hashes the password from the SUPERADMIN_EMAIL /
-- SUPERADMIN_TEMP_PASSWORD environment variables at seed time. This keeps a real
-- credential out of version control. (temp_password_required is set TRUE so the
-- first login forces a password change.)

-- Seed platform config
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
('support_email', 'support@housieghar.com', 'Support email address shown to players'),
('support_phone', '+91-XXXXXXXXXX', 'Support phone number shown to players'),
('marquee_text', 'Welcome to Housie Ghar! Next Mega Draw this Sunday at 8 PM!', 'Scrolling text banner on the homepage'),
('terms_text', 'Housie Ghar is for recreational play. All transactions are peer-to-peer.', 'Platform Terms and Conditions'),
('lock_duration_minutes', '10', 'Number of minutes a ticket booking soft-lock is held'),
('low_balance_threshold', '500', 'Alert threshold for Agent wallet balance'),
('spam_flag_threshold', '3', 'Number of spam flags before a player is soft-banned'),
('active_theme', 'luxury_gold', 'The globally active UI theme'),
('announcement_text', 'Welcome to Housie Ghar! Join our live games every day.', 'Instant announcement shown on homepage'),
('site_title', 'Housie Ghar', 'The title of the website'),
('maintenance_mode', 'false', 'Enable maintenance mode to lock the site'),
('financial_officer_whatsapp', '+91XXXXXXXXXX', 'Financial Officer WhatsApp number for prize claims (format: +91XXXXXXXXXX)'),
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
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;
