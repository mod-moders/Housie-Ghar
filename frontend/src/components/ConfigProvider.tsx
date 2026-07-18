"use client";

import { useEffect, useState, useCallback } from "react";
import { useConfigStore, type PublicConfig } from "@/lib/stores/configStore";
import { useSocket } from "@/lib/hooks/useSocket";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useLobbyAudio } from "@/hooks/useLobbyAudio";

interface GameSummary {
  game_id: string;
  game_title: string;
  game_status: string;
  status?: string;
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const updateConfigLocally = useConfigStore((s) => s.updateConfigLocally);
  const pathname = usePathname() || "";

  const [isAnyGameLive, setIsAnyGameLive] = useState(false);

  const checkLiveGames = useCallback(async () => {
    try {
      const games = await apiFetch<GameSummary[]>("/api/games");
      const hasLive = games.some(
        (g) =>
          g.game_status === "Live" ||
          g.game_status === "Paused" ||
          g.game_status === "Running" ||
          g.status === "Running" ||
          g.status === "Paused"
      );
      setIsAnyGameLive(hasLive);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    checkLiveGames();
  }, [checkLiveGames, pathname]);

  useSocket(
    (event, data) => {
      if (event === "config_update") {
        console.log("🔊 Received instant configuration update:", data);
        updateConfigLocally(data as Partial<PublicConfig>);
      } else if (event === "game_list_update") {
        checkLiveGames();
      }
    }
  );

  useEffect(() => {
    loadConfig();
    
    const interval = setInterval(() => {
      loadConfig();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadConfig]);

  // Determine if the user is on a game drawing page (playing or watching live)
  const isInGamePage = pathname.startsWith("/game/");

  // Play lobby audio globally when not on a live game page and no live game is ongoing
  useLobbyAudio(!isInGamePage && !isAnyGameLive);

  return <>{children}</>;
}
