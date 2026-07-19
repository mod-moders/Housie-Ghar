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
  const showRequestsTab = me.role_name === "Financial Admin" || me.role_name === "Superadmin";
  const [activeTab, setActiveTab] = useState<"analysis" | "ledgers" | "requests" | "claims">("claims");

  useEffect(() => {
    if (!showRequestsTab && (activeTab === "requests" || activeTab === "claims")) {
      setActiveTab("analysis");
    }
  }, [showRequestsTab, activeTab]);

  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prize claims states
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaimItem[]>([]);
  const [selClaimKey, setSelClaimKey] = useState<string | null>(null);
  const [disbursingId, setDisbursingId] = useState<number | null>(null);
  const [disburseError, setDisburseError] = useState<string | null>(null);

  // Analysis & Overview states
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [insights, setInsights] = useState<FinanceInsights | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

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
      event === "topup_request_received" || 
      event === "prize_claim_received" ||
      event === "wallet_credited" || 
      event === "wallet_debited" ||
      event === "ledger_update" ||
      event === "wallet_update"
    ) {
      load();
      loadStats();
      loadPrizeClaims();
    }
  });

  const activeClaim = useMemo(
    () => prizeClaims.find((c) => `${c.game_id}-${c.prize_id}` === selClaimKey) ?? prizeClaims[0],
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
      loadStats();
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
        {showRequestsTab && (
          <button
            onClick={() => setActiveTab("claims")}
            style={{
              background: activeTab === "claims" ? "var(--surface)" : "none",
              color: activeTab === "claims" ? "var(--accent)" : "var(--text-dim)",
              border: "none",
              outline: "none",
              boxShadow: "none",
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "12px",
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
            🏆 Prize Claim Requests
            {prizeClaims.length > 0 && (
              <span style={{
                background: "var(--accent)",
                color: "#000",
                fontSize: "10px",
                fontWeight: 800,
                padding: "2px 6px",
                borderRadius: "10px"
              }}>
                {prizeClaims.length}
              </span>
            )}
          </button>
        )}
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
            Recharge Requests ({queue.length})
          </button>
        )}
      </div>

      {activeTab === "claims" ? (
        <div className="hg-split" style={{ height: "calc(100% - 60px)" }}>
          {/* Left List: Pending Claims */}
          <div className="hg-split-l" style={{ width: "360px" }}>
            <div className="hg-split-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Prize Claim Requests</span>
              <span className="hg-q-count" style={{ background: prizeClaims.length > 0 ? "var(--accent)" : undefined, color: prizeClaims.length > 0 ? "#000" : undefined }}>
                {prizeClaims.length}
              </span>
            </div>
            {prizeClaims.length === 0 && (
              <EmptyHint icon="trophy" title="No Pending Claim Requests" sub="Player prize claims will appear here instantly when submitted." />
            )}
            {prizeClaims.map((c) => {
              const key = `${c.game_id}-${c.prize_id}`;
              const isActive = (activeClaim?.prize_id === c.prize_id && activeClaim?.game_id === c.game_id);
              return (
                <button
                  key={key}
                  className={`hg-q-card${isActive ? " is-active" : ""}`}
                  onClick={() => setSelClaimKey(key)}
                  style={{ textAlign: "left" }}
                >
                  <div className="hg-q-top">
                    <b>{c.winner_housie_name}</b>
                    <span className="hg-q-amt" style={{ color: "var(--accent)" }}>{money(c.amount)}</span>
                  </div>
                  <div className="hg-q-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                    <span>{c.pattern_name} {c.winner_ticket_number ? `(Tk #${c.winner_ticket_number})` : ""}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>
                      {c.player_claimed_at ? new Date(c.player_claimed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>
                    {c.game_title}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Panel: Claim Details & Disbursement */}
          <div className="hg-split-r" style={{ flex: 1 }}>
            {activeClaim ? (
              <>
                <div className="hg-detail-head" style={{ alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 800, fontSize: "18px" }}>
                    🏆
                  </div>
                  <div>
                    <b style={{ fontSize: "18px", color: "var(--text)" }}>{activeClaim.winner_housie_name}</b>
                    <span style={{ display: "block", color: "var(--text-dim)", fontSize: "12px", marginTop: "2px" }}>
                      Won {activeClaim.pattern_name} in "{activeClaim.game_title}"
                    </span>
                  </div>
                </div>

                <div className="hg-detail-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", margin: "20px 0" }}>
                  <div style={{ background: "var(--surface-2)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Prize Reward Amount</span>
                    <b style={{ display: "block", fontSize: "22px", color: "var(--accent)", marginTop: "2px" }}>{money(activeClaim.amount)}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Winning Pattern</span>
                    <b style={{ display: "block", fontSize: "16px", color: "var(--text)", marginTop: "4px" }}>{activeClaim.pattern_name}</b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Winning Ticket</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--text)", marginTop: "4px" }}>
                      {activeClaim.winner_ticket_number ? `Ticket #${activeClaim.winner_ticket_number}` : "Verified Win"}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Sold By Agent / Bookie</span>
                    <b style={{ display: "block", fontSize: "15px", color: "var(--cyan)", marginTop: "4px" }}>
                      {activeClaim.bookie_name} {activeClaim.bookie_phone ? `(${activeClaim.bookie_phone})` : ""}
                    </b>
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-light)", gridColumn: "span 2" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>Claimed At</span>
                    <b style={{ display: "block", fontSize: "14px", color: "var(--text)", marginTop: "2px" }}>
                      {new Date(activeClaim.player_claimed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                    </b>
                  </div>
                </div>

                <div className="hg-detail-note" style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "var(--text-dim)", padding: "14px", borderRadius: "10px", fontSize: "13px" }}>
                  💡 Check your WhatsApp or UPI app for the player's payment QR/UPI message, send the payout money, then click <b>Disburse Prize Payout</b> below to mark it completed.
                </div>

                {disburseError && <p className="hg-sec-err">{disburseError}</p>}

                <div className="hg-detail-actions" style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                  <button
                    className="hg-fin-approve"
                    disabled={disbursingId === activeClaim.prize_id}
                    onClick={() => handleDisbursePrize(activeClaim.game_id, activeClaim.prize_id)}
                    style={{
                      flex: 1,
                      padding: "14px 20px",
                      background: "linear-gradient(135deg, var(--accent) 0%, #ffe600 100%)",
                      color: "#000",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "15px",
                      fontWeight: 800,
                      cursor: disbursingId === activeClaim.prize_id ? "not-allowed" : "pointer"
                    }}
                  >
                    <Icon name="check" size={18} strokeWidth={2.6} />
                    {disbursingId === activeClaim.prize_id ? "Processing Disbursement..." : `Disburse Prize Payout ${money(activeClaim.amount)}`}
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
                        gap: "8px"
                      }}
                    >
                      <Icon name="phone" size={16} /> WhatsApp Agent
                    </a>
                  )}
                </div>
              </>
            ) : (
              <EmptyHint icon="trophy" title="Select a claim request" sub="Pick a pending prize claim from the left list to view winner details and disburse payout." />
            )}
          </div>
        </div>
      ) : activeTab === "requests" ? (
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
                  tone="good"
                />
                <EnhancedKpiCard
                  label="Tickets sold today"
                  value={(overview.tickets_sold_today ?? 0).toLocaleString("en-IN")}
                />
                <EnhancedKpiCard
                  label="Active games"
                  value={overview.active_games ?? 0}
                  sub={`${overview.scheduled_games ?? 0} scheduled`}
                />
                <EnhancedKpiCard
                  label="Pending topups"
                  value={overview.pending_topups ?? 0}
                  sub="Awaiting approval"
                  tone={overview.pending_topups > 0 ? "alert" : undefined}
                />
              </div>

              {/* Main Analytics Chart — real trailing-7-day series from
                  /api/stats/finance-insights, zero-filled while it loads. */}
              <AnalyticsChart series={insights?.series} />

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
                  value={money(overview.net_revenue ?? 0)}
                  sub="Net platform revenue realized"
                  tone="good"
                />
                <EnhancedKpiCard
                  label="Withdrawal Queue"
                  value={money(overview.pending_withdrawals ?? 0)}
                  sub="Awaiting CFO review"
                />
                <EnhancedKpiCard
                  label="Total Wallet Balances"
                  value={money(overview.wallet_balances ?? 0)}
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
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "4px" }}>Aggregate tickets sales value</span>
                  </div>

                  <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--card-shadow)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>Overall Profit</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "24px", color: "var(--accent)" }}>{money(analysis.overall_profit)}</strong>
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
                <HeatmapWidget hours={insights?.heatmap} />
                <RetentionWidget retention={insights?.retention} />
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
