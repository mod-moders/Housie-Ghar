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
import rewardsRoutes from './modules/rewards/rewards.routes';

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
//
// The 50mb limit used to apply to EVERY route, which handed any unauthenticated
// caller a 50mb-per-request memory amplifier on endpoints whose real payload is
// a few hundred bytes. Only four routes legitimately carry a large body, so they
// keep the generous limit and everything else drops to 1mb.
//
// body-parser marks a request as parsed (`req._body`), so these run first and
// the global parser below skips whatever they already handled.
const LARGE_BODY = { limit: '50mb' } as const;
// Base64 audio uploads (staff only).
app.use('/api/config/upload', express.json(LARGE_BODY));
app.use('/api/games/number-calls', express.json(LARGE_BODY));
// Avatar data: URIs. The UI caps the source file at 5MB, which base64 inflates
// to roughly 7MB — 1mb would reject a perfectly ordinary profile picture.
app.use('/api/player/me', express.json({ limit: '12mb' }));
app.use('/api/auth/me', express.json({ limit: '12mb' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

// 3. Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_GLOBAL_MAX, // Limit each IP per windowMs
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

// 4c. Player auth limiter. The staff limiter above only covered /api/auth/login,
// so player sign-in fell back to the shared 1200/min global limiter — enough
// headroom to enumerate housie names or grind a player's password. Failed
// attempts only, so a normal sign-in is never throttled.
const playerAuthLimiter = rateLimit({
  windowMs: env.LOCK_DURATION_MINUTES * 60 * 1000,
  max: env.MAX_LOCK_ATTEMPTS_PER_MINUTE,
  skipSuccessfulRequests: true,
  message: { message: 'Too many failed attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/player/login', playerAuthLimiter);

// Password recovery is unauthenticated by necessity — the caller is locked out — and
// /reset-password checks a phone number, which is short enough to grind. Same
// failed-attempts-only shape as the login limiter, so a genuine reset is never
// throttled. /forgot-password counts EVERY request instead: it succeeds by design
// whatever name you give it, so skipping successes would leave it unlimited.
app.use('/api/player/reset-password', playerAuthLimiter);
app.use(
  '/api/player/forgot-password',
  rateLimit({
    windowMs: env.LOCK_DURATION_MINUTES * 60 * 1000,
    max: env.MAX_LOCK_ATTEMPTS_PER_MINUTE,
    message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Signup counts SUCCESSFUL requests too — the abuse here is bulk account
// creation (squatting housie names), not guessing a credential.
const signupLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW_MS,
  max: 10,
  message: { message: 'Too many sign-up attempts. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/player/signup', signupLimiter);

import path from 'path';
import fs from 'fs';

// Serve audio uploaded files with byte-range requests support
const backendConfigAudioDir = path.resolve(__dirname, '../uploads/audio/config');
const backendCallsAudioDir = path.resolve(__dirname, '../uploads/audio/calls');
let rootDir = process.cwd();
if (path.basename(rootDir) === 'backend' || path.basename(rootDir) === 'frontend') {
  rootDir = path.resolve(rootDir, '..');
}
const frontendConfigAudioDir = path.resolve(rootDir, 'frontend/public/audio/config');
const frontendCallsAudioDir = path.resolve(rootDir, 'frontend/public/audio/calls');

fs.mkdirSync(backendConfigAudioDir, { recursive: true });
fs.mkdirSync(backendCallsAudioDir, { recursive: true });

const staticAudioOptions = {
  setHeaders: (res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');
  }
};

app.use('/api/config/audio-file', express.static(backendConfigAudioDir, staticAudioOptions));
app.use('/api/config/audio-file', express.static(frontendConfigAudioDir, staticAudioOptions));
app.use('/api/games/number-calls/audio-file', express.static(backendCallsAudioDir, staticAudioOptions));
app.use('/api/games/number-calls/audio-file', express.static(frontendCallsAudioDir, staticAudioOptions));

app.use('/audio/config', express.static(backendConfigAudioDir, staticAudioOptions));
app.use('/audio/config', express.static(frontendConfigAudioDir, staticAudioOptions));
app.use('/audio/calls', express.static(backendCallsAudioDir, staticAudioOptions));
app.use('/audio/calls', express.static(frontendCallsAudioDir, staticAudioOptions));

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
app.use('/api/rewards', rewardsRoutes);
app.use('/api', ticketsRoutes); // Exposes /api/tickets/:ticket_id and /api/games/:game_id/tickets

// Default Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

// Unknown route — answer 404 rather than falling through to the error handler.
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);

  // The live-stream route streams SSE, so by the time an error surfaces the
  // status line and headers are long gone. Writing a 500 body over that throws
  // ERR_HTTP_HEADERS_SENT and takes down the response instead of the request;
  // hand it to Express's default handler, which just destroys the socket.
  if (res.headersSent) {
    next(err);
    return;
  }

  // A body larger than the route's configured limit is the caller's mistake.
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    res.status(413).json({ message: 'Request body is too large.' });
    return;
  }

  // Malformed JSON likewise — body-parser throws a SyntaxError with a 400.
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({ message: 'Invalid JSON body.' });
    return;
  }

  res.status(500).json({ message: 'An internal server error occurred' });
});

export default app;
