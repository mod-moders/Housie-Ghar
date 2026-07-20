import { useEffect, useState, useRef } from "react";
import { englishPhrases } from "@/lib/englishPhrases";
import { apiFetch, resolveAudioUrl } from "@/lib/api";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { useConfigStore } from "@/lib/stores/configStore";
import { useSocket } from "@/lib/hooks/useSocket";

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

export function useGameAudio(
  englishCallerEnabled: boolean, 
  isGameLive: boolean, 
  isMuted: boolean = false,
  gameCallMode?: "TTS" | "Audio" | "Text",
  gameBgMusicEnabled?: boolean,
  gameIntroMode?: "TTS" | "Audio" | "Text",
  gameOutroMode?: "TTS" | "Audio" | "Text"
) {
  const [callsConfig, setCallsConfig] = useState<Record<number, NumberCallConfig>>({});
  const { config: platformConfig } = useConfigStore();
  
  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);
  const isMountedRef = useRef<boolean>(true);
  
  const isIntroPlayingRef = useRef<boolean>(false);
  const pendingNumbersQueueRef = useRef<number[]>([]);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      
      activeAudiosRef.current.forEach((audio) => {
        try {
          audio.pause();
          audio.src = "";
        } catch {}
      });
      activeAudiosRef.current = [];

      activeTimersRef.current.forEach((t) => clearTimeout(t));
      activeTimersRef.current = [];

      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
          bgMusicRef.current.src = "";
        } catch {}
        bgMusicRef.current = null;
      }
    };
  }, []);

  const loadCallsConfig = () => {
    apiFetch<NumberCallConfig[]>("/api/games/number-calls")
      .then((data) => {
        if (!isMountedRef.current) return;
        const configMap: Record<number, NumberCallConfig> = {};
        data.forEach((c) => {
          configMap[c.number] = c;
        });
        setCallsConfig(configMap);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadCallsConfig();
  }, [englishCallerEnabled, isGameLive]);

  useSocket((event) => {
    if (event === "number_calls_update") {
      loadCallsConfig();
    }
  });

  const activeBgUrlRef = useRef<string>("");

  // Smoothly update gameplay background music volume in realtime
  useEffect(() => {
    if (bgMusicRef.current) {
      const bgVol = parseFloat(platformConfig?.background_music_volume || "0.15");
      bgMusicRef.current.volume = bgVol;
    }
  }, [platformConfig?.background_music_volume]);

  // Handle Gameplay Background Music Playback Lifecycle
  useEffect(() => {
    const bgConfigEnabled = platformConfig?.background_music_enabled === "true";
    const bgEnabled = gameBgMusicEnabled !== undefined ? gameBgMusicEnabled : bgConfigEnabled;
    const bgUrl = platformConfig?.background_music_url;
    const bgVol = parseFloat(platformConfig?.background_music_volume || "0.15");

    if (isGameLive && bgEnabled && bgUrl && !isMuted) {
      const resolvedBgUrl = resolveAudioUrl(bgUrl);
      if (!bgMusicRef.current || activeBgUrlRef.current !== resolvedBgUrl) {
        if (bgMusicRef.current) {
          try { bgMusicRef.current.pause(); } catch {}
        }
        activeBgUrlRef.current = resolvedBgUrl;
        const audio = new Audio(resolvedBgUrl);
        if (!resolvedBgUrl.startsWith("data:")) {
          audio.crossOrigin = "anonymous";
        }
        audio.loop = true;
        audio.volume = bgVol;
        audio.muted = false;
        bgMusicRef.current = audio;
        audio.play().catch(() => {});
      } else {
        bgMusicRef.current.volume = bgVol;
        bgMusicRef.current.muted = false;
        if (bgMusicRef.current.paused) {
          bgMusicRef.current.play().catch(() => {});
        }
      }
    } else {
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
          bgMusicRef.current.src = "";
        } catch {}
        bgMusicRef.current = null;
        activeBgUrlRef.current = "";
      }
    }

    return () => {
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
          bgMusicRef.current.src = "";
        } catch {}
        bgMusicRef.current = null;
        activeBgUrlRef.current = "";
      }
    };
  }, [isGameLive, platformConfig?.background_music_enabled, platformConfig?.background_music_url, isMuted, gameBgMusicEnabled]);

  // Handle dynamic muting/unmuting of active audio tracks
  useEffect(() => {
    if (isMuted) {
      activeAudiosRef.current.forEach((audio) => {
        try {
          audio.pause();
        } catch {}
      });
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = true;
      }
    } else {
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = false;
      }
      activeAudiosRef.current.forEach((audio) => {
        try {
          audio.muted = false;
        } catch {}
      });
    }
  }, [isMuted]);

  const stopAllActiveAudios = () => {
    activeAudiosRef.current.forEach((audio) => {
      try {
        audio.pause();
        audio.src = "";
      } catch {}
    });
    activeAudiosRef.current = [];
    activeTimersRef.current.forEach((t) => clearTimeout(t));
    activeTimersRef.current = [];
  };

  const playGreeting = async (): Promise<void> => {
    if (!englishCallerEnabled || isMuted) return;
    
    const introEnabled = platformConfig?.welcome_voice_enabled !== "false";
    if (!introEnabled) return;

    stopAllActiveAudios();
    isIntroPlayingRef.current = true;
    
    try {
      if (!isMountedRef.current || isMuted) return;

      const activeLang = platformConfig?.welcome_voice_lang || platformConfig?.audio_language || "en";
      const welcomeUrl = activeLang === "ne"
        ? (platformConfig?.welcome_voice_url_ne || platformConfig?.welcome_voice_url)
        : (platformConfig?.welcome_voice_url_en || platformConfig?.welcome_voice_url);

      const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
      const volMultiplier = activeLang === "ne"
        ? parseFloat(platformConfig?.welcome_voice_volume_ne || platformConfig?.welcome_voice_volume || "1.0")
        : parseFloat(platformConfig?.welcome_voice_volume_en || platformConfig?.welcome_voice_volume || "1.0");

      if (welcomeUrl) {
        await playAudioFile(welcomeUrl, masterVol * volMultiplier);
      }
    } finally {
      isIntroPlayingRef.current = false;
      if (isMountedRef.current && pendingNumbersQueueRef.current.length > 0) {
        const nextNum = pendingNumbersQueueRef.current.shift();
        if (nextNum !== undefined) {
          playNumberCall(nextNum);
        }
      }
    }
  };

  const playOutro = async (): Promise<void> => {
    if (!englishCallerEnabled || isMuted) return;
    
    const outroEnabled = platformConfig?.instruction_voice_enabled !== "false";
    if (!outroEnabled) return;

    stopAllActiveAudios();
    
    try {
      const activeLang = platformConfig?.instruction_voice_lang || platformConfig?.audio_language || "en";
      const instructionUrl = activeLang === "ne"
        ? (platformConfig?.instruction_voice_url_ne || platformConfig?.instruction_voice_url)
        : (platformConfig?.instruction_voice_url_en || platformConfig?.instruction_voice_url);

      const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
      const volMultiplier = activeLang === "ne"
        ? parseFloat(platformConfig?.instruction_voice_volume_ne || platformConfig?.instruction_voice_volume || "1.0")
        : parseFloat(platformConfig?.instruction_voice_volume_en || platformConfig?.instruction_voice_volume || "1.0");

      if (instructionUrl) {
        await playAudioFile(instructionUrl, masterVol * volMultiplier);
      }
    } catch {}
  };

  const playNumberCall = async (num: number): Promise<void> => {
    if (!englishCallerEnabled || isMuted) return;
    
    if (isIntroPlayingRef.current) {
      pendingNumbersQueueRef.current = [num];
      return;
    }

    stopAllActiveAudios();
    const config = callsConfig[num];
    const activeLang = platformConfig?.audio_language || "en";

    const audioUrl = activeLang === "ne"
      ? (config?.audio_url_ne || `/audio/calls/${num}_ne.mp3`)
      : (config?.audio_url_en || config?.audio_url || `/audio/calls/${num}_en.mp3` || `/audio/calls/${num}.mp3`);

    const vol = config?.volume !== undefined ? config.volume : 1.0;
    const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
    const effectiveVol = vol * masterVol;

    if (audioUrl) {
      await playAudioFile(audioUrl, effectiveVol);
    }
  };

  const playCelebration = () => {
    if (!englishCallerEnabled || isMuted) return;

    const audio = new Audio("/audio/calls/celebration.mp3");
    activeAudiosRef.current.push(audio);
    audio.volume = 0.85;
    audio.muted = isMuted;
    audio.play()
      .then(() => {
        if (!isMountedRef.current || isMuted) {
          audio.pause();
          audio.src = "";
        }
      })
      .catch(() => {});
  };

  const playAudioFile = (mp3Path: string, customVolume: number = 1.0): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current || isMuted) return resolve();

      if (!mp3Path) {
        return resolve();
      }

      const resolvedUrl = resolveAudioUrl(mp3Path);
      const audio = new Audio(resolvedUrl);
      if (!resolvedUrl.startsWith("data:")) {
        audio.crossOrigin = "anonymous";
      }
      activeAudiosRef.current.push(audio);
      audio.volume = Math.max(0, Math.min(1, customVolume));
      audio.muted = isMuted;

      let hasEnded = false;
      const cleanupAndResolve = () => {
        if (hasEnded) return;
        hasEnded = true;
        audio.removeEventListener("ended", cleanupAndResolve);
        audio.removeEventListener("error", cleanupAndResolve);
        const idx = activeAudiosRef.current.indexOf(audio);
        if (idx > -1) activeAudiosRef.current.splice(idx, 1);
        resolve();
      };

      audio.addEventListener("ended", cleanupAndResolve);
      audio.addEventListener("error", cleanupAndResolve);

      audio.play().catch(() => {
        cleanupAndResolve();
      });
    });
  };

  return {
    playGreeting,
    playOutro,
    playNumberCall,
    playCelebration,
    stopAllActiveAudios,
    introPlayingRef: isIntroPlayingRef
  };
}
