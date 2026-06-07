import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BookingStore {
  bookingId: string | null;
  housieName: string;
  gameId: string | null;
  ticketIds: number[];
  status: "idle" | "locked" | "sold" | "expired";
  agentPhone: string;
  agentName: string;
  totalAmount: number;
  lockedUntil: string | null;
  whatsappLink: string;
  setBooking: (b: Partial<BookingStore>) => void;
  clear: () => void;
}

const INIT = {
  bookingId: null, housieName: "", gameId: null, ticketIds: [],
  status: "idle" as const, agentPhone: "", agentName: "",
  totalAmount: 0, lockedUntil: null, whatsappLink: "",
};

export const useBookingStore = create<BookingStore>()(
  persist(
    (set) => ({
      ...INIT,
      setBooking: (b) => set((s) => ({ ...s, ...b })),
      clear: () => set(INIT),
    }),
    { name: "hg-booking" }
  )
);
