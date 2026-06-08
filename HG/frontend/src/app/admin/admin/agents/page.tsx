"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface PendingRequest { request_id: string; requested_amount: number; payment_reference: string; }
interface AgentWallet {
  agent_id: string; full_name: string; email: string; phone: string;
  status: string; current_balance: number; pending_requests: PendingRequest[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWallet[]>([]);

  const reload = () => {
    apiFetch<AgentWallet[]>("/api/wallet/agents").then(setAgents).catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const approve = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/approve`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    reload();
  };

  const reject = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/reject`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    reload();
  };

  return (
    <div className="max-w-3xl space-y-3">
      <h2 className="text-sm font-semibold text-white mb-3">Agents & Wallets</h2>
      {agents.length === 0 && <p className="text-[#6b7280] text-sm">No agents found.</p>}
      {agents.map((a) => (
        <div key={a.agent_id} className="bg-bg2 border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white text-sm">{a.full_name}</p>
              <p className="text-xs text-[#6b7280] font-mono">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="font-mono font-bold text-gold">₹{a.current_balance?.toLocaleString() ?? 0}</p>
              <p className={`text-[10px] font-mono ${a.status === "Active" ? "text-success" : "text-danger"}`}>{a.status}</p>
            </div>
          </div>

          {a.pending_requests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">Pending Top-ups</p>
              {a.pending_requests.map((r) => (
                <div key={r.request_id} className="flex items-center justify-between bg-bg3 rounded-xl px-3 py-2">
                  <div>
                    <p className="font-mono text-gold text-sm">₹{r.requested_amount.toLocaleString()}</p>
                    <p className="text-[10px] text-[#6b7280] font-mono">Ref: {r.payment_reference}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approve(r.request_id)}
                      className="text-[10px] bg-success/10 border border-success/30 text-success px-3 py-1.5 rounded-lg hover:bg-success hover:text-white transition-all">
                      Approve
                    </button>
                    <button onClick={() => reject(r.request_id)}
                      className="text-[10px] bg-danger/10 border border-danger/30 text-danger px-3 py-1.5 rounded-lg hover:bg-danger hover:text-white transition-all">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
