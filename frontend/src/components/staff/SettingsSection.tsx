"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useConfigStore } from "@/lib/stores/configStore";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";

const THEMES = [
  { id: "glamour_casino", label: "Glamour Casino", icon: "star" },
  { id: "digital_neon", label: "Digital Neon", icon: "zap" },
  { id: "luxury_gold", label: "Luxury Gold", icon: "star" },
  { id: "playful_kids", label: "Playful Kids", icon: "users" }
];

export function SettingsSection() {
  const { config, updateConfigLocally } = useConfigStore();
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [activeTheme, setActiveTheme] = useState("");
  const [message, setMessage] = useState("");

  // Announcements manager states
  const [announcements, setAnnouncements] = useState<Array<{ id: number; text: string; muted: boolean }>>([]);
  const [speed, setSpeed] = useState("10");
  const [isMuted, setIsMuted] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");

  useEffect(() => {
    if (config) {
      setAnnouncement(config.announcement_text || "");
      setSiteTitle(config.site_title || "");
      setActiveTheme(config.active_theme || "");
      
      // Parse announcements list
      try {
        const parsed = JSON.parse(config.announcements_list || "[]");
        setAnnouncements(parsed);
      } catch (e) {
        setAnnouncements([]);
      }
      setSpeed(config.announcement_speed || "10");
      setIsMuted(config.announcements_muted === "true");
    }
  }, [config]);

  const handleSave = async (updates: Record<string, string>) => {
    setSaving(true);
    setMessage("");
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      updateConfigLocally(updates);
      setMessage("Settings saved successfully.");
    } catch (e: any) {
      setMessage(e.message || "Failed to save settings.");
    }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  if (!config) return <div className="hg-poll-spin" style={{ margin: "40px auto" }} />;

  return (
    <div className="hg-dash-section" style={{ paddingTop: 8 }}>
      {message && (
        <div style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: "var(--success-soft)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="check" size={14} style={{ color: "var(--success)" }} />
          <span style={{ color: "var(--success)", fontWeight: 600, fontSize: 13 }}>{message}</span>
        </div>
      )}

      {/* ── 2-Column Layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

        {/* ── LEFT: Announcements Manager ── */}
        <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="bell" size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Announcements</h3>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>
              <input 
                type="checkbox" 
                checked={isMuted} 
                onChange={(e) => {
                  const val = e.target.checked;
                  setIsMuted(val);
                  handleSave({ announcements_muted: String(val) });
                }}
                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
              />
              Mute All
            </label>
          </div>

          {/* Add + Speed row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              className="hg-input"
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value)}
              placeholder={announcements.length >= 5 ? "Max 5 reached" : "Enter announcement text..."}
              disabled={announcements.length >= 5}
              style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13 }}
            />
            <Button
              onClick={() => {
                if (!newAnnouncement.trim()) return;
                const next = [
                  ...announcements,
                  { id: Date.now(), text: newAnnouncement.trim(), muted: false }
                ];
                setAnnouncements(next);
                setNewAnnouncement("");
                handleSave({ announcements_list: JSON.stringify(next) });
              }}
              disabled={saving || !newAnnouncement.trim() || announcements.length >= 5}
            >
              Add ({announcements.length}/5)
            </Button>
            <select
              value={speed}
              onChange={(e) => {
                const val = e.target.value;
                setSpeed(val);
                handleSave({ announcement_speed: val });
              }}
              style={{
                padding: "7px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", outline: "none", fontWeight: 600,
                cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
              }}
            >
              <option value="15">Slow (15s)</option>
              <option value="10">Medium (10s)</option>
              <option value="6">Fast (6s)</option>
              <option value="3">Super Fast (3s)</option>
            </select>
          </div>

          {/* Announcements List */}
          {announcements.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {announcements.map((ann, index) => (
                <div 
                  key={ann.id} 
                  style={{ 
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 8,
                    border: "1px solid var(--border-2)",
                    background: ann.muted ? "var(--bg)" : "var(--surface)",
                    opacity: ann.muted ? 0.6 : 1, transition: "opacity 0.2s",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", minWidth: 18 }}>
                    #{index + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>
                    {ann.text}
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, userSelect: "none", color: "var(--text-dim)" }}>
                    <input 
                      type="checkbox"
                      checked={ann.muted}
                      onChange={(e) => {
                        const updated = announcements.map(a => a.id === ann.id ? { ...a, muted: e.target.checked } : a);
                        setAnnouncements(updated);
                        handleSave({ announcements_list: JSON.stringify(updated) });
                      }}
                      style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                    Mute
                  </label>
                  <button 
                    onClick={() => {
                      const updated = announcements.filter(a => a.id !== ann.id);
                      setAnnouncements(updated);
                      handleSave({ announcements_list: JSON.stringify(updated) });
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 2, display: "grid", placeItems: "center" }}
                    title="Delete Announcement"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "14px", color: "var(--text-dim)", fontSize: 12, border: "1.5px dashed var(--border-2)", borderRadius: 8 }}>
              No announcements added yet.
            </div>
          )}
        </div>

        {/* ── RIGHT: Theme Gallery ── */}
        <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="spark" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 16 }}>Theme</h3>
          </div>
          <p className="hg-dim" style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>
            Select a theme. Changes apply instantly.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {THEMES.map((theme) => {
              const isActive = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    setActiveTheme(theme.id);
                    handleSave({ active_theme: theme.id });
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                    border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                    background: isActive ? "var(--accent-soft)" : "var(--surface)",
                    color: "var(--text)", cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s",
                    boxShadow: isActive ? "0 0 12px var(--accent-soft)" : "none",
                  }}
                >
                  <Icon name={theme.icon} size={18} style={{ color: isActive ? "var(--accent)" : "var(--text-dim)" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{theme.label}</span>
                  {isActive && (
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 99 }}>
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
