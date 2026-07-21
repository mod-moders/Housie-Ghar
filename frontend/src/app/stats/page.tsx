"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Footer } from "@/components/ui";
import { money } from "@/lib/money";
import type { PlayerStats, HallOfFameEntry } from "@/lib/types";
import { useSocket } from "@/lib/hooks/useSocket";

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankInfo, setRankInfo] = useState<{ rank: number; totalPlayers: number } | null>(null);

  const loadStats = useCallback(() => {
    apiFetch<PlayerStats>("/api/player/stats")
      .then((res) => {
        setStats(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load stats", err);
        if (isAuthError(err)) {
          router.push("/login");
        }
      });
  }, [router]);

  const loadRank = useCallback(() => {
    Promise.all([
      apiFetch<{ player: { housie_name: string } }>("/api/player/me").catch(() => null),
      apiFetch<HallOfFameEntry[]>("/api/stats/hall-of-fame?timeframe=all-time").catch(() => null),
    ]).then(([me, entries]) => {
      if (!me || !entries || entries.length === 0) return;
      const sorted = [...entries].sort((a, b) => b.total_won - a.total_won);
      const idx = sorted.findIndex(
        (e) => e.housie_name.toLowerCase().trim() === me.player.housie_name.toLowerCase().trim()
      );
      if (idx >= 0) setRankInfo({ rank: idx + 1, totalPlayers: sorted.length });
    });
  }, []);

  useEffect(() => {
    loadStats();
    loadRank();
    const interval = setInterval(() => {
      loadStats();
      loadRank();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadStats, loadRank]);

  useSocket((event) => {
    if (
      event === "player_stats_update" ||
      event === "game_completed" ||
      event === "draw_ended" ||
      event === "prize_claimed" ||
      event === "prize_disbursed" ||
      event === "game_list_update"
    ) {
      loadStats();
      loadRank();
    }
  });

  if (loading || !stats) {
    return (
      <PublicShell>
        <div className="hg-screen" style={{ display: "grid", placeItems: "center" }}>
          <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </PublicShell>
    );
  }

  /* Calculations */
  const net = stats.amount_won - stats.total_expenditure;
  const netPositive = net >= 0;
  const roi = stats.total_expenditure > 0
    ? (((stats.amount_won / stats.total_expenditure) * 100) - 100).toFixed(1)
    : "0";
  const winRate = stats.games_played > 0
    ? ((stats.games_won / stats.games_played) * 100).toFixed(0)
    : "0";
  const avgSpend = stats.games_played > 0
    ? Math.round(stats.total_expenditure / stats.games_played)
    : 0;
  const avgTickets = stats.games_played > 0
    ? (stats.tickets_bought / stats.games_played).toFixed(1)
    : "0";

  const tier = stats.total_wins >= 10
    ? { label: "Legend", icon: "🏆", color: "#F59E0B" }
    : stats.total_wins >= 5
    ? { label: "Elite", icon: "🔥", color: "#EC4899" }
    : stats.total_wins >= 2
    ? { label: "Veteran", icon: "⭐", color: "#3B82F6" }
    : { label: "Contender", icon: "✨", color: "#8B5CF6" };

  const consistencyStars = Math.min(5, Math.max(1, Math.ceil(stats.total_wins / 2)));
  const percentile = rankInfo ? Math.max(1, Math.ceil((rankInfo.rank / rankInfo.totalPlayers) * 100)) : null;

  let memberDuration = "—";
  let memberSinceDate = "Unknown";
  if (stats.member_since) {
    const d = new Date(stats.member_since);
    memberSinceDate = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) memberDuration = "Today";
    else if (days < 30) memberDuration = `${days}d`;
    else if (days < 365) memberDuration = `${Math.floor(days / 30)}mo`;
    else {
      const y = Math.floor(days / 365);
      const m = Math.floor((days % 365) / 30);
      memberDuration = `${y}y${m > 0 ? ` ${m}mo` : ""}`;
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 960, width: "100%", margin: "0 auto", padding: "0 16px",
  };

  return (
    <PublicShell>
      <div className="hg-screen" style={{ overflow: "auto", paddingBottom: 24 }}>
        <div style={{ ...containerStyle, display: "flex", flexDirection: "column", gap: 14, paddingTop: 20 }}>
          
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, margin: 0, fontFamily: "var(--font-head)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>
                My Statistics &amp; Performance
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0 0" }}>
                Personal lifetime performance metrics and achievements synchronized in real-time.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#10B981" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
              Live Synced
            </div>
          </div>

          {/* Core Metrics Ribbon Card */}
          <div className="hg-card hg-glass-panel" style={{
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
            boxShadow: "var(--card-shadow-sm)",
          }}>
            {/* Net Figure */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                display: "grid", placeItems: "center",
                background: netPositive ? "rgba(16,185,129,.14)" : "rgba(239,68,68,.14)",
              }}>
                <Icon name="chart" size={20} style={{ color: netPositive ? "#10B981" : "#EF4444" }} />
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-dim)" }}>
                  {netPositive ? "Net Profit" : "Net Loss"}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: netPositive ? "#10B981" : "#EF4444" }}>
                  {money(net)}
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Win Rate</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--accent)", marginTop: 2 }}>{winRate}%</div>
            </div>

            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>ROI</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: Number(roi) >= 0 ? "#10B981" : "#EF4444", marginTop: 2 }}>
                {Number(roi) >= 0 ? `+${roi}%` : `${roi}%`}
              </div>
            </div>

            {/* Tier & Consistency */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", fontSize: 18, display: "grid", placeItems: "center", background: `${tier.color}22` }}>
                {tier.icon}
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Tier</div>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-head)", color: tier.color }}>{tier.label}</div>
                <div style={{ display: "flex", gap: 2, marginTop: 1 }}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <span key={idx} style={{ fontSize: 11, color: idx < consistencyStars ? "#ffd700" : "var(--border-2)" }}>★</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Rank */}
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Leaderboard Rank</div>
              {percentile !== null && rankInfo ? (
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--accent)", marginTop: 2 }}>
                  #{rankInfo.rank} of {rankInfo.totalPlayers} <span style={{ color: "var(--text-mute)", fontWeight: 600, fontSize: 11 }}>· Top {percentile}%</span>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-mute)", fontWeight: 600, marginTop: 2 }}>Unranked</div>
              )}
            </div>
          </div>

          {/* 2-Column Dashboard Body */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            
            {/* Left Column: Financial & Activity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Financial Summary */}
              <div className="hg-card hg-glass-panel" style={{ padding: "16px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="wallet" size={14} />
                  Financial Breakdown
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Total Won" value={money(stats.amount_won)} sub={`${stats.total_wins} wins`} />
                  <MiniBox label="Total Spent" value={money(stats.total_expenditure)} sub="Ticket purchases" />
                  <MiniBox label="Best Single Win" value={money(stats.highest_amount_single_game)} sub="Max in one session" />
                  <MiniBox label="Avg Spend / Game" value={money(avgSpend)} sub={`${stats.games_played} sessions`} />
                </div>
              </div>

              {/* Activity & Membership */}
              <div className="hg-card hg-glass-panel" style={{ padding: "16px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="clock" size={14} />
                  Activity &amp; Ticket Volume
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Games Played" value={stats.games_played} sub="Total sessions" />
                  <MiniBox label="Ticket Volume" value={`${stats.tickets_bought} tickets`} sub={`${avgTickets} avg / game`} />
                  <MiniBox label="Member Duration" value={memberDuration} sub={memberSinceDate} />
                  <MiniBox label="Luckiest Ticket #" value={stats.luckiest_ticket_number ? `#${stats.luckiest_ticket_number}` : "—"} sub="Wins most on" />
                </div>
              </div>

              {/* Streaks & Performance */}
              <div className="hg-card hg-glass-panel" style={{ padding: "16px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="flame" size={14} />
                  Streaks &amp; Records
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Win Streak" value={`${stats.longest_winning_run} games`} sub="Consecutive wins" />
                  <MiniBox label="Dry Spell" value={`${stats.unluckiest_run} games`} sub="Consecutive losses" />
                </div>
              </div>
            </div>

            {/* Right Column: Detailed Prize Win Breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {stats.pattern_wins && (
                <div className="hg-card hg-glass-panel" style={{ padding: "16px", boxShadow: "var(--card-shadow-sm)" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="spark" size={14} />
                    Detailed Prize Win Breakdown
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px 24px" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 800, borderBottom: "1.5px solid var(--border)", paddingBottom: 4, marginBottom: 8, letterSpacing: "0.04em" }}>
                        FULL HOUSE &amp; LINES
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <PatternRow label="Full House" count={stats.pattern_wins.full_house} />
                        <PatternRow label="1st Full House" count={stats.pattern_wins.first_full_house} />
                        <PatternRow label="2nd Full House" count={stats.pattern_wins.second_full_house} />
                        <PatternRow label="3rd Full House" count={stats.pattern_wins.third_full_house} />
                        <PatternRow label="Top Line" count={stats.pattern_wins.top_line} />
                        <PatternRow label="Middle Line" count={stats.pattern_wins.middle_line} />
                        <PatternRow label="Bottom Line" count={stats.pattern_wins.bottom_line} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 800, borderBottom: "1.5px solid var(--border)", paddingBottom: 4, marginBottom: 8, letterSpacing: "0.04em" }}>
                        SPECIAL BONUSES
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <PatternRow label="Early Five" count={stats.pattern_wins.early_five} />
                        <PatternRow label="Quick 7" count={stats.pattern_wins.quick_7} />
                        <PatternRow label="Corner" count={stats.pattern_wins.corner} />
                        <PatternRow label="Star" count={stats.pattern_wins.star} />
                        <PatternRow label="Box Bonus" count={stats.pattern_wins.box_bonus} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
        <Footer />
      </div>
    </PublicShell>
  );
}

function MiniBox({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, border: "1.5px solid var(--border)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-head)", color: color || "var(--text)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--text-mute)", lineHeight: 1.1 }}>{sub}</div>}
    </div>
  );
}

function PatternRow({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <strong style={{ color: count > 0 ? "var(--accent)" : "var(--text-mute)", fontWeight: 800 }}>{count}</strong>
    </div>
  );
}
