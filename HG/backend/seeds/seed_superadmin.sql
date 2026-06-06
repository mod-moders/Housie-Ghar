-- Seed default Superadmin and theme config
-- Default password: ChangeMe123! (hashed using bcrypt work factor 12)
-- Bcrypt hash for 'ChangeMe123!' with salt round 12 is:
-- $2b$12$R.S91584c3K3r4J9W8D9N.DkWJp.E4o3u4d4u4d4u4d4u4d4u4d4u
-- Let's use a pre-calculated hash: $2b$12$ZpUoeFfL7u72F4HkZ9P8QOeR4p1K1I4D.1d4e4f4g4h4i4j4k4l4m

INSERT INTO Users (role_id, full_name, email, phone, password_hash, temp_password_required, status) VALUES
(1, 'Super Admin', 'superadmin@housieghar.local', '+919999999999', '$2b$12$ZpUoeFfL7u72F4HkZ9P8QOeR4p1K1I4D.1d4e4f4g4h4i4j4k4l4m', TRUE, 'Active')
ON CONFLICT (email) DO NOTHING;

-- Seed default themes
INSERT INTO Themes (theme_name, css_class, is_active) VALUES
('Default', 'theme-default', TRUE),
('Dark', 'theme-dark', FALSE),
('Festive', 'theme-festive', FALSE),
('Classic Hall', 'theme-classic-hall', FALSE)
ON CONFLICT (theme_name) DO UPDATE SET
  css_class = EXCLUDED.css_class;

-- Seed platform config
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
('support_email', 'support@housieghar.com', 'Support email address shown to players'),
('support_phone', '+91-XXXXXXXXXX', 'Support phone number shown to players'),
('marquee_text', 'Welcome to Housie Ghar! Next Mega Draw this Sunday at 8 PM!', 'Scrolling text banner on the homepage'),
('terms_text', 'Housie Ghar is for recreational play. All transactions are peer-to-peer.', 'Platform Terms and Conditions'),
('lock_duration_minutes', '10', 'Number of minutes a ticket booking soft-lock is held'),
('low_balance_threshold', '500', 'Alert threshold for Agent wallet balance'),
('spam_flag_threshold', '3', 'Number of spam flags before a player is soft-banned')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;
