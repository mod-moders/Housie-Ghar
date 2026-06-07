"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Game { game_id: string; title: string; scheduled_at: string; game_status: string; fill_percentage: number; }

export default function OperatorPage() {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    apiFetch<Game[]>("/api/games").then(setGames).catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-sm font-semibold text-white mb-4">Your Assigned Games</h2>
      {games.map((g) => (
        <div key={g.game_id} className="bg-bg2 border border-border rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">{g.title}</p>
            <p className="text-xs text-[#9ca3af] font-mono mt-0.5">
              {new Date(g.scheduled_at).toLocaleString("en-IN")} · {g.fill_percentage}% filled
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              g.game_status === "Live" ? "bg-success/10 text-success border border-success/30" :
              g.game_status === "Paused" ? "bg-warning/10 text-warning" :
              g.game_status === "Completed" ? "bg-bg3 text-[#6b7280]" : "bg-bg3 text-[#9ca3af]"
            }`}>{g.game_status}</span>
            <Link href={`/admin/operator/console/${g.game_id}`}
              className="text-xs bg-gold/10 border border-gold/20 text-gold px-4 py-2 rounded-xl hover:bg-gold/20 transition-all">
              Open →
            </Link>
          </div>
        </div>
      ))}
      {games.length === 0 && <p className="text-[#6b7280] text-sm">No games assigned.</p>}
    </div>
  );
}
