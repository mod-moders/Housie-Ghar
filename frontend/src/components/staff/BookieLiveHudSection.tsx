"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { getPresetClass } from "@/lib/presetHelper";
import { Icon } from "@/components/Icon";
import { Badge, Button, EmptyHint } from "@/components/ui";
import { useSocket } from "@/lib/hooks/useSocket";
import type { GameSummary } from "@/lib/types";
import { LiveBoardContent } from "@/components/LiveBoardContent";

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

function GameCard({ game, goLive }: { game: GameSummary; goLive: (id: string) => void }) {
  const isLive = game.game_status === "Live" || game.game_status === "Paused";
  const pct = Math.round((game.sold_count / game.total_tickets) * 100) || 0;
  const dateStr = formatWhen(game.scheduled_at).date + ", " + formatWhen(game.scheduled_at).time;
  const presetClass = getPresetClass(game.title) || "";

  return (
    <div 
      className={`hg-fill-card hg-card hover-glow ${presetClass}`}
      onClick={() => isLive && goLive(game.game_id)}
      style={{ cursor: isLive ? "pointer" : "default", transition: "transform 0.2s, box-shadow 0.2s" }}
    >
      <div className="hg-fill-top">
        <strong className="hg-card-title" style={{ fontSize: "16px" }}>{game.title}</strong>
        <span className={`hg-pill hg-pill-${game.game_status.toLowerCase()}`}>{game.game_status}</span>
      </div>
      <div className="hg-fill-meta" style={{ marginTop: "6px" }}>
        <span className="hg-card-when">{dateStr}</span>
      </div>
      <div className="hg-fill-bar" style={{ marginTop: "12px" }}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="hg-fill-pct" style={{ marginTop: "6px" }}>
        <span>{game.sold_count} / {game.total_tickets} tickets sold ({pct}%)</span>
      </div>
      {isLive && (
        <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }} className="no-print">
          <Button variant="cta" size="sm" iconRight="chevR">Watch Live</Button>
        </div>
      )}
    </div>
  );
}

function PastGameCard({ game }: { game: GameSummary }) {
  const [showWinners, setShowWinners] = useState(false);
  const when = formatWhen(game.completed_at || game.scheduled_at);
  const claimedPrizes = game.prize_pool.filter(p => p.claimed);
  const presetClass = getPresetClass(game.title) || "";

  return (
    <div className={`hg-fill-card hg-card ${presetClass}`} style={{ opacity: 0.9 }}>
      <div className="hg-fill-top">
        <strong className="hg-card-title" style={{ fontSize: "16px" }}>{game.title}</strong>
        <span className="hg-pill hg-pill-completed">Completed</span>
      </div>
      <div className="hg-fill-meta" style={{ marginTop: "6px" }}>
        <span className="hg-card-when">Completed: {when.date}</span>
      </div>

      {showWinners ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4.5px" }}>
            {claimedPrizes.map(p => (
              <div key={p.prize_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "4.5px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", fontSize: "9px", whiteSpace: "nowrap" }}>{p.pattern_name}:</span>
                  <span style={{ color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {p.winner_housie_name} <span style={{ color: "var(--text-mute)", fontSize: "9.5px" }}>(Tk #{p.winner_ticket_number})</span>
                  </span>
                </div>
                <strong style={{ fontFamily: "var(--font-mono)", color: "var(--brand)", whiteSpace: "nowrap", marginLeft: "8px" }}>{money(p.amount_per_winner ?? p.prize_amount)}</strong>
              </div>
            ))}
            {claimedPrizes.length === 0 && (
              <div style={{ fontSize: "11.5px", color: "var(--text-dim)", textAlign: "center", padding: "10px 0" }}>No prizes were claimed.</div>
            )}
          </div>
          <button 
            onClick={() => setShowWinners(false)}
            style={{ marginTop: "6px", background: "none", border: "none", color: "var(--text-dim)", fontSize: "11px", textDecoration: "underline", cursor: "pointer", alignSelf: "center" }}
          >
            Hide Winners
          </button>
        </div>
      ) : (
        <div style={{ marginTop: "12px" }}>
          <Button variant="ghost" size="sm" full iconRight="chevD" onClick={() => setShowWinners(true)}>View Winners</Button>
        </div>
      )}
    </div>
  );
}

export function BookieLiveHudSection() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        setGames(g);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useSocket((event) => {
    if (event === "game_list_update" || event === "ticket_status_change") {
      load();
    }
  });

  if (activeGameId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <LiveBoardContent gameId={activeGameId} isStaff={true} onBack={() => setActiveGameId(null)} />
      </div>
    );
  }

  const all = games ?? [];
  const inProgress = all.filter((g) => g.game_status === "Live" || g.game_status === "Paused");
  const scheduled = all
    .filter((g) => g.game_status === "Scheduled")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const completed = all
    .filter((g) => g.game_status === "Completed")
    .sort((a, b) => new Date(b.completed_at || b.scheduled_at).getTime() - new Date(a.completed_at || a.scheduled_at).getTime())
    .slice(0, 4);

  return (
    <div className="hg-sec" style={{ padding: "0 10px" }}>
      <div className="hg-sec-head">
        <h2 className="hg-sec-title">Live HUD & Games</h2>
        <p className="hg-sec-sub">Watch active draws and monitor upcoming schedules in real-time.</p>
      </div>

      {error && <p className="hg-sec-err">Could not load games: {error}</p>}

      {/* Live Now */}
      <section className="hg-feed" style={{ marginTop: "20px" }}>
        <div className="hg-feed-head">
          <h2 className="hg-section-title hg-section-live" style={{ fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="hg-live-dot" /> Live Now
          </h2>
          <span className="hg-feed-count">{inProgress.length} drawing</span>
        </div>
        {inProgress.length === 0 ? (
          <div style={{ padding: "30px", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "8px", textAlign: "center", color: "var(--text-mute)", fontSize: "13px" }}>
            No games are live at the moment.
          </div>
        ) : (
          <div className="hg-fill-grid" style={{ marginTop: "16px" }}>
            {inProgress.map((g) => (
              <GameCard key={g.game_id} game={g} goLive={setActiveGameId} />
            ))}
          </div>
        )}
      </section>

      {/* Scheduled Games */}
      <section className="hg-feed" style={{ marginTop: "32px" }}>
        <div className="hg-feed-head">
          <h2 className="hg-section-title" style={{ fontSize: "16px", color: "#fff" }}>Upcoming Games</h2>
          <span className="hg-feed-count">{scheduled.length} scheduled</span>
        </div>
        {scheduled.length === 0 ? (
          <EmptyHint icon="grid" title="No upcoming games scheduled" sub="Draw schedules will show here once created." />
        ) : (
          <div className="hg-fill-grid" style={{ marginTop: "16px" }}>
            {scheduled.map((g) => (
              <GameCard key={g.game_id} game={g} goLive={setActiveGameId} />
            ))}
          </div>
        )}
      </section>

      {/* Past Games */}
      {completed.length > 0 && (
        <section className="hg-feed" style={{ marginTop: "32px" }}>
          <div className="hg-feed-head">
            <h2 className="hg-section-title" style={{ fontSize: "16px", color: "#fff" }}>Completed Games</h2>
            <span className="hg-feed-count">{completed.length} recent</span>
          </div>
          <div className="hg-fill-grid" style={{ marginTop: "16px" }}>
            {completed.map((g) => (
              <PastGameCard key={g.game_id} game={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
