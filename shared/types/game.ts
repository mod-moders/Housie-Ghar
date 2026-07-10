/**
 * Shared TypeScript interfaces for Game objects
 * Used by both frontend and backend
 */

export type GameStatus = 'Scheduled' | 'Live' | 'Paused' | 'Completed' | 'Postponed';

export interface Game {
  game_id: string;
  title: string;
  scheduled_at: string; // ISO 8601 timestamp
  total_tickets: number;
  ticket_price: number;
  game_status: GameStatus;
  operator_id: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  postponed_to: string | null;
}

export interface GameCard {
  game_id: string;
  title: string;
  scheduled_at: string;
  ticket_price: number;
  total_tickets: number;
  sold_count: number;
  locked_count: number;
  available_count: number;
  fill_percentage: number;
  game_status: GameStatus;
  prize_pool: PrizePoolEntry[];
}

export interface PrizePoolEntry {
  prize_id: number;
  pattern_name: PrizePattern;
  prize_amount: number;
  claimed: boolean;
  winner_housie_name: string | null;
  claimed_at: string | null;
  split_count: number;
  amount_per_winner: number | null;
}

export type PrizePattern =
  | 'Early Five'
  | 'Quick 7'
  | 'Corner'
  | 'Star'
  | 'Top Line'
  | 'Middle Line'
  | 'Bottom Line'
  | 'Box Bonus'
  | 'Full House'
  | '1st Full House'
  | '2nd Full House'
  | '3rd Full House';

export interface GameLiveState {
  game_id: string;
  game_status: GameStatus;
  drawn_numbers: number[];
  current_number: number | null;
  total_drawn: number;
  claimed_prizes: PrizePoolEntry[];
  draw_interval_ms: number;
}

export interface GameCreatePayload {
  title: string;
  scheduled_at: string;
  total_tickets: number;
  ticket_price: number;
  prize_pool: {
    pattern_name: PrizePattern;
    prize_amount: number;
  }[];
  operator_id: string;
}

export interface GameLog {
  log_id: number;
  game_id: string;
  draw_sequence: number[];
  drawn_numbers: number[];
  current_index: number;
  sequence_generated_at: string | null;
  last_draw_at: string | null;
  total_drawn: number;
}
