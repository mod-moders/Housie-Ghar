/**
 * Player session token storage.
 *
 * The token lives in `localStorage`, NOT `sessionStorage`. `sessionStorage` is
 * wiped by the browser whenever the tab or window closes — by spec, not a bug —
 * so a player who closed the tab and came back a day later was bounced to
 * /login even though the JWT itself is valid for 10 years. The server also sets
 * an `hg_player_token` cookie with a matching 10-year lifetime, but it is
 * `sameSite:'strict'` while the API is on a different origin from the site, so
 * it is never sent on an API call and cannot rescue the session.
 *
 * Staff tokens are deliberately NOT moved here: they stay in `sessionStorage`
 * so a staff member can hold different roles in different tabs for testing.
 * That is why this module is player-specific rather than a generic token store.
 */

export const PLAYER_TOKEN_KEY = "hg_player_token";

/** Kept in step with MIN_PLAYER_PASSWORD_LENGTH in backend player.controller.ts. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Read the token, promoting any pre-existing `sessionStorage` token to
 * `localStorage` on the way.
 *
 * Without that promotion, shipping this change would sign out every player who
 * was logged in at deploy time: their token lives in `sessionStorage`, and
 * every read site now looks at `localStorage`. The migration runs once per tab,
 * costs a single extra read when `localStorage` is already populated, and can
 * be deleted once the fleet has turned over.
 */
export function getPlayerToken(): string | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (stored) return stored;

  const legacy = sessionStorage.getItem(PLAYER_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(PLAYER_TOKEN_KEY, legacy);
    sessionStorage.removeItem(PLAYER_TOKEN_KEY);
    return legacy;
  }

  return null;
}

export function setPlayerToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
  // Drop any legacy copy so the two can't disagree later.
  sessionStorage.removeItem(PLAYER_TOKEN_KEY);
}

export function clearPlayerToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PLAYER_TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_TOKEN_KEY);
}
