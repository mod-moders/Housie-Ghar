"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAgentStore } from "@/lib/stores/agentStore";
import { useSocket } from "@/lib/hooks/useSocket";
import { useCountdown } from "@/lib/hooks/useCountdown";

interface BookingRequest {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; locked_until: string;
}

function QueueCard({ req, onAction }: { req: BookingRequest; onAction: () => void }) {
  const { display: countdown } = useCountdown(req.locked_until);
  const [loading, setLoading] = useState(false);

  const act = async (action: "confirm" | "reject") => {
    setLoading(true);
    try {
      await apiFetch(`/api/bookings/agent/${req.booking_id}/${action}`, { method: "POST" });
      onAction();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-bg2 border border-border rounded-2xl p-5">
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
      <p className="text-xs text-[#9ca3af] mb-1">{req.game_title}</p>
      <p className="text-xs font-mono text-[#9ca3af] mb-4">
        Tickets: {req.ticket_numbers.map((n) => `#${n}`).join(", ")}
      </p>
      <div className="flex gap-2">
        <button onClick={() => act("confirm")} disabled={loading}
          className="flex-1 bg-success/10 border border-success/30 text-success font-bold text-xs py-2.5 rounded-xl hover:bg-success hover:text-white transition-all disabled:opacity-50">
          ✓ Confirm Payment
        </button>
        <button onClick={() => act("reject")} disabled={loading}
          className="flex-1 bg-danger/10 border border-danger/30 text-danger font-bold text-xs py-2.5 rounded-xl hover:bg-danger hover:text-white transition-all disabled:opacity-50">
          ✗ Reject
        </button>
      </div>
    </div>
  );
}

export default function AgentQueuePage() {
  const { queue, walletBalance, setQueue, setBalance } = useAgentStore();

  const reload = async () => {
    try {
      const data = await apiFetch<BookingRequest[]>("/api/bookings/agent/queue");
      setQueue(data);
    } catch {}
    try {
      const me = await apiFetch<{ user: any }>("/api/auth/me");
      setBalance(me.user?.current_balance ?? 0);
    } catch {}
  };

  useSocket((event) => {
    if (event === "new_booking_request" || event === "booking_expired") reload();
    if (event === "wallet_credited") reload();
  });

  useEffect(() => { reload(); }, []);

  return (
    <div className="max-w-2xl">
      {/* Wallet strip */}
      <div className="bg-bg2 border border-border rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider">Wallet Balance</p>
          <p className="font-display text-3xl font-black text-gold mt-0.5">₹{walletBalance.toLocaleString()}</p>
          {walletBalance < 500 && (
            <p className="text-warning text-xs mt-1 font-medium">⚠ Low balance — request a top-up</p>
          )}
        </div>
        <a href="/admin/agent/wallet" className="text-xs border border-border text-[#9ca3af] hover:text-white px-4 py-2 rounded-xl transition-all">
          Wallet →
        </a>
      </div>

      {/* Queue */}
      <h2 className="text-sm font-semibold text-white mb-3">
        Pending Bookings {queue.length > 0 && <span className="ml-1 bg-gold text-forest text-[10px] font-bold px-2 py-0.5 rounded-full">{queue.length}</span>}
      </h2>
      {queue.length === 0 ? (
        <div className="bg-bg2 border border-dashed border-border rounded-2xl p-12 text-center text-[#6b7280] text-sm">
          No pending bookings. You're all caught up!
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((req) => <QueueCard key={req.booking_id} req={req} onAction={reload} />)}
        </div>
      )}
    </div>
  );
}
