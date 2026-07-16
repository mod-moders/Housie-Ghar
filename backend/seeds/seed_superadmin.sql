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
('financial_officer_whatsapp', '+91XXXXXXXXXX', 'Financial Officer WhatsApp number for prize claims (format: +91XXXXXXXXXX)')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;
