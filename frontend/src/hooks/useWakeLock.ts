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
        if (!wakeLockRef.current && "wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
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
