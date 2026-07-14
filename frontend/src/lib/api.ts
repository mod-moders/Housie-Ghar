const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any ?? {}),
  };

  if (typeof window !== "undefined") {
    const staffToken = sessionStorage.getItem("hg_staff_token");
    const playerToken = localStorage.getItem("hg_player_token") || sessionStorage.getItem("hg_player_token");

    // Player self-service endpoints (identity comes from the token, not a URL param)
    // must always use the player token — a staff member can be signed into both
    // dashboards in the same browser, and a stray staff token here would silently
    // 401/404 these calls (the JWT has no playerId), bouncing the player out.
    const isPlayerSelfPath = /^\/api\/player\/(me|stats)(\?|$)/.test(path) || /\/my-tickets(\?|$)/.test(path);

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
    (error as any).status = res.status;
    Object.assign(error, err);
    throw error;
  }
  return res.json() as Promise<T>;
}
