-- Migration 044: Update Booking ID Format to HGB-Letters-Number (e.g. HGB-A-001)

-- 1. Create specialized booking ID formatting function
CREATE OR REPLACE FUNCTION format_booking_id(seq_val BIGINT) RETURNS TEXT AS $$
DECLARE
    num_part TEXT;
BEGIN
    num_part := lpad((((seq_val - 1) % 999) + 1)::text, 3, '0');
    RETURN 'HGB-' || get_series_code(seq_val) || '-' || num_part;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the default expression for formatted_booking_id column
ALTER TABLE Bookings ALTER COLUMN formatted_booking_id SET DEFAULT format_booking_id(nextval('seq_booking_id'));

-- 3. Backfill/update existing booking records to use the new HGB-Letters-Number format
DO $$
DECLARE
    r RECORD;
    seq_val BIGINT;
BEGIN
    seq_val := 0;
    FOR r IN SELECT booking_id FROM Bookings ORDER BY locked_at ASC, booking_id ASC LOOP
        seq_val := seq_val + 1;
        UPDATE Bookings SET formatted_booking_id = format_booking_id(seq_val) WHERE booking_id = r.booking_id;
    END LOOP;
    
    -- Sync sequence
    IF seq_val > 0 THEN
        PERFORM setval('seq_booking_id', seq_val);
    END IF;
END $$;
