/**
 * Express Application Configuration
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { CONSTANTS } from './config/constants';
import { logger } from './utils/logger';

// Route Imports
import authRoutes from './modules/auth/auth.routes';
import gamesRoutes from './modules/games/games.routes';
import bookingsRoutes from './modules/bookings/bookings.routes';
import ticketsRoutes from './modules/tickets/tickets.routes';
import usersRoutes from './modules/users/users.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import configRoutes from './modules/config/config.routes';
import auditRoutes from './modules/audit/audit.routes';
import statsRoutes from './modules/stats/stats.routes';
import playersRoutes from './modules/players/players.routes';
import settlementsRoutes from './modules/settlements/settlements.routes';
import { AUDIO_CALLS_DIR } from './modules/games/numberCalls.controller';

const app = express();

// 1. Security Headers (before routes)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'wss:', 'https:'],
      },
    },
  })
);

// 2. CORS Configuration
app.use(
  cors({
    // In production, restrict to the configured origin(s). In development,
    // reflect the request origin so the app is reachable from any LAN device
    // (e.g. a phone hitting http://192.168.x.x:3000) without extra config.
    origin:
      env.NODE_ENV === 'production'
        ? env.FRONTEND_URL.split(',').map((s) => s.trim())
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Parsers
// Caller MP3s arrive as base64 JSON — allow a bigger body on that path only.
// (express.json marks the body parsed, so the global parser below skips it.)
app.use('/api/games/number-calls', express.json({ limit: '6mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 4. Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// 5. Booking Specific Rate Limiter
const bookingLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: CONSTANTS.RATE_LIMIT_BOOKING,
  message: { message: 'Too many booking attempts. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/bookings/lock', bookingLimiter);

// 6. Strict Auth Rate Limiter — 5 failures per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// app.use('/api/auth/login', authLimiter);
// app.use('/api/players/login', authLimiter);

// 7. Slow-request logger — warns on any request taking >500ms
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 500) logger.warn({ method: req.method, path: req.path, ms }, 'slow request');
  });
  next();
});

// 8. Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/config', configRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/settlements', settlementsRoutes);
app.use('/api', ticketsRoutes); // Exposes /api/tickets/:ticket_id and /api/games/:game_id/tickets

// Uploaded caller MP3s (see numberCalls.controller). CORP header is required
// because helmet defaults to same-origin, which would block the frontend
// origin from playing audio served by the API host.
app.use(
  '/audio/calls',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(AUDIO_CALLS_DIR, { maxAge: '1h' })
);

// Default Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled server error');
  res.status(500).json({ message: 'An internal server error occurred' });
});

export default app;
