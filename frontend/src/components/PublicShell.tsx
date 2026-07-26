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
        {/* position:relative so the backdrop layers below can size themselves to the FULL
            scrollable page — this wrapper is the one element whose height is the whole
            page's height. .hg-frame-content additionally stretches it to fill the frame
            when the content is shorter than the viewport; see globals.css. */}
        <div className="hg-frame-content" style={{ ...contentStyle, position: "relative" }}>
          {nav && <TopNav />}
          {children}
        </div>
      </div>
    </div>
  );
}
