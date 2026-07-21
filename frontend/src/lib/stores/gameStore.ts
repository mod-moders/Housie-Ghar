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
  /**
   * How far into the game we were when the live stream connected, in ms, as
   * measured by the SERVER (immune to client clock skew). null until the
   * initial_state event lands, or when the game has not started.
   * Paired with `elapsedAt` so callers can age it forward locally.
   */
  elapsedMsAtSync: number | null;
  /** performance-independent local timestamp of when elapsedMsAtSync was recorded. */
  elapsedAt: number | null;
  addDrawn: (n: number) => void;
  setStatus: (s: GameStore["gameStatus"]) => void;
  setElapsed: (ms: number | null) => void;
  setPrizes: (p: PrizeEntry[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  drawnNumbers: [],
  lastDrawn: null,
  gameStatus: "Scheduled",
  prizes: [],
  elapsedMsAtSync: null,
  elapsedAt: null,
  addDrawn: (n) =>
    set((s) => ({
      drawnNumbers: s.drawnNumbers.includes(n) ? s.drawnNumbers : [...s.drawnNumbers, n],
      lastDrawn: n,
    })),
  setStatus: (gameStatus) => set({ gameStatus }),
  setElapsed: (ms) => set({ elapsedMsAtSync: ms, elapsedAt: ms === null ? null : Date.now() }),
  setPrizes: (prizes) => set({ prizes }),
  reset: () =>
    set({ drawnNumbers: [], lastDrawn: null, gameStatus: "Scheduled", prizes: [], elapsedMsAtSync: null, elapsedAt: null }),
}));
