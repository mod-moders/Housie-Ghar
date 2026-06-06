/**
 * Shared TypeScript interfaces for Ticket objects
 * Used by both frontend and backend
 */

export type TicketStatus = 'Available' | 'Locked' | 'Sold' | 'Cancelled';

export interface TicketGridData {
  row1: (number | null)[];  // 9 cells, 5 numbers + 4 nulls
  row2: (number | null)[];  // 9 cells, 5 numbers + 4 nulls
  row3: (number | null)[];  // 9 cells, 5 numbers + 4 nulls
}

export interface Ticket {
  ticket_id: number;
  game_id: string;
  ticket_number: number;
  grid_data: TicketGridData;
  status: TicketStatus;
  locked_by_booking: string | null;
  locked_until: string | null;
  owner_housie_name: string | null;
  confirmed_at: string | null;
}

export interface TicketSquareDisplay {
  ticket_id: number;
  ticket_number: number;
  status: TicketStatus;
  is_selected: boolean;
}

export interface TicketGridResponse {
  game_id: string;
  tickets: TicketSquareDisplay[];
  total: number;
  available: number;
  locked: number;
  sold: number;
}
