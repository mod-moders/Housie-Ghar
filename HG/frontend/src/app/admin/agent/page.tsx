"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useAgentStore } from "@/lib/stores/agentStore";
import { useAuthStore, type AuthUser } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";
import Link from "next/link";
import { useCountdown } from "@/lib/hooks/useCountdown";
import {
  Warning, CheckCircle, XCircle, X, Wallet, ArrowRight,
  Clock, Ticket, Tray, WarningCircle,
} from "@phosphor-icons/react";

interface BookingRequest {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; locked_until: string;
}

interface SkipAlert {
  alert_id?: number; booking_amount: number; agent_balance: number; created_at?: string;
}

const ease = [0.23, 1, 0.32, 1] as const;

function QueueCard({ req, onAction, index }: { req: BookingRequest; onAction: () => void; index: number }) {
  const { display: countdown } = useCountdown(req.locked_until);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "confirm" | "reject") => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/agent/${req.booking_id}/${action}`, { method: "POST" });
      onAction();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease, delay: index * 0.05 }}
      className="bg-bg2 border border-border hover:border-border-active rounded-2xl p-5 transition-colors duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">{req.housie_name}</p>
          <p className="text-[11px] text-[#6b7280] font-mono mt-0.5">
            #{req.booking_id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-gold font-bold tabular-nums">₹{req.total_amount}</p>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <Clock size={10} className="text-[#6b7280]" />
            <p className="text-[10px] text-[#6b7280] font-mono">{countdown}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-0.5">
        <Ticket size={11} className="text-[#6b7280]" weight="duotone" />
        <p className="text-xs text-[#6b7280]">{req.game_title}</p>
      </div>
      <p className="text-[11px] font-mono text-[#6b7280] mb-4">
        {req.ticket_numbers.map((n) => `#${n}`).join(" · ")}
      </p>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <p className="text-[11px] text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <WarningCircle size={12} weight="fill" />
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => act("confirm")}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 bg-success/10 border border-success/25 text-success font-semibold text-xs py-2.5 rounded-xl hover:bg-success hover:text-bg1 transition-all duration-200 disabled:opacity-40"
        >
          <CheckCircle size={14} weight="bold" />
          Confirm Payment
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => act("reject")}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 bg-danger/10 border border-danger/25 text-danger font-semibold text-xs py-2.5 rounded-xl hover:bg-danger hover:text-white transition-all duration-200 disabled:opacity-40"
        >
          <XCircle size={14} weight="bold" />
          Reject
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function AgentQueuePage() {
  const { queue, walletBalance, setQueue, setBalance } = useAgentStore();
  const user = useAuthStore((s) => s.user);
  const [fomo, setFomo] = useState<SkipAlert[]>([]);

  const reload = async () => {
    try {
      const data = await apiFetch<BookingRequest[]>("/api/bookings/agent/queue");
      setQueue(data);
    } catch {}
    try {
      const me = await apiFetch<{ user: AuthUser }>("/api/auth/me");
      setBalance(me.user?.current_balance ?? 0);
    } catch {}
  };

  const loadSkipAlerts = async () => {
    try {
      const alerts = await apiFetch<SkipAlert[]>("/api/bookings/agent/skip-alerts");
      if (alerts.length) setFomo((prev) => [...alerts, ...prev]);
    } catch {}
  };

  useSocket(
    (event, data) => {
      if (event === "new_booking_request" || event === "booking_expired") reload();
      if (event === "wallet_credited") reload();
      if (event === "booking_skipped") {
        setFomo((prev) => [data as SkipAlert, ...prev]);
        reload();
      }
    },
    { event: "join_agent_room", arg: user?.user_id }
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); loadSkipAlerts(); }, []);

  return (
    <div className="max-w-2xl">
      {/* FOMO alert */}
      <AnimatePresence>
        {fomo.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease }}
            className="bg-danger/10 border border-danger/30 rounded-2xl p-4 mb-6"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 p-1.5 bg-danger/15 rounded-lg flex-shrink-0">
                  <Warning size={13} className="text-danger" weight="fill" />
                </div>
                <div>
                  <p className="text-danger font-bold text-sm">
                    Missed {fomo.length} booking{fomo.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-[#fca5a5] mt-0.5 leading-relaxed">
                    Wallet balance was too low. Recharge to resume receiving sales.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFomo([])}
                className="text-danger/50 hover:text-danger p-1 transition-colors -mt-0.5 -mr-1"
              >
                <X size={14} />
              </button>
            </div>
            <div className="ml-[38px] space-y-1 mb-3">
              {fomo.slice(0, 3).map((f, i) => (
                <p key={f.alert_id ?? i} className="text-[11px] font-mono text-[#9ca3af]">
                  Order ₹{f.booking_amount} · balance was ₹{f.agent_balance}
                </p>
              ))}
            </div>
            <div className="ml-[38px]">
              <Link
                href="/admin/agent/wallet"
                className="inline-flex items-center gap-1.5 text-xs bg-danger text-white font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
              >
                Recharge now <ArrowRight size={11} weight="bold" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallet */}
      <div className="relative overflow-hidden bg-bg2 border border-gold/20 rounded-2xl p-5 mb-6">
        <div className="absolute -top-10 -right-10 w-36 h-36 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between relative">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wallet size={12} className="text-gold/50" weight="fill" />
              <p className="text-[10px] text-[#6b7280] font-medium tracking-widest uppercase">
                Wallet Balance
              </p>
            </div>
            <p className="font-display text-4xl font-black text-gold tabular-nums leading-none">
              ₹{walletBalance.toLocaleString()}
            </p>
            {walletBalance < 500 && (
              <div className="flex items-center gap-1 mt-2">
                <Warning size={11} className="text-warning" weight="fill" />
                <p className="text-warning text-[11px] font-medium">Low balance — request a top-up</p>
              </div>
            )}
          </div>
          <Link
            href="/admin/agent/wallet"
            className="group flex items-center gap-1.5 text-xs border border-border text-[#9ca3af] hover:text-white hover:border-border-active px-4 py-2 rounded-xl transition-all duration-200"
          >
            Wallet
            <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          </Link>
        </div>
      </div>

      {/* Queue header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">Pending Bookings</h2>
        <AnimatePresence>
          {queue.length > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", duration: 0.25, bounce: 0.15 }}
              className="bg-gold text-forest text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums"
            >
              {queue.length}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Queue list or empty state */}
      {queue.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-bg2 border border-dashed border-border rounded-2xl py-14 flex flex-col items-center text-center"
        >
          <div className="w-11 h-11 rounded-xl bg-bg3 border border-border flex items-center justify-center mb-4">
            <Tray size={20} className="text-[#4b5563]" weight="duotone" />
          </div>
          <p className="text-white font-semibold text-sm mb-1">Queue is clear</p>
          <p className="text-[#6b7280] text-xs max-w-[200px] leading-relaxed">
            Booking requests appear here in real time.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {queue.map((req, i) => (
            <QueueCard key={req.booking_id} req={req} onAction={reload} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
