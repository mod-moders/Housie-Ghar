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

interface ConsolidatedClaimItem {
  claim_key: string;
  game_id: string;
  game_title: string;
  game_date: string;
  winner_housie_name: string;
  formatted_claim_id: string;
  prize_ids: number[];
  patterns: string[];
  pattern_details: string[];
  ticket_numbers: (number | null)[];
  total_amount: number;
  player_claimed_at: string;
  disbursed: boolean;
  disbursed_at?: string | null;
  bookie_name: string;
  bookie_phone: string;
}

interface PrizeClaimsResponse {
  active_claims: ConsolidatedClaimItem[];
  history_claims: ConsolidatedClaimItem[];
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

interface TopUpRequestItem {
  request_id: string;
  formatted_request_id: string;
  agent_id: string;
  agent_name: string;
  agent_phone: string;
  agent_town: string;
  amount: number;
  requested_amount: number;
  payable_amount: number;
  commission_percentage: number;
  payment_reference: string;
  payment_method?: string;
  proof_screenshot_url?: string | null;
  status: "Pending" | "Approved" | "Rejected";
  request_status: "Pending" | "Approved" | "Rejected";
  requested_at: string;
  reviewed_at?: string;
}

export function RechargeHubSection({ me, onResolved }: { me: AuthUser; onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<"requests" | "claims">("requests");
  const [rechargeSubTab, setRechargeSubTab] = useState<"active" | "history">("active");
  const [claimSubTab, setClaimSubTab] = useState<"active" | "history">("active");

  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [topups, setTopups] = useState<TopUpRequestItem[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prize claims states
  const [activeClaims, setActiveClaims] = useState<ConsolidatedClaimItem[]>([]);
  const [historyClaims, setHistoryClaims] = useState<ConsolidatedClaimItem[]>([]);
  const [selClaimKey, setSelClaimKey] = useState<string | null>(null);
  const [disbursingKey, setDisbursingKey] = useState<string | null>(null);
  const [disburseError, setDisburseError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  const loadTopups = useCallback(() => {
    apiFetch<TopUpRequestItem[]>("/api/wallet/pending-topups")
      .then((res) => {
        if (Array.isArray(res)) {
          setTopups(res);
        }
      })
      .catch(() => {});
  }, []);

  const loadPrizeClaims = useCallback(() => {
    apiFetch<PrizeClaimsResponse | ConsolidatedClaimItem[]>("/api/games/prize-claims")
      .then((res) => {
        if (res && typeof res === "object" && !Array.isArray(res) && "active_claims" in res) {
          setActiveClaims(res.active_claims || []);
          setHistoryClaims(res.history_claims || []);
        } else if (Array.isArray(res)) {
          const active = res.filter((c: any) => !c.disbursed);
          const hist = res.filter((c: any) => c.disbursed);
          setActiveClaims(active as any);
          setHistoryClaims(hist as any);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadTopups();
    loadPrizeClaims();
  }, [load, loadTopups, loadPrizeClaims]);

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
      loadTopups();
      loadPrizeClaims();
    }
  });

  const activeRecharges = useMemo(() => topups.filter((r) => (r.request_status || "Pending") === "Pending"), [topups]);
  const historyRecharges = useMemo(() => topups.filter((r) => r.request_status !== "Pending"), [topups]);

  const activeRecharge = useMemo(() => {
    if (selId) {
      const foundActive = activeRecharges.find((r) => r.request_id === selId);
      if (foundActive) return foundActive;
      const foundHist = historyRecharges.find((r) => r.request_id === selId);
      if (foundHist) return foundHist;
    }
    return activeRecharges[0] || historyRecharges[0] || null;
  }, [activeRecharges, historyRecharges, selId]);

  const activeClaim = useMemo(() => {
    if (selClaimKey) {
      const foundActive = activeClaims.find((c) => c.claim_key === selClaimKey);
      if (foundActive) return foundActive;
      const foundHist = historyClaims.find((c) => c.claim_key === selClaimKey);
      if (foundHist) return foundHist;
    }
    return activeClaims[0] || historyClaims[0] || null;
  }, [activeClaims, historyClaims, selClaimKey]);

  const resolveTopup = async (approve: boolean) => {
    if (!activeRecharge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/wallet/topup/${activeRecharge.request_id}/${approve ? "approve" : "reject"}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelId(null);
      loadTopups();
      load();
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDisburseConsolidated = async (gameId: string, winnerHousieName: string, prizeIds: number[]) => {
    if (disbursingKey !== null) return;
    const key = `${gameId}-${winnerHousieName}`;
    setDisbursingKey(key);
    setDisburseError(null);
    try {
      await apiFetch(`/api/games/${gameId}/disburse-consolidated`, {
        method: "POST",
        body: JSON.stringify({ winner_housie_name: winnerHousieName, prize_ids: prizeIds }),
      });
      loadPrizeClaims();
      setSelClaimKey(null);
      onResolved?.();
    } catch (e) {
      setDisburseError(e instanceof Error ? e.message : "Disbursement failed");
    } finally {
      setDisbursingKey(null);
    }
  };

  return (
    <div className="hg-sec" style={{ gap: "18px" }}>
      {/* Primary Top Tab Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)", width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
          {/* 1. Recharge Requests Tab */}
          <button
            onClick={() => { setActiveTab("requests"); setSelId(null); }}
            style={{
              background: activeTab === "requests" ? "var(--surface)" : "none",
              color: activeTab === "requests" ? "var(--cyan)" : "var(--text-dim)",
              border: "none",
              outline: "none",
              boxShadow: activeTab === "requests" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            ⚡ Recharge Requests
            <span style={{
              background: activeRecharges.length > 0 ? "var(--cyan)" : "var(--surface-2)",
              color: activeRecharges.length > 0 ? "#000" : "var(--text-dim)",
              fontSize: "11px",
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: "10px"
            }}>
              {activeRecharges.length}
            </span>
          </button>

          {/* 2. Claim Requests Tab */}
          <button
            onClick={() => { setActiveTab("claims"); setSelClaimKey(null); }}
            style={{
              background: activeTab === "claims" ? "var(--surface)" : "none",
              color: activeTab === "claims" ? "var(--accent)" : "var(--text-dim)",
              border: "none",
              outline: "none",
              boxShadow: activeTab === "claims" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            🏆 Claim Requests
            <span style={{
              background: activeClaims.length > 0 ? "var(--accent)" : "var(--surface-2)",
              color: activeClaims.length > 0 ? "#000" : "var(--text-dim)",
              fontSize: "11px",
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: "10px"
            }}>
              {activeClaims.length}
            </span>
          </button>
        </div>

        {/* Sub-filter Subtab toggles */}
        {activeTab === "requests" ? (
          <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
            <button
              onClick={() => setRechargeSubTab("active")}
              style={{
                background: rechargeSubTab === "active" ? "var(--surface)" : "transparent",
                color: rechargeSubTab === "active" ? "var(--cyan)" : "var(--text-dim)",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Active ({activeRecharges.length})
            </button>
            <button
              onClick={() => setRechargeSubTab("history")}
              style={{
                background: rechargeSubTab === "history" ? "var(--surface)" : "transparent",
                color: rechargeSubTab === "history" ? "var(--text)" : "var(--text-dim)",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              History ({historyRecharges.length})
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
            <button
              onClick={() => setClaimSubTab("active")}
              style={{
                background: claimSubTab === "active" ? "var(--surface)" : "transparent",
                color: claimSubTab === "active" ? "var(--accent)" : "var(--text-dim)",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Active Claims ({activeClaims.length})
            </button>
            <button
              onClick={() => setClaimSubTab("history")}
              style={{
                background: claimSubTab === "history" ? "var(--surface)" : "transparent",
                color: claimSubTab === "history" ? "#22c55e" : "var(--text-dim)",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Disbursed History ({historyClaims.length})
            </button>
          </div>
        )}
      </div>

      {/* ==========================================
          1. RECHARGE REQUESTS VIEW
         ========================================== */}
      {activeTab === "requests" ? (
        <div style={{ display: "flex", gap: "18px", flex: 1, minHeight: 0, overflow: "hidden", flexWrap: "wrap" }}>
          {/* Left Column: Active / History Recharge List */}
          <div style={{ flex: "0 0 350px", maxWidth: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                {rechargeSubTab === "active" ? "Active Recharge Requests" : "Recharge History"}
              </h3>
              <span className="hg-q-count" style={{ background: "var(--surface-2)", color: "var(--cyan)", fontWeight: 800, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                {rechargeSubTab === "active" ? activeRecharges.length : historyRecharges.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
              {(rechargeSubTab === "active" ? activeRecharges : historyRecharges).length === 0 ? (
                <EmptyHint
                  icon="check"
                  title={rechargeSubTab === "active" ? "No Active Recharge Requests" : "No Past Recharge History"}
                  sub={rechargeSubTab === "active" ? "Bookie wallet top-up requests will appear here immediately." : "Past approved or rejected recharges will show here."}
                />
              ) : (
                (rechargeSubTab === "active" ? activeRecharges : historyRecharges).map((r) => {
                  const isPending = (r.request_status || "Pending") === "Pending";
                  const isApproved = r.request_status === "Approved";
                  const isSelected = activeRecharge?.request_id === r.request_id;
                  return (
                    <button
                      key={r.request_id}
                      onClick={() => setSelId(r.request_id)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        background: isSelected ? "var(--surface-2)" : "transparent",
                        border: isSelected ? "1.5px solid var(--cyan)" : "1px solid var(--border-light)",
                        borderRadius: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 4px 12px rgba(6,182,212,0.15)" : "none",
                        opacity: isPending ? 1 : 0.85,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      {/* Top Row: Bookie Name + Recharge ID Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.agent_name}
                        </b>
                        <span style={{
                          background: isPending ? "rgba(6, 182, 212, 0.15)" : isApproved ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: isPending ? "var(--cyan)" : isApproved ? "#22c55e" : "#ef4444",
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          flexShrink: 0
                        }}>
                          {r.formatted_request_id}
                        </span>
                      </div>

                      {/* Amounts Row: Requested Amount & Payable Amount */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <b style={{ color: "var(--cyan)", fontWeight: 800, fontSize: "19px" }}>
                          {money(r.requested_amount)}
                        </b>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 600 }}>
                          Payable: <strong style={{ color: "var(--accent)" }}>{money(r.payable_amount)}</strong>
                        </span>
                      </div>

                      {/* Bottom Row: Reference & Date/Time */}
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", paddingTop: "6px", borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "170px" }}>
                          Ref: {r.payment_reference}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-mute)", flexShrink: 0 }}>
                          {new Date(r.requested_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Interactive View for Selected Recharge */}
          <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "24px", boxShadow: "var(--card-shadow)", overflowY: "auto" }}>
            {activeRecharge ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
                  <Avatar src={BOOKIE_AVATAR} name={activeRecharge.agent_name} className="hg-avatar-lg" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <b style={{ fontSize: "18px", color: "var(--text)" }}>{activeRecharge.agent_name}</b>
                      <span className="hg-pill hg-pill-cyan" style={{ fontSize: "11px" }}>{activeRecharge.formatted_request_id}</span>
                    </div>
                    <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                      {activeRecharge.agent_town || "Bookie"} {activeRecharge.agent_phone ? `· ${activeRecharge.agent_phone}` : ""}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requested Amount</span>
                    <b style={{ display: "block", fontSize: "22px", color: "var(--cyan)", marginTop: "2px" }}>{money(activeRecharge.requested_amount)}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payable Amount (After Comm)</span>
                    <b style={{ display: "block", fontSize: "22px", color: "var(--accent)", marginTop: "2px" }}>{money(activeRecharge.payable_amount)}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Commission Rate</span>
                    <b style={{ display: "block", fontSize: "16px", color: "var(--text)", marginTop: "4px" }}>{activeRecharge.commission_percentage}% per ticket</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment Reference</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px", wordBreak: "break-all" }}>{activeRecharge.payment_reference}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requested At</span>
                    <b style={{ display: "block", fontSize: "13.5px", color: "var(--text)", marginTop: "4px" }}>
                      {new Date(activeRecharge.requested_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Request Status</span>
                    <b style={{ display: "block", fontSize: "15px", color: activeRecharge.request_status === "Approved" ? "#22c55e" : activeRecharge.request_status === "Rejected" ? "#ef4444" : "#eab308", marginTop: "4px" }}>
                      {activeRecharge.request_status || "Pending"}
                    </b>
                  </div>
                </div>

                {/* Proof Screenshot if available */}
                {activeRecharge.proof_screenshot_url && (
                  <div style={{ background: "var(--surface-2)", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)", marginBottom: "20px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>Deposit Proof Screenshot</span>
                    <a href={activeRecharge.proof_screenshot_url} target="_blank" rel="noopener noreferrer">
                      <img src={activeRecharge.proof_screenshot_url} alt="Proof" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px", objectFit: "contain", border: "1px solid var(--border)" }} />
                    </a>
                  </div>
                )}

                {(activeRecharge.request_status || "Pending") === "Pending" ? (
                  <>
                    <div style={{ background: "rgba(6, 182, 212, 0.08)", border: "1px solid rgba(6, 182, 212, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                      💡 Check your UPI app/bank account for <b>{money(activeRecharge.payable_amount)}</b> deposit with reference <b>{activeRecharge.payment_reference}</b>, then click <b>Credit Wallet</b> below.
                    </div>

                    {error && <p className="hg-sec-err">{error}</p>}

                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "auto" }}>
                      <button className="hg-fin-approve" disabled={busy} onClick={() => resolveTopup(true)} style={{ flex: "1 1 200px", padding: "14px 20px" }}>
                        <Icon name="check" size={17} strokeWidth={2.6} /> Credit Wallet {money(activeRecharge.requested_amount)}
                      </button>
                      <button className="hg-fin-reject" disabled={busy} onClick={() => resolveTopup(false)} style={{ flex: "1 1 160px", padding: "14px 20px" }}>
                        <Icon name="x" size={17} strokeWidth={2.6} /> Reject / Dispute
                      </button>
                    </div>
                  </>
                ) : activeRecharge.request_status === "Approved" ? (
                  <div style={{ marginTop: "auto", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="check" size={18} /> Wallet Credited ({new Date(activeRecharge.reviewed_at || activeRecharge.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
                  </div>
                ) : (
                  <div style={{ marginTop: "auto", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="x" size={18} /> Recharge Rejected ({new Date(activeRecharge.reviewed_at || activeRecharge.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
                  </div>
                )}
              </>
            ) : (
              <EmptyHint icon="wallet" title="Select a recharge request" sub="Pick a pending or past recharge request from the left list to view complete details." />
            )}
          </div>
        </div>
      ) : (
        /* ==========================================
            2. CLAIM REQUESTS VIEW
           ========================================== */
        <div style={{ display: "flex", gap: "18px", flex: 1, minHeight: 0, overflow: "hidden", flexWrap: "wrap" }}>
          {/* Left Column: Active / Disbursed Claim List */}
          <div style={{ flex: "0 0 350px", maxWidth: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                {claimSubTab === "active" ? "Active Claim Requests" : "Disbursed History (2 Days)"}
              </h3>
              <span className="hg-q-count" style={{ background: "var(--surface-2)", color: "var(--accent)", fontWeight: 800, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                {claimSubTab === "active" ? activeClaims.length : historyClaims.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
              {(claimSubTab === "active" ? activeClaims : historyClaims).length === 0 ? (
                <EmptyHint
                  icon="trophy"
                  title={claimSubTab === "active" ? "No Active Claims" : "No Disbursed Claims in 2 Days"}
                  sub={claimSubTab === "active" ? "Consolidated claim requests will appear here immediately when submitted." : "Claims disbursed in the past 48 hours will show here."}
                />
              ) : (
                (claimSubTab === "active" ? activeClaims : historyClaims).map((c) => {
                  const isSelected = activeClaim?.claim_key === c.claim_key;
                  const isDisbursed = c.disbursed;
                  return (
                    <button
                      key={c.claim_key}
                      onClick={() => setSelClaimKey(c.claim_key)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        background: isSelected ? "var(--surface-2)" : "transparent",
                        border: isSelected ? `1.5px solid ${isDisbursed ? "#22c55e" : "var(--accent)"}` : "1px solid var(--border-light)",
                        borderRadius: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 4px 12px var(--accent-soft)" : "none",
                        opacity: isDisbursed ? 0.85 : 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      {/* Row 1: Housie Name + Claim ID Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.winner_housie_name}
                        </b>
                        <span style={{
                          background: isDisbursed ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                          color: isDisbursed ? "#22c55e" : "#eab308",
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: "5px",
                          flexShrink: 0
                        }}>
                          {c.formatted_claim_id}
                        </span>
                      </div>

                      {/* Row 2: Total Amount Won */}
                      <b style={{ color: isDisbursed ? "#22c55e" : "var(--accent)", fontWeight: 800, fontSize: "19px" }}>
                        {money(c.total_amount)}
                      </b>

                      {/* Row 3: List of Prizes Won with Respective Ticket Numbers */}
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", paddingTop: "6px", borderTop: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.pattern_details.join(", ")}
                        </div>
                        <div style={{ color: "var(--text-mute)", fontSize: "10px", display: "flex", justifyContent: "space-between" }}>
                          <span>{c.game_title}</span>
                          <span>{c.player_claimed_at ? new Date(c.player_claimed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed View for Selected Claim Request */}
          <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "24px", boxShadow: "var(--card-shadow)", overflowY: "auto" }}>
            {activeClaim ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: activeClaim.disbursed ? "rgba(34, 197, 94, 0.2)" : "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: activeClaim.disbursed ? "#22c55e" : "#000", fontWeight: 800, fontSize: "20px", flexShrink: 0 }}>
                    🏆
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <b style={{ fontSize: "18px", color: "var(--text)" }}>{activeClaim.winner_housie_name}</b>
                      <span className="hg-pill hg-pill-accent" style={{ fontSize: "11px" }}>{activeClaim.formatted_claim_id}</span>
                    </div>
                    <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                      Consolidated Claim in "{activeClaim.game_title}"
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Amount Won</span>
                    <b style={{ display: "block", fontSize: "22px", color: activeClaim.disbursed ? "#22c55e" : "var(--accent)", marginTop: "2px" }}>{money(activeClaim.total_amount)}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claim ID</span>
                    <b style={{ display: "block", fontSize: "16px", color: "var(--cyan)", marginTop: "4px" }}>{activeClaim.formatted_claim_id}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Won Patterns ({activeClaim.patterns.length})</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                      {activeClaim.patterns.join(", ")}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Winning Tickets</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                      {activeClaim.ticket_numbers.length > 0 ? activeClaim.ticket_numbers.map(n => `Ticket #${n}`).join(", ") : "Verified Wins"}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sold By Agent / Bookie</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--cyan)", marginTop: "4px" }}>
                      {activeClaim.bookie_name} {activeClaim.bookie_phone ? `(${activeClaim.bookie_phone})` : ""}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claimed Date & Time</span>
                    <b style={{ display: "block", fontSize: "13.5px", color: "var(--text)", marginTop: "4px" }}>
                      {new Date(activeClaim.player_claimed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                    </b>
                  </div>
                </div>

                {/* List of Prizes Breakdown Table */}
                <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)", marginBottom: "20px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px", fontWeight: 700 }}>
                    Prizes Won Breakdown
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {activeClaim.pattern_details.map((detail, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text)", padding: "6px 10px", background: "var(--surface)", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                        <span>🏆 {detail}</span>
                        <strong style={{ color: "var(--accent)" }}>Verified</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {!activeClaim.disbursed ? (
                  <>
                    <div style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                      💡 Check your WhatsApp or UPI app for the player's payment QR/UPI message, send the consolidated payout of <b>{money(activeClaim.total_amount)}</b>, then click <b>Confirm Disbursal</b> below to complete payout.
                    </div>

                    {disburseError && <p className="hg-sec-err">{disburseError}</p>}

                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "auto" }}>
                      <button
                        disabled={disbursingKey === activeClaim.claim_key}
                        onClick={() => handleDisburseConsolidated(activeClaim.game_id, activeClaim.winner_housie_name, activeClaim.prize_ids)}
                        style={{
                          flex: "1 1 220px",
                          padding: "14px 20px",
                          background: "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)",
                          color: "#000",
                          border: "none",
                          borderRadius: "10px",
                          fontSize: "15px",
                          fontWeight: 800,
                          cursor: disbursingKey === activeClaim.claim_key ? "not-allowed" : "pointer",
                          boxShadow: "0 4px 15px var(--accent-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px"
                        }}
                      >
                        <Icon name="check" size={18} strokeWidth={2.6} />
                        {disbursingKey === activeClaim.claim_key ? "Processing..." : `Confirm Disbursal (${money(activeClaim.total_amount)})`}
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
                  <div style={{ marginTop: "auto", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="check" size={18} /> Consolidated Payout Disbursed ({new Date(activeClaim.disbursed_at || activeClaim.player_claimed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
                  </div>
                )}
              </>
            ) : (
              <EmptyHint icon="trophy" title="Select a claim request" sub="Pick a pending or past consolidated claim request from the left list to view complete details." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
