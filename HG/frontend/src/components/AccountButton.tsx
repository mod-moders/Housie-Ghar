"use client";
/**
 * Account control for signed-in players. Shows a username chip; clicking opens
 * a small menu with the player's identity and a sign-out action. Used anywhere
 * a player can be (lobby nav, game room, live board) so the account is always
 * one tap away. Renders nothing when no player session is present.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import { apiFetch } from "@/lib/api";
import { usePlayerStore } from "@/lib/stores/playerStore";

// false during SSR/first paint, true after hydration — avoids a mismatch from
// the localStorage-backed player store.
const emptySubscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(emptySubscribe, () => true, () => false);

export function AccountButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const player = usePlayerStore((s) => (hydrated ? s.player : null));
  const clearPlayer = usePlayerStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!player) return null;

  const signOut = async () => {
    try {
      await apiFetch("/api/players/logout", { method: "POST" });
    } catch {
      // cookie may already be gone — still clear local state
    }
    clearPlayer();
    setOpen(false);
    router.push("/login");
  };

  return (
    <div className="hg-acct" ref={rootRef}>
      <button
        className={`hg-player-chip${compact ? " is-compact" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
      >
        <Icon name="user" size={14} strokeWidth={2} />
        {!compact && <span className="hg-acct-name">{player.username}</span>}
        <Icon name="chevR" size={12} strokeWidth={2.4} className={`hg-acct-caret${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="hg-acct-menu" role="menu">
          <div className="hg-acct-head">
            <span className="hg-acct-who">{player.username}</span>
            {player.full_name && <span className="hg-acct-full">{player.full_name}</span>}
          </div>
          <button className="hg-acct-item" role="menuitem" onClick={() => { setOpen(false); router.push("/"); }}>
            <Icon name="grid" size={15} strokeWidth={2} /> Browse games
          </button>
          <button className="hg-acct-item is-danger" role="menuitem" onClick={signOut}>
            <Icon name="arrowL" size={15} strokeWidth={2} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
