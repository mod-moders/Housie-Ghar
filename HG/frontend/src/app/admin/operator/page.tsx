"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useAuthStore } from "@/lib/stores/authStore";
import { useSocket } from "@/lib/hooks/useSocket";
import { useCountdown } from "@/lib/hooks/useCountdown";
import Link from "next/link";
import {
  GameController, ArrowsCounterClockwise, CheckCircle, Clock,
  Ticket, Tray, ArrowRight, WarningCircle, Warning,
} from "@phosphor-icons/react";

interface Game {
  game_id: string; title: string; scheduled_at: string;
  game_status: string; fill_percentage: number;
}

interface OverflowReq {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; locked_until: string;
}

const ease = [0.23, 1, 0.32, 1] as const;

const STATUS_META: Record<string, { text: string; dot: string; badge: string }> = {
  Live:      { text: "text-success",    dot: "bg-success",    badge: "bg-success/10 border-success/30"  },
  Paused:    { text: "text-warning",    dot: "bg-warning",    badge: "bg-warning/10 border-warning/30"  },
  Completed: { text: "text-[#6b7280]",  dot: "bg-[#6b7280]",  badge: "bg-bg3 border-border"             },
  Scheduled: { text: "text-[#9ca3af]",  dot: "bg-[#4b5563]",  badge: "bg-bg3 border-border"             },
};

function OverflowCard({
  req, onAction, index,
}: {
  req: OverflowReq; onAction: () => void; index: number;
}) {
  const { display: countdown } = useCountdown(req.locked_until);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forceConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/operator/${req.booking_id}/force-confirm`, { method: "POST" });
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
      className="bg-bg2 border border-warning/30 hover:border-warning/50 rounded-2xl p-5 transition-colors duration-200"
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

      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/25 mb-3">
        <Warning size={9} weight="fill" />
        Overflow — all agents low on balance
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

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={forceConfirm}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 bg-success/10 border border-success/25 text-success font-semibold text-xs py-2.5 rounded-xl hover:bg-success hover:text-bg1 transition-all duration-200 disabled:opacity-40"
      >
        <CheckCircle size={14} weight="bold" />
        Force Confirm — direct platform sale
      </motion.button>
    </motion.div>
  );
}

export default function OperatorPage() {
  const [tab, setTab] = useState<"games" | "overflow">("games");
  const [games, setGames] = useState<Game[]>([]);
  const [overflow, setOverflow] = useState<OverflowReq[]>([]);
  const user = useAuthStore((s) => s.user);

  const loadGames    = () => apiFetch<Game[]>("/api/games").then(setGames).catch(() => {});
  const loadOverflow = () =>
    apiFetch<OverflowReq[]>("/api/bookings/operator/overflow-queue").then(setOverflow).catch(() => {});

  useSocket(
    (event) => {
      if (event === "overflow_booking" || event === "ticket_status_change" || event === "booking_expired")
        loadOverflow();
    },
    { event: "join_operator_room", arg: user?.user_id }
  );

  useEffect(() => { loadGames(); loadOverflow(); }, []);

  const TABS = [
    { id: "games"    as const, label: "Assigned Games", icon: GameController         },
    { id: "overflow" as const, label: "Overflow Queue",  icon: ArrowsCounterClockwise },
  ];

  return (
    <div className="max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-0.5 bg-bg2 p-1 rounded-xl border border-border mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg"
          >
            {tab === id && (
              <motion.div
                layoutId="op-tab-active"
                className={`absolute inset-0 rounded-lg border ${
                  id === "overflow"
                    ? "bg-warning/10 border-warning/20"
                    : "bg-gold/10 border-gold/20"
                }`}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              />
            )}
            <Icon
              size={12}
              className={`relative z-10 transition-colors duration-150 ${
                tab === id
                  ? id === "overflow" ? "text-warning" : "text-gold"
                  : "text-[#6b7280]"
              }`}
              weight={tab === id ? "fill" : "regular"}
            />
            <span className={`relative z-10 transition-colors duration-150 ${
              tab === id
                ? id === "overflow" ? "text-warning" : "text-gold"
                : "text-[#9ca3af] hover:text-white"
            }`}>
              {label}
            </span>
            <AnimatePresence>
              {id === "overflow" && overflow.length > 0 && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", duration: 0.25, bounce: 0.15 }}
                  className="relative z-10 bg-warning text-forest text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums"
                >
                  {overflow.length}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease }}
        >
          {tab === "games" && (
            <div className="space-y-3">
              {games.map((g, i) => {
                const meta = STATUS_META[g.game_status] ?? STATUS_META.Scheduled;
                return (
                  <motion.div
                    key={g.game_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease, delay: i * 0.04 }}
                    className="bg-bg2 border border-border hover:border-border-active rounded-2xl p-5 transition-colors duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{g.title}</p>
                        <p className="text-[11px] text-[#6b7280] font-mono mt-0.5">
                          {new Date(g.scheduled_at).toLocaleString("en-IN", {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        {/* Fill bar */}
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 h-1 bg-bg3 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${g.fill_percentage}%` }}
                              transition={{ duration: 0.6, ease, delay: i * 0.04 + 0.1 }}
                              className="h-full bg-gold/60 rounded-full"
                            />
                          </div>
                          <span className="text-[10px] font-mono text-[#6b7280] tabular-nums">
                            {g.fill_percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badge} ${meta.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${g.game_status === "Live" ? "animate-pulse" : ""}`} />
                          {g.game_status}
                        </span>
                        <Link
                          href={`/admin/operator/console/${g.game_id}`}
                          className="group flex items-center gap-1 text-xs bg-gold/10 border border-gold/20 text-gold px-3 py-1.5 rounded-xl hover:bg-gold/20 transition-all duration-200"
                        >
                          Open
                          <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {games.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-bg2 border border-dashed border-border rounded-2xl py-14 flex flex-col items-center text-center"
                >
                  <div className="w-11 h-11 rounded-xl bg-bg3 border border-border flex items-center justify-center mb-4">
                    <GameController size={20} className="text-[#4b5563]" weight="duotone" />
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">No games assigned</p>
                  <p className="text-[#6b7280] text-xs max-w-[200px] leading-relaxed">
                    An admin will assign games to your queue.
                  </p>
                </motion.div>
              )}
            </div>
          )}

          {tab === "overflow" && (
            <div className="space-y-3">
              <p className="text-xs text-[#6b7280] mb-4 leading-relaxed">
                These bookings escalated because every active agent was low on balance.
                Verify the player&apos;s payment in your banking app, then force confirm.
              </p>
              {overflow.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-bg2 border border-dashed border-border rounded-2xl py-14 flex flex-col items-center text-center"
                >
                  <div className="w-11 h-11 rounded-xl bg-bg3 border border-border flex items-center justify-center mb-4">
                    <Tray size={20} className="text-[#4b5563]" weight="duotone" />
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">No overflow bookings</p>
                  <p className="text-[#6b7280] text-xs max-w-[200px] leading-relaxed">
                    The agent pool is handling demand.
                  </p>
                </motion.div>
              ) : (
                overflow.map((req, i) => (
                  <OverflowCard key={req.booking_id} req={req} onAction={loadOverflow} index={i} />
                ))
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
