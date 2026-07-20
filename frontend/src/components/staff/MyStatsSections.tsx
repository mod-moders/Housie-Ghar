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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
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

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="hg-sec" style={{ padding: "40px 0", textAlign: "center" }}>
        <span className="hg-poll-spin" />
        <p className="hg-dim" style={{ marginTop: "12px", fontSize: "13px" }}>Loading operator statistics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hg-sec">
        <div className="hg-panel" style={{ padding: "24px", color: "#EF4444" }}>
          <Icon name="alert" size={18} /> {error || "Failed to load stats"}
          <button onClick={load} style={{ marginLeft: "12px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hg-sec" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Top Headline KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        
        <div className="hg-kpi" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-kpi-label">Games Operated</span>
            <Icon name="play" size={18} style={{ color: "var(--brand)" }} />
          </div>
          <b className="hg-kpi-value" style={{ fontSize: "28px", marginTop: "8px" }}>{data.total_games_operated}</b>
          <span className="hg-kpi-sub" style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
            <span style={{ color: "#10B981" }}>✓ {data.completed_games} Done</span>
            {data.live_games > 0 && <span style={{ color: "var(--brand)", fontWeight: "bold" }}>● {data.live_games} Live</span>}
          </span>
        </div>

        <div className="hg-kpi" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-kpi-label">Numbers Called</span>
            <Icon name="zap" size={18} style={{ color: "var(--accent)" }} />
          </div>
          <b className="hg-kpi-value" style={{ fontSize: "28px", marginTop: "8px", color: "var(--accent)" }}>{data.total_numbers_called}</b>
          <span className="hg-kpi-sub">Total number calls drawn across games</span>
        </div>

        <div className="hg-kpi" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-kpi-label">Tickets Sold in Games</span>
            <Icon name="users" size={18} style={{ color: "#3B82F6" }} />
          </div>
          <b className="hg-kpi-value" style={{ fontSize: "28px", marginTop: "8px" }}>{data.total_tickets_sold}</b>
          <span className="hg-kpi-sub">Player tickets sold in your rounds</span>
        </div>

        <div className="hg-kpi" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="hg-kpi-label">Prizes Disbursed</span>
            <Icon name="wallet" size={18} style={{ color: "#10B981" }} />
          </div>
          <b className="hg-kpi-value" style={{ fontSize: "28px", marginTop: "8px", color: "#10B981" }}>{money(data.total_payouts_disbursed)}</b>
          <span className="hg-kpi-sub">{data.total_prizes_claimed} prize claims processed</span>
        </div>

      </div>

      {/* Operated Games History */}
      <div className="hg-panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border-2)", paddingBottom: "12px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Operated Games Log ({data.recent_games.length})
          </h3>
        </div>

        {data.recent_games.length === 0 ? (
          <EmptyHint icon="play" title="No games operated yet" sub="Games assigned to you will appear here once scheduled or completed." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "800px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.2fr 1fr" }}>
                <span>Game Title</span>
                <span>Date & Time</span>
                <span>Tickets Sold</span>
                <span>Calls Made</span>
                <span>Prizes Disbursed</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {data.recent_games.map((g) => {
                const dateStr = new Date(g.completed_at || g.scheduled_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
                });
                return (
                  <div key={g.game_id} className="hg-tr" style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.2fr 1fr" }}>
                    <div>
                      <b style={{ color: "var(--text)" }}>{g.title}</b>
                      <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>Price: {money(g.ticket_price)}</div>
                    </div>
                    <span className="hg-dim" style={{ fontSize: "12px" }}>{dateStr}</span>
                    <span>
                      <b>{g.tickets_sold}</b> / {g.total_tickets}
                      <div className="hg-dim" style={{ fontSize: "10px" }}>{g.fill_rate}% fill</div>
                    </span>
                    <span><b>{g.numbers_called}</b> calls</span>
                    <strong style={{ color: "#10B981" }}>{money(g.total_payout)}</strong>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
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

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="hg-sec" style={{ padding: "40px 0", textAlign: "center" }}>
        <span className="hg-poll-spin" />
        <p className="hg-dim" style={{ marginTop: "12px", fontSize: "13px" }}>Loading bookie statistics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hg-sec">
        <div className="hg-panel" style={{ padding: "24px", color: "#EF4444" }}>
          <Icon name="alert" size={18} /> {error || "Failed to load stats"}
          <button onClick={load} style={{ marginLeft: "12px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Retry
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

      {/* Timeframe Sales Metric Selector & Cards */}
      <div className="hg-panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text)" }}>Ticket Sales & Revenue Performance</h3>
            <p className="hg-dim" style={{ fontSize: "12px", marginTop: "2px" }}>Track your ticket booking collections across daily, weekly, and monthly timeframes.</p>
          </div>
          <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.04)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-2)" }}>
            {(["daily", "weekly", "monthly", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "bold",
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          
          <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Tickets Sold</span>
            <b style={{ display: "block", fontSize: "26px", marginTop: "6px", color: "var(--accent)" }}>{activeSales.tickets_sold}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{timeframe === "all" ? "Total tickets sold" : `${timeframe} tickets count`}</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Total Gross Collection</span>
            <b style={{ display: "block", fontSize: "26px", marginTop: "6px", color: "#10B981" }}>{money(activeSales.collection)}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>Booking payments collected</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Booking Conversion Rate</span>
            <b style={{ display: "block", fontSize: "26px", marginTop: "6px", color: "#3B82F6" }}>{data.bookings.conversion_rate}%</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{data.bookings.confirmed_count} of {data.bookings.total_attempted} confirmed</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-2)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Missed / Expired Bookings</span>
            <b style={{ display: "block", fontSize: "26px", marginTop: "6px", color: data.bookings.expired_missed_count > 0 ? "#EF4444" : "var(--text)" }}>
              {data.bookings.expired_missed_count}
            </b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>Unconfirmed timer expirations</span>
          </div>

        </div>
      </div>

      {/* Wallet & Recharge Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        
        <div className="hg-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold" }}>CURRENT WALLET BALANCE</span>
            <Icon name="wallet" size={18} style={{ color: "var(--accent)" }} />
          </div>
          <b style={{ fontSize: "28px", color: "var(--accent)" }}>{money(data.wallet.current_balance)}</b>
          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "8px" }}>
            Active balance available to confirm ticket bookings.
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold" }}>TOTAL RECHARGES APPROVED</span>
            <Icon name="check" size={18} style={{ color: "#10B981" }} />
          </div>
          <b style={{ fontSize: "28px", color: "#10B981" }}>{money(data.wallet.total_recharged_amount)}</b>
          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "8px" }}>
            {data.wallet.approved_recharges_count} successful top-up requests
            {data.wallet.pending_recharges_count > 0 && <span style={{ color: "var(--brand)", marginLeft: "6px" }}>({data.wallet.pending_recharges_count} pending)</span>}
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span className="hg-dim" style={{ fontSize: "12px", fontWeight: "bold" }}>BOOKING OUTCOMES</span>
            <Icon name="bell" size={18} style={{ color: "var(--brand)" }} />
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", color: "#10B981" }}>✓ Confirmed: {data.bookings.confirmed_count}</span>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", color: "#EF4444" }}>⏱ Expired: {data.bookings.expired_missed_count}</span>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>✕ Cancelled: {data.bookings.cancelled_count}</span>
            </div>
          </div>
          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "12px" }}>Total attempted: {data.bookings.total_attempted}</div>
        </div>

      </div>

      {/* Recent Bookings Table */}
      <div className="hg-panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border-2)", paddingBottom: "12px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Recent Ticket Bookings Log ({data.recent_bookings.length})
          </h3>
        </div>

        {data.recent_bookings.length === 0 ? (
          <EmptyHint icon="bell" title="No bookings processed yet" sub="Bookings routed to your shop will appear here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "750px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr" }}>
                <span>Player & Date</span>
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
                  <div key={b.booking_id} className="hg-tr" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr" }}>
                    <div>
                      <b style={{ color: "var(--text)" }}>{b.housie_name}</b>
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
