"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export default function SignUp() {
  const router = useRouter();
  const [housieName, setHousieName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);

  useEffect(() => {
    // Check if there is an active session
    apiFetch<{ player: { housieName: string } }>("/api/player/me")
      .then(() => {
        router.push("/");
      })
      .catch(() => {
        // No active session, stay on signup
      });

    // Check for promoter referral ID
    const storedRef = localStorage.getItem("hg_ref_promoter_id");
    if (storedRef) {
      setRefId(storedRef);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!housieName) {
      setError("Please fill in a Housie Name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ token: string }>("/api/player/signup", {
        method: "POST",
        body: JSON.stringify({
          housie_name: housieName,
          ref_promoter_id: refId,
        }),
      });

      if (typeof window !== "undefined") {
        sessionStorage.setItem("hg_player_token", res.token);
      }

      // Redirect to lobby
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Sign up failed. Please try again.");
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
          Sign Up
        </h1>
        <p className="text-center text-gray-400 text-sm mb-6">
          Sign up to pick tickets and join the live draws.
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
              placeholder="Choose a username/alias (3-20 chars)"
              value={housieName}
              onChange={(e) => setHousieName(e.target.value)}
              className="w-full px-4 py-3 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Your Housie Name will be used to log in on returning visits.
            </p>
          </div>

          <Button type="submit" variant="cta" full disabled={loading}>
            {loading ? "Registering..." : "ENTER LOBBY"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          Already registered?{" "}
          <Link href="/login" className="text-[#06B6D4] hover:underline">
            Log in with Housie Name
          </Link>
        </div>
      </div>
    </div>
  );
}
