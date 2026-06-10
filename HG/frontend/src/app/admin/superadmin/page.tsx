"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import {
  Crown, ShieldCheck, Sliders, UserCircle, SquaresFour,
  Users, ClipboardText, PaintBrush, CheckCircle,
} from "@phosphor-icons/react";

interface User { user_id: string; full_name: string; email: string; role_name: string; status: string; current_balance?: number; }
interface AuditEntry { log_id: number; user_name: string; action: string; target_type: string; target_description: string; timestamp: string; }
interface Theme { theme_id: number; theme_name: string; is_active: boolean; }

const ease = [0.23, 1, 0.32, 1] as const;

const ROLE_META = {
  Superadmin: { color: "text-gold",        bg: "bg-gold/10",         border: "border-gold/20",         icon: Crown       },
  Admin:      { color: "text-violet-400",  bg: "bg-violet-500/10",   border: "border-violet-500/20",   icon: ShieldCheck },
  Operator:   { color: "text-sky-400",     bg: "bg-sky-500/10",      border: "border-sky-500/20",      icon: Sliders     },
  Agent:      { color: "text-emerald-400", bg: "bg-emerald-500/10",  border: "border-emerald-500/20",  icon: UserCircle  },
} as const;

const ROLE_STATS = [
  { key: "Superadmin" as const, grad: "from-gold/10"          },
  { key: "Admin"      as const, grad: "from-violet-500/10"    },
  { key: "Operator"   as const, grad: "from-sky-500/10"       },
  { key: "Agent"      as const, grad: "from-emerald-500/10"   },
];

const TABS = [
  { id: "overview" as const, label: "Overview", icon: SquaresFour  },
  { id: "users"    as const, label: "Users",    icon: Users        },
  { id: "audit"    as const, label: "Audit",    icon: ClipboardText },
  { id: "themes"   as const, label: "Themes",   icon: PaintBrush   },
];

const actionColor = (action: string) => {
  const u = action.toUpperCase();
  if (u.includes("DELETE") || u.includes("SUSPEND") || u.includes("REMOVE")) return "text-danger";
  if (u.includes("CREATE") || u.includes("ACTIVATE") || u.includes("ADD"))   return "text-success";
  if (u.includes("UPDATE") || u.includes("CHANGE")   || u.includes("SET"))   return "text-gold";
  if (u.includes("LOGIN"))                                                     return "text-sky-400";
  return "text-[#9ca3af]";
};

const fmtTime = (ts: string) => {
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
};

export default function SuperadminPage() {
  const [users,  setUsers]  = useState<User[]>([]);
  const [audit,  setAudit]  = useState<AuditEntry[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [tab,    setTab]    = useState<"overview" | "users" | "audit" | "themes">("overview");

  useEffect(() => {
    apiFetch<User[]>("/api/users").then(setUsers).catch(() => {});
    apiFetch<{ entries: AuditEntry[] }>("/api/audit?limit=20").then((d) => setAudit(d.entries)).catch(() => {});
    apiFetch<Theme[]>("/api/themes").then(setThemes).catch(() => {});
  }, []);

  const setTheme = async (id: number) => {
    try { await apiFetch("/api/themes/active", { method: "PUT", body: JSON.stringify({ theme_id: id }) }); }
    catch (e) { alert(errMsg(e)); }
    apiFetch<Theme[]>("/api/themes").then(setThemes).catch(() => {});
  };

  const toggleUser = async (userId: string, currentStatus: string) => {
    try {
      await apiFetch(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ status: currentStatus === "Active" ? "Suspended" : "Active" }) });
      apiFetch<User[]>("/api/users").then(setUsers).catch(() => {});
    } catch (e) { alert(errMsg(e)); }
  };

  const agentLiability = users
    .filter((u) => u.role_name === "Agent")
    .reduce((s, u) => s + (u.current_balance ?? 0), 0);

  return (
    <div className="max-w-5xl">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {ROLE_STATS.map(({ key, grad }, i) => {
          const meta = ROLE_META[key];
          const Icon = meta.icon;
          const count = users.filter((u) => u.role_name === key).length;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease, delay: i * 0.05 }}
              className="relative overflow-hidden bg-bg2 border border-border rounded-2xl p-4"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${grad} to-transparent pointer-events-none`} />
              <div className="relative">
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mb-2.5 border ${meta.bg} ${meta.border} ${meta.color}`}>
                  <Icon size={10} weight="fill" />
                  {key}s
                </div>
                <p className="font-display text-3xl font-black text-white tabular-nums">{count}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

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
                layoutId="tab-active"
                className="absolute inset-0 bg-gold/10 border border-gold/20 rounded-lg"
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              />
            )}
            <Icon
              size={12}
              className={`relative z-10 transition-colors duration-150 ${tab === id ? "text-gold" : "text-[#6b7280]"}`}
              weight={tab === id ? "fill" : "regular"}
            />
            <span className={`relative z-10 transition-colors duration-150 ${tab === id ? "text-gold" : "text-[#9ca3af] hover:text-white"}`}>
              {label}
            </span>
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
          {tab === "overview" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-bg2 border border-border rounded-2xl p-5">
                <p className="text-[10px] text-[#6b7280] font-medium tracking-widest uppercase mb-3">
                  Active Theme
                </p>
                <p className="text-gold font-mono font-semibold">
                  {themes.find((t) => t.is_active)?.theme_name ?? "Default"}
                </p>
              </div>
              <div className="bg-bg2 border border-border rounded-2xl p-5">
                <p className="text-[10px] text-[#6b7280] font-medium tracking-widest uppercase mb-3">
                  Agent Wallet Liability
                </p>
                <p className="font-display text-3xl font-black text-gold tabular-nums">
                  ₹{agentLiability.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-2">
              {users.map((u) => {
                const meta = ROLE_META[u.role_name as keyof typeof ROLE_META] ?? ROLE_META.Agent;
                const Icon = meta.icon;
                return (
                  <div
                    key={u.user_id}
                    className="bg-bg2 border border-border rounded-2xl p-4 flex items-center gap-3 hover:border-border-active transition-colors duration-200"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${meta.bg} ${meta.border}`}>
                      <Icon size={17} className={meta.color} weight="fill" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{u.full_name}</p>
                      <p className="text-xs text-[#6b7280] font-mono truncate">{u.email}</p>
                    </div>
                    <div className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${meta.bg} ${meta.border} ${meta.color}`}>
                      <Icon size={9} weight="fill" />
                      {u.role_name}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => toggleUser(u.user_id, u.status)}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all flex-shrink-0 ${
                        u.status === "Active"
                          ? "border-danger/30 text-danger hover:bg-danger hover:text-white"
                          : "border-success/30 text-success hover:bg-success hover:text-white"
                      }`}
                    >
                      {u.status === "Active" ? "Suspend" : "Activate"}
                    </motion.button>
                  </div>
                );
              })}
              {users.length === 0 && (
                <p className="text-[#6b7280] text-sm py-8 text-center">No users found.</p>
              )}
            </div>
          )}

          {tab === "audit" && (
            <div className="bg-bg2 border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    {["Time", "Actor", "Action", "Target"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-[#6b7280] tracking-wider uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.log_id} className="border-b border-border last:border-0 hover:bg-bg3 transition-colors">
                      <td className="px-4 py-3 text-[#6b7280]">{fmtTime(e.timestamp)}</td>
                      <td className="px-4 py-3 text-white font-semibold">{e.user_name}</td>
                      <td className={`px-4 py-3 font-bold ${actionColor(e.action)}`}>{e.action}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{e.target_description ?? e.target_type}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-[#6b7280]">
                        No audit entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "themes" && (
            <div className="grid sm:grid-cols-2 gap-3">
              {themes.map((t) => (
                <motion.button
                  key={t.theme_id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setTheme(t.theme_id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    t.is_active ? "border-gold bg-gold/10" : "border-border bg-bg2 hover:border-border-active"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white text-sm">{t.theme_name}</p>
                    {t.is_active && (
                      <div className="flex items-center gap-1 text-gold">
                        <CheckCircle size={14} weight="fill" />
                        <span className="text-[10px] font-mono uppercase">Active</span>
                      </div>
                    )}
                  </div>
                </motion.button>
              ))}
              {themes.length === 0 && (
                <p className="text-[#6b7280] text-sm py-8">No themes configured.</p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
