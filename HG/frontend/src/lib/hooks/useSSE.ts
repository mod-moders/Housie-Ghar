"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";

// Same-origin by default — the SSE stream is proxied through Next to the
// backend, so one URL works everywhere. Override with NEXT_PUBLIC_API_URL.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
        setStatus(data.game_status as "Scheduled" | "Live" | "Paused" | "Completed");
        ((data.drawn_numbers as number[]) ?? []).forEach((n) => addDrawn(n));
      } else if (data.event === "draw") {
        addDrawn(data.draw_number as number);
      } else if (data.event === "paused") {
        setStatus("Paused");
      } else if (data.event === "resumed") {
        setStatus("Live");
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
