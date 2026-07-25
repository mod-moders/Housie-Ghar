import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { env } from '../../config/env';
import {
  startPendingSignup,
  getPendingSignup,
  recordFailedAttempt,
  clearPendingSignup,
  sendOtpWhatsApp,
  isWhatsAppConfigured,
} from '../../services/whatsappOtp';

const PHONE_REGEX = /^[6-9]\d{9}$/; // 10-digit Indian mobile number, no country code

function cleanPhoneInput(phone: unknown): string {
  return typeof phone === 'string' ? phone.replace(/\D/g, '').slice(-10) : '';
}

function validateHousieName(housieName: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (!housieName || typeof housieName !== 'string') {
    return { ok: false, message: 'Housie name is required' };
  }
  const clean = housieName.trim();
  if (clean.length < 3 || clean.length > 20) {
    return { ok: false, message: 'Housie name must be between 3 and 20 characters' };
  }
  return { ok: true, value: clean };
}

/**
 * POST /api/player/signup/start — validates the desired Housie Name and phone
 * number, rejects a phone already tied to a verified account with "Number
 * already used", then stashes the not-yet-created account in Redis and sends
 * a 6-digit code over WhatsApp. Nothing is written to Players yet.
 */
export async function startSignup(req: Request, res: Response): Promise<void> {
  const { full_name, housie_name, phone, ref_promoter_id, referral_code } = req.body;

  const nameCheck = validateHousieName(housie_name);
  if (!nameCheck.ok) {
    res.status(400).json({ message: nameCheck.message });
    return;
  }
  const cleanFullName = full_name ? String(full_name).trim() : null;
  const cleanPhone = cleanPhoneInput(phone);
  if (!PHONE_REGEX.test(cleanPhone)) {
    res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    return;
  }

  try {
    const nameTaken = await pool.query('SELECT player_id FROM Players WHERE housie_name = $1', [nameCheck.value]);
    if ((nameTaken.rowCount ?? 0) > 0) {
      res.status(409).json({ message: 'Housie name is already taken. Please choose another one.' });
      return;
    }

    const phoneTaken = await pool.query('SELECT player_id FROM Players WHERE phone = $1', [cleanPhone]);
    if ((phoneTaken.rowCount ?? 0) > 0) {
      res.status(409).json({ message: 'Number already used. Please log in instead or use a different number.' });
      return;
    }

    const cleanReferralCode =
      referral_code && typeof referral_code === 'string' ? referral_code.trim().toUpperCase() || null : null;

    const pendingResult = await startPendingSignup(cleanPhone, {
      housieName: nameCheck.value,
      fullName: cleanFullName,
      referralCode: cleanReferralCode,
      refPromoterId: ref_promoter_id ? String(ref_promoter_id) : null,
    });

    if (pendingResult.otp === null) {
      res.status(429).json({ message: `Please wait ${pendingResult.cooldownSecondsLeft}s before requesting another code.` });
      return;
    }

    const { delivered } = await sendOtpWhatsApp(cleanPhone, pendingResult.otp);

    res.status(200).json({
      pending: true,
      expires_in: 600,
      delivered,
      // Only present outside production, and only when WhatsApp isn't configured
      // for real sending — a dev/testing stand-in, see services/whatsappOtp.ts.
      ...(env.NODE_ENV !== 'production' && !isWhatsAppConfigured() ? { dev_otp: pendingResult.otp } : {}),
    });
  } catch (error) {
    console.error('Signup OTP start error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * POST /api/player/signup/verify — checks the code against the pending
 * signup and, only on a match, creates the real Players row (re-checking
 * name/phone uniqueness first, since either could have been taken by someone
 * else during the OTP window).
 */
export async function verifySignupOtp(req: Request, res: Response): Promise<void> {
  const { phone, otp } = req.body;
  const cleanPhone = cleanPhoneInput(phone);
  const cleanOtp = typeof otp === 'string' ? otp.trim() : '';

  if (!PHONE_REGEX.test(cleanPhone) || !cleanOtp) {
    res.status(400).json({ message: 'Phone number and code are required' });
    return;
  }

  try {
    const pending = await getPendingSignup(cleanPhone);
    if (!pending) {
      res.status(400).json({ message: 'This code has expired or was never requested. Please request a new one.' });
      return;
    }

    const match = await bcrypt.compare(cleanOtp, pending.otpHash);
    if (!match) {
      const { attemptsLeft } = await recordFailedAttempt(cleanPhone, pending);
      if (attemptsLeft <= 0) {
        res.status(400).json({ message: 'Too many incorrect attempts. Please request a new code.' });
        return;
      }
      res.status(400).json({ message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.` });
      return;
    }

    // Re-check uniqueness — someone else may have taken the name/number during the OTP window.
    const nameTaken = await pool.query('SELECT player_id FROM Players WHERE housie_name = $1', [pending.housieName]);
    if ((nameTaken.rowCount ?? 0) > 0) {
      await clearPendingSignup(cleanPhone);
      res.status(409).json({ message: 'Housie name is already taken. Please start over with another one.' });
      return;
    }
    const phoneTaken = await pool.query('SELECT player_id FROM Players WHERE phone = $1', [cleanPhone]);
    if ((phoneTaken.rowCount ?? 0) > 0) {
      await clearPendingSignup(cleanPhone);
      res.status(409).json({ message: 'Number already used. Please log in instead or use a different number.' });
      return;
    }

    let referrerId: string | null = null;
    if (pending.referralCode) {
      const ref = await pool.query(
        `SELECT player_id FROM Players WHERE UPPER(player_code) = $1 AND status <> 'Suspended'`,
        [pending.referralCode]
      );
      referrerId = ref.rows[0]?.player_id ?? null;
    }

    const result = await pool.query(
      'INSERT INTO Players (full_name, housie_name, phone, referred_by) VALUES ($1, $2, $3, $4) RETURNING player_id, player_code, full_name, housie_name',
      [pending.fullName, pending.housieName, cleanPhone, referrerId]
    );
    const player = result.rows[0];

    if (pending.refPromoterId) {
      try {
        await pool.query(
          'INSERT INTO Promoter_Referrals (promoter_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [pending.refPromoterId, player.player_id]
        );
      } catch (err) {
        console.error('Error saving promoter referral linkage:', err);
      }
    }

    await clearPendingSignup(cleanPhone);

    const payload = {
      playerId: player.player_id,
      fullName: player.full_name,
      housieName: player.housie_name,
    };

    const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
      algorithm: 'RS256' as any,
      expiresIn: '3650d', // Persistent player session duration (10 years)
    });

    res.cookie('hg_player_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3650 * 24 * 60 * 60 * 1000, // 10 years
    });

    res.status(201).json({ token, player });
  } catch (error) {
    console.error('Signup OTP verify error:', error);
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
    // 23505 = unique_violation — Players.phone has a unique index (migration 046);
    // without this the same "Number already used" case would 500 instead of a clean message.
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ message: 'Number already used by another account.' });
      return;
    }
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
    let avatarUrl = null;

    if (queryHousieName) {
      // 1. Fetch basic player info by query housie_name
      const playerRes = await pool.query('SELECT registered_at, housie_name, avatar_url FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER(TRIM($1))', [queryHousieName]);
      if (playerRes.rows.length === 0) {
        res.status(404).json({ message: 'Player not found' });
        return;
      }
      registeredAt = playerRes.rows[0].registered_at;
      targetHousieName = playerRes.rows[0].housie_name;
      avatarUrl = playerRes.rows[0].avatar_url;
    } else {
      // 1. Basic player info by playerId
      const playerRes = await pool.query('SELECT registered_at, housie_name, avatar_url FROM Players WHERE player_id = $1', [playerId]);
      if (playerRes.rows.length === 0) {
        res.status(404).json({ message: 'Player not found' });
        return;
      }
      registeredAt = playerRes.rows[0].registered_at;
      targetHousieName = playerRes.rows[0].housie_name || req.player?.housieName;
      avatarUrl = playerRes.rows[0].avatar_url;
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
                 SELECT array_length(regexp_split_to_array(m[1], '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*'), 1)
                 FROM (SELECT regexp_match(raw_token, '\\(([^)]+)\\)') AS m) AS sub
                 WHERE m IS NOT NULL
               ),
               1
             )
             FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
             WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
             LIMIT 1
           )
         ), 0) as amount_won
       FROM Prize_Pool p
       WHERE p.claimed = TRUE
         AND EXISTS (
           SELECT 1
           FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
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
               SELECT array_length(regexp_split_to_array(m[1], '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*'), 1)
               FROM (SELECT regexp_match(raw_token, '\\(([^)]+)\\)') AS m) AS sub
               WHERE m IS NOT NULL
             ),
             1
           )
           FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
           LIMIT 1
         )
       ), 0) as game_total 
       FROM Prize_Pool p
       WHERE p.claimed = TRUE
         AND EXISTS (
           SELECT 1
           FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
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
         SELECT TRIM(regexp_split_to_table(paren_content, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*'))::integer AS ticket_num
         FROM (
           SELECT (regexp_match(raw_token, '\\(([^)]+)\\)'))[1] AS paren_content
           FROM (
             SELECT regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
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
               FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
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
      avatar_url: avatarUrl,
      housie_name: targetHousieName,
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
               SELECT COALESCE(
                 (
                   SELECT array_length(regexp_split_to_array(m[1], '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*'), 1)
                   FROM (SELECT regexp_match(raw_token, '\\([^)]+\\)') AS m) AS sub
                   WHERE m IS NOT NULL
                 ),
                 1
               )
               FROM regexp_split_to_table(pr.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
               WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM(p.housie_name))
               LIMIT 1
             )
           ), 0)::FLOAT
           FROM Prize_Pool pr
           WHERE pr.claimed = TRUE
             AND EXISTS (
               SELECT 1
               FROM regexp_split_to_table(pr.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
               WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM(p.housie_name))
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
           FROM regexp_split_to_table(p.winner_housie_name, '[[:space:]]*(?:&|,|[aA][nN][dD])[[:space:]]*(?![^()]*\\))') AS raw_token
           WHERE LOWER(TRIM(regexp_replace(raw_token, '\\([^)]*\\)', '', 'g'))) = LOWER(TRIM($1))
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

