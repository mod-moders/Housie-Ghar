"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Every server-emitted event the dashboards care about.
const EVENTS = [
  "draw_update", "winner_announced", "paused", "resumed", "completed",
  "new_booking_request", "booking_expired", "wallet_credited",
  "booking_skipped", "overflow_booking", "ticket_status_change",
  "config_update", "game_list_update",
];

/**
 * Connect to the Socket.io server.
 *
 * @param onEvent  Called for any server event with (eventName, payload).
 * @param join     Optional room-join descriptor emitted on (re)connect, e.g.
 *                 `{ event: "join_agent_room", arg: userId }`. The socket
 *                 reconnects when `join.arg` becomes available so room-scoped
 *                 events actually reach this client.
 */
export function useSocket(
  onEvent?: (event: string, data: unknown) => void,
  join?: { event: string; arg?: string }
) {
  const socketRef = useRef<Socket | null>(null);
  const handlerRef = useRef(onEvent);
  useLayoutEffect(() => { handlerRef.current = onEvent; });

  const joinEvent = join?.event;
  const joinArg = join?.arg;

  useEffect(() => {
    const socket = io(BASE, { withCredentials: true });
    socketRef.current = socket;

    const doJoin = () => { if (joinEvent && joinArg) socket.emit(joinEvent, joinArg); };
    socket.on("connect", doJoin);

    EVENTS.forEach((ev) => socket.on(ev, (data) => handlerRef.current?.(ev, data)));

    return () => { socket.disconnect(); };
  }, [joinEvent, joinArg]);

  return socketRef;
}
