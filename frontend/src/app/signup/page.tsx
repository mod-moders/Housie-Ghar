"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { BookieApplicationModal } from "@/components/BookieApplicationModal";

export default function SignUp() {
  const router = useRouter();
  const [housieName, setHousieName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [showBookieForm, setShowBookieForm] = useState(false);

  useEffect(() => {
    // Check if there is an active session
    apiFetch<{ player: { housieName: string } }>("/api/player/me")
      .then(() => {
        router.push("/");
      })
      .catch(() => {
        // No active session, stay on signup
      });

    // Prefill a player referral code from a ?ref= share link, falling back to one
    // captured on an earlier visit. Same client-only constraint as the promoter id
    // below, so it is seeded from the effect rather than a useState initializer.
    const urlRef = new URLSearchParams(window.location.search).get("ref");
    const savedRef = localStorage.getItem("hg_referral_code");
    const incoming = (urlRef || savedRef || "").trim().toUpperCase();
    if (incoming) {
      if (urlRef) localStorage.setItem("hg_referral_code", incoming);
      // localStorage and the query string are client-only, so neither referral
      // value can be a lazy useState initializer (that would also run during SSR).
      // Seeding both from this effect on mount is the correct pattern; one
      // directive covers every setState in the effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReferralCode(incoming);
    }

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
          referral_code: referralCode.trim() || undefined,
        }),
      });

      if (typeof window !== "undefined") {
        sessionStorage.setItem("hg_player_token", res.token);
      }

      // Redirect to lobby
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hg-screen flex items-center justify-center min-h-screen px-4 py-12" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md p-8 relative" style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "16px", boxShadow: "0 20px 50px rgba(0,0,0,0.55)" }}>
        {/* Staff Shortcut Icon */}
        <Link href="/staff/login" className="absolute top-4 right-4 transition-colors" style={{ color: "var(--accent)" }} title="Staff Login">
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

        <h1 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: "Outfit, sans-serif", color: "var(--text)" }}>
          Sign Up
        </h1>
        <p className="text-center text-sm mb-6" style={{ color: "var(--text-mute)" }}>
          Sign up to pick tickets and join the live draws.
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
              placeholder="Choose a username/alias (3-20 chars)"
              value={housieName}
              onChange={(e) => setHousieName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>
              Your Housie Name will be used to log in on returning visits.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="referral-code" style={{ color: "var(--text-dim)" }}>
              Referral Code <span style={{ color: "var(--text-mute)", fontWeight: "normal" }}>(optional)</span>
            </label>
            <input
              id="referral-code"
              type="text"
              placeholder="e.g. HGPLA042"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-lg focus:outline-none focus:border-[#06B6D4] transition-colors font-mono text-sm uppercase"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>
              Got a code from a friend? Enter it here so they get credit once you book your first ticket.
            </p>
          </div>

          <Button type="submit" variant="cta" full disabled={loading}>
            {loading ? "Registering..." : "ENTER LOBBY"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm flex flex-col gap-4" style={{ color: "var(--text-mute)" }}>
          <div>
            Already registered?{" "}
            <Link href="/login" className="hover:underline font-semibold" style={{ color: "var(--accent)" }}>
              Log in with Housie Name
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
