"use client";
/** Staff "My Stats" Section — Personal analytics for Operators and Bookies. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { EmptyHint } from "@/components/ui";
import type { AuthUser } from "@/lib/stores/authStore";

/* ── Operator Stats Interfaces ───────────────────────────────────────── */

export interface OperatorStatsData {
  total_games_operated: number;
  completed_games: number;
  live_games: number;
  scheduled_games: number;
  total_numbers_called: number;
  total_tickets_sold: number;
  total_payouts_disbursed: number;
  total_prizes_claimed: number;
  recent_games: {
    game_id: string;
    title: string;
    scheduled_at: string;
    completed_at: string | null;
    game_status: string;
    total_tickets: number;
    ticket_price: number;
    tickets_sold: number;
    numbers_called: number;
    total_payout: number;
    fill_rate: number;
  }[];
}

/* ── Bookie Stats Interfaces ─────────────────────────────────────────── */

export interface BookieStatsData {
  sales: {
    total_tickets_sold: number;
    total_gross_collection: number;
    daily: { tickets_sold: number; collection: number };
    weekly: { tickets_sold: number; collection: number };
    monthly: { tickets_sold: number; collection: number };
  };
  bookings: {
    total_attempted: number;
    confirmed_count: number;
    expired_missed_count: number;
    cancelled_count: number;
    conversion_rate: number;
  };
  wallet: {
    current_balance: number;
    approved_recharges_count: number;
    total_recharged_amount: number;
    pending_recharges_count: number;
  };
  recent_bookings: {
    booking_id: string;
    game_id: string;
    game_title: string;
    housie_name: string;
    ticket_count: number;
    total_amount: number;
    booking_status: string;
    locked_at: string;
    confirmed_at: string | null;
  }[];
}

/* ── Operator Stats Component ────────────────────────────────────────── */

export function OperatorStatsSection({ me }: { me: AuthUser }) {
  const [data, setData] = useState<OperatorStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(() => {
    apiFetch<OperatorStatsData>("/api/stats/operator")
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load operator stats");
        setLoading(false);
      });
  }, []);

  // User-triggered refresh/retry: put the spinner back and clear any stale error.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchStats();
  }, [fetchStats]);

  // On mount `loading` is already true and `error` already null, so the first
  // fetch skips that reset — no synchronous setState in the effect body.
  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="hg-sec" style={{ padding: "60px 0", textAlign: "center" }}>
        <span className="hg-poll-spin" style={{ width: "32px", height: "32px" }} />
        <p className="hg-dim" style={{ marginTop: "16px", fontSize: "14px" }}>Loading operator performance analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hg-sec" style={{ width: "100%" }}>
        <div className="hg-panel" style={{ padding: "28px", border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)", borderRadius: "16px", textAlign: "center" }}>
          <Icon name="alert" size={24} style={{ color: "#EF4444", marginBottom: "8px" }} />
          <p style={{ color: "#EF4444", fontWeight: "bold", fontSize: "15px", margin: "4px 0" }}>{error || "Failed to load stats"}</p>
          <button onClick={load} className="hg-btn" style={{ marginTop: "12px", background: "var(--brand)", color: "var(--accent-ink)", fontWeight: "bold", border: "none", padding: "8px 20px", borderRadius: "8px", cursor: "pointer" }}>
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hg-sec" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text)", display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="chart" size={22} style={{ color: "var(--accent)" }} />
            Operator Performance & Game Statistics
          </h2>
          <p className="hg-dim" style={{ fontSize: "13px", marginTop: "4px" }}>
            Overview of games hosted and player ticket counts for <strong style={{ color: "var(--accent)" }}>{me.full_name}</strong>.
          </p>
        </div>
        <button onClick={load} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-2)", color: "var(--text)", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="arrowR" size={12} style={{ transform: "rotate(-90deg)" }} /> Refresh Data
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        
        <div className="hg-panel" style={{ padding: "20px", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(244, 201, 93, 0.25)", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Games Operated</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(244, 201, 93, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="play" size={16} style={{ color: "var(--accent)" }} />
            </div>
          </div>
          <b style={{ display: "block", fontSize: "32px", fontWeight: "800", marginTop: "10px", color: "var(--text)" }}>{data.total_games_operated}</b>
          <div style={{ display: "flex", gap: "10px", marginTop: "8px", fontSize: "12px" }}>
            <span style={{ color: "#10B981", fontWeight: "600" }}>✓ {data.completed_games} Completed</span>
            {data.live_games > 0 && <span style={{ color: "var(--brand)", fontWeight: "bold" }}>● {data.live_games} Live</span>}
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "20px", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>Player Tickets Sold</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(59, 130, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="users" size={16} style={{ color: "#3B82F6" }} />
            </div>
          </div>
          <b style={{ display: "block", fontSize: "32px", fontWeight: "800", marginTop: "10px", color: "var(--text)" }}>{data.total_tickets_sold}</b>
          <span className="hg-dim" style={{ fontSize: "12px", marginTop: "8px", display: "block" }}>Tickets hosted in operated games</span>
        </div>

      </div>

      {/* Recent Games Table */}
      <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "14px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Operated Games Log ({data.recent_games.length})
          </h3>
        </div>

        {data.recent_games.length === 0 ? (
          <EmptyHint icon="play" title="No games operated yet" sub="Games assigned to you will appear here once scheduled or completed." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "650px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 1fr" }}>
                <span>Game Title</span>
                <span>Date & Time</span>
                <span>Tickets Sold</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {data.recent_games.map((g) => {
                const dateStr = new Date(g.completed_at || g.scheduled_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
                });
                return (
                  <div key={g.game_id} className="hg-tr" style={{ gridTemplateColumns: "2.5fr 1.5fr 1.5fr 1fr", alignItems: "center" }}>
                    <div>
                      <b style={{ color: "var(--text)", fontSize: "14px" }}>{g.title}</b>
                      <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>Ticket Price: {money(g.ticket_price)}</div>
                    </div>
                    <span className="hg-dim" style={{ fontSize: "12px" }}>{dateStr}</span>
                    <div>
                      <b style={{ fontSize: "13px" }}>{g.tickets_sold}</b> <span className="hg-dim">/ {g.total_tickets}</span>
                      <div style={{ width: "80px", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, g.fill_rate)}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span
                        className="hg-pill"
                        style={{
                          background: g.game_status === "Completed" ? "rgba(16, 185, 129, 0.15)" : g.game_status === "Live" ? "rgba(244, 201, 93, 0.15)" : "rgba(255,255,255,0.06)",
                          color: g.game_status === "Completed" ? "#10B981" : g.game_status === "Live" ? "var(--accent)" : "var(--text-dim)",
                          border: g.game_status === "Completed" ? "1px solid rgba(16, 185, 129, 0.3)" : g.game_status === "Live" ? "1px solid rgba(244, 201, 93, 0.3)" : "1px solid var(--border)"
                        }}
                      >
                        {g.game_status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Bookie Stats Component ──────────────────────────────────────────── */

export function BookieStatsSection({ me }: { me: AuthUser }) {
  const [data, setData] = useState<BookieStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly" | "all">("all");

  const fetchStats = useCallback(() => {
    apiFetch<BookieStatsData>("/api/stats/bookie")
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load bookie stats");
        setLoading(false);
      });
  }, []);

  // User-triggered refresh/retry: put the spinner back and clear any stale error.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchStats();
  }, [fetchStats]);

  // On mount `loading` is already true and `error` already null, so the first
  // fetch skips that reset — no synchronous setState in the effect body.
  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="hg-sec" style={{ padding: "60px 0", textAlign: "center" }}>
        <span className="hg-poll-spin" style={{ width: "32px", height: "32px" }} />
        <p className="hg-dim" style={{ marginTop: "16px", fontSize: "14px" }}>Loading bookie sales analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hg-sec" style={{ width: "100%" }}>
        <div className="hg-panel" style={{ padding: "28px", border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)", borderRadius: "16px", textAlign: "center" }}>
          <Icon name="alert" size={24} style={{ color: "#EF4444", marginBottom: "8px" }} />
          <p style={{ color: "#EF4444", fontWeight: "bold", fontSize: "15px", margin: "4px 0" }}>{error || "Failed to load stats"}</p>
          <button onClick={load} className="hg-btn" style={{ marginTop: "12px", background: "var(--brand)", color: "var(--accent-ink)", fontWeight: "bold", border: "none", padding: "8px 20px", borderRadius: "8px", cursor: "pointer" }}>
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  const activeSales = timeframe === "daily"
    ? data.sales.daily
    : timeframe === "weekly"
    ? data.sales.weekly
    : timeframe === "monthly"
    ? data.sales.monthly
    : { tickets_sold: data.sales.total_tickets_sold, collection: data.sales.total_gross_collection };

  return (
    <div className="hg-sec" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text)", display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="chart" size={22} style={{ color: "var(--accent)" }} />
            Bookie Ticket Sales & Revenue Analytics
          </h2>
          <p className="hg-dim" style={{ fontSize: "13px", marginTop: "4px" }}>
            Comprehensive sales performance, daily/weekly/monthly revenue, booking outcomes, and wallet recharges for <strong style={{ color: "var(--accent)" }}>{me.full_name}</strong>.
          </p>
        </div>
        <button onClick={load} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-2)", color: "var(--text)", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="arrowR" size={12} style={{ transform: "rotate(-90deg)" }} /> Refresh Stats
        </button>
      </div>

      {/* Timeframe Selector & Metric Cards */}
      <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Sales Timeframe
          </span>
          <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.04)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-2)" }}>
            {(["daily", "weekly", "monthly", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  border: "none",
                  background: timeframe === t ? "var(--brand)" : "transparent",
                  color: timeframe === t ? "var(--accent-ink)" : "var(--text-dim)",
                  transition: "all 0.2s ease"
                }}
              >
                {t === "daily" ? "Daily (24h)" : t === "weekly" ? "Weekly (7d)" : t === "monthly" ? "Monthly (30d)" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px" }}>
          
          <div style={{ background: "rgba(255,255,255,0.025)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(244, 201, 93, 0.2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Tickets Sold</span>
            <b style={{ display: "block", fontSize: "28px", fontWeight: "800", marginTop: "6px", color: "var(--accent)" }}>{activeSales.tickets_sold}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{timeframe === "all" ? "Total tickets count" : `${timeframe} tickets count`}</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.025)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Total Gross Collection</span>
            <b style={{ display: "block", fontSize: "28px", fontWeight: "800", marginTop: "6px", color: "#10B981" }}>{money(activeSales.collection)}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>Booking payments collected</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.025)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Conversion Rate</span>
            <b style={{ display: "block", fontSize: "28px", fontWeight: "800", marginTop: "6px", color: "#3B82F6" }}>{data.bookings.conversion_rate}%</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{data.bookings.confirmed_count} of {data.bookings.total_attempted} confirmed</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.025)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Missed / Expired Bookings</span>
            <b style={{ display: "block", fontSize: "28px", fontWeight: "800", marginTop: "6px", color: data.bookings.expired_missed_count > 0 ? "#EF4444" : "var(--text)" }}>
              {data.bookings.expired_missed_count}
            </b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>Timer expirations count</span>
          </div>

        </div>
      </div>

      {/* Wallet & Recharge Highlights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        
        <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase" }}>Current Wallet Balance</span>
            <Icon name="wallet" size={18} style={{ color: "var(--accent)" }} />
          </div>
          <b style={{ fontSize: "28px", fontWeight: "800", color: "var(--accent)" }}>{money(data.wallet.current_balance)}</b>
          <div className="hg-dim" style={{ fontSize: "12px", marginTop: "6px" }}>Active balance available to confirm ticket bookings.</div>
        </div>

        <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase" }}>Total Recharges Approved</span>
            <Icon name="check" size={18} style={{ color: "#10B981" }} />
          </div>
          <b style={{ fontSize: "28px", fontWeight: "800", color: "#10B981" }}>{money(data.wallet.total_recharged_amount)}</b>
          <div className="hg-dim" style={{ fontSize: "12px", marginTop: "6px" }}>
            {data.wallet.approved_recharges_count} successful top-ups
            {data.wallet.pending_recharges_count > 0 && <span style={{ color: "var(--brand)", marginLeft: "6px", fontWeight: "bold" }}>({data.wallet.pending_recharges_count} pending)</span>}
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase" }}>Booking Outcomes</span>
            <Icon name="bell" size={18} style={{ color: "var(--brand)" }} />
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px" }}>
            <div style={{ flex: 1, background: "rgba(16, 185, 129, 0.1)", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
              <span style={{ fontSize: "11px", color: "#10B981", fontWeight: "bold" }}>✓ {data.bookings.confirmed_count} Sold</span>
            </div>
            <div style={{ flex: 1, background: "rgba(239, 68, 68, 0.1)", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
              <span style={{ fontSize: "11px", color: "#EF4444", fontWeight: "bold" }}>⏱ {data.bookings.expired_missed_count} Expired</span>
            </div>
          </div>
          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "8px" }}>Total attempted: {data.bookings.total_attempted}</div>
        </div>

      </div>

      {/* Recent Bookings Table */}
      <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "14px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Recent Ticket Bookings Log ({data.recent_bookings.length})
          </h3>
        </div>

        {data.recent_bookings.length === 0 ? (
          <EmptyHint icon="bell" title="No bookings processed yet" sub="Bookings routed to your shop will appear here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "750px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr" }}>
                <span>Player Name</span>
                <span>Game Title</span>
                <span>Tickets</span>
                <span>Amount</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {data.recent_bookings.map((b) => {
                const dateStr = new Date(b.confirmed_at || b.locked_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
                });
                const isSold = b.booking_status === "Sold";
                const isExpired = b.booking_status === "Expired";
                return (
                  <div key={b.booking_id} className="hg-tr" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr", alignItems: "center" }}>
                    <div>
                      <b style={{ color: "var(--text)", fontSize: "14px" }}>{b.housie_name}</b>
                      <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{dateStr}</div>
                    </div>
                    <span className="hg-dim">{b.game_title}</span>
                    <span><b>{b.ticket_count}</b> ticket{b.ticket_count > 1 ? "s" : ""}</span>
                    <strong style={{ color: isSold ? "#10B981" : "var(--text-dim)" }}>{money(b.total_amount)}</strong>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span
                        className="hg-pill"
                        style={{
                          background: isSold ? "rgba(16, 185, 129, 0.15)" : isExpired ? "rgba(239, 68, 68, 0.15)" : "rgba(255,255,255,0.06)",
                          color: isSold ? "#10B981" : isExpired ? "#EF4444" : "var(--text-dim)",
                          border: isSold ? "1px solid rgba(16, 185, 129, 0.3)" : isExpired ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border)"
                        }}
                      >
                        {isSold ? "Confirmed" : isExpired ? "Expired / Missed" : b.booking_status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
