"use client";
/**
 * Caller voice & TTS phrase manager (Admin/Superadmin), reached from the Games
 * section. Edits the per-number caller phrases (Number_Calls, 1–90), uploads
 * MP3 clips, and toggles the platform-wide live-board audio caller.
 *
 * Self-contained: phrases come from GET /api/games/number-calls, the global
 * flag from GET /api/config/public. Flipping the flag PUTs /api/config, which
 * is Superadmin-only — the toggle is hidden for plain Admins.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/lib/stores/authStore";
import type { NumberCallConfig, PublicConfigResponse } from "@/lib/types";

// Uploaded MP3s live on the backend origin; same-origin dev goes through the
// /audio rewrite in next.config.ts.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function CallVoiceSettings() {
  const me = useAuthStore((s) => s.user);
  const [callerEnabled, setCallerEnabled] = useState(true);
  const [settings, setSettings] = useState<NumberCallConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTexts, setEditingTexts] = useState<Record<number, string>>({});
  const [uploadingNum, setUploadingNum] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");

  // No synchronous setState — safe to call from the mount effect (React
  // Compiler rule). The initial `loading` state is already true; handler-driven
  // refetches swap the rows in place without a spinner flash.
  const load = () => {
    apiFetch<NumberCallConfig[]>("/api/games/number-calls")
      .then((data) => {
        setSettings(data);
        const initialEdits: Record<number, string> = {};
        data.forEach((s) => { initialEdits[s.number] = s.call_text; });
        setEditingTexts(initialEdits);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load caller settings"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    apiFetch<PublicConfigResponse>("/api/config/public")
      .then((cfg) => setCallerEnabled(cfg.english_caller_enabled !== "false"))
      .catch(() => {});

    const updateVoices = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const all = window.speechSynthesis.getVoices();
      const filtered = all.filter((v) => v.lang.startsWith("en") || v.lang.startsWith("hi"));
      setVoices(filtered.length > 0 ? filtered : all);

      const stored = localStorage.getItem("preferred_caller_voice");
      if (stored) {
        setSelectedVoiceName(stored);
      } else {
        const defaultVoice = all.find(
          (v) => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural") || v.default
        );
        if (defaultVoice) {
          setSelectedVoiceName(defaultVoice.name);
          localStorage.setItem("preferred_caller_voice", defaultVoice.name);
        }
      }
    };

    updateVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const toggleGlobalCaller = async () => {
    const nextVal = !callerEnabled;
    setCallerEnabled(nextVal);
    setError(null);
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify({ english_caller_enabled: String(nextVal) }),
      });
    } catch (e) {
      setCallerEnabled(!nextVal);
      setError(e instanceof Error ? e.message : "Failed to update the caller setting");
    }
  };

  const saveText = async (num: number) => {
    setError(null);
    try {
      await apiFetch(`/api/games/number-calls/${num}`, {
        method: "PATCH",
        body: JSON.stringify({ call_text: editingTexts[num] || "" }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the caller phrase");
    }
  };

  const saveAll = async () => {
    const changed = settings.filter((s) => (editingTexts[s.number] ?? s.call_text) !== s.call_text);
    if (changed.length === 0) return;
    setError(null);
    try {
      await Promise.all(
        changed.map((s) =>
          apiFetch(`/api/games/number-calls/${s.number}`, {
            method: "PATCH",
            body: JSON.stringify({ call_text: editingTexts[s.number] }),
          })
        )
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save some changes");
    }
  };

  const restore = async (num: number) => {
    setError(null);
    try {
      await apiFetch(`/api/games/number-calls/${num}/restore`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore the default phrase");
    }
  };

  const toggleMode = async (num: number, mode: "Text" | "Audio") => {
    setError(null);
    try {
      await apiFetch(`/api/games/number-calls/${num}`, {
        method: "PATCH",
        body: JSON.stringify({ call_mode: mode }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update the call mode");
    }
  };

  const uploadFile = (num: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
      setError("Please upload an MP3 audio file only.");
      return;
    }

    setError(null);
    setUploadingNum(num);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiFetch(`/api/games/number-calls/${num}/audio`, {
          method: "POST",
          body: JSON.stringify({ audio_data: reader.result as string }),
        });
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingNum(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const speakTTS = (text: string) => {
    if (!("speechSynthesis" in window)) {
      setError("Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const all = window.speechSynthesis.getVoices();
    const voice =
      all.find((v) => v.name === selectedVoiceName) ??
      all.find((v) => v.lang.includes("en-GB") || v.lang.includes("en-US"));
    if (voice) utterance.voice = voice;
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const playPreview = (item: NumberCallConfig) => {
    if (item.call_mode === "Audio" && item.audio_url) {
      const audio = new Audio(`${API_BASE}${item.audio_url}`);
      audio.play().catch(() => speakTTS(item.call_text));
    } else {
      speakTTS(item.call_text);
    }
  };

  const filtered = settings.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.number.toString().includes(q) ||
      s.call_text.toLowerCase().includes(q) ||
      s.default_text.toLowerCase().includes(q)
    );
  });

  const changedCount = settings.filter((s) => (editingTexts[s.number] ?? s.call_text) !== s.call_text).length;

  if (loading && settings.length === 0) {
    return (
      <div className="hg-panel" style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <span className="hg-poll-spin" />
      </div>
    );
  }

  return (
    <div className="hg-panel">
      <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: 16, marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Call Voice &amp; TTS Phrases</h3>
          <p className="hg-sec-sub" style={{ margin: "2px 0 0" }}>
            Custom caller phrases (TTS) or uploaded MP3 clips for numbers 1–90.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {voices.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Caller voice:</span>
              <select
                value={selectedVoiceName}
                onChange={(e) => {
                  setSelectedVoiceName(e.target.value);
                  localStorage.setItem("preferred_caller_voice", e.target.value);
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  maxWidth: 280,
                  outline: "none",
                }}
              >
                {voices.map((v) => {
                  const isPremium = v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural");
                  return (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang}){isPremium ? " ✨" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          {changedCount > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const initialEdits: Record<number, string> = {};
                  settings.forEach((s) => { initialEdits[s.number] = s.call_text; });
                  setEditingTexts(initialEdits);
                }}
              >
                Discard
              </Button>
              <Button variant="cta" size="sm" onClick={saveAll}>
                Save Changes ({changedCount})
              </Button>
            </div>
          )}

          {me?.role_name === "Superadmin" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--surface)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-2)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: callerEnabled ? "var(--cyan)" : "var(--text-dim)",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={callerEnabled}
                onChange={toggleGlobalCaller}
                style={{ accentColor: "var(--cyan)", width: 14, height: 14, cursor: "pointer" }}
              />
              <span>Live game audio calls (TTS / MP3)</span>
            </label>
          )}

          <input
            type="text"
            placeholder="Search number or phrase…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              color: "var(--text)",
              minWidth: 220,
              outline: "none",
            }}
          />
        </div>
      </div>

      {error && <p className="hg-sec-err" style={{ marginBottom: 10 }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 650, overflowY: "auto", paddingRight: 4 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-mute)" }}>No settings match your search.</div>
        ) : (
          filtered.map((item) => {
            const isModified = item.call_text !== item.default_text;
            const currentEdit = editingTexts[item.number] ?? item.call_text;

            return (
              <div
                key={item.number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "12px 16px",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "1 1 350px" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: "var(--accent-soft)",
                      color: "var(--text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 16,
                      fontFamily: "var(--font-mono)",
                      border: "2px solid var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    {item.number}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                    <div style={{ display: "flex", gap: 8, width: "100%" }}>
                      <input
                        type="text"
                        value={currentEdit}
                        onChange={(e) => setEditingTexts({ ...editingTexts, [item.number]: e.target.value })}
                        style={{
                          flexGrow: 1,
                          padding: "6px 12px",
                          fontSize: 12,
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-2)",
                          background: "var(--surface)",
                          color: "var(--text)",
                          outline: "none",
                        }}
                      />
                      {currentEdit !== item.call_text && (
                        <Button variant="cta" size="sm" onClick={() => saveText(item.number)}>Save</Button>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-mute)" }}>Default: <em>{item.default_text}</em></span>
                      {isModified && (
                        <button
                          onClick={() => restore(item.number)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 10, fontWeight: 600, color: "var(--accent)" }}
                        >
                          Restore default
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-2)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        userSelect: "none",
                        background: item.audio_url ? "var(--surface)" : "var(--accent)",
                        color: item.audio_url ? "var(--text)" : "var(--accent-ink)",
                        opacity: uploadingNum === item.number ? 0.6 : 1,
                        pointerEvents: uploadingNum === item.number ? "none" : "auto",
                      }}
                    >
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        onChange={(e) => uploadFile(item.number, e)}
                        style={{ display: "none" }}
                      />
                      <span>{uploadingNum === item.number ? "Uploading…" : item.audio_url ? "Replace MP3" : "Upload MP3"}</span>
                    </label>

                    <Button variant="ghost" size="sm" icon="volume" onClick={() => playPreview(item)}>
                      Listen
                    </Button>
                  </div>

                  {item.audio_url ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "var(--surface)",
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-2)",
                      }}
                    >
                      {(["Text", "Audio"] as const).map((mode) => (
                        <label
                          key={mode}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 11,
                            cursor: "pointer",
                            fontWeight: 600,
                            color: item.call_mode === mode ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.call_mode === mode}
                            onChange={() => toggleMode(item.number, mode)}
                            style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
                          />
                          <span>{mode === "Text" ? "Text (TTS)" : "Audio file"}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--text-mute)", width: 135, textAlign: "center" }}>
                      Text-only (TTS)
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
