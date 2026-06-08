"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import type { AuthUser } from "@/lib/stores/authStore";

interface LedgerEntry { entry_id: number; transaction_type: string; amount: number; created_at: string; notes: string | null; }

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [msg, setMsg] = useState("");

  const loadLedger = () => {
    apiFetch<{ user: AuthUser }>("/api/auth/me").then((d) => setBalance(d.user?.current_balance ?? 0)).catch(() => {});
    apiFetch<LedgerEntry[]>("/api/wallet/ledger").then(setLedger).catch(() => {});
  };

  useEffect(() => { loadLedger(); }, []);

  const requestTopUp = async () => {
    if (!amount || !reference.trim()) return;
    setMsg("");
    try {
      const res = await apiFetch<{ request_id: string; recharge_wa_link: string | null }>(
        "/api/wallet/topup/request",
        {
          method: "POST",
          body: JSON.stringify({
            requested_amount: Number(amount),
            payment_reference: reference.trim(),
            payment_method: "UPI",
          }),
        }
      );
      if (res.recharge_wa_link) {
        window.open(res.recharge_wa_link, "_blank", "noopener,noreferrer");
        setMsg("Request sent — opening the Financial Officer's WhatsApp…");
      } else {
        setMsg("Request submitted. No Financial Officer is set yet — please contact an admin.");
      }
      setAmount(""); setReference("");
      loadLedger();
    } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Current Balance</p>
        <p className="font-display text-4xl font-black text-gold">₹{balance.toLocaleString()}</p>
      </div>

      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Request Top-up</h3>
        <div className="space-y-3">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (₹)" className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none font-mono" />
          <input value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Payment reference / UPI txn ID" className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none" />
          <button onClick={requestTopUp} disabled={!amount || !reference.trim()}
            className="w-full bg-gold text-forest font-black text-sm py-3 rounded-xl hover:bg-gold-light transition-all disabled:opacity-50">
            Request Top-up
          </button>
          {msg && <p className="text-xs text-success font-mono">{msg}</p>}
        </div>
      </div>

      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Transaction History</h3>
        <div className="space-y-2">
          {ledger.map((e) => (
            <div key={e.entry_id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <div>
                <p className="text-xs font-mono text-[#9ca3af]">{e.transaction_type}</p>
                {e.notes && <p className="text-[10px] text-[#6b7280]">{e.notes}</p>}
              </div>
              <span className={`font-mono font-bold text-sm ${e.transaction_type === "Credit" ? "text-success" : "text-danger"}`}>
                {e.transaction_type === "Credit" ? "+" : "-"}₹{e.amount}
              </span>
            </div>
          ))}
          {ledger.length === 0 && <p className="text-[#6b7280] text-xs">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
