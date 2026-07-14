-- Seed default Superadmin and platform config
-- Default password: Enterhg@01 (real bcrypt hash, work factor 12)
-- Regenerate with: node -e "require('bcrypt').hash('Enterhg@01',12).then(console.log)"

INSERT INTO Users (role_id, full_name, email, phone, password_hash, temp_password_required, status) VALUES
(1, 'Super Admin', 'superadmin@housieghar.in', '+919999999999', '$2b$12$iGA4WNJA84o5xEKTUc7EKeLmgBm21qOaB4pN0nq9q4daNAKg.4E06', TRUE, 'Active')
ON CONFLICT (email) DO NOTHING;

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
('maintenance_mode', 'false', 'Enable maintenance mode to lock the site')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;
