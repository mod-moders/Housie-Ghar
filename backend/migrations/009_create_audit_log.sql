-- Migration 009: Create Audit_Log table
-- Immutable record of every state-changing action performed by any staff member.

CREATE TABLE IF NOT EXISTS Audit_Log (
  log_id              BIGSERIAL     PRIMARY KEY,
  timestamp           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  user_id             UUID          REFERENCES Users(user_id),
  user_name           VARCHAR(100)  NOT NULL,
  user_role           VARCHAR(50)   NOT NULL,
  action              VARCHAR(100)  NOT NULL,
  target_type         VARCHAR(50),
  target_id           VARCHAR(100),
  target_description  TEXT,
  ip_address          VARCHAR(45),
  user_agent          TEXT
);

-- Prevent any UPDATE or DELETE on Audit_Log
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_audit_update ON Audit_Log;
CREATE TRIGGER no_audit_update
  BEFORE UPDATE OR DELETE ON Audit_Log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON Audit_Log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON Audit_Log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON Audit_Log(action);
