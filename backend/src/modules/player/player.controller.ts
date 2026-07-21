import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { env } from '../../config/env';

export async function signup(req: Request, res: Response): Promise<void> {
  const { full_name, housie_name, ref_promoter_id } = req.body;

  if (!housie_name) {
    res.status(400).json({ message: 'Housie name is required' });
    return;
  }

  const cleanHousieName = housie_name.trim();
  const cleanFullName = full_name ? full_name.trim() : null;

  if (cleanHousieName.length < 3 || cleanHousieName.length > 20) {
    res.status(400).json({ message: 'Housie name must be between 3 and 20 characters' });
    return;
  }

  try {
    // 1. Check uniqueness in Players
    const checkPlayer = await pool.query('SELECT player_id FROM Players WHERE housie_name = $1', [cleanHousieName]);
    if ((checkPlayer.rowCount ?? 0) > 0) {
      res.status(409).json({ message: 'Housie name is already taken. Please choose another one.' });
      return;
    }

    // 2. Insert player
    const result = await pool.query(
      'INSERT INTO Players (full_name, housie_name) VALUES ($1, $2) RETURNING player_id, player_code, full_name, housie_name',
      [cleanFullName, cleanHousieName]
    );

    const player = result.rows[0];

    // 3. Check for promoter referral linkage
    if (ref_promoter_id) {
      try {
        await pool.query(
          'INSERT INTO Promoter_Referrals (promoter_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [ref_promoter_id, player.player_id]
        );
      } catch (err) {
        console.error('Error saving promoter referral linkage:', err);
      }
    }

    // 4. Sign JWT
    const payload = {
      playerId: player.player_id,
      fullName: player.full_name,
      housieName: player.housie_name,
    };

    const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
      algorithm: 'RS256' as any,
      expiresIn: '3650d', // Persistent player session duration (10 years)
    });

    // 5. Store in HttpOnly cookie
    res.cookie('hg_player_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3650 * 24 * 60 * 60 * 1000, // 10 years
    });

    res.status(201).json({ token, player });
  } catch (error) {
    console.error('Player signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { housie_name, password } = req.body;

  if (!housie_name) {
    res.status(400).json({ message: 'Housie name is required' });
    return;
  }

  const cleanHousieName = housie_name.trim();

  try {
    // 1. Fetch player
    const result = await pool.query(
      'SELECT player_id, player_code, full_name, housie_name, password_hash, status FROM Players WHERE housie_name = $1',
      [cleanHousieName]
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ message: 'Housie name not found. Please sign up first.' });
      return;
    }

    const player = result.rows[0];

    if (player.status === 'Suspended') {
      res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
      return;
    }

    // If password is set in DB, check for it
    if (player.password_hash) {
      if (!password) {
        res.status(401).json({ message: 'Password required', password_required: true });
        return;
      }
      const match = await bcrypt.compare(password, player.password_hash);
      if (!match) {
        res.status(401).json({ message: 'Invalid password' });
        return;
      }
    }

    // 2. Sign JWT
    const payload = {
      playerId: player.player_id,
      fullName: player.full_name,
      housieName: player.housie_name,
    };

    const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
      algorithm: 'RS256' as any,
      expiresIn: '3650d',
    });

    // 3. Store in HttpOnly cookie
    res.cookie('hg_player_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3650 * 24 * 60 * 60 * 1000, // 10 years
    });

    res.json({ token, player });
  } catch (error) {
    console.error('Player login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getProfile(req: any, res: Response): Promise<void> {
  if (!req.player) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  
  try {
    const result = await pool.query(
      'SELECT player_id, player_code, full_name, housie_name, registered_at, phone, email, theme_preference, sound_enabled, status, avatar_url, (password_hash IS NOT NULL) AS has_password FROM Players WHERE player_id = $1',
      [req.player.playerId]
    );
    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }
    const profile = result.rows[0];
    if (profile.status === 'Suspended') {
      res.status(403).json({ message: 'Your account is suspended.' });
      return;
    }
    res.json({ player: profile });
  } catch (error) {
    console.error('Error fetching player profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function updateProfile(req: any, res: Response): Promise<void> {
  if (!req.player) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { full_name, phone, email, theme_preference, sound_enabled, password, avatar_url } = req.body;

  try {
    let passwordHashUpdate = null;
    let shouldUpdatePassword = false;

    if (password !== undefined) {
      shouldUpdatePassword = true;
      if (password !== '' && password !== null) {
        if (password.length < 6) {
          res.status(400).json({ message: 'Password must be at least 6 characters long' });
          return;
        }
        passwordHashUpdate = await bcrypt.hash(password, 12);
      }
    }

    const result = await pool.query(
      `UPDATE Players 
       SET full_name = COALESCE($1, full_name),
           phone = $2,
           email = $3,
           theme_preference = $4,
           sound_enabled = COALESCE($5, sound_enabled),
           password_hash = CASE WHEN $6 = TRUE THEN $7 ELSE password_hash END,
           avatar_url = COALESCE($8, avatar_url)
       WHERE player_id = $9
       RETURNING player_id, player_code, full_name, housie_name, registered_at, phone, email, theme_preference, sound_enabled, avatar_url, (password_hash IS NOT NULL) AS has_password`,
      [full_name, phone, email, theme_preference, sound_enabled, shouldUpdatePassword, passwordHashUpdate, avatar_url, req.player.playerId]
    );

    res.json({ player: result.rows[0], message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating player profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  res.clearCookie('hg_player_token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Player logged out successfully' });
}

export async function getPlayerStats(req: any, res: Response): Promise<void> {
  const playerId = req.player?.playerId;

  if (!playerId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const queryHousieName = req.query.housie_name as string | undefined;

  try {
    let targetHousieName = "";
    let registeredAt = null;

    if (queryHousieName) {
      // 1. Fetch basic player info by query housie_name
      const playerRes = await pool.query('SELECT registered_at, housie_name FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER(TRIM($1))', [queryHousieName]);
      if (playerRes.rows.length === 0) {
        res.status(404).json({ message: 'Player not found' });
        return;
      }
      registeredAt = playerRes.rows[0].registered_at;
      targetHousieName = playerRes.rows[0].housie_name;
    } else {
      // 1. Basic player info by playerId
      const playerRes = await pool.query('SELECT registered_at, housie_name FROM Players WHERE player_id = $1', [playerId]);
      if (playerRes.rows.length === 0) {
        res.status(404).json({ message: 'Player not found' });
        return;
      }
      registeredAt = playerRes.rows[0].registered_at;
      targetHousieName = playerRes.rows[0].housie_name || req.player?.housieName;
    }

    // 2. Engagement stats from Bookings
    const bookingsRes = await pool.query(
      `SELECT 
         COUNT(DISTINCT game_id) as games_played,
         COALESCE(SUM(array_length(ticket_ids, 1)), 0) as tickets_bought,
         COALESCE(SUM(total_amount), 0) as total_expenditure
       FROM Bookings 
       WHERE LOWER(TRIM(housie_name)) = LOWER(TRIM($1)) AND booking_status = 'Sold'`,
      [targetHousieName]
    );
    const bStats = bookingsRes.rows[0];

    // 3. Winning stats from Prize Pool
    const winsRes = await pool.query(
      `SELECT 
         COUNT(*) as total_wins,
         COUNT(DISTINCT p.game_id) as games_won,
         COUNT(*) FILTER (WHERE pattern_name ILIKE '%Full House%') as full_house_wins,
         COUNT(*) FILTER (WHERE pattern_name ILIKE '%Line%') as line_wins,
         COUNT(*) FILTER (WHERE pattern_name NOT ILIKE '%Full House%' AND pattern_name NOT ILIKE '%Line%') as other_wins,
         
         -- Detailed patterns count
         COUNT(*) FILTER (WHERE pattern_name = 'Early Five') as early_five,
         COUNT(*) FILTER (WHERE pattern_name = 'Quick 7') as quick_7,
         COUNT(*) FILTER (WHERE pattern_name = 'Corner') as corner,
         COUNT(*) FILTER (WHERE pattern_name = 'Star') as star,
         COUNT(*) FILTER (WHERE pattern_name = 'Top Line') as top_line,
         COUNT(*) FILTER (WHERE pattern_name = 'Middle Line') as middle_line,
         COUNT(*) FILTER (WHERE pattern_name = 'Bottom Line') as bottom_line,
         COUNT(*) FILTER (WHERE pattern_name = 'Box Bonus') as box_bonus,
         COUNT(*) FILTER (WHERE pattern_name = 'Full House') as full_house,
         COUNT(*) FILTER (WHERE pattern_name = '1st Full House') as first_full_house,
         COUNT(*) FILTER (WHERE pattern_name = '2nd Full House') as second_full_house,
         COUNT(*) FILTER (WHERE pattern_name = '3rd Full House') as third_full_house,

         COALESCE(SUM(
           COALESCE(p.amount_per_winner, p.prize_amount) * (
             SELECT COALESCE(
               (
                 SELECT array_length(regexp_split_to_array(m[1], '\\s*(?:&|,|\\band\\b|\\bAND\\b|\\bAnd\\b)\\s*'), 1)
                 FROM (SELECT regexp_match(raw_token, '\\(([^)]+)\\)') AS m) AS sub
                 WHERE m IS NOT NULL
               ),
               1
             )
             FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
             WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
             LIMIT 1
           )
         ), 0) as amount_won
       FROM Prize_Pool p
       WHERE p.claimed = TRUE
         AND EXISTS (
           SELECT 1
           FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
         )`,
      [targetHousieName]
    );
    const wStats = winsRes.rows[0];

    // 4. Highest Single Game Win
    const highestGameRes = await pool.query(
      `SELECT COALESCE(SUM(
         COALESCE(p.amount_per_winner, p.prize_amount) * (
           SELECT COALESCE(
             (
               SELECT array_length(regexp_split_to_array(m[1], '\\s*(?:&|,|\\band\\b|\\bAND\\b|\\bAnd\\b)\\s*'), 1)
               FROM (SELECT regexp_match(raw_token, '\\(([^)]+)\\)') AS m) AS sub
               WHERE m IS NOT NULL
             ),
             1
           )
           FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
           LIMIT 1
         )
       ), 0) as game_total 
       FROM Prize_Pool p
       WHERE p.claimed = TRUE
         AND EXISTS (
           SELECT 1
           FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
         )
       GROUP BY p.game_id 
       ORDER BY game_total DESC 
       LIMIT 1`,
      [targetHousieName]
    );
    const highestWin = highestGameRes.rowCount && highestGameRes.rowCount > 0 ? highestGameRes.rows[0].game_total : 0;

    // 5. Luckiest Ticket Number
    const luckiestTicketRes = await pool.query(
      `SELECT ticket_num 
       FROM (
         SELECT TRIM(regexp_split_to_table(paren_content, '\\s*(?:&|,|\\band\\b|\\bAND\\b|\\bAnd\\b)\\s*'))::integer AS ticket_num
         FROM (
           SELECT (regexp_match(raw_token, '\\(([^)]+)\\)'))[1] AS paren_content
           FROM (
             SELECT regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
             FROM Prize_Pool p
             WHERE p.claimed = TRUE
           ) AS tokens
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
         ) AS sub
         WHERE paren_content IS NOT NULL
       ) AS final_sub
       GROUP BY ticket_num
       ORDER BY COUNT(*) DESC, ticket_num ASC
       LIMIT 1`,
      [targetHousieName]
    );
    const luckiestTicket = luckiestTicketRes.rowCount && luckiestTicketRes.rowCount > 0 ? luckiestTicketRes.rows[0].ticket_num : null;

    // 6. Streaks Calculation
    const gamesRes = await pool.query(
      `SELECT g.game_id, 
         (
           SELECT COUNT(*) 
           FROM Prize_Pool p 
           WHERE p.game_id = g.game_id 
             AND p.claimed = TRUE 
             AND EXISTS (
               SELECT 1
               FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\\s+(?i:and)\\s+') AS raw_token
               WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
             )
         ) > 0 as won
       FROM Bookings b
       JOIN Scheduled_Games g ON b.game_id = g.game_id
       WHERE LOWER(TRIM(b.housie_name)) = LOWER(TRIM($1)) 
         AND b.booking_status = 'Sold'
         AND g.game_status IN ('Completed', 'Draw_Ended')
       GROUP BY g.game_id, g.scheduled_at
       ORDER BY g.scheduled_at ASC`,
      [targetHousieName]
    );

    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    for (const row of gamesRes.rows) {
      if (row.won) {
        currentWinStreak++;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        currentLossStreak = 0;
      } else {
        currentLossStreak++;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        currentWinStreak = 0;
      }
    }

    const streakResult = maxWinStreak > 1 ? maxWinStreak : 0;

    res.json({
      member_since: registeredAt,
      games_played: parseInt(bStats.games_played, 10) || 0,
      tickets_bought: parseInt(bStats.tickets_bought, 10) || 0,
      total_expenditure: parseFloat(bStats.total_expenditure) || 0,
      total_wins: parseInt(wStats.total_wins, 10) || 0,
      games_won: parseInt(wStats.games_won, 10) || 0,
      full_house_wins: parseInt(wStats.full_house_wins, 10) || 0,
      line_wins: parseInt(wStats.line_wins, 10) || 0,
      other_wins: parseInt(wStats.other_wins, 10) || 0,
      amount_won: parseFloat(wStats.amount_won) || 0,
      highest_amount_single_game: parseFloat(highestWin) || 0,
      luckiest_ticket_number: luckiestTicket,
      longest_winning_run: streakResult,
      unluckiest_run: maxLossStreak,
      pattern_wins: {
        early_five: parseInt(wStats.early_five, 10) || 0,
        quick_7: parseInt(wStats.quick_7, 10) || 0,
        corner: parseInt(wStats.corner, 10) || 0,
        star: parseInt(wStats.star, 10) || 0,
        top_line: parseInt(wStats.top_line, 10) || 0,
        middle_line: parseInt(wStats.middle_line, 10) || 0,
        bottom_line: parseInt(wStats.bottom_line, 10) || 0,
        box_bonus: parseInt(wStats.box_bonus, 10) || 0,
        full_house: parseInt(wStats.full_house, 10) || 0,
        first_full_house: parseInt(wStats.first_full_house, 10) || 0,
        second_full_house: parseInt(wStats.second_full_house, 10) || 0,
        third_full_house: parseInt(wStats.third_full_house, 10) || 0,
      }
    });

  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getAllPlayers(req: any, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT 
         p.player_id,
         p.player_code,
         p.full_name,
         p.housie_name,
         p.registered_at,
         p.phone,
         p.email,
         p.status,
         COUNT(DISTINCT b.game_id)::INTEGER AS games_played,
         COALESCE(SUM(array_length(b.ticket_ids, 1)), 0)::INTEGER AS tickets_bought,
         COALESCE(SUM(b.total_amount), 0)::FLOAT AS total_expenditure,
         (
           SELECT COALESCE(SUM(
             COALESCE(pr.amount_per_winner, pr.prize_amount) * (
               SELECT COALESCE(array_length(regexp_split_to_array(raw_token, '&|\bAND\b'), 1), 1)
               FROM regexp_split_to_table(pr.winner_housie_name, ',\s*') AS raw_token
               WHERE LOWER(TRIM(regexp_replace(raw_token, '\([^)]*\)', '', 'g'))) = LOWER(TRIM(p.housie_name))
               LIMIT 1
             )
           ), 0)::FLOAT
           FROM Prize_Pool pr
           WHERE pr.claimed = TRUE
             AND EXISTS (
               SELECT 1
               FROM regexp_split_to_table(pr.winner_housie_name, '[,&]|\s+and\s+') AS raw_token
               WHERE LOWER(TRIM(regexp_replace(raw_token, '\([^)]*\)', '', 'g'))) = LOWER(TRIM(p.housie_name))
             )
         ) AS total_won
       FROM Players p
       LEFT JOIN Bookings b ON b.housie_name = p.housie_name AND b.booking_status = 'Sold'
       GROUP BY p.player_id, p.player_code, p.full_name, p.housie_name, p.registered_at, p.phone, p.email, p.status
       ORDER BY p.registered_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all players:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function adminUpdatePlayerStatus(req: any, res: Response): Promise<void> {
  const { player_id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Suspended'].includes(status)) {
    res.status(400).json({ message: 'Invalid status value' });
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE Players SET status = $1 WHERE player_id = $2 RETURNING player_id, status, housie_name',
      [status, player_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }

    res.json({ message: `Player status successfully updated to ${status}`, player: result.rows[0] });
  } catch (error) {
    console.error('Error updating player status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function adminDeletePlayer(req: any, res: Response): Promise<void> {
  const { player_id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM Players WHERE player_id = $1 RETURNING player_id, housie_name',
      [player_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }

    res.json({ message: 'Player profile deleted successfully', deleted_player_id: player_id });
  } catch (error) {
    console.error('Error deleting player:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get all won prizes (winnings) of the authenticated player
 */
export async function getPlayerWinnings(req: any, res: Response): Promise<void> {
  const playerHousieName = req.player.housieName;

  try {
    const result = await pool.query(
      `SELECT 
        p.prize_id,
        p.game_id,
        p.pattern_name,
        p.amount_per_winner,
        p.prize_amount,
        p.player_claimed,
        p.player_claimed_at,
        p.disbursed,
        p.disbursed_at,
        p.winner_housie_name,
        p.winner_ticket_id,
        t.ticket_number AS winner_ticket_number,
        sg.title AS game_title,
        sg.scheduled_at AS game_date
       FROM Prize_Pool p
       LEFT JOIN Tickets t ON p.winner_ticket_id = t.ticket_id
       LEFT JOIN Scheduled_Games sg ON p.game_id = sg.game_id
       WHERE p.claimed = TRUE 
         AND sg.game_status IN ('Draw_Ended', 'Completed')
         AND EXISTS (
           SELECT 1
           FROM regexp_split_to_table(p.winner_housie_name, '[,&]|\s+and\s+') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\([^)]*\)', '', 'g'))) = LOWER(TRIM($1))
         )
       ORDER BY sg.scheduled_at DESC`,
      [playerHousieName]
    );

    const winnings = result.rows.map((row) => ({
      prize_id: row.prize_id,
      game_id: row.game_id,
      game_title: row.game_title,
      game_date: row.game_date,
      pattern_name: row.pattern_name,
      amount: parseFloat(row.amount_per_winner ?? row.prize_amount),
      winner_ticket_number: row.winner_ticket_number,
      player_claimed: row.player_claimed,
      player_claimed_at: row.player_claimed_at,
      disbursed: row.disbursed,
      disbursed_at: row.disbursed_at,
    }));

    res.json(winnings);
  } catch (error) {
    console.error('Error fetching player winnings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

