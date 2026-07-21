-- 043_add_loyalty_rewards.sql
-- Loyalty layer from bookieNF.md:
--   * Bookie points  — 1 point per N tickets sold, M points redeem one free ticket.
--   * Player referrals — cumulative ladder (10 / 15 / 20, then every +10) where each
--     rung grants one free-ticket credit.
-- The house absorbs every redemption and every one is written to Reward_Redemptions
-- AND Wallet_Ledger, so reward spend is reconcilable instead of invisible margin drift.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Bookie side
-- ---------------------------------------------------------------------------
-- lifetime_tickets_sold is the ONLY accrual counter. Points are always derived as
-- floor(lifetime_tickets_sold / tickets_per_point), never stored, so a bookie who
-- sells 3 tickets then 2 tickets earns exactly 1 point — no per-booking remainder
-- to lose or double-count.
ALTER TABLE Users ADD COLUMN IF NOT EXISTS lifetime_tickets_sold  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Users ADD COLUMN IF NOT EXISTS reward_points_redeemed INTEGER NOT NULL DEFAULT 0;

-- Deliberately NOT backfilled from historical Sold bookings. Backfilling would mint
-- a retroactive free-ticket liability against bookies who sold before the program
-- existed. Everyone starts at zero; accrual begins the moment this ships.

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so guard each one explicitly to
-- keep this file re-runnable.
DO $$ BEGIN
  ALTER TABLE Users ADD CONSTRAINT users_reward_points_redeemed_non_negative
    CHECK (reward_points_redeemed >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE Users ADD CONSTRAINT users_lifetime_tickets_sold_non_negative
    CHECK (lifetime_tickets_sold >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Player side
-- ---------------------------------------------------------------------------
-- referred_by is set at signup and never changes. referral_qualified_at is the
-- idempotency key: it flips exactly once, on the player's first Sold booking, and
-- that flip is what increments the referrer's qualified_referrals.
ALTER TABLE Players ADD COLUMN IF NOT EXISTS referred_by             UUID REFERENCES Players(player_id) ON DELETE SET NULL;
ALTER TABLE Players ADD COLUMN IF NOT EXISTS referral_qualified_at   TIMESTAMPTZ;
ALTER TABLE Players ADD COLUMN IF NOT EXISTS qualified_referrals     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Players ADD COLUMN IF NOT EXISTS reward_credits_redeemed INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE Players ADD CONSTRAINT players_qualified_referrals_non_negative
    CHECK (qualified_referrals >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE Players ADD CONSTRAINT players_reward_credits_redeemed_non_negative
    CHECK (reward_credits_redeemed >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A player must never be their own referrer.
DO $$ BEGIN
  ALTER TABLE Players ADD CONSTRAINT players_no_self_referral
    CHECK (referred_by IS NULL OR referred_by <> player_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_players_referred_by ON Players(referred_by) WHERE referred_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Booking-level reward state
-- ---------------------------------------------------------------------------
-- A player spends their credit when tickets are LOCKED, so the price they are
-- quoted is the price they pay. That means an expired or rejected lock has to give
-- the credit back — player_credit_applied is the flag the refund path keys on, and
-- it flips back to FALSE on refund so a double-refund is impossible.
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS player_credit_applied BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS reward_amount_waived  DECIMAL(10,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE Bookings ADD CONSTRAINT bookings_reward_amount_waived_non_negative
    CHECK (reward_amount_waived >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Redemption audit ledger
-- ---------------------------------------------------------------------------
-- One immutable row per redemption. This is the P&L surface bookieNF.md §3 asks
-- for ("fold bookie points and referral rewards into the P&L from day one") and
-- the fraud-monitoring surface §5.8 asks for.
CREATE TABLE IF NOT EXISTS Reward_Redemptions (
  redemption_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  redeemer_type VARCHAR(10)   NOT NULL CHECK (redeemer_type IN ('Bookie', 'Player')),
  bookie_id     UUID          REFERENCES Users(user_id)           ON DELETE SET NULL,
  player_id     UUID          REFERENCES Players(player_id)       ON DELETE SET NULL,
  booking_id    UUID          REFERENCES Bookings(booking_id)     ON DELETE SET NULL,
  game_id       UUID          REFERENCES Scheduled_Games(game_id) ON DELETE SET NULL,
  units_spent   INTEGER       NOT NULL CHECK (units_spent > 0),
  amount_waived DECIMAL(10,2) NOT NULL CHECK (amount_waived >= 0),
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT reward_redemptions_actor_present CHECK (
    (redeemer_type = 'Bookie' AND bookie_id IS NOT NULL) OR
    (redeemer_type = 'Player' AND player_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_bookie  ON Reward_Redemptions(bookie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_player  ON Reward_Redemptions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_created ON Reward_Redemptions(created_at DESC);

-- One redemption per booking, whoever the redeemer is. Prevents a retry or a
-- double-submit from waiving the same booking twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_redemptions_booking
  ON Reward_Redemptions(booking_id) WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Tunable rates (bookieNF.md §5.3 — the payout ratios are explicitly expected to
-- be re-tuned once real sell-through data exists, so none of these are hardcoded)
-- ---------------------------------------------------------------------------
INSERT INTO Platform_Config (config_key, config_value, description) VALUES
  ('loyalty_rewards_enabled',          'true', 'Master switch for bookie points and player referral rewards'),
  ('bookie_tickets_per_point',         '5',    'Tickets a bookie must sell to earn 1 reward point'),
  ('bookie_points_per_free_ticket',    '10',   'Reward points a bookie spends for 1 free ticket'),
  ('referral_ladder_thresholds',       '10,15,20', 'Cumulative qualified-referral counts that each grant 1 free-ticket credit'),
  ('referral_ladder_repeat_step',      '10',   'After the last listed threshold, grant another credit every N referrals (0 disables)')
ON CONFLICT (config_key) DO NOTHING;
