-- Add fields for 5 announcements, speed, and muting control
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
('announcements_list', '[]', 'List of announcements as a JSON array of up to 5 items'),
('announcement_speed', '10', 'News sliding speed duration in seconds'),
('announcements_muted', 'false', 'Whether all homepage announcements are muted/hidden')
ON CONFLICT (config_key) DO NOTHING;
