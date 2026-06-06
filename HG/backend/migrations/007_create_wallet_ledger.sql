-- Migration 007: Create Wallet_Ledger table
-- Every financial transaction affecting an Agent's digital wallet.

CREATE TABLE IF NOT EXISTS Wallet_Ledger (
  entry_id         SERIAL        PRIMARY KEY,
  agent_id         UUID          NOT NULL REFERENCES Users(user_id),
  transaction_type VARCHAR(20)   NOT NULL,
  amount           DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  balance_after    DECIMAL(10,2) NOT NULL,
  reference_type   VARCHAR(50),
  reference_id     VARCHAR(100),
  description      TEXT,
  performed_by     UUID          REFERENCES Users(user_id),
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_agent ON Wallet_Ledger(agent_id);

-- TopUp_Requests table
-- Tracks Agent wallet top-up requests through their lifecycle.

CREATE TABLE IF NOT EXISTS TopUp_Requests (
  request_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             UUID          NOT NULL REFERENCES Users(user_id),
  requested_amount     DECIMAL(10,2) NOT NULL CHECK (requested_amount > 0),
  payment_reference    VARCHAR(100)  NOT NULL,
  payment_method       VARCHAR(100),
  proof_screenshot_url VARCHAR(500),
  request_status       VARCHAR(20)   DEFAULT 'Pending',
  requested_at         TIMESTAMPTZ   DEFAULT NOW(),
  reviewed_by          UUID          REFERENCES Users(user_id),
  reviewed_at          TIMESTAMPTZ,
  reviewer_notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_topup_agent ON TopUp_Requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_topup_status ON TopUp_Requests(request_status);
