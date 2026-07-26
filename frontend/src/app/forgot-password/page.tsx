"use client";
/**
 * Password recovery for players.
 *
 * Two steps: name -> then either "prove it with the phone on your account and pick a new
 * password", or, for accounts with no phone saved, a WhatsApp hand-off to support. The
 * phone is the only identifier the platform already holds for most players; the housie
 * name can't be used to prove anything because it's public on the leaderboard.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { getDeviceId } from "@/lib/deviceId";
import { setPlayerToken, MIN_PASSWORD_LENGTH } from "@/lib/playerSession";

type Lookup =
  | { method: "phone"; phone_hint: string }
  | { method: "support"; support_whatsapp: string | null };

export default function ForgotPassword() {
  const router = useRouter();
  const [housieName, setHousieName] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputClass =
    "w-full px-4 py-3 rounded-lg focus:outline-none focus:border-[#06B6D4] transition-colors text-sm";
  const inputStyle = {
    background: "var(--bg)",
    border: "1.5px solid var(--border)",
    color: "var(--text)",
  } as const;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!housieName.trim()) {
      setError("Please enter your Housie Name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<Lookup>("/api/player/forgot-password", {
        method: "POST",
        body: JSON.stringify({ housie_name: housieName.trim() }),
      });
      setLookup(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string }>("/api/player/reset-password", {
        method: "POST",
        body: JSON.stringify({
          housie_name: housieName.trim(),
          phone,
          password,
          device_id: getDeviceId(),
        }),
      });
      // The server signs the player in on a successful reset, so send them
      // straight to the lobby rather than back through the login form.
      setPlayerToken(res.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hg-screen flex px-4 py-12" style={{ background: "var(--bg)", height: "100dvh", overflowY: "auto" }}>
      <div
        className="w-full max-w-md p-8 relative"
        style={{
          margin: "auto",
          background: "var(--surface)",
          border: "1.5px solid var(--border)",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex justify-center mb-8">
          <Image
            src="/HG Secondary.png"
            alt="Housie Ghar"
            width={200}
            height={200}
            priority
            className="object-contain"
          />
        </div>

        <h1 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: "Outfit, sans-serif", color: "var(--text)" }}>
          Reset Password
        </h1>
        <p className="text-center text-sm mb-6" style={{ color: "var(--text-mute)" }}>
          {lookup === null
            ? "Enter your Housie Name to get started."
            : lookup.method === "phone"
              ? "Confirm the phone number on your account, then pick a new password."
              : "We need to check it's really you."}
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm mb-6 text-center">
            {error}
          </div>
        )}

        {lookup === null && (
          <form onSubmit={handleLookup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="fp-name" style={{ color: "var(--text-dim)" }}>
                Housie Name
              </label>
              <input
                id="fp-name"
                type="text"
                required
                autoFocus
                placeholder="Your registered Housie Name"
                value={housieName}
                onChange={(e) => setHousieName(e.target.value)}
                className={`${inputClass} font-mono`}
                style={inputStyle}
              />
            </div>
            <Button type="submit" variant="cta" full disabled={loading}>
              {loading ? "Checking…" : "CONTINUE"}
            </Button>
          </form>
        )}

        {lookup?.method === "phone" && (
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="fp-phone" style={{ color: "var(--text-dim)" }}>
                Phone Number
              </label>
              <input
                id="fp-phone"
                type="tel"
                required
                autoFocus
                inputMode="numeric"
                placeholder={`Ends in ${lookup.phone_hint.slice(-4)}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputClass} font-mono`}
                style={inputStyle}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>
                The number saved on your account: {lookup.phone_hint}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="fp-password" style={{ color: "var(--text-dim)" }}>
                New Password
              </label>
              <div className="hg-password-wrapper">
                <input
                  id="fp-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
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

            <Button type="submit" variant="cta" full disabled={loading}>
              {loading ? "Resetting…" : "SET NEW PASSWORD"}
            </Button>
          </form>
        )}

        {lookup?.method === "support" && (
          <div className="space-y-4">
            <p className="text-sm text-center" style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>
              There&rsquo;s no phone number saved on this account, so we can&rsquo;t verify it
              automatically. Message your bookie or the Housie Ghar team and they&rsquo;ll get you
              back in.
            </p>
            {lookup.support_whatsapp && (
              <a
                href={lookup.support_whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold"
                style={{ background: "var(--cta)", color: "var(--cta-ink)" }}
              >
                <Icon name="chat" size={16} /> Message us on WhatsApp
              </a>
            )}
            <p className="text-[11px] text-center" style={{ color: "var(--text-mute)" }}>
              Once you&rsquo;re back in, add your phone number under Profile so you can reset it
              yourself next time.
            </p>
          </div>
        )}

        <div className="mt-6 text-center text-sm" style={{ color: "var(--text-mute)" }}>
          <Link href="/login" className="hover:underline font-semibold" style={{ color: "var(--accent)" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
