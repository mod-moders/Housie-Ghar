"use client";
/** Hall of Fame — real winners aggregated from claimed prizes. */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { EmptyHint } from "@/components/ui";
import type { HallOfFameEntry } from "@/lib/types";

export default function Winners() {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);

  useEffect(() => {
    apiFetch<HallOfFameEntry[]>("/api/stats/hall-of-fame")
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const [top1, top2, top3, ...rest] = entries ?? [];
  const podium = [top2, top1, top3].filter(Boolean) as HallOfFameEntry[];

  return (
    <PublicShell>
      <div className="hg-screen">
        <div className="hg-page-head">
          <span className="hg-page-kicker"><Icon name="trophy" size={14} /> HALL OF FAME</span>
          <h1 className="hg-page-title">Our Greatest Winners</h1>
          <p className="hg-page-sub">The sharpest daubers in the hills. Ranked by total wins.</p>
        </div>

        {entries && entries.length === 0 && (
          <EmptyHint
            icon="trophy"
            title="No winners yet"
            sub="The first claimed prize lights up this board. Book a ticket and make history!"
          />
        )}

        {podium.length > 0 && (
          <div className="hg-podium">
            {podium.map((w) => {
              const rank = w === top1 ? 1 : w === top2 ? 2 : 3;
              return (
                <div key={w.housie_name} className={`hg-pod hg-pod-${rank}`}>
                  <div className="hg-pod-medal">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</div>
                  <div className="hg-pod-avatar">{w.housie_name[0]}</div>
                  <div className="hg-pod-name">{w.housie_name}</div>
                  <div className="hg-pod-town">won {money(w.total_won)}</div>
                  <div className="hg-pod-wins">{w.wins}<span> wins</span></div>
                </div>
              );
            })}
          </div>
        )}

        {rest.length > 0 && (
          <div className="hg-leaderboard">
            {rest.map((w, i) => (
              <div key={w.housie_name} className="hg-lb-row">
                <span className="hg-lb-rank">{i + 4}</span>
                <span className="hg-lb-avatar">{w.housie_name[0]}</span>
                <div className="hg-lb-info">
                  <strong>{w.housie_name}</strong>
                  <span>biggest win {money(w.biggest_win)}</span>
                </div>
                <span className="hg-lb-wins">{w.wins}<i>wins</i></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
