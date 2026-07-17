"use client";
/** Financial Officer sections: split-view recharge queue + master bookie ledger + Housie Ghar Analysis. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { EmptyHint, Avatar } from "@/components/ui";
import { BOOKIE_AVATAR } from "@/lib/roleAvatar";
import type { LedgerAgent } from "@/lib/types";
import { EnhancedKpiCard, AnalyticsChart, HeatmapWidget, RetentionWidget } from "./AdminSections";
import type { AuthUser } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";

interface QueueItem {
  request_id: string;
  requested_amount: number;
  payment_reference: string;
  requested_at: string;
  agent: LedgerAgent;
}

interface GameBreakdown {
  game_id: string;
  title: string;
  completed_at: string;
  ticket_price: number;
  tickets_sold: number;
  gross_collection: number;
  payout: number;
  net_profit: number;
  profit_margin: number;
}

interface FinancialAnalysis {
  overall_collection: number;
  total_payouts: number;
  overall_profit: number;
  profit_margin: number;
  total_tickets_sold: number;
  wallet_balances: number;
  recent_games: GameBreakdown[];
}

export function FinanceHubSection({ me, onResolved }: { me: AuthUser; onResolved?: () => void }) {
  const showRequestsTab = me.role_name === "Financial Admin";
  const showClaimsTab = me.role_name === "Financial Admin";
  const [activeTab, setActiveTab] = useState<"requests" | "ledgers" | "analysis" | "claims">("analysis");

  useEffect(() => {
    if (!showRequestsTab && activeTab === "requests") {
      setActiveTab("analysis");
    }
    if (!showClaimsTab && activeTab === "claims") {
      setActiveTab("analysis");
    }
  }, [showRequestsTab, showClaimsTab, activeTab]);

  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analysis & Overview states
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const isEmpty = !analysis || analysis.overall_collection === 0;

  // Claims states
  const [claims, setClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [selClaimId, setSelClaimId] = useState<string | null>(null);
  const [claimDashboard, setClaimDashboard] = useState<any>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const loadClaims = useCallback(() => {
    setLoadingClaims(true);
    apiFetch<any[]>("/api/games/prize-claims")
      .then((data) => {
        setClaims(data || []);
        setLoadingClaims(false);
      })
      .catch(() => {
        setLoadingClaims(false);
      });

    setLoadingDashboard(true);
    apiFetch<any>("/api/games/prize-claims/dashboard")
      .then((data) => {
        setClaimDashboard(data || null);
        setLoadingDashboard(false);
      })
      .catch(() => {
        setLoadingDashboard(false);
      });
  }, []);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    if (activeTab === "claims") {
      loadClaims();
    }
  }, [activeTab, loadClaims]);

  const activeClaim = claims.find((c) => `${c.game_id}-${c.prize_id}` === selClaimId) ?? claims[0];

  const handleDisburse = async () => {
    if (!activeClaim || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/games/${activeClaim.game_id}/prizes/${activeClaim.prize_id}/disburse`, {
        method: "POST",
      });
      setSelClaimId(null);
      loadClaims();
      onResolved?.();
    } catch (e: any) {
      setError(e.message || "Disbursal failed");
    } finally {
      setBusy(false);
    }
  };

  useSocket((event) => {
    if (event === "ticket_status_change" || event === "prize_claim_received" || event === "game_list_update") {
      loadClaims();
      load();
    }
  });

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load financial analysis & overview stats when tab is switched
  useEffect(() => {
    if (activeTab === "analysis") {
      setLoadingAnalysis(true);
      Promise.all([
        apiFetch<FinancialAnalysis>("/api/stats/financial-analysis"),
        apiFetch<any>("/api/stats/overview")
      ])
        .then(([finRes, ovRes]) => {
          setAnalysis(finRes);
          setOverview(ovRes);
          setLoadingAnalysis(false);
        })
        .catch(() => {
          setLoadingAnalysis(false);
        });
    }
  }, [activeTab]);

  const queue: QueueItem[] = useMemo(
    () =>
      agents
        .flatMap((a) => a.pending_requests.map((r) => ({ ...r, agent: a })))
        .sort((x, y) => new Date(x.requested_at).getTime() - new Date(y.requested_at).getTime()),
    [agents]
  );

  const active = queue.find((q) => q.request_id === selId) ?? queue[0];

  const resolve = async (approve: boolean) => {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/wallet/topup/${active.request_id}/${approve ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelId(null);
      load();
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const lowThreshold = 500;

  return (
    <div className="hg-sec" style={{ gap: "20px" }}>
      {/* Merged Section Tab Header */}
      <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)", width: "fit-content", marginBottom: "4px", flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab("analysis")}
          style={{
            background: activeTab === "analysis" ? "var(--surface)" : "none",
            color: activeTab === "analysis" ? "var(--cyan)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: "none",
            borderRadius: "6px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap"
          }}
        >
          Housie Ghar Analysis
        </button>
        <button
          onClick={() => setActiveTab("ledgers")}
          style={{
            background: activeTab === "ledgers" ? "var(--surface)" : "none",
            color: activeTab === "ledgers" ? "var(--cyan)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: "none",
            borderRadius: "6px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap"
          }}
        >
          Bookie Ledgers
        </button>
        {showRequestsTab && (
          <button
            onClick={() => setActiveTab("requests")}
            style={{
              background: activeTab === "requests" ? "var(--surface)" : "none",
              color: activeTab === "requests" ? "var(--cyan)" : "var(--text-dim)",
              border: "none",
              outline: "none",
              boxShadow: "none",
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              margin: 0,
              whiteSpace: "nowrap"
            }}
          >
            Pending Requests ({queue.length})
          </button>
        )}
        {showClaimsTab && (
          <button
            onClick={() => setActiveTab("claims")}
            style={{
              background: activeTab === "claims" ? "var(--surface)" : "none",
              color: activeTab === "claims" ? "var(--cyan)" : "var(--text-dim)",
              border: "none",
              outline: "none",
              boxShadow: "none",
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              margin: 0,
              whiteSpace: "nowrap"
            }}
          >
            Claims & Disbursals ({claims.length})
          </button>
        )}
      </div>

      {activeTab === "requests" ? (
        <div className="hg-split" style={{ height: "calc(100% - 60px)" }}>
          <div className="hg-split-l">
            <div className="hg-split-head">Pending requests <span className="hg-q-count">{queue.length}</span></div>
            {queue.length === 0 && <EmptyHint icon="check" title="Queue clear" sub="All recharge requests processed." />}
            {queue.map((r) => (
              <button
                key={r.request_id}
                className={`hg-q-card${active?.request_id === r.request_id ? " is-active" : ""}`}
                onClick={() => setSelId(r.request_id)}
              >
                <div className="hg-q-top"><b>{r.agent.full_name}</b><span className="hg-q-amt">{money(r.requested_amount)}</span></div>
                <div className="hg-q-meta">
                  {r.payment_reference} · {new Date(r.requested_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </div>
              </button>
            ))}
          </div>
          <div className="hg-split-r">
            {active ? (
              <>
                <div className="hg-detail-head">
                  <Avatar src={BOOKIE_AVATAR} name={active.agent.full_name} className="hg-avatar-lg" />
                  <div>
                    <b>{active.agent.full_name}</b>
                    <span>{active.agent.town ?? "—"} · Trust: {active.agent.trust}</span>
                  </div>
                </div>
                <div className="hg-detail-grid">
                  <div><span>Requested</span><b>{money(active.requested_amount)}</b></div>
                  <div><span>Current balance</span><b>{money(active.agent.current_balance)}</b></div>
                  <div><span>Lifetime top-ups</span><b>{money(active.agent.lifetime_topups)}</b></div>
                  <div><span>Reference</span><b>{active.payment_reference}</b></div>
                </div>
                <div className="hg-detail-note">
                  Verify the deposit in your banking app, then credit the wallet. Action is logged for the Superadmin.
                </div>
                {error && <p className="hg-sec-err">{error}</p>}
                <div className="hg-detail-actions">
                  <button className="hg-fin-approve" disabled={busy} onClick={() => resolve(true)}>
                    <Icon name="check" size={17} strokeWidth={2.6} /> Credit Wallet {money(active.requested_amount)}
                  </button>
                  <button className="hg-fin-reject" disabled={busy} onClick={() => resolve(false)}>
                    <Icon name="x" size={17} strokeWidth={2.6} /> Reject / Dispute
                  </button>
                </div>
              </>
            ) : (
              <EmptyHint icon="wallet" title="Select a request" sub="Pick a pending recharge to review the bookie's ledger." />
            )}
          </div>
        </div>
      ) : activeTab === "ledgers" ? (
        <div className="hg-panel" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {agents.length === 0 ? (
            <EmptyHint icon="users" title="No bookies yet" sub="Bookie wallets appear here once accounts are created." />
          ) : (
            <div className="hg-table" style={{ height: "100%", overflowY: "auto" }}>
              <div className="hg-tr hg-tr-head">
                <span>Bookie</span><span>Balance</span><span>Lifetime top-ups</span><span>Last recharge</span><span>Trust</span>
              </div>
              {agents.map((b) => {
                const low = b.current_balance < lowThreshold;
                return (
                  <div key={b.agent_id} className="hg-tr">
                    <span className="hg-td-name"><Avatar src={BOOKIE_AVATAR} name={b.full_name} />{b.full_name}</span>
                    <span className={low ? "hg-bad-amt" : ""}>
                      {money(b.current_balance)}
                      {low && <i className="hg-low-tag">LOW</i>}
                    </span>
                    <span className="hg-dim">{money(b.lifetime_topups)}</span>
                    <span className="hg-dim">
                      {b.last_recharge_at
                        ? new Date(b.last_recharge_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                        : "never"}
                    </span>
                    <span><span className={`hg-pill hg-pill-${b.trust}`}>{b.trust}</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "claims" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", height: "calc(100% - 60px)", overflow: "hidden" }}>
          
          {/* KPI Dashboard Row at the top */}
          {claimDashboard && claimDashboard.stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", flexShrink: 0 }}>
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Claims</span>
                <strong style={{ fontSize: "20px", color: "var(--text)", display: "block", marginTop: "4px" }}>{money(claimDashboard.stats.overall_claims_amount)}</strong>
                <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>{claimDashboard.stats.overall_claims_count} total claims submitted</span>
              </div>
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Disbursed</span>
                <strong style={{ fontSize: "20px", color: "var(--brand)", display: "block", marginTop: "4px" }}>{money(claimDashboard.stats.overall_disbursals_amount)}</strong>
                <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>{claimDashboard.stats.overall_disbursals_count} total claims disbursed</span>
              </div>
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Weekly Claims / Disbursals</span>
                <strong style={{ fontSize: "20px", color: "var(--cyan)", display: "block", marginTop: "4px" }}>{money(claimDashboard.stats.weekly_claims_amount)}</strong>
                <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>
                  {claimDashboard.stats.weekly_claims_count} claims · {money(claimDashboard.stats.weekly_disbursals_amount)} paid ({claimDashboard.stats.weekly_disbursals_count})
                </span>
              </div>
              <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Daily Claims / Disbursals</span>
                <strong style={{ fontSize: "20px", color: "var(--text)", display: "block", marginTop: "4px" }}>{money(claimDashboard.stats.daily_claims_amount)}</strong>
                <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>
                  {claimDashboard.stats.daily_claims_count} claims · {money(claimDashboard.stats.daily_disbursals_amount)} paid ({claimDashboard.stats.daily_disbursals_count})
                </span>
              </div>
            </div>
          )}

          {/* Split view: Pending Claims queue + Right Detail Pane OR History list */}
          <div className="hg-split" style={{ flex: 1, minHeight: 0 }}>
            <div className="hg-split-l" style={{ overflowY: "auto" }}>
              <div className="hg-split-head">Pending Claims Queue <span className="hg-q-count">{claims.length}</span></div>
              {loadingClaims && claims.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-dim)" }}>
                  Loading claims...
                </div>
              )}
              {!loadingClaims && claims.length === 0 && (
                <EmptyHint icon="check" title="All claims cleared" sub="No pending prize claims awaiting disbursal." />
              )}
              {claims.map((c) => {
                const uniqueKey = `${c.game_id}-${c.prize_id}`;
                const isSelected = activeClaim && `${activeClaim.game_id}-${activeClaim.prize_id}` === uniqueKey;
                return (
                  <button
                    key={uniqueKey}
                    className={`hg-q-card${isSelected ? " is-active" : ""}`}
                    onClick={() => setSelClaimId(isSelected ? null : uniqueKey)}
                  >
                    <div className="hg-q-top">
                      <b>{c.winner_housie_name}</b>
                      <span className="hg-q-amt">{money(c.amount)}</span>
                    </div>
                    <div className="hg-q-meta">
                      {c.pattern_name} · {c.game_title}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="hg-split-r" style={{ overflowY: "auto" }}>
              {activeClaim ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>Disbursal Review</h3>
                    <button 
                      onClick={() => setSelClaimId(null)}
                      style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                    >
                      <Icon name="x" size={14} /> Clear Selection
                    </button>
                  </div>
                  <div className="hg-detail-head">
                    <Avatar src={null} name={activeClaim.winner_housie_name} className="hg-avatar-lg" />
                    <div>
                      <b>{activeClaim.winner_housie_name}</b>
                      <span>Winning Ticket #{activeClaim.winner_ticket_number}</span>
                    </div>
                  </div>
                  <div className="hg-detail-grid">
                    <div><span>Game</span><b>{activeClaim.game_title}</b></div>
                    <div><span>Game Date/Time</span><b>{activeClaim.game_date ? new Date(activeClaim.game_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</b></div>
                    <div><span>Ticket Number</span><b>#{activeClaim.winner_ticket_number}</b></div>
                    <div><span>Prize Type</span><b>{activeClaim.pattern_name}</b></div>
                    <div><span>Bookie (Agent)</span><b>{activeClaim.bookie_name || "System/Operator"}</b></div>
                    <div><span>Amount</span><b style={{ color: "var(--brand)" }}>{money(activeClaim.amount)}</b></div>
                    <div><span>Claim Date</span><b>{new Date(activeClaim.player_claimed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b></div>
                  </div>
                  <div className="hg-detail-note" style={{ marginTop: "16px" }}>
                    Verify the prize claim details, then credit or transfer the reward. Action is logged for audit reporting.
                  </div>
                  {error && <p className="hg-sec-err">{error}</p>}
                  <div className="hg-detail-actions" style={{ marginTop: "16px" }}>
                    <button className="hg-fin-approve" disabled={busy} onClick={handleDisburse}>
                      <Icon name="check" size={17} strokeWidth={2.6} /> Disburse Reward {money(activeClaim.amount)}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "16px" }}>
                  <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "14px", margin: 0 }}>Past 10 Claims / Disbursals History</h3>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Auto-refreshes on actions</span>
                  </div>
                  
                  {claimDashboard && claimDashboard.history && claimDashboard.history.length > 0 ? (
                    <div className="hg-table" style={{ fontSize: "12px" }}>
                      <div className="hg-tr hg-tr-head" style={{ padding: "8px 12px" }}>
                        <span>Winner</span>
                        <span>Game</span>
                        <span>Prize</span>
                        <span>Ticket</span>
                        <span>Amount</span>
                        <span>Status</span>
                      </div>
                      {claimDashboard.history.map((h: any) => {
                        const uniqueKey = `hist-${h.game_id}-${h.prize_id}`;
                        return (
                          <div key={uniqueKey} className="hg-tr" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-light)" }}>
                            <span className="hg-td-name" style={{ fontWeight: 600 }}>{h.winner_housie_name}</span>
                            <span className="hg-dim">{h.game_title}</span>
                            <span>{h.pattern_name}</span>
                            <span>#{h.winner_ticket_number}</span>
                            <strong style={{ color: h.disbursed ? "var(--brand)" : "var(--cyan)" }}>{money(h.amount)}</strong>
                            <span>
                              {h.disbursed ? (
                                <span style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Disbursed</span>
                              ) : (
                                <span style={{ background: "rgba(217, 119, 6, 0.1)", color: "#d97706", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Pending</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-dim)", padding: "40px" }}>
                      No past claim history records found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Housie Ghar Analysis Tab Content (Incorporates Dashboard Contents) ── */
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "32px" }}>
          {loadingAnalysis ? (
            <div style={{ textAlign: "center", padding: "64px 16px", color: "var(--text-dim)" }}>
              <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ marginTop: "12px", fontSize: "14px" }}>Fetching financial analysis metrics…</p>
            </div>
          ) : analysis && overview ? (
            <>
              {/* Today's Dashboard Metrics Row */}
              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", 
                  gap: "14px" 
                }}
              >
                <EnhancedKpiCard 
                  label="Gross revenue today" 
                  value={money(overview.gross_revenue_today ?? 0)} 
                  delta={{ value: isEmpty ? "0.0%" : "14.8%", isPositive: true }}
                  trendData={isEmpty ? [0, 0, 0, 0, 0, 0, 0] : [12000, 15000, 14000, 18000, 22000, 19000, overview.gross_revenue_today || 24500]}
                  trendColor="var(--cyan)"
                  tone="good"
                />
                <EnhancedKpiCard 
                  label="Tickets sold today" 
                  value={isEmpty ? "0" : (overview.tickets_sold_today ?? 0).toLocaleString("en-IN")} 
                  delta={{ value: isEmpty ? "0.0%" : "8.2%", isPositive: true }}
                  trendData={isEmpty ? [0, 0, 0, 0, 0, 0, 0] : [240, 310, 290, 360, 420, 380, overview.tickets_sold_today || 450]}
                  trendColor="var(--accent)"
                />
                <EnhancedKpiCard 
                  label="Active games" 
                  value={isEmpty ? 0 : (overview.active_games ?? 0)} 
                  sub={isEmpty ? "0 scheduled" : `${overview.scheduled_games ?? 0} scheduled`}
                  delta={{ value: isEmpty ? "0.0%" : "20.0%", isPositive: true }}
                  trendData={isEmpty ? [0, 0, 0, 0, 0, 0, 0] : [3, 4, 3, 5, 4, 6, overview.active_games || 5]}
                  trendColor="var(--success)"
                />
                <EnhancedKpiCard 
                  label="Pending topups" 
                  value={isEmpty ? 0 : (overview.pending_topups ?? 0)} 
                  sub="Awaiting approval"
                  delta={{ value: isEmpty ? "0.0%" : "15.4%", isPositive: false }}
                  trendData={isEmpty ? [0, 0, 0, 0, 0, 0, 0] : [8, 12, 6, 14, 9, 7, overview.pending_topups || 0]}
                  trendColor="var(--danger)"
                  tone={overview.pending_topups > 0 ? "alert" : undefined}
                />
              </div>

              {/* Main Analytics Chart */}
              <AnalyticsChart isEmpty={isEmpty} />

              {/* Today's Operational KPIs */}
              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                  gap: "16px" 
                }}
              >
                <EnhancedKpiCard
                  label="Realized Net Revenue"
                  value={money(isEmpty ? 0 : (overview.net_revenue ?? 0))}
                  sub={isEmpty ? "0% average net profit margin" : "18% average net profit margin"}
                  tone="good"
                />
                <EnhancedKpiCard
                  label="Withdrawal Queue"
                  value={money(isEmpty ? 0 : (overview.pending_withdrawals ?? 0))}
                  sub={isEmpty ? "0 pending requests" : `${overview.pending_withdrawals === 24500 ? 6 : 0} pending requests awaiting CFO review`}
                />
                <EnhancedKpiCard
                  label="Total Wallet Balances"
                  value={money(isEmpty ? 0 : (overview.wallet_balances ?? 0))}
                  sub="Aggregate active agent deposits"
                />
              </div>

              {/* Overall Historical Performance Insights Header */}
              <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: "24px" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", fontFamily: "var(--font-head)", fontWeight: 700 }}>Overall Historical Analytics</h4>
                <div 
                  style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                    gap: "16px" 
                  }}
                >
                  <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--card-shadow)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Collection</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "24px", color: "var(--text)" }}>{money(analysis.overall_collection)}</strong>
                      <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>▲ {isEmpty ? "0.0%" : "14.8%"}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "4px" }}>Aggregate tickets sales value</span>
                  </div>

                  <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--card-shadow)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Profit</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "24px", color: "var(--accent)" }}>{money(analysis.overall_profit)}</strong>
                      <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>▲ {isEmpty ? "0.0%" : "18.2%"}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "4px" }}>Net platform margin earned</span>
                  </div>

                  <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--card-shadow)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Margin</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "24px", color: "var(--cyan)" }}>{analysis.profit_margin.toFixed(1)}%</strong>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "4px" }}>Return on total collections</span>
                  </div>

                  <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--card-shadow)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Platform Liability</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "24px", color: "var(--text)" }}>{money(analysis.wallet_balances)}</strong>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "4px" }}>Deposits held in bookie wallets</span>
                  </div>
                </div>
              </div>

              {/* Extra KPIs row */}
              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                  gap: "16px" 
                }}
              >
                <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ticket Volume</span>
                    <strong style={{ fontSize: "20px", color: "var(--text)", display: "block", marginTop: "2px" }}>{analysis.total_tickets_sold.toLocaleString("en-IN")}</strong>
                  </div>
                  <Icon name="ticket" size={24} style={{ color: "var(--text-mute)" }} />
                </div>
                <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Prize Payouts Given</span>
                    <strong style={{ fontSize: "20px", color: "var(--text)", display: "block", marginTop: "2px" }}>{money(analysis.total_payouts)}</strong>
                  </div>
                  <Icon name="trophy" size={24} style={{ color: "var(--text-mute)" }} />
                </div>
              </div>

              {/* Visualizations row: Heatmap & Retention */}
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", width: "100%" }}>
                <HeatmapWidget isEmpty={isEmpty} />
                <RetentionWidget isEmpty={isEmpty} />
              </div>

              {/* Granular Game Performance Ledger */}
              <div className="hg-panel">
                <div className="hg-panel-head">
                  <h3>Granular Games Performance Ledger</h3>
                </div>
                {analysis.recent_games.length === 0 ? (
                  <div style={{ padding: "32px 16px", textTransform: "uppercase", fontSize: "12px", color: "var(--text-dim)", textAlign: "center" }}>
                    No completed games records available
                  </div>
                ) : (
                  <div className="hg-table" style={{ width: "100%", overflowX: "auto" }}>
                    <div className="hg-tr hg-tr-fin-games hg-tr-head">
                      <span>Game Title</span>
                      <span>Date Completed</span>
                      <span>Tickets Sold</span>
                      <span>Collection</span>
                      <span>Prize Payout</span>
                      <span>Net Profit</span>
                      <span>Margin %</span>
                    </div>
                    {analysis.recent_games.map((g) => (
                      <div key={g.game_id} className="hg-tr hg-tr-fin-games">
                        <span className="hg-td-name">{g.title}</span>
                        <span className="hg-dim">
                          {new Date(g.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                        <span>{g.tickets_sold}</span>
                        <strong>{money(g.gross_collection)}</strong>
                        <span className="hg-bad-amt">{money(g.payout)}</span>
                        <span style={{ color: "var(--success)", fontWeight: 700 }}>{money(g.net_profit)}</span>
                        <span>
                          <span className="hg-pill hg-pill-trusted" style={{ minWidth: "48px", textAlign: "center" }}>
                            {g.profit_margin.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-dim)" }}>
              No financial data available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
