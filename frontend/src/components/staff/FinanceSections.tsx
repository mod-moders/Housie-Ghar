"use client";
/** Financial Officer sections: split-view recharge queue + master bookie ledger + Housie Ghar Analysis. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money, moneyStr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { EmptyHint, Avatar } from "@/components/ui";
import { BOOKIE_AVATAR } from "@/lib/roleAvatar";
import type { LedgerAgent } from "@/lib/types";
import { AnalyticsChart, HeatmapWidget, RetentionWidget } from "./AdminSections";
import type { PerformanceSeries, HeatmapHour, RetentionData } from "./AdminSections";
import type { AuthUser } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";

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
  prize_breakdown?: Array<{
    pattern_name: string;
    ticket_number: number | null;
    amount: number;
  }>;
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

export function FinanceHubSection({}: { me: AuthUser; onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<"analysis" | "ledgers">("analysis");

  const [agents, setAgents] = useState<LedgerAgent[]>([]);

  // Analysis & Overview states
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [insights, setInsights] = useState<FinanceInsights | null>(null);
  // Seeded from the tab that is open on mount, so the effect below never has to
  // flip it synchronously on the very first render.
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load financial analysis & overview stats when tab is switched or via socket
  const loadStats = useCallback((showSpinner = true) => {
    if (activeTab === "analysis") {
      if (showSpinner) setLoadingAnalysis(true);
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
    // Pass showSpinner=false: on mount loadingAnalysis is already true, and on a tab
    // switch the tab button itself is the user-visible trigger. Either way no state
    // is actually set here — the rule just cannot evaluate the default parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats(false);
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
          onClick={() => {
            // Show the spinner from the click, not from the effect, so returning to
            // this tab looks exactly as it did before.
            if (activeTab !== "analysis") setLoadingAnalysis(true);
            setActiveTab("analysis");
          }}
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
                    <div className="hg-tr hg-tr-fin-games hg-tr-head">
                      <span>Game Title</span>
                      <span>Completed Date</span>
                      <span>Tickets Sold</span>
                      <span>Collection</span>
                      <span>Payout</span>
                      <span>Net Profit</span>
                      <span>Margin</span>
                    </div>
                    {analysis.recent_games.map((g: GameBreakdown) => (
                      <div key={g.game_id} className="hg-tr hg-tr-fin-games">
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

export function RechargeHubSection({ onResolved }: { me: AuthUser; onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<"requests" | "claims">("requests");

  const [, setAgents] = useState<LedgerAgent[]>([]);
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
    apiFetch<TopUpRequestItem[]>("/api/wallet/topup/pending")
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
          setActiveClaims(res.filter((c) => !c.disbursed));
          setHistoryClaims(res.filter((c) => c.disbursed));
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

  const selectedRecharge = useMemo(() => {
    if (!selId) return null;
    return topups.find((r) => r.request_id === selId) || null;
  }, [topups, selId]);

  const selectedClaim = useMemo(() => {
    if (!selClaimKey) return null;
    return activeClaims.find((c) => c.claim_key === selClaimKey) || historyClaims.find((c) => c.claim_key === selClaimKey) || null;
  }, [activeClaims, historyClaims, selClaimKey]);

  const resolveTopup = async (approve: boolean) => {
    if (!selectedRecharge || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/wallet/topup/${selectedRecharge.request_id}/${approve ? "approve" : "reject"}`, {
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
            Recharge Requests ({activeRecharges.length})
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
            Claim Requests ({activeClaims.length})
          </button>
        </div>
      </div>

      {/* ==========================================
          1. RECHARGE REQUESTS VIEW
         ========================================== */}
      {activeTab === "requests" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Recharge Requests</h3>
              <span className="hg-q-count" style={{ background: activeRecharges.length > 0 ? "var(--cyan)" : "var(--surface-2)", color: activeRecharges.length > 0 ? "#000" : "var(--text-dim)", fontWeight: 800, fontSize: "12px", padding: "2px 8px", borderRadius: "10px" }}>
                {activeRecharges.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", paddingRight: "4px" }}>
              {/* SECTION 1: REQUESTS RECEIVED */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Requests Received ({activeRecharges.length})
                  </span>
                </div>
                {activeRecharges.length === 0 ? (
                  <EmptyHint icon="check" title="No Active Recharge Requests" sub="Bookie top-up requests will appear here instantly when submitted." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {activeRecharges.map((r) => (
                      <button
                        key={r.request_id}
                        onClick={() => setSelId(r.request_id)}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.agent_name}</b>
                          <span style={{ background: "rgba(6, 182, 212, 0.15)", color: "var(--cyan)", fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "5px", flexShrink: 0 }}>
                            {r.formatted_request_id}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <b style={{ color: "var(--cyan)", fontWeight: 800, fontSize: "20px" }}>{money(r.requested_amount)}</b>
                          <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 600 }}>
                            Payable: <strong style={{ color: "var(--accent)" }}>{money(r.payable_amount)}</strong>
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)", paddingTop: "6px", borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>Ref: {r.payment_reference}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-mute)", flexShrink: 0 }}>{new Date(r.requested_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: PAST HISTORY (2 DAYS) */}
              <div style={{ paddingTop: "14px", borderTop: "1px dashed var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Icon name="clock" size={13} /> Past History (2 Days) ({historyRecharges.length})
                  </span>
                </div>
                {historyRecharges.length === 0 ? (
                  <EmptyHint icon="check" title="No History in 2 Days" sub="Approved or rejected recharges from the past 48 hours will show here." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {historyRecharges.map((r) => {
                      const isApproved = r.request_status === "Approved";
                      return (
                        <button
                          key={r.request_id}
                          onClick={() => setSelId(r.request_id)}
                          style={{
                            width: "100%",
                            padding: "14px 16px",
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-light)",
                            borderRadius: "12px",
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            opacity: 0.85,
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                            <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.agent_name}</b>
                            <span style={{ background: isApproved ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)", color: isApproved ? "#22c55e" : "#ef4444", fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "5px", flexShrink: 0 }}>
                              {isApproved ? "APPROVED" : "REJECTED"}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <b style={{ color: isApproved ? "#22c55e" : "#ef4444", fontWeight: 800, fontSize: "20px" }}>{money(r.requested_amount)}</b>
                            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 600 }}>
                              Payable: {money(r.payable_amount)}
                            </span>
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", paddingTop: "6px", borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>Ref: {r.payment_reference}</span>
                            <span style={{ fontSize: "10px", color: "var(--text-mute)", flexShrink: 0 }}>
                              {new Date(r.reviewed_at || r.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==========================================
            2. CLAIM REQUESTS VIEW
           ========================================== */
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px", boxShadow: "var(--card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", paddingBottom: "10px", borderBottom: "1px solid var(--border-light)" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Claim Requests</h3>
              <span className="hg-q-count" style={{ background: activeClaims.length > 0 ? "var(--accent)" : "var(--surface-2)", color: activeClaims.length > 0 ? "#000" : "var(--text-dim)", fontWeight: 800, fontSize: "12px", padding: "2px 8px", borderRadius: "10px" }}>
                {activeClaims.length}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", paddingRight: "4px" }}>
              {/* SECTION 1: CLAIMS RECEIVED */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Claims Received ({activeClaims.length})
                  </span>
                </div>
                {activeClaims.length === 0 ? (
                  <EmptyHint icon="trophy" title="No Active Claims" sub="Consolidated claim requests will appear here instantly when submitted." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {activeClaims.map((c) => (
                      <button
                        key={c.claim_key}
                        onClick={() => setSelClaimKey(c.claim_key)}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.winner_housie_name}</b>
                          <span style={{ background: "rgba(234, 179, 8, 0.15)", color: "#eab308", fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>
                            {c.formatted_claim_id}
                          </span>
                        </div>
                        <b style={{ color: "var(--accent)", fontWeight: 800, fontSize: "20px" }}>{money(c.total_amount)}</b>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.pattern_details.join(", ")}
                          </div>
                          <div style={{ color: "var(--text-mute)", fontSize: "10px", display: "flex", justifyContent: "space-between" }}>
                            <span>{c.game_title}</span>
                            <span>{c.player_claimed_at ? new Date(c.player_claimed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: PAST CLAIM REQUEST HISTORY (PAST 2 DAYS) */}
              <div style={{ paddingTop: "14px", borderTop: "1px dashed var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Icon name="clock" size={13} /> Past History (2 Days) ({historyClaims.length})
                  </span>
                </div>
                {historyClaims.length === 0 ? (
                  <EmptyHint icon="check" title="No History in 2 Days" sub="Disbursed claims from the past 48 hours will show here." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {historyClaims.map((c) => (
                      <button
                        key={c.claim_key}
                        onClick={() => setSelClaimKey(c.claim_key)}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          opacity: 0.85,
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <b style={{ color: "var(--text)", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.winner_housie_name}</b>
                          <span style={{ background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>
                            DISBURSED
                          </span>
                        </div>
                        <b style={{ color: "#22c55e", fontWeight: 800, fontSize: "20px" }}>{money(c.total_amount)}</b>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.pattern_details.join(", ")}
                          </div>
                          <div style={{ color: "var(--text-mute)", fontSize: "10px", display: "flex", justifyContent: "space-between" }}>
                            <span>{c.game_title}</span>
                            <span>{c.disbursed_at ? new Date(c.disbursed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          RECHARGE REQUEST DETAILS MODAL POPUP
         ========================================== */}
      {selectedRecharge && (
        <div
          className="hg-modal-scrim"
          onClick={() => setSelId(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
        >
          <div
            className="hg-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              position: "relative",
              padding: "24px",
              borderRadius: "16px",
              background: "var(--surface)",
              border: "1.5px solid var(--card-line)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelId(null)}
              aria-label="Close modal"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-light)",
                cursor: "pointer",
                color: "var(--text-dim)",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10
              }}
            >
              <Icon name="x" size={18} strokeWidth={2.5} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <Avatar src={BOOKIE_AVATAR} name={selectedRecharge.agent_name} className="hg-avatar-lg" />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <b style={{ fontSize: "18px", color: "var(--text)" }}>{selectedRecharge.agent_name}</b>
                  <span className="hg-pill hg-pill-cyan" style={{ fontSize: "11px" }}>{selectedRecharge.formatted_request_id}</span>
                </div>
                <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                  {selectedRecharge.agent_town || "Bookie"} {selectedRecharge.agent_phone ? `· ${selectedRecharge.agent_phone}` : ""}
                </span>
              </div>
            </div>

            {/* Details Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requested Amount</span>
                <b style={{ display: "block", fontSize: "22px", color: "var(--cyan)", marginTop: "2px" }}>{money(selectedRecharge.requested_amount)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payable Amount (After Comm)</span>
                <b style={{ display: "block", fontSize: "22px", color: "var(--accent)", marginTop: "2px" }}>{money(selectedRecharge.payable_amount)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Commission Rate</span>
                <b style={{ display: "block", fontSize: "16px", color: "var(--text)", marginTop: "4px" }}>{selectedRecharge.commission_percentage}% per ticket</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment Reference</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px", wordBreak: "break-all" }}>{selectedRecharge.payment_reference}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requested At</span>
                <b style={{ display: "block", fontSize: "13.5px", color: "var(--text)", marginTop: "4px" }}>
                  {new Date(selectedRecharge.requested_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Request Status</span>
                <b style={{ display: "block", fontSize: "15px", color: selectedRecharge.request_status === "Approved" ? "#22c55e" : selectedRecharge.request_status === "Rejected" ? "#ef4444" : "#eab308", marginTop: "4px" }}>
                  {selectedRecharge.request_status || "Pending"}
                </b>
              </div>
            </div>

            {/* Proof Screenshot if available */}
            {selectedRecharge.proof_screenshot_url && (
              <div style={{ background: "var(--surface-2)", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)", marginBottom: "20px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>Deposit Proof Screenshot</span>
                <a href={selectedRecharge.proof_screenshot_url} target="_blank" rel="noopener noreferrer">
                  {/* Payment proof is a user upload on an arbitrary host with no known
                      intrinsic size, so next/image would need remotePatterns plus a
                      width we do not have. A plain img is correct here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedRecharge.proof_screenshot_url} alt="Proof" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px", objectFit: "contain", border: "1px solid var(--border)" }} />
                </a>
              </div>
            )}

            {(selectedRecharge.request_status || "Pending") === "Pending" ? (
              <>
                <div style={{ background: "rgba(6, 182, 212, 0.08)", border: "1px solid rgba(6, 182, 212, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                  💡 Check your UPI app/bank account for <b>{money(selectedRecharge.payable_amount)}</b> deposit with reference <b>{selectedRecharge.payment_reference}</b>, then click <b>Credit Wallet</b> below.
                </div>

                {error && <p className="hg-sec-err">{error}</p>}

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
                  <button className="hg-fin-approve" disabled={busy} onClick={() => resolveTopup(true)} style={{ flex: "1 1 200px", padding: "14px 20px" }}>
                    <Icon name="check" size={17} strokeWidth={2.6} /> Credit Wallet {moneyStr(selectedRecharge.requested_amount)}
                  </button>
                  <button className="hg-fin-reject" disabled={busy} onClick={() => resolveTopup(false)} style={{ flex: "1 1 160px", padding: "14px 20px" }}>
                    <Icon name="x" size={17} strokeWidth={2.6} /> Reject / Dispute
                  </button>
                </div>
              </>
            ) : selectedRecharge.request_status === "Approved" ? (
              <div style={{ marginTop: "16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="check" size={18} /> Wallet Credited ({new Date(selectedRecharge.reviewed_at || selectedRecharge.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            ) : (
              <div style={{ marginTop: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="x" size={18} /> Recharge Rejected ({new Date(selectedRecharge.reviewed_at || selectedRecharge.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          CLAIM REQUEST DETAILS MODAL POPUP
         ========================================== */}
      {selectedClaim && (
        <div
          className="hg-modal-scrim"
          onClick={() => setSelClaimKey(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
        >
          <div
            className="hg-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              position: "relative",
              padding: "24px",
              borderRadius: "16px",
              background: "var(--surface)",
              border: "1.5px solid var(--card-line)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelClaimKey(null)}
              aria-label="Close modal"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-light)",
                cursor: "pointer",
                color: "var(--text-dim)",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10
              }}
            >
              <Icon name="x" size={18} strokeWidth={2.5} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingBottom: "16px", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: selectedClaim.disbursed ? "rgba(34, 197, 94, 0.2)" : "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: selectedClaim.disbursed ? "#22c55e" : "#000", fontWeight: 800, fontSize: "20px", flexShrink: 0 }}>
                🏆
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <b style={{ fontSize: "18px", color: "var(--text)" }}>{selectedClaim.winner_housie_name}</b>
                  <span className="hg-pill hg-pill-accent" style={{ fontSize: "11px" }}>{selectedClaim.formatted_claim_id}</span>
                </div>
                <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                  Consolidated Claim in &ldquo;{selectedClaim.game_title}&rdquo;
                </span>
              </div>
            </div>

            {/* Details Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Amount Won</span>
                <b style={{ display: "block", fontSize: "22px", color: selectedClaim.disbursed ? "#22c55e" : "var(--accent)", marginTop: "2px" }}>{money(selectedClaim.total_amount)}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claim ID</span>
                <b style={{ display: "block", fontSize: "16px", color: "var(--cyan)", marginTop: "4px" }}>{selectedClaim.formatted_claim_id}</b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Won Patterns ({selectedClaim.patterns.length})</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                  {selectedClaim.patterns.join(", ")}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Winning Tickets</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                  {selectedClaim.ticket_numbers.length > 0 ? selectedClaim.ticket_numbers.map(n => `Ticket #${n}`).join(", ") : "Verified Wins"}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sold By Agent / Bookie</span>
                <b style={{ display: "block", fontSize: "15px", color: "var(--cyan)", marginTop: "4px" }}>
                  {selectedClaim.bookie_name} {selectedClaim.bookie_phone ? `(${selectedClaim.bookie_phone})` : ""}
                </b>
              </div>
              <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claimed Date & Time</span>
                <b style={{ display: "block", fontSize: "13.5px", color: "var(--text)", marginTop: "4px" }}>
                  {new Date(selectedClaim.player_claimed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                </b>
              </div>
            </div>

            {/* List of Prizes Breakdown Table */}
            <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border-light)", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "10px", fontWeight: 700 }}>
                Prizes Won Breakdown
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {selectedClaim.prize_breakdown && selectedClaim.prize_breakdown.length > 0 ? (
                  selectedClaim.prize_breakdown.map((item, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        fontSize: "13px", 
                        color: "var(--text)", 
                        padding: "10px 14px", 
                        background: "var(--surface)", 
                        borderRadius: "8px", 
                        border: "1px solid var(--border-light)" 
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 700 }}>{item.pattern_name}</span>
                        {item.ticket_number && (
                          <span style={{ fontSize: "11px", color: "var(--text-dim)", background: "var(--surface-2)", padding: "2px 7px", borderRadius: "4px", fontWeight: 600 }}>
                            Tk #{item.ticket_number}
                          </span>
                        )}
                      </div>
                      <strong style={{ color: "var(--text)", fontWeight: 800, fontSize: "14px" }}>
                        {money(item.amount)}
                      </strong>
                    </div>
                  ))
                ) : (
                  selectedClaim.pattern_details.map((detail, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text)", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                      <span>{detail}</span>
                      <strong style={{ color: "var(--accent)" }}>Verified</strong>
                    </div>
                  ))
                )}

                {/* Consolidated Total Payable Amount Summary Row */}
                <div 
                  style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    padding: "12px 14px", 
                    marginTop: "4px", 
                    background: "rgba(244, 201, 93, 0.08)", 
                    border: "1.5px solid var(--accent)", 
                    borderRadius: "8px" 
                  }}
                >
                  <span style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Total Payable Amount
                  </span>
                  <strong style={{ fontSize: "18px", fontWeight: 800, color: "var(--accent)" }}>
                    {money(selectedClaim.total_amount)}
                  </strong>
                </div>
              </div>
            </div>

            {!selectedClaim.disbursed ? (
              <>
                <div style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginBottom: "20px" }}>
                  💡 Check your WhatsApp or UPI app for the player&rsquo;s payment QR/UPI message, send the consolidated payout of <b>{money(selectedClaim.total_amount)}</b>, then click <b>Confirm Disbursal</b> below to complete payout.
                </div>

                {disburseError && <p className="hg-sec-err">{disburseError}</p>}

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
                  <button
                    disabled={disbursingKey === selectedClaim.claim_key}
                    onClick={() => handleDisburseConsolidated(selectedClaim.game_id, selectedClaim.winner_housie_name, selectedClaim.prize_ids)}
                    style={{
                      flex: "1 1 220px",
                      padding: "14px 20px",
                      background: "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)",
                      color: "#000",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "15px",
                      fontWeight: 800,
                      cursor: disbursingKey === selectedClaim.claim_key ? "not-allowed" : "pointer",
                      boxShadow: "0 4px 15px var(--accent-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    <Icon name="check" size={18} strokeWidth={2.6} />
                    {disbursingKey === selectedClaim.claim_key ? "Processing..." : `Confirm Disbursal (${moneyStr(selectedClaim.total_amount)})`}
                  </button>

                  {selectedClaim.bookie_phone && (
                    <a
                      href={`https://wa.me/${selectedClaim.bookie_phone.replace(/\D/g, '')}`}
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
              <div style={{ marginTop: "16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="check" size={18} /> Consolidated Payout Disbursed ({new Date(selectedClaim.disbursed_at || selectedClaim.player_claimed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
