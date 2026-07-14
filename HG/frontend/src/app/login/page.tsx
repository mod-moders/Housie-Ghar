"use client";
/**
 * Public entry gate — "Get started" card (username / full name / date of
 * birth). The username doubles as the password: returning players just enter
 * their username. A small button below swaps to the staff sign-in card.
 */

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayerStore, Player } from "@/lib/stores/playerStore";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Button, Logo } from "@/components/ui";
import { STAFF_DOORS, DROPDOWN_DOORS } from "@/lib/staffRoles";

// false during SSR/first paint, true after hydration — lets us read the
// localStorage-backed player store without a hydration mismatch.
const emptySubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(emptySubscribe, () => true, () => false);

export default function LoginPage() {
  const router = useRouter();
  const setPlayer = usePlayerStore((s) => s.setPlayer);
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<"player" | "staff">("player");
  const [username, setUsername] = useState("");

  // Sign in vs. sign up defaults to whatever this device has done before: a
  // player object lingers in localStorage until explicit sign-out — even
  // after the session cookie itself expires — so its presence means
  // "returning player". `null` = no manual tab click yet, so the computed
  // default still applies.
  const hydrated = useHydrated();
  const hasPlayedBefore = usePlayerStore((s) => (hydrated ? !!s.player : false));
  const [authTabOverride, setAuthTabOverride] = useState<"signin" | "signup" | null>(null);
  const authTab: "signin" | "signup" = authTabOverride ?? (hasPlayedBefore ? "signin" : "signup");

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

  const switchAuthTab = (tab: "signin" | "signup") => {
    setAuthTabOverride(tab);
    setError(null);
  };

  const submitPlayer = async () => {
    if (!username.trim() || busy) return;
    if (authTab === "signup" && (!fullName.trim() || !dob)) return;
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
      const msg = e instanceof Error ? e.message : "Login failed";
      // The backend asks for name/DOB only when the username doesn't exist
      // yet — flip to the sign-up tab instead of surfacing a raw error.
      if (authTab === "signin" && (msg === "Full name is required" || msg === "A valid date of birth is required")) {
        setAuthTabOverride("signup");
      } else {
        setError(msg);
      }
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
                <h1 className="hg-login-title">{authTab === "signup" ? "Get started" : "Welcome back"}</h1>

                <div className="hg-seg" role="tablist" aria-label="Sign in or sign up" style={{ alignSelf: "center" }}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authTab === "signin"}
                    className={`hg-seg-btn${authTab === "signin" ? " is-active" : ""}`}
                    onClick={() => switchAuthTab("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authTab === "signup"}
                    className={`hg-seg-btn${authTab === "signup" ? " is-active" : ""}`}
                    onClick={() => switchAuthTab("signup")}
                  >
                    Sign up
                  </button>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); submitPlayer(); }}
                  style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}
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
                  {authTab === "signup" && (
                    <>
                      <div className="hg-login-hint" style={{ textAlign: "left" }}>
                        Tell us a bit about yourself — after this, your username alone signs you in.
                      </div>
                      <label className="hg-login-field">
                        <span>Full name</span>
                        <input
                          type="text"
                          value={fullName}
                          placeholder="Your full name"
                          autoComplete="name"
                          maxLength={100}
                          autoFocus={!!username.trim()}
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
                    </>
                  )}
                  {error && <div className="hg-login-err">{error}</div>}
                  <Button
                    variant="cta" size="lg" full type="submit"
                    disabled={busy || !username.trim() || (authTab === "signup" && (!fullName.trim() || !dob))}
                  >
                    {busy ? "One moment…" : authTab === "signup" ? "Create account" : "Sign in"}
                  </Button>
                  <div className="hg-login-hint">
                    {authTab === "signup" ? (
                      <>Played before? Double-check your <code>username</code> spelling and tap <strong>Sign in</strong> above.</>
                    ) : (
                      <>Your <code>username</code> is your password too. New here? Tap <strong>Sign up</strong> above.</>
                    )}
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="hg-login-secure"><Icon name="shield" size={13} /> Secure staff portal</div>
                <h1 className="hg-login-title">Staff sign in</h1>

                <div className="hg-door-list">
                  {DROPDOWN_DOORS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      className="hg-door-btn"
                      onClick={() => router.push(STAFF_DOORS[role].login)}
                    >
                      <span className="hg-door-ic"><Icon name={STAFF_DOORS[role].icon} size={16} /></span>
                      <span className="hg-door-label">{STAFF_DOORS[role].label}</span>
                      <Icon name="chevR" size={16} className="hg-door-chev" />
                    </button>
                  ))}
                </div>
                <div className="hg-login-hint">Not sure which portal? Sign in with any staff email below.</div>

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
