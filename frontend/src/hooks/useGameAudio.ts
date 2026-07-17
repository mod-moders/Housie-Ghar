import { useEffect, useState, useRef } from "react";
import { englishPhrases } from "@/lib/englishPhrases";
import { apiFetch } from "@/lib/api";
import { soundSynthesizer } from "@/lib/soundSynthesizer";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
  volume?: number;
}

export function useGameAudio(englishCallerEnabled: boolean) {
  const [callsConfig, setCallsConfig] = useState<Record<number, NumberCallConfig>>({});
  
  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);
  const isMountedRef = useRef<boolean>(true);

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
    await playAudioOrFallback(
      "/audio/calls/greeting.mp3",
      "Welcome to Housie Ghar. The game is starting now! Best of luck."
    );
  };

  const playNumberCall = async (num: number) => {
    if (!englishCallerEnabled) return;
    stopAllActiveAudios();
    const config = callsConfig[num];
    const phrase = config?.call_text || englishPhrases[num] || `Number ${num}`;
    const mode = config?.call_mode || "Text";
    const audioUrl = config?.audio_url;
    const vol = config?.volume !== undefined ? config.volume : 1.0;

    if (mode === "Audio" && audioUrl) {
      await playAudioOrFallback(audioUrl, phrase, vol);
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

  const playAudioOrFallback = (mp3Path: string, fallbackText: string, customVolume: number = 1.0): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current) return resolve();

      const audio = new Audio(mp3Path);
      activeAudiosRef.current.push(audio);
      audio.volume = customVolume;
      soundSynthesizer.applyLiveAnnouncementEcho(audio);
      
      audio.onended = () => {
        activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== audio);
        resolve();
      };
      audio.onerror = () => {
        activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== audio);
        if (isMountedRef.current) {
          fallbackToTTS(fallbackText).then(resolve);
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
            fallbackToTTS(fallbackText).then(resolve);
          } else {
            resolve();
          }
        });
    });
  };

  const fallbackToTTS = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current || !("speechSynthesis" in window)) {
        return resolve();
      }

      const timer = setTimeout(() => {
        activeTimersRef.current = activeTimersRef.current.filter(t => t !== timer);
        if (!isMountedRef.current) return resolve();

        const utterance = new SpeechSynthesisUtterance(text);
        
        const voices = window.speechSynthesis.getVoices();
        const preferredName = typeof window !== "undefined" ? localStorage.getItem("preferred_caller_voice") : null;
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
