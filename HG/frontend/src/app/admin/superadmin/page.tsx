"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";

interface User { user_id: string; full_name: string; email: string; role_name: string; status: string; current_balance?: number; }
interface AuditEntry { log_id: number; user_name: string; action: string; target_type: string; target_description: string; timestamp: string; }
interface Theme { theme_id: number; theme_name: string; is_active: boolean; }

export default function SuperadminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "audit" | "themes">("overview");

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

  const roles = ["Superadmin", "Admin", "Operator", "Agent"];

  return (
    <div className="max-w-5xl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {roles.map((r) => ({
          role: r, count: users.filter((u) => u.role_name === r).length
        })).map(({ role, count }) => (
          <div key={role} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{role}s</p>
            <p className="font-display text-2xl font-black text-white mt-1">{count}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg2 p-1 rounded-xl border border-border mb-6 w-fit">
        {(["overview", "users", "audit", "themes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${tab === t ? "bg-gold/10 text-gold border border-gold/20" : "text-[#9ca3af] hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-bg2 border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Active Theme</h3>
            <p className="text-gold font-mono">{themes.find((t) => t.is_active)?.theme_name ?? "Default"}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Total Wallet Liability</h3>
            <p className="font-display text-2xl font-black text-gold">
              ₹{users.filter((u) => u.role_name === "Agent").reduce((s, u) => s + (u.current_balance ?? 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.user_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{u.full_name}</p>
                <p className="text-xs text-[#9ca3af] font-mono">{u.email} · {u.role_name}</p>
              </div>
              <button onClick={() => toggleUser(u.user_id, u.status)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                  u.status === "Active"
                    ? "border-danger/30 text-danger hover:bg-danger hover:text-white"
                    : "border-success/30 text-success hover:bg-success hover:text-white"
                }`}>
                {u.status === "Active" ? "Suspend" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="bg-bg2 border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-[#9ca3af]">
                {["Time", "Actor", "Action", "Target"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.log_id} className="border-b border-border last:border-0 hover:bg-bg3 transition-colors">
                  <td className="px-4 py-3 text-[#6b7280]">{new Date(e.timestamp).toLocaleTimeString("en-IN")}</td>
                  <td className="px-4 py-3 text-white">{e.user_name}</td>
                  <td className="px-4 py-3 text-gold">{e.action}</td>
                  <td className="px-4 py-3 text-[#9ca3af]">{e.target_description ?? e.target_type}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6b7280]">No audit entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "themes" && (
        <div className="grid sm:grid-cols-2 gap-4">
          {themes.map((t) => (
            <button key={t.theme_id} onClick={() => setTheme(t.theme_id)}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${t.is_active ? "border-gold bg-gold/10" : "border-border bg-bg2 hover:border-border-active"}`}>
              <p className="font-semibold text-white text-sm">{t.theme_name}</p>
              {t.is_active && <span className="text-[10px] font-mono text-gold uppercase mt-1 block">Active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
