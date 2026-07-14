"use client";
/**
 * Financial Officer sections. FinanceHubSection is tabbed: Housie Ghar
 * Analysis (real numbers from /api/stats/financial-analysis + /api/stats/overview),
 * Bookie Ledgers (the old master-ledger table, folded in), and Pending
 * Requests (the split-view recharge queue). PrizePayoutsSection stays its own
 * nav item — settling prize money is a distinct daily workflow.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyHint } from "@/components/ui";
import { BOOKIE_AVATAR } from "@/lib/roleAvatar";
import { AnalyticsChart, EnhancedKpiCard, HeatmapWidget, RetentionWidget } from "./AdminSections";
import type { DailyPoint, FinancialAnalysis, LedgerAgent, OverviewStats, Settlement, SettleResponse } from "@/lib/types";

interface QueueItem {
  request_id: string;
  requested_amount: number;
  payment_reference: string;
  requested_at: string;
  agent: LedgerAgent;
}

type HubTab = "analysis" | "ledgers" | "requests";

const LEDGER_GRID7 = "2fr 1fr 0.8fr 1fr 1fr 1fr 0.7fr";

// Real day-over-day delta from the daily series; undefined when yesterday has
// no baseline (avoids fabricating a percentage against zero).
function deltaFromDaily(daily: DailyPoint[] | undefined, key: "revenue" | "tickets") {
  if (!daily || daily.length < 2) return undefined;
  const today = daily[daily.length - 1][key];
  const yesterday = daily[daily.length - 2][key];
  if (yesterday <= 0) return undefined;
  const pct = ((today - yesterday) / yesterday) * 100;
  return { value: `${Math.abs(pct).toFixed(1)}%`, isPositive: pct >= 0 };
}

function HistCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: string; tone?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: 20, boxShadow: "var(--card-shadow-sm)" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", display: "block" }}>{label}</span>
      <strong style={{ fontSize: 24, color: tone ?? "var(--text)", display: "block", marginTop: 6 }}>{value}</strong>
      <span style={{ fontSize: 11, color: "var(--text-mute)", display: "block", marginTop: 4 }}>{sub}</span>
    </div>
  );
}

export function FinanceHubSection({ onResolved }: { onResolved?: () => void }) {
  const [activeTab, setActiveTab] = useState<HubTab>("analysis");
  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // setState only inside the promise chain (React Compiler rule); the spinner
  // is derived from data state below rather than a synchronously-set flag.
  useEffect(() => {
    if (activeTab !== "analysis") return;
    let alive = true;
    Promise.all([
      apiFetch<FinancialAnalysis>("/api/stats/financial-analysis"),
      apiFetch<OverviewStats>("/api/stats/overview"),
    ])
      .then(([finRes, ovRes]) => {
        if (!alive) return;
        setAnalysis(finRes);
        setOverview(ovRes);
      })
      .catch(() => { if (alive) setAnalysisFailed(true); });
    return () => { alive = false; };
  }, [activeTab]);

  const loadingAnalysis = activeTab === "analysis" && !analysis && !analysisFailed;

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
  const tabs: [HubTab, string][] = [
    ["analysis", "Housie Ghar Analysis"],
    ["ledgers", "Bookie Ledgers"],
    ["requests", `Pending Requests (${queue.length})`],
  ];

  return (
    <div className="hg-sec">
      <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", width: "fit-content", marginBottom: 4 }}>
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "var(--surface)" : "none",
              color: activeTab === tab ? "var(--cyan)" : "var(--text-dim)",
              border: "none",
              borderRadius: 6,
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "requests" ? (
        <div className="hg-split">
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
                  <Avatar src={BOOKIE_AVATAR} name={active.agent.full_name} size={44} />
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
        <div className="hg-panel">
          {agents.length === 0 ? (
            <EmptyHint icon="users" title="No bookies yet" sub="Bookie wallets appear here once accounts are created." />
          ) : (
            <div className="hg-table">
              <div className="hg-tr hg-tr-head">
                <span>Bookie</span><span>Balance</span><span>Lifetime top-ups</span><span>Last recharge</span><span>Trust</span>
              </div>
              {agents.map((b) => {
                const low = b.current_balance < lowThreshold;
                return (
                  <div key={b.agent_id} className="hg-tr">
                    <span className="hg-td-name"><Avatar src={BOOKIE_AVATAR} name={b.full_name} size={28} />{b.full_name}</span>
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
        /* ── Housie Ghar Analysis ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 32 }}>
          {loadingAnalysis && !analysis ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "64px 16px" }}>
              <span className="hg-poll-spin" />
            </div>
          ) : analysis && overview ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
                <EnhancedKpiCard
                  label="Gross revenue today"
                  value={money(overview.gross_revenue_today ?? 0)}
                  delta={deltaFromDaily(analysis.daily, "revenue")}
                  trendData={analysis.daily.map((d) => d.revenue)}
                  trendColor="var(--cyan)"
                  tone="good"
                />
                <EnhancedKpiCard
                  label="Tickets sold today"
                  value={(overview.tickets_sold_today ?? 0).toLocaleString("en-IN")}
                  delta={deltaFromDaily(analysis.daily, "tickets")}
                  trendData={analysis.daily.map((d) => d.tickets)}
                  trendColor="var(--accent)"
                />
                <EnhancedKpiCard
                  label="Active games"
                  value={overview.active_games ?? 0}
                  sub={`${overview.scheduled_games ?? 0} scheduled`}
                />
                <EnhancedKpiCard
                  label="Pending top-ups"
                  value={overview.pending_topups ?? 0}
                  sub="Awaiting approval"
                  tone={overview.pending_topups > 0 ? "alert" : undefined}
                />
              </div>

              <AnalyticsChart daily={analysis.daily} />

              <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: 24 }}>
                <h4 style={{ margin: "0 0 16px", fontSize: 16, fontFamily: "var(--font-head)", fontWeight: 700 }}>Overall Historical Analytics</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                  <HistCard label="Overall collection" value={money(analysis.overall_collection)} sub="Aggregate ticket sales value (completed games)" />
                  <HistCard label="Overall profit" value={money(analysis.overall_profit)} sub="Collections minus claimed prizes" tone="var(--accent)" />
                  <HistCard label="Overall margin" value={`${analysis.profit_margin.toFixed(1)}%`} sub="Return on total collections" tone="var(--cyan)" />
                  <HistCard label="Platform liability" value={money(analysis.wallet_balances)} sub="Deposits held in bookie wallets" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Ticket volume</span>
                    <strong style={{ fontSize: 20, display: "block", marginTop: 2 }}>{analysis.total_tickets_sold.toLocaleString("en-IN")}</strong>
                  </div>
                  <Icon name="ticket" size={24} style={{ color: "var(--text-mute)" }} />
                </div>
                <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Prize payouts given</span>
                    <strong style={{ fontSize: 20, display: "block", marginTop: 2 }}>{money(analysis.total_payouts)}</strong>
                  </div>
                  <Icon name="trophy" size={24} style={{ color: "var(--text-mute)" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", width: "100%" }}>
                <HeatmapWidget hourly={analysis.hourly_today} />
                <RetentionWidget retention={analysis.retention} />
              </div>

              <div className="hg-panel">
                <div className="hg-panel-head">
                  <h3>Games Performance Ledger</h3>
                </div>
                {analysis.recent_games.length === 0 ? (
                  <div style={{ padding: "32px 16px", textTransform: "uppercase", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
                    No completed games yet
                  </div>
                ) : (
                  <div className="hg-table" style={{ overflowX: "auto" }}>
                    <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: LEDGER_GRID7 }}>
                      <span>Game</span>
                      <span>Completed</span>
                      <span>Sold</span>
                      <span>Collection</span>
                      <span>Payouts</span>
                      <span>Net</span>
                      <span>Margin</span>
                    </div>
                    {analysis.recent_games.map((g) => (
                      <div key={g.game_id} className="hg-tr" style={{ gridTemplateColumns: LEDGER_GRID7 }}>
                        <span className="hg-td-name">{g.title}</span>
                        <span className="hg-dim">
                          {g.completed_at ? new Date(g.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                        </span>
                        <span>{g.tickets_sold}</span>
                        <strong style={{ fontFamily: "var(--font-mono)" }}>{money(g.gross_collection)}</strong>
                        <span className="hg-bad-amt">{money(g.payout)}</span>
                        <span style={{ color: g.net_profit >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          {money(g.net_profit)}
                        </span>
                        <span>
                          <span className="hg-pill hg-pill-trusted" style={{ minWidth: 48, textAlign: "center" }}>
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

type PayoutFilter = "Owed" | "Paid";

export function PrizePayoutsSection({ onSettled }: { onSettled?: () => void }) {
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [filter, setFilter] = useState<PayoutFilter>("Owed");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((f: PayoutFilter) => {
    apiFetch<Settlement[]>(`/api/settlements?status=${f}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const switchFilter = (f: PayoutFilter) => {
    if (f === filter) return;
    setRows(null);
    setFilter(f);
    setConfirmId(null);
    setError(null);
    setNote(null);
  };

  const settle = async (row: Settlement) => {
    if (busyId) return;
    setBusyId(row.settlement_id);
    setError(null);
    try {
      const res = await apiFetch<SettleResponse>(`/api/settlements/${row.settlement_id}/settle`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNote(`Paid ${money(res.settlement.amount)} to ${row.agent_name} · new balance ${money(res.new_balance)}`);
      setConfirmId(null);
      load(filter);
      onSettled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settlement failed");
      setConfirmId(null);
      load(filter); // race (already paid / not found) — refetch to reflect truth
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="hg-sec">
      <div className="hg-payouts-head">
        <p className="hg-sec-sub">
          Bookies pay winners in cash and claim it back over WhatsApp — verify the claim, then settle to credit their wallet.
        </p>
        <div className="hg-seg" role="tablist">
          <button className={`hg-seg-btn${filter === "Owed" ? " is-active" : ""}`} onClick={() => switchFilter("Owed")}>
            Owed{filter === "Owed" && rows && rows.length ? ` · ${rows.length}` : ""}
          </button>
          <button className={`hg-seg-btn${filter === "Paid" ? " is-active" : ""}`} onClick={() => switchFilter("Paid")}>
            Paid
          </button>
        </div>
      </div>

      {note && <p className="hg-payouts-note"><Icon name="check" size={15} strokeWidth={2.6} /> {note}</p>}
      {error && <p className="hg-sec-err">{error}</p>}

      <div className="hg-panel">
        {rows === null ? (
          <div className="hg-empty"><span className="hg-poll-spin" /></div>
        ) : rows.length === 0 ? (
          filter === "Owed" ? (
            <EmptyHint icon="trophy" title="All settled" sub="No prize payouts are owed right now." />
          ) : (
            <EmptyHint icon="trophy" title="No payouts yet" sub="Settled prizes will appear here." />
          )
        ) : (
          <div className="hg-table">
            <div className="hg-tr hg-tr-6 hg-tr-head">
              <span>Bookie</span><span>Prize</span><span>Winner</span><span>Ticket</span><span>Amount</span>
              <span>{filter === "Owed" ? "" : "Settled"}</span>
            </div>
            {rows.map((r) => {
              const confirming = confirmId === r.settlement_id;
              const busy = busyId === r.settlement_id;
              return (
                <div key={r.settlement_id} className="hg-tr hg-tr-6">
                  <span className="hg-td-name">
                    <Avatar src={BOOKIE_AVATAR} name={r.agent_name} size={28} />
                    <span>{r.agent_name}{r.agent_town ? <i className="hg-dim"> · {r.agent_town}</i> : null}</span>
                    {r.agent_wa_link && (
                      <a
                        className="hg-wa-chip"
                        href={r.agent_wa_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`WhatsApp ${r.agent_name}`}
                        aria-label={`WhatsApp ${r.agent_name}`}
                      >
                        <Icon name="chat" size={13} />
                      </a>
                    )}
                  </span>
                  <span>{r.pattern_name}</span>
                  <span>{r.winner_housie_name ?? "—"}</span>
                  <span className="hg-dim">#{r.ticket_number}</span>
                  <span>{money(r.amount)}</span>
                  <span>
                    {filter === "Paid" ? (
                      <span className="hg-dim">
                        {r.settled_at
                          ? new Date(r.settled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                          : "—"}
                      </span>
                    ) : confirming ? (
                      <span className="hg-settle-wrap">
                        <button className="hg-settle-btn is-confirm" disabled={busy} onClick={() => settle(r)}>
                          {busy ? "Paying…" : `Confirm ${money(r.amount)}`}
                        </button>
                        {!busy && (
                          <button className="hg-settle-cancel" aria-label="Cancel" onClick={() => setConfirmId(null)}>
                            <Icon name="x" size={14} strokeWidth={2.6} />
                          </button>
                        )}
                      </span>
                    ) : (
                      <button className="hg-settle-btn" disabled={!!busyId} onClick={() => setConfirmId(r.settlement_id)}>
                        Settle
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
