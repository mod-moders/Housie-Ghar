import { useEffect, useState, useRef } from "react";
import { englishPhrases } from "@/lib/englishPhrases";
import { apiFetch } from "@/lib/api";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { useConfigStore } from "@/lib/stores/configStore";
import { useSocket } from "@/lib/hooks/useSocket";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
}

export function useGameAudio(englishCallerEnabled: boolean, isGameLive: boolean, muted: boolean = false) {
  const [callsConfig, setCallsConfig] = useState<Record<number, NumberCallConfig>>({});
  const { config: platformConfig } = useConfigStore();

  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);
  const isMountedRef = useRef<boolean>(true);

  const isIntroPlayingRef = useRef<boolean>(false);
  const pendingNumbersQueueRef = useRef<number[]>([]);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef<boolean>(muted);

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

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, []);

  const loadCallsConfig = () => {
    if (!englishCallerEnabled) return;
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
  }, [englishCallerEnabled]);

  useSocket((event) => {
    if (event === "number_calls_update") {
      loadCallsConfig();
    }
  });

  // Handle Gameplay Background Music Playback
  useEffect(() => {
    const bgEnabled = platformConfig?.background_music_enabled === "true";
    const bgUrl = platformConfig?.background_music_url;
    const bgVol = parseFloat(platformConfig?.background_music_volume || "0.15");

    if (isGameLive && bgEnabled && bgUrl) {
      if (!bgMusicRef.current || bgMusicRef.current.src !== bgUrl) {
        if (bgMusicRef.current) {
          try { bgMusicRef.current.pause(); } catch {}
        }
        const audio = new Audio(bgUrl);
        audio.loop = true;
        audio.volume = bgVol;
        bgMusicRef.current = audio;
        if (!mutedRef.current) {
          audio.play().catch(() => {
            // auto-play blocked
          });
        }
      } else {
        bgMusicRef.current.volume = bgVol;
      }
    } else {
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
          bgMusicRef.current.src = "";
        } catch {}
        bgMusicRef.current = null;
      }
    }

    return () => {
      if (bgMusicRef.current) {
        try {
          bgMusicRef.current.pause();
          bgMusicRef.current.src = "";
        } catch {}
        bgMusicRef.current = null;
      }
    };
  }, [isGameLive, platformConfig?.background_music_enabled, platformConfig?.background_music_url, platformConfig?.background_music_volume]);

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

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  };

  // Master mute: immediately silence anything already in flight (a caller
  // phrase/TTS mid-utterance) and pause/resume the background-music loop in
  // place (no restart-from-zero). playGreeting/playOutro/playNumberCall/
  // playCelebration already refuse to START new audio while muted via
  // englishCallerEnabled, but that alone doesn't stop something already
  // playing, and never touched background music at all.
  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      stopAllActiveAudios();
      bgMusicRef.current?.pause();
    } else {
      bgMusicRef.current?.play().catch(() => {});
    }
  }, [muted]);

  const playGreeting = async () => {
    if (!englishCallerEnabled) return;
    stopAllActiveAudios();
    
    isIntroPlayingRef.current = true;
    
    try {
      // 2-3 seconds delay after start/bg music starts before playing Intro Note
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2500);
        activeTimersRef.current.push(timer);
      });
      if (!isMountedRef.current) return;

      const mode = platformConfig?.welcome_voice_mode || "Text";
      const welcomeUrl = platformConfig?.welcome_voice_url;
      const welcomeText = platformConfig?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.";
      const universalVoice = platformConfig?.tts_voice_name || null;
      const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
      const volMultiplier = platformConfig?.welcome_voice_volume !== undefined ? parseFloat(platformConfig.welcome_voice_volume) : 1.0;

      if (mode === "Audio" && welcomeUrl) {
        await playAudioOrFallback(welcomeUrl, welcomeText, masterVol * volMultiplier, universalVoice);
      } else {
        await fallbackToTTS(welcomeText, universalVoice);
      }
    } finally {
      isIntroPlayingRef.current = false;
      // Play any pending number call that arrived during the intro
      if (isMountedRef.current && pendingNumbersQueueRef.current.length > 0) {
        const nextNum = pendingNumbersQueueRef.current.shift();
        if (nextNum !== undefined) {
          playNumberCall(nextNum);
        }
      }
    }
  };

  const playOutro = async () => {
    if (!englishCallerEnabled) return;
    stopAllActiveAudios();
    
    try {
      const mode = platformConfig?.instruction_voice_mode || "Text";
      const instructionUrl = platformConfig?.instruction_voice_url;
      const instructionText = platformConfig?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.";
      const universalVoice = platformConfig?.tts_voice_name || null;
      const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
      const volMultiplier = platformConfig?.instruction_voice_volume !== undefined ? parseFloat(platformConfig.instruction_voice_volume) : 1.0;

      if (mode === "Audio" && instructionUrl) {
        await playAudioOrFallback(instructionUrl, instructionText, masterVol * volMultiplier, universalVoice);
      } else {
        await fallbackToTTS(instructionText, universalVoice);
      }
    } catch {}
  };

  const playNumberCall = async (num: number) => {
    if (!englishCallerEnabled) return;
    
    if (isIntroPlayingRef.current) {
      // Buffer latest number call to play once intro ends
      pendingNumbersQueueRef.current = [num];
      return;
    }

    stopAllActiveAudios();
    const config = callsConfig[num];
    const phrase = config?.call_text || englishPhrases[num] || `Number ${num}`;
    const mode = config?.call_mode || "Text";
    const audioUrl = config?.audio_url;
    const vol = config?.volume !== undefined ? config.volume : 1.0;

    const masterVol = platformConfig?.master_calls_volume !== undefined ? parseFloat(platformConfig.master_calls_volume) : 1.0;
    const effectiveVol = vol * masterVol;

    if (mode === "Audio" && audioUrl) {
      await playAudioOrFallback(audioUrl, phrase, effectiveVol);
    } else {
      await fallbackToTTS(phrase);
    }
  };

  const playCelebration = () => {
    if (!englishCallerEnabled) return;
    stopAllActiveAudios();
    const audio = new Audio("/audio/calls/celebration.mp3");
    activeAudiosRef.current.push(audio);
    audio.volume = 0.85;
    audio.play()
      .then(() => {
        if (!isMountedRef.current) {
          audio.pause();
          audio.src = "";
        }
      })
      .catch(() => {
        // Ignore if file doesn't exist
      });
  };

  const playAudioOrFallback = (mp3Path: string, fallbackText: string, customVolume: number = 1.0, forcedVoiceName: string | null = null): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current) return resolve();

      if (!mp3Path) {
        fallbackToTTS(fallbackText, forcedVoiceName).then(resolve);
        return;
      }

      const audio = new Audio(mp3Path);
      activeAudiosRef.current.push(audio);
      audio.volume = 1.0;
      soundSynthesizer.applyLiveAnnouncementEcho(audio, customVolume);
      
      audio.onended = () => {
        activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== audio);
        resolve();
      };
      audio.onerror = () => {
        activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== audio);
        if (isMountedRef.current) {
          fallbackToTTS(fallbackText, forcedVoiceName).then(resolve);
        } else {
          resolve();
        }
      };

      audio.play()
        .then(() => {
          if (!isMountedRef.current) {
            audio.pause();
            audio.src = "";
          }
        })
        .catch(() => {
          activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== audio);
          if (isMountedRef.current) {
            fallbackToTTS(fallbackText, forcedVoiceName).then(resolve);
          } else {
            resolve();
          }
        });
    });
  };

  const fallbackToTTS = (text: string, forcedVoiceName: string | null = null): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current || !("speechSynthesis" in window)) {
        return resolve();
      }

      const timer = setTimeout(() => {
        activeTimersRef.current = activeTimersRef.current.filter(t => t !== timer);
        if (!isMountedRef.current) return resolve();

        const utterance = new SpeechSynthesisUtterance(text);
        
        const voices = window.speechSynthesis.getVoices();
        const preferredName = forcedVoiceName || platformConfig?.tts_voice_name || (typeof window !== "undefined" ? localStorage.getItem("preferred_caller_voice") : null);
        let voice = voices.find(v => v.name === preferredName);
        if (!voice) {
          voice = voices.find(v => v.lang.includes("en-GB") || v.lang.includes("en-US"));
        }
        if (voice) {
          utterance.voice = voice;
        }

        utterance.pitch = 1.0; 
        utterance.rate = 0.9;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        
        window.speechSynthesis.speak(utterance);
      }, 300);

      activeTimersRef.current.push(timer);
    });
  };

  return { playGreeting, playOutro, playNumberCall, playCelebration, introPlayingRef: isIntroPlayingRef };
}
