/**
 * Number Calls Controller — per-number caller phrases + optional MP3 clips
 * for the live-board audio caller. All 90 rows are seeded by migration 020;
 * staff only ever edit them, never create or delete.
 */

import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import pool from '../../db';
import { logger } from '../../utils/logger';
import { logAuditEvent } from '../../services/audit.service';
import { AuthenticatedRequest } from '../../middleware/auth';

/**
 * Uploaded MP3s live under the backend's own uploads dir, served at
 * /audio/calls by app.ts. (Never write into the frontend tree — the two apps
 * deploy to different hosts.)
 */
export const AUDIO_CALLS_DIR = path.resolve(process.cwd(), 'uploads', 'audio', 'calls');

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // a called number is a ~2s clip
const MAX_CALL_TEXT_LENGTH = 200;

function parseNumberParam(raw: unknown): number | null {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
}

/**
 * List all 90 call settings (public — the live board reads phrases/audio)
 */
export async function listNumberCalls(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT number, call_text, default_text, audio_url, call_mode
       FROM Number_Calls ORDER BY number ASC`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'error listing number calls');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update call_text and/or call_mode for one number (Admin+)
 */
export async function updateNumberCall(req: AuthenticatedRequest, res: Response): Promise<void> {
  const number = parseNumberParam(req.params.number);
  const { call_text, call_mode } = req.body ?? {};
  const actor = req.user!;

  if (number === null) {
    res.status(400).json({ message: 'number must be between 1 and 90' });
    return;
  }
  if (call_text == null && call_mode == null) {
    res.status(400).json({ message: 'Provide call_text and/or call_mode' });
    return;
  }
  if (call_text != null && (typeof call_text !== 'string' || !call_text.trim() || call_text.trim().length > MAX_CALL_TEXT_LENGTH)) {
    res.status(400).json({ message: `call_text must be a non-empty string of at most ${MAX_CALL_TEXT_LENGTH} characters` });
    return;
  }
  if (call_mode != null && call_mode !== 'Text' && call_mode !== 'Audio') {
    res.status(400).json({ message: "call_mode must be 'Text' or 'Audio'" });
    return;
  }

  try {
    if (call_mode === 'Audio') {
      const existing = await pool.query(`SELECT audio_url FROM Number_Calls WHERE number = $1`, [number]);
      if (existing.rowCount === 0) {
        res.status(404).json({ message: 'Number call setting not found' });
        return;
      }
      if (!existing.rows[0].audio_url) {
        res.status(400).json({ message: 'Upload an MP3 for this number before switching it to Audio mode' });
        return;
      }
    }

    const result = await pool.query(
      `UPDATE Number_Calls
       SET call_text = COALESCE($1, call_text),
           call_mode = COALESCE($2, call_mode)
       WHERE number = $3
       RETURNING number, call_text, default_text, audio_url, call_mode`,
      [call_text != null ? call_text.trim() : null, call_mode ?? null, number]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_NUMBER_CALL',
      targetType: 'Number_Call',
      targetId: String(number),
      targetDescription: `Updated caller for number ${number}${call_text != null ? ` — "${call_text.trim()}"` : ''}${call_mode != null ? ` (mode: ${call_mode})` : ''}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'error updating number call');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Restore call_text to the seeded default (Admin+)
 */
export async function restoreDefaultCallText(req: AuthenticatedRequest, res: Response): Promise<void> {
  const number = parseNumberParam(req.params.number);
  const actor = req.user!;

  if (number === null) {
    res.status(400).json({ message: 'number must be between 1 and 90' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Number_Calls
       SET call_text = default_text
       WHERE number = $1
       RETURNING number, call_text, default_text, audio_url, call_mode`,
      [number]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_NUMBER_CALL',
      targetType: 'Number_Call',
      targetId: String(number),
      targetDescription: `Restored default caller text for number ${number}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'error restoring default call text');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Upload an MP3 clip for one number (Admin+)
 * Body: { audio_data } — base64 string, optionally a data: URI
 */
export async function uploadNumberAudio(req: AuthenticatedRequest, res: Response): Promise<void> {
  const number = parseNumberParam(req.params.number);
  const { audio_data } = req.body ?? {};
  const actor = req.user!;

  if (number === null) {
    res.status(400).json({ message: 'number must be between 1 and 90' });
    return;
  }
  if (!audio_data || typeof audio_data !== 'string') {
    res.status(400).json({ message: 'audio_data is required as a base64 string' });
    return;
  }

  try {
    const base64Data = audio_data.includes(';base64,') ? audio_data.split(';base64,').pop() : audio_data;
    if (!base64Data) {
      res.status(400).json({ message: 'Invalid base64 audio data' });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      res.status(400).json({ message: 'Invalid base64 audio data' });
      return;
    }
    if (buffer.length === 0) {
      res.status(400).json({ message: 'Audio file is empty' });
      return;
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      res.status(400).json({ message: `Audio file too large (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)` });
      return;
    }

    await fs.mkdir(AUDIO_CALLS_DIR, { recursive: true });
    await fs.writeFile(path.join(AUDIO_CALLS_DIR, `${number}.mp3`), buffer);

    const audioUrl = `/audio/calls/${number}.mp3`;
    const result = await pool.query(
      `UPDATE Number_Calls
       SET audio_url = $1,
           call_mode = 'Audio'
       WHERE number = $2
       RETURNING number, call_text, default_text, audio_url, call_mode`,
      [audioUrl, number]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Number call setting not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'UPDATE_NUMBER_CALL',
      targetType: 'Number_Call',
      targetId: String(number),
      targetDescription: `Uploaded caller audio for number ${number} (${(buffer.length / 1024).toFixed(0)}KB)`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'error uploading number audio');
    res.status(500).json({ message: 'Internal server error' });
  }
}
