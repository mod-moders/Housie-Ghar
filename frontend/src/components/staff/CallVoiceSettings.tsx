"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch, resolveAudioUrl } from "@/lib/api";
import { Button } from "@/components/ui";
import { useConfigStore } from "@/lib/stores/configStore";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { Icon } from "@/components/Icon";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  audio_url_en?: string | null;
  audio_url_ne?: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
}

interface SpotifyAudioControlProps {
  playerKey: string;
  audioUrl: string | null;
  volume: number;
  onVolumeChange: (vol: number) => void;
  maxVolume?: number;
  title: string;
  subtitle: string;
  activePreviewKey: string | null;
  previewStatus: "playing" | "paused" | "stopped";
  playPreview: (key: string, url: string) => void;
  pausePreview: (key: string) => void;
  stopPreview: (key: string) => void;
  currentTime: number;
  duration: number;
  handleSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function SpotifyAudioControl({
  playerKey,
  audioUrl,
  volume,
  onVolumeChange,
  maxVolume = 1.0,
  title,
  subtitle,
  activePreviewKey,
  previewStatus,
  playPreview,
  pausePreview,
  stopPreview,
  currentTime,
  duration,
  handleSeekChange,
}: SpotifyAudioControlProps) {
  const isThisActive = activePreviewKey === playerKey;
  const isPlaying = isThisActive && previewStatus === "playing";

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--surface)", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)", marginTop: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>{title}</span>
          <span className="hg-dim" style={{ fontSize: "10.5px", display: "block" }}>{subtitle}</span>
        </div>
        
        {/* Play/Pause/Stop Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => {
              if (isPlaying) {
                pausePreview(playerKey);
              } else if (audioUrl) {
                playPreview(playerKey, audioUrl);
              }
            }}
            disabled={!audioUrl}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              border: "none",
              background: isPlaying ? "var(--accent)" : "var(--surface-2)",
              color: isPlaying ? "#000" : "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: audioUrl ? "pointer" : "not-allowed",
              opacity: audioUrl ? 1 : 0.5
            }}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={14} fill="currentColor" stroke="none" />
          </button>
          
          <button
            onClick={() => stopPreview(playerKey)}
            disabled={!isThisActive}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              border: "none",
              background: "var(--surface-2)",
              color: isThisActive ? "var(--text)" : "var(--text-mute)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isThisActive ? "pointer" : "default",
              opacity: isThisActive ? 1 : 0.5
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          </button>
        </div>
      </div>

      {/* Progress & Volume Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Progress seek bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "160px" }}>
          <span style={{ fontSize: "10px", color: "var(--text-mute)", minWidth: "26px" }}>{isThisActive ? formatTime(currentTime) : "0:00"}</span>
          <input
            type="range"
            min="0"
            max={isThisActive && duration ? duration : 100}
            step="0.1"
            value={isThisActive ? currentTime : 0}
            onChange={handleSeekChange}
            disabled={!isThisActive}
            style={{ flex: 1, accentColor: "var(--accent)", cursor: isThisActive ? "pointer" : "default", height: "4px" }}
          />
          <span style={{ fontSize: "10px", color: "var(--text-mute)", minWidth: "26px" }}>{isThisActive ? formatTime(duration) : "0:00"}</span>
        </div>

        {/* Volume Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface-2)", padding: "4px 8px", borderRadius: "999px", border: "1px solid var(--border-2)" }}>
          <Icon name={volume === 0 ? "volumeX" : "volume"} size={13} style={{ color: "var(--accent)" }} />
          <input
            type="range"
            min="0"
            max={maxVolume}
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            style={{ width: "55px", accentColor: "var(--accent)", cursor: "pointer", height: "3px" }}
          />
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-mute)", minWidth: "26px" }}>{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export function CallVoiceSettings() {
  const { config, updateConfigLocally, loadConfig } = useConfigStore();

  const [settings, setSettings] = useState<NumberCallConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingNum, setUploadingNum] = useState<number | null>(null);
  const [editingTexts, setEditingTexts] = useState<Record<number, string>>({});
  const activePreviewRef = useRef<{ number: number; audio: HTMLAudioElement; updateVolume: (v: number) => void } | null>(null);
  const masterVolumeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // General audio & sound states
  const [callerEnabled, setCallerEnabled] = useState(config?.english_caller_enabled === "true");
  const [audioLang, setAudioLang] = useState<"en" | "ne">((config?.audio_language as "en" | "ne") || "en");
  
  const [cageSound, setCageSound] = useState(config?.cage_sound_enabled !== "false");
  const [celebrationSound, setCelebrationSound] = useState(config?.celebration_sound_enabled !== "false");
  const [cageVolume, setCageVolume] = useState<number>(parseFloat(config?.cage_sound_volume || "1.0"));
  const [winnerVolume, setWinnerVolume] = useState<number>(parseFloat(config?.winner_sound_volume || "1.0"));
  const [cageSoundUrl, setCageSoundUrl] = useState(config?.cage_sound_url || "");
  const [celebrationSoundUrl, setCelebrationSoundUrl] = useState(config?.celebration_sound_url || "");

  // Background Music States
  const [bgMusicUrl, setBgMusicUrl] = useState(config?.background_music_url || "");
  const [bgMusicEnabled, setBgMusicEnabled] = useState(config?.background_music_enabled === "true");
  const [bgMusicVolume, setBgMusicVolume] = useState(parseFloat(config?.background_music_volume || "0.15"));
  const [masterCallsVolume, setMasterCallsVolume] = useState(parseFloat(config?.master_calls_volume || "1.0"));

  // Intro (Welcome Voice) States — Legacy welcome_voice_url is Nepali
  const [welcomeVoiceEnabled, setWelcomeVoiceEnabled] = useState(config?.welcome_voice_enabled !== "false");
  const [welcomeVoiceUrlEn, setWelcomeVoiceUrlEn] = useState(config?.welcome_voice_url_en || "");
  const [welcomeVoiceUrlNe, setWelcomeVoiceUrlNe] = useState(config?.welcome_voice_url_ne || config?.welcome_voice_url || "");
  const [welcomeVoiceVolEn, setWelcomeVoiceVolEn] = useState(parseFloat(config?.welcome_voice_volume_en || "1.0"));
  const [welcomeVoiceVolNe, setWelcomeVoiceVolNe] = useState(parseFloat(config?.welcome_voice_volume_ne || config?.welcome_voice_volume || "1.0"));
  const [welcomeVoiceLang, setWelcomeVoiceLang] = useState<"en" | "ne">((config?.welcome_voice_lang as "en" | "ne") || "ne");

  // Outro (Instruction Voice) States — Legacy instruction_voice_url is English
  const [instructionVoiceEnabled, setInstructionVoiceEnabled] = useState(config?.instruction_voice_enabled !== "false");
  const [instructionVoiceUrlEn, setInstructionVoiceUrlEn] = useState(config?.instruction_voice_url_en || config?.instruction_voice_url || "");
  const [instructionVoiceUrlNe, setInstructionVoiceUrlNe] = useState(config?.instruction_voice_url_ne || "");
  const [instructionVoiceVolEn, setInstructionVoiceVolEn] = useState(parseFloat(config?.instruction_voice_volume_en || config?.instruction_voice_volume || "1.0"));
  const [instructionVoiceVolNe, setInstructionVoiceVolNe] = useState(parseFloat(config?.instruction_voice_volume_ne || "1.0"));
  const [instructionVoiceLang, setInstructionVoiceLang] = useState<"en" | "ne">((config?.instruction_voice_lang as "en" | "ne") || "en");

  const [uploadingVoiceKey, setUploadingVoiceKey] = useState<string | null>(null);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"playing" | "paused" | "stopped">("stopped");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [previewingCage, setPreviewingCage] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const activeAnnouncementHandleRef = useRef<{ updateVolume: (v: number) => void; audio: HTMLAudioElement } | null>(null);

  useEffect(() => {
    if (config) {
      setCallerEnabled(config.english_caller_enabled === "true");
      setAudioLang((config.audio_language as "en" | "ne") || "en");
      setCageSound(config.cage_sound_enabled !== "false");
      setCelebrationSound(config.celebration_sound_enabled !== "false");
      setCageSoundUrl(config.cage_sound_url || "");
      setCelebrationSoundUrl(config.celebration_sound_url || "");
      
      setWelcomeVoiceEnabled(config.welcome_voice_enabled !== "false");
      setWelcomeVoiceUrlEn(config.welcome_voice_url_en || "");
      setWelcomeVoiceUrlNe(config.welcome_voice_url_ne || config.welcome_voice_url || "");
      setWelcomeVoiceVolEn(parseFloat(config.welcome_voice_volume_en || "1.0"));
      setWelcomeVoiceVolNe(parseFloat(config.welcome_voice_volume_ne || config.welcome_voice_volume || "1.0"));
      setWelcomeVoiceLang((config.welcome_voice_lang as "en" | "ne") || "ne");

      setInstructionVoiceEnabled(config.instruction_voice_enabled !== "false");
      setInstructionVoiceUrlEn(config.instruction_voice_url_en || config.instruction_voice_url || "");
      setInstructionVoiceUrlNe(config.instruction_voice_url_ne || "");
      setInstructionVoiceVolEn(parseFloat(config.instruction_voice_volume_en || config.instruction_voice_volume || "1.0"));
      setInstructionVoiceVolNe(parseFloat(config.instruction_voice_volume_ne || "1.0"));
      setInstructionVoiceLang((config.instruction_voice_lang as "en" | "ne") || "en");

      setBgMusicUrl(config.background_music_url || "");
      setBgMusicEnabled(config.background_music_enabled === "true");
      setBgMusicVolume(parseFloat(config.background_music_volume || "0.15"));
      setMasterCallsVolume(parseFloat(config.master_calls_volume || "1.0"));
      setCageVolume(parseFloat(config.cage_sound_volume || "1.0"));
      setWinnerVolume(parseFloat(config.winner_sound_volume || "1.0"));
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
      if (activeAnnouncementHandleRef.current) {
        try {
          activeAnnouncementHandleRef.current.audio.pause();
          activeAnnouncementHandleRef.current.audio.src = "";
        } catch {}
      }
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<NumberCallConfig[]>("/api/games/number-calls");
      setSettings(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stopAllPreviews = () => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      } catch {}
      audioPlayerRef.current = null;
    }
    if (activeAnnouncementHandleRef.current) {
      try {
        activeAnnouncementHandleRef.current.audio.pause();
        activeAnnouncementHandleRef.current.audio.src = "";
      } catch {}
      activeAnnouncementHandleRef.current = null;
    }
    if (activePreviewRef.current) {
      try {
        activePreviewRef.current.audio.pause();
        activePreviewRef.current.audio.src = "";
      } catch {}
      activePreviewRef.current = null;
    }
    soundSynthesizer.stopCageSpin();
    setPreviewingCage(false);
    setActivePreviewKey(null);
    setPreviewStatus("stopped");
    setCurrentTime(0);
    setDuration(0);
  };

  const playPreview = (key: string, url: string) => {
    stopAllPreviews();
    if (!url) return;

    const resolved = resolveAudioUrl(url);
    const audio = new Audio(resolved);
    if (!resolved.startsWith("data:")) {
      audio.crossOrigin = "anonymous";
    }
    audioPlayerRef.current = audio;
    
    let targetVol = 1.0;
    if (key === "bg") targetVol = bgMusicVolume;
    else if (key === "cage") targetVol = cageVolume;
    else if (key === "celebration") targetVol = winnerVolume;
    else if (key === "welcome_en") targetVol = welcomeVoiceVolEn * masterCallsVolume;
    else if (key === "welcome_ne") targetVol = welcomeVoiceVolNe * masterCallsVolume;
    else if (key === "instruction_en") targetVol = instructionVoiceVolEn * masterCallsVolume;
    else if (key === "instruction_ne") targetVol = instructionVoiceVolNe * masterCallsVolume;

    let echoHandle: any = null;
    if (key.startsWith("welcome") || key.startsWith("instruction")) {
      echoHandle = soundSynthesizer.applyLiveAnnouncementEcho(audio, targetVol);
    } else {
      audio.volume = Math.max(0, Math.min(1, targetVol));
    }

    activeAnnouncementHandleRef.current = {
      audio,
      updateVolume: (v: number) => {
        if (echoHandle && echoHandle.updateVolume) {
          echoHandle.updateVolume(v);
        } else if (audio) {
          audio.volume = Math.max(0, Math.min(1, v));
        }
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    };

    audio.onended = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
      setCurrentTime(0);
    };

    audio.play()
      .then(() => {
        setActivePreviewKey(key);
        setPreviewStatus("playing");
      })
      .catch(() => {
        setActivePreviewKey(null);
        setPreviewStatus("stopped");
      });
  };

  const pausePreview = (key: string) => {
    if (audioPlayerRef.current && activePreviewKey === key) {
      audioPlayerRef.current.pause();
      setPreviewStatus("paused");
    }
  };

  const stopPreview = (key: string) => {
    if (activePreviewKey === key) {
      stopAllPreviews();
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const debouncedSaveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

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

  const handleSaveConfigDebounced = (updates: Record<string, string>, delayMs: number = 400) => {
    updateConfigLocally(updates);
    Object.keys(updates).forEach(key => {
      if (debouncedSaveTimeoutRef.current[key]) {
        clearTimeout(debouncedSaveTimeoutRef.current[key]);
      }
      debouncedSaveTimeoutRef.current[key] = setTimeout(() => {
        handleSaveConfig({ [key]: updates[key] });
      }, delayMs);
    });
  };

  const handleConfigAudioUpload = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        if (key === "welcome_voice_url_en") setWelcomeVoiceUrlEn(res.url);
        else if (key === "welcome_voice_url_ne") setWelcomeVoiceUrlNe(res.url);
        else if (key === "instruction_voice_url_en") setInstructionVoiceUrlEn(res.url);
        else if (key === "instruction_voice_url_ne") setInstructionVoiceUrlNe(res.url);
        else if (key === "background_music_url") setBgMusicUrl(res.url);
        else if (key === "cage_sound_url") setCageSoundUrl(res.url);
        else if (key === "celebration_sound_url") setCelebrationSoundUrl(res.url);
      } catch (err: any) {
        alert(err?.message || "Upload failed.");
      } finally {
        setUploadingVoiceKey(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (num: number, e: React.ChangeEvent<HTMLInputElement>, lang: "en" | "ne" = "en") => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    setUploadingNum(num);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await apiFetch<{ audio_url_en?: string; audio_url_ne?: string; audio_url?: string }>(`/api/games/number-calls/${num}/upload`, {
          method: "POST",
          body: JSON.stringify({ audio_data: base64, lang }),
        });
        if (res) {
          setSettings(prev => prev.map(s => s.number === num ? {
            ...s,
            audio_url: res.audio_url || s.audio_url,
            audio_url_en: res.audio_url_en || s.audio_url_en,
            audio_url_ne: res.audio_url_ne || s.audio_url_ne,
            call_mode: "Audio"
          } : s));
        }
        load();
      } catch {
        alert("Upload failed. Ensure backend has write access.");
      } finally {
        setUploadingNum(null);
        inputEl.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteNumberAudio = async (num: number, lang?: "en" | "ne") => {
    if (!window.confirm(`Delete ${lang ? lang.toUpperCase() : "custom"} audio file for number ${num}?`)) return;
    stopAllPreviews();
    try {
      await apiFetch(`/api/games/number-calls/${num}/audio?lang=${lang || "en"}`, {
        method: "DELETE",
        body: JSON.stringify({ lang }),
      });
      load();
    } catch {
      alert("Failed to delete audio file.");
    }
  };

  const playCallPreview = (item: NumberCallConfig, lang: "en" | "ne" = "en") => {
    stopAllPreviews();
    const url = lang === "ne"
      ? (item.audio_url_ne || item.audio_url || `/audio/calls/${item.number}_ne.mp3` || `/audio/calls/${item.number}.mp3`)
      : (item.audio_url_en || `/audio/calls/${item.number}_en.mp3`);

    if (!url) return;

    const resolved = resolveAudioUrl(url);
    const audio = new Audio(resolved);
    const itemVol = item.volume !== undefined ? item.volume : 1.0;
    const targetVol = itemVol * masterCallsVolume;

    // Apply Live Announcement Echo filter to preview playback
    const echoHandle = soundSynthesizer.applyLiveAnnouncementEcho(audio, targetVol);

    activePreviewRef.current = {
      number: item.number,
      audio,
      updateVolume: (v) => {
        if (echoHandle && echoHandle.updateVolume) {
          echoHandle.updateVolume(v);
        } else if (audio) {
          audio.volume = Math.max(0, Math.min(1, v));
        }
      }
    };

    audio.play().catch(() => {});
  };

  const handleToggleGlobalCaller = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setCallerEnabled(val);
    await handleSaveConfig({ english_caller_enabled: String(val) });
  };

  const filtered = settings.filter(
    (s) =>
      s.number.toString().includes(searchQuery.trim()) ||
      s.call_text.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* SECTION 1: Game Audio Settings (Merged Voice & Volume Settings with Gameplay Sounds) */}
      <div className="hg-panel">
        <div className="hg-panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="volume" size={20} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Game Audio Settings</h3>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: "20px" }}>
            
            {/* 1. 1-90 Call Volume & Language Switch */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* 1-90 Call Volume */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                  <span style={{ color: "var(--text)" }}>1-90 Call Volume</span>
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
                    handleSaveConfigDebounced({ master_calls_volume: String(gainVal) });
                  }}
                  style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer", height: "6px", borderRadius: "3px", background: "var(--border-2)" }}
                />
              </div>

              {/* Language Switch */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>Language Switch</span>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: callerEnabled ? "var(--accent)" : "var(--text-dim)" }}>
                    <input
                      type="checkbox"
                      checked={callerEnabled}
                      onChange={handleToggleGlobalCaller}
                      style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                    />
                    <span>Enable Live Audio</span>
                  </label>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                  <button
                    onClick={() => {
                      setAudioLang("en");
                      setWelcomeVoiceLang("en");
                      setInstructionVoiceLang("en");
                      handleSaveConfig({
                        audio_language: "en",
                        welcome_voice_lang: "en",
                        instruction_voice_lang: "en"
                      });
                    }}
                    className="hg-btn"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: audioLang === "en" ? "var(--accent)" : "var(--surface)",
                      color: audioLang === "en" ? "var(--accent-ink)" : "var(--text)",
                      border: audioLang === "en" ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                      boxShadow: audioLang === "en" ? "0 4px 0 -1px var(--ink)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    <span>🇬🇧 ENG (English MP3)</span>
                  </button>

                  <button
                    onClick={() => {
                      setAudioLang("ne");
                      setWelcomeVoiceLang("ne");
                      setInstructionVoiceLang("ne");
                      handleSaveConfig({
                        audio_language: "ne",
                        welcome_voice_lang: "ne",
                        instruction_voice_lang: "ne"
                      });
                    }}
                    className="hg-btn"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: audioLang === "ne" ? "var(--accent)" : "var(--surface)",
                      color: audioLang === "ne" ? "var(--accent-ink)" : "var(--text)",
                      border: audioLang === "ne" ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                      boxShadow: audioLang === "ne" ? "0 4px 0 -1px var(--ink)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    <span>🇳🇵 NEP (Nepali MP3)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Background Music */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Background Music</span>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: bgMusicEnabled ? "var(--accent)" : "var(--text-dim)" }}>
                  <input
                    type="checkbox"
                    checked={bgMusicEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setBgMusicEnabled(val);
                      handleSaveConfig({ background_music_enabled: String(val) });
                    }}
                    style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                  />
                  <span>Enabled</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "4px" }}>
                <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                  <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleConfigAudioUpload("background_music_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                  <span>{uploadingVoiceKey === "background_music_url" ? "..." : bgMusicUrl ? "Replace Loop" : "Upload Background MP3"}</span>
                </label>

                {bgMusicUrl && (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <span className="hg-dim" style={{ fontSize: "11px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bgMusicUrl.split("/").pop()}
                    </span>
                    <button onClick={() => { setBgMusicUrl(""); handleSaveConfig({ background_music_url: "" }); }} title="Remove custom file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                  </div>
                )}
              </div>

              {/* Embedded Player for Background Music */}
              <SpotifyAudioControl
                playerKey="bg"
                audioUrl={bgMusicUrl}
                volume={bgMusicVolume}
                onVolumeChange={(val) => {
                  setBgMusicVolume(val);
                  handleSaveConfigDebounced({ background_music_volume: String(val) });
                  if (audioPlayerRef.current && activePreviewKey === "bg") {
                    audioPlayerRef.current.volume = val;
                  }
                }}
                maxVolume={1.0}
                title="Background Track Player"
                subtitle="Gameplay Audio Atmosphere"
                activePreviewKey={activePreviewKey}
                previewStatus={previewStatus}
                playPreview={playPreview}
                pausePreview={pausePreview}
                stopPreview={stopPreview}
                currentTime={currentTime}
                duration={duration}
                handleSeekChange={handleSeekChange}
              />

              <Button
                variant="cta"
                size="sm"
                onClick={() => handleSaveConfig({ background_music_enabled: String(bgMusicEnabled), background_music_url: bgMusicUrl, background_music_volume: String(bgMusicVolume) })}
                style={{ alignSelf: "flex-end", fontSize: "11px", padding: "6px 14px", borderRadius: "999px", marginTop: "4px" }}
              >
                Save Music Settings
              </Button>
            </div>

            {/* 3. Cage Sound */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Cage Sound</span>
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
              <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={config?.cage_sound_type || "steel_wooden"}
                  onChange={(e) => handleSaveConfig({ cage_sound_type: e.target.value })}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontWeight: 600,
                    outline: "none"
                  }}
                >
                  <option value="steel_wooden">Steel Cage with Wooden Balls</option>
                  <option value="steel_ceramic">Steel Cage with Ceramic Balls</option>
                  <option value="golden_brass">Golden Brass Cage</option>
                </select>

                <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                  <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("cage_sound_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                  <span>{uploadingVoiceKey === "cage_sound_url" ? "..." : cageSoundUrl ? "Replace" : "Upload MP3"}</span>
                </label>

                {cageSoundUrl && (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <span className="hg-dim" style={{ fontSize: "11px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cageSoundUrl.split("/").pop()}
                    </span>
                    <button onClick={() => { stopAllPreviews(); setCageSoundUrl(""); handleSaveConfig({ cage_sound_url: "" }); }} title="Remove custom file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "4px 8px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                  <Icon name="volume" size={13} style={{ color: "var(--accent)" }} />
                  <input type="range" min="0" max="1" step="0.05" value={cageVolume} onChange={(e) => { const v = parseFloat(e.target.value); setCageVolume(v); handleSaveConfigDebounced({ cage_sound_volume: String(v) }); }} style={{ width: "50px", accentColor: "var(--accent)", height: "3px" }} />
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(cageVolume * 100)}%</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11px" }}
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
                  {previewingCage ? "Stop" : "Preview"}
                </Button>
              </div>
            </div>

            {/* 4. Celebration Notification */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Celebration Notification</span>
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
              <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={config?.winner_sound_type || "trumpet_cheering"}
                  onChange={(e) => handleSaveConfig({ winner_sound_type: e.target.value })}
                  style={{
                    flex: 1,
                    minWidth: "160px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontWeight: 600,
                    outline: "none"
                  }}
                >
                  <option value="trumpet_cheering">Trumpet Fanfare with Cheering</option>
                  <option value="cheering">Crowd Cheering</option>
                  <option value="symphony_orchestra">Symphony Orchestra</option>
                </select>

                <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                  <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("celebration_sound_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                  <span>{uploadingVoiceKey === "celebration_sound_url" ? "..." : celebrationSoundUrl ? "Replace" : "Upload Fanfare MP3"}</span>
                </label>

                {celebrationSoundUrl && (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <span className="hg-dim" style={{ fontSize: "11px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {celebrationSoundUrl.split("/").pop()}
                    </span>
                    <button onClick={() => { stopAllPreviews(); setCelebrationSoundUrl(""); handleSaveConfig({ celebration_sound_url: "" }); }} title="Remove custom file" style={{ background: "var(--danger-soft)", border: "1.5px solid var(--ink)", color: "var(--danger)", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "4px 8px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                  <Icon name="volume" size={13} style={{ color: "var(--accent)" }} />
                  <input type="range" min="0" max="1" step="0.05" value={winnerVolume} onChange={(e) => { const v = parseFloat(e.target.value); setWinnerVolume(v); handleSaveConfigDebounced({ winner_sound_volume: String(v) }); }} style={{ width: "50px", accentColor: "var(--accent)", height: "3px" }} />
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(winnerVolume * 100)}%</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11px" }}
                  onClick={() => {
                    stopAllPreviews();
                    soundSynthesizer.playCelebration();
                  }}
                >
                  Preview
                </Button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* SECTION 2: Gameplay Announcements */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
        
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="chat" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Gameplay Announcements</h3>
            </div>
          </div>
          
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap: "20px" }}>
              
              {/* 1. Intro */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>1. Intro</span>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: welcomeVoiceEnabled ? "var(--accent)" : "var(--text-dim)" }}>
                      <input
                        type="checkbox"
                        checked={welcomeVoiceEnabled}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setWelcomeVoiceEnabled(val);
                          handleSaveConfig({ welcome_voice_enabled: String(val) });
                        }}
                        style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  {/* Intro Language Toggle */}
                  <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "3px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                    <button
                      onClick={() => {
                        setWelcomeVoiceLang("en");
                        handleSaveConfig({ welcome_voice_lang: "en" });
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: welcomeVoiceLang === "en" ? "var(--accent)" : "transparent",
                        color: welcomeVoiceLang === "en" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      🇬🇧 ENG
                    </button>
                    <button
                      onClick={() => {
                        setWelcomeVoiceLang("ne");
                        handleSaveConfig({ welcome_voice_lang: "ne" });
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: welcomeVoiceLang === "ne" ? "var(--accent)" : "transparent",
                        color: welcomeVoiceLang === "ne" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      🇳🇵 NEP
                    </button>
                  </div>
                </div>

                {/* Dual Upload Inputs for Intro */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {/* English Intro File */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--surface)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text)" }}>🇬🇧 English Intro MP3</span>
                    <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "6px 10px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                      <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("welcome_voice_url_en", e)} style={{ display: "none" }} />
                      <span>{welcomeVoiceUrlEn ? "Replace ENG" : "Upload ENG MP3"}</span>
                    </label>
                    {welcomeVoiceUrlEn && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="hg-dim" style={{ fontSize: "10px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{welcomeVoiceUrlEn.split("/").pop()}</span>
                        <button onClick={() => { setWelcomeVoiceUrlEn(""); handleSaveConfig({ welcome_voice_url_en: "" }); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Icon name="volume" size={12} style={{ color: "var(--accent)" }} />
                      <input type="range" min="0" max="1" step="0.05" value={welcomeVoiceVolEn} onChange={(e) => { const v = parseFloat(e.target.value); setWelcomeVoiceVolEn(v); handleSaveConfigDebounced({ welcome_voice_volume_en: String(v) }); }} style={{ flex: 1, accentColor: "var(--accent)", height: "3px" }} />
                      <span style={{ fontSize: "9.5px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(welcomeVoiceVolEn * 100)}%</span>
                    </div>
                  </div>

                  {/* Nepali Intro File */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--surface)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text)" }}>🇳🇵 Nepali Intro MP3</span>
                    <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "6px 10px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                      <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("welcome_voice_url_ne", e)} style={{ display: "none" }} />
                      <span>{welcomeVoiceUrlNe ? "Replace NEP" : "Upload NEP MP3"}</span>
                    </label>
                    {welcomeVoiceUrlNe && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="hg-dim" style={{ fontSize: "10px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{welcomeVoiceUrlNe.split("/").pop()}</span>
                        <button onClick={() => { setWelcomeVoiceUrlNe(""); handleSaveConfig({ welcome_voice_url_ne: "" }); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Icon name="volume" size={12} style={{ color: "var(--accent)" }} />
                      <input type="range" min="0" max="1" step="0.05" value={welcomeVoiceVolNe} onChange={(e) => { const v = parseFloat(e.target.value); setWelcomeVoiceVolNe(v); handleSaveConfigDebounced({ welcome_voice_volume_ne: String(v) }); }} style={{ flex: 1, accentColor: "var(--accent)", height: "3px" }} />
                      <span style={{ fontSize: "9.5px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(welcomeVoiceVolNe * 100)}%</span>
                    </div>
                  </div>
                </div>

                {/* Spotify Embedded Player for Intro */}
                <SpotifyAudioControl
                  playerKey={welcomeVoiceLang === "ne" ? "welcome_ne" : "welcome_en"}
                  audioUrl={welcomeVoiceLang === "ne" ? welcomeVoiceUrlNe : welcomeVoiceUrlEn}
                  volume={welcomeVoiceLang === "ne" ? welcomeVoiceVolNe : welcomeVoiceVolEn}
                  onVolumeChange={(val) => {
                    if (welcomeVoiceLang === "ne") {
                      setWelcomeVoiceVolNe(val);
                      handleSaveConfigDebounced({ welcome_voice_volume_ne: String(val) });
                    } else {
                      setWelcomeVoiceVolEn(val);
                      handleSaveConfigDebounced({ welcome_voice_volume_en: String(val) });
                    }
                  }}
                  title={`Intro Player (${welcomeVoiceLang.toUpperCase()})`}
                  subtitle={welcomeVoiceLang === "ne" ? "Nepali Welcome Audio" : "English Welcome Audio"}
                  activePreviewKey={activePreviewKey}
                  previewStatus={previewStatus}
                  playPreview={playPreview}
                  pausePreview={pausePreview}
                  stopPreview={stopPreview}
                  currentTime={currentTime}
                  duration={duration}
                  handleSeekChange={handleSeekChange}
                />

                <Button
                  variant="cta"
                  size="sm"
                  onClick={() => handleSaveConfig({
                    welcome_voice_enabled: String(welcomeVoiceEnabled),
                    welcome_voice_url_en: welcomeVoiceUrlEn,
                    welcome_voice_url_ne: welcomeVoiceUrlNe,
                    welcome_voice_volume_en: String(welcomeVoiceVolEn),
                    welcome_voice_volume_ne: String(welcomeVoiceVolNe),
                    welcome_voice_lang: welcomeVoiceLang
                  })}
                  style={{ alignSelf: "flex-end", fontSize: "11px", padding: "6px 14px", borderRadius: "999px" }}
                >
                  Save Intro Settings
                </Button>
              </div>

              {/* 2. Outro */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>2. Outro</span>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: instructionVoiceEnabled ? "var(--accent)" : "var(--text-dim)" }}>
                      <input
                        type="checkbox"
                        checked={instructionVoiceEnabled}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setInstructionVoiceEnabled(val);
                          handleSaveConfig({ instruction_voice_enabled: String(val) });
                        }}
                        style={{ accentColor: "var(--accent)", width: "13px", height: "13px" }}
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  {/* Outro Language Toggle */}
                  <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "3px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                    <button
                      onClick={() => {
                        setInstructionVoiceLang("en");
                        handleSaveConfig({ instruction_voice_lang: "en" });
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: instructionVoiceLang === "en" ? "var(--accent)" : "transparent",
                        color: instructionVoiceLang === "en" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      🇬🇧 ENG
                    </button>
                    <button
                      onClick={() => {
                        setInstructionVoiceLang("ne");
                        handleSaveConfig({ instruction_voice_lang: "ne" });
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        background: instructionVoiceLang === "ne" ? "var(--accent)" : "transparent",
                        color: instructionVoiceLang === "ne" ? "#000" : "var(--text-dim)",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      🇳🇵 NEP
                    </button>
                  </div>
                </div>

                {/* Dual Upload Inputs for Outro */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {/* English Outro File */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--surface)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text)" }}>🇬🇧 English Outro MP3</span>
                    <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "6px 10px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                      <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("instruction_voice_url_en", e)} style={{ display: "none" }} />
                      <span>{instructionVoiceUrlEn ? "Replace ENG" : "Upload ENG MP3"}</span>
                    </label>
                    {instructionVoiceUrlEn && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="hg-dim" style={{ fontSize: "10px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instructionVoiceUrlEn.split("/").pop()}</span>
                        <button onClick={() => { setInstructionVoiceUrlEn(""); handleSaveConfig({ instruction_voice_url_en: "" }); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Icon name="volume" size={12} style={{ color: "var(--accent)" }} />
                      <input type="range" min="0" max="1" step="0.05" value={instructionVoiceVolEn} onChange={(e) => { const v = parseFloat(e.target.value); setInstructionVoiceVolEn(v); handleSaveConfigDebounced({ instruction_voice_volume_en: String(v) }); }} style={{ flex: 1, accentColor: "var(--accent)", height: "3px" }} />
                      <span style={{ fontSize: "9.5px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(instructionVoiceVolEn * 100)}%</span>
                    </div>
                  </div>

                  {/* Nepali Outro File */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--surface)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-2)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text)" }}>🇳🇵 Nepali Outro MP3</span>
                    <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "6px 10px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                      <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleConfigAudioUpload("instruction_voice_url_ne", e)} style={{ display: "none" }} />
                      <span>{instructionVoiceUrlNe ? "Replace NEP" : "Upload NEP MP3"}</span>
                    </label>
                    {instructionVoiceUrlNe && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="hg-dim" style={{ fontSize: "10px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instructionVoiceUrlNe.split("/").pop()}</span>
                        <button onClick={() => { setInstructionVoiceUrlNe(""); handleSaveConfig({ instruction_voice_url_ne: "" }); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}><Icon name="trash" size={12} /></button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Icon name="volume" size={12} style={{ color: "var(--accent)" }} />
                      <input type="range" min="0" max="1" step="0.05" value={instructionVoiceVolNe} onChange={(e) => { const v = parseFloat(e.target.value); setInstructionVoiceVolNe(v); handleSaveConfigDebounced({ instruction_voice_volume_ne: String(v) }); }} style={{ flex: 1, accentColor: "var(--accent)", height: "3px" }} />
                      <span style={{ fontSize: "9.5px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round(instructionVoiceVolNe * 100)}%</span>
                    </div>
                  </div>
                </div>

                {/* Spotify Embedded Player for Outro */}
                <SpotifyAudioControl
                  playerKey={instructionVoiceLang === "ne" ? "instruction_ne" : "instruction_en"}
                  audioUrl={instructionVoiceLang === "ne" ? instructionVoiceUrlNe : instructionVoiceUrlEn}
                  volume={instructionVoiceLang === "ne" ? instructionVoiceVolNe : instructionVoiceVolEn}
                  onVolumeChange={(val) => {
                    if (instructionVoiceLang === "ne") {
                      setInstructionVoiceVolNe(val);
                      handleSaveConfigDebounced({ instruction_voice_volume_ne: String(val) });
                    } else {
                      setInstructionVoiceVolEn(val);
                      handleSaveConfigDebounced({ instruction_voice_volume_en: String(val) });
                    }
                  }}
                  title={`Outro Player (${instructionVoiceLang.toUpperCase()})`}
                  subtitle={instructionVoiceLang === "ne" ? "Nepali Outro Audio" : "English Outro Audio"}
                  activePreviewKey={activePreviewKey}
                  previewStatus={previewStatus}
                  playPreview={playPreview}
                  pausePreview={pausePreview}
                  stopPreview={stopPreview}
                  currentTime={currentTime}
                  duration={duration}
                  handleSeekChange={handleSeekChange}
                />

                <Button
                  variant="cta"
                  size="sm"
                  onClick={() => handleSaveConfig({
                    instruction_voice_enabled: String(instructionVoiceEnabled),
                    instruction_voice_url_en: instructionVoiceUrlEn,
                    instruction_voice_url_ne: instructionVoiceUrlNe,
                    instruction_voice_volume_en: String(instructionVoiceVolEn),
                    instruction_voice_volume_ne: String(instructionVoiceVolNe),
                    instruction_voice_lang: instructionVoiceLang
                  })}
                  style={{ alignSelf: "flex-end", fontSize: "11px", padding: "6px 14px", borderRadius: "999px" }}
                >
                  Save Outro Settings
                </Button>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* CARD 4: 1 to 90 Dual Language Number Calls Directory */}
      <div className="hg-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid var(--card-line)", padding: "14px 16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="grid" size={20} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>1-90 Call Audio Files</h3>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            {/* Universal Language Switch Toggle for 1-90 Calls */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "var(--surface-2)", padding: "4px 8px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", marginRight: "4px" }}>Universal Language:</span>
              <button
                onClick={() => {
                  setAudioLang("en");
                  handleSaveConfig({ audio_language: "en" });
                }}
                style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  border: "none",
                  background: audioLang === "en" ? "var(--accent)" : "transparent",
                  color: audioLang === "en" ? "#000" : "var(--text-dim)",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                🇬🇧 ENG
              </button>
              <button
                onClick={() => {
                  setAudioLang("ne");
                  handleSaveConfig({ audio_language: "ne" });
                }}
                style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  border: "none",
                  background: audioLang === "ne" ? "var(--accent)" : "transparent",
                  color: audioLang === "ne" ? "#000" : "var(--text-dim)",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                🇳🇵 NEP
              </button>
            </div>

            <input
              type="text"
              placeholder="Search number or phrase..."
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
                minWidth: "220px"
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "650px", overflowY: "auto", padding: "16px 20px" }}>
          {filtered.length === 0 ? (
            <div className="text-center p-8 text-mute" style={{ fontStyle: "italic", fontSize: "13px" }}>No numbers match your search query.</div>
          ) : (
            filtered.map((item) => {
              const engAudio = item.audio_url_en;
              const nepAudio = item.audio_url_ne || item.audio_url;

              return (
                <div
                  key={item.number}
                  className="hg-numcall-row"
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
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 240px" }}>
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

                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Number {item.number}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>{item.call_text}</span>
                    </div>
                  </div>

                  {/* Dual Language Audio Uploads & Playback */}
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    
                    {/* 🇬🇧 English MP3 Control */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "6px 12px", borderRadius: "999px", border: "1px solid var(--border-2)" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700 }}>🇬🇧 ENG</span>
                      <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "4px 8px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                        <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleFileUpload(item.number, e, "en")} style={{ display: "none" }} />
                        <span>{uploadingNum === item.number ? "..." : engAudio ? "Replace" : "Upload"}</span>
                      </label>
                      <Button variant="ghost" size="sm" style={{ padding: "4px 8px", fontSize: "10.5px", borderRadius: "999px" }} onClick={() => playCallPreview(item, "en")}>Listen</Button>
                      {engAudio && (
                        <button onClick={() => handleDeleteNumberAudio(item.number, "en")} title="Delete English file" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}><Icon name="trash" size={12} /></button>
                      )}
                    </div>

                    {/* 🇳🇵 Nepali MP3 Control */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "6px 12px", borderRadius: "999px", border: "1px solid var(--border-2)" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700 }}>🇳🇵 NEP</span>
                      <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--ink)", padding: "4px 8px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0 }}>
                        <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => handleFileUpload(item.number, e, "ne")} style={{ display: "none" }} />
                        <span>{uploadingNum === item.number ? "..." : nepAudio ? "Replace" : "Upload"}</span>
                      </label>
                      <Button variant="ghost" size="sm" style={{ padding: "4px 8px", fontSize: "10.5px", borderRadius: "999px" }} onClick={() => playCallPreview(item, "ne")}>Listen</Button>
                      {nepAudio && (
                        <button onClick={() => handleDeleteNumberAudio(item.number, "ne")} title="Delete Nepali file" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}><Icon name="trash" size={12} /></button>
                      )}
                    </div>

                    {/* Volume Slider per row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface)", padding: "6px 10px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                      <Icon name="volume" size={12} style={{ color: "var(--accent)" }} />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round((item.volume !== undefined ? item.volume : 1.0) * 100)}
                        onChange={async (e) => {
                          const sliderVal = parseInt(e.target.value, 10) / 100;
                          setSettings(prev => prev.map(s => s.number === item.number ? { ...s, volume: sliderVal } : s));
                          await apiFetch(`/api/games/number-calls/${item.number}`, {
                            method: "PATCH",
                            body: JSON.stringify({ volume: sliderVal }),
                          });
                        }}
                        style={{ width: "50px", accentColor: "var(--accent)", cursor: "pointer", height: "3px" }}
                      />
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-mute)" }}>{Math.round((item.volume !== undefined ? item.volume : 1.0) * 100)}%</span>
                    </div>

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
