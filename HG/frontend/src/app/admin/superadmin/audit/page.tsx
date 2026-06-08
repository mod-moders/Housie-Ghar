"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  log_id: number; user_name: string; user_role: string; action: string;
  target_type: string; target_description: string; timestamp: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    apiFetch<{ entries: AuditEntry[] }>("/api/audit?limit=50")
      .then((d) => setEntries(d.entries))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl">
      <h2 className="text-sm font-semibold text-white mb-3">Audit Log</h2>
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
            {entries.map((e) => (
              <tr key={e.log_id} className="border-b border-border last:border-0 hover:bg-bg3 transition-colors">
                <td className="px-4 py-3 text-[#6b7280]">{new Date(e.timestamp).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-white">{e.user_name} <span className="text-[#6b7280]">({e.user_role})</span></td>
                <td className="px-4 py-3 text-gold">{e.action}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{e.target_description ?? e.target_type}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6b7280]">No audit entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
