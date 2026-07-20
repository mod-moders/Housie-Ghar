import { create } from "zustand";
import { apiFetch } from "../api";

export interface PublicConfig {
  active_theme: string;
  marquee_text: string;
  announcement_text: string;
  site_title: string;
  maintenance_mode: string;
  nepali_caller_enabled: string;
  english_caller_enabled: string;
  announcements_list?: string;
  announcement_speed?: string;
  announcements_muted?: string;
  cage_sound_enabled?: string;
  celebration_sound_enabled?: string;
  welcome_voice_enabled?: string;
  instruction_voice_enabled?: string;
  welcome_voice_url?: string;
  instruction_voice_url?: string;
  welcome_voice_text?: string;
  instruction_voice_text?: string;
  welcome_voice_mode?: string;
  instruction_voice_mode?: string;
  welcome_voice_volume?: string;
  instruction_voice_volume?: string;
  tts_voice_name?: string;
  background_music_url?: string;
  background_music_enabled?: string;
  background_music_volume?: string;
  lobby_music_volume?: string;
  master_calls_volume?: string;
  cage_sound_type?: string;
  winner_sound_type?: string;
  cage_sound_url?: string;
  celebration_sound_url?: string;
  cage_sound_volume?: string;
  winner_sound_volume?: string;
  lobby_music_url_1?: string;
  lobby_music_url_2?: string;
  lobby_music_url_3?: string;
  lobby_music_url_4?: string;
  lobby_music_url_5?: string;
}

interface ConfigState {
  config: PublicConfig | null;
  loaded: boolean;
  loadConfig: () => Promise<void>;
  updateConfigLocally: (updates: Partial<PublicConfig>) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loaded: false,
  loadConfig: async () => {
    try {
      const config = await apiFetch<PublicConfig>("/api/config/public");

      // Only look up the player's saved theme when a player is actually signed in.
      // ConfigProvider calls loadConfig() on a 30s interval; probing /api/player/me
      // while logged out just 401s on a loop, spamming the browser console and the
      // server logs on every public page. The player token is mirrored into web
      // storage on login/signup, so its absence is a reliable "anonymous" signal.
      const hasPlayerToken =
        typeof window !== "undefined" &&
        !!(localStorage.getItem("hg_player_token") || sessionStorage.getItem("hg_player_token"));
      if (hasPlayerToken) {
        try {
          const res = await apiFetch<{ player: { theme_preference: string | null } }>("/api/player/me");
          if (res.player?.theme_preference) {
            config.active_theme = res.player.theme_preference;
          }
        } catch {
          // Ignore if the session expired or the endpoint fails
        }
      }

      // Apply theme globally
      if (config.active_theme) {
        document.body.dataset.theme = config.active_theme;
        localStorage.setItem("hg-theme", config.active_theme);
      }
      if (config.site_title) {
        document.title = config.site_title;
      }
      set({ config, loaded: true });
    } catch (e) {
      console.error("Failed to load public config", e);
    }
  },
  updateConfigLocally: (updates) => {
    set((state) => {
      if (!state.config) return state;
      const nextConfig = { ...state.config, ...updates };
      if (updates.active_theme) {
        document.body.dataset.theme = updates.active_theme;
        localStorage.setItem("hg-theme", updates.active_theme);
      }
      if (updates.site_title) {
        document.title = updates.site_title;
      }
      return { config: nextConfig };
    });
  }
}));
