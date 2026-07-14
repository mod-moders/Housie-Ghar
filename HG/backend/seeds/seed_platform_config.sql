-- Platform_Config defaults for local dev — mirrors the keys seedProd.ts creates
-- in production. updateConfig only UPDATEs existing keys, so without these rows
-- the Superadmin settings screens have nothing to edit on a fresh dev database.
-- ON CONFLICT DO NOTHING keeps re-runs from clobbering values changed in the UI.

INSERT INTO Platform_Config (config_key, config_value, description) VALUES
  ('support_email', 'support@housieghar.com', 'Support email address shown to players'),
  ('support_phone', '+91-XXXXXXXXXX', 'Support phone number shown to players'),
  ('marquee_text', 'Welcome to Housie Ghar!', 'Scrolling text banner on the homepage'),
  ('terms_text', 'Housie Ghar is for recreational play. All transactions are peer-to-peer.', 'Platform Terms and Conditions'),
  ('lock_duration_minutes', '10', 'Number of minutes a ticket booking soft-lock is held'),
  ('low_balance_threshold', '500', 'Alert threshold for Agent wallet balance'),
  ('spam_flag_threshold', '3', 'Number of spam flags before a player is soft-banned'),
  ('announcements_list', '[]', 'Lobby announcements as a JSON array of up to 5 {id, text, muted} items'),
  ('announcement_speed', '10', 'Seconds each lobby announcement stays on screen before rotating'),
  ('announcements_muted', 'false', 'Whether all lobby announcements are hidden'),
  ('english_caller_enabled', 'true', 'Whether the live board speaks each drawn number (TTS / MP3)')
ON CONFLICT (config_key) DO NOTHING;
