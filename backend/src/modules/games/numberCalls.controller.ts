import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../../db';
import { faststartMp4 } from '../../utils/mp4Faststart';

/**
 * List all number call settings (public so players can download caller voices)
 */
export async function listNumberCalls(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT number, call_text, default_text, audio_url, audio_url_en, audio_url_ne, call_mode, volume FROM Number_Calls ORDER BY number ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing number calls:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update call_text, call_mode, and/or volume for a number (Admin+)
 */
export async function updateNumberCall(req: Request, res: Response): Promise<void> {
  const { number } = req.params;
  const { call_text, call_mode, volume } = req.body;

  try {
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET call_text = COALESCE($1, call_text), 
           call_mode = COALESCE($2, call_mode),
           volume = CASE WHEN $3::float IS NOT NULL THEN $3::float ELSE volume END
       WHERE number = $4 
       RETURNING *`,
      [call_text, call_mode, volume !== undefined ? parseFloat(volume) : null, parseInt(number as string, 10)]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    req.app.get('io')?.emit('number_calls_update');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating number call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Restore call_text to default_text (Admin+)
 */
export async function restoreDefaultCallText(req: Request, res: Response): Promise<void> {
  const { number } = req.params;

  try {
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET call_text = default_text 
       WHERE number = $1 
       RETURNING *`,
      [parseInt(number as string, 10)]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error restoring default call text:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Upload mp3 audio file for a number (Admin+)
 * Expects audio_data as base64 string and optional lang ('en' | 'ne') in JSON body
 */
export async function uploadNumberAudio(req: Request, res: Response): Promise<void> {
  const { number } = req.params;
  const { audio_data, lang } = req.body;
  const targetLang = (lang === 'ne' || lang === 'nepali') ? 'ne' : 'en';

  if (!audio_data || typeof audio_data !== 'string') {
    res.status(400).json({ message: 'audio_data is required as a base64 string' });
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

    const rawBuffer = Buffer.from(base64Data, 'base64');
    const buffer = faststartMp4(rawBuffer);

    const backendUploadDir = path.resolve(__dirname, '../../../uploads/audio/calls');
    fs.mkdirSync(backendUploadDir, { recursive: true });

    let rootDir = process.cwd();
    if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
      rootDir = path.resolve(rootDir, '..');
    }
    const frontendPublicDir = path.resolve(rootDir, 'frontend/public/audio/calls');
    try { fs.mkdirSync(frontendPublicDir, { recursive: true }); } catch {}

    const filePrefix = targetLang === 'ne' ? `${number}_ne` : `${number}_en`;
    const possibleExts = ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'flac', 'opus', '3gp', 'wma'];
    [backendUploadDir, frontendPublicDir].forEach((dir) => {
      if (fs.existsSync(dir)) {
        possibleExts.forEach((e) => {
          const oldPath = path.join(dir, `${filePrefix}.${e}`);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch {}
          }
        });
      }
    });

    const filename = `${filePrefix}.${ext}`;
    fs.writeFileSync(path.join(backendUploadDir, filename), buffer);
    try { fs.writeFileSync(path.join(frontendPublicDir, filename), buffer); } catch {}

    const audioUrl = `/api/games/number-calls/audio-file/${filename}`;
    const numVal = parseInt(number as string, 10);

    // $2::int cast is required: $2 is also used inside 'Number ' || $2 below, and Postgres
    // infers a single type per placeholder across the whole query — left bare, that text
    // concatenation makes it infer $2 as text, conflicting with its use as the integer
    // `number` column ("inconsistent types deduced for parameter $2"). This 500'd on EVERY
    // upload (both languages; EN just happened to be the one actually exercised, since NEP's
    // existing files came from migration 042's backfill UPDATE, not this INSERT).
    const updateQuery = targetLang === 'ne'
      ? `INSERT INTO Number_Calls (number, audio_url_ne, audio_url, call_mode, call_text, default_text)
         VALUES ($2::int, $1, $1, 'Audio', 'Number ' || $2::int, 'Number ' || $2::int)
         ON CONFLICT (number) DO UPDATE
         SET audio_url_ne = EXCLUDED.audio_url_ne,
             audio_url = COALESCE(Number_Calls.audio_url_en, EXCLUDED.audio_url_ne),
             call_mode = 'Audio'
         RETURNING *`
      : `INSERT INTO Number_Calls (number, audio_url_en, audio_url, call_mode, call_text, default_text)
         VALUES ($2::int, $1, $1, 'Audio', 'Number ' || $2::int, 'Number ' || $2::int)
         ON CONFLICT (number) DO UPDATE
         SET audio_url_en = EXCLUDED.audio_url_en,
             audio_url = EXCLUDED.audio_url_en,
             call_mode = 'Audio'
         RETURNING *`;

    const result = await pool.query(updateQuery, [audioUrl, numVal]);

    req.app.get('io')?.emit('number_calls_update');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading number audio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Delete audio file for a number and reset call mode back to 'Text' if both are empty (Admin+)
 */
export async function deleteNumberAudio(req: Request, res: Response): Promise<void> {
  const { number } = req.params;
  const targetLang = (req.query.lang || (req.body && req.body.lang) || '') as string;

  try {
    const backendUploadDir = path.resolve(__dirname, '../../../uploads/audio/calls');
    let rootDir = process.cwd();
    if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
      rootDir = path.resolve(rootDir, '..');
    }
    const frontendPublicDir = path.resolve(rootDir, 'frontend/public/audio/calls');
    const possibleExts = ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'flac', 'opus', '3gp', 'wma'];

    const unlinkFile = (prefix: string) => {
      [backendUploadDir, frontendPublicDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
          possibleExts.forEach((e) => {
            const filePath = path.join(dir, `${prefix}.${e}`);
            if (fs.existsSync(filePath)) {
              try { fs.unlinkSync(filePath); } catch {}
            }
          });
        }
      });
    };

    if (targetLang === 'ne') {
      unlinkFile(`${number}_ne`);
      await pool.query(
        `UPDATE Number_Calls 
         SET audio_url_ne = NULL,
             audio_url = audio_url_en,
             call_mode = CASE WHEN audio_url_en IS NULL THEN 'Text' ELSE 'Audio' END
         WHERE number = $1`,
        [parseInt(number as string, 10)]
      );
    } else if (targetLang === 'en') {
      unlinkFile(`${number}_en`);
      await pool.query(
        `UPDATE Number_Calls 
         SET audio_url_en = NULL,
             audio_url = audio_url_ne,
             call_mode = CASE WHEN audio_url_ne IS NULL THEN 'Text' ELSE 'Audio' END
         WHERE number = $1`,
        [parseInt(number as string, 10)]
      );
    } else {
      unlinkFile(`${number}_en`);
      unlinkFile(`${number}_ne`);
      unlinkFile(`${number}`);
      await pool.query(
        `UPDATE Number_Calls 
         SET audio_url = NULL, audio_url_en = NULL, audio_url_ne = NULL, call_mode = 'Text'
         WHERE number = $1`,
        [parseInt(number as string, 10)]
      );
    }

    const result = await pool.query(
      `SELECT * FROM Number_Calls WHERE number = $1`,
      [parseInt(number as string, 10)]
    );

    req.app.get('io')?.emit('number_calls_update');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error deleting number audio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update volume for all number calls in bulk (Superadmin only)
 */
export async function updateBulkVolume(req: Request, res: Response): Promise<void> {
  const { volume } = req.body;

  if (volume === undefined) {
    res.status(400).json({ message: 'Volume is required' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET volume = $1
       RETURNING *`,
      [parseFloat(volume)]
    );

    req.app.get('io')?.emit('number_calls_update');
    res.json({ message: `Updated volume for ${result.rowCount} numbers`, volume: parseFloat(volume) });
  } catch (error) {
    console.error('Error bulk updating volumes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update call mode for all number calls in bulk (Superadmin only)
 */
export async function updateBulkMode(req: Request, res: Response): Promise<void> {
  const { call_mode } = req.body;

  if (call_mode !== 'Text' && call_mode !== 'Audio') {
    res.status(400).json({ message: 'Valid call_mode is required (Text or Audio)' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET call_mode = $1
       RETURNING *`,
      [call_mode]
    );

    req.app.get('io')?.emit('number_calls_update');
    res.json({ message: `Updated call mode to ${call_mode} for ${result.rowCount} numbers`, call_mode });
  } catch (error) {
    console.error('Error bulk updating call modes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

