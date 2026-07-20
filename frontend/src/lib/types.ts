/** Shared API response shapes (mirrors HG/backend contracts). */

export interface Prize {
  prize_id: number;
  pattern_name: string;
  prize_amount: number;
  claimed: boolean;
  winner_housie_name: string | null;
  winner_ticket_number?: number | null;
  claimed_at: string | null;
  split_count: number;
  amount_per_winner: number | null;
  player_claimed?: boolean;
  player_claimed_at?: string | null;
  disbursed?: boolean;
  disbursed_at?: string | null;
}

export interface ClaimPrizeResponse {
  message: string;
  prize: {
    prize_id: number;
    pattern_name: string;
    amount: number;
    winner_ticket_number: number | null;
    split_count: number;
    player_claimed: boolean;
    player_claimed_at: string | null;
  };
  whatsapp_url: string | null;
  whatsapp_message: string | null;
}

export interface GameSummary {
  game_id: string;
  title: string;
  scheduled_at: string;
  completed_at?: string;
  ticket_price: number;
  total_tickets: number;
  sold_count: number;
  locked_count: number;
  available_count: number;
  player_count?: number; // Optional since it might be missing in older API versions
  my_tickets_count?: number;
  fill_percentage: number;
  game_status: "Scheduled" | "Live" | "Paused" | "Draw_Ended" | "Completed";
  call_mode?: "TTS" | "Audio" | "Text";
  bg_music_enabled?: boolean;
  intro_mode?: "TTS" | "Audio" | "Text";
  outro_mode?: "TTS" | "Audio" | "Text";
  started_at?: string;
  prize_pool: Prize[];
}

export interface TicketListItem {
  ticket_id: number;
  ticket_number: number;
  status: "Available" | "Locked" | "Sold";
}

export interface TicketListResponse {
  game_id: string;
  tickets: TicketListItem[];
  total: number;
  available: number;
  locked: number;
  sold: number;
}

export interface TicketDetail {
  ticket_id: number;
  ticket_number: number;
  grid_data: { row1: (number | null)[]; row2: (number | null)[]; row3: (number | null)[] };
  status: string;
  owner_housie_name: string | null;
}

export interface LockResponse {
  booking_id: string;
  locked_until: string;
  agent_name: string;
  agent_phone: string;
  agent_town: string | null;
  total_amount: number;
  whatsapp_link: string;
  is_overflow: boolean;
}

export interface BookingStatusResponse {
  booking_id: string;
  booking_status: "Locked" | "Sold" | "Cancelled" | "Expired";
  confirmed_at: string | null;
}

export interface HallOfFameEntry {
  housie_name: string;
  wins: number;
  total_won: number;
  biggest_win: number;
}

export interface OverviewStats {
  active_games: number;
  scheduled_games: number;
  tickets_sold_today: number;
  gross_revenue_today: number;
  fill_rate_avg: number;
  total_staff: number;
  pending_topups: number;
  wallet_balances?: number;
  net_revenue?: number;
  pending_withdrawals?: number;
}

export interface LuckyNumberResponse {
  lucky_number: number | null;
  refreshes_at: string;
}

export type TrustTier = "veteran" | "trusted" | "new";

export interface StaffUser {
  user_id: string;
  full_name: string;
  role_name: "Superadmin" | "Financial Admin" | "Operator" | "Bookie";
  role_id: number;
  is_cfo: boolean;
  email: string | null;
  username: string;
  phone: string | null;
  upi_id: string | null;
  town: string | null;
  status: "Active" | "Suspended";
  current_balance: number;
  assigned_games_count: number;
  trust: TrustTier | null;
  last_login: string | null;
}

export interface AuditEntry {
  log_id: number;
  timestamp: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_description: string | null;
  ip_address: string | null;
}

export interface PendingTopupRequest {
  request_id: string;
  requested_amount: number;
  payment_reference: string;
  requested_at: string;
  request_status?: "Pending" | "Approved" | "Rejected";
  reviewed_at?: string;
}

export interface LedgerAgent {
  agent_id: string;
  full_name: string;
  phone: string | null;
  town: string | null;
  status: string;
  current_balance: number;
  lifetime_topups: number;
  last_recharge_at: string | null;
  trust: TrustTier;
  pending_requests: PendingTopupRequest[];
}

export interface FinancialHud {
  overall_profit: number;
  today_collection: number;
  today_profit: number;
  monthly_profit: number;
  pending_topups: number;
}

export interface QueueBooking {
  booking_id: string;
  housie_name: string;
  game_title: string;
  game_time: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_at: string;
  locked_until: string;
}

export interface WalletLedgerEntry {
  entry_id: number;
  transaction_type: "Credit" | "Debit";
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

export interface SkipAlert {
  alert_id: number;
  booking_amount: number;
  agent_balance: number;
  created_at: string;
}

export interface PlayerProfile {
  player_id: string;
  full_name: string;
  housie_name: string;
  registered_at: string;
  phone: string | null;
  email: string | null;
  theme_preference: string | null;
  sound_enabled: boolean;
  has_password?: boolean;
  avatar_url?: string | null;
}

export interface PlayerStats {
  member_since: string | null;
  games_played: number;
  tickets_bought: number;
  total_expenditure: number;
  total_wins: number;
  full_house_wins: number;
  line_wins: number;
  other_wins: number;
  amount_won: number;
  highest_amount_single_game: number;
  luckiest_ticket_number: number | null;
  longest_winning_run: number;
  unluckiest_run: number;
}
