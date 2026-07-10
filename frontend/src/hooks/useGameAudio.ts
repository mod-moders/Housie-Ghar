import { useEffect, useState } from "react";
import { englishPhrases } from "@/lib/englishPhrases";
import { apiFetch } from "@/lib/api";

interface NumberCallConfig {
  number: number;
  call_text: string;
  default_text: string;
  audio_url: string | null;
  call_mode: "Text" | "Audio";
}

export function useGameAudio(englishCallerEnabled: boolean) {
  const [callsConfig, setCallsConfig] = useState<Record<number, NumberCallConfig>>({});

  useEffect(() => {
    if (!englishCallerEnabled) return;
    apiFetch<NumberCallConfig[]>("/api/games/number-calls")
      .then((data) => {
        const configMap: Record<number, NumberCallConfig> = {};
        data.forEach((c) => {
          configMap[c.number] = c;
        });
        setCallsConfig(configMap);
      })
      .catch(() => {});
  }, [englishCallerEnabled]);

  const playGreeting = async () => {
    if (!englishCallerEnabled) return;
    await playAudioOrFallback(
      "/audio/calls/greeting.mp3",
      "Welcome to Housie Ghar. The game is starting now! Best of luck."
    );
  };

  const playNumberCall = async (num: number) => {
    if (!englishCallerEnabled) return;
    const config = callsConfig[num];
    const phrase = config?.call_text || englishPhrases[num] || `Number ${num}`;
    const mode = config?.call_mode || "Text";
    const audioUrl = config?.audio_url;

    if (mode === "Audio" && audioUrl) {
      await playAudioOrFallback(audioUrl, phrase);
    } else {
      await fallbackToTTS(phrase);
    }
  };

  const playCelebration = () => {
    // Fire and forget celebration music
    const audio = new Audio("/audio/calls/celebration.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Ignore if file doesn't exist
    });
  };

  const playAudioOrFallback = (mp3Path: string, fallbackText: string): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio(mp3Path);
      
      audio.onended = () => resolve();
      audio.onerror = () => {
        fallbackToTTS(fallbackText).then(resolve);
      };

      audio.play().catch(() => {
        fallbackToTTS(fallbackText).then(resolve);
      });
    });
  };

  const fallbackToTTS = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        return resolve();
      }

      // Small delay for natural pacing
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // English voices
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
        utterance.rate = 0.9; // Slightly slower, caller style

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        
        window.speechSynthesis.speak(utterance);
      }, 300);
    });
  };

  return { playGreeting, playNumberCall, playCelebration };
}
