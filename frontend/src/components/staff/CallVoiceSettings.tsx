"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { useConfigStore } from "@/lib/stores/configStore";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
}

export function CallVoiceSettings() {
  const { config, updateConfigLocally } = useConfigStore();
  const [callerEnabled, setCallerEnabled] = useState(config?.english_caller_enabled === "true");
  const [settings, setSettings] = useState<NumberCallConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTexts, setEditingTexts] = useState<Record<number, string>>({});
  const [uploadingNum, setUploadingNum] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");

  useEffect(() => {
    if (config) {
      setCallerEnabled(config.english_caller_enabled === "true");
    }
  }, [config]);

  const handleToggleGlobalCaller = async () => {
    const nextVal = !callerEnabled;
    setCallerEnabled(nextVal);
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify({ english_caller_enabled: String(nextVal) }),
      });
      updateConfigLocally({ english_caller_enabled: String(nextVal) });
    } catch {
      alert("Failed to update global caller setting.");
      setCallerEnabled(!nextVal);
    }
  };

  const load = () => {
    setLoading(true);
    apiFetch<NumberCallConfig[]>("/api/games/number-calls")
      .then((data) => {
        setSettings(data);
        // Pre-fill editing texts state
        const initialEdits: Record<number, string> = {};
        data.forEach((s) => {
          initialEdits[s.number] = s.call_text;
        });
        setEditingTexts(initialEdits);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();

    const updateVoices = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const all = window.speechSynthesis.getVoices();
      // Filter primarily English and Hindi
      const filtered = all.filter((v) => v.lang.startsWith("en") || v.lang.startsWith("hi"));
      setVoices(filtered.length > 0 ? filtered : all);

      const stored = localStorage.getItem("preferred_caller_voice");
      if (stored) {
        setSelectedVoiceName(stored);
      } else {
        const defaultVoice = all.find(
          (v) =>
            v.name.includes("Google") ||
            v.name.includes("Natural") ||
            v.name.includes("Neural") ||
            v.default
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

  const handleSaveText = async (num: number) => {
    const text = editingTexts[num] || "";
    try {
      await apiFetch(`/api/games/number-calls/${num}`, {
        method: "PATCH",
        body: JSON.stringify({ call_text: text }),
      });
      // Simple flash success
      load();
    } catch {
      alert("Failed to save caller phrase.");
    }
  };

  const handleSaveAll = async () => {
    const changedList = settings.filter((s) => (editingTexts[s.number] ?? s.call_text) !== s.call_text);
    if (changedList.length === 0) return;

    try {
      await Promise.all(
        changedList.map((s) =>
          apiFetch(`/api/games/number-calls/${s.number}`, {
            method: "PATCH",
            body: JSON.stringify({ call_text: editingTexts[s.number] }),
          })
        )
      );
      load();
    } catch {
      alert("Failed to save some changes.");
    }
  };

  const handleRestore = async (num: number) => {
    try {
      await apiFetch(`/api/games/number-calls/${num}/restore`, {
        method: "POST",
      });
      load();
    } catch {
      alert("Failed to restore default phrase.");
    }
  };

  const handleToggleMode = async (num: number, mode: "Text" | "Audio") => {
    try {
      await apiFetch(`/api/games/number-calls/${num}`, {
        method: "PATCH",
        body: JSON.stringify({ call_mode: mode }),
      });
      load();
    } catch {
      alert("Failed to update call mode.");
    }
  };

  const handleFileUpload = async (num: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
      alert("Please upload an MP3 audio file only.");
      return;
    }

    setUploadingNum(num);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        await apiFetch(`/api/games/number-calls/${num}/upload`, {
          method: "POST",
          body: JSON.stringify({ audio_data: base64 }),
        });
        load();
      } catch {
        alert("Upload failed. Ensure backend has write access.");
      } finally {
        setUploadingNum(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const speakTTS = (text: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const all = window.speechSynthesis.getVoices();
    let voice = all.find((v) => v.name === selectedVoiceName);
    if (!voice) {
      voice = all.find((v) => v.lang.includes("en-GB") || v.lang.includes("en-US"));
    }
    if (voice) {
      utterance.voice = voice;
    }
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const playCallPreview = (item: NumberCallConfig) => {
    if (item.call_mode === "Audio" && item.audio_url) {
      const audio = new Audio(item.audio_url);
      audio.play().catch(() => {
        alert("Failed to play audio file. Falling back to TTS.");
        speakTTS(item.call_text);
      });
    } else {
      speakTTS(item.call_text);
    }
  };

  // Filter based on search query
  const filtered = settings.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.number.toString().includes(q) ||
      s.call_text.toLowerCase().includes(q) ||
      s.default_text.toLowerCase().includes(q)
    );
  });

  if (loading && settings.length === 0) {
    return <div className="p-8 text-center text-mute">Loading Caller settings...</div>;
  }

  return (
    <div className="hg-panel">
      <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "16px", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Call Voice &amp; TTS Phrases</h3>
          <p className="text-xs text-mute mt-1">Configure custom call phrases (TTS) or upload specific MP3 audios for numbers 1 to 90.</p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {voices.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Caller Voice:</span>
              <select
                value={selectedVoiceName}
                onChange={(e) => {
                  setSelectedVoiceName(e.target.value);
                  localStorage.setItem("preferred_caller_voice", e.target.value);
                }}
                className="px-2 py-1.5 text-xs border rounded bg-surface outline-none"
                style={{
                  borderRadius: "var(--radius-sm)",
                  borderColor: "var(--border-2)",
                  color: "var(--text)",
                  maxWidth: "280px"
                }}
              >
                {voices.map((v) => {
                  const isPremium = v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural");
                  return (
                    <option 
                      key={v.name} 
                      value={v.name}
                      style={{ backgroundColor: "#1b1c22", color: "#ffffff" }}
                    >
                      {v.name} ({v.lang}){isPremium ? " ✨ Premium" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          {(() => {
            const changedList = settings.filter((s) => (editingTexts[s.number] ?? s.call_text) !== s.call_text);
            if (changedList.length === 0) return null;
            return (
              <div style={{ display: "flex", gap: "8px" }}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    const initialEdits: Record<number, string> = {};
                    settings.forEach((s) => {
                      initialEdits[s.number] = s.call_text;
                    });
                    setEditingTexts(initialEdits);
                  }}
                >
                  Discard
                </Button>
                <Button 
                  variant="cta" 
                  size="sm" 
                  onClick={handleSaveAll}
                >
                  Save Changes ({changedList.length})
                </Button>
              </div>
            );
          })()}

          <label 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              background: "var(--surface)", 
              padding: "6px 12px", 
              borderRadius: "var(--radius-sm)", 
              border: "1px solid var(--border-2)",
              cursor: "pointer", 
              fontSize: "11px", 
              fontWeight: 600,
              color: callerEnabled ? "var(--cyan)" : "var(--text-dim)",
              userSelect: "none"
            }}
          >
            <input
              type="checkbox"
              checked={callerEnabled}
              onChange={handleToggleGlobalCaller}
              style={{
                accentColor: "var(--cyan)",
                width: "14px",
                height: "14px",
                cursor: "pointer"
              }}
            />
            <span>LIVE Game Audio Calls (TTS / MP3)</span>
          </label>

          <input
            type="text"
            placeholder="Search number or phrase..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-xs rounded border outline-none bg-surface"
            style={{
              borderColor: "var(--border-2)",
              borderRadius: "var(--radius-sm)",
              minWidth: "220px",
              color: "var(--text)"
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "650px", overflowY: "auto", paddingRight: "4px" }}>
        {filtered.length === 0 ? (
          <div className="text-center p-8 text-mute">No settings match your search.</div>
        ) : (
          filtered.map((item) => {
            const isModified = item.call_text !== item.default_text;
            const currentEdit = editingTexts[item.number] ?? item.call_text;

            return (
              <div 
                key={item.number} 
                className="hg-card-interactive" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between", 
                  gap: "16px", 
                  padding: "12px 16px", 
                  borderRadius: "var(--radius-md)", 
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap"
                }}
              >
                {/* Number badge & text edit */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 350px" }}>
                  <div 
                    style={{ 
                      width: "42px", 
                      height: "42px", 
                      borderRadius: "50%", 
                      background: "var(--brand-20)", 
                      color: "var(--brand)", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      fontWeight: "bold",
                      fontSize: "16px",
                      border: "2px solid var(--brand)",
                      flexShrink: 0
                    }}
                  >
                    {item.number}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <input 
                        type="text" 
                        value={currentEdit} 
                        onChange={(e) => setEditingTexts({ ...editingTexts, [item.number]: e.target.value })}
                        className="px-3 py-1.5 text-xs rounded border outline-none bg-surface flex-grow"
                        style={{
                          borderColor: "var(--border-2)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text)"
                        }}
                      />
                      {currentEdit !== item.call_text && (
                        <Button 
                          variant="cta" 
                          size="sm" 
                          onClick={() => handleSaveText(item.number)}
                        >
                          Save
                        </Button>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="text-[10px] text-mute">Default: <em>{item.default_text}</em></span>
                      {isModified && (
                        <button 
                          onClick={() => handleRestore(item.number)}
                          className="text-[10px] text-brand hover:underline font-semibold"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          Restore Default
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audio Upload, Preview, and Selection Ticks */}
                <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap", flexShrink: 0 }}>
                  
                  {/* Upload element */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label 
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs cursor-pointer select-none font-semibold ${
                        item.audio_url ? "bg-surface text-text hover:bg-surface-2" : "bg-brand text-bg border-brand hover:opacity-90"
                      }`}
                      style={{
                        borderRadius: "var(--radius-sm)",
                        transition: "all 0.15s ease",
                        opacity: uploadingNum === item.number ? 0.6 : 1,
                        pointerEvents: uploadingNum === item.number ? "none" : "auto"
                      }}
                    >
                      <input 
                        type="file" 
                        accept=".mp3,audio/mpeg" 
                        onChange={(e) => handleFileUpload(item.number, e)}
                        style={{ display: "none" }}
                      />
                      <span>{uploadingNum === item.number ? "Uploading..." : item.audio_url ? "Replace MP3" : "Upload MP3"}</span>
                    </label>
                    
                    <Button 
                      variant="ghost" 
                      size="sm"
                      style={{ padding: "6px" }}
                      onClick={() => playCallPreview(item)}
                    >
                      🔊 Listen
                    </Button>
                  </div>

                  {/* Mode Ticks (Shown only if audio is uploaded) */}
                  {item.audio_url ? (
                    <div 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "12px", 
                        background: "var(--surface)", 
                        padding: "6px 12px", 
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-2)"
                      }}
                    >
                      <label 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "6px", 
                          fontSize: "11px", 
                          cursor: "pointer", 
                          fontWeight: 600,
                          color: item.call_mode === "Text" ? "var(--brand)" : "var(--text)"
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={item.call_mode === "Text"}
                          onChange={() => handleToggleMode(item.number, "Text")}
                          style={{
                            accentColor: "var(--brand)",
                            width: "14px",
                            height: "14px",
                            cursor: "pointer"
                          }}
                        />
                        <span>Text (TTS)</span>
                      </label>
                      <label 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "6px", 
                          fontSize: "11px", 
                          cursor: "pointer", 
                          fontWeight: 600,
                          color: item.call_mode === "Audio" ? "var(--brand)" : "var(--text)"
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={item.call_mode === "Audio"}
                          onChange={() => handleToggleMode(item.number, "Audio")}
                          style={{
                            accentColor: "var(--brand)",
                            width: "14px",
                            height: "14px",
                            cursor: "pointer"
                          }}
                        />
                        <span>Audio File</span>
                      </label>
                    </div>
                  ) : (
                    <div className="text-[10px] text-mute" style={{ width: "135px", textAlign: "center" }}>
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
