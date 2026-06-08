"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface Hud { total_liability: number; daily_gross_processed: number; pending_count: number; }
interface PendingReq { request_id: string; requested_amount: number; payment_reference: string; requested_at: string; }
interface LedgerRow {
  agent_id: string; full_name: string; phone: string; status: string;
  current_balance: number; lifetime_topups: number; last_recharge_at: string | null;
  pending_requests: PendingReq[];
}

const LOW_BALANCE = 500;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function FinancialHub() {
  const [hud, setHud] = useState<Hud | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adjustFor, setAdjustFor] = useState<LedgerRow | null>(null);

  const reload = useCallback(() => {
    apiFetch<Hud>("/api/wallet/hud").then(setHud).catch(() => {});
    apiFetch<LedgerRow[]>("/api/wallet/master-ledger").then(setLedger).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const pending = ledger.flatMap((l) => l.pending_requests.map((p) => ({ ...p, agent: l })));

  const approve = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/approve`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    reload();
  };
  const reject = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewer_notes: "Rejected by FO" }) }); }
    catch (e: any) { alert(e.message); }
    reload();
  };

  return (
    <div className="max-w-6xl">
      {/* HUD ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Platform Liability", value: hud ? inr(hud.total_liability) : "—", hint: "all bookie balances" },
          { label: "Daily Gross Processed", value: hud ? inr(hud.daily_gross_processed) : "—", hint: "credits approved today" },
          { label: "Pending Recharge Requests", value: hud ? String(hud.pending_count) : "—", hint: "awaiting your approval" },
        ].map((s) => (
          <div key={s.label} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{s.label}</p>
            <p className="font-display text-2xl font-black text-white mt-1">{s.value}</p>
            <p className="text-[10px] text-[#6b7280] mt-0.5">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recharge queue */}
        <div className="bg-bg2 border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Recharge Queue</p>
          {pending.length === 0 && <p className="text-[#6b7280] text-sm">No pending requests.</p>}
          {pending.map((p) => (
            <div key={p.request_id} className="border border-border rounded-xl p-3 mb-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white text-sm">{p.agent.full_name}</span>
                <span className="text-gold font-display font-black">{inr(p.requested_amount)}</span>
              </div>
              <p className="text-[11px] text-[#9ca3af] mt-1">
                wallet {inr(p.agent.current_balance)} · ref {p.payment_reference}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => approve(p.request_id)}
                  className="flex-1 bg-success text-white text-xs font-bold py-2 rounded-lg hover:opacity-90 transition-all">
                  Credit wallet
                </button>
                <button onClick={() => reject(p.request_id)}
                  className="flex-1 border border-danger/40 text-danger text-xs font-bold py-2 rounded-lg hover:bg-danger hover:text-white transition-all">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Master bookie ledger */}
        <div className="bg-bg2 border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Master Bookie Ledger</p>
          {ledger.map((l) => {
            const low = l.current_balance < LOW_BALANCE;
            const open = selected === l.agent_id;
            return (
              <div key={l.agent_id} className="border border-border rounded-xl mb-2 overflow-hidden">
                <button onClick={() => setSelected(open ? null : l.agent_id)}
                  className="w-full flex justify-between items-center p-3 hover:bg-bg transition-all">
                  <span className="font-semibold text-white text-sm">{l.full_name}</span>
                  <span className={`font-display font-black ${low ? "text-danger" : "text-white"}`}>
                    {inr(l.current_balance)}{low && " ⚠"}
                  </span>
                </button>
                {open && (
                  <div className="p-3 border-t border-border text-[11px] text-[#9ca3af] space-y-1">
                    <p>Lifetime top-ups: <span className="text-white">{inr(l.lifetime_topups)}</span></p>
                    <p>Last recharge: <span className="text-white">{l.last_recharge_at ? new Date(l.last_recharge_at).toLocaleDateString() : "—"}</span></p>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setAdjustFor(l)}
                        className="border border-border text-[#9ca3af] hover:text-white text-[11px] px-3 py-1.5 rounded-lg transition-all">
                        ⚙ Manual adjust
                      </button>
                      {low && l.phone && (
                        <a href={`https://wa.me/${l.phone.replace(/[^0-9+]/g, "")}?text=${encodeURIComponent(`Hi ${l.full_name}, your wallet is low (${inr(l.current_balance)}). Top up before the next game so you don't miss sales.`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="border border-gold/40 text-gold text-[11px] px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all">
                          WhatsApp top-up nudge
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {adjustFor && (
        <ManualAdjustModal agent={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); reload(); }} />
      )}
    </div>
  );
}

function ManualAdjustModal({ agent, onClose, onDone }: { agent: LedgerRow; onClose: () => void; onDone: () => void; }) {
  const [type, setType] = useState<"Credit" | "Debit">("Credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const valid = parseFloat(amount) > 0 && reason.trim().length >= 20;

  const submit = async () => {
    try {
      await apiFetch(`/api/wallet/agents/${agent.agent_id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ type, amount: parseFloat(amount), reason: reason.trim() }),
      });
      onDone();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-4">Manual Adjust — {agent.full_name}</p>
        <div className="flex gap-2 mb-3">
          {(["Credit", "Debit"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-all ${
                type === t ? (t === "Credit" ? "border-success/40 text-success bg-success/10" : "border-danger/40 text-danger bg-danger/10") : "border-border text-[#9ca3af]"
              }`}>
              {t}
            </button>
          ))}
        </div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount (₹)"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white mb-3" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Reason (required, min 20 chars)"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white mb-1" />
        <p className="text-[10px] text-[#6b7280] mb-3">{reason.trim().length}/20 — written to the audit log.</p>
        <div className="flex gap-2">
          <button onClick={submit} disabled={!valid}
            className="flex-1 bg-gold text-forest font-black text-xs py-2 rounded-lg disabled:opacity-40 transition-all">
            Apply
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-[#9ca3af] text-xs py-2 rounded-lg hover:text-white transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
