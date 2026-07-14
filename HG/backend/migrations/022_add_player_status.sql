-- Migration 022: account status on public player accounts, so staff can
-- suspend/reactivate a player from the dashboard.
ALTER TABLE Player_Logins ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';
