import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { env } from '../../config/env';
import { validateHousieName } from '../../utils/housieName';
import { registerDevice, checkDevice } from '../../services/playerDevices';
import { buildWaLink } from '../../utils/waLink';

/** Shared by signup and the profile password change, so the two can't drift apart. */
export const MIN_PLAYER_PASSWORD_LENGTH = 6;

export async function signup(req: Request, res: Response): Promise<void> {
  const { full_name, housie_name, ref_promoter_id, referral_code, device_id, password } = req.body;

  // Charset rules matter beyond cosmetics: a name containing & ( ) or a comma
  // corrupts the `winner_housie_name` grammar used by prize claims, so one
  // player's winnings could be matched to another player's name.
  const nameCheck = validateHousieName(housie_name);
  if (!nameCheck.ok) {
    res.status(400).json({ message: nameCheck.error });
    return;
  }

  // A password is set at signup so the account is usable from more than one
  // device. Housie names are public (leaderboard, live board, ticket search), so
  // without a password the only thing standing between a stranger and someone
  // else's prizes is the Player_Devices known-device gate in `login` below — and
  // that gate, by construction, locks the real owner out of their second device
  // too. Collecting a password here is what makes "same account on phone and
  // laptop" possible without reopening account takeover.
  if (typeof password !== 'string' || password.length < MIN_PLAYER_PASSWORD_LENGTH) {
    res.status(400).json({
      message: `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters long`,
    });
    return;
  }

  const cleanHousieName = housie_name.trim().replace(/\s+/g, ' ');
  const cleanFullName = full_name ? full_name.trim() : null;

  try {
    // 1. Check uniqueness CASE-INSENSITIVELY. A raw `=` comparison let
    //    'RajaBabu' and 'rajababu' coexist while every downstream consumer
    //    (prize claims, leaderboard, stats) compares lowercased — so the
    //    case variant could claim the original's prizes.
    const checkPlayer = await pool.query(
      'SELECT player_id FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER($1)',
      [cleanHousieName]
    );
    if ((checkPlayer.rowCount ?? 0) > 0) {
      res.status(409).json({ message: 'Housie name is already taken. Please choose another one.' });
      return;
    }

    // 1b. Resolve an optional referral code to the referring player.
    // A bad or unknown code is ignored rather than rejected — a mistyped code must
    // never block someone from creating an account.
    let referrerId: string | null = null;
    if (referral_code && typeof referral_code === 'string') {
      const code = referral_code.trim().toUpperCase();
      if (code) {
        const ref = await pool.query(
          `SELECT player_id FROM Players WHERE UPPER(player_code) = $1 AND status <> 'Suspended'`,
          [code]
        );
        referrerId = ref.rows[0]?.player_id ?? null;
      }
    }

    // 2. Insert player
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO Players (full_name, housie_name, referred_by, password_hash) VALUES ($1, $2, $3, $4) RETURNING player_id, player_code, full_name, housie_name',
      [cleanFullName, cleanHousieName, referrerId, passwordHash]
    );

    const player = result.rows[0];

    // 2b. Record this browser as a known device. Now that signup always sets a
    // password this is no longer the account's only proof of ownership — the
    // password is, and it works from any device — but keeping the registry
    // populated means a player who later clears their password still has the
    // known-device path. Failing to register must not fail the signup.
    try {
      await registerDevice(player.player_id, device_id, req.headers['user-agent']);
    } catch (err) {
      console.error('Failed to register signup device:', err);
    }

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
  const { housie_name, password, device_id } = req.body;

  if (!housie_name) {
    res.status(400).json({ message: 'Housie name is required' });
    return;
  }

  const cleanHousieName = String(housie_name).trim().replace(/\s+/g, ' ');

  try {
    // 1. Fetch player. Case-insensitive so a login matches the same row the
    //    case-insensitive uniqueness check protects at signup.
    const result = await pool.query(
      'SELECT player_id, player_code, full_name, housie_name, password_hash, status FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER($1)',
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

    // A password, when set, is sufficient on its own from any device.
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
    } else {
      // No password set. Housie names are public — they're on the leaderboard,
      // the live board and the ticket search — so the name alone must not be
      // enough to sign in. Require a device this account has been seen on.
      //
      // `firstEver` is trust-on-first-use: accounts that predate this check have
      // no registered devices, and locking them all out on launch day would be
      // worse than the residual risk. The first device to log in claims the
      // account and every later device is gated.
      const device = await checkDevice(player.player_id, device_id);

      if (!device.known && !device.firstEver) {
        res.status(401).json({
          message:
            'This account is already active on another device. Open Housie Ghar on your usual device and set a password under Profile to sign in here.',
          new_device: true,
        });
        return;
      }
    }

    // Refresh/record the device so the account stays bound to what it's used on.
    try {
      await registerDevice(player.player_id, device_id, req.headers['user-agent']);
    } catch (err) {
      console.error('Failed to register login device:', err);
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
      'SELECT player_id, player_code, full_name, housie_name, registered_at, phone, email, theme_preference, sound_enabled, status, avatar_url, housie_name_changes, (password_hash IS NOT NULL) AS has_password FROM Players WHERE player_id = $1',
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

  const { full_name, phone, email, theme_preference, sound_enabled, password, avatar_url, housie_name } = req.body;

  try {
    let passwordHashUpdate = null;
    let shouldUpdatePassword = false;

    // A password can be SET or CHANGED here, never cleared. An empty string used to
    // mean "revert this account to passwordless", which put it back behind the
    // Player_Devices known-device gate — so the owner would be locked out of every
    // device except the one they happened to be on, with no way back in if that
    // browser's storage were ever cleared. Removing the UI for it is not enough on
    // its own; the endpoint has to refuse it too, or the same call still works.
    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < MIN_PLAYER_PASSWORD_LENGTH) {
        res.status(400).json({
          message: `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters long`,
        });
        return;
      }
      shouldUpdatePassword = true;
      passwordHashUpdate = await bcrypt.hash(password, 12);
    }

    // Only touch fields the request actually carried. `phone`, `email` and
    // `theme_preference` used to be assigned unconditionally, so any partial
    // PATCH silently nulled them — the frontend never sends theme_preference,
    // so every profile save was wiping it. Explicitly sending null still
    // clears a field, which is how the UI lets a player remove their phone.
    const sets: string[] = [];
    const params: any[] = [];
    const setField = (column: string, value: any) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    let housieNameChanged = false;
    if (housie_name !== undefined && housie_name !== null && housie_name !== '') {
      const cleanHousieName = housie_name.trim().replace(/\s+/g, ' ');
      const nameCheck = validateHousieName(cleanHousieName);
      if (!nameCheck.ok) {
        res.status(400).json({ message: nameCheck.error });
        return;
      }

      // Fetch current name and changes count
      const currentRes = await pool.query(
        'SELECT housie_name, housie_name_changes FROM Players WHERE player_id = $1',
        [req.player.playerId]
      );
      if (currentRes.rows.length > 0) {
        const playerRow = currentRes.rows[0];
        if (cleanHousieName.toLowerCase() !== playerRow.housie_name.toLowerCase()) {
          // It's a change!
          if ((playerRow.housie_name_changes || 0) >= 1) {
            res.status(400).json({ message: 'You can only change your Housie Name once after signup.' });
            return;
          }
          // Check uniqueness
          const checkPlayer = await pool.query(
            'SELECT player_id FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER($1) AND player_id <> $2',
            [cleanHousieName, req.player.playerId]
          );
          if ((checkPlayer.rowCount ?? 0) > 0) {
            res.status(409).json({ message: 'Housie name is already taken. Please choose another one.' });
            return;
          }
          setField('housie_name', cleanHousieName);
          setField('housie_name_changes', (playerRow.housie_name_changes || 0) + 1);
          housieNameChanged = true;
        }
      }
    }

    if (full_name !== undefined) setField('full_name', full_name);
    if (phone !== undefined) setField('phone', phone);
    if (email !== undefined) setField('email', email);
    if (theme_preference !== undefined) setField('theme_preference', theme_preference);
    if (sound_enabled !== undefined) setField('sound_enabled', sound_enabled);
    if (avatar_url !== undefined) setField('avatar_url', avatar_url);
    if (shouldUpdatePassword) setField('password_hash', passwordHashUpdate);

    const returning = `RETURNING player_id, player_code, full_name, housie_name, registered_at, phone, email, theme_preference, sound_enabled, avatar_url, housie_name_changes, (password_hash IS NOT NULL) AS has_password`;

    params.push(req.player.playerId);
    const result = sets.length
      ? await pool.query(
          `UPDATE Players SET ${sets.join(', ')} WHERE player_id = $${params.length} ${returning}`,
          params
        )
      : await pool.query(
          `SELECT player_id, player_code, full_name, housie_name, registered_at, phone, email, theme_preference, sound_enabled, avatar_url, housie_name_changes, (password_hash IS NOT NULL) AS has_password
           FROM Players WHERE player_id = $1`,
          [req.player.playerId]
        );

    const updatedPlayer = result.rows[0];

    if (housieNameChanged) {
      const payload = {
        playerId: updatedPlayer.player_id,
        fullName: updatedPlayer.full_name,
        housieName: updatedPlayer.housie_name,
      };
      const token = jwt.sign(payload, env.JWT_PRIVATE_KEY, {
        algorithm: 'RS256' as any,
        expiresIn: '3650d',
      });
      res.cookie('hg_player_token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3650 * 24 * 60 * 60 * 1000,
      });
      res.json({ player: updatedPlayer, token, message: 'Profile updated successfully' });
      return;
    }

    res.json({ player: updatedPlayer, message: 'Profile updated successfully' });
  } catch (error: any) {
    // Migration 046 added a partial UNIQUE index on Players(phone). Two players
    // entering the same number (a shared family phone is common here) otherwise
    // surfaced as a bare 500 with no explanation on the profile page.
    if (error?.code === '23505') {
      const constraint = String(error?.constraint ?? '');
      if (constraint.includes('phone')) {
        res.status(409).json({
          message: 'That phone number is already linked to another Housie Ghar account.',
        });
        return;
      }
      res.status(409).json({ message: 'That value is already in use on another account.' });
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

/**
 * Phone numbers are stored however they were typed — "9876543210", "+91 98765 43210",
 * "098765-43210" have all been seen. Compare on digits only, and on the last 10 of
 * them, so a country code or separators on either side don't cause a false mismatch.
 */
function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '').slice(-10);
  const na = norm(a);
  const nb = norm(b);
  return na.length === 10 && na === nb;
}

/** "9876543210" -> "••••••3210", so the player can tell which number to reach for. */
function maskPhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return '•'.repeat(Math.max(4, digits.length - 4)) + digits.slice(-4);
}

/**
 * Step 1 of "forgot password": what can this account actually use to recover?
 *
 * Deliberately does NOT reveal whether a housie name exists — those are public on the
 * leaderboard, live board and ticket search, so confirming one is not a leak, but
 * confirming which ones are RESETTABLE would tell an attacker exactly which accounts
 * are worth targeting. Every unknown name is answered as if it had no phone on file,
 * which is the same response a real phone-less account gets.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { housie_name } = req.body;

  if (!housie_name) {
    res.status(400).json({ message: 'Housie name is required' });
    return;
  }

  const cleanHousieName = String(housie_name).trim().replace(/\s+/g, ' ');

  try {
    const result = await pool.query(
      `SELECT phone, status FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER($1)`,
      [cleanHousieName]
    );
    const player = result.rows[0];
    const phone: string | null = player?.phone ?? null;
    const usable = !!player && player.status !== 'Suspended' && !!phone && String(phone).replace(/\D/g, '').length >= 10;

    if (usable) {
      res.json({ method: 'phone', phone_hint: maskPhone(phone as string) });
      return;
    }

    // No phone on file (or no such account): the only route left is a human one.
    // Surface whichever support contact the platform has configured.
    const cfg = await pool.query(
      `SELECT config_key, config_value FROM Platform_Config
       WHERE config_key IN ('financial_officer_whatsapp', 'support_phone')`
    );
    const byKey: Record<string, string> = {};
    for (const row of cfg.rows) byKey[row.config_key] = row.config_value;
    const pick = (v?: string) => (String(v ?? '').replace(/\D/g, '').length >= 10 ? v : null);
    // Only offer a link if the configured number is actually dialable — these keys hold
    // placeholders like "+91" in some environments, and a wa.me link built from that
    // opens a broken chat, which is worse than telling the player to contact their agent.
    const supportPhone = pick(byKey.financial_officer_whatsapp) || pick(byKey.support_phone) || null;

    res.json({
      method: 'support',
      support_whatsapp: supportPhone
        ? buildWaLink(
            supportPhone,
            `Hi, I can't sign in to my Housie Ghar account "${cleanHousieName}" and there's no phone number saved on it. Can you help me reset my password?`
          )
        : null,
    });
  } catch (error) {
    console.error('Forgot password lookup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Step 2: set a new password, proving ownership with the phone number saved on the
 * account. That is not a strong secret, but it is not public either — unlike the housie
 * name, which is — and it is the only identifier this platform already holds for most
 * players. The route is behind a failed-attempt rate limiter (see app.ts) so the number
 * cannot be ground out, and a success signs the player straight in and registers the
 * device, so a reset also restores access on whatever they are holding.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { housie_name, phone, password, device_id } = req.body;

  if (!housie_name || !phone) {
    res.status(400).json({ message: 'Housie name and phone number are required' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PLAYER_PASSWORD_LENGTH) {
    res.status(400).json({
      message: `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters long`,
    });
    return;
  }

  const cleanHousieName = String(housie_name).trim().replace(/\s+/g, ' ');

  try {
    const result = await pool.query(
      `SELECT player_id, player_code, full_name, housie_name, phone, status
       FROM Players WHERE LOWER(TRIM(housie_name)) = LOWER($1)`,
      [cleanHousieName]
    );
    const player = result.rows[0];

    if (player && player.status === 'Suspended') {
      res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
      return;
    }

    // One message whether the name is unknown or the phone is wrong — telling those two
    // apart would turn this into a phone-number oracle for any name off the leaderboard.
    if (!player || !phonesMatch(player.phone, phone)) {
      res.status(401).json({
        message: "Those details don't match an account. Check the phone number saved on your profile.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE Players SET password_hash = $1 WHERE player_id = $2', [
      passwordHash,
      player.player_id,
    ]);

    try {
      await registerDevice(player.player_id, device_id, req.headers['user-agent']);
    } catch (err) {
      console.error('Failed to register device on password reset:', err);
    }

    const token = jwt.sign(
      { playerId: player.player_id, fullName: player.full_name, housieName: player.housie_name },
      env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256' as any, expiresIn: '3650d' }
    );

    res.cookie('hg_player_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3650 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      player: {
        player_id: player.player_id,
        player_code: player.player_code,
        full_name: player.full_name,
        housie_name: player.housie_name,
      },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
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

