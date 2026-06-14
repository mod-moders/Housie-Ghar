// Same-origin by default: requests go to /api on whatever host served the page
// and Next proxies them to the backend (see next.config rewrites). This means
// one URL — localhost, a LAN IP, or a public tunnel — works with zero config.
// Set NEXT_PUBLIC_API_URL only to target a backend on a different origin.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}
