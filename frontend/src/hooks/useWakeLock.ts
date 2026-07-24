import { useEffect, useRef } from "react";

/**
 * Screen Wake Lock API Hook
 * Prevents mobile and desktop displays from dimming or sleeping during live gameplay.
 */
export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("wakeLock" in navigator)) return;

    let isMounted = true;

    const requestWakeLock = async () => {
      try {
        if (wakeLockRef.current || !("wakeLock" in navigator)) return;
        const sentinel = await navigator.wakeLock.request("screen");
        if (!isMounted) {
          // enabled/unmount raced the in-flight request — don't leak a lock nothing will clear.
          sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
        // The browser can silently release a wake lock on its own at any time — low battery,
        // OS power management, etc. — not only when the tab is hidden. Without this listener,
        // wakeLockRef keeps pointing at the dead sentinel forever, and the `if (wakeLockRef
        // .current)` guard above then blocks every future re-request the visibilitychange
        // handler below tries to make, so the screen silently starts sleeping again mid-game.
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          if (isMounted && enabled && document.visibilityState === "visible") {
            requestWakeLock();
          }
        });
      } catch {
        // Wake lock request rejected (e.g. low power mode)
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled && isMounted) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [enabled]);
}
