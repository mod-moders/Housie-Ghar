import { useEffect, useState, useRef } from "react";
import { englishPhrases } from "@/lib/englishPhrases";
import { apiFetch } from "@/lib/api";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import { useConfigStore } from "@/lib/stores/configStore";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
}

export function useGameAudio(englishCallerEnabled: boolean, isGameLive: boolean) {
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

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
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
  }, [englishCallerEnabled]);

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
        audio.play().catch(() => {
          // auto-play blocked
        });
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

  const playGreeting = async () => {
    if (!englishCallerEnabled) return;
    stopAllActiveAudios();
    
    isIntroPlayingRef.current = true;
    
    try {
      // 1. Play Welcome Voice Note (url or fallback text)
      const welcomeUrl = platformConfig?.welcome_voice_url;
      const welcomeText = platformConfig?.welcome_voice_text || "Welcome to Housie Ghar. The game is starting now! Best of luck.";
      const welcomeVoiceName = typeof window !== "undefined" ? localStorage.getItem("welcome_voice_name") : null;
      await playAudioOrFallback(
        welcomeUrl || "",
        welcomeText,
        1.0,
        welcomeVoiceName
      );
      
      if (!isMountedRef.current) return;

      // 2. Play Instruction Voice Note (url or fallback text)
      const instructionUrl = platformConfig?.instruction_voice_url;
      const instructionText = platformConfig?.instruction_voice_text || "Please check your tickets carefully. The numbers will be called out one by one. Claim your prizes instantly.";
      const instructionVoiceName = typeof window !== "undefined" ? localStorage.getItem("instruction_voice_name") : null;
      await playAudioOrFallback(
        instructionUrl || "",
        instructionText,
        1.0,
        instructionVoiceName
      );
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
        const preferredName = forcedVoiceName || (typeof window !== "undefined" ? localStorage.getItem("preferred_caller_voice") : null);
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

  return { playGreeting, playNumberCall, playCelebration };
}
