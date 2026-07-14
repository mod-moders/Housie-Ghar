import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Player {
  player_id: string;
  username: string;
  full_name: string;
  date_of_birth: string;
  phone?: string | null;
  email?: string | null;
  sound_enabled?: boolean;
  has_password?: boolean;
}

interface PlayerStore {
  player: Player | null;
  setPlayer: (p: Player | null) => void;
  clear: () => void;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      player: null,
      setPlayer: (player) => set({ player }),
      clear: () => set({ player: null }),
    }),
    { name: "hg-player" }
  )
);
