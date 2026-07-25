-- Migration 047: Harden player identity
--
-- Two independent fixes, both prerequisites for closing the launch-blocking
-- account-takeover / prize-theft paths:
--
--   1. Case-insensitive housie names. `housie_name` was UNIQUE on the raw text,
--      so 'RajaBabu' and 'rajababu' were both insertable — while every downstream
--      consumer (prize claim matching, leaderboard joins, stats) compares
--      LOWERCASED. That let an attacker register a case variant of a winner's
--      name and claim their prizes.
--
--   2. Player_Devices. Signup is deliberately passwordless, which meant anyone
--      who read a housie name off the public leaderboard could log in as that
--      player. Login now requires either a password or a previously-seen device.

-- ---------------------------------------------------------------------------
-- 1. Resolve any pre-existing case collisions before adding the unique index.
--    The earliest-registered account keeps the name; later ones get a numeric
--    suffix so the index can be built without data loss. Renamed players keep
--    their player_id/player_code, so tickets, bookings and prizes stay attached.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    new_name TEXT;
    suffix INT;
BEGIN
    FOR r IN
        SELECT player_id, housie_name
        FROM (
            SELECT player_id,
                   housie_name,
                   ROW_NUMBER() OVER (
                       PARTITION BY LOWER(TRIM(housie_name))
                       ORDER BY registered_at ASC, player_id ASC
                   ) AS rn
            FROM Players
        ) ranked
        WHERE rn > 1
    LOOP
        suffix := 1;
        LOOP
            new_name := LEFT(r.housie_name, 16) || '_' || suffix::text;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER(new_name)
            );
            suffix := suffix + 1;
        END LOOP;

        UPDATE Players SET housie_name = new_name WHERE player_id = r.player_id;
        RAISE NOTICE 'Migration 047: renamed duplicate housie_name % -> %', r.housie_name, new_name;
    END LOOP;
END $$;

-- Case-insensitive uniqueness. The original raw-text UNIQUE constraint from
-- migration 016 stays; this is strictly narrower, so it subsumes it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_housie_name_lower
    ON Players (LOWER(TRIM(housie_name)));

-- ---------------------------------------------------------------------------
-- 2. Known-device registry for passwordless accounts.
--    device_id is stored as a SHA-256 hash, never in the clear: it functions as
--    a bearer credential for a password-less account, so a DB read must not be
--    enough to impersonate a device.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Player_Devices (
    device_row_id   SERIAL PRIMARY KEY,
    player_id       UUID NOT NULL REFERENCES Players(player_id) ON DELETE CASCADE,
    device_hash     CHAR(64) NOT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent      TEXT,
    UNIQUE (player_id, device_hash)
);

CREATE INDEX IF NOT EXISTS idx_player_devices_player ON Player_Devices(player_id);
