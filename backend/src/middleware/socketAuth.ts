/**
 * Socket.io authentication + room authorization.
 *
 * The HTTP API is protected by authenticateToken / authenticatePlayer, but the
 * real-time layer historically accepted any connection and let a client join
 * ANY room by name. That leaked staff/financial events (top-up requests with
 * agent names + amounts, booking details with player housie names, wallet
 * credit/debit amounts) to unauthenticated clients.
 *
 * Design constraints:
 *  - The connection itself must stay open to anonymous clients: every visitor
 *    (including logged-out players) opens a socket via ConfigProvider purely to
 *    receive the PUBLIC `config_update` broadcast. Rejecting at the handshake
 *    would break the public lobby.
 *  - Sensitive rooms (admin/agent/operator) must require a verified staff JWT
 *    and the right role/identity. Game rooms carry only public draw data and
 *    stay open.
 *
 * So we authenticate best-effort in `io.use` (attach the decoded staff user to
 * `socket.data.user` when a valid `hg_auth_token` cookie is present) and enforce
 * per-room rules at join time via `authorizeRoomJoin`.
 */

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { CONSTANTS } from '../config/constants';
import { RoleName } from '@shared/types/user';

export interface SocketUser {
  userId: string;
  roleName: RoleName;
  fullName: string;
  email: string;
}

/** Roles allowed into the shared admin room (top-up requests, platform events). */
const ADMIN_ROOM_ROLES: RoleName[] = ['Superadmin', 'Financial Admin', 'Operator'];
/** Roles allowed to observe ANY agent/operator room (oversight dashboards). */
const OVERSIGHT_ROLES: RoleName[] = ['Superadmin', 'Financial Admin'];

/** Minimal, dependency-free cookie header parser. */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

/**
 * `io.use` middleware. Never rejects: it only attaches `socket.data.user` when a
 * valid staff token is present so join-time authorization can make decisions.
 */
export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  try {
    let token = socket.handshake.auth?.token;
    if (!token) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      token = cookies[CONSTANTS.JWT_COOKIE_NAME];
    }
    if (token) {
      const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;
      socket.data.user = {
        userId: decoded.userId,
        roleName: decoded.roleName,
        fullName: decoded.fullName,
        email: decoded.email,
      } satisfies SocketUser;
    }
  } catch {
    // Invalid/expired token: treat as anonymous. Sensitive joins are denied
    // downstream; public rooms (config_update, game draws) still work.
  }
  next();
}

/**
 * Enforce per-room join rules. Returns true if the socket may join `room`.
 * Room name conventions match server.ts / the io.to(...) emit sites.
 */
export function authorizeRoomJoin(socket: Socket, room: string): boolean {
  const user = socket.data.user as SocketUser | undefined;

  // Public: live game draw stream. No sensitive data — players watch here.
  if (room.startsWith('game-')) return true;

  // Everything below is staff-only. No verified staff token => deny.
  if (!user) return false;

  // Shared admin room: top-up requests + platform events.
  if (room === 'admin-room') {
    return ADMIN_ROOM_ROLES.includes(user.roleName);
  }

  // Agent/operator rooms: you may join your OWN room, or any room if you hold
  // an oversight role (Financial Admin / Superadmin monitoring dashboards).
  if (room.startsWith('agent-') || room.startsWith('operator-')) {
    const targetId = room.slice(room.indexOf('-') + 1);
    if (OVERSIGHT_ROLES.includes(user.roleName)) return true;
    return targetId === user.userId;
  }

  // Unknown room name: deny by default.
  return false;
}
