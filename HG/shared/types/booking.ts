/**
 * Shared TypeScript interfaces for Booking objects
 * Used by both frontend and backend
 */

export type BookingStatus = 'Locked' | 'Sold' | 'Cancelled' | 'Expired';

export interface Booking {
  booking_id: string;
  game_id: string;
  ticket_ids: number[];
  housie_name: string;
  assigned_agent_id: string;
  total_amount: number;
  booking_status: BookingStatus;
  locked_at: string;
  locked_until: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rejected_at: string | null;
  player_device_fingerprint: string | null;
  spam_flagged: boolean;
}

export interface BookingLockPayload {
  game_id: string;
  ticket_ids: number[];
  housie_name: string;
}

export interface BookingLockResponse {
  booking_id: string;
  locked_until: string;
  agent_phone: string;
  agent_name: string;
  total_amount: number;
  whatsapp_link: string;
}

export interface BookingStatusResponse {
  booking_id: string;
  booking_status: BookingStatus;
  confirmed_at: string | null;
}

export interface AgentBookingRequest {
  booking_id: string;
  housie_name: string;
  game_title: string;
  game_time: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_at: string;
  locked_until: string;
  time_remaining_ms: number;
}

export interface TopUpRequest {
  request_id: string;
  agent_id: string;
  agent_name: string;
  requested_amount: number;
  payment_reference: string;
  payment_method: string | null;
  proof_screenshot_url: string | null;
  request_status: 'Pending' | 'Approved' | 'Rejected';
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
}

export interface WalletLedgerEntry {
  entry_id: number;
  agent_id: string;
  transaction_type: 'Credit' | 'Debit' | 'Reversal';
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  performed_by: string | null;
  created_at: string;
}
