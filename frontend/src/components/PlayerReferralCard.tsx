"use client";
/**
 * Player referral card — shown on the profile page.
 *
 * Mirrors the surrounding "My Winnings & Prize Claims" card exactly (same surface,
 * border, radius, header treatment) so it reads as part of the same page rather
 * than a bolted-on panel.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/Icon";

interface PlayerRewards {
  enabled: boolean;
  referral_code: string | null;
  ladder: number[];
  ladder_repeat_step: number;
  qualified_referrals: number;
  pending_referrals: number;
  credits_earned: number;
  credits_redeemed: number;
  credits_available: number;
  next_rung_at: number | null;
  referrals_to_next_rung: number | null;
  referees: { housie_name: string; registered_at: string; qualified: boolean }[];
}

export function PlayerReferralCard() {
  const [data, setData] = useState<PlayerRewards | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    apiFetch<PlayerRewards>("/api/rewards/player")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Hide entirely rather than render an error box — this is a bonus surface on a
  // page that has to keep working for players who aren't in the programme.
  if (loading || !data || !data.enabled || !data.referral_code) return null;

  const shareText = `Play Housie Ghar with me! Use my referral code ${data.referral_code} when you sign up.`;

  const copyCode = () => {
    navigator.clipboard?.writeText(data.referral_code ?? "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  // Progress across the current rung, measured from the previous rung so the bar
  // fills smoothly instead of jumping.
  const next = data.next_rung_at;
  const prevRung = (() => {
    const passed = data.ladder.filter((t) => t <= data.qualified_referrals);
    if (passed.length === 0) return 0;
    return passed[passed.length - 1];
  })();
  const span = next !== null ? Math.max(1, next - prevRung) : 1;
  const into = next !== null ? data.qualified_referrals - prevRung : 0;
  const pct = next !== null ? Math.max(0, Math.min(100, (into / span) * 100)) : 100;

  return (
    <div
      style={{
        marginTop: 24,
        width: "100%",
        background: "var(--surface)",
        padding: "24px",
        borderRadius: 16,
        border: "1px solid var(--border-light)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-light)", paddingBottom: 12 }}>
        <Icon name="users" size={18} style={{ color: "var(--accent)" }} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Invite Friends, Earn Free Tickets
        </h3>
      </div>

      {/* Code + share */}
      <div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>Your referral code</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "1px",
              color: "var(--accent)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
              borderRadius: 10,
              padding: "10px 16px",
            }}
          >
            {data.referral_code}
          </code>
          <button
            onClick={copyCode}
            style={{
              borderRadius: 999,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--text)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="copy" size={14} /> {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={shareWhatsApp}
            style={{
              borderRadius: 999,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              color: "var(--cta-ink)",
              background: "var(--cta)",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="chat" size={14} /> Share
          </button>
        </div>
      </div>

      {/* Standing */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {[
          { label: "Free tickets", value: data.credits_available, accent: true },
          { label: "Friends playing", value: data.qualified_referrals, accent: false },
          { label: "Waiting", value: data.pending_referrals, accent: false },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
              borderRadius: 10,
              padding: "12px",
              textAlign: "center",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: s.accent ? "var(--accent)" : "var(--text)" }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ladder progress */}
      <div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border-light)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--cta)", transition: "width .35s ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
          {next === null ? (
            <>You&rsquo;ve reached the top of the reward ladder. Nice work.</>
          ) : (
            <>
              {data.referrals_to_next_rung} more friend{data.referrals_to_next_rung === 1 ? "" : "s"} to buy a ticket and
              you earn another free one. A friend counts once they book their first ticket.
            </>
          )}
        </div>
      </div>

      {/* Who you brought in */}
      {data.referees.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Friends you invited</div>
          {data.referees.slice(0, 8).map((r) => (
            <div
              key={r.housie_name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border-light)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.housie_name}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: "3px 10px",
                  color: r.qualified ? "var(--success)" : "var(--text-dim)",
                  background: r.qualified ? "var(--success-soft)" : "transparent",
                  border: `1px solid ${r.qualified ? "var(--success)" : "var(--border-light)"}`,
                }}
              >
                {r.qualified ? "Playing" : "Not booked yet"}
              </span>
            </div>
          ))}
          {data.referees.length > 8 && (
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              +{data.referees.length - 8} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
