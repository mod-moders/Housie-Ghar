/** Phone-width stage/frame wrapper for the public site. */
"use client";

import { TopNav } from "./TopNav";
import { usePullToRefresh } from "./usePullToRefresh";

export function PublicShell({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  const { ref, indicatorStyle, contentStyle } = usePullToRefresh();

  return (
    <div className="hg-stage">
      <div className="hg-frame" ref={ref}>
        <div className="hg-ptr-indicator" style={indicatorStyle}>↓</div>
        <div style={contentStyle}>
          {nav && <TopNav />}
          {children}
        </div>
      </div>
    </div>
  );
}
