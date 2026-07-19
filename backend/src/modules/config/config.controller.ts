/**
 * Platform Config Controller
 * Key-value platform settings, editable only by a Superadmin.
 */

import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { io } from '../../server';

/**
 * Read the entire platform configuration (Superadmin)
 */
export async function getConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_key, config_value, description, updated_at
       FROM Platform_Config
       ORDER BY config_key ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error reading platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

let publicConfigCache: Record<string, string> | null = null;

export function clearPublicConfigCache(): void {
  publicConfigCache = null;
}

/**
 * Read public platform configuration (Unauthenticated)
 */
export async function getPublicConfig(req: any, res: Response): Promise<void> {
  if (publicConfigCache) {
    res.json(publicConfigCache);
    return;
  }
  try {
    const result = await pool.query(
      `SELECT config_key, config_value
       FROM Platform_Config
       WHERE config_key IN ('active_theme', 'marquee_text', 'announcement_text', 'site_title', 'maintenance_mode', 'english_caller_enabled', 'announcements_list', 'announcement_speed', 'announcements_muted', 'bookie_commission_per_ticket', 'cage_sound_enabled', 'celebration_sound_enabled', 'welcome_voice_url', 'instruction_voice_url', 'welcome_voice_text', 'instruction_voice_text', 'welcome_voice_mode', 'instruction_voice_mode', 'welcome_voice_volume', 'instruction_voice_volume', 'tts_voice_name', 'background_music_url', 'background_music_enabled', 'background_music_volume', 'lobby_music_volume', 'master_calls_volume', 'cage_sound_type', 'winner_sound_type', 'lobby_music_url_1', 'lobby_music_url_2', 'lobby_music_url_3', 'lobby_music_url_4', 'lobby_music_url_5')`
    );
    // Convert to a simple key-value object
    const configObj = result.rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {} as Record<string, string>);
    
    publicConfigCache = configObj;
    res.json(configObj);
  } catch (error) {
    console.error('Error reading public platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Operator-safe read of the WhatsApp destinations configured by Superadmin.
 * The links are intentionally kept out of the public configuration payload.
 */
export async function getShareGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT config_value FROM Platform_Config WHERE config_key = 'whatsapp_share_groups'`
    );
    const raw = result.rows[0]?.config_value ?? '[]';
    let groups: unknown = [];
    try { groups = JSON.parse(raw); } catch { groups = []; }

    if (!Array.isArray(groups)) {
      res.json({ groups: [] });
      return;
    }

    const safeGroups = groups
      .filter((group): group is { name: string; url: string } =>
        !!group && typeof group === 'object' &&
        typeof (group as { name?: unknown }).name === 'string' &&
        typeof (group as { url?: unknown }).url === 'string'
      )
      .map((group) => ({ name: group.name.trim(), url: group.url.trim() }))
      .filter((group) => group.name && /^https:\/\/(chat\.whatsapp\.com|web\.whatsapp\.com|wa\.me)\//i.test(group.url));

    res.json({ groups: safeGroups });
  } catch (error) {
    console.error('Error reading WhatsApp share groups:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update one or more config keys (Superadmin)
 * Body: { "lock_duration_minutes": "12", "marquee_text": "..." }
 */
export async function updateConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  const updates = req.body;
  const actor = req.user!;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
    res.status(400).json({ message: 'Request body must be a non-empty object of config_key: value pairs' });
    return;
  }

  clearPublicConfigCache();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let rootDir = process.cwd();
    if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
      rootDir = path.resolve(rootDir, '..');
    }
    const destDir = path.resolve(rootDir, 'frontend/public/audio/config');

    for (const [key, value] of Object.entries(updates)) {
      if (value === '') {
        const audioKeys = [
          'welcome_voice_url',
          'instruction_voice_url',
          'background_music_url',
          'lobby_music_url_1',
          'lobby_music_url_2',
          'lobby_music_url_3',
          'lobby_music_url_4',
          'lobby_music_url_5'
        ];
        if (audioKeys.includes(key) && fs.existsSync(destDir)) {
          const files = fs.readdirSync(destDir);
          files.forEach((file) => {
            if (file.startsWith(`${key}-`) || file.startsWith(`${key}.`)) {
              try { fs.unlinkSync(path.join(destDir, file)); } catch {}
            }
          });
        }
      }
      
      // Only update keys that already exist — config keys are not free-form
      const result = await client.query(
        `UPDATE Platform_Config
         SET config_value = $1, updated_by = $2, updated_at = NOW()
         WHERE config_key = $3
         RETURNING config_key`,
        [String(value), actor.userId, key]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: `Unknown config key: ${key}` });
        return;
      }
    }

    await client.query('COMMIT');

    // Broadcast config updates to all connected players/clients instantly
    const publicKeys = ['active_theme', 'marquee_text', 'announcement_text', 'site_title', 'maintenance_mode', 'english_caller_enabled', 'announcements_list', 'announcement_speed', 'announcements_muted', 'bookie_commission_per_ticket', 'cage_sound_enabled', 'celebration_sound_enabled', 'welcome_voice_url', 'instruction_voice_url', 'welcome_voice_text', 'instruction_voice_text', 'welcome_voice_mode', 'instruction_voice_mode', 'welcome_voice_volume', 'instruction_voice_volume', 'tts_voice_name', 'background_music_url', 'background_music_enabled', 'background_music_volume', 'lobby_music_volume', 'master_calls_volume', 'cage_sound_type', 'winner_sound_type', 'lobby_music_url_1', 'lobby_music_url_2', 'lobby_music_url_3', 'lobby_music_url_4', 'lobby_music_url_5'];
    const publicUpdates: Record<string, string> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (publicKeys.includes(key)) {
        publicUpdates[key] = String(val);
      }
    }
    if (Object.keys(publicUpdates).length > 0) {
      io.emit('config_update', publicUpdates);
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_PLATFORM_CONFIG',
      targetType: 'Platform_Config',
      targetDescription: `Updated keys: ${Object.keys(updates).join(', ')}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const refreshed = await pool.query(
      `SELECT config_key, config_value, description, updated_at FROM Platform_Config ORDER BY config_key ASC`
    );
    res.json({ message: 'Configuration updated', config: refreshed.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating platform config:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Reset entire game stats and financial data (Superadmin)
 */
export async function resetDatabase(req: AuthenticatedRequest, res: Response): Promise<void> {
  const actor = req.user!;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      TRUNCATE 
        Scheduled_Games, 
        Prize_Pool, 
        Tickets, 
        Bookings, 
        Wallet_Ledger, 
        TopUp_Requests, 
        Game_Logs, 
        Audit_Log, 
        Promoter_Referrals, 
        Promoter_Commissions, 
        Bookie_Applications 
      RESTART IDENTITY CASCADE;
    `);
    
    await client.query(`
      UPDATE Users SET current_balance = 0.00;
    `);
    
    await client.query('COMMIT');
    
    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'RESET_DATABASE',
      targetType: 'Database',
      targetDescription: 'Truncated stats, transactions, games, bookings, ledgers, and reset user balances to 0.00',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Database reset completed successfully!' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting database:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Upload an audio file for a config setting key (Superadmin only)
 * Expects key and audio_data (base64 string) in JSON body
 */
export async function uploadConfigAudio(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { key, audio_data } = req.body;
  const actor = req.user!;

  if (!key || !audio_data || typeof audio_data !== 'string') {
    res.status(400).json({ message: 'key and audio_data are required' });
    return;
  }

  clearPublicConfigCache();

  const allowedKeys = [
    'welcome_voice_url',
    'instruction_voice_url',
    'background_music_url',
    'lobby_music_url_1',
    'lobby_music_url_2',
    'lobby_music_url_3',
    'lobby_music_url_4',
    'lobby_music_url_5'
  ];

  if (!allowedKeys.includes(key)) {
    res.status(400).json({ message: `Invalid config key for audio upload: ${key}` });
    return;
  }

  try {
    const mimeMatch = audio_data.match(/^data:([^;]+);base64,/);
    const mimeType = (mimeMatch ? mimeMatch[1] : '').toLowerCase();
    
    let ext = 'mp3';
    if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('ogg')) ext = 'ogg';
    else if (mimeType.includes('webm')) ext = 'webm';
    else if (mimeType.includes('aac')) ext = 'aac';
    else if (mimeType.includes('flac')) ext = 'flac';
    else if (mimeType.includes('opus')) ext = 'opus';
    else if (mimeType.includes('3gp') || mimeType.includes('3gpp')) ext = '3gp';
    else if (mimeType.includes('wma')) ext = 'wma';
    else if (mimeType.includes('m4a') || mimeType.includes('x-m4a') || mimeType.includes('mp4a')) ext = 'm4a';
    else if (mimeType.includes('video/mp4') || mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('mpeg') || mimeType.includes('mpg')) ext = 'mp3';

    const base64Data = audio_data.split(';base64,').pop();
    if (!base64Data) {
      res.status(400).json({ message: 'Invalid base64 audio data' });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Resolve destinations:
    // 1. backend persistent uploads: backend/uploads/audio/config
    // 2. frontend public: frontend/public/audio/config
    const backendUploadDir = path.resolve(__dirname, '../../../uploads/audio/config');
    fs.mkdirSync(backendUploadDir, { recursive: true });

    let rootDir = process.cwd();
    if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
      rootDir = path.resolve(rootDir, '..');
    }
    const frontendPublicDir = path.resolve(rootDir, 'frontend/public/audio/config');
    try { fs.mkdirSync(frontendPublicDir, { recursive: true }); } catch {}

    // Clean up any existing files for this key
    [backendUploadDir, frontendPublicDir].forEach((dir) => {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            if (file.startsWith(`${key}-`) || file.startsWith(`${key}.`)) {
              try { fs.unlinkSync(path.join(dir, file)); } catch {}
            }
          });
        } catch {}
      }
    });

    const timestamp = Date.now();
    const filename = `${key}-${timestamp}.${ext}`;
    
    fs.writeFileSync(path.join(backendUploadDir, filename), buffer);
    try { fs.writeFileSync(path.join(frontendPublicDir, filename), buffer); } catch {}

    const audioUrl = `/api/config/audio-file/${filename}`;

    const result = await pool.query(
      `UPDATE Platform_Config 
       SET config_value = $1, updated_by = $2, updated_at = NOW() 
       WHERE config_key = $3
       RETURNING *`,
      [audioUrl, actor.userId, key]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Config key not found' });
      return;
    }

    // Broadcast config updates
    io.emit('config_update', { [key]: audioUrl });

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_PLATFORM_CONFIG',
      targetType: 'Platform_Config',
      targetDescription: `Uploaded audio config for key: ${key}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Audio uploaded successfully', url: audioUrl });
  } catch (error) {
    console.error('Error uploading config audio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

