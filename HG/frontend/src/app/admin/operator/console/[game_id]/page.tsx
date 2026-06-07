"use client";
import { use, useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useGameStore } from "@/lib/stores/gameStore";
import { useSSE } from "@/lib/hooks/useSSE";

interface Game { game_id: string; title: string; game_status: string; }

export default function OperatorConsole({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [speedMs, setSpeedMs] = useState(8000);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const { drawnNumbers, lastDrawn, gameStatus, setStatus } = useGameStore();

  useSSE(game_id);

  useEffect(() => {
    apiFetch<Game>(`/api/games/${game_id}`).then((g) => { setGame(g); setStatus(g.game_status as any); }).catch(() => {});
  }, [game_id]);

  const pushLog = (msg: string) => setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const ctrl = async (action: "start" | "pause" | "resume") => {
    try {
      await apiFetch(`/api/games/${game_id}/${action}`, { method: "POST" });
      pushLog(`${action.charAt(0).toUpperCase() + action.slice(1)} command sent`);
    } catch (e: any) { pushLog(`Error: ${e.message}`); }
  };

  const changeSpeed = async (ms: number) => {
    setSpeedMs(ms);
    try { await apiFetch(`/api/games/${game_id}/speed`, { method: "POST", body: JSON.stringify({ interval_ms: ms }) }); }
    catch {}
  };

  return (
    <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Controls */}
      <div className="space-y-4">
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Game</p>
          <p className="font-semibold text-white">{game?.title ?? "Loading…"}</p>
          <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full mt-2 ${
            gameStatus === "Live" ? "bg-success/10 text-success border border-success/30" :
            gameStatus === "Paused" ? "bg-warning/10 text-warning" : "bg-bg3 text-[#9ca3af]"
          }`}>{gameStatus}</span>
        </div>

        <div className="bg-bg2 border border-border rounded-2xl p-5 space-y-3">
          {gameStatus === "Scheduled" && (
            <button onClick={() => ctrl("start")} className="w-full bg-success text-white font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              🚀 Start Draw
            </button>
          )}
          {gameStatus === "Live" && (
            <button onClick={() => ctrl("pause")} className="w-full bg-warning text-forest font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              ⏸ Pause Draw
            </button>
          )}
          {gameStatus === "Paused" && (
            <button onClick={() => ctrl("resume")} className="w-full bg-success text-white font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              ▶ Resume Draw
            </button>
          )}
          {gameStatus === "Completed" && (
            <div className="text-center text-[#6b7280] text-sm py-3">Game completed 🏁</div>
          )}

          <div>
            <label className="text-[10px] font-mono text-[#9ca3af] uppercase tracking-wider block mb-2">
              Draw Speed: {speedMs / 1000}s
            </label>
            <input type="range" min={5000} max={12000} step={1000} value={speedMs}
              onChange={(e) => changeSpeed(Number(e.target.value))}
              className="w-full accent-gold" />
            <div className="flex justify-between text-[10px] text-[#6b7280] font-mono mt-1">
              <span>5s (fast)</span><span>12s (slow)</span>
            </div>
          </div>
        </div>

        {/* Current number */}
        <div className="bg-bg2 border border-border rounded-2xl p-5 text-center">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-widest mb-2">Last Drawn</p>
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-gold to-gold-light flex items-center justify-center mx-auto shadow-lg shadow-gold/20">
            <span className="font-display text-3xl font-black text-forest">{lastDrawn ?? "--"}</span>
          </div>
          <p className="text-xs font-mono text-[#9ca3af] mt-2">{drawnNumbers.length}/90</p>
        </div>
      </div>

      {/* Board + log */}
      <div className="lg:col-span-2 space-y-4">
        {/* 90-number board */}
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3">Draw Board</p>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
              <div key={n} className={`h-8 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all ${
                drawnNumbers.includes(n) ? "bg-gold text-forest scale-105" : "bg-bg3 text-[#6b7280]"
              }`}>{n}</div>
            ))}
          </div>
        </div>

        {/* Event log */}
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3">Conductor Log</p>
          <div ref={logRef} className="h-48 bg-bg1 rounded-xl p-4 font-mono text-xs text-success space-y-1 overflow-y-auto">
            {log.length === 0 ? <span className="text-[#6b7280]">Waiting for draw events…</span> : log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
