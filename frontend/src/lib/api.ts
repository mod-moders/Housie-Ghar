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
    if (staffToken) {
      headers["Authorization"] = `Bearer ${staffToken}`;
    } else {
      const playerToken = sessionStorage.getItem("hg_player_token");
      if (playerToken) {
        headers["Authorization"] = `Bearer ${playerToken}`;
      }
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
