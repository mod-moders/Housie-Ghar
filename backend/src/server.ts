/**
 * Backend Entrypoint - Boots HTTP, Socket.io, Redis, and Cron Services
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectRedis } from './db/redis';
import { initGameEngineSubscription, resumeInterruptedGames } from './services/gameEngine';
import { startExpirySweeper } from './services/scheduler.service';
import { socketAuth, authorizeRoomJoin } from './middleware/socketAuth';
import { ensureSuperadminAccess, ensurePlatformConfig, restorePersistedAudioFiles } from './services/superadminHeal';

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

app.set('io', io);

// Authenticate every socket best-effort (attaches socket.data.user for a valid
// staff cookie). The connection stays open for anonymous clients so the public
// config_update / game-draw broadcasts keep working; sensitive room joins are
// gated below by authorizeRoomJoin.
io.use(socketAuth);

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a room only if the socket is authorized for it. Sensitive rooms
  // (admin/agent/operator) require a verified staff token + role/identity;
  // game rooms carry public draw data and are open to anyone.
  const tryJoin = (room: string) => {
    if (!authorizeRoomJoin(socket, room)) {
      console.warn(`⛔ Socket ${socket.id} denied join to room ${room}`);
      socket.emit('room_join_denied', { room });
      return;
    }
    socket.join(room);
    console.log(`🔌 Client ${socket.id} joined room ${room}`);
  };

  socket.on('join_game_room', (gameId: string) => tryJoin(`game-${gameId}`));
  socket.on('join_agent_room', (agentId: string) => tryJoin(`agent-${agentId}`));
  // Operators join their own room to receive overflow-failsafe booking requests
  socket.on('join_operator_room', (operatorId: string) => tryJoin(`operator-${operatorId}`));
  // Admins/Superadmins join a shared room to receive top-up requests and platform events
  socket.on('join_admin_room', () => tryJoin('admin-room'));

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

    // 2b. Restore Superadmin login if its password is unusable (opt-in via
    //     SUPERADMIN_TEMP_PASSWORD). No-op unless that env var is set and the
    //     stored password is missing/not-a-real-bcrypt-hash.
    await ensureSuperadminAccess();
    await ensurePlatformConfig();
    await restorePersistedAudioFiles();

    // 2c. JWT keypair self-check. A private/public mismatch is invisible at
    //     login (signing succeeds) but kills every session (verify fails), so
    //     staff bounce straight back to the login page. Fail loudly at boot.
    try {
      const probe = jwt.sign({ probe: true }, env.JWT_PRIVATE_KEY, { algorithm: 'RS256' as any, expiresIn: '1m' as any });
      jwt.verify(probe, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      console.log('✅ JWT keypair self-check passed (sign → verify round-trip OK)');
    } catch (e) {
      console.error('❌ JWT keypair self-check FAILED — logins will return 200 but no session will survive:', e);
    }

    // 3. Start Game Engine Redis pub/sub listener
    await initGameEngineSubscription();

    // 4. Resume any games that were Live when the process last died
    await resumeInterruptedGames();

    // 5. Start Auto-Expiry Sweeper cron job
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
