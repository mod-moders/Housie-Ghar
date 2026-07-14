"use client";
/** Per-door staff login. Enforces that the credentials belong to `expects`;
 *  a mismatch discards the session and shows an error (you picked the wrong
 *  door). The role check is UX/routing — every staff API is still guarded
 *  server-side by requireRole(...). */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Button, Logo, PasswordInput } from "@/components/ui";
import { STAFF_DOORS, type DoorRole } from "@/lib/staffRoles";

export function RoleLogin({ expects }: { expects: DoorRole }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const door = STAFF_DOORS[expects];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.user.role_name !== expects) {
        // Wrong door: discard the session the backend just issued, then reject.
        try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
        setError(`These credentials aren't a ${door.label} account.`);
        setBusy(false);
        return;
      }
      setUser(res.user);
      router.push(door.panel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="hg-stage">
      <div className="hg-frame">
        <div className="hg-staff-login">
          <button className="hg-back hg-back-float" onClick={() => router.push("/")} aria-label="Back to site">
            <Icon name="arrowL" size={20} />
          </button>
          <div className="hg-login-card">
            <div className="hg-login-brand"><Logo size={72} /></div>
            <div className="hg-login-secure"><Icon name={door.icon} size={13} /> {door.label} portal</div>
            <h1 className="hg-login-title">{door.label} sign-in</h1>
            <form
              onSubmit={(e) => { e.preventDefault(); submit(); }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label className="hg-login-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="hg-login-field">
                <span>Password</span>
                <PasswordInput
                  value={password}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <div className="hg-login-err">{error}</div>}
              <Button variant="cta" size="lg" full type="submit" disabled={busy || !email || !password}>
                {busy ? "Signing in…" : "Continue"}
              </Button>
            </form>
          </div>
          <div className="hg-login-foot">Powered by <strong>MOD</strong></div>
        </div>
      </div>
    </div>
  );
}
