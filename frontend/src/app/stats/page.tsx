"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import type { PlayerStats, HallOfFameEntry } from "@/lib/types";
import { useSocket } from "@/lib/hooks/useSocket";

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankInfo, setRankInfo] = useState<{ rank: number; totalPlayers: number } | null>(null);

  const loadStats = useCallback(() => {
    apiFetch<PlayerStats>("/api/player/stats")
      .then((res) => { setStats(res); setLoading(false); })
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
      event === "game_list_update" ||
      event === "ticket_status_change"
    ) {
      loadStats();
      loadRank();
    }
  });

  if (loading || !stats) {
    return (
      <PublicShell>
        <div className="hg-screen" style={{ display: "grid", placeItems: "center" }}>
          <div className="hg-spinner" />
        </div>
      </PublicShell>
    );
  }

  /* Calculations */
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(n);

  const net = stats.amount_won - stats.total_expenditure;
  const netPositive = net >= 0;
  const roi = stats.total_expenditure > 0
    ? ((stats.amount_won / stats.total_expenditure) * 100 - 100).toFixed(1)
    : "0";
  const winRate = stats.games_played > 0
    ? ((stats.total_wins / stats.games_played) * 100).toFixed(0)
    : "0";
  const avgSpend = stats.games_played > 0
    ? Math.round(stats.total_expenditure / stats.games_played)
    : 0;
  const avgTickets = stats.games_played > 0
    ? (stats.tickets_bought / stats.games_played).toFixed(1)
    : "0";
  const totalPrizes = stats.full_house_wins + stats.line_wins + stats.other_wins;

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
    else { const y = Math.floor(days / 365); const m = Math.floor((days % 365) / 30); memberDuration = `${y}y${m > 0 ? ` ${m}mo` : ""}`; }
  }

  return (
    <PublicShell>
      <div className="hg-screen" style={{ overflow: "auto", paddingBottom: 16 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0, fontFamily: "var(--font-head)", fontWeight: 800, color: "var(--text)" }}>
                Player Statistics &amp; Performance
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#10B981" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
              Live Synced
            </div>
          </div>

          {/* Unified Compact Hero Banner */}
          <div style={{
            background: netPositive
              ? "linear-gradient(135deg, rgba(16,185,129,.14) 0%, var(--surface) 70%)"
              : "linear-gradient(135deg, rgba(239,68,68,.14) 0%, var(--surface) 70%)",
            border: "1.5px solid var(--card-line)",
            borderRadius: "var(--radius)",
            padding: "12px 18px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            alignItems: "center",
            boxShadow: "var(--card-shadow-sm)",
          }}>
            {/* Net Figure */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                display: "grid", placeItems: "center",
                background: netPositive ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)",
              }}>
                <Icon name="chart" size={22} style={{ color: netPositive ? "#10B981" : "#EF4444" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-dim)" }}>
                  {netPositive ? "Net Profit" : "Net Loss"}
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-head)", color: netPositive ? "#10B981" : "#EF4444" }}>
                  {fmt(Math.abs(net))}
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Win Rate</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-head)", color: "#F59E0B" }}>{winRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>ROI</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-head)", color: Number(roi) >= 0 ? "#10B981" : "#EF4444" }}>{roi}%</div>
              </div>
            </div>

            {/* Tier & Consistency */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", fontSize: 18, display: "grid", placeItems: "center", background: `${tier.color}22` }}>
                {tier.icon}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Tier</div>
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
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>Leaderboard Rank</div>
              {percentile !== null && rankInfo ? (
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--accent)" }}>
                  #{rankInfo.rank} of {rankInfo.totalPlayers} <span style={{ color: "var(--text-mute)", fontWeight: 600, fontSize: 11 }}>· Top {percentile}%</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-mute)", fontWeight: 600 }}>Unranked</div>
              )}
            </div>
          </div>

          {/* 2-Column Dashboard Body */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>

            {/* Left Column: Financial & Activity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Financial Summary */}
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="wallet" size={13} />
                  Financial Breakdown
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Total Won" value={fmt(stats.amount_won)} sub={`${stats.total_wins} total wins`} color="#10B981" />
                  <MiniBox label="Total Spent" value={fmt(stats.total_expenditure)} sub="Ticket purchases" color="#EF4444" />
                  <MiniBox label="Best Single Win" value={fmt(stats.highest_amount_single_game)} sub="Single game max" color="#F59E0B" />
                  <MiniBox label="Avg Spend / Game" value={fmt(avgSpend)} sub={`${stats.games_played} sessions`} color="#8B5CF6" />
                </div>
              </div>

              {/* Activity & Membership */}
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="clock" size={13} />
                  Activity &amp; Ticket Volume
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Games Played" value={stats.games_played} sub="Total sessions" color="#3B82F6" />
                  <MiniBox label="Ticket Volume" value={`${stats.tickets_bought} tickets`} sub={`${avgTickets} avg / game`} color="#EC4899" />
                  <MiniBox label="Member Duration" value={memberDuration} sub={memberSinceDate} color="#8B5CF6" />
                  <MiniBox label="Luckiest Ticket #" value={stats.luckiest_ticket_number ? `#${stats.luckiest_ticket_number}` : "—"} sub="Most wins on" color="#F59E0B" />
                </div>
              </div>
            </div>

            {/* Right Column: Prize Distribution & Streaks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Prize Breakdown */}
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="spark" size={13} />
                    Prize Distribution
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{totalPrizes} total wins</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <PrizeRow label="Full House" count={stats.full_house_wins} total={totalPrizes} color="#F59E0B" icon="home" />
                  <PrizeRow label="Line Wins" count={stats.line_wins} total={totalPrizes} color="#3B82F6" icon="grid" />
                  <PrizeRow label="Other Wins" count={stats.other_wins} total={totalPrizes} color="#8B5CF6" icon="spark" />
                </div>
              </div>

              {/* Streaks & Performance */}
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "12px 14px", boxShadow: "var(--card-shadow-sm)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="flame" size={13} />
                  Streaks &amp; Records
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MiniBox label="Win Streak" value={`${stats.longest_winning_run}`} sub="Consecutive wins" color="#10B981" />
                  <MiniBox label="Dry Spell" value={`${stats.unluckiest_run}`} sub="Consecutive losses" color="#6B7280" />
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </PublicShell>
  );
}

function MiniBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-mute)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--text)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--text-mute)", lineHeight: 1.1 }}>{sub}</div>}
    </div>
  );
}

function PrizeRow({ label, count, total, color, icon }: { label: string; count: number; total: number; color: string; icon: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name={icon} size={12} style={{ color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{label}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--font-head)", color }}>{count} <span style={{ fontSize: 10, color: "var(--text-mute)", fontWeight: 500 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 5, background: "var(--bg)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, minWidth: pct > 0 ? 5 : 0, background: color, borderRadius: 99, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}
