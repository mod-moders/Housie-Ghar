"use client";
/** Financial Officer sections: split-view recharge queue + master bookie ledger. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { EmptyHint } from "@/components/ui";
import type { LedgerAgent, Settlement, SettleResponse } from "@/lib/types";

interface QueueItem {
  request_id: string;
  requested_amount: number;
  payment_reference: string;
  requested_at: string;
  agent: LedgerAgent;
}

export function FinanceHubSection({ onResolved }: { onResolved?: () => void }) {
  const [agents, setAgents] = useState<LedgerAgent[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="hg-sec">
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
                <span className="hg-avatar-lg">{active.agent.full_name[0]}</span>
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
    </div>
  );
}

export function MasterLedgerSection() {
  const [agents, setAgents] = useState<LedgerAgent[]>([]);

  useEffect(() => {
    apiFetch<LedgerAgent[]>("/api/wallet/master-ledger").then(setAgents).catch(() => {});
  }, []);

  const lowThreshold = 500;

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Macro-view of the entire sales force.</p>
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
                  <span className="hg-td-name"><span className="hg-avatar-sm">{b.full_name[0]}</span>{b.full_name}</span>
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
                    <span className="hg-avatar-sm">{r.agent_name[0]}</span>
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
