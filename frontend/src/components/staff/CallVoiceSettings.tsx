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
  const [lobbyMusicVolume, setLobbyMusicVolume] = useState(parseFloat(config?.lobby_music_volume || "0.15"));
  const [masterCallsVolume, setMasterCallsVolume] = useState(parseFloat(config?.master_calls_volume || "1.0"));
  const [uploadingVoiceKey, setUploadingVoiceKey] = useState<string | null>(null);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"playing" | "paused" | "stopped">("stopped");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [previewingCage, setPreviewingCage] = useState(false);

  // Voice note fallbacks & voice choices states
  const [welcomeText, setWelcomeText] = useState(config?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.");
  const [instructionText, setInstructionText] = useState(config?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.");
  const [welcomeVoiceMode, setWelcomeVoiceMode] = useState(config?.welcome_voice_mode || "Text");
  const [instructionVoiceMode, setInstructionVoiceMode] = useState(config?.instruction_voice_mode || "Text");
  const [welcomeVoiceVolume, setWelcomeVoiceVolume] = useState(parseFloat(config?.welcome_voice_volume || "1.0"));
  const [instructionVoiceVolume, setInstructionVoiceVolume] = useState(parseFloat(config?.instruction_voice_volume || "1.0"));
  const [ttsVoiceName, setTtsVoiceName] = useState(config?.tts_voice_name || "");

  useEffect(() => {
    if (config) {
      // Seed local toggle/URL state from the live config store when it arrives
      // or changes (config is async and starts null, so a lazy initial value
      // can't capture it) — mirroring via effect is correct here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCallerEnabled(config.english_caller_enabled === "true");
      setCageSound(config.cage_sound_enabled !== "false");
      setCelebrationSound(config.celebration_sound_enabled !== "false");
      setWelcomeVoice(config.welcome_voice_url || "");
      setInstructionVoice(config.instruction_voice_url || "");
      setBgMusicUrl(config.background_music_url || "");
      setBgMusicEnabled(config.background_music_enabled === "true");
      setBgMusicVolume(parseFloat(config.background_music_volume || "0.15"));
      setLobbyMusicVolume(parseFloat(config.lobby_music_volume || "0.15"));
      setMasterCallsVolume(parseFloat(config.master_calls_volume || "1.0"));
      setWelcomeText(config.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.");
      setInstructionText(config.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.");
      setWelcomeVoiceMode(config.welcome_voice_mode || "Text");
      setInstructionVoiceMode(config.instruction_voice_mode || "Text");
      setWelcomeVoiceVolume(parseFloat(config.welcome_voice_volume || "1.0"));
      setInstructionVoiceVolume(parseFloat(config.instruction_voice_volume || "1.0"));
      setTtsVoiceName(config.tts_voice_name || "");
    }
  }, [config]);

  useEffect(() => {
    return () => {
      if (masterVolumeSaveTimeoutRef.current) {
        clearTimeout(masterVolumeSaveTimeoutRef.current);
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.src = "";
        } catch {}
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      soundSynthesizer.stopCageSpin();
    };
  }, []);

  const handleSaveConfig = async (updates: Record<string, string>) => {
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      updateConfigLocally(updates);
    } catch (err: any) {
      alert(err?.message || "Failed to update sound config settings.");
    }
  };

  const handleConfigAudioUpload = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isMimeValid = file.type.startsWith("audio/") || file.type.startsWith("video/mp4") || file.type.includes("mp4") || file.type.includes("mpeg");
    const isExtValid = fileName.endsWith(".mp3") || fileName.endsWith(".wav") || fileName.endsWith(".m4a") || fileName.endsWith(".mp4") || fileName.endsWith(".mpeg") || fileName.endsWith(".mpg");
    if (!isMimeValid && !isExtValid) {
      alert("Please upload a valid audio or video file (MP3, MPEG, WAV, M4A, or MP4).");
      return;
    }

    setUploadingVoiceKey(key);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await apiFetch<{ url: string }>("/api/config/upload", {
          method: "POST",
          body: JSON.stringify({ key, audio_data: base64 }),
        });
        updateConfigLocally({ [key]: res.url });
      } catch (err: any) {
        alert(err?.message || "Upload failed.");
      } finally {
        setUploadingVoiceKey(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const stopAllPreviews = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      } catch {}
    }
    setActivePreviewKey(null);
    setPreviewStatus("stopped");

    if (activePreviewRef.current) {
      try {
        activePreviewRef.current.audio.pause();
        activePreviewRef.current.audio.src = "";
      } catch {}
      activePreviewRef.current = null;
    }

    if (previewingCage) {
      soundSynthesizer.stopCageSpin();
      setPreviewingCage(false);
    }
  };

  const playPreview = (key: string, audioUrl: string, fallbackText: string, voiceName: string | null = null) => {
    // If same key is playing, do nothing
    if (activePreviewKey === key && previewStatus === "playing") {
      return;
    }

    // If same key is paused, resume
    if (activePreviewKey === key && previewStatus === "paused") {
      const isCustomFile = key === "welcome" 
        ? (welcomeVoiceMode === "Audio" && welcomeVoice) 
        : key === "instruction" 
          ? (instructionVoiceMode === "Audio" && instructionVoice) 
          : bgMusicUrl;
      if (!isCustomFile) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        } else {
          startNewTTS(fallbackText, voiceName, key);
        }
      } else {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play().catch(() => {});
        }
      }
      setPreviewStatus("playing");
      return;
    }

    // Stop all other playbacks/previews first
    stopAllPreviews();

    // Start a brand new playback
    setActivePreviewKey(key);
    const isCustomFile = key === "welcome" 
      ? (welcomeVoiceMode === "Audio" && welcomeVoice) 
      : key === "instruction" 
        ? (instructionVoiceMode === "Audio" && instructionVoice) 
        : bgMusicUrl;
    if (!isCustomFile) {
      startNewTTS(fallbackText, voiceName, key);
    } else {
      startNewAudio(audioUrl, key);
    }
  };

  const startNewTTS = (text: string, voiceName: string | null, key: string) => {
    if (!("speechSynthesis" in window)) {
      alert("TTS not supported in this browser.");
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    let voice = voices.find(v => v.name === voiceName);
    if (!voice) {
      voice = voices.find(v => v.lang.includes("en-GB") || v.lang.includes("en-US"));
    }
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
    };

    utterance.onerror = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
    };

    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPreviewStatus("playing");
  };

  const startNewAudio = (url: string, key: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }

    const audio = new Audio(url);
    audio.id = "preview-audio-element";
    const isLobby = [1, 2, 3, 4, 5].some((idx) => url === (config as any)?.[`lobby_music_url_${idx}`]);
    const isBg = url === bgMusicUrl;
    audio.volume = isLobby ? lobbyMusicVolume : isBg ? bgMusicVolume : 0.8;

    if (key === "welcome" || key === "instruction") {
      const volMultiplier = key === "welcome" ? welcomeVoiceVolume : instructionVoiceVolume;
      soundSynthesizer.applyLiveAnnouncementEcho(audio, volMultiplier * masterCallsVolume);
    }

    audio.onended = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
    };

    audioPlayerRef.current = audio;
    audio.play().then(() => {
      setPreviewStatus("playing");
    }).catch(() => {
      alert("Failed to play audio preview.");
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
    });
  };

  const pausePreview = (key: string) => {
    if (activePreviewKey !== key) return;

    const isCustomFile = key === "welcome" 
      ? (welcomeVoiceMode === "Audio" && welcomeVoice) 
      : key === "instruction" 
        ? (instructionVoiceMode === "Audio" && instructionVoice) 
        : bgMusicUrl;
    if (!isCustomFile) {
      window.speechSynthesis.pause();
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    }
    setPreviewStatus("paused");
  };

  const stopPreview = (key: string) => {
    if (activePreviewKey !== key) return;

    const isCustomFile = key === "welcome" 
      ? (welcomeVoiceMode === "Audio" && welcomeVoice) 
      : key === "instruction" 
        ? (instructionVoiceMode === "Audio" && instructionVoice) 
        : bgMusicUrl;
    if (!isCustomFile) {
      window.speechSynthesis.cancel();
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
    }
    setActivePreviewKey(null);
    setPreviewStatus("stopped");
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
    // Mount data-fetch: load() flips the loading flag then resolves async — the
    // canonical effect fetch the set-state-in-effect heuristic over-flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

      if (!config?.tts_voice_name && defaultVoice) {
        setTtsVoiceName(defaultVoice.name);
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
    stopAllPreviews();

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
    <div className="hg-sec" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div className="hg-sec-head" style={{ borderBottom: "1.5px solid var(--card-line)", paddingBottom: "16px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 className="hg-sec-title">Audio &amp; Voice Settings</h2>
          <p className="hg-sec-sub">Configure announcement vocals, loopable game music, ambient sound effects, and voice notes.</p>
        </div>
        
        {/* Save button warning for edits */}
        {(() => {
          const changedList = settings.filter((s) => (editingTexts[s.number] ?? s.call_text) !== s.call_text);
          if (changedList.length === 0) return null;
          return (
            <div style={{ display: "flex", gap: "10px" }} className="no-print">
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
      </div>

      {/* Grid of Mixer & Core Options */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "24px" }}>
        
        {/* CARD 1: Mixing Console & Master Audio Controls */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="volume" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Live Mixing Board</h3>
            </div>
          </div>
          
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Master Voice Fader */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                <span style={{ color: "var(--text)" }}>🎙️ Master Voice Volume</span>
                <span style={{ color: "var(--accent)" }}>{Math.round(masterCallsVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.01"
                value={masterCallsVolume}
                onChange={(e) => {
                  const gainVal = parseFloat(e.target.value);
                  setMasterCallsVolume(gainVal);
                  setSettings(prev => prev.map(s => ({ ...s, volume: gainVal })));
                  if (activePreviewRef.current) {
                    const item = settings.find(s => s.number === activePreviewRef.current?.number);
                    const itemVol = item?.volume !== undefined ? item.volume : 1.0;
                    activePreviewRef.current.updateVolume(itemVol * gainVal);
                  }
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
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: "6px", borderRadius: "3px", background: "var(--border-2)" }}
              />
            </div>

            {/* BG Music Fader */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                <span style={{ color: "var(--text)" }}>🎵 Gameplay Background Music</span>
                <span style={{ color: "var(--accent)" }}>{Math.round(bgMusicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.01"
                value={bgMusicVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setBgMusicVolume(val);
                  handleSaveConfig({ background_music_volume: String(val) });
                  if (audioPlayerRef.current && activePreviewKey === "bg") {
                    audioPlayerRef.current.volume = val;
                  }
                }}
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: "6px", borderRadius: "3px", background: "var(--border-2)" }}
              />
            </div>

            {/* AI Voice Caller Selector Card */}
            <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-dim)" }}>AI Voice</span>
                <label 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "6px", 
                    cursor: "pointer", 
                    fontSize: "11px", 
                    fontWeight: 600,
                    color: callerEnabled ? "var(--accent)" : "var(--text-dim)",
                    userSelect: "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={callerEnabled}
                    onChange={handleToggleGlobalCaller}
                    style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                  />
                  <span>Enable live AI Call Audio</span>
                </label>
              </div>
              {voices.length > 0 && (
                <select
                  value={ttsVoiceName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTtsVoiceName(val);
                    setSelectedVoiceName(val);
                    localStorage.setItem("preferred_caller_voice", val);
                    handleSaveConfig({ tts_voice_name: val });
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    fontFamily: "var(--font-head)",
                    fontSize: "13px",
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  {voices.map((v) => {
                    const isPremium = v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural");
                    return (
                      <option key={v.name} value={v.name} style={{ backgroundColor: "var(--surface)", color: "var(--text)" }}>
                        {v.name} ({v.lang}){isPremium ? " ✨ Premium" : ""}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Global Number Call Mode Switcher */}
            <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-dim)" }}>Global Playback Mode (All 1-90 Numbers)</span>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={async () => {
                    try {
                      setSettings(prev => prev.map(s => ({ ...s, call_mode: "Text" })));
                      await apiFetch("/api/games/number-calls-bulk-mode", {
                        method: "PATCH",
                        body: JSON.stringify({ call_mode: "Text" }),
                      });
                      alert("Successfully set all numbers to Text (TTS) mode!");
                    } catch (e: any) {
                      alert(e.message || "Failed to update bulk call mode");
                    }
                  }}
                  className="hg-btn"
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: settings.every(s => s.call_mode === "Text") ? "var(--accent)" : "var(--surface-2)",
                    color: settings.every(s => s.call_mode === "Text") ? "var(--accent-ink)" : "var(--text)",
                    border: settings.every(s => s.call_mode === "Text") ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                    transition: "all 0.2s"
                  }}
                >
                  <span>🗣️ Use TTS (All)</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Update locally: set to Audio if they have audio_url, else stay Text
                      setSettings(prev => prev.map(s => ({ ...s, call_mode: s.audio_url ? "Audio" : "Text" })));
                      await apiFetch("/api/games/number-calls-bulk-mode", {
                        method: "PATCH",
                        body: JSON.stringify({ call_mode: "Audio" }),
                      });
                      alert("Successfully set all uploaded numbers to Audio (MP3) mode!");
                    } catch (e: any) {
                      alert(e.message || "Failed to update bulk call mode");
                    }
                  }}
                  className="hg-btn"
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "var(--accent)" : "var(--surface-2)",
                    color: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "var(--accent-ink)" : "var(--text)",
                    border: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                    transition: "all 0.2s"
                  }}
                >
                  <span>🎵 Use MP3 (All Uploaded)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Physical Sound Effects Synthesizers (Cage & Celebration) */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="zap" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Aesthetic Sound FX Synthesizers</h3>
            </div>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Cage sound effects */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>⚙️ Realistic Tambola Cage Draw</span>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: cageSound ? "var(--accent)" : "var(--text-dim)" }}>
                  <input
                    type="checkbox"
                    checked={cageSound}
                    onChange={(e) => {
                      setCageSound(e.target.checked);
                      handleSaveConfig({ cage_sound_enabled: String(e.target.checked) });
                    }}
                    style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                <select
                  value={config?.cage_sound_type || "steel_wooden"}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleSaveConfig({ cage_sound_type: val });
                    if (previewingCage) {
                      soundSynthesizer.stopCageSpin();
                      setTimeout(() => { soundSynthesizer.startCageSpin(); }, 50);
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "var(--font-head)",
                    fontSize: "12px",
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  <option value="steel_wooden">Steel Cage with Wooden Balls</option>
                  <option value="steel_ceramic">Steel Cage with Ceramic Balls</option>
                  <option value="golden_brass">Golden Brass Cage with Glass Marbles ✨</option>
                  <option value="traditional_plastic">Traditional Plastic Cage</option>
                  <option value="classic_wooden">Classic Wooden Cage</option>
                  <option value="bamboo_basket">Bamboo Weaved Basket Cage 🌿</option>
                  <option value="electric_blower">Professional Electric Blower (Air-mix) 🌀</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "8px 16px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}
                  onClick={() => {
                    if (previewingCage) {
                      soundSynthesizer.stopCageSpin();
                      setPreviewingCage(false);
                    } else {
                      stopAllPreviews();
                      soundSynthesizer.startCageSpin();
                      setPreviewingCage(true);
                    }
                  }}
                >
                  {previewingCage ? "⏹ Stop" : "🔊 Preview"}
                </Button>
              </div>
            </div>

            {/* Victory Sound Synthesizer */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>🏆 Celebratory Winner Fanfare</span>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: celebrationSound ? "var(--accent)" : "var(--text-dim)" }}>
                  <input
                    type="checkbox"
                    checked={celebrationSound}
                    onChange={(e) => {
                      setCelebrationSound(e.target.checked);
                      handleSaveConfig({ celebration_sound_enabled: String(e.target.checked) });
                    }}
                    style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                <select
                  value={config?.winner_sound_type || "trumpet_cheering"}
                  onChange={(e) => handleSaveConfig({ winner_sound_type: e.target.value })}
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "var(--font-head)",
                    fontSize: "12px",
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  <option value="trumpet_cheering">Trumpet Fanfare with Cheering</option>
                  <option value="cheering">Crowd Cheering</option>
                  <option value="clapping">Applause Clapping</option>
                  <option value="voice_yes">Vocal "Yes!!"</option>
                  <option value="default_chime">Cathedral Tubular Chimes</option>
                  <option value="symphony_orchestra">Triumphant Symphony Orchestra 🎺</option>
                  <option value="synth_party">Sparkling Synth Arpeggio Party ✨</option>
                  <option value="fireworks">Fireworks Crackle &amp; Pop Spectacular 🎆</option>
                  <option value="retro_arcade_celebration">Retro Arcade Level-Up Fanfare 👾</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "8px 16px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}
                  onClick={() => {
                    stopAllPreviews();
                    soundSynthesizer.playCelebration();
                  }}
                >
                  🔊 Preview
                </Button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Grid of Voice Notes & Game BG Music */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "24px" }}>
        
        {/* CARD 3: Voice Announcements */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="chat" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Voice Announcements</h3>
            </div>
          </div>
          
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <p className="hg-dim" style={{ fontSize: "12px", margin: 0, lineHeight: 1.4 }}>
              Configure the intro welcome message and outro game conclusion announcement.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {/* Intro Note */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>1. Intro Note</span>
                  {/* Mode toggle */}
                  <div style={{ display: "flex", gap: "2px", background: "var(--surface)", padding: "2px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                    <button
                      onClick={() => handleSaveConfig({ welcome_voice_mode: "Text" })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: welcomeVoiceMode === "Text" ? "var(--accent)" : "transparent",
                        color: welcomeVoiceMode === "Text" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      TTS
                    </button>
                    <button
                      onClick={() => handleSaveConfig({ welcome_voice_mode: "Audio" })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: welcomeVoiceMode === "Audio" ? "var(--accent)" : "transparent",
                        color: welcomeVoiceMode === "Audio" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      Audio
                    </button>
                  </div>
                </div>

                {welcomeVoiceMode === "Text" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <input
                      type="text"
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      placeholder="Intro TTS announcement text..."
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "999px",
                        border: "1.5px solid var(--border-2)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: "12.5px",
                        outline: "none"
                      }}
                    />
                    {welcomeText !== (config?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.") && (
                      <Button variant="cta" size="sm" onClick={() => handleSaveConfig({ welcome_voice_text: welcomeText })} style={{ alignSelf: "flex-end", fontSize: "11px", padding: "6px 12px", borderRadius: "999px" }}>Save Text</Button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                        <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleConfigAudioUpload("welcome_voice_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                        <span>📁 {uploadingVoiceKey === "welcome_voice_url" ? "..." : welcomeVoice ? "Replace Audio" : "Upload Audio"}</span>
                      </label>
                      {welcomeVoice && (
                        <>
                          <span className="hg-dim" style={{ fontSize: "11px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {welcomeVoice.split("/").pop()}
                          </span>
                          <button onClick={() => handleSaveConfig({ welcome_voice_url: "" })} title="Delete file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 -1px var(--ink)" }}><Icon name="trash" size={14} /></button>
                        </>
                      )}
                    </div>
                    {welcomeVoice && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", borderTop: "1px dashed var(--border-2)", paddingTop: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
                          <span style={{ color: "var(--text-dim)" }}>Volume Boost: {Math.round(welcomeVoiceVolume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2.0"
                          step="0.05"
                          value={welcomeVoiceVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setWelcomeVoiceVolume(val);
                            handleSaveConfig({ welcome_voice_volume: String(val) });
                          }}
                          style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: "4px", borderRadius: "2px", background: "var(--border-2)" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "4px" }}>
                  <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "4px 8px", borderRadius: "20px", border: "1.5px solid var(--border-2)" }}>
                    <button onClick={() => playPreview("welcome", welcomeVoice, welcomeText, ttsVoiceName)} disabled={activePreviewKey === "welcome" && previewStatus === "playing"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: activePreviewKey === "welcome" && previewStatus === "playing" ? "var(--accent)" : "transparent", color: activePreviewKey === "welcome" && previewStatus === "playing" ? "#000" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="play" size={11} /></button>
                    <button onClick={() => stopPreview("welcome")} disabled={activePreviewKey !== "welcome" || previewStatus === "stopped"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", color: activePreviewKey === "welcome" && previewStatus !== "stopped" ? "var(--text)" : "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Outro Note */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>2. Outro Note</span>
                  {/* Mode toggle */}
                  <div style={{ display: "flex", gap: "2px", background: "var(--surface)", padding: "2px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                    <button
                      onClick={() => handleSaveConfig({ instruction_voice_mode: "Text" })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: instructionVoiceMode === "Text" ? "var(--accent)" : "transparent",
                        color: instructionVoiceMode === "Text" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      TTS
                    </button>
                    <button
                      onClick={() => handleSaveConfig({ instruction_voice_mode: "Audio" })}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: instructionVoiceMode === "Audio" ? "var(--accent)" : "transparent",
                        color: instructionVoiceMode === "Audio" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      Audio
                    </button>
                  </div>
                </div>

                {instructionVoiceMode === "Text" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <input
                      type="text"
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Outro TTS announcement text..."
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "999px",
                        border: "1.5px solid var(--border-2)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: "12.5px",
                        outline: "none"
                      }}
                    />
                    {instructionText !== (config?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.") && (
                      <Button variant="cta" size="sm" onClick={() => handleSaveConfig({ instruction_voice_text: instructionText })} style={{ alignSelf: "flex-end", fontSize: "11px", padding: "6px 12px", borderRadius: "999px" }}>Save Text</Button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                        <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleConfigAudioUpload("instruction_voice_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                        <span>📁 {uploadingVoiceKey === "instruction_voice_url" ? "..." : instructionVoice ? "Replace Audio" : "Upload Audio"}</span>
                      </label>
                      {instructionVoice && (
                        <>
                          <span className="hg-dim" style={{ fontSize: "11px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {instructionVoice.split("/").pop()}
                          </span>
                          <button onClick={() => handleSaveConfig({ instruction_voice_url: "" })} title="Delete file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 -1px var(--ink)" }}><Icon name="trash" size={14} /></button>
                        </>
                      )}
                    </div>
                    {instructionVoice && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", borderTop: "1px dashed var(--border-2)", paddingTop: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
                          <span style={{ color: "var(--text-dim)" }}>Volume Boost: {Math.round(instructionVoiceVolume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2.0"
                          step="0.05"
                          value={instructionVoiceVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setInstructionVoiceVolume(val);
                            handleSaveConfig({ instruction_voice_volume: String(val) });
                          }}
                          style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: "4px", borderRadius: "2px", background: "var(--border-2)" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "4px" }}>
                  <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "4px 8px", borderRadius: "20px", border: "1.5px solid var(--border-2)" }}>
                    <button onClick={() => playPreview("instruction", instructionVoice, instructionText, ttsVoiceName)} disabled={activePreviewKey === "instruction" && previewStatus === "playing"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: activePreviewKey === "instruction" && previewStatus === "playing" ? "var(--accent)" : "transparent", color: activePreviewKey === "instruction" && previewStatus === "playing" ? "#000" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="play" size={11} /></button>
                    <button onClick={() => stopPreview("instruction")} disabled={activePreviewKey !== "instruction" || previewStatus === "stopped"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", color: activePreviewKey === "instruction" && previewStatus !== "stopped" ? "var(--text)" : "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* CARD 4: Live gameplay background music */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="music" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Gameplay Background Music</h3>
            </div>
          </div>
          
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <p className="hg-dim" style={{ fontSize: "12px", margin: 0, lineHeight: 1.4 }}>
              Ambient soundtrack loops that play continuously during active game boards.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={bgMusicEnabled}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setBgMusicEnabled(val);
                    handleSaveConfig({ background_music_enabled: String(val) });
                  }}
                  style={{ accentColor: "var(--accent)", width: "14px", height: "14px" }}
                />
                <span>Enable gameplay background music loops</span>
              </label>

              {bgMusicUrl && !["", "/audio/music/soft_lounge.wav", "/audio/music/retro_arcade.wav", "/audio/music/traditional_flute.wav", "/audio/music/upbeat_dhol.wav", "/audio/music/synthwave_glow.wav", "/audio/music/acoustic_guitar.wav", "/audio/music/sleek_jazz.wav"].includes(bgMusicUrl) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--card-line)", background: "var(--accent-soft)" }}>
                  <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: ".04em" }}>Active Custom Loop</span>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      🎵 {bgMusicUrl.startsWith("data:") ? "custom_music_loop.mp3" : decodeURIComponent(bgMusicUrl.split("/").pop() || "custom_music_loop.mp3")}
                    </span>
                    <button onClick={() => { setBgMusicUrl(""); handleSaveConfig({ background_music_url: "" }); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "11px", fontWeight: 700, textDecoration: "underline", padding: 0 }}>Reset to Presets</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Select Preset Soundtrack</span>
                  <select
                    value={bgMusicUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBgMusicUrl(val);
                      handleSaveConfig({ background_music_url: val });
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "999px",
                      border: "1.5px solid var(--border-2)",
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      fontFamily: "var(--font-head)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      outline: "none",
                      cursor: "pointer"
                    }}
                  >
                    <option value="">None / Silent</option>
                    <option value="/audio/music/soft_lounge.wav">Preset 1: Soft Lounge Loop</option>
                    <option value="/audio/music/retro_arcade.wav">Preset 2: Retro Arcade Loop</option>
                    <option value="/audio/music/traditional_flute.wav">Preset 3: Calm Indian Flute</option>
                    <option value="/audio/music/upbeat_dhol.wav">Preset 4: Upbeat Indian Dhol Beat 🥁</option>
                    <option value="/audio/music/synthwave_glow.wav">Preset 5: Ambient Synthwave Glow 🌃</option>
                    <option value="/audio/music/acoustic_guitar.wav">Preset 6: Chill Acoustic Guitar 🎸</option>
                    <option value="/audio/music/sleek_jazz.wav">Preset 7: Sleek Jazz Lounge 🎷</option>
                  </select>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", flexWrap: "wrap", gap: "8px" }}>
                <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 14px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                  <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleConfigAudioUpload("background_music_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                  <span>📁 Upload Custom Loop</span>
                </label>

                {bgMusicUrl && (
                  <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "4px 8px", borderRadius: "20px", border: "1.5px solid var(--border-2)" }}>
                    <button onClick={() => playPreview("bg", bgMusicUrl, "")} disabled={activePreviewKey === "bg" && previewStatus === "playing"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: activePreviewKey === "bg" && previewStatus === "playing" ? "var(--accent)" : "transparent", color: activePreviewKey === "bg" && previewStatus === "playing" ? "#000" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="play" size={11} /></button>
                    <button onClick={() => stopPreview("bg")} disabled={activePreviewKey !== "bg" || previewStatus === "stopped"} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", background: "transparent", color: activePreviewKey === "bg" && previewStatus !== "stopped" ? "var(--text)" : "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* CARD 6: 1 to 90 Number Calls Directory */}
      <div className="hg-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid var(--card-line)", padding: "14px 16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="grid" size={20} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Number Call Phrases Directory (1-90)</h3>
          </div>
          <input
            type="text"
            placeholder="Search number or call phrase..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "8px 16px",
              borderRadius: "999px",
              border: "1.5px solid var(--border-2)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: "12.5px",
              outline: "none",
              minWidth: "250px"
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "600px", overflowY: "auto", padding: "16px 20px" }}>
          {filtered.length === 0 ? (
            <div className="text-center p-8 text-mute" style={{ fontStyle: "italic", fontSize: "13px" }}>No caller phrases match your search query.</div>
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
                    gap: "16px", 
                    padding: "12px 16px", 
                    borderRadius: "var(--radius-sm)", 
                    background: "var(--surface-2)",
                    border: "1.5px solid var(--border-2)",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 320px" }}>
                    <div 
                      style={{ 
                        width: "38px", 
                        height: "38px", 
                        borderRadius: "50%", 
                        background: "var(--accent-soft)", 
                        color: "var(--accent)", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center", 
                        fontWeight: "bold",
                        fontFamily: "var(--font-head)",
                        fontSize: "15px",
                        border: "2px solid var(--accent)",
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
                          style={{
                            borderRadius: "999px",
                            color: "var(--text)",
                            background: "var(--surface)",
                            border: "1.5px solid var(--border-2)",
                            padding: "6px 14px",
                            fontSize: "12.5px",
                            outline: "none",
                            flexGrow: 1
                          }}
                        />
                        {currentEdit !== item.call_text && (
                          <Button variant="cta" size="sm" onClick={() => handleSaveText(item.number)} style={{ fontSize: "11px", padding: "6px 12px", borderRadius: "999px" }}>Save</Button>
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>Default: <em>{item.default_text}</em></span>
                        {isModified && (
                          <button onClick={() => handleRestore(item.number)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "11px", color: "var(--accent)", fontWeight: 700 }}>Restore Default</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", flexShrink: 0 }}>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label className={`flex items-center gap-1 px-3 py-1.5 rounded border text-[11px] cursor-pointer select-none font-bold ${item.audio_url ? "bg-surface text-text hover:bg-surface-2" : "bg-brand text-bg border-brand hover:opacity-90"}`} style={{ borderRadius: "999px", transition: "all 0.15s ease", opacity: uploadingNum === item.number ? 0.6 : 1, pointerEvents: uploadingNum === item.number ? "none" : "auto", margin: 0, border: "1.5px solid var(--ink)" }}>
                        <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleFileUpload(item.number, e)} style={{ display: "none" }} />
                        <span>{uploadingNum === item.number ? "..." : item.audio_url ? "Replace" : "Upload File"}</span>
                      </label>
                      
                      <Button variant="ghost" size="sm" style={{ padding: "6px 12px", fontSize: "11px", borderRadius: "999px" }} onClick={() => playCallPreview(item)}>Listen</Button>

                      {item.audio_url && (
                        <button onClick={() => handleDeleteAudio(item.number)} title="Delete custom sound file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 0 -1px var(--ink)" }}><Icon name="trash" size={13} /></button>
                      )}
                    </div>

                    {item.audio_url && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "6px 10px", borderRadius: "999px", border: "1.5px solid var(--border-2)", minWidth: "115px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", whiteSpace: "nowrap" }}>Vol: {Math.round((item.volume !== undefined ? item.volume : 1.0) * 100)}%</span>
                        <input type="range" min="0" max="100" step="1" value={Math.round((item.volume !== undefined ? item.volume : 1.0) * 100)} onChange={(e) => { const sliderVal = parseInt(e.target.value, 10); handleVolumeChange(item.number, sliderVal / 100); }} style={{ width: "60px", accentColor: "var(--accent)", cursor: "pointer", height: "3px" }} />
                      </div>
                    )}

                    {item.audio_url ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface)", padding: "6px 12px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", cursor: "pointer", fontWeight: 700, color: item.call_mode === "Text" ? "var(--accent)" : "var(--text-dim)" }}>
                          <input type="checkbox" checked={item.call_mode === "Text"} onChange={() => handleToggleMode(item.number, "Text")} style={{ accentColor: "var(--accent)", width: "12px", height: "12px" }} />
                          <span>TTS</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", cursor: "pointer", fontWeight: 700, color: item.call_mode === "Audio" ? "var(--accent)" : "var(--text-dim)" }}>
                          <input type="checkbox" checked={item.call_mode === "Audio"} onChange={() => handleToggleMode(item.number, "Audio")} style={{ accentColor: "var(--accent)", width: "12px", height: "12px" }} />
                          <span>MP3</span>
                        </label>
                      </div>
                    ) : (
                      <div className="text-[11px] text-mute" style={{ width: "115px", textAlign: "center", fontStyle: "italic" }}>Text-only (TTS)</div>
                    )}

                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
