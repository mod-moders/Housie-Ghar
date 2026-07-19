const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function resolveAudioUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;

  let path = url;
  if (path.startsWith("/audio/config/")) {
    path = path.replace("/audio/config/", "/api/config/audio-file/");
  } else if (path.startsWith("/audio/calls/")) {
    path = path.replace("/audio/calls/", "/api/games/number-calls/audio-file/");
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!BASE || BASE.startsWith("/")) {
    return cleanPath;
  }
  return `${BASE.replace(/\/api\/?$/, "")}${cleanPath}`;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (typeof window !== "undefined") {
    const staffToken = sessionStorage.getItem("hg_staff_token");
    const playerToken = sessionStorage.getItem("hg_player_token") || localStorage.getItem("hg_player_token");

    // Player self-service endpoints (identity comes from the token, not a URL param)
    // must always use the player token — a staff member can be signed into both
    // dashboards in the same browser, and a stray staff token here would silently
    // 401/404 these calls (the JWT has no playerId), bouncing the player out.
    const isPlayerSelfPath =
      /^\/api\/player\/(me|stats)(\?|$)/.test(path) ||
      /\/my-tickets(\?|$)/.test(path) ||
      /\/claim(\?|$)/.test(path) ||
      /\/reactions(\?|$)/.test(path);

    if (isPlayerSelfPath && playerToken) {
      headers["Authorization"] = `Bearer ${playerToken}`;
    } else if (staffToken) {
      headers["Authorization"] = `Bearer ${staffToken}`;
    } else if (playerToken) {
      headers["Authorization"] = `Bearer ${playerToken}`;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const error = new Error(err.message ?? "Request failed");
    (error as Error & { status?: number }).status = res.status;
    Object.assign(error, err);
    throw error;
  }
  return res.json() as Promise<T>;
}

// A network failure (offline, DNS, a mid-deploy connection-refused window) never
// reaches the `!res.ok` branch above and so carries no `.status` — only a real
// 401/403 response from the server means the session is actually invalid. Callers
// that redirect-to-login or clear stored tokens on any fetch failure will bounce
// a user with a perfectly valid session during any transient blip; gate on this
// instead of reacting to every thrown error.
export function isAuthError(err: unknown): boolean {
  const status = (err as { status?: number } | null | undefined)?.status;
  return status === 401 || status === 403;
}
