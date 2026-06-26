"use client";
/**
 * Rehydrates the player session from the HttpOnly cookie on load.
 *
 * The player cookie lasts 30 days, but `playerStore` lives in localStorage and
 * can be empty even while the cookie is valid (cleared storage, a different
 * browser, an older session). Without this, the account button silently
 * disappears though the user is still signed in. On mount, if the store has no
 * player, we ask the server who we are and repopulate it. Renders nothing.
 */

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { usePlayerStore, Player } from "@/lib/stores/playerStore";

export function PlayerSync() {
  const player = usePlayerStore((s) => s.player);
  const setPlayer = usePlayerStore((s) => s.setPlayer);

  useEffect(() => {
    if (player) return; // already known — no need to ask the server
    let alive = true;
    apiFetch<{ player: Player }>("/api/players/me")
      .then((res) => { if (alive) setPlayer(res.player); })
      .catch(() => { /* not signed in as a player — leave the store empty */ });
    return () => { alive = false; };
  }, [player, setPlayer]);

  return null;
}
