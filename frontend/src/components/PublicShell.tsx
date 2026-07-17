/** Phone-width stage/frame wrapper for the public site. */
"use client";

import { useRef } from "react";
import { TopNav } from "./TopNav";
import { usePullToRefresh } from "./usePullToRefresh";

export function PublicShell({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { indicatorStyle, contentStyle } = usePullToRefresh(frameRef);

  return (
    <div className="hg-stage">
      <div className="hg-frame" ref={frameRef}>
        <div className="hg-ptr-indicator" style={indicatorStyle}>↓</div>
        <div style={contentStyle}>
          {nav && <TopNav />}
          {children}
        </div>
      </div>
    </div>
  );
}
