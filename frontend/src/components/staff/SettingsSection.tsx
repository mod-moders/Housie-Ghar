"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useConfigStore } from "@/lib/stores/configStore";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useAuthStore } from "@/lib/stores/authStore";

const THEMES = [
  { id: "luxury_gold", label: "Luxury Gold", icon: "star" },
  { id: "digital_neon", label: "Digital Neon", icon: "zap" },
  { id: "playful_kids", label: "Playful Kids", icon: "users" }
];

interface WhatsAppShareGroup {
  name: string;
  url: string;
}

export function SettingsSection() {
  const { config, updateConfigLocally } = useConfigStore();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role_name === "Superadmin";
  const [saving, setSaving] = useState(false);
  const [activeTheme, setActiveTheme] = useState("");
  const [message, setMessage] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Announcements manager states
  const [announcements, setAnnouncements] = useState<Array<{ id: number; text: string; muted: boolean }>>([]);
  const [speed, setSpeed] = useState("10");
  const [isMuted, setIsMuted] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [shareGroups, setShareGroups] = useState<WhatsAppShareGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupUrl, setGroupUrl] = useState("");

  useEffect(() => {
    if (config) {
      // Seed editable form fields from the live config store when it loads or
      // changes. config starts null and populates async, so a lazy initial value
      // can't capture it — mirroring via effect is the correct pattern here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTheme(config.active_theme || "");

      // Parse announcements list
      try {
        const parsed = JSON.parse(config.announcements_list || "[]");
        setAnnouncements(parsed);
      } catch {
        setAnnouncements([]);
      }
      setSpeed(config.announcement_speed || "10");
      setIsMuted(config.announcements_muted === "true");
    }
  }, [config]);

  useEffect(() => {
    apiFetch<Array<{ config_key: string; config_value: string }>>("/api/config")
      .then((items) => {
        const raw = items.find((item) => item.config_key === "whatsapp_share_groups")?.config_value ?? "[]";
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setShareGroups(parsed.filter((group): group is WhatsAppShareGroup =>
              !!group && typeof group === "object" &&
              typeof (group as { name?: unknown }).name === "string" &&
              typeof (group as { url?: unknown }).url === "string"
            ));
          }
        } catch {
          setShareGroups([]);
        }
      })
      .catch(() => setShareGroups([]));
  }, []);

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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save settings.");
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

        {/* ── RIGHT: Theme & Info Groups Column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Theme Gallery Card */}
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

          {/* Official Info Groups Card */}
          <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="chat" size={18} style={{ color: "var(--accent)" }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Official Info Groups</h3>
                <p className="hg-dim" style={{ margin: "2px 0 0", fontSize: 11, lineHeight: 1.3 }}>Configure up to 5 WhatsApp groups for direct game &amp; winner sharing.</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Group Name
                </span>
                <input
                  className="hg-input"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. Official Group A"
                  disabled={shareGroups.length >= 5}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-2)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  WhatsApp Group Link
                </span>
                <input
                  className="hg-input"
                  value={groupUrl}
                  onChange={(event) => setGroupUrl(event.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  disabled={shareGroups.length >= 5}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-2)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none"
                  }}
                />
              </div>

              <Button
                disabled={saving || !groupName.trim() || !groupUrl.trim().startsWith("http") || shareGroups.length >= 5}
                onClick={() => {
                  if (shareGroups.length >= 5) return;
                  const next = [...shareGroups, { name: groupName.trim(), url: groupUrl.trim() }];
                  setShareGroups(next);
                  setGroupName("");
                  setGroupUrl("");
                  handleSave({ whatsapp_share_groups: JSON.stringify(next) });
                }}
                style={{ width: "100%", fontSize: 12.5, marginTop: 4 }}
              >
                Add Group ({shareGroups.length}/5)
              </Button>
            </div>

            {shareGroups.length >= 5 && (
              <p style={{ color: "var(--danger)", margin: 0, fontSize: 11, fontWeight: 600, lineHeight: 1.4 }}>
                Maximum limit of 5 official info groups reached. Remove an existing group to add a new one.
              </p>
            )}

            {shareGroups.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 2 }}>
                  Configured Groups
                </span>
                {shareGroups.map((group) => (
                  <div
                    key={`${group.name}-${group.url}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      border: "1px solid var(--border-2)",
                      borderRadius: 8,
                      background: "var(--surface-2)",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                      <Icon name="chat" size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", color: "var(--text)" }}>
                          {group.name}
                        </span>
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", color: "var(--text-mute)", fontSize: 10.5, fontWeight: 400 }}>
                          {group.url}
                        </span>
                      </div>
                    </div>
                    <button
                      title={`Remove ${group.name}`}
                      onClick={() => {
                        const next = shareGroups.filter((item) => item !== group);
                        setShareGroups(next);
                        handleSave({ whatsapp_share_groups: JSON.stringify(next) });
                      }}
                      style={{
                        display: "grid",
                        placeItems: "center",
                        padding: 4,
                        background: "none",
                        border: 0,
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        borderRadius: "50%",
                        transition: "all 0.15s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--danger-soft)";
                        e.currentTarget.style.color = "var(--danger)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-dim)";
                      }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px", color: "var(--text-mute)", fontSize: 12, border: "1.5px dashed var(--border)", borderRadius: 8, marginTop: 8, fontStyle: "italic" }}>
                No groups configured yet.
              </div>
            )}
          </div>

          {/* Danger Zone / Database reset for Superadmin only */}
          {isSuperadmin && (
            <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, border: "1.5px solid var(--danger)", boxShadow: "0 0 15px rgba(239, 68, 68, 0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="trash" size={18} style={{ color: "var(--danger)" }} />
                <h3 style={{ margin: 0, fontSize: 16, color: "var(--danger)" }}>Danger Zone</h3>
              </div>
              <p className="hg-dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.4 }}>
                Permanently purge all game stats, ticket logs, bookings, financial history, and reset agent balances to zero.
              </p>
              
              {!showResetConfirm ? (
                <Button 
                  onClick={() => setShowResetConfirm(true)}
                  style={{ background: "var(--danger)", color: "#fff", border: "none", marginTop: 4, width: "100%" }}
                >
                  Reset Platform Database
                </Button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4, padding: "12px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>
                    ⚠️ WARNING: This action is irreversible. Type &quot;RESET&quot; below to confirm:
                  </span>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type RESET here..."
                    style={{
                      padding: "8px 12px", borderRadius: 8,
                      border: "1.5px solid var(--danger)", background: "var(--bg)",
                      color: "var(--text)", fontSize: 13, outline: "none", width: "100%"
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Button
                      onClick={() => {
                        setShowResetConfirm(false);
                        setResetConfirmText("");
                      }}
                      variant="ghost"
                      style={{ flex: 1, fontSize: 12 }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={isResetting || resetConfirmText !== "RESET"}
                      onClick={async () => {
                        setIsResetting(true);
                        try {
                          const res = await apiFetch<{ message: string }>("/api/config/reset-database", { method: "POST" });
                          setMessage(res.message);
                          setShowResetConfirm(false);
                          setResetConfirmText("");
                          // Reload the page after 2 seconds to refresh all statistics
                          setTimeout(() => window.location.reload(), 2000);
                        } catch (e) {
                          setMessage(e instanceof Error ? e.message : "Reset failed.");
                        } finally {
                          setIsResetting(false);
                        }
                      }}
                      style={{ flex: 1, background: "var(--danger)", color: "#fff", border: "none", fontSize: 12 }}
                    >
                      {isResetting ? "Resetting..." : "Confirm Purge"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
