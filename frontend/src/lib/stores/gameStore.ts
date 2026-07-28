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
  /**
   * How long ago the LAST number was drawn when the live stream connected, in ms,
   * as measured by the SERVER. The mirror image of elapsedMsAtSync: that one
   * anchors the opening choreography, this one anchors the closing one, so a
   * client arriving after the draw ended can tell whether the outro is still
   * running and where in the clip it should be. null until initial_state lands,
   * or when nothing has been drawn. Paired with `sinceLastDrawAt`.
   */
  sinceLastDrawMsAtSync: number | null;
  /** performance-independent local timestamp of when sinceLastDrawMsAtSync was recorded. */
  sinceLastDrawAt: number | null;
  /**
   * While true, setStatus HOLDS any terminal status ("Draw_Ended"/"Completed")
   * in `pendingTerminalStatus` instead of applying it.
   *
   * The board has to finish showing the final prize — winning number, winner
   * card, then the winners dashboard with the outro — and a terminal status
   * short-circuits all of it (revealDraw bails on one). Terminal statuses arrive
   * from four independent directions within the same few seconds: the backend's
   * draw_ended (4s after the winning draw), useSSE applying it directly, the
   * board's own SSE handler, and loadGameData seeing an all-claimed prize pool.
   * Gating them in setStatus is the only way to cover all four, since useSSE
   * applies its own before the consumer's handler ever runs.
   */
  holdTerminalStatus: boolean;
  pendingTerminalStatus: GameStore["gameStatus"] | null;
  addDrawn: (n: number) => void;
  setStatus: (s: GameStore["gameStatus"]) => void;
  setElapsed: (ms: number | null) => void;
  setSinceLastDraw: (ms: number | null) => void;
  setPrizes: (p: PrizeEntry[]) => void;
  /** Start holding terminal statuses. Always pair with resolveEndSequence(). */
  beginEndSequence: () => void;
  /** Stop holding and apply whatever arrived while held, or `fallback` if nothing did. */
  resolveEndSequence: (fallback: GameStore["gameStatus"]) => void;
  reset: () => void;
}

const isTerminal = (s: GameStore["gameStatus"]) => s === "Draw_Ended" || s === "Completed";

export const useGameStore = create<GameStore>((set) => ({
  drawnNumbers: [],
  lastDrawn: null,
  gameStatus: "Scheduled",
  prizes: [],
  elapsedMsAtSync: null,
  elapsedAt: null,
  sinceLastDrawMsAtSync: null,
  sinceLastDrawAt: null,
  addDrawn: (n) =>
    set((s) => ({
      drawnNumbers: s.drawnNumbers.includes(n) ? s.drawnNumbers : [...s.drawnNumbers, n],
      lastDrawn: n,
    })),
  holdTerminalStatus: false,
  pendingTerminalStatus: null,
  setStatus: (gameStatus) =>
    set((s) =>
      s.holdTerminalStatus && isTerminal(gameStatus)
        ? { pendingTerminalStatus: gameStatus }
        : { gameStatus }
    ),
  beginEndSequence: () => set({ holdTerminalStatus: true, pendingTerminalStatus: null }),
  resolveEndSequence: (fallback) =>
    set((s) => ({
      holdTerminalStatus: false,
      pendingTerminalStatus: null,
      gameStatus: s.pendingTerminalStatus ?? fallback,
    })),
  setElapsed: (ms) => set({ elapsedMsAtSync: ms, elapsedAt: ms === null ? null : Date.now() }),
  setSinceLastDraw: (ms) =>
    set({ sinceLastDrawMsAtSync: ms, sinceLastDrawAt: ms === null ? null : Date.now() }),
  setPrizes: (prizes) => set({ prizes }),
  reset: () =>
    set({
      drawnNumbers: [],
      lastDrawn: null,
      gameStatus: "Scheduled",
      prizes: [],
      elapsedMsAtSync: null,
      elapsedAt: null,
      sinceLastDrawMsAtSync: null,
      sinceLastDrawAt: null,
      holdTerminalStatus: false,
      pendingTerminalStatus: null,
    }),
}));
