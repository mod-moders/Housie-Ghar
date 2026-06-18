/**
 * Backend Entrypoint - Boots HTTP, Socket.io, Redis, and Cron Services
 */

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectRedis } from './db/redis';
import { initGameEngineSubscription, resumeInterruptedGames } from './services/gameEngine';
import { startExpirySweeper } from './services/scheduler.service';
import { logger } from './utils/logger';

const server = http.createServer(app);

// 1. Initialize Socket.io
export const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  logger.debug({ socketId: socket.id }, 'client connected');

  socket.on('join_game_room', (gameId: string) => {
    socket.join(`game-${gameId}`);
  });

  socket.on('join_agent_room', (agentId: string) => {
    socket.join(`agent-${agentId}`);
  });

  socket.on('join_operator_room', (operatorId: string) => {
    socket.join(`operator-${operatorId}`);
  });

  socket.on('join_admin_room', () => {
    socket.join('admin-room');
  });

  socket.on('leave_game_room', (gameId: string) => {
    socket.leave(`game-${gameId}`);
  });

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'client disconnected');
  });
});

/**
 * Boot Server
 */
async function boot() {
  try {
    // 2. Connect Redis clients
    await connectRedis();

    // 3. Start Game Engine Redis pub/sub listener
    await initGameEngineSubscription();

    // 4. Resume any games that were Live when the process last died
    await resumeInterruptedGames();

    // 5. Start Auto-Expiry Sweeper cron job
    startExpirySweeper();

    // 5. Start listening
    const PORT = env.PORT;
    server.listen(PORT, () => {
      logger.info({ port: PORT }, 'Housie Ghar API running');
    });
  } catch (error) {
    logger.error({ err: error }, 'Crash during server boot');
    process.exit(1);
  }
}

boot();
