"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import FinancialHub from "./FinancialHub";

interface Game { game_id: string; title: string; scheduled_at: string; game_status: string; fill_percentage: number; sold_count: number; total_tickets: number; }
interface Agent { agent_id: string; full_name: string; current_balance: number; status: string; }
interface TopUpRequest { request_id: string; agent_name: string; amount: number; status: string; }

export default function AdminDashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [topUps, setTopUps] = useState<TopUpRequest[]>([]);
  const [tab, setTab] = useState<"games" | "agents" | "topups">("games");
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    apiFetch<Game[]>("/api/games").then(setGames).catch(() => {});
    apiFetch<Agent[]>("/api/wallet/agents").then(setAgents).catch(() => {});
    apiFetch<TopUpRequest[]>("/api/wallet/topup/pending").then(setTopUps).catch(() => {});
  }, []);

  const approveTopUp = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/approve`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    apiFetch<TopUpRequest[]>("/api/wallet/topup/pending").then(setTopUps).catch(() => {});
  };

  if (user?.is_cfo) {
    return <FinancialHub />;
  }

  return (
    <div className="max-w-5xl">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Games", value: games.length },
          { label: "Live Games", value: games.filter((g) => g.game_status === "Live").length },
          { label: "Active Agents", value: agents.filter((a) => a.status === "Active").length },
          { label: "Pending Top-ups", value: topUps.length },
        ].map((s) => (
          <div key={s.label} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{s.label}</p>
            <p className="font-display text-2xl font-black text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick create link */}
      <div className="flex gap-3 mb-6">
        <Link href="/admin/admin/game-builder" className="bg-gold text-forest font-black text-xs px-5 py-2.5 rounded-xl hover:bg-gold-light transition-all">
          + New Game
        </Link>
        <Link href="/admin/admin/agents" className="border border-border text-[#9ca3af] hover:text-white text-xs px-5 py-2.5 rounded-xl transition-all">
          Manage Agents
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg2 p-1 rounded-xl border border-border mb-6 w-fit">
        {(["games", "agents", "topups"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${tab === t ? "bg-gold/10 text-gold border border-gold/20" : "text-[#9ca3af] hover:text-white"}`}>
            {t === "topups" ? "Top-ups" : t}
          </button>
        ))}
      </div>

      {tab === "games" && (
        <div className="space-y-3">
          {games.map((g) => (
            <div key={g.game_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{g.title}</p>
                <p className="text-xs text-[#9ca3af] font-mono">{new Date(g.scheduled_at).toLocaleString("en-IN")} · {g.sold_count}/{g.total_tickets} sold</p>
              </div>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${g.game_status === "Live" ? "bg-success/10 text-success" : "bg-bg3 text-[#9ca3af]"}`}>
                {g.game_status}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "agents" && (
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.agent_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{a.full_name}</p>
                <p className={`text-[10px] font-mono ${a.status === "Active" ? "text-success" : "text-danger"}`}>{a.status}</p>
              </div>
              <p className="font-mono font-bold text-gold">₹{a.current_balance?.toLocaleString() ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "topups" && (
        <div className="space-y-3">
          {topUps.length === 0 && <p className="text-[#6b7280] text-sm">No pending top-up requests.</p>}
          {topUps.map((r) => (
            <div key={r.request_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{r.agent_name}</p>
                <p className="font-mono font-bold text-gold">₹{r.amount.toLocaleString()}</p>
              </div>
              <button onClick={() => approveTopUp(r.request_id)}
                className="text-xs bg-success/10 border border-success/30 text-success px-4 py-2 rounded-xl hover:bg-success hover:text-white transition-all">
                Approve
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
