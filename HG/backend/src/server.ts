/**
 * Backend Entrypoint - Boots HTTP, Socket.io, Redis, and Cron Services
 */

import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectRedis } from './db/redis';
import { initGameEngineSubscription } from './services/gameEngine';
import { startExpirySweeper } from './services/scheduler.service';

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
  console.log(`🔌 Client connected: ${socket.id}`);

  // Handle staff authentication / room entry
  socket.on('join_game_room', (gameId: string) => {
    socket.join(`game-${gameId}`);
    console.log(`🔌 Client ${socket.id} joined room game-${gameId}`);
  });

  socket.on('join_agent_room', (agentId: string) => {
    socket.join(`agent-${agentId}`);
    console.log(`🔌 Agent ${socket.id} joined room agent-${agentId}`);
  });

  // Admins/Superadmins join a shared room to receive top-up requests and platform events
  socket.on('join_admin_room', () => {
    socket.join('admin-room');
    console.log(`🔌 Staff ${socket.id} joined admin-room`);
  });

  socket.on('leave_game_room', (gameId: string) => {
    socket.leave(`game-${gameId}`);
    console.log(`🔌 Client ${socket.id} left room game-${gameId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
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

    // 4. Start Auto-Expiry Sweeper cron job
    startExpirySweeper();

    // 5. Start listening
    const PORT = env.PORT;
    server.listen(PORT, () => {
      console.log(`🚀 Housie Ghar API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('💥 Crash during server boot:', error);
    process.exit(1);
  }
}

boot();
