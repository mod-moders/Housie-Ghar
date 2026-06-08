"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";

interface Theme { theme_id: number; theme_name: string; css_class?: string; is_active: boolean; }

export default function ThemingPage() {
  const [themes, setThemes] = useState<Theme[]>([]);

  const reload = () => apiFetch<Theme[]>("/api/themes").then(setThemes).catch(() => {});
  useEffect(() => { reload(); }, []);

  const setTheme = async (id: number) => {
    try { await apiFetch("/api/themes/active", { method: "PUT", body: JSON.stringify({ theme_id: id }) }); }
    catch (e) { alert(errMsg(e)); }
    reload();
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-semibold text-white mb-3">Public Site Theme</h2>
      {themes.length === 0 && <p className="text-[#6b7280] text-sm">No themes available.</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        {themes.map((t) => (
          <button key={t.theme_id} onClick={() => setTheme(t.theme_id)}
            className={`p-5 rounded-2xl border-2 text-left transition-all ${
              t.is_active ? "border-gold bg-gold/10" : "border-border bg-bg2 hover:border-border-active"
            }`}>
            <p className="font-semibold text-white text-sm">{t.theme_name}</p>
            {t.is_active && <span className="text-[10px] font-mono text-gold uppercase mt-1 block">Active</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
