import { useEffect, useRef } from "react";
import { useConfigStore } from "@/lib/stores/configStore";
import { resolveAudioUrl } from "@/lib/api";

export function useLobbyAudio(active: boolean) {
  const { config } = useConfigStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackIndexRef = useRef<number>(0);

  // Handle dynamically updating the volume without restarting/skipping tracks
  useEffect(() => {
    if (audioRef.current) {
      const bgVol = parseFloat(config?.lobby_music_volume || "0.15");
      audioRef.current.volume = bgVol;
    }
  }, [config?.lobby_music_volume]);

  useEffect(() => {
    if (!active) {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
        audioRef.current = null;
      }
      return;
    }

    // Get all uploaded lobby tracks
    const tracks = [
      config?.lobby_music_url_1,
      config?.lobby_music_url_2,
      config?.lobby_music_url_3,
      config?.lobby_music_url_4,
      config?.lobby_music_url_5
    ].filter(Boolean) as string[];

    if (tracks.length === 0) {
      return;
    }

    let retryTimeout: NodeJS.Timeout | null = null;

    const playNext = () => {
      if (tracks.length === 0) return;
      
      // Select track sequentially
      const idx = trackIndexRef.current % tracks.length;
      const url = tracks[idx];
      trackIndexRef.current++;

      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
      }

      const resolvedUrl = resolveAudioUrl(url);
      const audio = new Audio(resolvedUrl);
      if (!resolvedUrl.startsWith("data:")) {
        audio.crossOrigin = "anonymous";
      }
      const bgVol = parseFloat(config?.lobby_music_volume || "0.15");
      audio.volume = bgVol;
      audioRef.current = audio;

      audio.onended = () => {
        playNext();
      };

      audio.play().catch(() => {
        // Autoplay blocked by browser. Wait 6 seconds and retry
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(playNext, 6000);
      });
    };

    playNext();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch {}
        audioRef.current = null;
      }
    };
  }, [
    active,
    config?.lobby_music_url_1,
    config?.lobby_music_url_2,
    config?.lobby_music_url_3,
    config?.lobby_music_url_4,
    config?.lobby_music_url_5
  ]);
}
