/**
 * Stable per-browser device id.
 *
 * Player signup is passwordless, and housie names are public, so the backend
 * binds each passwordless account to the devices it has been seen on. This id
 * is what identifies "this browser" to that check.
 *
 * It lives in localStorage, NOT sessionStorage: it has to survive closing the
 * browser, otherwise every relaunch would look like a brand-new device and lock
 * the player out of their own account. It is not an auth token — on its own it
 * grants nothing, it only lets a correct housie name sign in without a password.
 */

const DEVICE_ID_KEY = "hg_device_id";

function generateDeviceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through to the non-crypto path below
  }
  // Last resort for very old browsers. Weaker, but still device-scoped, and the
  // backend treats an unknown device as "needs a password" rather than trusting it.
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`;
}

/**
 * Returns this browser's device id, creating and persisting one on first call.
 * Returns null during SSR, and in browsers where storage is unavailable
 * (private mode, storage disabled) — callers should simply omit the field.
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;

    const fresh = generateDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}
