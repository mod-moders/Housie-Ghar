"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface SSEEventData {
  event: string;
  [key: string]: unknown;
}

/**
 * Subscribe to a game's SSE live-stream. Drawn numbers and game status are
 * pushed into the game store; every raw event is also forwarded to `onEvent`
 * so screens can react (reveal-tease, winner overlay, prize board updates).
 */
export function useSSE(gameId: string | null, onEvent?: (data: SSEEventData) => void) {
  const sourceRef = useRef<EventSource | null>(null);
  const handlerRef = useRef(onEvent);
  useLayoutEffect(() => { handlerRef.current = onEvent; });
  const { addDrawn, setStatus } = useGameStore();

  useEffect(() => {
    if (!gameId) return;
    sourceRef.current?.close();

    const src = new EventSource(`${BASE}/api/games/${gameId}/live-stream`);
    sourceRef.current = src;

    src.onmessage = (e) => {
      let data: SSEEventData;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === "initial_state") {
        setStatus(data.game_status as Parameters<typeof setStatus>[0]);
        ((data.drawn_numbers as number[]) ?? []).forEach((n) => addDrawn(n));
        // Let LiveBoard handle draw to sync with audio!
      } else if (data.event === "paused") {
        setStatus("Paused");
      } else if (data.event === "resumed") {
        setStatus("Live");
      } else if (data.event === "draw_ended") {
        setStatus("Draw_Ended");
      } else if (data.event === "completed") {
        setStatus("Completed");
      }
      handlerRef.current?.(data);
    };

    src.onerror = () => src.close();
    return () => src.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
}
