"use client";
/**
 * Website Settings (Superadmin only) — the lobby announcements manager.
 * Up to 5 rotating announcements stored in Platform_Config.announcements_list
 * (JSON array of {id, text, muted}), plus rotation speed and a global mute.
 * The public lobby rotates the un-muted entries; when the list is empty it
 * falls back to the legacy marquee_text strip.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { ConfigEntry } from "@/lib/types";

export interface Announcement {
  id: number;
  text: string;
  muted: boolean;
}

export function SettingsSection() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [speed, setSpeed] = useState("10");
  const [isMuted, setIsMuted] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");

  useEffect(() => {
    apiFetch<ConfigEntry[]>("/api/config")
      .then((rows) => {
        const get = (key: string) => rows.find((r) => r.config_key === key)?.config_value;
        try {
          setAnnouncements(JSON.parse(get("announcements_list") || "[]"));
        } catch {
          setAnnouncements([]);
        }
        setSpeed(get("announcement_speed") || "10");
        setIsMuted(get("announcements_muted") === "true");
        setLoaded(true);
      })
      .catch((e) => setMessage({ text: e instanceof Error ? e.message : "Could not load settings", error: true }));
  }, []);

  const save = async (updates: Record<string, string>) => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch("/api/config", { method: "PUT", body: JSON.stringify(updates) });
      setMessage({ text: "Saved — live on the lobby." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to save settings", error: true });
    }
    setSaving(false);
  };

  const addAnnouncement = () => {
    if (!newAnnouncement.trim() || announcements.length >= 5) return;
    const next = [...announcements, { id: Date.now(), text: newAnnouncement.trim(), muted: false }];
    setAnnouncements(next);
    setNewAnnouncement("");
    save({ announcements_list: JSON.stringify(next) });
  };

  const visible = announcements.filter((a) => !a.muted);

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Rotating announcements shown to every player at the top of the lobby.</p>

      {message && (
        <div style={{
          marginBottom: 10, padding: "6px 14px", borderRadius: "var(--radius-sm)",
          background: message.error ? "var(--danger-soft)" : "var(--success-soft)",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <Icon name={message.error ? "x" : "check"} size={14} style={{ color: message.error ? "var(--danger)" : "var(--success)" }} />
          <span style={{ color: message.error ? "var(--danger)" : "var(--success)", fontWeight: 600, fontSize: 13 }}>{message.text}</span>
        </div>
      )}

      <div className="hg-panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="bell" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 16 }}>Announcements</h3>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>
            <input
              type="checkbox"
              checked={isMuted}
              disabled={!loaded}
              onChange={(e) => {
                const val = e.target.checked;
                setIsMuted(val);
                save({ announcements_muted: String(val) });
              }}
              style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
            />
            Mute all
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={newAnnouncement}
            maxLength={140}
            onChange={(e) => setNewAnnouncement(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addAnnouncement(); }}
            placeholder={announcements.length >= 5 ? "Max 5 reached" : "e.g. Diwali special tonight 9 PM — Full House ₹10,000!"}
            disabled={!loaded || announcements.length >= 5}
            style={{
              flex: "1 1 260px", padding: "7px 12px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", fontSize: 13, outline: "none",
            }}
          />
          <Button
            size="sm"
            onClick={addAnnouncement}
            disabled={!loaded || saving || !newAnnouncement.trim() || announcements.length >= 5}
          >
            Add ({announcements.length}/5)
          </Button>
          <select
            value={speed}
            disabled={!loaded}
            onChange={(e) => {
              const val = e.target.value;
              setSpeed(val);
              save({ announcement_speed: val });
            }}
            style={{
              padding: "7px 10px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", outline: "none", fontWeight: 600,
              cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
            }}
          >
            <option value="15">Slow (15s)</option>
            <option value="10">Medium (10s)</option>
            <option value="6">Fast (6s)</option>
            <option value="3">Super fast (3s)</option>
          </select>
        </div>

        {announcements.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {announcements.map((ann, index) => (
              <div
                key={ann.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-2)",
                  background: ann.muted ? "var(--bg)" : "var(--surface)",
                  opacity: ann.muted ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", minWidth: 18 }}>#{index + 1}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{ann.text}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, userSelect: "none", color: "var(--text-dim)" }}>
                  <input
                    type="checkbox"
                    checked={ann.muted}
                    onChange={(e) => {
                      const updated = announcements.map((a) => (a.id === ann.id ? { ...a, muted: e.target.checked } : a));
                      setAnnouncements(updated);
                      save({ announcements_list: JSON.stringify(updated) });
                    }}
                    style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                  />
                  Mute
                </label>
                <button
                  onClick={() => {
                    const updated = announcements.filter((a) => a.id !== ann.id);
                    setAnnouncements(updated);
                    save({ announcements_list: JSON.stringify(updated) });
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 2, display: "grid", placeItems: "center" }}
                  title="Delete announcement"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 14, color: "var(--text-dim)", fontSize: 12, border: "1.5px dashed var(--border-2)", borderRadius: "var(--radius-sm)" }}>
            No announcements yet — the lobby strip is hidden.
          </div>
        )}

        {/* Live preview of what the lobby shows */}
        {!isMuted && visible.length > 0 && (
          <div className="hg-notice" aria-hidden="true">
            <span className="hg-notice-ic"><Icon name="bell" size={15} /></span>
            <p>{visible[0].text}{visible.length > 1 ? `  ·  (+${visible.length - 1} more, rotating every ${speed}s)` : ""}</p>
          </div>
        )}
        {isMuted && (
          <p className="hg-sec-sub" style={{ margin: 0 }}>All announcements are muted — the lobby strip is hidden.</p>
        )}
      </div>
    </div>
  );
}
