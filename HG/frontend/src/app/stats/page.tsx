"use client";
/** Player's own lifetime stats — engagement, wins and streaks, computed from
 * real bookings and settlements (no fabricated per-player numbers). */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { KpiCard, EmptyHint } from "@/components/ui";
import type { PlayerStats } from "@/lib/types";

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PlayerStats>("/api/players/me/stats")
      .then((res) => { setStats(res); setLoading(false); })
      .catch(() => router.push("/login"));
  }, [router]);

  if (loading || !stats) {
    return (
      <PublicShell>
        <div className="hg-screen">
          <div className="hg-page-head">
            <span className="hg-page-kicker"><Icon name="chart" size={14} /> MY STATS</span>
            <h1 className="hg-page-title">Your Housie stats</h1>
            <p className="hg-page-sub">Loading…</p>
          </div>
        </div>
      </PublicShell>
    );
  }

  const net = stats.amount_won - stats.total_expenditure;
  const netPositive = net >= 0;
  const winRate = stats.games_played > 0 ? Math.round((stats.total_wins / stats.games_played) * 100) : 0;
  const avgTickets = stats.games_played > 0 ? (stats.tickets_bought / stats.games_played).toFixed(1) : "0";
  const memberSince = stats.member_since
    ? new Date(stats.member_since).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

  if (stats.games_played === 0) {
    return (
      <PublicShell>
        <div className="hg-screen">
          <div className="hg-page-head">
            <span className="hg-page-kicker"><Icon name="chart" size={14} /> MY STATS</span>
            <h1 className="hg-page-title">Your Housie stats</h1>
            <p className="hg-page-sub">Play your first game and your stats light up here.</p>
          </div>
          <EmptyHint icon="ticket" title="No games yet" sub="Book a ticket from the lobby to start your record." />
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="hg-screen">
        <div className="hg-page-head">
          <span className="hg-page-kicker"><Icon name="chart" size={14} /> MY STATS</span>
          <h1 className="hg-page-title">Your Housie stats</h1>
          <p className="hg-page-sub">Member since {memberSince}.</p>
        </div>

        <div style={{ maxWidth: 940, margin: "0 auto", width: "100%" }}>
          <div className="hg-panel" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Financial breakdown</h3>
            <div className="hg-kpi-grid">
              <KpiCard label={netPositive ? "Net profit" : "Net loss"} value={money(Math.abs(net))} tone={netPositive ? "good" : "alert"} />
              <KpiCard label="Total won" value={money(stats.amount_won)} sub={`from ${stats.total_wins} wins`} />
              <KpiCard label="Total spent" value={money(stats.total_expenditure)} sub="ticket bookings" />
              <KpiCard label="Best single win" value={money(stats.highest_amount_single_game)} sub="one game" />
            </div>
          </div>

          <div className="hg-panel" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Engagement</h3>
            <div className="hg-kpi-grid">
              <KpiCard label="Games played" value={stats.games_played} />
              <KpiCard label="Tickets bought" value={stats.tickets_bought} sub={`${avgTickets} / game`} />
              <KpiCard label="Win rate" value={`${winRate}%`} sub={`${stats.total_wins} of ${stats.games_played}`} />
              <KpiCard label="Member since" value={memberSince} />
            </div>
          </div>

          <div className="hg-panel" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Prize breakdown</h3>
            <div className="hg-kpi-grid">
              <KpiCard label="Full House wins" value={stats.full_house_wins} />
              <KpiCard label="Line wins" value={stats.line_wins} />
              <KpiCard label="Other wins" value={stats.other_wins} />
              <KpiCard label="Total wins" value={stats.total_wins} />
            </div>
          </div>

          <div className="hg-panel" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Streaks &amp; luck</h3>
            <div className="hg-kpi-grid">
              <KpiCard label="Longest win streak" value={stats.longest_winning_run} sub="consecutive wins" />
              <KpiCard label="Longest dry spell" value={stats.unluckiest_run} sub="consecutive losses" />
              <KpiCard label="Luckiest ticket" value={stats.luckiest_ticket_number ?? "—"} sub="won the most" />
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
