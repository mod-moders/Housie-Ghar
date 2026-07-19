-- Migration 041: Add formatted tracking IDs and auto-increment sequences for all major entities

-- 1. Helper functions for calculating letter series and formatted IDs
CREATE OR REPLACE FUNCTION get_series_code(seq_val BIGINT) RETURNS TEXT AS $$
DECLARE
    block_idx BIGINT;
    letter_code TEXT := '';
    temp_idx BIGINT;
BEGIN
    block_idx := (seq_val - 1) / 999;
    temp_idx := block_idx;
    LOOP
        letter_code := chr(65 + (temp_idx % 26)::integer) || letter_code;
        temp_idx := (temp_idx / 26) - 1;
        EXIT WHEN temp_idx < 0;
    END LOOP;
    RETURN letter_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION format_custom_id(prefix TEXT, seq_val BIGINT) RETURNS TEXT AS $$
DECLARE
    num_part TEXT;
BEGIN
    num_part := lpad((((seq_val - 1) % 999) + 1)::text, 3, '0');
    RETURN prefix || get_series_code(seq_val) || num_part;
END;
$$ LANGUAGE plpgsql;

-- 2. Create sequences for each entity
CREATE SEQUENCE IF NOT EXISTS seq_booking_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_topup_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_claim_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_bookie_app_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_staff_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_player_id START WITH 1;

-- 3. Add formatted ID columns with UNIQUE constraints
ALTER TABLE Bookings ADD COLUMN IF NOT EXISTS formatted_booking_id VARCHAR(50) UNIQUE;
ALTER TABLE TopUp_Requests ADD COLUMN IF NOT EXISTS formatted_request_id VARCHAR(50) UNIQUE;
ALTER TABLE Prize_Pool ADD COLUMN IF NOT EXISTS formatted_claim_id VARCHAR(50) UNIQUE;
ALTER TABLE Bookie_Applications ADD COLUMN IF NOT EXISTS formatted_app_id VARCHAR(50) UNIQUE;
ALTER TABLE Users ADD COLUMN IF NOT EXISTS staff_code VARCHAR(50) UNIQUE;
ALTER TABLE Players ADD COLUMN IF NOT EXISTS player_code VARCHAR(50) UNIQUE;

-- 4. Backfill existing records in order of creation
DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT booking_id FROM Bookings WHERE formatted_booking_id IS NULL ORDER BY locked_at ASC, booking_id ASC LOOP
        new_seq := nextval('seq_booking_id');
        UPDATE Bookings SET formatted_booking_id = format_custom_id('HGTKG', new_seq) WHERE booking_id = r.booking_id;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT request_id FROM TopUp_Requests WHERE formatted_request_id IS NULL ORDER BY requested_at ASC, request_id ASC LOOP
        new_seq := nextval('seq_topup_id');
        UPDATE TopUp_Requests SET formatted_request_id = format_custom_id('HGWR', new_seq) WHERE request_id = r.request_id;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT prize_id FROM Prize_Pool WHERE formatted_claim_id IS NULL ORDER BY prize_id ASC LOOP
        new_seq := nextval('seq_claim_id');
        UPDATE Prize_Pool SET formatted_claim_id = format_custom_id('HGCR', new_seq) WHERE prize_id = r.prize_id;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT application_id FROM Bookie_Applications WHERE formatted_app_id IS NULL ORDER BY created_at ASC, application_id ASC LOOP
        new_seq := nextval('seq_bookie_app_id');
        UPDATE Bookie_Applications SET formatted_app_id = format_custom_id('HGBR', new_seq) WHERE application_id = r.application_id;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT user_id FROM Users WHERE staff_code IS NULL ORDER BY created_at ASC, user_id ASC LOOP
        new_seq := nextval('seq_staff_id');
        UPDATE Users SET staff_code = format_custom_id('HGST', new_seq) WHERE user_id = r.user_id;
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
    new_seq BIGINT;
BEGIN
    FOR r IN SELECT player_id FROM Players WHERE player_code IS NULL ORDER BY registered_at ASC, player_id ASC LOOP
        new_seq := nextval('seq_player_id');
        UPDATE Players SET player_code = format_custom_id('HGPL', new_seq) WHERE player_id = r.player_id;
    END LOOP;
END $$;

-- 5. Set default expressions for automatic generation on future INSERTS
ALTER TABLE Bookings ALTER COLUMN formatted_booking_id SET DEFAULT format_custom_id('HGTKG', nextval('seq_booking_id'));
ALTER TABLE TopUp_Requests ALTER COLUMN formatted_request_id SET DEFAULT format_custom_id('HGWR', nextval('seq_topup_id'));
ALTER TABLE Prize_Pool ALTER COLUMN formatted_claim_id SET DEFAULT format_custom_id('HGCR', nextval('seq_claim_id'));
ALTER TABLE Bookie_Applications ALTER COLUMN formatted_app_id SET DEFAULT format_custom_id('HGBR', nextval('seq_bookie_app_id'));
ALTER TABLE Users ALTER COLUMN staff_code SET DEFAULT format_custom_id('HGST', nextval('seq_staff_id'));
ALTER TABLE Players ALTER COLUMN player_code SET DEFAULT format_custom_id('HGPL', nextval('seq_player_id'));
