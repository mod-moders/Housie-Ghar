"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";

interface User {
  user_id: string; full_name: string; email: string;
  role_name: string; status: string; current_balance?: number;
  role_id?: number; is_cfo?: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  const reload = () => apiFetch<User[]>("/api/users").then(setUsers).catch(() => {});
  useEffect(() => { reload(); }, []);

  const toggleUser = async (userId: string, currentStatus: string) => {
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: currentStatus === "Active" ? "Suspended" : "Active" }),
      });
      reload();
    } catch (e) { alert(errMsg(e)); }
  };

  const toggleCfo = async (userId: string, isCfo: boolean) => {
    try {
      await apiFetch(`/api/users/${userId}/cfo`, {
        method: "PATCH",
        body: JSON.stringify({ is_cfo: !isCfo }),
      });
      reload();
    } catch (e) { alert(errMsg(e)); }
  };

  return (
    <div className="max-w-3xl space-y-2">
      <h2 className="text-sm font-semibold text-white mb-3">Staff Accounts</h2>
      {users.length === 0 && <p className="text-[#6b7280] text-sm">No users found.</p>}
      {users.map((u) => (
        <div key={u.user_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white text-sm">{u.full_name}</p>
            <p className="text-xs text-[#9ca3af] font-mono">{u.email} · {u.role_name}</p>
          </div>
          <div className="flex items-center">
            {u.role_id === 2 && (
              <button onClick={() => toggleCfo(u.user_id, !!u.is_cfo)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all mr-2 ${
                  u.is_cfo
                    ? "border-gold/40 text-gold bg-gold/10"
                    : "border-border text-[#9ca3af] hover:text-white"
                }`}>
                {u.is_cfo ? "★ Financial Officer" : "Make FO"}
              </button>
            )}
            <button onClick={() => toggleUser(u.user_id, u.status)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                u.status === "Active"
                  ? "border-danger/30 text-danger hover:bg-danger hover:text-white"
                  : "border-success/30 text-success hover:bg-success hover:text-white"
              }`}>
              {u.status === "Active" ? "Suspend" : "Activate"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
