"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { BookieApplicationModal } from "@/components/BookieApplicationModal";

export default function Login() {
  const router = useRouter();
  const [housieName, setHousieName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBookieForm, setShowBookieForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Check if there is an active session
    apiFetch<{ player: { housie_name: string } }>("/api/player/me")
      .then(() => {
        router.push("/");
      })
      .catch(() => {
        // No active session
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!housieName) {
      setError("Please enter your Housie Name.");
      return;
    }
    if (passwordRequired && !password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ token: string }>("/api/player/login", {
        method: "POST",
        body: JSON.stringify({
          housie_name: housieName,
          password: passwordRequired ? password : undefined,
        }),
      });

      if (typeof window !== "undefined") {
        sessionStorage.setItem("hg_player_token", res.token);
      }

      // Redirect to lobby
      router.push("/");
    } catch (err) {
      const e = err as { password_required?: boolean; message?: string };
      if (e.password_required) {
        setPasswordRequired(true);
        setError("This account is secured. Please enter your password.");
      } else {
        setError(e.message || "Housie Name not found. Check spelling or sign up.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hg-screen flex items-center justify-center min-h-screen px-4 py-12" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md p-8 relative" style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "16px", boxShadow: "0 20px 50px rgba(0,0,0,0.55)" }}>
        {/* Staff Shortcut Icon */}
        <a href="/staff/login" className="absolute top-4 right-4 transition-colors" style={{ color: "var(--accent)" }} title="Staff Login">
          <Icon name="shieldCheck" size={20} strokeWidth={2} />
        </a>

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

        <h1 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: "Outfit, sans-serif", color: "var(--text)" }}>
          Login
        </h1>
        <p className="text-center text-sm mb-6" style={{ color: "var(--text-mute)" }}>
          {passwordRequired ? "Authenticate with password to enter lobby" : "Enter your Housie Name to continue."}
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="housie-name" style={{ color: "var(--text-dim)" }}>
              Housie Name
            </label>
            <input
              id="housie-name"
              type="text"
              required
              disabled={passwordRequired}
              placeholder="Enter your registered Housie Name"
              value={housieName}
              onChange={(e) => setHousieName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          {passwordRequired && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-medium" htmlFor="password" style={{ color: "var(--text-dim)" }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordRequired(false);
                    setPassword("");
                    setError(null);
                  }}
                  className="text-xs text-[#F43F5E] hover:underline"
                >
                  Change Name
                </button>
              </div>
              <div className="hg-password-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoFocus
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bitwarden-ignore="true"
                  className="w-full px-4 py-3 rounded-lg focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
                  style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
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
          )}

          <Button type="submit" variant="cta" full disabled={loading}>
            {loading ? "Checking..." : "ENTER LOBBY"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm flex flex-col gap-4" style={{ color: "var(--text-mute)" }}>
          <div>
            New to Housie Ghar?{" "}
            <Link href="/signup" className="hover:underline font-semibold" style={{ color: "var(--accent)" }}>
              Sign Up now!
            </Link>
          </div>
          <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <button 
              type="button" 
              onClick={() => setShowBookieForm(true)} 
              style={{
                background: "linear-gradient(90deg, var(--accent-soft) 0%, rgba(255, 255, 255, 0.02) 100%)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                borderRadius: "var(--radius)",
                width: "100%",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s"
              }}
              className="hover:brightness-110"
            >
              <Icon name="shieldCheck" size={16} />
              Apply as Bookie for Housie Ghar
            </button>
          </div>
        </div>
      </div>

      <BookieApplicationModal isOpen={showBookieForm} onClose={() => setShowBookieForm(false)} />
    </div>
  );
}
