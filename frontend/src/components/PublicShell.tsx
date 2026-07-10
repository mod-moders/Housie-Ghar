/** Phone-width stage/frame wrapper for the public site. */

import { TopNav } from "./TopNav";

export function PublicShell({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <div className="hg-stage">
      <div className="hg-frame">
        {nav && <TopNav />}
        {children}
      </div>
    </div>
  );
}
