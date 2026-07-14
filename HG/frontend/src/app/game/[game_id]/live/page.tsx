"use client";
/** Live Execution Board — automated draw with reveal-tease, prizes, auto-marked tickets. */

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { callerPhrase } from "@/lib/caller";
import { useSSE, SSEEventData } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { usePlayerStore } from "@/lib/stores/playerStore";
import { Icon } from "@/components/Icon";
import { AccountButton } from "@/components/AccountButton";
import { HousieTicket, TicketMatrix, gridToMatrix } from "@/components/HousieTicket";
import type { GameSummary, MyTicketsResponse, MyWinsResponse, NumberCallConfig, Prize, PublicConfigResponse, TicketDetail } from "@/lib/types";

// Prefix for backend-served caller MP3s; same-origin in dev via the /audio rewrite.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface WinOverlay {
  prize: string;
  housie_name: string;
  ticket_id: number;
  amount: number;
}

/** One row in the "You won" card — from the server for logged-in players,
 *  or assembled from the winner event + local booking for anonymous play. */
interface WinRow {
  key: string;
  prize: string;
  amount: number;
  ticketNumber: number;
  agentName: string | null;
  waLink: string | null;
}

function clientWaLink(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/[^0-9+]/g, "")}?text=${encodeURIComponent(message)}`;
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
  const [myTickets, setMyTickets] = useState<{ id: number; number: number; matrix: TicketMatrix }[]>([]);
  const [serverWins, setServerWins] = useState<WinRow[]>([]);
  const [eventWins, setEventWins] = useState<WinRow[]>([]);

  const { drawnNumbers, lastDrawn, gameStatus, reset } = useGameStore();
  const booking = useBookingStore();
  const player = usePlayerStore((s) => s.player);
  const audioCtx = useRef<AudioContext | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const callsRef = useRef<Map<number, NumberCallConfig>>(new Map());
  const callerEnabledRef = useRef(true);
  const callAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Pick the voice for the spoken caller: the admin's saved preference from
  // Call Voice Settings first, then the best available English voice (prefer
  // Indian-English, then other variants). Voices load async in most browsers,
  // so refresh on `voiceschanged`. Cancel speech on unmount so callouts don't
  // bleed into the next screen.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const pickVoice = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) return;
      const preferred = localStorage.getItem("preferred_caller_voice");
      const byName = preferred ? voices.find((v) => v.name === preferred) : undefined;
      const byLang = (p: string) => voices.find((v) => v.lang?.toLowerCase().startsWith(p));
      voiceRef.current =
        byName || byLang("en-in") || byLang("en-gb") || byLang("en-au") ||
        byLang("en-us") || byLang("en") || voices[0] || null;
    };
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);
    return () => {
      synth.removeEventListener("voiceschanged", pickVoice);
      synth.cancel();
    };
  }, []);

  // Caller configuration: per-number phrases / MP3s (Number_Calls) and the
  // global English-caller switch. Both are one-shot best-effort — any failure
  // leaves the built-in callerPhrase() fallback in charge.
  useEffect(() => {
    let alive = true;
    apiFetch<NumberCallConfig[]>("/api/games/number-calls")
      .then((calls) => {
        if (!alive) return;
        callsRef.current = new Map(calls.map((c) => [c.number, c]));
      })
      .catch(() => {});
    apiFetch<PublicConfigResponse>("/api/config/public")
      .then((c) => { if (alive) callerEnabledRef.current = c.english_caller_enabled !== "false"; })
      .catch(() => {});
    return () => {
      alive = false;
      callAudioRef.current?.pause();
      callAudioRef.current = null;
    };
  }, []);

  // Announce a drawn number aloud, traditional-caller style ("two and one,
  // twenty one"). Uses the admin-configured phrase or MP3 from Number_Calls
  // when present (falling back to the built-in callerPhrase), and stays silent
  // when the Superadmin has switched the English caller off. Cancels any
  // in-flight callout so the latest number always wins, even at fast speeds.
  const speak = useCallback((n: number) => {
    if (muted || !callerEnabledRef.current) return;
    if (typeof window === "undefined") return;
    callAudioRef.current?.pause();
    callAudioRef.current = null;
    window.speechSynthesis?.cancel();
    const cfg = callsRef.current.get(n);
    if (cfg?.call_mode === "Audio" && cfg.audio_url) {
      try {
        const audio = new Audio(`${API_BASE}${cfg.audio_url}`);
        callAudioRef.current = audio;
        void audio.play().catch(() => speakText(n, cfg.call_text));
        return;
      } catch {
        /* fall through to TTS */
      }
    }
    speakText(n, cfg?.call_text);

    function speakText(num: number, text?: string) {
      if (!window.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(text?.trim() || callerPhrase(num));
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 0.95;
        u.pitch = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch {
        /* speech unavailable */
      }
    }
  }, [muted]);

  // Muting also silences an in-progress callout.
  useEffect(() => {
    if (muted && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      callAudioRef.current?.pause();
      callAudioRef.current = null;
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

  // My booked tickets — auto-marked. Prefer the account-linked source (works
  // across devices and after the lock is cleared); fall back to an in-flight
  // booking held in this browser for anonymous play.
  useEffect(() => {
    let alive = true;
    const setIfAlive = (rows: { id: number; number: number; matrix: TicketMatrix }[]) => {
      if (alive) setMyTickets(rows);
    };
    async function load() {
      if (player) {
        try {
          const res = await apiFetch<MyTicketsResponse>(`/api/players/me/tickets?game_id=${game_id}`);
          if (res.tickets.length > 0) {
            setIfAlive(res.tickets.map((t) => ({ id: t.ticket_id, number: t.ticket_number, matrix: gridToMatrix(t.grid_data) })));
            return;
          }
        } catch {
          /* fall through to the local booking */
        }
      }
      if (booking.gameId === game_id && booking.ticketIds.length > 0) {
        const details = await Promise.all(
          booking.ticketIds.map((id) => apiFetch<TicketDetail>(`/api/tickets/${id}`).catch(() => null))
        );
        setIfAlive(
          details
            .filter((d): d is TicketDetail => d != null)
            .map((d) => ({ id: d.ticket_id, number: d.ticket_number, matrix: gridToMatrix(d.grid_data) }))
        );
        return;
      }
      setIfAlive([]);
    }
    load();
    return () => { alive = false; };
  }, [game_id, player, booking.gameId, booking.ticketIds]);

  // My wins with a "collect from your bookie" WhatsApp link. Server-truth for
  // logged-in players (their bookings carry player_id); anonymous winners are
  // assembled locally from the winner event + the booking held in this browser.
  const loadWins = useCallback(() => {
    if (!usePlayerStore.getState().player) return;
    apiFetch<MyWinsResponse>(`/api/players/me/wins?game_id=${game_id}`)
      .then((res) =>
        setServerWins(
          res.wins.map((w) => ({
            key: `${w.pattern_name}:${w.ticket_number}`,
            prize: w.pattern_name,
            amount: w.amount,
            ticketNumber: w.ticket_number,
            agentName: w.agent_name,
            waLink: w.whatsapp_link,
          }))
        )
      )
      .catch(() => {});
  }, [game_id]);

  useEffect(() => { loadWins(); }, [loadWins, player]);

  // SSE: reveal-tease on draw, prize updates + overlay on winner
  const onEvent = useCallback((data: SSEEventData) => {
    if (data.event === "draw") {
      setRevealed(false);
      beep();
      setTimeout(() => {
        setRevealed(true);
        speak(data.draw_number as number);
      }, 1200);
    } else if (data.event === "winner") {
      const w = data as unknown as WinOverlay & { split_count: number };
      setPrizes((prev) =>
        prev.map((p) =>
          p.pattern_name === w.prize
            ? { ...p, claimed: true, winner_housie_name: w.housie_name, amount_per_winner: w.amount, split_count: w.split_count }
            : p
        )
      );
      const mine = myTickets.find((t) => t.id === w.ticket_id);
      if (mine) {
        if (usePlayerStore.getState().player) {
          loadWins(); // settlement row commits before the event publishes
        } else {
          const b = useBookingStore.getState();
          const canWa = b.gameId === game_id && b.agentPhone;
          const row: WinRow = {
            key: `${w.prize}:${mine.number}`,
            prize: w.prize,
            amount: w.amount,
            ticketNumber: mine.number,
            agentName: b.agentName || null,
            waLink: canWa
              ? clientWaLink(
                  b.agentPhone,
                  `Hi ${b.agentName}, this is ${w.housie_name}! My ticket #${mine.number} won ${w.prize} (₹${w.amount}). Collecting my prize — how do I get paid?`
                )
              : null,
          };
          setEventWins((prev) => (prev.some((e) => e.key === row.key) ? prev : [...prev, row]));
        }
      }
      setTimeout(() => {
        setWinOverlay(w);
        setTimeout(() => setWinOverlay(null), 4000);
      }, 1400);
    }
  }, [beep, speak, myTickets, game_id, loadWins]);

  useSSE(game_id, onEvent);

  const react = (emoji: string) => {
    const next = makeReaction(emoji);
    setReactions((r) => [...r, next]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.id !== next.id)), 2600);
  };

  const drawn = new Set(drawnNumbers);
  const count = drawnNumbers.length;
  const recent = drawnNumbers.slice(Math.max(0, count - 6)).reverse();
  const myWins: WinRow[] = [
    ...serverWins,
    ...eventWins.filter((e) => !serverWins.some((s) => s.key === e.key)),
  ];
  const overlayIsMine = !!winOverlay && myTickets.some((t) => t.id === winOverlay.ticket_id);

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
            <AccountButton compact />
          </div>

          <div className="hg-wakelock">
            <Icon name="zap" size={11} strokeWidth={2.4} /> Numbers are called automatically — just watch and cheer
          </div>

          <div className="hg-live-body">
          <div className="hg-live-left">
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

          {myWins.length > 0 && (
            <div className="hg-wins">
              <h2 className="hg-section-title">You won! 🎉</h2>
              <div className="hg-wins-list">
                {myWins.map((w) => (
                  <div key={w.key} className="hg-wins-row">
                    <div className="hg-wins-info">
                      <b>{w.prize}</b>
                      <span>Ticket #{w.ticketNumber}</span>
                    </div>
                    <span className="hg-wins-amt">{money(w.amount)}</span>
                    {w.waLink && (
                      <a className="hg-wins-collect" href={w.waLink} target="_blank" rel="noopener noreferrer">
                        <Icon name="chat" size={14} /> Collect
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="hg-wins-note">
                {myWins[0].agentName
                  ? `Your bookie ${myWins[0].agentName} pays winnings in cash — message them on WhatsApp to collect.`
                  : "Your bookie pays winnings in cash — message them on WhatsApp to collect."}
              </p>
            </div>
          )}
          </div>

          <div className="hg-live-right">
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
          </div>
          </div>

          <div className="hg-live-spacer" style={{ height: 80 }} />

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
                {overlayIsMine && <div className="hg-win-mine">That&apos;s your ticket — collect from your bookie below 🎊</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
