"use client";
/**
 * Player referral card — shown at the bottom of the home page, below Past Games.
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
  const [activeTab, setActiveTab] = useState<"playing" | "waiting" | null>(null);

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

  const referralLink = `${window.location.origin}/signup?ref=${data.referral_code}`;
  const shareText = `Play Housie Ghar with me! Sign up here: ${referralLink}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  const next = data.next_rung_at;
  const maxRung = data.ladder.length > 0 ? data.ladder[data.ladder.length - 1] : 1;

  const modalList = activeTab
    ? data.referees.filter((r) => (activeTab === "playing" ? r.qualified : !r.qualified))
    : [];

  return (
    <div
      style={{
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

      {/* Link + share */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Your personal invite link</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--accent)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            aria-label="Copy invite link"
            style={{
              flexShrink: 0,
              borderRadius: 10,
              padding: "12px 16px",
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
        </div>
        <button
          onClick={shareWhatsApp}
          style={{
            width: "100%",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            color: "var(--cta-ink)",
            background: "var(--cta)",
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon name="chat" size={14} /> Share on WhatsApp
        </button>
      </div>

      {/* Standing */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {[
          { label: "Free tickets", value: data.credits_available, accent: true, key: "free", clickable: false },
          { label: "Friends playing", value: data.qualified_referrals, accent: false, key: "playing", clickable: true },
          { label: "Waiting", value: data.pending_referrals, accent: false, key: "waiting", clickable: true },
        ].map((s) => {
          const isActive = activeTab === s.key;
          return (
            <div
              key={s.label}
              onClick={s.clickable ? () => setActiveTab(activeTab === s.key ? null : s.key as "playing" | "waiting") : undefined}
              style={{
                background: isActive ? "var(--surface-3)" : "var(--surface-2)",
                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                borderRadius: 10,
                padding: "12px",
                textAlign: "center",
                minWidth: 0,
                cursor: s.clickable ? "pointer" : "default",
                transition: "all 0.2s ease",
                transform: isActive ? "scale(0.97)" : "none",
                boxShadow: isActive ? "0 0 12px rgba(212, 175, 55, 0.15)" : "none",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: s.accent || isActive ? "var(--accent)" : "var(--text)" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {s.label}
                {s.clickable && (
                  <span style={{ fontSize: 9, opacity: 0.6, transition: "transform 0.2s ease", transform: isActive ? "rotate(180deg)" : "none" }}>
                    ▼
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ladder progress — one continuous thick bar from 0 up to the top rung,
          so growth reads as a single climb through 10 → 15 → 20 rather than
          separate boxes (which, at 0 referrals, just looked like static
          numbers with no visible progress at all). */}
      <div>
        <div
          style={{
            position: "relative",
            height: 28,
            borderRadius: 999,
            background: "var(--surface-2)",
            border: "1px solid var(--border-light)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, (data.qualified_referrals / maxRung) * 100))}%`,
              height: "100%",
              borderRadius: 999,
              background: "var(--cta)",
              transition: "width .35s ease",
            }}
          />
          {data.ladder.map((rung, i) => {
            const reached = data.qualified_referrals >= rung;
            const isLast = i === data.ladder.length - 1;
            return (
              <span
                key={rung}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(rung / maxRung) * 100}%`,
                  transform: isLast ? "translateX(-100%)" : "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 6px",
                  fontSize: 12,
                  fontWeight: 800,
                  color: reached ? "var(--cta-ink)" : "var(--text-dim)",
                }}
              >
                {rung}
              </span>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.5 }}>
          {next === null
            ? <>You&rsquo;ve reached the top of the reward ladder.</>
            : <>{data.referrals_to_next_rung} more friend{data.referrals_to_next_rung === 1 ? "" : "s"} to earn your next free ticket.</>}
        </div>
      </div>

      {/* Who you brought in (Overlay Popup Modal) */}
      {activeTab && (
        <div
          onClick={() => setActiveTab(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "var(--surface)",
              border: "1px solid var(--border-light)",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 24px rgba(212, 175, 55, 0.15)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "80vh",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                {activeTab === "playing" ? "Friends Playing" : "Friends Waiting to Join"}
              </h3>
              <button
                onClick={() => setActiveTab(null)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  fontSize: 22,
                  fontWeight: "300",
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "20px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {modalList.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>
                  {activeTab === "playing"
                    ? "No friends playing yet. Share your invite link to get started!"
                    : "No pending invites. Everyone has joined!"}
                </div>
              ) : (
                modalList.map((r) => (
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
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
