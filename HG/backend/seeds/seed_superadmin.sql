-- Seed default Superadmin and theme config
-- Default password: ChangeMe123! (real bcrypt hash, work factor 12)
-- Regenerate with: node -e "require('bcrypt').hash('ChangeMe123!',12).then(console.log)"

INSERT INTO Users (role_id, full_name, email, phone, password_hash, temp_password_required, status) VALUES
(1, 'Super Admin', 'superadmin@housieghar.local', '+919999999999', '$2b$12$zV/8efOtowujRPNCN5nH0uGvtaPnC6J1qxUeZrwh9amOrWAJ2RlRm', TRUE, 'Active')
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
