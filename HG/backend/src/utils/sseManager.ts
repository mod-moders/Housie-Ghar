/**
 * Server-Sent Events (SSE) Manager
 * Manages one-way SSE streams to player clients
 */

import { Response } from 'express';
import { SSEEvent } from '@shared/types/events';
import { logger } from './logger';

// Map of gameId -> array of active client responses
const gameClients = new Map<string, Response[]>();

export const sseManager = {
  /**
   * Register a new client SSE response for a game
   */
  register(gameId: string, res: Response): void {
    if (!gameClients.has(gameId)) {
      gameClients.set(gameId, []);
    }
    gameClients.get(gameId)!.push(res);

    // Remove client when connection closes
    res.on('close', () => {
      this.unregister(gameId, res);
    });
  },

  /**
   * Unregister a client SSE response
   */
  unregister(gameId: string, res: Response): void {
    const clients = gameClients.get(gameId);
    if (clients) {
      gameClients.set(
        gameId,
        clients.filter((client) => client !== res)
      );
      if (gameClients.get(gameId)!.length === 0) {
        gameClients.delete(gameId);
      }
    }
  },

  /**
   * Broadcast an event to all connected players of a game
   */
  broadcast(gameId: string, eventPayload: SSEEvent): void {
    const clients = gameClients.get(gameId);
    if (!clients || clients.length === 0) return;

    const data = `data: ${JSON.stringify(eventPayload)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(data);
      } catch (err) {
        logger.error({ err }, 'error writing to SSE client');
      }
    });
  },

  /**
   * Broadcast an event to every connected client across all games.
   * Used for platform-wide events such as theme changes.
   */
  broadcastAll(eventPayload: SSEEvent): void {
    const data = `data: ${JSON.stringify(eventPayload)}\n\n`;
    for (const clients of gameClients.values()) {
      clients.forEach((client) => {
        try {
          client.write(data);
        } catch (err) {
          logger.error({ err }, 'error writing to SSE client');
        }
      });
    }
  },

  /**
   * Get active connection count for a game
   */
  getLivePlayerCount(gameId: string): number {
    return gameClients.get(gameId)?.length || 0;
  },
};
