"use client";
/** Bookie (Agent) sections: live booking queue + wallet with recharge request. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSocket } from "@/lib/hooks/useSocket";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";
import type { MySettlementsResponse, QueueBooking, SkipAlert, WalletLedgerEntry } from "@/lib/types";
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
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTicker();

  const load = useCallback(() => {
    apiFetch<QueueBooking[]>("/api/bookings/agent/queue").then(setQueue).catch(() => {});
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
    </div>
  );
}

export function BookieWalletSection({ me }: { me: AuthUser }) {
  const [balance, setBalance] = useState(me.current_balance ?? 0);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [skips, setSkips] = useState<SkipAlert[]>([]);
  const [payouts, setPayouts] = useState<MySettlementsResponse | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [form, setForm] = useState({ amount: "", reference: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((res) => setBalance(res.user.current_balance ?? 0))
      .catch(() => {});
    apiFetch<WalletLedgerEntry[]>("/api/wallet/ledger").then(setLedger).catch(() => {});
    apiFetch<SkipAlert[]>("/api/bookings/agent/skip-alerts").then(setSkips).catch(() => {});
    apiFetch<MySettlementsResponse>("/api/settlements/mine").then(setPayouts).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useSocket(
    (event, data) => {
      if (event === "wallet_credited" || event === "wallet_debited") {
        const d = data as { new_balance?: number };
        if (typeof d?.new_balance === "number") setBalance(d.new_balance);
        load();
      }
      // A ticket you sold just won — prize money is owed to you.
      if (event === "booking_skipped" || event === "prize_owed") load();
    },
    { event: "join_agent_room", arg: me.user_id }
  );

  const owed = payouts?.settlements.filter((s) => s.status === "Owed") ?? [];

  const requestFunds = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ recharge_wa_link: string | null }>("/api/wallet/topup/request", {
        method: "POST",
        body: JSON.stringify({
          requested_amount: parseFloat(form.amount),
          payment_reference: form.reference.trim(),
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
    <div className="hg-sec">
      <div className="hg-wallet-card">
        <span className="hg-wallet-lbl">Digital wallet balance</span>
        <b className="hg-wallet-bal">{money(balance)}</b>
        {low && (
          <div className="hg-wallet-low">
            <Icon name="bell" size={13} /> Low balance — top up to keep receiving bookings.
          </div>
        )}
        <button className="hg-wallet-btn" onClick={() => setRequesting((r) => !r)}>
          <Icon name="chat" size={17} /> {sent ? "Request sent — opening WhatsApp…" : "Request funds from Financial Officer"}
        </button>
      </div>

      {requesting && (
        <div className="hg-form" style={{ maxWidth: 420 }}>
          <div className="hg-form-row">
            <label className="hg-form-field">
              <span>Amount (₹)</span>
              <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>UPI / payment reference</span>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </label>
          </div>
          {error && <p className="hg-sec-err">{error}</p>}
          <div className="hg-form-actions">
            <Button variant="ghost" size="sm" onClick={() => setRequesting(false)}>Cancel</Button>
            <Button
              variant="cta" size="sm"
              disabled={!form.amount || parseFloat(form.amount) <= 0 || !form.reference.trim()}
              onClick={requestFunds}
            >
              Send request
            </Button>
          </div>
        </div>
      )}

      {owed.length > 0 && payouts && (
        <div className="hg-owed-card">
          <div className="hg-owed-head">
            <Icon name="trophy" size={16} />
            <b>Prize money owed to you</b>
            <span className="hg-owed-total">{money(payouts.total_owed)}</span>
          </div>
          <p className="hg-owed-sub">
            Tickets you sold won these prizes. Pay each winner in cash, then claim it back —
            the Financial Officer credits your wallet once verified.
          </p>
          <div className="hg-owed-list">
            {owed.map((s) => (
              <div key={s.settlement_id} className="hg-owed-row">
                <span className="hg-owed-prize">{s.pattern_name}</span>
                <span className="hg-owed-meta">
                  {s.winner_housie_name ?? "winner"} · #{s.ticket_number} · {s.game_title}
                </span>
                <b className="hg-owed-amt">{money(s.amount)}</b>
              </div>
            ))}
          </div>
          {payouts.claim_wa_link && (
            <a className="hg-wa-btn hg-owed-claim" href={payouts.claim_wa_link} target="_blank" rel="noopener noreferrer">
              <Icon name="chat" size={17} /> Claim {money(payouts.total_owed)} on WhatsApp
            </a>
          )}
        </div>
      )}

      {skips.length > 0 && (
        <div className="hg-fomo">
          <Icon name="zap" size={15} />
          <div>
            <b>You missed {skips.length} booking{skips.length > 1 ? "s" : ""} today</b>
            <span>Your wallet was too low. Recharge to resume sales.</span>
          </div>
        </div>
      )}

      <div className="hg-panel" style={{ maxWidth: 420 }}>
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
  );
}
