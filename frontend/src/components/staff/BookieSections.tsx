"use client";
/** Bookie (Agent) sections: live booking queue + wallet with recharge request. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSocket } from "@/lib/hooks/useSocket";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";
import type { BookieStatsData } from "./MyStatsSections";
import type { BookieRewardsData } from "./RewardsSections";
import type { QueueBooking, SkipAlert, WalletLedgerEntry } from "@/lib/types";
import type { AuthUser } from "@/lib/stores/authStore";

const LOW_BALANCE_THRESHOLD = 500;

function useTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface BookieHistoryItem {
  booking_id: string;
  housie_name: string;
  game_title: string;
  ticket_numbers: number[];
  total_amount: number;
  booking_status: string;
  processed_at: string | null;
}

export function BookieQueueSection({ me }: { me: AuthUser }) {
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [history, setHistory] = useState<BookieHistoryItem[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Free tickets this bookie can spend, and which queued booking they've chosen to
  // spend one on. Only ever one per booking — 10 points buys exactly one ticket.
  const [freeTickets, setFreeTickets] = useState(0);
  const [redeemOn, setRedeemOn] = useState<string | null>(null);
  const now = useTicker();

  const load = useCallback(() => {
    apiFetch<QueueBooking[]>("/api/bookings/agent/queue").then(setQueue).catch(() => {});
    apiFetch<BookieHistoryItem[]>("/api/bookings/agent/history").then(setHistory).catch(() => {});
    apiFetch<BookieRewardsData>("/api/rewards/bookie")
      .then((r) => setFreeTickets(r.enabled ? r.free_tickets_available : 0))
      .catch(() => setFreeTickets(0));
  }, []);

  useEffect(() => { load(); }, [load]);

  useSocket(
    (event) => {
      if (event === "new_booking_request" || event === "booking_expired") load();
    },
    { event: "join_agent_room", arg: me.user_id }
  );

  const act = async (id: string, action: "confirm" | "reject") => {
    setError(null);
    try {
      const useFreeTicket = action === "confirm" && redeemOn === id;
      await apiFetch(`/api/bookings/agent/${id}/${action}`, {
        method: "POST",
        ...(useFreeTicket ? { body: JSON.stringify({ redeem_points: true }) } : {}),
      });
      if (redeemOn === id) setRedeemOn(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const copyReply = (r: QueueBooking) => {
    const text = `✅ Payment received, ${r.housie_name}! Your ticket(s) ${r.ticket_numbers.map((t) => "#" + t).join(", ")} for "${r.game_title}" are confirmed. Good luck! 🍀`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(r.booking_id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Round-robin booking requests routed to you. 10-minute timer per request.</p>
      {error && <p className="hg-sec-err">{error}</p>}
      {queue.length === 0 && (
        <EmptyHint icon="bell" title="No active requests" sub="New bookings will appear here the moment a player locks tickets." />
      )}
      <div className="hg-bq-list">
        {queue.map((r) => {
          const left = Math.max(0, Math.floor((new Date(r.locked_until).getTime() - now) / 1000));
          const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
          return (
            <div key={r.booking_id} className="hg-bq-card">
              <div className="hg-bq-top">
                <div><b>{r.housie_name}</b><span className="hg-bq-game">{r.game_title}</span></div>
                <div className="hg-bq-timer"><Icon name="clock" size={13} /> {timer}</div>
              </div>
              <div className="hg-bq-tickets">
                Tickets {r.ticket_numbers.map((t) => "#" + t).join(", ")} · <b>{money(r.total_amount)}</b>
              </div>
              {/* Only rendered when a free ticket is actually available, so the card
                  keeps its existing shape for the common case. */}
              {freeTickets > 0 && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "var(--text-dim)",
                    margin: "8px 0 0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={redeemOn === r.booking_id}
                    onChange={(e) => setRedeemOn(e.target.checked ? r.booking_id : null)}
                    style={{ accentColor: "var(--cta)", cursor: "pointer" }}
                  />
                  <span>
                    Use 1 free ticket <span className="hg-dim">({freeTickets} left)</span>
                  </span>
                </label>
              )}
              <div className="hg-bq-actions">
                <button className="hg-bq-copy" onClick={() => copyReply(r)}>
                  <Icon name="chat" size={15} /> {copied === r.booking_id ? "Copied!" : "Copy WhatsApp reply"}
                </button>
                <button className="hg-bq-confirm" onClick={() => act(r.booking_id, "confirm")}>
                  <Icon name="check" size={15} strokeWidth={2.6} /> Confirm
                </button>
                <button className="hg-bq-cancel" onClick={() => act(r.booking_id, "reject")}>
                  <Icon name="x" size={15} strokeWidth={2.6} /> Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Booking History Panel */}
      <div className="hg-panel" style={{ marginTop: "32px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Booking History (Last 10)
          </h3>
        </div>
        {history.length === 0 ? (
          <EmptyHint icon="clock" title="No history yet" sub="Processed booking requests will show up here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "700px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 1fr" }}>
                <span>Player Name</span>
                <span>Game Title</span>
                <span>Ticket Numbers</span>
                <span>Amount</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {history.map((h) => {
                const formattedDate = h.processed_at 
                  ? new Date(h.processed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                  : "Unknown";
                return (
                  <div key={h.booking_id} className="hg-tr" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 1fr" }}>
                    <div>
                      <b style={{ color: "var(--text)" }}>{h.housie_name}</b>
                      <div className="hg-dim" style={{ fontSize: "10px", marginTop: "2px" }}>{formattedDate}</div>
                    </div>
                    <span className="hg-dim">{h.game_title}</span>
                    <span style={{ color: "var(--text)" }}>
                      {h.ticket_numbers.map((num: number) => `#${num}`).join(", ")}
                    </span>
                    <strong style={{ color: "var(--accent)" }}>{money(h.total_amount)}</strong>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span 
                        className={`hg-pill hg-pill-${h.booking_status.toLowerCase()}`}
                        style={{
                          background: h.booking_status === "Sold" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: h.booking_status === "Sold" ? "#10B981" : "#EF4444",
                          border: h.booking_status === "Sold" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                        }}
                      >
                        {h.booking_status === "Sold" ? "Sold" : "Rejected"}
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

const RECHARGE_AMOUNTS = [1000, 1500, 2000, 3000, 5000];

export function BookieWalletSection({ me }: { me: AuthUser }) {
  const [balance, setBalance] = useState(me.current_balance ?? 0);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [skips, setSkips] = useState<SkipAlert[]>([]);
  const [statsData, setStatsData] = useState<BookieStatsData | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [form, setForm] = useState({ amount: "", reference: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [commPerTicket, setCommPerTicket] = useState(10);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly" | "all">("all");

  const load = useCallback(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((res) => setBalance(res.user.current_balance ?? 0))
      .catch(() => {});
    apiFetch<WalletLedgerEntry[]>("/api/wallet/ledger").then(setLedger).catch(() => {});
    apiFetch<SkipAlert[]>("/api/bookings/agent/skip-alerts").then(setSkips).catch(() => {});
    apiFetch<BookieStatsData>("/api/stats/bookie").then(setStatsData).catch(() => {});
    apiFetch<Record<string, string>>("/api/config/public")
      .then((cfg) => {
        if (cfg.bookie_commission_per_ticket) {
          setCommPerTicket(parseFloat(cfg.bookie_commission_per_ticket));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useSocket(
    (event, data) => {
      if (event === "wallet_credited" || event === "wallet_debited") {
        const d = data as { new_balance?: number };
        if (typeof d?.new_balance === "number") setBalance(d.new_balance);
        load();
      }
      if (event === "booking_skipped") load();
    },
    { event: "join_agent_room", arg: me.user_id }
  );

  const requestFunds = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ recharge_wa_link: string | null }>("/api/wallet/topup/request", {
        method: "POST",
        body: JSON.stringify({
          requested_amount: parseFloat(form.amount),
          payment_reference: "Requested UPI ID",
        }),
      });
      setSent(true);
      setRequesting(false);
      setForm({ amount: "", reference: "" });
      if (res.recharge_wa_link) window.open(res.recharge_wa_link, "_blank", "noopener");
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const low = balance < LOW_BALANCE_THRESHOLD;

  const activeSales = timeframe === "daily"
    ? statsData?.sales.daily
    : timeframe === "weekly"
    ? statsData?.sales.weekly
    : timeframe === "monthly"
    ? statsData?.sales.monthly
    : { tickets_sold: statsData?.sales.total_tickets_sold ?? 0, collection: statsData?.sales.total_gross_collection ?? 0 };

  const activeProfit = (activeSales?.collection ?? 0) * (commPerTicket / 100);
  const lifetimeProfit = (statsData?.sales.total_gross_collection ?? 0) * (commPerTicket / 100);

  return (
    <div className="hg-sec" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* SECTION 1: Digital Wallet Hero Card & 4 Primary Non-Repetitive KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: "20px", width: "100%" }}>
        
        {/* Digital Wallet Card */}
        <div className="hg-wallet-card" style={{ width: "100%", maxWidth: "none" }}>
          <span className="hg-wallet-lbl">Digital Wallet Balance</span>
          <b className="hg-wallet-bal">{money(balance)}</b>
          {low && (
            <div className="hg-wallet-low" style={{ marginTop: "10px" }}>
              <Icon name="bell" size={13} /> Low balance — top up to keep receiving bookings.
            </div>
          )}
          {skips.length > 0 && (
            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#EF4444", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginTop: "10px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="zap" size={14} /> Missed {skips.length} booking{skips.length > 1 ? "s" : ""} today due to low balance.
            </div>
          )}
          <button className="hg-wallet-btn" onClick={() => setRequesting((r) => !r)} style={{ marginTop: "14px" }}>
            <Icon name="chat" size={17} /> {sent ? "Request sent — opening WhatsApp…" : "Request funds from Financial Officer"}
          </button>
        </div>

        {/* 4 Core Performance KPI Cards (No Duplicates) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: "12px" }}>
          
          <div className="hg-panel" style={{ padding: "16px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(244, 201, 93, 0.25)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Tickets Sold</span>
            <b style={{ display: "block", fontSize: "24px", fontWeight: "800", marginTop: "4px", color: "var(--accent)" }}>{statsData?.sales.total_tickets_sold ?? 0}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{statsData?.bookings.conversion_rate ?? 0}% conversion</span>
          </div>

          <div className="hg-panel" style={{ padding: "16px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Estimated Profit</span>
            <b style={{ display: "block", fontSize: "24px", fontWeight: "800", marginTop: "4px", color: "#10B981" }}>{money(lifetimeProfit)}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{commPerTicket}% wholesale margin</span>
          </div>

          <div className="hg-panel" style={{ padding: "16px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Total Recharged</span>
            <b style={{ display: "block", fontSize: "24px", fontWeight: "800", marginTop: "4px", color: "#3B82F6" }}>{money(statsData?.wallet.total_recharged_amount ?? 0)}</b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>{statsData?.wallet.approved_recharges_count ?? 0} approved top-ups</span>
          </div>

          <div className="hg-panel" style={{ padding: "16px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
            <span className="hg-dim" style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Missed / Expired</span>
            <b style={{ display: "block", fontSize: "24px", fontWeight: "800", marginTop: "4px", color: (statsData?.bookings.expired_missed_count ?? 0) > 0 ? "#EF4444" : "var(--text)" }}>
              {statsData?.bookings.expired_missed_count ?? 0}
            </b>
            <span className="hg-dim" style={{ fontSize: "11px" }}>Timer expirations</span>
          </div>

        </div>

      </div>

      {/* Top Up Request Form Popup */}
      {requesting && (() => {
        const walletAmount = parseFloat(form.amount || "0");
        const commissionVal = walletAmount * (commPerTicket / 100);
        const payableAmount = walletAmount - commissionVal;
        return (
          <div className="hg-form" style={{ width: "100%", maxWidth: "none", padding: "20px", borderRadius: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", display: "block", marginBottom: "8px" }}>
                  Select Wallet Recharge Amount (₹)
                </span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {RECHARGE_AMOUNTS.map((amt) => {
                    const isActive = form.amount === String(amt);
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setForm({ ...form, amount: String(amt) })}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          border: isActive ? "2px solid var(--accent)" : "1.5px solid var(--border)",
                          background: isActive ? "var(--accent-soft)" : "rgba(255, 255, 255, 0.02)",
                          color: isActive ? "var(--accent)" : "var(--text-dim)",
                          boxShadow: isActive ? "0 0 10px var(--accent-soft)" : "none"
                        }}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {walletAmount > 0 && (
                <div style={{
                  background: "rgba(212, 175, 55, 0.04)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  fontSize: "13px",
                  color: "var(--text)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Recharge Wallet Balance:</span>
                    <b>₹{walletAmount}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)" }}>
                    <span>Commission ({commPerTicket}% discount per ₹100 of recharge):</span>
                    <span style={{ color: "var(--success)" }}>-₹{commissionVal}</span>
                  </div>
                  <div style={{ height: "1px", background: "var(--border-2)", margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "bold" }}>
                    <span style={{ color: "var(--accent)" }}>Net Payable Amount:</span>
                    <b style={{ color: "var(--accent)" }}>₹{payableAmount}</b>
                  </div>
                </div>
              )}

            </div>
            {error && <p className="hg-sec-err">{error}</p>}
            <div className="hg-form-actions">
              <Button variant="ghost" size="sm" onClick={() => setRequesting(false)}>Cancel</Button>
              <Button
                variant="cta" size="sm"
                disabled={!form.amount || parseFloat(form.amount) <= 0}
                onClick={requestFunds}
              >
                Send request
              </Button>
            </div>
          </div>
        );
      })()}

      {/* SECTION 2: Responsive Two-Column Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: "20px", width: "100%" }}>
        
        {/* Left Column: Sales Breakdown by Timeframe */}
        <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "bold", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="chart" size={16} /> Sales & Earnings Performance
            </h3>
            <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
              {(["daily", "weekly", "monthly", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: "none",
                    background: timeframe === t ? "var(--brand)" : "transparent",
                    color: timeframe === t ? "var(--accent-ink)" : "var(--text-dim)",
                    transition: "all 0.2s ease"
                  }}
                >
                  {t === "daily" ? "24h" : t === "weekly" ? "7d" : t === "monthly" ? "30d" : "All"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
            <div style={{ minWidth: 0, background: "rgba(255,255,255,0.025)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
              <span className="hg-dim" style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Tickets</span>
              <b style={{ display: "block", fontSize: "18px", fontWeight: "800", marginTop: "4px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeSales?.tickets_sold ?? 0}</b>
            </div>
            <div style={{ minWidth: 0, background: "rgba(255,255,255,0.025)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
              <span className="hg-dim" style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Collection</span>
              <b style={{ display: "block", fontSize: "18px", fontWeight: "800", marginTop: "4px", color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{money(activeSales?.collection ?? 0)}</b>
            </div>
            <div style={{ minWidth: 0, background: "rgba(255,255,255,0.025)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
              <span className="hg-dim" style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Net Profit</span>
              <b style={{ display: "block", fontSize: "18px", fontWeight: "800", marginTop: "4px", color: "#10B981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{money(activeProfit)}</b>
            </div>
          </div>

          <div style={{ background: "rgba(212, 175, 55, 0.04)", border: "1px solid rgba(212, 175, 55, 0.12)", borderRadius: "8px", padding: "10px 12px", color: "var(--accent)", fontSize: "11px", display: "flex", gap: "8px", alignItems: "flex-start", lineHeight: "1.4" }}>
            <Icon name="help" size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>Profit margin is based on the {commPerTicket}% wholesale discount rate on top-up funds.</span>
          </div>
        </div>

        {/* Right Column: Wallet Activity Ledger */}
        <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "bold", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="wallet" size={16} /> Recent Wallet Activity
            </h3>
          </div>
          {ledger.length === 0 ? (
            <EmptyHint icon="wallet" title="No transactions yet" sub="Wallet credits and ticket sale debits will appear here." />
          ) : (
            <div className="hg-ledger-list" style={{ maxHeight: "220px", overflowY: "auto" }}>
              {ledger.slice(0, 8).map((e) => (
                <div key={e.entry_id} className="hg-ledger-row">
                  <span className="hg-dim" style={{ fontSize: "11px" }}>
                    {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span style={{ fontSize: "12.5px" }}>{e.notes ?? e.transaction_type}</span>
                  <span className={`hg-ledger-amt ${e.transaction_type === "Credit" ? "is-credit" : "is-debit"}`}>
                    {e.transaction_type === "Credit" ? "+" : "−"}{money(e.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* SECTION 3: Full Width Ticket Bookings Log Table */}
      <div className="hg-panel" style={{ padding: "20px", borderRadius: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: "bold", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Processed Ticket Bookings ({statsData?.recent_bookings.length ?? 0})
          </h3>
        </div>

        {(!statsData || statsData.recent_bookings.length === 0) ? (
          <EmptyHint icon="bell" title="No bookings processed yet" sub="Bookings routed to your shop will appear here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "700px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr" }}>
                <span>Player Name</span>
                <span>Game Title</span>
                <span>Tickets</span>
                <span>Amount</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {statsData.recent_bookings.map((b) => {
                const dateStr = new Date(b.confirmed_at || b.locked_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
                });
                const isSold = b.booking_status === "Sold";
                const isExpired = b.booking_status === "Expired";
                return (
                  <div key={b.booking_id} className="hg-tr" style={{ gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr", alignItems: "center" }}>
                    <div>
                      <b style={{ color: "var(--text)", fontSize: "13.5px" }}>{b.housie_name}</b>
                      <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{dateStr}</div>
                    </div>
                    <span className="hg-dim" style={{ fontSize: "12px" }}>{b.game_title}</span>
                    <span><b style={{ fontSize: "13px" }}>{b.ticket_count}</b> ticket{b.ticket_count > 1 ? "s" : ""}</span>
                    <strong style={{ color: isSold ? "#10B981" : "var(--text-dim)", fontSize: "13px" }}>{money(b.total_amount)}</strong>
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
