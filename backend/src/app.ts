/**
 * Express Application Configuration
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { CONSTANTS } from './config/constants';

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
import playerRoutes from './modules/player/player.routes';
import promoterRoutes from './modules/promoter/promoter.routes';

const app = express();

// Trust the reverse proxy (nginx / Railway) so req.ip and secure-cookie logic
// see the real client address and protocol instead of the proxy's.
app.set('trust proxy', 1);

// 0. Security headers (dependency-free; this is a JSON/SSE API, no HTML/CSP).
//    Adds defense-in-depth headers on every response.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // API returns JSON/SSE only, so a strict CSP that forbids any active content
  // is safe and blocks a whole class of response-injection escalation.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 1. CORS Configuration
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// 3. Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// 4. Booking Specific Rate Limiter
const bookingLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: CONSTANTS.RATE_LIMIT_BOOKING,
  message: { message: 'Too many booking attempts. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/bookings/lock', bookingLimiter);

// 4b. Login brute-force limiter — guards the staff login route specifically.
// Only FAILED attempts count (skipSuccessfulRequests skips 2xx/3xx responses),
// so a staff member signing in normally is never throttled, while an IP guessing
// passwords is locked out after MAX_LOCK_ATTEMPTS_PER_MINUTE failures for
// LOCK_DURATION_MINUTES. This wires up the LOCK_DURATION_MINUTES /
// MAX_LOCK_ATTEMPTS_PER_MINUTE env vars, which were defined but never applied to a
// route (the shared 100-req/min global limiter was the only prior guard on login).
// IP-based (not per-account) so an attacker can't lock a victim out of their account.
const loginLimiter = rateLimit({
  windowMs: env.LOCK_DURATION_MINUTES * 60 * 1000,
  max: env.MAX_LOCK_ATTEMPTS_PER_MINUTE,
  skipSuccessfulRequests: true,
  message: { message: 'Too many failed login attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

// 5. Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/config', configRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/promoter', promoterRoutes);
app.use('/api', ticketsRoutes); // Exposes /api/tickets/:ticket_id and /api/games/:game_id/tickets

// Default Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'An internal server error occurred' });
});

export default app;
