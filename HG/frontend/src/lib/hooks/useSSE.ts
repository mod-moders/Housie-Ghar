"use client";
import { useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useSSE(gameId: string | null) {
  const sourceRef = useRef<EventSource | null>(null);
  const { addDrawn, setStatus, setPrizes } = useGameStore();

  useEffect(() => {
    if (!gameId) return;
    sourceRef.current?.close();

    const src = new EventSource(`${BASE}/api/games/${gameId}/live-stream`);
    sourceRef.current = src;

    src.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.event === "initial_state") {
        setStatus(data.game_status);
        (data.drawn_numbers ?? []).forEach((n: number) => addDrawn(n));
        if (data.prizes) setPrizes(data.prizes);
      } else if (data.event === "draw") {
        addDrawn(data.draw_number);
      } else if (data.event === "winner") {
        if (data.prizes) setPrizes(data.prizes);
      } else if (data.event === "paused") {
        setStatus("Paused");
      } else if (data.event === "resumed") {
        setStatus("Live");
      } else if (data.event === "completed") {
        setStatus("Completed");
      }
    };

    src.onerror = () => src.close();
    return () => src.close();
  }, [gameId]);
}
