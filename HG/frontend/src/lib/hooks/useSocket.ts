"use client";
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useSocket(onEvent?: (event: string, data: unknown) => void) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(BASE, { withCredentials: true });
    socketRef.current = socket;

    if (onEvent) {
      const events = ["draw_update","winner_announced","paused","resumed","completed",
        "new_booking_request","booking_expired","wallet_credited"];
      events.forEach((ev) => socket.on(ev, (data) => onEvent(ev, data)));
    }

    return () => { socket.disconnect(); };
  }, []);

  return socketRef;
}
