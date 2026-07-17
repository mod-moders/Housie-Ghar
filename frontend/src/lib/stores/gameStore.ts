import { create } from "zustand";

interface PrizeEntry {
  prize_id: number;
  pattern_name: string;
  prize_amount: number;
  claimed: boolean;
  winner_housie_name: string | null;
}

interface GameStore {
  drawnNumbers: number[];
  lastDrawn: number | null;
  gameStatus: "Scheduled" | "Live" | "Paused" | "Draw_Ended" | "Completed";
  prizes: PrizeEntry[];
  addDrawn: (n: number) => void;
  setStatus: (s: GameStore["gameStatus"]) => void;
  setPrizes: (p: PrizeEntry[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  drawnNumbers: [],
  lastDrawn: null,
  gameStatus: "Scheduled",
  prizes: [],
  addDrawn: (n) =>
    set((s) => ({
      drawnNumbers: s.drawnNumbers.includes(n) ? s.drawnNumbers : [...s.drawnNumbers, n],
      lastDrawn: n,
    })),
  setStatus: (gameStatus) => set({ gameStatus }),
  setPrizes: (prizes) => set({ prizes }),
  reset: () => set({ drawnNumbers: [], lastDrawn: null, gameStatus: "Scheduled", prizes: [] }),
}));
