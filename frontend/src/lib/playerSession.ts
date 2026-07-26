/**
 * Player session token storage.
 *
 * Implements a hybrid sessionStorage + localStorage strategy:
 * 1. sessionStorage is checked first. Since it is tab-isolated, this permits
 *    players to sign in to different player accounts in different browser tabs
 *    concurrently.
 * 2. If sessionStorage is empty (e.g. a new tab or browser reopen), we fall back
 *    to localStorage. On a successful fallback match, we hydrate sessionStorage
 *    so this tab remains isolated to that session moving forward.
 * 3. This resolves the multi-tab account collision issue while preserving
 *    10-year session persistence when tabs are closed.
 */

export const PLAYER_TOKEN_KEY = "hg_player_token";

/** Kept in step with MIN_PLAYER_PASSWORD_LENGTH in backend player.controller.ts. */
export const MIN_PASSWORD_LENGTH = 6;

export function getPlayerToken(): string | null {
  if (typeof window === "undefined") return null;

  // Try sessionStorage first to ensure tab-specific account isolation
  const sessionToken = sessionStorage.getItem(PLAYER_TOKEN_KEY);
  if (sessionToken) return sessionToken;

  // Fallback to localStorage to maintain session across closes
  const localToken = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (localToken) {
    // Hydrate sessionStorage so the tab stays isolated to this token
    sessionStorage.setItem(PLAYER_TOKEN_KEY, localToken);
    return localToken;
  }

  return null;
}

export function setPlayerToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLAYER_TOKEN_KEY, token);
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
}

export function clearPlayerToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PLAYER_TOKEN_KEY);
  localStorage.removeItem(PLAYER_TOKEN_KEY);
}

/**
 * Announced by the profile page after a save so surfaces that cache the player
 * (the nav bar's account chip) can update without a reload. Kept here next to
 * the token so the whole player-session contract is in one file.
 */
export const PLAYER_UPDATED_EVENT = "hg:player-updated";

export interface PlayerUpdatedDetail {
  housie_name?: string | null;
  avatar_url?: string | null;
}

export function announcePlayerUpdated(detail: PlayerUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PlayerUpdatedDetail>(PLAYER_UPDATED_EVENT, { detail }));
}
