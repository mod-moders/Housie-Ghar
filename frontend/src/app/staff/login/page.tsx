"use client";
/** Staff login — password-only (no OTP). */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";

export default function StaffLogin() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (typeof window !== "undefined") {
        sessionStorage.setItem("hg_staff_token", res.token);
      }
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
          <button className="hg-back hg-back-float" onClick={() => router.push("/")} aria-label="Back to site">
            <Icon name="arrowL" size={20} />
          </button>
          <div className="hg-login-card">
            <div className="hg-login-brand" style={{ marginBottom: "16px" }}>
              <Image
                src="/HG Secondary.png"
                alt="Housie Ghar Logo"
                width={220}
                height={220}
                priority
                className="object-contain filter drop-shadow-[0_0_15px_rgba(6,182,212,0.15)]"
              />
            </div>
            <div className="hg-login-secure"><Icon name="shield" size={13} /> Secure staff portal</div>
            <h1 className="hg-login-title">Sign in to continue</h1>
            <form
              onSubmit={(e) => { e.preventDefault(); submit(); }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label className="hg-login-field">
                <span>Username</span>
                <input
                  type="text"
                  value={email}
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
          </div>
        </div>
      </div>
    </div>
  );
}
