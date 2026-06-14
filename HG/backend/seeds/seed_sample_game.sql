-- Seed sample game for testing
-- We will insert a game, some prize pools, and generate tickets via code.
-- This script inserts the sample game record if it doesn't exist.

INSERT INTO Scheduled_Games (game_id, title, scheduled_at, total_tickets, ticket_price, game_status) VALUES
('00000000-0000-0000-0000-000000000001', 'Welcome Mega Draw', NOW() + INTERVAL '2 hours', 120, 50.00, 'Scheduled')
ON CONFLICT (game_id) DO NOTHING;

INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed) VALUES
('00000000-0000-0000-0000-000000000001', 'Early Five', 500.00, FALSE),
('00000000-0000-0000-0000-000000000001', 'Top Line', 1000.00, FALSE),
('00000000-0000-0000-0000-000000000001', 'Middle Line', 1000.00, FALSE),
('00000000-0000-0000-0000-000000000001', 'Bottom Line', 1000.00, FALSE),
('00000000-0000-0000-0000-000000000001', 'Four Corners', 500.00, FALSE),
('00000000-0000-0000-0000-000000000001', 'Full House', 2000.00, FALSE)
ON CONFLICT (game_id, pattern_name) DO NOTHING;

-- Second game for testing the ticket-buying flow (always Scheduled, never auto-started)
INSERT INTO Scheduled_Games (game_id, title, scheduled_at, total_tickets, ticket_price, game_status) VALUES
('00000000-0000-0000-0000-000000000002', 'Friday Night Special', NOW() + INTERVAL '4 hours', 90, 30.00, 'Scheduled')
ON CONFLICT (game_id) DO NOTHING;

INSERT INTO Prize_Pool (game_id, pattern_name, prize_amount, claimed) VALUES
('00000000-0000-0000-0000-000000000002', 'Early Five',   300.00, FALSE),
('00000000-0000-0000-0000-000000000002', 'Top Line',     600.00, FALSE),
('00000000-0000-0000-0000-000000000002', 'Middle Line',  600.00, FALSE),
('00000000-0000-0000-0000-000000000002', 'Bottom Line',  600.00, FALSE),
('00000000-0000-0000-0000-000000000002', 'Four Corners', 300.00, FALSE),
('00000000-0000-0000-0000-000000000002', 'Full House',  1200.00, FALSE)
ON CONFLICT (game_id, pattern_name) DO NOTHING;
