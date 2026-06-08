"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";
import { useCountdown } from "@/lib/hooks/useCountdown";
import Link from "next/link";

interface Game { game_id: string; title: string; scheduled_at: string; game_status: string; fill_percentage: number; }

interface OverflowReq {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; locked_until: string;
}

function OverflowCard({ req, onAction }: { req: OverflowReq; onAction: () => void }) {
  const { display: countdown } = useCountdown(req.locked_until);
  const [loading, setLoading] = useState(false);

  const forceConfirm = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/bookings/operator/${req.booking_id}/force-confirm`, { method: "POST" });
      onAction();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-bg2 border border-warning/40 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">{req.housie_name}</p>
          <p className="text-xs text-[#9ca3af] font-mono mt-0.5">#{req.booking_id.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-gold font-bold">₹{req.total_amount}</p>
          <p className="text-[10px] text-[#9ca3af] font-mono">{countdown} left</p>
        </div>
      </div>
      <span className="inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30 mb-2">
        ⚠ OVERFLOW — all bookies low on balance
      </span>
      <p className="text-xs text-[#9ca3af] mb-1">{req.game_title}</p>
      <p className="text-xs font-mono text-[#9ca3af] mb-4">
        Tickets: {req.ticket_numbers.map((n) => `#${n}`).join(", ")}
      </p>
      <button onClick={forceConfirm} disabled={loading}
        className="w-full bg-success/10 border border-success/30 text-success font-bold text-xs py-2.5 rounded-xl hover:bg-success hover:text-white transition-all disabled:opacity-50">
        ✓ Force Confirm (direct-to-platform sale)
      </button>
    </div>
  );
}

export default function OperatorPage() {
  const [tab, setTab] = useState<"games" | "overflow">("games");
  const [games, setGames] = useState<Game[]>([]);
  const [overflow, setOverflow] = useState<OverflowReq[]>([]);
  const user = useAuthStore((s) => s.user);

  const loadGames = () => { apiFetch<Game[]>("/api/games").then(setGames).catch(() => {}); };
  const loadOverflow = () => {
    apiFetch<OverflowReq[]>("/api/bookings/operator/overflow-queue").then(setOverflow).catch(() => {});
  };

  useSocket(
    (event) => {
      if (event === "overflow_booking" || event === "ticket_status_change" || event === "booking_expired") loadOverflow();
    },
    { event: "join_operator_room", arg: user?.user_id }
  );

  useEffect(() => { loadGames(); loadOverflow(); }, []);

  return (
    <div className="max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("games")}
          className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all ${tab === "games" ? "bg-gold/10 text-gold border border-gold/30" : "text-[#9ca3af] hover:text-white border border-border"}`}>
          Assigned Games
        </button>
        <button onClick={() => setTab("overflow")}
          className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${tab === "overflow" ? "bg-warning/10 text-warning border border-warning/30" : "text-[#9ca3af] hover:text-white border border-border"}`}>
          Overflow Queue
          {overflow.length > 0 && <span className="bg-warning text-forest text-[10px] font-bold px-1.5 py-0.5 rounded-full">{overflow.length}</span>}
        </button>
      </div>

      {tab === "games" && (
        <div className="space-y-4">
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
      )}

      {tab === "overflow" && (
        <div className="space-y-4">
          <p className="text-xs text-[#9ca3af] mb-1">
            These bookings reached you because every active bookie was low on wallet balance.
            Verify the player's payment in your banking app, then Force Confirm.
          </p>
          {overflow.length === 0 ? (
            <div className="bg-bg2 border border-dashed border-border rounded-2xl p-12 text-center text-[#6b7280] text-sm">
              No overflow bookings. The bookie pool is handling demand.
            </div>
          ) : (
            overflow.map((req) => <OverflowCard key={req.booking_id} req={req} onAction={loadOverflow} />)
          )}
        </div>
      )}
    </div>
  );
}
