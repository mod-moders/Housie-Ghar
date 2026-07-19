/**
 * Self-healing superadmin access.
 *
 * Background: the old login controller had a fallback that let ANY account be
 * accessed with a hardcoded password ('ChangeMe123!') or a plaintext substring
 * whenever the stored password_hash was not a real bcrypt hash. That backdoor
 * was removed (it let anyone sign into any staff account on a money platform).
 * Accounts that had only ever been reachable through that fallback — i.e. whose
 * password_hash is null/plaintext/malformed — are now correctly locked out.
 *
 * This boot task restores the ONE account needed to recover the rest — the
 * Superadmin — without reintroducing any backdoor:
 *
 *   • It runs only when the operator opts in by setting SUPERADMIN_TEMP_PASSWORD
 *     in the environment. No env var → it does nothing.
 *   • It only touches the Superadmin when the stored password is unusable
 *     (missing, or not a valid bcrypt hash). A valid password is NEVER overwritten,
 *     so leaving the env var set does not reset a working login on later deploys.
 *   • The restored password is bcrypt-hashed (work factor 12) and flagged
 *     temp_password_required, so it is a proper credential, not a bypass.
 *
 * Once the Superadmin can log in, other staff are re-secured the correct way via
 * the Edit Staff UI (users.controller.createUser/updateUser both bcrypt-hash).
 */

import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import pool from '../db';

const SUPERADMIN_ROLE_ID = 1;

/** A usable credential is a real bcrypt hash: `$2a$`/`$2b$`/`$2y$`, 60 chars. */
function isValidBcryptHash(hash: unknown): boolean {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash) && hash.length === 60;
}

export async function ensureSuperadminAccess(): Promise<void> {
  const resetPassword = process.env.SUPERADMIN_TEMP_PASSWORD;
  // Opt-in gate: without an explicit temp password, never write anything.
  if (!resetPassword) return;

  const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@housieghar.in').toLowerCase().trim();

  // Escape hatch for a superadmin whose stored hash is VALID bcrypt but of an
  // unknown password (e.g. onboarding changed the email but the password step
  // silently failed, leaving credentials nobody knows). The default heal
  // refuses to touch a valid hash, so this explicit second opt-in forces the
  // reset. Set it, let the boot run once, then UNSET both env vars.
  const forceReset = process.env.SUPERADMIN_FORCE_PASSWORD_RESET === 'true';

  try {
    // Look up by email OR the canonical 'superadmin' username: self-service
    // profile edits can change the superadmin's email, and an email-only
    // lookup would then strand the account (and worse, fall through to the
    // INSERT branch and try to create a duplicate superadmin).
    const existing = await pool.query(
      `SELECT user_id, email, password_hash FROM Users
        WHERE role_id = $2 AND (email = $1 OR username = 'superadmin')
        ORDER BY (email = $1) DESC
        LIMIT 1`,
      [email, SUPERADMIN_ROLE_ID]
    );

    // A working password is sacrosanct — leave it untouched unless the
    // operator explicitly forces the reset.
    if (existing.rowCount && isValidBcryptHash(existing.rows[0].password_hash) && !forceReset) {
      return;
    }

    const passwordHash = await bcrypt.hash(resetPassword, 12);

    if (existing.rowCount) {
      await pool.query(
        `UPDATE Users
            SET password_hash = $1, temp_password_required = TRUE, status = 'Active'
          WHERE user_id = $2`,
        [passwordHash, existing.rows[0].user_id]
      );
      console.warn(
        `⚠️  Superadmin (${existing.rows[0].email}) password ${forceReset ? 'FORCE-' : ''}reset from ` +
          `SUPERADMIN_TEMP_PASSWORD. Log in, change it, then unset SUPERADMIN_TEMP_PASSWORD` +
          `${forceReset ? ' and SUPERADMIN_FORCE_PASSWORD_RESET' : ''}.`
      );
    } else {
      await pool.query(
        `INSERT INTO Users (role_id, full_name, username, email, phone, password_hash, temp_password_required, status)
         VALUES ($1, 'Super Admin', 'superadmin', $2, '+919999999999', $3, TRUE, 'Active')
         ON CONFLICT (email) DO NOTHING`,
        [SUPERADMIN_ROLE_ID, email, passwordHash]
      );
      console.warn(
        `⚠️  Superadmin (${email}) did not exist — created from SUPERADMIN_TEMP_PASSWORD. ` +
          `Log in, change it, then unset SUPERADMIN_TEMP_PASSWORD.`
      );
    }
  } catch (error) {
    // Never let recovery logic crash the boot sequence.
    console.error('ensureSuperadminAccess failed:', error);
  }
}

export async function ensurePlatformConfig(): Promise<void> {
  const configs = [
    // Master switch checked by every audio call site (useGameAudio.ts /
    // LiveBoardContent.tsx gate playGreeting/playNumberCall/playCelebration on
    // this being exactly "true"). It was never seeded anywhere, so it always
    // read back undefined -> all game audio was silently disabled everywhere.
    { key: 'english_caller_enabled', val: 'true', desc: 'Master switch for live English number-caller audio (MP3/TTS) in games' },
    { key: 'cage_sound_enabled', val: 'true', desc: 'Enable/disable the ball-draw cage sound effect' },
    { key: 'celebration_sound_enabled', val: 'true', desc: 'Enable/disable the prize-win celebration sound' },
    { key: 'welcome_voice_enabled', val: 'true', desc: 'Enable/disable intro note welcome voice' },
    { key: 'instruction_voice_enabled', val: 'true', desc: 'Enable/disable outro note instruction voice' },
    { key: 'welcome_voice_url', val: '', desc: 'Welcome voice note audio URL or Base64 data' },
    { key: 'instruction_voice_url', val: '', desc: 'Instruction voice note audio URL or Base64 data' },
    { key: 'welcome_voice_text', val: 'Welcome to Housie Ghar. The game is starting now! Best of luck.', desc: 'Welcome voice note TTS fallback text' },
    { key: 'instruction_voice_text', val: 'Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.', desc: 'Instruction voice note TTS fallback text' },
    { key: 'welcome_voice_mode', val: 'Text', desc: 'Intro Note playback mode (Text or Audio)' },
    { key: 'instruction_voice_mode', val: 'Text', desc: 'Outro Note playback mode (Text or Audio)' },
    { key: 'welcome_voice_volume', val: '1.0', desc: 'Intro Note volume multiplier (0.0 to 2.0)' },
    { key: 'instruction_voice_volume', val: '1.0', desc: 'Outro Note volume multiplier (0.0 to 2.0)' },
    { key: 'tts_voice_name', val: '', desc: 'Universal AI TTS Voice Name for the platform' },
    { key: 'background_music_url', val: '', desc: 'Background music audio URL or Base64 data' },
    { key: 'background_music_enabled', val: 'false', desc: 'Enable background music during game' },
    { key: 'background_music_volume', val: '0.15', desc: 'Background music volume (0.0 to 1.0)' },
    { key: 'lobby_music_volume', val: '0.15', desc: 'Lobby waiting music volume (0.0 to 1.0)' },
    { key: 'master_calls_volume', val: '1.0', desc: 'Master calls volume gain multiplier (0.0 to 2.0)' },
    { key: 'cage_sound_type', val: 'steel_wooden', desc: 'Active cage spinning sound type' },
    { key: 'winner_sound_type', val: 'trumpet_cheering', desc: 'Active winner celebratory sound type' },
    { key: 'lobby_music_url_1', val: '', desc: 'Lobby wait music 1 audio URL or Base64' },
    { key: 'lobby_music_url_2', val: '', desc: 'Lobby wait music 2 audio URL or Base64' },
    { key: 'lobby_music_url_3', val: '', desc: 'Lobby wait music 3 audio URL or Base64' },
    { key: 'lobby_music_url_4', val: '', desc: 'Lobby wait music 4 audio URL or Base64' },
    { key: 'lobby_music_url_5', val: '', desc: 'Lobby wait music 5 audio URL or Base64' },
  ];

  try {
    for (const c of configs) {
      await pool.query(
        `INSERT INTO Platform_Config (config_key, config_value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (config_key) DO NOTHING`,
        [c.key, c.val, c.desc]
      );
    }
    console.log('✅ Checked/initialized sound configuration keys in Platform_Config');
  } catch (error) {
    console.error('Failed to initialize platform config keys:', error);
  }
}

/**
 * Restore uploaded audio config files (intro/outro voice notes, background
 * music, lobby music) from Postgres back onto local disk on boot.
 *
 * Railway rebuilds the backend into a fresh container on every deploy, which
 * resets the local filesystem to whatever's in the git image — silently
 * wiping any audio file a Superadmin uploaded at runtime via
 * uploadConfigAudio(), even though Platform_Config still points at that now-
 * missing filename. uploadConfigAudio() also persists the raw bytes into
 * Platform_Audio_Files, which lives in Postgres and survives redeploys; this
 * writes those bytes back to disk for any file that's currently missing, so
 * playback keeps working without a staff member re-uploading it every time.
 */
export async function restorePersistedAudioFiles(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_key, filename, data FROM Platform_Audio_Files`
    );
    if (result.rowCount === 0) return;

    const backendUploadDir = path.resolve(__dirname, '../../uploads/audio/config');
    fs.mkdirSync(backendUploadDir, { recursive: true });

    let rootDir = process.cwd();
    if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
      rootDir = path.resolve(rootDir, '..');
    }
    const frontendPublicDir = path.resolve(rootDir, 'frontend/public/audio/config');
    try { fs.mkdirSync(frontendPublicDir, { recursive: true }); } catch {}

    let restored = 0;
    for (const row of result.rows) {
      const backendPath = path.join(backendUploadDir, row.filename);
      const frontendPath = path.join(frontendPublicDir, row.filename);
      if (!fs.existsSync(backendPath)) {
        fs.writeFileSync(backendPath, row.data);
        restored++;
      }
      if (!fs.existsSync(frontendPath)) {
        try { fs.writeFileSync(frontendPath, row.data); } catch {}
      }
    }
    if (restored > 0) {
      console.log(`✅ Restored ${restored} uploaded audio file(s) from Postgres after redeploy`);
    }
  } catch (error) {
    console.error('Failed to restore persisted audio files:', error);
  }
}
