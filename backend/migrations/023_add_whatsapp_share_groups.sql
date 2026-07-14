-- Superadmin-managed WhatsApp destinations for operator winner announcements.
INSERT INTO Platform_Config (config_key, config_value, description)
VALUES (
  'whatsapp_share_groups',
  '[]',
  'JSON list of approved WhatsApp group destinations for operator winner announcements'
)
ON CONFLICT (config_key) DO NOTHING;
