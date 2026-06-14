-- Dev seed: Lucky Number ("for now")
-- ----------------------------------------------------------------------------
-- Populates a handful of COMPLETED games with claimed prizes so the public
-- /api/stats/lucky-number endpoint (and the lobby card) shows a real value in
-- development. The lucky number is the most frequent WINNING TICKET NUMBER over
-- the last 60 completed games in the current 12-day cycle; here ticket #7 wins
-- 16 prizes vs #23 (8) and #41 (6), so the lucky number resolves to 7.
--
-- Dates are in early June 2026 — after the cycle epoch (2026-06-01) and before
-- the current cycle start (2026-06-13T00:00Z), so they fall inside the sample
-- window now and in every later cycle.
--
-- Idempotent: re-running deletes these five fixed games first (cascading to
-- their tickets + prizes). To remove the seed entirely, run just the DELETE.
-- These games are Completed, so they never appear on the lobby's Live/Upcoming
-- lists; their winners do show on the public Hall of Fame / Winners page.
-- ----------------------------------------------------------------------------

DELETE FROM Scheduled_Games WHERE game_id IN (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000f3',
  '00000000-0000-0000-0000-0000000000f4',
  '00000000-0000-0000-0000-0000000000f5'
);

-- 1. Completed games -----------------------------------------------------------
INSERT INTO Scheduled_Games
  (game_id, title, scheduled_at, total_tickets, ticket_price, game_status, started_at, completed_at)
VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'Sohra Sunday Special',  '2026-06-04T18:00:00Z', 90, 50.00, 'Completed', '2026-06-04T18:00:00Z', '2026-06-04T19:30:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Shillong Friday Night', '2026-06-05T18:00:00Z', 90, 50.00, 'Completed', '2026-06-05T18:00:00Z', '2026-06-05T19:30:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Jowai Weekend Draw',    '2026-06-06T18:00:00Z', 90, 50.00, 'Completed', '2026-06-06T18:00:00Z', '2026-06-06T19:30:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Hills Midweek Bonanza', '2026-06-08T18:00:00Z', 90, 50.00, 'Completed', '2026-06-08T18:00:00Z', '2026-06-08T19:30:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Laitumkhrah Late Show', '2026-06-09T18:00:00Z', 90, 50.00, 'Completed', '2026-06-09T18:00:00Z', '2026-06-09T19:30:00Z');

-- 2. Winning tickets (#7, #23, #41 per game). Grid is unused by the stat, so a
--    shape-valid empty grid is fine; these games are never rendered as tickets.
INSERT INTO Tickets (game_id, ticket_number, grid_data, status)
SELECT g.game_id, tn.ticket_number, '{"row1":[],"row2":[],"row3":[]}'::jsonb, 'Sold'
FROM (VALUES
  ('00000000-0000-0000-0000-0000000000f1'::uuid),
  ('00000000-0000-0000-0000-0000000000f2'::uuid),
  ('00000000-0000-0000-0000-0000000000f3'::uuid),
  ('00000000-0000-0000-0000-0000000000f4'::uuid),
  ('00000000-0000-0000-0000-0000000000f5'::uuid)
) AS g(game_id)
CROSS JOIN (VALUES (7), (23), (41)) AS tn(ticket_number);

-- 3. Claimed prizes — distribution makes #7 the clear lucky number (16/8/6).
--    Amount by pattern: Full House 2000, Early Five 300, others 500.
INSERT INTO Prize_Pool
  (game_id, pattern_name, prize_amount, claimed, winner_ticket_id, winner_housie_name, claimed_at, split_count, amount_per_winner)
SELECT
  v.game_id::uuid,
  v.pattern,
  CASE v.pattern WHEN 'Full House' THEN 2000.00 WHEN 'Early Five' THEN 300.00 ELSE 500.00 END,
  TRUE,
  t.ticket_id,
  CASE v.tnum WHEN 7 THEN 'Lucky Seven' WHEN 23 THEN 'Kong Daphi' ELSE 'Bah Khrawbor' END,
  v.at::timestamptz,
  1,
  CASE v.pattern WHEN 'Full House' THEN 2000.00 WHEN 'Early Five' THEN 300.00 ELSE 500.00 END
FROM (VALUES
  -- game f1
  ('00000000-0000-0000-0000-0000000000f1', 'Early Five',   7,  '2026-06-04T18:20:00Z'),
  ('00000000-0000-0000-0000-0000000000f1', 'Top Line',     7,  '2026-06-04T18:35:00Z'),
  ('00000000-0000-0000-0000-0000000000f1', 'Middle Line',  7,  '2026-06-04T18:50:00Z'),
  ('00000000-0000-0000-0000-0000000000f1', 'Bottom Line',  23, '2026-06-04T19:05:00Z'),
  ('00000000-0000-0000-0000-0000000000f1', 'Four Corners', 23, '2026-06-04T19:18:00Z'),
  ('00000000-0000-0000-0000-0000000000f1', 'Full House',   7,  '2026-06-04T19:30:00Z'),
  -- game f2
  ('00000000-0000-0000-0000-0000000000f2', 'Early Five',   41, '2026-06-05T18:20:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Top Line',     7,  '2026-06-05T18:35:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Middle Line',  41, '2026-06-05T18:50:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Bottom Line',  41, '2026-06-05T19:05:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Four Corners', 7,  '2026-06-05T19:18:00Z'),
  ('00000000-0000-0000-0000-0000000000f2', 'Full House',   7,  '2026-06-05T19:30:00Z'),
  -- game f3
  ('00000000-0000-0000-0000-0000000000f3', 'Early Five',   7,  '2026-06-06T18:20:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Top Line',     23, '2026-06-06T18:35:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Middle Line',  23, '2026-06-06T18:50:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Bottom Line',  23, '2026-06-06T19:05:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Four Corners', 23, '2026-06-06T19:18:00Z'),
  ('00000000-0000-0000-0000-0000000000f3', 'Full House',   7,  '2026-06-06T19:30:00Z'),
  -- game f4
  ('00000000-0000-0000-0000-0000000000f4', 'Early Five',   41, '2026-06-08T18:20:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Top Line',     41, '2026-06-08T18:35:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Middle Line',  7,  '2026-06-08T18:50:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Bottom Line',  7,  '2026-06-08T19:05:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Four Corners', 7,  '2026-06-08T19:18:00Z'),
  ('00000000-0000-0000-0000-0000000000f4', 'Full House',   7,  '2026-06-08T19:30:00Z'),
  -- game f5
  ('00000000-0000-0000-0000-0000000000f5', 'Early Five',   7,  '2026-06-09T18:20:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Top Line',     7,  '2026-06-09T18:35:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Middle Line',  23, '2026-06-09T18:50:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Bottom Line',  23, '2026-06-09T19:05:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Four Corners', 41, '2026-06-09T19:18:00Z'),
  ('00000000-0000-0000-0000-0000000000f5', 'Full House',   7,  '2026-06-09T19:30:00Z')
) AS v(game_id, pattern, tnum, at)
JOIN Tickets t ON t.game_id = v.game_id::uuid AND t.ticket_number = v.tnum;
