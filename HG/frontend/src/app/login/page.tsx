"use client";
/**
 * Public entry gate — "Get started" card (username / full name / date of
 * birth). The username doubles as the password: returning players just enter
 * their username. A small button below swaps to the staff sign-in card.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayerStore, Player } from "@/lib/stores/playerStore";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Button, Logo } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<"player" | "staff">("player");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m: "player" | "staff") => {
    setMode(m);
    setError(null);
  };

  const submitPlayer = async () => {
    if (!username.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ player: Player }>("/api/players/login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          full_name: fullName.trim() || undefined,
          date_of_birth: dob || undefined,
        }),
      });
      setPlayer(res.player);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  const submitStaff = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(res.user);
      router.push("/staff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="hg-stage">
      <div className="hg-frame">
        <div className="hg-staff-login">
          <div className="hg-login-card">
            <div className="hg-login-brand"><Logo size={72} /></div>
            {mode === "player" ? (
              <>
                <h1 className="hg-login-title">Get started</h1>
                <form
                  onSubmit={(e) => { e.preventDefault(); submitPlayer(); }}
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <label className="hg-login-field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={username}
                      placeholder="e.g. lucky_kong"
                      autoComplete="username"
                      maxLength={18}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                  <label className="hg-login-field">
                    <span>Full name</span>
                    <input
                      type="text"
                      value={fullName}
                      placeholder="Your full name"
                      autoComplete="name"
                      maxLength={100}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </label>
                  <label className="hg-login-field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={dob}
                      autoComplete="bday"
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDob(e.target.value)}
                    />
                  </label>
                  {error && <div className="hg-login-err">{error}</div>}
                  <Button variant="cta" size="lg" full type="submit" disabled={busy || !username.trim()}>
                    {busy ? "One moment…" : "Continue"}
                  </Button>
                  <div className="hg-login-hint">
                    Played before? Just enter your <code>username</code> — it&apos;s your password too.
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="hg-login-secure"><Icon name="shield" size={13} /> Secure staff portal</div>
                <h1 className="hg-login-title">Staff sign in</h1>
                <form
                  onSubmit={(e) => { e.preventDefault(); submitStaff(); }}
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <label className="hg-login-field">
                    <span>Username</span>
                    <input
                      type="email"
                      value={email}
                      placeholder="you@housieghar.local"
                      autoComplete="username"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label className="hg-login-field">
                    <span>Password</span>
                    <input
                      type="password"
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
              </>
            )}
          </div>

          {mode === "player" ? (
            <button className="hg-login-switch" onClick={() => switchMode("staff")}>
              <Icon name="lock" size={13} /> Staff login
            </button>
          ) : (
            <button className="hg-login-switch" onClick={() => switchMode("player")}>
              <Icon name="arrowL" size={13} /> Player login
            </button>
          )}

          <div className="hg-login-foot">Powered by <strong>MOD</strong></div>
        </div>
      </div>
    </div>
  );
}
