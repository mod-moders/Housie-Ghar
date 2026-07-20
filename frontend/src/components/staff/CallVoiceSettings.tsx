"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch, resolveAudioUrl } from "@/lib/api";
import { Button } from "@/components/ui";
import { useConfigStore } from "@/lib/stores/configStore";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { Icon } from "@/components/Icon";
import { getTop5CuratedVoices } from "@/lib/voiceUtils";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
}

interface SpotifyAudioControlProps {
  playerKey: string;
  audioUrl: string | null;
  text: string;
  mode: string;
  volume: number;
  onVolumeChange: (vol: number) => void;
  maxVolume?: number;
  title: string;
  subtitle: string;
  activePreviewKey: string | null;
  previewStatus: "playing" | "paused" | "stopped";
  playPreview: (key: string, url: string, fallbackText: string, voiceName?: string | null) => void;
  pausePreview: (key: string) => void;
  stopPreview: (key: string) => void;
  currentTime: number;
  duration: number;
  handleSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ttsVoiceName?: string;
}

function SpotifyAudioControl({
  playerKey,
  audioUrl,
  text,
  mode,
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
  ttsVoiceName,
}: SpotifyAudioControlProps) {
  const isActive = activePreviewKey === playerKey;
  const isPlaying = isActive && previewStatus === "playing";
  const isPaused = isActive && previewStatus === "paused";

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pausePreview(playerKey);
    } else {
      playPreview(playerKey, audioUrl || "", text, ttsVoiceName || null);
    }
  };

  const handleStopClick = () => {
    stopPreview(playerKey);
  };

  const [prevVolume, setPrevVolume] = useState(volume || 0.5);
  const handleMuteToggle = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      onVolumeChange(0);
    } else {
      onVolumeChange(prevVolume || 0.5);
    }
  };

  return (
    <div 
      className="spotify-player" 
      style={{
        background: "var(--surface)",
        border: "1.5px solid var(--border-2)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        position: "relative",
        boxShadow: "var(--card-shadow-sm)",
        transition: "all 0.2s ease",
        marginTop: "10px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "120px", flex: "1 1 auto" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>{title}</span>
          <span style={{ fontSize: "10px", color: "var(--text-mute)" }}>{subtitle}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button 
            onClick={handleStopClick} 
            disabled={!isActive}
            style={{ 
              width: "24px", 
              height: "24px", 
              borderRadius: "50%", 
              border: "none", 
              background: "var(--surface-2)", 
              color: isActive ? "var(--text)" : "var(--text-mute)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              cursor: isActive ? "pointer" : "default",
              transition: "transform 0.1s ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              opacity: isActive ? 1 : 0.5
            }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          </button>

          <button 
            onClick={handlePlayPause}
            style={{ 
              width: "32px", 
              height: "32px", 
              borderRadius: "50%", 
              border: "none", 
              background: isPlaying ? "var(--accent)" : "var(--text)", 
              color: isPlaying ? "var(--accent-ink)" : "var(--bg)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
            }}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={14} fill="currentColor" stroke="none" />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "100px" }}>
          <button 
            onClick={handleMuteToggle}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
          >
            <Icon name={volume === 0 ? "volumeX" : "volume"} size={14} />
          </button>
          <input 
            type="range" 
            min="0" 
            max={maxVolume} 
            step="0.01" 
            value={volume} 
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            style={{ 
              width: "55px", 
              accentColor: "var(--accent)", 
              cursor: "pointer", 
              height: "3px", 
              borderRadius: "1.5px", 
              background: "var(--border-2)" 
            }}
          />
          <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-mute)", minWidth: "25px" }}>
            {Math.round((volume / maxVolume) * 100)}%
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", marginTop: "4px" }}>
        {mode === "Audio" ? (
          <>
            <span style={{ fontSize: "10px", color: "var(--text-mute)", fontFamily: "var(--font-mono)", width: "30px", textAlign: "right" }}>
              {isActive ? formatTime(currentTime) : "0:00"}
            </span>
            <input 
              type="range" 
              min="0" 
              max={isActive ? (duration || 1) : 1} 
              step="0.1" 
              value={isActive ? currentTime : 0} 
              disabled={!isActive}
              onChange={handleSeekChange}
              style={{ 
                flex: 1, 
                accentColor: "var(--accent)", 
                cursor: isActive ? "pointer" : "default", 
                height: "4px", 
                borderRadius: "2px", 
                background: "var(--border-2)",
                opacity: isActive ? 1 : 0.5 
              }}
            />
            <span style={{ fontSize: "10px", color: "var(--text-mute)", fontFamily: "var(--font-mono)", width: "30px" }}>
              {isActive ? formatTime(duration) : "0:00"}
            </span>
          </>
        ) : (
          <div 
            style={{ 
              width: "100%", 
              textAlign: "center", 
              fontSize: "11px", 
              color: isPlaying ? "var(--accent)" : "var(--text-mute)", 
              fontStyle: "italic",
              fontWeight: 600,
              padding: "4px 0",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            {isPlaying ? (
              <>
                <span className="speech-pulse" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.2s infinite" }}></span>
                <span>Playing Speech Synthesis (Text-To-Speech)...</span>
              </>
            ) : (
              <span>Speech Synthesis (No scrubber)</span>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.85); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.85); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
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
  const [welcomeVoiceEnabled, setWelcomeVoiceEnabled] = useState(config?.welcome_voice_enabled !== "false");
  const [instructionVoiceEnabled, setInstructionVoiceEnabled] = useState(config?.instruction_voice_enabled !== "false");
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const activeAnnouncementHandleRef = useRef<{ updateVolume: (v: number) => void; audio: HTMLAudioElement } | null>(null);

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
      setWelcomeVoiceEnabled(config.welcome_voice_enabled !== "false");
      setInstructionVoiceEnabled(config.instruction_voice_enabled !== "false");
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
      if (activeAnnouncementHandleRef.current) {
        try {
          activeAnnouncementHandleRef.current.audio.pause();
          activeAnnouncementHandleRef.current.audio.src = "";
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

    const fileName = file.name.toLowerCase().trim();
    const audioExtensions = [".mp3", ".wav", ".m4a", ".mp4", ".mpeg", ".mpg", ".ogg", ".webm", ".aac", ".flac", ".opus", ".3gp", ".wma", ".m4r"];
    const hasAudioExt = audioExtensions.some(ext => fileName.endsWith(ext));
    const isAudioType = file.type.startsWith("audio/") || file.type.startsWith("video/") || hasAudioExt;

    if (!isAudioType) {
      alert(`Please upload a valid audio file (MP3, WAV, M4A, OGG, WEBM, AAC, FLAC, OPUS, MP4, etc.). Detected: ${file.name}`);
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
    setCurrentTime(0);
    setDuration(0);

    if (activePreviewRef.current) {
      try {
        activePreviewRef.current.audio.pause();
        activePreviewRef.current.audio.src = "";
      } catch {}
      activePreviewRef.current = null;
    }

    if (activeAnnouncementHandleRef.current) {
      try {
        activeAnnouncementHandleRef.current.audio.pause();
        activeAnnouncementHandleRef.current.audio.src = "";
      } catch {}
      activeAnnouncementHandleRef.current = null;
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
    if (!voice && voiceName) {
      const cleanSearch = voiceName.replace(/undefined/gi, "").trim();
      if (cleanSearch) {
        voice = voices.find(v => v.name.includes(cleanSearch) || cleanSearch.includes(v.name));
      }
    }
    if (!voice) {
      const ranked = getTop5CuratedVoices(voices);
      if (ranked.length > 0 && ranked[0].rawVoice) voice = ranked[0].rawVoice;
    }
    if (voice) utterance.voice = voice;
    utterance.pitch = 1.0;
    utterance.rate = 0.95;

    utterance.onend = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
      setCurrentTime(0);
      setDuration(0);
    };

    utterance.onerror = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
      setCurrentTime(0);
      setDuration(0);
    };

    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPreviewStatus("playing");
  };

  const startNewAudio = (rawUrl: string, key: string) => {
    const url = resolveAudioUrl(rawUrl);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }

    const audio = new Audio(url);
    if (!url.startsWith("data:")) {
      audio.crossOrigin = "anonymous";
    }
    audio.id = "preview-audio-element";
    audio.volume = key === "bg" ? bgMusicVolume : (key.startsWith("lobby") || [1, 2, 3, 4, 5].some((idx) => url === (config as any)?.[`lobby_music_url_${idx}`])) ? lobbyMusicVolume : 0.8;

    if (key === "welcome" || key === "instruction") {
      const volMultiplier = key === "welcome" ? welcomeVoiceVolume : instructionVoiceVolume;
      const handle = soundSynthesizer.applyLiveAnnouncementEcho(audio, volMultiplier * masterCallsVolume);
      if (handle) {
        activeAnnouncementHandleRef.current = {
          updateVolume: handle.updateVolume,
          audio
        };
      }
    }

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };

    audio.onended = () => {
      setActivePreviewKey(null);
      setPreviewStatus("stopped");
      setCurrentTime(0);
      setDuration(0);
    };

    audioPlayerRef.current = audio;
    const attemptPlay = (isRetry: boolean = false) => {
      audio.play().then(() => {
        setPreviewStatus("playing");
      }).catch((err) => {
        if (!isRetry && audio.crossOrigin) {
          audio.crossOrigin = null;
          attemptPlay(true);
          return;
        }
        console.error("Preview play failed:", err, "URL:", url);
        alert(`Failed to play audio preview (${err?.message || "Playback error"}). Please verify the audio file format.`);
        setActivePreviewKey(null);
        setPreviewStatus("stopped");
        setCurrentTime(0);
        setDuration(0);
      });
    };
    attemptPlay();
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
    setCurrentTime(0);
    setDuration(0);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = val;
    }
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
      setVoices(all);

      const ranked = getTop5CuratedVoices(all);
      const bestDefault = ranked.find((v) => v.isNeural) || ranked[0];
      const stored = localStorage.getItem("preferred_caller_voice");

      if (stored) {
        setSelectedVoiceName(stored);
      } else if (bestDefault) {
        setSelectedVoiceName(bestDefault.name);
        localStorage.setItem("preferred_caller_voice", bestDefault.name);
      }

      if (!config?.tts_voice_name && bestDefault) {
        setTtsVoiceName(bestDefault.name);
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
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase().trim();
    const audioExtensions = [".mp3", ".wav", ".m4a", ".mp4", ".mpeg", ".mpg", ".ogg", ".webm", ".aac", ".flac", ".opus", ".3gp", ".wma", ".m4r"];
    const hasAudioExt = audioExtensions.some(ext => fileName.endsWith(ext));
    const isAudioType = file.type.startsWith("audio/") || file.type.startsWith("video/") || hasAudioExt;

    if (!isAudioType) {
      alert(`Please upload a valid audio file (MP3, WAV, M4A, OGG, WEBM, AAC, FLAC, OPUS, MP4, etc.). Detected: ${file.name}`);
      return;
    }

    setUploadingNum(num);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await apiFetch<{ audio_url?: string }>(`/api/games/number-calls/${num}/upload`, {
          method: "POST",
          body: JSON.stringify({ audio_data: base64 }),
        });
        if (res?.audio_url) {
          setSettings(prev => prev.map(s => s.number === num ? { ...s, audio_url: res.audio_url || null, call_mode: "Audio" } : s));
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
      const resolvedUrl = resolveAudioUrl(item.audio_url);
      const audio = new Audio(resolvedUrl);
      if (!resolvedUrl.startsWith("data:")) {
        audio.crossOrigin = "anonymous";
      }
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
        
        {/* CARD 1: Voice & Volume Settings */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="volume" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Voice &amp; Volume Settings</h3>
            </div>
          </div>
          
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Subsection: Master Voice Volume */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
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

            {/* Subsection: AI Voice Caller Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>🎙️ AI Voice Config</span>
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

                    // Instant live audio preview test when admin changes TTS voice
                    if (typeof window !== "undefined" && "speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                      const sampleText = val.toLowerCase().includes("hi") || val.toLowerCase().includes("hindi")
                        ? "आवाज अपडेट की गई। हाउसी घर एआई कॉलर तैयार है।"
                        : val.toLowerCase().includes("ne") || val.toLowerCase().includes("nepali")
                          ? "आवाज अपडेट गरियो। हाउसी घर एआई कलर तयार छ।"
                          : "Voice updated! Housie Ghar AI Caller is ready.";
                      const utterance = new SpeechSynthesisUtterance(sampleText);
                      const allVoices = window.speechSynthesis.getVoices();
                      let matchedVoice = allVoices.find(x => x.name === val);
                      if (!matchedVoice) {
                        const top5 = getTop5CuratedVoices(allVoices);
                        const m = top5.find(x => x.name === val);
                        if (m && m.rawVoice) matchedVoice = m.rawVoice;
                      }
                      if (matchedVoice) utterance.voice = matchedVoice;
                      utterance.pitch = 1.0;
                      utterance.rate = 0.95;
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--border-2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "var(--font-head)",
                    fontSize: "12px",
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                    marginTop: "4px"
                  }}
                >
                  {getTop5CuratedVoices(voices).map((fv) => (
                    <option key={fv.name} value={fv.name} style={{ backgroundColor: "var(--surface)", color: "var(--text)" }}>
                      {fv.badge} — {fv.cleanName} ({fv.lang})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Subsection: Global Playback Mode Switcher */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>🎙️ Global Playback Mode (All 1-90 Numbers)</span>
              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
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
                    padding: "8px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: settings.every(s => s.call_mode === "Text") ? "var(--accent)" : "var(--surface)",
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
                    padding: "8px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "var(--accent)" : "var(--surface)",
                    color: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "var(--accent-ink)" : "var(--text)",
                    border: settings.filter(s => s.audio_url).every(s => s.call_mode === "Audio") ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                    transition: "all 0.2s"
                  }}
                >
                  <span>🎵 Use MP3</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Gameplay Sounds (consolidating Background Music, Cage & Celebration) */}
        <div className="hg-panel">
          <div className="hg-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="zap" size={20} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Gameplay Sounds</h3>
            </div>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Subsection: Gameplay Background Music */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>🎵 Gameplay Background Music</span>
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

              {bgMusicUrl && !["", "/audio/music/soft_lounge.wav", "/audio/music/retro_arcade.wav", "/audio/music/traditional_flute.wav"].includes(bgMusicUrl) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "8px", border: "1px dashed var(--border-2)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      🎵 {bgMusicUrl.startsWith("data:") ? "custom_music_loop.mp3" : decodeURIComponent(bgMusicUrl.split("/").pop() || "custom_music_loop.mp3")}
                    </span>
                    <button onClick={() => { setBgMusicUrl(""); handleSaveConfig({ background_music_url: "" }); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "11px", fontWeight: 700, textDecoration: "underline", padding: 0 }}>Reset</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <select
                    value={bgMusicUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBgMusicUrl(val);
                      handleSaveConfig({ background_music_url: val });
                    }}
                    style={{
                      width: "100%",
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
                    <option value="">None / Silent</option>
                    <option value="/audio/music/soft_lounge.wav">Preset 1: Soft Lounge Loop</option>
                    <option value="/audio/music/retro_arcade.wav">Preset 2: Retro Arcade Loop</option>
                    <option value="/audio/music/traditional_flute.wav">Preset 3: Calm Indian Flute</option>
                  </select>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", gap: "8px", flexWrap: "wrap" }}>
                <label className="hg-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1.5px solid var(--ink)", padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: "4px", margin: 0, boxShadow: "0 4px 0 -1px var(--ink)" }}>
                  <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp3,.wav,.m4a,.mpeg,.mpg" onChange={(e) => handleConfigAudioUpload("background_music_url", e)} style={{ display: "none" }} disabled={uploadingVoiceKey !== null} />
                  <span>📁 {bgMusicUrl ? "Replace Loop" : "Upload Loop"}</span>
                </label>

                {bgMusicUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface)", padding: "4px 10px", borderRadius: "999px", border: "1.5px solid var(--border-2)" }}>
                    <button 
                      onClick={() => {
                        if (activePreviewKey === "bg" && previewStatus === "playing") {
                          pausePreview("bg");
                        } else {
                          playPreview("bg", bgMusicUrl, "");
                        }
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        border: "none",
                        background: activePreviewKey === "bg" && previewStatus === "playing" ? "var(--accent)" : "transparent",
                        color: activePreviewKey === "bg" && previewStatus === "playing" ? "#000" : "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer"
                      }}
                    >
                      <Icon name={activePreviewKey === "bg" && previewStatus === "playing" ? "pause" : "play"} size={12} fill="currentColor" stroke="none" />
                    </button>

                    <button 
                      onClick={() => stopPreview("bg")}
                      disabled={activePreviewKey !== "bg"}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        border: "none",
                        background: "transparent",
                        color: activePreviewKey === "bg" ? "var(--text)" : "var(--text-mute)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: activePreviewKey === "bg" ? "pointer" : "default"
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px", borderLeft: "1px solid var(--border-2)", paddingLeft: "6px" }}>
                      <button 
                        onClick={() => {
                          const nextVal = bgMusicVolume > 0 ? 0 : 0.15;
                          setBgMusicVolume(nextVal);
                          updateConfigLocally({ background_music_volume: String(nextVal) });
                          if (audioPlayerRef.current && activePreviewKey === "bg") {
                            audioPlayerRef.current.volume = nextVal;
                          }
                          handleSaveConfig({ background_music_volume: String(nextVal) });
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
                      >
                        <Icon name={bgMusicVolume === 0 ? "volumeX" : "volume"} size={14} />
                      </button>
                      <input 
                        type="range" 
                        min="0" 
                        max="1.0" 
                        step="0.01" 
                        value={bgMusicVolume} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setBgMusicVolume(val);
                          updateConfigLocally({ background_music_volume: String(val) });
                          if (audioPlayerRef.current && activePreviewKey === "bg") {
                            audioPlayerRef.current.volume = val;
                          }
                          if (masterVolumeSaveTimeoutRef.current) clearTimeout(masterVolumeSaveTimeoutRef.current);
                          masterVolumeSaveTimeoutRef.current = setTimeout(() => {
                            handleSaveConfig({ background_music_volume: String(val) });
                          }, 350);
                        }}
                        style={{ 
                          width: "50px", 
                          accentColor: "var(--accent)", 
                          cursor: "pointer", 
                          height: "3px", 
                          borderRadius: "1.5px", 
                          background: "var(--border-2)" 
                        }}
                      />
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-mute)", minWidth: "22px" }}>
                        {Math.round(bgMusicVolume * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Subsection: Realistic Tambola Cage Draw */}
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

            {/* Subsection: Celebratory Winner Fanfare */}
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

      {/* Grid of Voice Notes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
        
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap: "20px" }}>
              
              {/* Intro Note */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>1. Intro Note</span>
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
                    <textarea
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      placeholder="Intro TTS announcement text..."
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid var(--border-2)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: "12.5px",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                        lineHeight: "1.4"
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
                  </div>
                )}

                <SpotifyAudioControl
                  playerKey="welcome"
                  audioUrl={welcomeVoice}
                  text={welcomeText}
                  mode={welcomeVoiceMode}
                  volume={welcomeVoiceVolume}
                  onVolumeChange={(val) => {
                    setWelcomeVoiceVolume(val);
                    handleSaveConfig({ welcome_voice_volume: String(val) });
                    if (activeAnnouncementHandleRef.current && activePreviewKey === "welcome") {
                      activeAnnouncementHandleRef.current.updateVolume(val * masterCallsVolume);
                    }
                  }}
                  maxVolume={2.0}
                  title="Intro Preview Player"
                  subtitle={welcomeVoiceMode === "Text" ? "Text-To-Speech Mode" : "Custom Audio Mode"}
                  activePreviewKey={activePreviewKey}
                  previewStatus={previewStatus}
                  playPreview={playPreview}
                  pausePreview={pausePreview}
                  stopPreview={stopPreview}
                  currentTime={currentTime}
                  duration={duration}
                  handleSeekChange={handleSeekChange}
                  ttsVoiceName={ttsVoiceName}
                />
              </div>

              {/* Outro Note */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-2)", padding: "14px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>2. Outro Note</span>
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
                    <textarea
                      value={instructionText}
                      onChange={(e) => setInstructionText(e.target.value)}
                      placeholder="Outro TTS announcement text..."
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid var(--border-2)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: "12.5px",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                        lineHeight: "1.4"
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
                  </div>
                )}

                <SpotifyAudioControl
                  playerKey="instruction"
                  audioUrl={instructionVoice}
                  text={instructionText}
                  mode={instructionVoiceMode}
                  volume={instructionVoiceVolume}
                  onVolumeChange={(val) => {
                    setInstructionVoiceVolume(val);
                    handleSaveConfig({ instruction_voice_volume: String(val) });
                    if (activeAnnouncementHandleRef.current && activePreviewKey === "instruction") {
                      activeAnnouncementHandleRef.current.updateVolume(val * masterCallsVolume);
                    }
                  }}
                  maxVolume={2.0}
                  title="Outro Preview Player"
                  subtitle={instructionVoiceMode === "Text" ? "Text-To-Speech Mode" : "Custom Audio Mode"}
                  activePreviewKey={activePreviewKey}
                  previewStatus={previewStatus}
                  playPreview={playPreview}
                  pausePreview={pausePreview}
                  stopPreview={stopPreview}
                  currentTime={currentTime}
                  duration={duration}
                  handleSeekChange={handleSeekChange}
                  ttsVoiceName={ttsVoiceName}
                />
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

                  <div className="hg-numcall-controls" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", flexShrink: 0 }}>

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
