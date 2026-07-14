"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [housieName, setHousieName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        localStorage.setItem("hg_player_token", res.token);
        sessionStorage.setItem("hg_player_token", res.token);
      }

      // Redirect to lobby
      router.push("/");
    } catch (err: any) {
      if (err.password_required) {
        setPasswordRequired(true);
        setError("This account is secured. Please enter your password.");
      } else {
        setError(err.message || "Housie Name not found. Check spelling or sign up.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hg-screen flex items-center justify-center min-h-screen bg-[#0B0B0C] px-4 py-12">
      <div className="w-full max-w-md bg-[#121214] border border-[#27272A] rounded-2xl p-8 shadow-2xl relative">
        {/* Staff Shortcut Icon */}
        <Link href="/staff/login" className="absolute top-4 right-4 text-[#06B6D4] hover:text-[#F43F5E] transition-colors" title="Staff Login">
          <Icon name="key" size={20} strokeWidth={2} />
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
          Login
        </h1>
        <p className="text-center text-gray-400 text-sm mb-6">
          {passwordRequired ? "Authenticate with password to enter lobby" : "Enter your Housie Name to continue."}
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="housie-name">
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
              className="w-full px-4 py-3 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {passwordRequired && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-gray-300 text-sm font-medium" htmlFor="password">
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
              <input
                id="password"
                type="password"
                required
                autoFocus
                placeholder="Enter your account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
              />
            </div>
          )}

          <Button type="submit" variant="cta" full disabled={loading}>
            {loading ? "Checking..." : "ENTER LOBBY"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          New to Housie Ghar?{" "}
          <Link href="/signup" className="text-[#06B6D4] hover:underline">
            Sign Up now!
          </Link>
        </div>
      </div>
    </div>
  );
}
