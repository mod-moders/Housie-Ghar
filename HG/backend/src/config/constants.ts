/**
 * Application-wide constants
 */

export const CONSTANTS = {
  // Booking
  LOCK_DURATION_MS: 10 * 60 * 1000, // 10 minutes in milliseconds
  MAX_LOCK_ATTEMPTS: 5,              // Per minute per IP
  MAX_SIMULTANEOUS_LOCKS: 3,         // Per IP at any one time
  BOOKING_POLL_INTERVAL_MS: 3000,    // 3 seconds

  // Game Engine
  DEFAULT_DRAW_INTERVAL_MS: 4000,    // 4 seconds (Normal speed)
  MIN_DRAW_INTERVAL_MS: 3000,        // 3 seconds (Fast)
  MAX_DRAW_INTERVAL_MS: 12000,       // 12 seconds (Slow/Relaxed)
  TOTAL_NUMBERS: 90,                 // Numbers in Housie draw
  WINNER_PAUSE_MS: 4000,             // 4 seconds pause after win announcement
  TEASE_DELAY_MS: 1200,              // 1.2 second tease animation

  // Ticket Grid
  TICKET_ROWS: 3,
  TICKET_COLS: 9,
  NUMBERS_PER_ROW: 5,
  BLANKS_PER_ROW: 4,

  // Agent
  LOW_BALANCE_THRESHOLD: 500,        // ₹500

  // Housie Name
  HOUSIE_NAME_MIN_LENGTH: 3,
  HOUSIE_NAME_MAX_LENGTH: 20,

  // Cron
  EXPIRY_SWEEPER_INTERVAL: '*/30 * * * * *',  // Every 30 seconds
  BACKUP_SCHEDULE: '0 3 * * *',                 // 3:00 AM IST daily

  // Lucky Number (public lobby announcement)
  LUCKY_NUMBER_EPOCH_MS: Date.UTC(2026, 5, 1),   // 2026-06-01T00:00:00Z — fixed cycle anchor
  LUCKY_NUMBER_CYCLE_DAYS: 12,                   // display refresh contract
  LUCKY_NUMBER_SAMPLE_GAMES: 60,                 // most recent completed games per cycle

  // Prize Patterns
  PRIZE_PATTERNS: [
    'Early Five',
    'Top Line',
    'Middle Line',
    'Bottom Line',
    'Four Corners',
    'Full House',
  ] as const,

  // Prize Pool Constraint
  MAX_PRIZE_POOL_PERCENTAGE: 0.80,   // 80% of gross

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000,   // 1 minute window
  RATE_LIMIT_BOOKING: 5,              // 5 requests per minute
  RATE_LIMIT_STATUS_POLL: 30,         // 30 requests per minute
  RATE_LIMIT_TICKET_VIEW: 10,         // 10 requests per minute

  // Operator Pre-Game Lobby
  PRE_GAME_LOBBY_MINUTES: 15,         // Opens 15 minutes before game start

  // Emoji Reactions
  EMOJI_RATE_LIMIT_MS: 2000,          // 1 reaction per player per 2 seconds

  // JWT
  JWT_COOKIE_NAME: 'hg_auth_token',

  // Roles
  ROLES: {
    SUPERADMIN: 1,
    ADMIN: 2,
    OPERATOR: 3,
    AGENT: 4,
  } as const,
};
