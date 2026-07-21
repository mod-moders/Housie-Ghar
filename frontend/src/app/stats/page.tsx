"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import type { PlayerStats, HallOfFameEntry } from "@/lib/types";
import { useSocket } from "@/lib/hooks/useSocket";

/* ── tiny reusable pieces ────────────────────────────────────── */

const pill: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", padding: "3px 10px", borderRadius: 40,
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ ...pill, background: `${color}22`, color }}>
      {label}
    </span>
  );
}

function SectionTitle({ title, icon, extra }: { title: string; icon: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={13} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      {extra}
    </div>
  );
}

const cardBase: React.CSSProperties = {
  background: "var(--surface)", borderRadius: "var(--radius-sm)",
  border: "1.5px solid var(--card-line)", boxShadow: "var(--card-shadow-sm)",
};

/* ── page ──────────────────────────────────────────────────── */

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

  /* derived values */
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

  /* achievement tier + consistency stars */
  const tier = stats.total_wins >= 10
    ? { label: "Legend", icon: "🏆", color: "#F59E0B" }
    : stats.total_wins >= 5
    ? { label: "Elite", icon: "🔥", color: "#EC4899" }
    : stats.total_wins >= 2
    ? { label: "Veteran", icon: "⭐", color: "#3B82F6" }
    : { label: "Contender", icon: "✨", color: "#8B5CF6" };
  const consistencyStars = Math.min(5, Math.max(1, Math.ceil(stats.total_wins / 2)));
  const percentile = rankInfo ? Math.max(1, Math.ceil((rankInfo.rank / rankInfo.totalPlayers) * 100)) : null;

  /* membership duration */
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

  /* ── render ── */
  return (
    <PublicShell>
      <div className="hg-screen hg-screen--lobby" style={{ paddingBottom: 0, overflow: "hidden" }}>
        <div className="hg-content-col" style={{ padding: "10px 20px 10px" }}>

          {/* ━━━ HERO BANNER ━━━ */}
          <div style={{
            ...cardBase,
            background: netPositive
              ? "linear-gradient(135deg, rgba(16,185,129,.12) 0%, var(--surface) 60%)"
              : "linear-gradient(135deg, rgba(239,68,68,.12) 0%, var(--surface) 60%)",
            padding: "12px 18px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10,
          }}>
            {/* left – Net figure */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                display: "grid", placeItems: "center",
                background: netPositive ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)",
              }}>
                <Icon name={netPositive ? "chart" : "chart"} size={22}
                  style={{ color: netPositive ? "#10B981" : "#EF4444" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-dim)", marginBottom: 1 }}>
                  {netPositive ? "Net Profit" : "Net Loss"}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--font-head)", color: netPositive ? "#10B981" : "#EF4444", lineHeight: 1 }}>
                  {fmt(Math.abs(net))}
                </div>
              </div>
            </div>

            {/* right – quick KPIs */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                { label: "Win Rate", value: `${winRate}%`, color: "#F59E0B" },
                { label: "ROI", value: `${roi}%`, color: Number(roi) >= 0 ? "#10B981" : "#EF4444" },
                { label: "Avg / Game", value: fmt(avgSpend), color: "#8B5CF6" },
              ].map((k) => (
                <div key={k.label} style={{ textAlign: "center", minWidth: 60 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-mute)", marginBottom: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--font-head)", color: k.color, lineHeight: 1 }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ━━━ STACKED FULL-WIDTH SECTIONS ━━━ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>

            {/* ── 0 · ACHIEVEMENT TIER & RANK ── */}
            <div style={{
              ...cardBase, padding: "12px 18px",
              background: `linear-gradient(135deg, ${tier.color}1c 0%, var(--surface) 65%)`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", fontSize: 22,
                  display: "grid", placeItems: "center", background: `${tier.color}22`,
                }}>
                  {tier.icon}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-dim)", marginBottom: 1 }}>
                    Achievement Tier
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "var(--font-head)", color: tier.color, lineHeight: 1 }}>
                    {tier.label}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={`${consistencyStars}/5 consistency`}>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <span key={idx} style={{ fontSize: 15, color: idx < consistencyStars ? "#ffd700" : "var(--border-2)" }}>★</span>
                ))}
              </div>

              {percentile !== null && rankInfo ? (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-dim)", marginBottom: 1 }}>
                    Leaderboard Rank
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--accent)" }}>
                    #{rankInfo.rank} of {rankInfo.totalPlayers} <span style={{ color: "var(--text-mute)", fontWeight: 600, fontSize: 12 }}>· Top {percentile}%</span>
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: "var(--text-mute)" }}>Win a game to rank on the leaderboard</span>
              )}
            </div>

            {/* ── 1 · FINANCIAL BREAKDOWN ── */}
            <div style={{ ...cardBase, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
              <SectionTitle title="Financial Breakdown" icon="wallet" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <MiniStat icon="trophy" color="#10B981" label="Total Won" value={fmt(stats.amount_won)} sub={`From ${stats.total_wins} wins`} />
                <MiniStat icon="ticket" color="#EF4444" label="Total Spent" value={fmt(stats.total_expenditure)} sub="Ticket bookings" />
                <MiniStat icon="star" color="#F59E0B" label="Best Win" value={fmt(stats.highest_amount_single_game)} sub="Single game" />
                <MiniStat icon="grid" color="#3B82F6" label="Avg Tickets" value={`${avgTickets} / game`} sub={`${stats.tickets_bought} total`} />
              </div>
            </div>

            {/* ── 2 · STREAKS & RECORDS ── */}
            <div style={{ ...cardBase, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
              <SectionTitle title="Streaks & Records" icon="flame"
                extra={stats.luckiest_ticket_number ? <Badge label={`Lucky #${stats.luckiest_ticket_number}`} color="#EC4899" /> : undefined}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <MiniStat icon="check" color="#10B981" label="Win Streak" value={`${stats.longest_winning_run}`} sub="Consecutive wins" />
                <MiniStat icon="x" color="#6B7280" label="Dry Spell" value={`${stats.unluckiest_run}`} sub="Consecutive losses" />
                <MiniStat icon="flame" color="#EC4899" label="Lucky No." value={stats.luckiest_ticket_number ?? "—"} sub="Won the most" />
                <MiniStat icon="zap" color="#F59E0B" label="Win Rate" value={`${winRate}%`} sub={`${stats.total_wins} of ${stats.games_played}`} />
              </div>
            </div>

            {/* ── 3 · PRIZE BREAKDOWN ── */}
            <div style={{ ...cardBase, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
              <SectionTitle title="Prize Breakdown" icon="spark"
                extra={<span style={{ fontSize: 10, color: "var(--text-mute)", fontWeight: 600 }}>{totalPrizes} total wins</span>}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <PrizeBar label="Full House" count={stats.full_house_wins} total={totalPrizes} color="#F59E0B" icon="home" />
                <PrizeBar label="Line Wins" count={stats.line_wins} total={totalPrizes} color="#3B82F6" icon="grid" />
                <PrizeBar label="Other Wins" count={stats.other_wins} total={totalPrizes} color="#8B5CF6" icon="spark" />
              </div>
            </div>

            {/* ── 4 · MEMBERSHIP & ENGAGEMENT ── */}
            <div style={{ ...cardBase, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
              <SectionTitle title="Membership & Engagement" icon="clock" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <MiniStat icon="clock" color="#8B5CF6" label="Member Since" value={memberDuration} sub={memberSinceDate} />
                <MiniStat icon="play" color="#3B82F6" label="Games Played" value={stats.games_played} sub="Total sessions" />
                <MiniStat icon="ticket" color="#EC4899" label="Tickets Bought" value={stats.tickets_bought} sub={`${avgTickets} per game`} />
                <MiniStat icon="chart" color="#10B981" label="Total Wins" value={stats.total_wins} sub={`${winRate}% success`} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </PublicShell>
  );
}

/* ── sub-components (below default export) ────────────────── */

function MiniStat({ icon, color, label, value, sub }: {
  icon: string; color: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div style={{
      background: "var(--bg2)", borderRadius: 10,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-mute)" }}>
        <Icon name={icon} size={11} style={{ color }} />
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--text)", lineHeight: 1.15, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--text-mute)", lineHeight: 1.2, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function PrizeBar({ label, count, total, color, icon }: {
  label: string; count: number; total: number; color: string; icon: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name={icon} size={12} style={{ color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--font-head)", color }}>{count}</span>
      </div>
      <div style={{ height: 6, background: "var(--bg)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, minWidth: pct > 0 ? 6 : 0,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          borderRadius: 99, transition: "width .6s ease",
        }} />
      </div>
    </div>
  );
}
