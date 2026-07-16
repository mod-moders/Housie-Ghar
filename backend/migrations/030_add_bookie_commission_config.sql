-- Migration 030: Add bookie commission config
INSERT INTO Platform_Config (config_key, config_value, description)
VALUES ('bookie_commission_per_ticket', '10', 'Default bookie commission in INR per ticket (used for fund recharges)')
ON CONFLICT (config_key) DO NOTHING;
