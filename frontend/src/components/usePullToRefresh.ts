import { useEffect, useState, type RefObject } from "react";

const THRESHOLD = 70;
const MAX_PULL = 120;
const RESISTANCE = 0.5;

/**
 * `.hg-frame` (not html/body) is the real scroll container in this app's phone-frame layout, so
 * neither Chrome's nor (nonexistent on) Safari's native pull-to-refresh can ever fire on it — this
 * reimplements the gesture by hand, scoped to the frame, so it works the same on iOS and Android.
 */
export function usePullToRefresh(frameRef: RefObject<HTMLDivElement | null>) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) return;
      tracking = true;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || refreshing) return;
      if (el.scrollTop > 0) {
        tracking = false;
        setDistance(0);
        return;
      }
      const deltaY = e.touches[0].clientY - startY;
      if (deltaY <= 0) {
        setDistance(0);
        return;
      }
      e.preventDefault();
      setDragging(true);
      setDistance(Math.min(deltaY * RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      setDragging(false);
      setDistance((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          window.location.reload();
          return current;
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [frameRef, refreshing]);

  const pulledEnough = distance >= THRESHOLD;

  return {
    indicatorStyle: {
      opacity: distance > 4 ? Math.min(distance / THRESHOLD, 1) : 0,
      transform: `translate(-50%, ${Math.max(distance - 32, -32)}px) rotate(${refreshing ? 0 : pulledEnough ? 180 : 0}deg)`,
      transition: dragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
      animation: refreshing ? "hg-ptr-spin 0.7s linear infinite" : undefined,
    } as React.CSSProperties,
    contentStyle: {
      transform: distance > 0 ? `translateY(${distance}px)` : undefined,
      transition: dragging ? "none" : "transform 0.2s ease",
    } as React.CSSProperties,
  };
}
