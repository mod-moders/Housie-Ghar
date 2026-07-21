"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StatsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/leaderboard");
  }, [router]);

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "var(--bg)", color: "var(--text-dim)" }}>
      <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}
