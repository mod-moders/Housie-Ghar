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
      'SELECT number, call_text, default_text, audio_url, call_mode FROM Number_Calls ORDER BY number ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing number calls:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update call_text and/or call_mode for a number (Admin+)
 */
export async function updateNumberCall(req: Request, res: Response): Promise<void> {
  const { number } = req.params;
  const { call_text, call_mode } = req.body;

  try {
    const result = await pool.query(
      `UPDATE Number_Calls 
       SET call_text = COALESCE($1, call_text), 
           call_mode = COALESCE($2, call_mode) 
       WHERE number = $3 
       RETURNING *`,
      [call_text, call_mode, parseInt(number as string, 10)]
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
    const base64Data = audio_data.split(';base64,').pop();
    if (!base64Data) {
      res.status(400).json({ message: 'Invalid base64 audio data' });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Resolve destination: frontend/public/audio/calls/
    const destDir = path.resolve(__dirname, '../../../../frontend/public/audio/calls');
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, `${number}.mp3`);

    fs.writeFileSync(destPath, buffer);

    const audioUrl = `/audio/calls/${number}.mp3`;

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
