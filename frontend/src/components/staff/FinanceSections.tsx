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
import type { PerformanceSeries, HeatmapHour, RetentionData } from "./AdminSections";
import type { AuthUser } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";

interface QueueItem {
  request_id: string;
  requested_amount: number;
  payment_reference: string;
  requested_at: string;
  request_status?: "Pending" | "Approved" | "Rejected";
  reviewed_at?: string;
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

interface FinanceOverview {
  gross_revenue_today: number;
  tickets_sold_today: number;
  active_games: number;
  scheduled_games: number;
  pending_topups: number;
  net_revenue: number;
  pending_withdrawals: number;
  wallet_balances: number;
}

interface FinanceInsights {
  series: PerformanceSeries;
  heatmap: HeatmapHour[];
  retention: RetentionData;
}

interface PrizeClaimItem {
  game_id: string;
  prize_id: number;
  game_title: string;
  game_date: string;
  pattern_name: string;
  amount: number;
  winner_housie_name: string;
  winner_ticket_number: number | null;
  player_claimed_at: string;
  disbursed: boolean;
  disbursed_at?: string;
  bookie_name: string;
  bookie_phone: string;
}

export function FinanceHubSection({ me, onResolved }: { me: AuthUser; onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<"analysis" | "ledgers">("analysis");

  const [agents, setAgents] = useState<LedgerAgent[]>([]);

  // Analysis & Overview states
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [insights, setInsights] = useState<FinanceInsights | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load financial analysis & overview stats when tab is switched or via socket
  const loadStats = useCallback(() => {
    if (activeTab === "analysis") {
      setLoadingAnalysis(true);
      Promise.all([
        apiFetch<FinancialAnalysis>("/api/stats/financial-analysis"),
        apiFetch<FinanceOverview>("/api/stats/overview"),
        apiFetch<FinanceInsights>("/api/stats/finance-insights")
      ])
        .then(([finRes, ovRes, insightsRes]) => {
          setAnalysis(finRes);
          setOverview(ovRes);
          setInsights(insightsRes);
          setLoadingAnalysis(false);
        })
        .catch(() => {
          setLoadingAnalysis(false);
        });
    }
  }, [activeTab]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Sync real-time updates instantly via socket
  useSocket((event) => {
    if (
      event === "ticket_status_change" || 
      event === "game_list_update" || 
      event === "wallet_credited" || 
      event === "wallet_debited" ||
      event === "ledger_update" ||
      event === "wallet_update"
    ) {
      load();
      loadStats();
    }
  });

  const lowThreshold = 500;

  return (
    <div className="hg-sec" style={{ gap: "20px" }}>
      {/* Tab Header */}
      <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)", width: "fit-content", maxWidth: "100%", overflowX: "auto", marginBottom: "8px", flexShrink: 0 }}>
        {/* 1. HG Analysis */}
        <button
          onClick={() => setActiveTab("analysis")}
          style={{
            background: activeTab === "analysis" ? "var(--surface)" : "none",
            color: activeTab === "analysis" ? "var(--cyan)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: activeTab === "analysis" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
            borderRadius: "6px",
            padding: "8px 18px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap"
          }}
        >
          HG Analysis
        </button>

        {/* 2. Bookie Ledgers */}
        <button
          onClick={() => setActiveTab("ledgers")}
          style={{
            background: activeTab === "ledgers" ? "var(--surface)" : "none",
            color: activeTab === "ledgers" ? "var(--cyan)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: activeTab === "ledgers" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
            borderRadius: "6px",
            padding: "8px 18px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap"
          }}
        >
          Bookie Ledgers
        </button>
      </div>

      {activeTab === "ledgers" ? (
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
      ) : (
        /* ── Housie Ghar Analysis Tab Content ── */
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
                <div className="hg-card" style={{ padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Active Games</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", marginTop: "4px" }}>{overview.active_games}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Scheduled</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", marginTop: "4px" }}>{overview.scheduled_games}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Tickets Sold Today</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--cyan)", marginTop: "4px" }}>{overview.tickets_sold_today}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Gross Rev Today</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent)", marginTop: "4px" }}>{money(overview.gross_revenue_today)}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Net Rev Today</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--brand)", marginTop: "4px" }}>{money(overview.net_revenue)}</div>
                </div>
              </div>

              {/* Overall Platform Metrics Ribbon */}
              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", 
                  gap: "14px" 
                }}
              >
                <div className="hg-card" style={{ padding: "14px", borderLeft: "3px solid var(--accent)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Total Collection</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent)", marginTop: "4px" }}>{money(analysis.overall_collection)}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px", borderLeft: "3px solid var(--cyan)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Total Prize Payouts</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--cyan)", marginTop: "4px" }}>{money(analysis.total_payouts)}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px", borderLeft: "3px solid var(--brand)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Overall Net Profit</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--brand)", marginTop: "4px" }}>{money(analysis.overall_profit)}</div>
                </div>
                <div className="hg-card" style={{ padding: "14px", borderLeft: "3px solid var(--purple)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Profit Margin</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--purple)", marginTop: "4px" }}>{analysis.profit_margin.toFixed(1)}%</div>
                </div>
                <div className="hg-card" style={{ padding: "14px", borderLeft: "3px solid var(--text-dim)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>Bookie Balances</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", marginTop: "4px" }}>{money(analysis.wallet_balances)}</div>
                </div>
              </div>

              {/* Performance Chart & Heatmap */}
              {insights && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>
                  <AnalyticsChart series={insights.series} />
                  <HeatmapWidget hours={insights.heatmap} />
                </div>
              )}

              {/* Player Retention & Repeat Participation */}
              {insights && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>
                  <RetentionWidget retention={insights.retention} />
                </div>
              )}

              {/* Completed Games Performance Table */}
              <div className="hg-panel" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>Completed Games Performance</h3>
                  <span className="hg-pill hg-pill-completed">{analysis.recent_games.length} games</span>
                </div>
                {analysis.recent_games.length === 0 ? (
                  <EmptyHint icon="grid" title="No completed games yet" sub="Completed game breakdowns will show here." />
                ) : (
                  <div className="hg-table" style={{ overflowX: "auto" }}>
                    <div className="hg-tr hg-tr-head">
                      <span>Game Title</span>
                      <span>Completed Date</span>
                      <span>Tickets Sold</span>
                      <span>Collection</span>
                      <span>Payout</span>
                      <span>Net Profit</span>
                      <span>Margin</span>
                    </div>
                    {analysis.recent_games.map((g: GameBreakdown) => (
                      <div key={g.game_id} className="hg-tr">
                        <span className="hg-td-name"><strong>{g.title}</strong></span>
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

export function RechargeHubSection({ me, onResolved }: { me: AuthUser; onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<"requests" | "claims">("requests");

  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prize claims states
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaimItem[]>([]);
  const [selClaimKey, setSelClaimKey] = useState<string | null>(null);
  const [disbursingId, setDisbursingId] = useState<number | null>(null);
  const [disburseError, setDisburseError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  const loadPrizeClaims = useCallback(() => {
    apiFetch<PrizeClaimItem[]>("/api/games/prize-claims")
      .then((res) => {
        if (Array.isArray(res)) {
          setPrizeClaims(res);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadPrizeClaims();
  }, [load, loadPrizeClaims]);

  useSocket((event) => {
    if (
      event === "ticket_status_change" || 
      event === "game_list_update" || 
      event === "topup_request_received" || 
      event === "topup_requested" ||
      event === "topup_approved" ||
      event === "topup_rejected" ||
      event === "prize_claim_received" ||
      event === "prize_disbursed" ||
      event === "winner" ||
      event === "prize_won" ||
      event === "wallet_credited" || 
      event === "wallet_debited" ||
      event === "ledger_update" ||
      event === "wallet_update"
    ) {
      load();
      loadPrizeClaims();
    }
  });

  const activeClaim = useMemo(
    () => prizeClaims.find((c) => `${c.game_id}-${c.prize_id}` === selClaimKey) ?? null,
    [prizeClaims, selClaimKey]
  );

  const handleDisbursePrize = async (gameId: string, prizeId: number) => {
    if (disbursingId !== null) return;
    setDisbursingId(prizeId);
    setDisburseError(null);
    try {
      await apiFetch(`/api/games/${gameId}/prizes/${prizeId}/disburse`, {
        method: "POST",
      });
      loadPrizeClaims();
      setSelClaimKey(null);
      onResolved?.();
    } catch (e) {
      setDisburseError(e instanceof Error ? e.message : "Disbursement failed");
    } finally {
      setDisbursingId(null);
    }
  };

  const queue: QueueItem[] = useMemo(
    () =>
      agents
        .flatMap((a) => (a.pending_requests || []).map((r) => ({ ...r, agent: a })))
        .sort((x, y) => {
          const statusOrder = (st?: string) => (st === "Pending" || !st ? 0 : 1);
          const diff = statusOrder(x.request_status) - statusOrder(y.request_status);
          if (diff !== 0) return diff;
          return new Date(y.requested_at).getTime() - new Date(x.requested_at).getTime();
        }),
    [agents]
  );

  const active = queue.find((q) => q.request_id === selId) ?? null;

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

  return (
    <div className="hg-sec" style={{ gap: "20px" }}>
      {/* Top Tab Header */}
      <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)", width: "fit-content", maxWidth: "100%", overflowX: "auto", marginBottom: "8px", flexShrink: 0 }}>
        {/* 1. Recharge Requests */}
        <button
          onClick={() => setActiveTab("requests")}
          style={{
            background: activeTab === "requests" ? "var(--surface)" : "none",
            color: activeTab === "requests" ? "var(--cyan)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: activeTab === "requests" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
            borderRadius: "6px",
            padding: "8px 18px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          Recharge Requests ({queue.filter((r) => (r.request_status || "Pending") === "Pending").length})
        </button>

        {/* 2. Claim Requests */}
        <button
          onClick={() => setActiveTab("claims")}
          style={{
            background: activeTab === "claims" ? "var(--surface)" : "none",
            color: activeTab === "claims" ? "var(--accent)" : "var(--text-dim)",
            border: "none",
            outline: "none",
            boxShadow: activeTab === "claims" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
            borderRadius: "6px",
            padding: "8px 18px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            margin: 0,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          Claim Requests ({prizeClaims.filter((c) => !c.disbursed).length})
        </button>
      </div>

      {activeTab === "requests" ? (
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Recharge Queue — clicking a row pops up its detail in a modal below, rather than an inline side panel */}
          <div style={{ width: "100%", maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Recharge Requests</h3>
              <span className="hg-q-count" style={{ background: queue.length > 0 ? "var(--cyan)" : "var(--surface-2)", color: queue.length > 0 ? "#000" : "var(--text-dim)", fontWeight: 800, fontSize: "12px", padding: "2px 8px", borderRadius: "10px" }}>
                {queue.length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "4px" }}>
              {queue.length === 0 && <EmptyHint icon="check" title="Queue clear" sub="No pending or past recharge requests." />}
              {queue.map((r) => {
                const isPending = (r.request_status || "Pending") === "Pending";
                const isApproved = r.request_status === "Approved";
                const isRejected = r.request_status === "Rejected";
                const isActive = active?.request_id === r.request_id;
                return (
                  <button
                    key={r.request_id}
                    onClick={() => setSelId(r.request_id)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      background: isActive ? "var(--surface-2)" : "transparent",
                      border: isActive ? "1.5px solid var(--cyan)" : "1px solid var(--border-light)",
                      borderRadius: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      opacity: isPending ? 1 : 0.85,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <b style={{ color: "var(--text)", fontSize: "14.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>{r.agent.full_name}</b>
                      <span style={{
                        background: isPending ? "rgba(234, 179, 8, 0.15)" : isApproved ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: isPending ? "#eab308" : isApproved ? "#22c55e" : "#ef4444",
                        fontSize: "10px",
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        textTransform: "uppercase",
                        flexShrink: 0
                      }}>
                        {r.request_status || "Pending"}
                      </span>
                    </div>
                    <b style={{ color: isApproved ? "#22c55e" : isRejected ? "#ef4444" : "var(--cyan)", fontWeight: 800, fontSize: "20px" }}>{money(r.requested_amount)}</b>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--text-dim)", paddingTop: "8px", borderTop: "1px solid var(--border-light)" }}>
                      <span>Ref: {r.payment_reference}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>
                        {new Date(r.requested_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Claim Requests List — clicking a row pops up its detail in a modal below, rather than an inline side panel */}
          <div style={{ width: "100%", maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Claim Requests</h3>
              <span className="hg-q-count" style={{ background: prizeClaims.length > 0 ? "var(--accent)" : "var(--surface-2)", color: prizeClaims.length > 0 ? "#000" : "var(--text-dim)", fontWeight: 800, fontSize: "12px", padding: "2px 8px", borderRadius: "10px" }}>
                {prizeClaims.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "4px" }}>
              {prizeClaims.length === 0 && (
                <EmptyHint icon="trophy" title="No Pending Claim Requests" sub="Player prize claims will appear here instantly when submitted." />
              )}
              {prizeClaims.map((c) => {
                const key = `${c.game_id}-${c.prize_id}`;
                const isActive = (activeClaim?.prize_id === c.prize_id && activeClaim?.game_id === c.game_id);
                const isDisbursed = c.disbursed;
                return (
                  <button
                    key={key}
                    onClick={() => setSelClaimKey(key)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      background: isActive ? "var(--surface-2)" : "transparent",
                      border: isActive ? "1.5px solid var(--accent)" : "1px solid var(--border-light)",
                      borderRadius: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: isActive ? "0 4px 12px var(--accent-soft)" : "none",
                      opacity: isDisbursed ? 0.85 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <b style={{ color: "var(--text)", fontSize: "14.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>{c.winner_housie_name}</b>
                      <span style={{
                        background: isDisbursed ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                        color: isDisbursed ? "#22c55e" : "#eab308",
                        fontSize: "10px",
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        textTransform: "uppercase",
                        flexShrink: 0
                      }}>
                        {isDisbursed ? "DISBURSED" : "PENDING"}
                      </span>
                    </div>
                    <b style={{ color: isDisbursed ? "#22c55e" : "var(--accent)", fontWeight: 800, fontSize: "20px" }}>{money(c.amount)}</b>
                    <div style={{ fontSize: "12px", color: "var(--text-dim)", paddingTop: "8px", borderTop: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{c.pattern_name} {c.winner_ticket_number ? `(Tk #${c.winner_ticket_number})` : ""}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>
                          {c.player_claimed_at ? new Date(c.player_claimed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.game_title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recharge Request Detail — pops up in front of the screen (rather than stacking under the queue list) */}
      {activeTab === "requests" && active && (
        <div className="hg-modal-scrim" onClick={() => setSelId(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)", maxWidth: "600px", width: "92%", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>Recharge Request</h3>
              <button
                onClick={() => setSelId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", lineHeight: 1, color: "var(--text-dim)" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <Avatar src={BOOKIE_AVATAR} name={active.agent.full_name} className="hg-avatar-lg" />
              <div>
                <b style={{ fontSize: "18px", color: "var(--text)", display: "block" }}>{active.agent.full_name}</b>
                <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>{active.agent.town ?? "—"} · Trust: {active.agent.trust}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "20px" }}>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Requested Amount</span>
                <b style={{ display: "block", fontSize: "22px", color: "var(--cyan)", marginTop: "2px" }}>{money(active.requested_amount)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Request Status</span>
                <b style={{ display: "block", fontSize: "16px", color: active.request_status === "Approved" ? "#22c55e" : active.request_status === "Rejected" ? "#ef4444" : "#eab308", marginTop: "4px" }}>
                  {active.request_status || "Pending"}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Current Balance</span>
                <b style={{ display: "block", fontSize: "18px", color: "var(--text)", marginTop: "4px" }}>{money(active.agent.current_balance)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Payment Reference</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>{active.payment_reference}</b>
              </div>
            </div>

            {(active.request_status || "Pending") === "Pending" ? (
              <>
                <div style={{ background: "rgba(6, 182, 212, 0.08)", border: "1px solid rgba(6, 182, 212, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                  💡 Verify the deposit in your banking app, then credit the wallet. Action is logged for auditing.
                </div>

                {error && <p className="hg-sec-err">{error}</p>}

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button className="hg-fin-approve" disabled={busy} onClick={() => resolve(true)} style={{ flex: "1 1 200px", padding: "14px 20px" }}>
                    <Icon name="check" size={17} strokeWidth={2.6} /> Credit Wallet {money(active.requested_amount)}
                  </button>
                  <button className="hg-fin-reject" disabled={busy} onClick={() => resolve(false)} style={{ flex: "1 1 180px", padding: "14px 20px" }}>
                    <Icon name="x" size={17} strokeWidth={2.6} /> Reject / Dispute
                  </button>
                </div>
              </>
            ) : active.request_status === "Approved" ? (
              <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="check" size={18} /> Wallet Credited ({new Date(active.reviewed_at || active.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            ) : (
              <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="x" size={18} /> Request Rejected ({new Date(active.reviewed_at || active.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prize Claim Detail — pops up in front of the screen (rather than stacking under the claims list) */}
      {activeTab === "claims" && activeClaim && (
        <div className="hg-modal-scrim" onClick={() => setSelClaimKey(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)", maxWidth: "600px", width: "92%", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>Prize Claim</h3>
              <button
                onClick={() => setSelClaimKey(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", lineHeight: 1, color: "var(--text-dim)" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: activeClaim.disbursed ? "rgba(34, 197, 94, 0.2)" : "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: activeClaim.disbursed ? "#22c55e" : "#000", fontWeight: 800, fontSize: "20px", flexShrink: 0 }}>
                🏆
              </div>
              <div>
                <b style={{ fontSize: "18px", color: "var(--text)", display: "block" }}>{activeClaim.winner_housie_name}</b>
                <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                  Won {activeClaim.pattern_name} in "{activeClaim.game_title}"
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "20px" }}>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Prize Reward Amount</span>
                <b style={{ display: "block", fontSize: "22px", color: activeClaim.disbursed ? "#22c55e" : "var(--accent)", marginTop: "2px" }}>{money(activeClaim.amount)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Winning Pattern</span>
                <b style={{ display: "block", fontSize: "16px", color: "var(--text)", marginTop: "4px" }}>{activeClaim.pattern_name}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Winning Ticket</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                  {activeClaim.winner_ticket_number ? `Ticket #${activeClaim.winner_ticket_number}` : "Verified Win"}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sold By Agent / Bookie</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--cyan)", marginTop: "4px" }}>
                  {activeClaim.bookie_name} {activeClaim.bookie_phone ? `(${activeClaim.bookie_phone})` : ""}
                </b>
              </div>
            </div>

            <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claimed At</span>
              <b style={{ display: "block", fontSize: "14px", color: "var(--text)", marginTop: "4px" }}>
                {new Date(activeClaim.player_claimed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
              </b>
            </div>

            {!activeClaim.disbursed ? (
              <>
                <div style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                  💡 Check your WhatsApp or UPI app for the player's payment QR/UPI message, send the payout money, then click <b>Disbursed</b> below to mark it completed.
                </div>

                {disburseError && <p className="hg-sec-err">{disburseError}</p>}

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    disabled={disbursingId === activeClaim.prize_id}
                    onClick={() => handleDisbursePrize(activeClaim.game_id, activeClaim.prize_id)}
                    style={{
                      flex: "1 1 200px",
                      padding: "14px 20px",
                      background: "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)",
                      color: "#000",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "15px",
                      fontWeight: 800,
                      cursor: disbursingId === activeClaim.prize_id ? "not-allowed" : "pointer",
                      boxShadow: "0 4px 15px var(--accent-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    <Icon name="check" size={18} strokeWidth={2.6} />
                    {disbursingId === activeClaim.prize_id ? "Processing..." : "Disbursed"}
                  </button>

                  {activeClaim.bookie_phone && (
                    <a
                      href={`https://wa.me/${activeClaim.bookie_phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "14px 20px",
                        background: "#25D366",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        fontSize: "14px",
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px"
                      }}
                    >
                      <Icon name="phone" size={16} /> WhatsApp Agent
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="check" size={18} /> Prize Payout Disbursed ({new Date(activeClaim.disbursed_at || activeClaim.player_claimed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
