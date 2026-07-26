-- Migration 050: per-ticket display nickname.
--
-- Tickets.owner_housie_name is the OWNERSHIP KEY, not just a label: my-tickets,
-- the prize-claim matcher and every "total won" query resolve a player by
-- comparing against it. So a player renaming their ticket cannot write to that
-- column — it would detach the ticket from its owner and silently break their
-- claims. This column is the label only; owner_housie_name stays untouched and
-- NULL here means "fall back to the owner name".
ALTER TABLE Tickets ADD COLUMN IF NOT EXISTS display_name VARCHAR(50);
