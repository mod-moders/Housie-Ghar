import { useEffect } from "react";

/**
 * Pauses a looping/ambient <audio> element (background or lobby music) when the tab is
 * backgrounded — switching apps (e.g. to WhatsApp) or minimizing the browser — and resumes it
 * on return, but only if it was actually playing at the moment it got hidden (not if the user
 * had already muted/paused it themselves). Nothing else here does this: the Page Visibility
 * API was never wired up for any audio in this app, so music kept playing invisibly in the
 * background after the tab lost focus.
 */
export function usePauseAudioOnHidden(audioRef: React.RefObject<HTMLAudioElement | null>) {
  useEffect(() => {
    let wasPlayingWhenHidden = false;

    const handleVisibilityChange = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (document.hidden) {
        wasPlayingWhenHidden = !audio.paused;
        if (wasPlayingWhenHidden) audio.pause();
      } else if (wasPlayingWhenHidden) {
        wasPlayingWhenHidden = false;
        audio.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [audioRef]);
}
