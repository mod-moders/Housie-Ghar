-- Migration 025: Set Luxury Gold as default active theme
UPDATE Platform_Config 
SET config_value = 'luxury_gold' 
WHERE config_key = 'active_theme';
