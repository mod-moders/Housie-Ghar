-- Migration 012: Financial Officer (CFO) designation
-- Phase 2 §1c / §2.1 — the Superadmin designates an Admin as Financial Officer,
-- transforming their dashboard into the Financial Hub.

ALTER TABLE Users ADD COLUMN IF NOT EXISTS is_cfo BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_cfo ON Users(is_cfo) WHERE is_cfo = TRUE;
