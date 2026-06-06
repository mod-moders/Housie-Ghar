/**
 * Shared TypeScript interfaces for all WebSocket/SSE event payloads
 * Used by both frontend and backend
 */

// ============================================================
// SSE Events (Server → Player)
// ============================================================

export interface DrawEvent {
  event: 'draw';
  draw_number: number;
  total_drawn: number;
  timestamp: string;
}

export interface WinnerEvent {
  event: 'winner';
  prize: string;
  housie_name: string;
  ticket_id: number;
  amount: number;
  split_count: number;
}

export interface GamePausedEvent {
  event: 'game_paused';
  timestamp: string;
}

export interface GameResumedEvent {
  event: 'game_resumed';
  timestamp: string;
  interval_ms: number;
}

export interface GameCompletedEvent {
  event: 'game_completed';
  final_leaderboard: {
    prize: string;
    housie_name: string;
    amount: number;
  }[];
}

export interface TicketStatusChangeEvent {
  event: 'ticket_status_change';
  ticket_id: number;
  new_status: 'Available' | 'Locked' | 'Sold';
}

export interface GamePostponedEvent {
  event: 'game_postponed';
  new_time: string;
}

export interface ThemeChangeEvent {
  event: 'theme_change';
  theme_class: string;
}

export interface EmojiReactionEvent {
  event: 'emoji_reaction';
  emoji: string;
  player_id: string;
}

export type SSEEvent =
  | DrawEvent
  | WinnerEvent
  | GamePausedEvent
  | GameResumedEvent
  | GameCompletedEvent
  | TicketStatusChangeEvent
  | GamePostponedEvent
  | ThemeChangeEvent
  | EmojiReactionEvent;

// ============================================================
// WebSocket Events (Operator ↔ Server)
// ============================================================

export interface SpeedChangePayload {
  game_id: string;
  interval_ms: number;
}

export interface PauseGamePayload {
  game_id: string;
}

export interface ResumeGamePayload {
  game_id: string;
}

export interface PlayerCountUpdateEvent {
  game_id: string;
  player_count: number;
}

// ============================================================
// WebSocket Events (Agent ↔ Server)
// ============================================================

export interface NewBookingRequestEvent {
  booking_id: string;
  housie_name: string;
  game_title: string;
  game_time: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_at: string;
  locked_until: string;
}

export interface BookingExpiredEvent {
  booking_id: string;
}

export interface WalletCreditedEvent {
  new_balance: number;
  amount: number;
}

export interface TopUpRequestReceivedEvent {
  request_id: string;
  agent_name: string;
  amount: number;
}
