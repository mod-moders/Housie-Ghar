"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { useConfigStore } from "@/lib/stores/configStore";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { Icon } from "@/components/Icon";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
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
  const activePreviewRef = useRef<{ number: number; updateVolume: (v: number) => void; audio: HTMLAudioElement } | null>(null);
  const masterVolumeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sound effects and custom speech notes states
  const [cageSound, setCageSound] = useState(config?.cage_sound_enabled !== "false");
  const [celebrationSound, setCelebrationSound] = useState(config?.celebration_sound_enabled !== "false");
  const [welcomeVoice, setWelcomeVoice] = useState(config?.welcome_voice_url || "");
  const [instructionVoice, setInstructionVoice] = useState(config?.instruction_voice_url || "");
  const [bgMusicUrl, setBgMusicUrl] = useState(config?.background_music_url || "");
  const [bgMusicEnabled, setBgMusicEnabled] = useState(config?.background_music_enabled === "true");
  const [bgMusicVolume, setBgMusicVolume] = useState(parseFloat(config?.background_music_volume || "0.15"));
  const [masterCallsVolume, setMasterCallsVolume] = useState(parseFloat(config?.master_calls_volume || "1.0"));
  const [uploadingVoiceKey, setUploadingVoiceKey] = useState<string | null>(null);
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);

  // Voice note fallbacks & voice choices states
  const [welcomeText, setWelcomeText] = useState(config?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.");
  const [instructionText, setInstructionText] = useState(config?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.");
  const [selectedWelcomeVoice, setSelectedWelcomeVoice] = useState("");
  const [selectedInstructionVoice, setSelectedInstructionVoice] = useState("");

  useEffect(() => {
    if (config) {
      setCallerEnabled(config.english_caller_enabled === "true");
      setCageSound(config.cage_sound_enabled !== "false");
      setCelebrationSound(config.celebration_sound_enabled !== "false");
      setWelcomeVoice(config.welcome_voice_url || "");
      setInstructionVoice(config.instruction_voice_url || "");
      setBgMusicUrl(config.background_music_url || "");
      setBgMusicEnabled(config.background_music_enabled === "true");
      setBgMusicVolume(parseFloat(config.background_music_volume || "0.15"));
      setMasterCallsVolume(parseFloat(config.master_calls_volume || "1.0"));
      setWelcomeText(config.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.");
      setInstructionText(config.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.");
    }
  }, [config]);

  useEffect(() => {
    return () => {
      if (masterVolumeSaveTimeoutRef.current) {
        clearTimeout(masterVolumeSaveTimeoutRef.current);
      }
      if (activePreviewRef.current) {
        try {
          activePreviewRef.current.audio.pause();
          activePreviewRef.current.audio.src = "";
        } catch {}
      }
    };
  }, []);

  const handleSaveConfig = async (updates: Record<string, string>) => {
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      updateConfigLocally(updates);
    } catch {
      alert("Failed to update sound config settings.");
    }
  };

  const handleConfigAudioUpload = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/") && !file.name.endsWith(".mp3") && !file.name.endsWith(".wav") && !file.name.endsWith(".m4a")) {
      alert("Please upload a valid audio file (MP3, WAV, or M4A).");
      return;
    }

    setUploadingVoiceKey(key);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        await handleSaveConfig({ [key]: base64 });
      } catch {
        alert("Upload failed.");
      } finally {
        setUploadingVoiceKey(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePreviewAudio = (audioData: string, fallbackText: string, forcedVoiceName: string | null = null) => {
    if (previewingUrl) {
      window.speechSynthesis.cancel();
      const existing = document.getElementById("preview-audio-element") as HTMLAudioElement;
      if (existing) {
        existing.pause();
        existing.src = "";
      }
      setPreviewingUrl(null);
      return;
    }

    if (!audioData) {
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        const voices = window.speechSynthesis.getVoices();
        let voice = voices.find(v => v.name === forcedVoiceName);
        if (!voice) {
          voice = voices.find(v => v.lang.includes("en-GB") || v.lang.includes("en-US"));
        }
        if (voice) {
          utterance.voice = voice;
        }
        window.speechSynthesis.speak(utterance);
        setPreviewingUrl("tts");
        utterance.onend = () => setPreviewingUrl(null);
      } else {
        alert("Audio not uploaded, and TTS not supported in this browser.");
      }
      return;
    }

    const audio = new Audio(audioData);
    audio.id = "preview-audio-element";
    audio.volume = 0.8;
    audio.play().then(() => {
      setPreviewingUrl(audioData);
    }).catch(() => {
      alert("Failed to play audio preview.");
    });
    audio.onended = () => {
      setPreviewingUrl(null);
    };
  };

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
      const defaultVoice = all.find(
        (v) =>
          v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Neural") ||
          v.default
      );
      
      if (stored) {
        setSelectedVoiceName(stored);
      } else if (defaultVoice) {
        setSelectedVoiceName(defaultVoice.name);
        localStorage.setItem("preferred_caller_voice", defaultVoice.name);
      }

      const storedWelcome = localStorage.getItem("welcome_voice_name");
      if (storedWelcome) {
        setSelectedWelcomeVoice(storedWelcome);
      } else if (defaultVoice) {
        setSelectedWelcomeVoice(defaultVoice.name);
        localStorage.setItem("welcome_voice_name", defaultVoice.name);
      }

      const storedInstruction = localStorage.getItem("instruction_voice_name");
      if (storedInstruction) {
        setSelectedInstructionVoice(storedInstruction);
      } else if (defaultVoice) {
        setSelectedInstructionVoice(defaultVoice.name);
        localStorage.setItem("instruction_voice_name", defaultVoice.name);
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

    const fileName = file.name.toLowerCase().trim();
    const hasAudioOrVideoExtension = fileName.endsWith(".mp3") ||
                                     fileName.endsWith(".wav") ||
                                     fileName.endsWith(".m4a") ||
                                     fileName.endsWith(".mpeg") ||
                                     fileName.endsWith(".aac") ||
                                     fileName.endsWith(".ogg") ||
                                     fileName.endsWith(".wma") ||
                                     fileName.endsWith(".mp4");
    const isAudioOrVideo = hasAudioOrVideoExtension || file.type.startsWith("audio/") || file.type === "video/mp4";

    if (!isAudioOrVideo) {
      alert(`Please upload an MP3, MP4 or standard audio/video file only. (Detected file: ${file.name}, type: ${file.type || "unknown"})`);
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

  const handleDeleteAudio = async (num: number) => {
    if (!window.confirm(`Are you sure you want to delete the uploaded audio file for number ${num}?`)) return;
    try {
      await apiFetch(`/api/games/number-calls/${num}/audio`, {
        method: "DELETE",
      });
      load();
    } catch {
      alert("Failed to delete audio file.");
    }
  };

  const handleVolumeChange = async (num: number, vol: number) => {
    try {
      // Optimistically update local state first for smooth slider dragging
      setSettings(prev => prev.map(s => s.number === num ? { ...s, volume: vol } : s));

      // Update currently playing preview volume if it matches
      if (activePreviewRef.current && activePreviewRef.current.number === num) {
        const effectiveVol = vol * masterCallsVolume;
        activePreviewRef.current.updateVolume(effectiveVol);
      }
      
      await apiFetch(`/api/games/number-calls/${num}`, {
        method: "PATCH",
        body: JSON.stringify({ volume: vol }),
      });
    } catch {
      alert("Failed to update volume.");
      load();
    }
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
    if (activePreviewRef.current) {
      try {
        activePreviewRef.current.audio.pause();
        activePreviewRef.current.audio.src = "";
      } catch {}
      activePreviewRef.current = null;
    }

    if (item.call_mode === "Audio" && item.audio_url) {
      const audio = new Audio(item.audio_url);
      audio.volume = 1.0;
      const itemVol = item.volume !== undefined ? item.volume : 1.0;
      const effectiveVol = itemVol * masterCallsVolume;
      const handle = soundSynthesizer.applyLiveAnnouncementEcho(audio, effectiveVol);
      
      if (handle) {
        activePreviewRef.current = {
          number: item.number,
          updateVolume: handle.updateVolume,
          audio
        };
      }

      audio.onended = () => {
        if (activePreviewRef.current?.audio === audio) {
          activePreviewRef.current = null;
        }
      };

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

      {/* ── Enhanced Audio & Sound Configuration Card ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 20 }}>
        {/* Left Column: Welcome & Instruction Notes */}
        <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="volume" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 15 }}>Intro Voice Notes</h3>
          </div>
          <p className="hg-dim" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.3 }}>
            These audio messages will play first sequentially when the game starts, before calling begins.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {/* Welcome note row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>1. Welcome Voice Note</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: welcomeVoice ? "var(--success)" : "var(--text-dim)" }}>
                  {welcomeVoice ? "✓ Custom File" : "Text-to-Speech"}
                </span>
              </div>

              {/* Edit TTS text fallback */}
              {!welcomeVoice && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)" }}>TTS Text Fallback:</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      placeholder="Welcome note text..."
                      style={{ flex: 1, padding: "5px 10px", borderRadius: 6, border: "1.5px solid var(--border-2)", background: "var(--bg)", color: "var(--text)", fontSize: 12, outline: "none" }}
                    />
                    {welcomeText !== (config?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.") && (
                      <Button
                        variant="cta"
                        size="sm"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => handleSaveConfig({ welcome_voice_text: welcomeText })}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Select TTS voice option */}
              {!welcomeVoice && voices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)" }}>TTS Voice:</span>
                  <select
                    value={selectedWelcomeVoice}
                    onChange={(e) => {
                      setSelectedWelcomeVoice(e.target.value);
                      localStorage.setItem("welcome_voice_name", e.target.value);
                    }}
                    style={{
                      padding: "5px 10px", borderRadius: 6,
                      border: "1.5px solid var(--border-2)", background: "var(--bg)",
                      color: "var(--text)", outline: "none", fontSize: 12, cursor: "pointer", width: "100%"
                    }}
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name} style={{ backgroundColor: "#1b1c22", color: "#ffffff" }}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                <label className="hg-btn" style={{
                  background: "var(--brand-20)", color: "var(--brand)", border: "1px solid var(--brand)",
                  padding: "5px 10px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  opacity: uploadingVoiceKey === "welcome_voice_url" ? 0.6 : 1, display: "inline-flex", alignItems: "center"
                }}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleConfigAudioUpload("welcome_voice_url", e)}
                    style={{ display: "none" }}
                    disabled={uploadingVoiceKey !== null}
                  />
                  {uploadingVoiceKey === "welcome_voice_url" ? "Uploading..." : welcomeVoice ? "Replace File" : "Upload File"}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handlePreviewAudio(welcomeVoice, welcomeText, selectedWelcomeVoice)}
                >
                  {previewingUrl === welcomeVoice || previewingUrl === "tts" ? "⏹ Stop" : "🔊 Listen"}
                </Button>
                {welcomeVoice && (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ color: "var(--danger)", padding: "4px 8px", fontSize: 11 }}
                    onClick={() => handleSaveConfig({ welcome_voice_url: "" })}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Instruction note row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>2. Instruction Voice Note</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: instructionVoice ? "var(--success)" : "var(--text-dim)" }}>
                  {instructionVoice ? "✓ Custom File" : "Text-to-Speech"}
                </span>
              </div>

              {/* Edit TTS text fallback */}
              {!instructionVoice && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)" }}>TTS Text Fallback:</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Instruction note text..."
                      style={{ flex: 1, padding: "5px 10px", borderRadius: 6, border: "1.5px solid var(--border-2)", background: "var(--bg)", color: "var(--text)", fontSize: 12, outline: "none" }}
                    />
                    {instructionText !== (config?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.") && (
                      <Button
                        variant="cta"
                        size="sm"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => handleSaveConfig({ instruction_voice_text: instructionText })}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Select TTS voice option */}
              {!instructionVoice && voices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)" }}>TTS Voice:</span>
                  <select
                    value={selectedInstructionVoice}
                    onChange={(e) => {
                      setSelectedInstructionVoice(e.target.value);
                      localStorage.setItem("instruction_voice_name", e.target.value);
                    }}
                    style={{
                      padding: "5px 10px", borderRadius: 6,
                      border: "1.5px solid var(--border-2)", background: "var(--bg)",
                      color: "var(--text)", outline: "none", fontSize: 12, cursor: "pointer", width: "100%"
                    }}
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name} style={{ backgroundColor: "#1b1c22", color: "#ffffff" }}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                <label className="hg-btn" style={{
                  background: "var(--brand-20)", color: "var(--brand)", border: "1px solid var(--brand)",
                  padding: "5px 10px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  opacity: uploadingVoiceKey === "instruction_voice_url" ? 0.6 : 1, display: "inline-flex", alignItems: "center"
                }}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleConfigAudioUpload("instruction_voice_url", e)}
                    style={{ display: "none" }}
                    disabled={uploadingVoiceKey !== null}
                  />
                  {uploadingVoiceKey === "instruction_voice_url" ? "Uploading..." : instructionVoice ? "Replace File" : "Upload File"}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handlePreviewAudio(instructionVoice, instructionText, selectedInstructionVoice)}
                >
                  {previewingUrl === instructionVoice || previewingUrl === "tts" ? "⏹ Stop" : "🔊 Listen"}
                </Button>
                {instructionVoice && (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ color: "var(--danger)", padding: "4px 8px", fontSize: 11 }}
                    onClick={() => handleSaveConfig({ instruction_voice_url: "" })}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Background Music & Effects */}
        <div className="hg-card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="music" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 15 }}>Gameplay Background Music</h3>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Music Toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={bgMusicEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setBgMusicEnabled(val);
                  handleSaveConfig({ background_music_enabled: String(val) });
                }}
                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
              />
              Enable loopable BG music during live game
            </label>

            {/* Selection list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Select Audio Sound
              </span>
              <select
                value={bgMusicUrl.startsWith("data:") ? "custom" : bgMusicUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    // Do nothing
                  } else {
                    setBgMusicUrl(val);
                    handleSaveConfig({ background_music_url: val });
                  }
                }}
                style={{
                  padding: "7px 10px", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-2)", background: "var(--surface-2)",
                  color: "var(--text)", outline: "none", fontWeight: 600,
                  cursor: "pointer", fontSize: 12, width: "100%"
                }}
              >
                <option value="">None / Silent</option>
                <option value="/audio/music/soft_lounge.wav">Preset 1: Soft Lounge Loop</option>
                <option value="/audio/music/retro_arcade.wav">Preset 2: Retro Arcade Loop</option>
                <option value="/audio/music/traditional_flute.wav">Preset 3: Calm Indian Flute</option>
                {bgMusicUrl.startsWith("data:") && (
                  <option value="custom">✓ Custom Uploaded Music</option>
                )}
              </select>
            </div>

            {/* Custom music upload field */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label className="hg-btn" style={{
                background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-2)",
                padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                opacity: uploadingVoiceKey === "background_music_url" ? 0.6 : 1, display: "inline-flex", alignItems: "center"
              }}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleConfigAudioUpload("background_music_url", e)}
                  style={{ display: "none" }}
                  disabled={uploadingVoiceKey !== null}
                />
                📁 {uploadingVoiceKey === "background_music_url" ? "Uploading..." : "Upload Custom BG Music"}
              </label>

              {bgMusicUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={() => handlePreviewAudio(bgMusicUrl, "")}
                >
                  {previewingUrl === bgMusicUrl ? "⏹ Stop Preview" : "🔊 Preview"}
                </Button>
              )}
            </div>

            {/* Volume slider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>
                BG Volume: {Math.round(bgMusicVolume * 100)}%
              </span>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={bgMusicVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBgMusicVolume(val);
                  handleSaveConfig({ background_music_volume: String(val) });
                }}
                style={{ flex: 1, accentColor: "var(--accent)", height: 4, cursor: "pointer" }}
              />
            </div>

            {/* Master call audio volume fader */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", marginTop: "8px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                Master Voice Vol: {Math.round(masterCallsVolume * 50)}%
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(masterCallsVolume * 50)}
                onChange={(e) => {
                  const sliderVal = parseInt(e.target.value, 10);
                  const gainVal = sliderVal / 50;
                  setMasterCallsVolume(gainVal);

                  // Update all individual call volumes to match the new value immediately in local state
                  setSettings(prev => prev.map(s => ({ ...s, volume: gainVal })));

                  // Dynamically adjust currently playing preview volume if exists
                  if (activePreviewRef.current) {
                    const item = settings.find(s => s.number === activePreviewRef.current?.number);
                    const itemVol = item?.volume !== undefined ? item.volume : 1.0;
                    activePreviewRef.current.updateVolume(itemVol * gainVal);
                  }

                  // Debounce DB saves to avoid overloading on drag
                  if (masterVolumeSaveTimeoutRef.current) {
                    clearTimeout(masterVolumeSaveTimeoutRef.current);
                  }
                  masterVolumeSaveTimeoutRef.current = setTimeout(async () => {
                    try {
                      await handleSaveConfig({ master_calls_volume: String(gainVal) });
                      await apiFetch("/api/games/number-calls-bulk-volume", {
                        method: "PATCH",
                        body: JSON.stringify({ volume: gainVal }),
                      });
                    } catch {}
                  }, 250);
                }}
                style={{ flex: 1, accentColor: "var(--accent)", height: 4, cursor: "pointer" }}
              />
            </div>

            {/* Sound Toggles */}
            <div style={{ display: "flex", gap: 16, marginTop: 4, borderTop: "1px solid var(--border-2)", paddingTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={cageSound}
                  onChange={(e) => {
                    setCageSound(e.target.checked);
                    handleSaveConfig({ cage_sound_enabled: String(e.target.checked) });
                  }}
                  style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                />
                Cage Spinning Sound
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={celebrationSound}
                  onChange={(e) => {
                    setCelebrationSound(e.target.checked);
                    handleSaveConfig({ celebration_sound_enabled: String(e.target.checked) });
                  }}
                  style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                />
                Winner Sound
              </label>
            </div>
          </div>
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
                        accept="audio/*,video/mp4,.mp3,.wav,.m4a,.mpeg,.aac,.ogg,.wma,.mp4" 
                        onChange={(e) => handleFileUpload(item.number, e)}
                        style={{ display: "none" }}
                      />
                      <span>{uploadingNum === item.number ? "Uploading..." : item.audio_url ? "Replace File" : "Upload File"}</span>
                    </label>
                    
                    <Button 
                      variant="ghost" 
                      size="sm"
                      style={{ padding: "6px" }}
                      onClick={() => playCallPreview(item)}
                    >
                      🔊 Listen
                    </Button>

                    {item.audio_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ padding: "6px", color: "var(--danger)" }}
                        onClick={() => handleDeleteAudio(item.number)}
                      >
                        🗑️ Delete
                      </Button>
                    )}
                  </div>

                  {/* Volume Slider (Shown only if audio is uploaded) */}
                  {item.audio_url && (
                    <div 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "8px", 
                        background: "var(--surface)", 
                        padding: "4px 10px", 
                        borderRadius: "var(--radius-sm)", 
                        border: "1px solid var(--border-2)", 
                        minWidth: "125px" 
                      }}
                    >
                      <span className="text-[10px] text-mute font-bold" style={{ whiteSpace: "nowrap" }}>
                        Vol: {Math.round((item.volume !== undefined ? item.volume : 1.0) * 50)}%
                      </span>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="1" 
                        value={Math.round((item.volume !== undefined ? item.volume : 1.0) * 50)} 
                        onChange={(e) => {
                          const sliderVal = parseInt(e.target.value, 10);
                          const gainVal = sliderVal / 50;
                          handleVolumeChange(item.number, gainVal);
                        }} 
                        style={{ 
                          width: "70px", 
                          accentColor: "var(--brand)", 
                          cursor: "pointer",
                          height: "4px"
                        }}
                      />
                    </div>
                  )}

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
