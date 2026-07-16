"use client";
/** Bookie (Agent) sections: live booking queue + wallet with recharge request. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSocket } from "@/lib/hooks/useSocket";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";
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

export function BookieQueueSection({ me }: { me: AuthUser }) {
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTicker();

  const load = useCallback(() => {
    apiFetch<QueueBooking[]>("/api/bookings/agent/queue").then(setQueue).catch(() => {});
    apiFetch<any[]>("/api/bookings/agent/history").then(setHistory).catch(() => {});
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
      await apiFetch(`/api/bookings/agent/${id}/${action}`, { method: "POST" });
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

interface BookiePersonalStats {
  total_recharged: number;
  recent_recharge_amount: number;
  recent_recharge_date: string | null;
  total_tickets_sold: number;
  total_sales_volume: number;
  total_wins: number;
  profit_overall: number;
  profit_today: number;
  profit_weekly: number;
  profit_monthly: number;
}

const RECHARGE_AMOUNTS = [1000, 1500, 2000, 3000, 5000];

export function BookieWalletSection({ me }: { me: AuthUser }) {
  const [balance, setBalance] = useState(me.current_balance ?? 0);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [skips, setSkips] = useState<SkipAlert[]>([]);
  const [stats, setStats] = useState<BookiePersonalStats | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [form, setForm] = useState({ amount: "", reference: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [commPerTicket, setCommPerTicket] = useState(10);

  const load = useCallback(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((res) => setBalance(res.user.current_balance ?? 0))
      .catch(() => {});
    apiFetch<WalletLedgerEntry[]>("/api/wallet/ledger").then(setLedger).catch(() => {});
    apiFetch<SkipAlert[]>("/api/bookings/agent/skip-alerts").then(setSkips).catch(() => {});
    apiFetch<BookiePersonalStats>("/api/users/bookie/personal-stats").then(setStats).catch(() => {});
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

  return (
    <div className="hg-sec" style={{ width: "100%" }}>
      
      {/* Responsive Two-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px", width: "100%" }}>
        
        {/* Left Column: Wallet Balance Card, Topup Request, Activity Ledger */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Digital Wallet Card */}
          <div className="hg-wallet-card" style={{ width: "100%", maxWidth: "none" }}>
            <span className="hg-wallet-lbl">Digital wallet balance</span>
            <b className="hg-wallet-bal">{money(balance)}</b>
            {low && (
              <div className="hg-wallet-low" style={{ marginTop: "10px" }}>
                <Icon name="bell" size={13} /> Low balance — top up to keep receiving bookings.
              </div>
            )}
            <button className="hg-wallet-btn" onClick={() => setRequesting((r) => !r)}>
              <Icon name="chat" size={17} /> {sent ? "Request sent — opening WhatsApp…" : "Request funds from Financial Officer"}
            </button>
          </div>

          {/* Skip Alerts */}
          {skips.length > 0 && (
            <div className="hg-fomo" style={{ width: "100%", maxWidth: "none" }}>
              <Icon name="zap" size={15} />
              <div>
                <b>You missed {skips.length} booking{skips.length > 1 ? "s" : ""} today</b>
                <span>Your wallet was too low. Recharge to resume sales.</span>
              </div>
            </div>
          )}

          {/* Request Top Up Form */}
          {requesting && (() => {
            const walletAmount = parseFloat(form.amount || "0");
            const commissionVal = walletAmount * (commPerTicket / 100);
            const payableAmount = walletAmount - commissionVal;
            return (
              <div className="hg-form" style={{ width: "100%", maxWidth: "none", padding: "20px" }}>
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
                        <span>Commission (₹{commPerTicket} discount per ₹100 of recharge):</span>
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

          {/* Recent Activity Ledger */}
          <div className="hg-panel" style={{ width: "100%", maxWidth: "none" }}>
            <div className="hg-panel-head"><h3>Recent activity</h3></div>
            {ledger.length === 0 ? (
              <EmptyHint icon="wallet" title="No transactions yet" sub="Wallet credits and sale debits appear here." />
            ) : (
              <div className="hg-ledger-list">
                {ledger.slice(0, 12).map((e) => (
                  <div key={e.entry_id} className="hg-ledger-row">
                    <span className="hg-dim">
                      {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                    <span>{e.notes ?? e.transaction_type}</span>
                    <span className={`hg-ledger-amt ${e.transaction_type === "Credit" ? "is-credit" : "is-debit"}`}>
                      {e.transaction_type === "Credit" ? "+" : "−"}{money(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Financial Insights Dashboard */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div className="hg-panel" style={{ padding: "24px", minHeight: "100%" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px", marginBottom: "20px", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="chart" size={16} /> Financial Insights & Earnings
            </h3>

            {/* KPI grid inside the card */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              
              <div className="hg-kpi" style={{ padding: "14px 16px", minHeight: "auto", background: "var(--surface-2)" }}>
                <span className="hg-kpi-label">Tickets Sold</span>
                <b className="hg-kpi-value" style={{ fontSize: "20px" }}>{stats?.total_tickets_sold ?? 0}</b>
                <span className="hg-kpi-sub">Total sales: {money(stats?.total_sales_volume ?? 0)}</span>
              </div>

              <div className="hg-kpi" style={{ padding: "14px 16px", minHeight: "auto", background: "var(--surface-2)" }}>
                <span className="hg-kpi-label">Player Wins</span>
                <b className="hg-kpi-value" style={{ fontSize: "20px", color: "var(--accent)" }}>{stats?.total_wins ?? 0}</b>
                <span className="hg-kpi-sub">Claims won via your shop</span>
              </div>

              <div className="hg-kpi" style={{ padding: "14px 16px", minHeight: "auto", background: "var(--surface-2)" }}>
                <span className="hg-kpi-label">Total Recharged</span>
                <b className="hg-kpi-value" style={{ fontSize: "20px" }}>{money(stats?.total_recharged ?? 0)}</b>
                <span className="hg-kpi-sub">
                  {stats?.recent_recharge_amount ? `Last: ${money(stats.recent_recharge_amount)}` : "No recharges yet"}
                </span>
              </div>

              <div className="hg-kpi" style={{ padding: "14px 16px", minHeight: "auto", background: "var(--surface-2)" }}>
                <span className="hg-kpi-label">Estimated Profits</span>
                <b className="hg-kpi-value" style={{ fontSize: "20px", color: "#10B981" }}>{money(stats?.profit_overall ?? 0)}</b>
                <span className="hg-kpi-sub">Total margins kept</span>
              </div>

            </div>

            {/* Profit Breakdown Section */}
            <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-mute)", fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "6px", marginBottom: "16px", marginTop: "24px" }}>
              Earnings Breakdown (10% wholesale margin)
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="hg-dim">Today's Profit</span>
                <strong style={{ color: "#10B981" }}>{money(stats?.profit_today ?? 0)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="hg-dim">Weekly Profit (7d)</span>
                <strong style={{ color: "#10B981" }}>{money(stats?.profit_weekly ?? 0)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="hg-dim">Monthly Profit (30d)</span>
                <strong style={{ color: "#10B981" }}>{money(stats?.profit_monthly ?? 0)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", paddingTop: "6px" }}>
                <span style={{ fontWeight: 600 }}>Lifetime Profit</span>
                <strong style={{ color: "#10B981", fontSize: "16px" }}>{money(stats?.profit_overall ?? 0)}</strong>
              </div>

            </div>

            <div style={{ background: "rgba(212, 175, 55, 0.04)", border: "1px solid rgba(212, 175, 55, 0.12)", borderRadius: "8px", padding: "12px 14px", marginTop: "28px", color: "var(--accent)", fontSize: "11.5px", display: "flex", gap: "10px", alignItems: "flex-start", lineHeight: "1.5" }}>
              <Icon name="help" size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>Profit margins are based on the 10% discount wholesale rate applied when top-up funds are purchased from the Financial Officer.</span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
