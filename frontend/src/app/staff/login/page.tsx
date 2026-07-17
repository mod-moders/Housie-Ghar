"use client";
/** Staff login — password-only (no OTP). */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";

export default function StaffLogin() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reason we were bounced back here AFTER a successful login (set by the
  // staff dashboard when /api/auth/me rejects a token we were just issued).
  // Without this the failure is a silent loop back to this page.
  useEffect(() => {
    const n = sessionStorage.getItem("hg_staff_login_notice");
    if (n) {
      sessionStorage.removeItem("hg_staff_login_notice");
      setNotice(n);
    }
  }, []);

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (typeof window !== "undefined") {
        sessionStorage.setItem("hg_staff_token", res.token);
        // The /staff route is gated by proxy.ts (Next middleware), which can only
        // read cookies — not this sessionStorage bearer token. The backend sets an
        // httpOnly hg_auth_token cookie, but it lands on the API's domain and never
        // reaches this frontend domain's middleware (cross-domain deploy), so every
        // post-login push to /staff was redirected straight back here — the "stuck
        // on Signing in..." loop. Mirror the token into a first-party cookie so the
        // middleware sees an authenticated request; real validation still happens
        // server-side via the Bearer token on /api/auth/me.
        document.cookie = `hg_auth_token=${res.token}; path=/; max-age=604800; SameSite=Lax; Secure`;
      }
      setUser(res.user);
      router.push("/staff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="hg-screen flex items-center justify-center min-h-screen bg-[#0B0B0C] px-4 py-12">
      <div className="w-full max-w-md bg-[#121214] border border-[#27272A] rounded-2xl p-8 shadow-2xl relative">
        {/* Exit to Lobby Shortcut Icon */}
        <Link href="/" className="absolute top-4 right-4 text-[#06B6D4] hover:text-[#F43F5E] transition-colors" title="Exit to Lobby">
          <Icon name="home" size={20} strokeWidth={2} />
        </Link>

        {/* Secondary Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/HG Secondary.png"
            alt="Housie Ghar Secondary Logo"
            width={220}
            height={220}
            priority
            className="object-contain filter drop-shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          />
        </div>

        <h1 className="text-2xl font-bold text-center text-white mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
          Staff Login
        </h1>
        <p className="text-center text-gray-400 text-sm mb-6 flex items-center justify-center gap-1.5">
          <Icon name="shield" size={14} className="text-[#06B6D4]" /> Secure staff portal
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm mb-6 text-center">
            {error}
          </div>
        )}

        {notice && (
          <div className="bg-amber-900/30 border border-amber-500/50 rounded-lg p-3 text-amber-200 text-sm mb-6 text-center">
            Signed in, but the session was rejected: {notice}
            <br />
            <span className="text-amber-200/70 text-xs">
              If this happens right after every login, the server&apos;s JWT keys are misconfigured — contact the administrator.
            </span>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="email">
              Username / Email
            </label>
            <input
              id="email"
              type="text"
              required
              autoComplete="username"
              placeholder="Enter your staff email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="password">
              Password
            </label>
            <div className="hg-password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bitwarden-ignore="true"
                className="w-full px-4 py-3 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
              />
              <button
                type="button"
                className="hg-password-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide Password" : "Show Password"}
              >
                <Icon name={showPassword ? "eye" : "eyeOff"} size={16} />
              </button>
            </div>
          </div>

          <Button type="submit" variant="cta" full disabled={busy || !email || !password}>
            {busy ? "Signing in..." : "CONTINUE"}
          </Button>
        </form>
      </div>
    </div>
  );
}
