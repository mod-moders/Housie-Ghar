import { create } from "zustand";

interface BookingRequest {
  booking_id: string;
  housie_name: string;
  game_title: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_until: string;
}

interface AgentStore {
  queue: BookingRequest[];
  walletBalance: number;
  setQueue: (q: BookingRequest[]) => void;
  setBalance: (b: number) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  queue: [],
  walletBalance: 0,
  setQueue: (queue) => set({ queue }),
  setBalance: (walletBalance) => set({ walletBalance }),
}));
