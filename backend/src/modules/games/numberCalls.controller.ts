import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../../db';

/**
 * List all number call settings (public so players can download caller voices)
 */
export async function listNumberCalls(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT number, call_text, default_text, audio_url, call_mode, volume FROM Number_Calls ORDER BY number ASC'
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
 * Expects audio_data as base64 string in JSON body
 */
export async function uploadNumberAudio(req: Request, res: Response): Promise<void> {
  const { number } = req.params;
  const { audio_data } = req.body;

  if (!audio_data || typeof audio_data !== 'string') {
    res.status(400).json({ message: 'audio_data is required as a base64 string' });
    return;
  }

  try {
    const mimeMatch = audio_data.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    
    let ext = 'mp3';
    if (mimeType.includes('video/mp4') || mimeType.includes('mp4')) {
      ext = 'mp4';
    } else if (mimeType.includes('wav')) {
      ext = 'wav';
    } else if (mimeType.includes('m4a')) {
      ext = 'm4a';
    }

    const base64Data = audio_data.split(';base64,').pop();
    if (!base64Data) {
      res.status(400).json({ message: 'Invalid base64 audio data' });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Resolve destination: frontend/public/audio/calls/
    const destDir = path.resolve(__dirname, '../../../../frontend/public/audio/calls');
    fs.mkdirSync(destDir, { recursive: true });

    // Clean up any existing files for this number with common extensions so we don't have duplicate file forms
    const possibleExts = ['mp3', 'mp4', 'wav', 'm4a'];
    possibleExts.forEach((e) => {
      const oldPath = path.join(destDir, `${number}.${e}`);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    });

    const destPath = path.join(destDir, `${number}.${ext}`);
    fs.writeFileSync(destPath, buffer);

    const audioUrl = `/audio/calls/${number}.${ext}`;

    const result = await pool.query(
      `UPDATE Number_Calls 
       SET audio_url = $1, 
           call_mode = 'Audio' 
       WHERE number = $2 
       RETURNING *`,
      [audioUrl, parseInt(number as string, 10)]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading number audio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Delete audio file for a number and reset call mode back to 'Text' (Admin+)
 */
export async function deleteNumberAudio(req: Request, res: Response): Promise<void> {
  const { number } = req.params;

  try {
    // 1. Resolve path and clean up existing files
    const destDir = path.resolve(__dirname, '../../../../frontend/public/audio/calls');
    const possibleExts = ['mp3', 'mp4', 'wav', 'm4a'];
    possibleExts.forEach((e) => {
      const filePath = path.join(destDir, `${number}.${e}`);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });

    // 2. Clear audio_url and reset call_mode to 'Text' in DB
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET audio_url = NULL, 
           call_mode = 'Text'
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

    res.json({ message: `Updated volume for ${result.rowCount} numbers`, volume: parseFloat(volume) });
  } catch (error) {
    console.error('Error bulk updating volumes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
