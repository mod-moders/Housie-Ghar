"use client";
/** Live Execution Board — automated draw with reveal-tease, prizes, auto-marked tickets. */

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSSE, SSEEventData } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { Icon } from "@/components/Icon";
import { HousieTicket, TicketMatrix, gridToMatrix } from "@/components/HousieTicket";
import type { GameSummary, Prize, TicketDetail } from "@/lib/types";

interface WinOverlay {
  prize: string;
  housie_name: string;
  ticket_id: number;
  amount: number;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

let reactionSeq = 0;
function makeReaction(emoji: string): FloatingReaction {
  reactionSeq += 1;
  return { id: reactionSeq, emoji, x: 8 + Math.random() * 70 };
}

export default function LiveBoard({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const router = useRouter();

  const [game, setGame] = useState<GameSummary | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [revealed, setRevealed] = useState(true);
  const [muted, setMuted] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [winOverlay, setWinOverlay] = useState<WinOverlay | null>(null);
  const [myTickets, setMyTickets] = useState<{ number: number; matrix: TicketMatrix }[]>([]);

  const { drawnNumbers, lastDrawn, gameStatus, reset } = useGameStore();
  const booking = useBookingStore();
  const audioCtx = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    if (muted) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 660;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      /* audio unavailable */
    }
  }, [muted]);

  // Fresh store per game visit
  useEffect(() => { reset(); }, [game_id, reset]);

  // Game meta + prize board
  useEffect(() => {
    let alive = true;
    apiFetch<GameSummary>(`/api/games/${game_id}`)
      .then((g) => { if (alive) { setGame(g); setPrizes(g.prize_pool); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [game_id]);

  // My booked tickets — auto-marked
  useEffect(() => {
    if (booking.gameId !== game_id || booking.ticketIds.length === 0) return;
    let alive = true;
    Promise.all(
      booking.ticketIds.map((id) =>
        apiFetch<TicketDetail>(`/api/tickets/${id}`).catch(() => null)
      )
    ).then((details) => {
      if (!alive) return;
      setMyTickets(
        details
          .filter((d): d is TicketDetail => d != null)
          .map((d) => ({ number: d.ticket_number, matrix: gridToMatrix(d.grid_data) }))
      );
    });
    return () => { alive = false; };
  }, [game_id, booking.gameId, booking.ticketIds]);

  // SSE: reveal-tease on draw, prize updates + overlay on winner
  const onEvent = useCallback((data: SSEEventData) => {
    if (data.event === "draw") {
      setRevealed(false);
      beep();
      setTimeout(() => setRevealed(true), 1200);
    } else if (data.event === "winner") {
      const w = data as unknown as WinOverlay & { split_count: number };
      setPrizes((prev) =>
        prev.map((p) =>
          p.pattern_name === w.prize
            ? { ...p, claimed: true, winner_housie_name: w.housie_name, amount_per_winner: w.amount, split_count: w.split_count }
            : p
        )
      );
      setTimeout(() => {
        setWinOverlay(w);
        setTimeout(() => setWinOverlay(null), 4000);
      }, 1400);
    }
  }, [beep]);

  useSSE(game_id, onEvent);

  const react = (emoji: string) => {
    const next = makeReaction(emoji);
    setReactions((r) => [...r, next]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.id !== next.id)), 2600);
  };

  const drawn = new Set(drawnNumbers);
  const count = drawnNumbers.length;
  const recent = drawnNumbers.slice(Math.max(0, count - 6)).reverse();

  return (
    <div className="hg-stage">
      <div className="hg-frame">
        <div className="hg-screen hg-live">
          <div className="hg-live-top">
            <button className="hg-back" onClick={() => router.push("/")} aria-label="Back to lobby">
              <Icon name="arrowL" size={20} />
            </button>
            <div className="hg-live-title">
              {gameStatus === "Live" && (
                <span className="hg-live-badge"><span className="hg-live-dot" /> LIVE</span>
              )}
              {gameStatus === "Paused" && <span className="hg-live-badge">PAUSED</span>}
              {game?.title ?? ""}
            </div>
            <button className="hg-mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
              <Icon name={muted ? "volumeX" : "volume"} size={18} />
            </button>
          </div>

          <div className="hg-wakelock">
            <Icon name="zap" size={11} strokeWidth={2.4} /> Numbers are called automatically — just watch and cheer
          </div>

          <div className="hg-cage">
            <div className="hg-cage-ring" aria-hidden="true" />
            <div className={`hg-cage-num${revealed ? " is-revealed" : " is-teasing"}`}>
              {revealed ? (
                lastDrawn ?? "—"
              ) : (
                <span className="hg-cage-dots"><i /><i /><i /></span>
              )}
            </div>
            <div className="hg-cage-cap">
              {gameStatus === "Completed"
                ? "Game over — thanks for playing!"
                : gameStatus === "Paused"
                  ? "Draw paused…"
                  : revealed
                    ? count > 0 ? "Number called" : "Waiting for the first call…"
                    : "Caller is teasing…"}
            </div>
          </div>

          <div className="hg-recent">
            {recent.map((n, i) => (
              <span key={n} className={`hg-recent-chip${i === 0 ? " is-now" : ""}`}>{n}</span>
            ))}
            <span className="hg-recent-count">{count}/90 called</span>
          </div>

          <div className="hg-prizeboard">
            <h2 className="hg-section-title">Prizes</h2>
            <div className="hg-prizeboard-grid">
              {prizes.map((p) => (
                <div key={p.prize_id} className={`hg-prize-row${p.claimed ? " is-won" : ""}`}>
                  <div className="hg-prize-l">
                    <span className="hg-prize-name">{p.pattern_name}</span>
                    <span className="hg-prize-amt">{money(p.amount_per_winner ?? p.prize_amount)}</span>
                  </div>
                  <div className="hg-prize-r">
                    {p.claimed && p.winner_housie_name ? (
                      <>
                        <span className="hg-prize-winner">{p.winner_housie_name}</span>
                        {p.split_count > 1 && <span className="hg-prize-tk">split ×{p.split_count}</span>}
                      </>
                    ) : (
                      <span className="hg-prize-open">Open</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {myTickets.length > 0 && (
            <div className="hg-mytickets">
              <h2 className="hg-section-title">Your tickets · auto-marked</h2>
              <div className="hg-mytickets-row">
                {myTickets.map((t) => (
                  <HousieTicket key={t.number} matrix={t.matrix} drawn={drawn} label={`#${t.number}`} compact />
                ))}
              </div>
            </div>
          )}

          <div className="hg-board90">
            {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className={`hg-b90${drawn.has(n) ? " is-called" : ""}${n === lastDrawn && revealed ? " is-current" : ""}`}
              >
                {n}
              </span>
            ))}
          </div>

          <div style={{ height: 80 }} />

          <div className="hg-emoji-bar">
            {["🎉", "🔥", "👏", "😮", "🍀", "❤️"].map((e) => (
              <button key={e} className="hg-emoji-btn" onClick={() => react(e)}>{e}</button>
            ))}
          </div>

          <div className="hg-reactions" aria-hidden="true">
            {reactions.map((r) => (
              <span key={r.id} className="hg-react-float" style={{ left: `${r.x}%` }}>{r.emoji}</span>
            ))}
          </div>

          {winOverlay && (
            <div className="hg-win-overlay">
              <div className="hg-win-burst" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              <div className="hg-win-card">
                <div className="hg-win-label">{winOverlay.prize}!</div>
                <div className="hg-win-name">{winOverlay.housie_name}</div>
                <div className="hg-win-sub">{money(winOverlay.amount)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
