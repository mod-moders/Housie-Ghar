"use client";
/** Operator sections: live HUD with draw controls + overflow failsafe queue. */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSSE, type SSEEventData } from "@/lib/hooks/useSSE";
import { useSocket } from "@/lib/hooks/useSocket";
import { useGameStore } from "@/lib/stores/gameStore";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";
import { downloadPoster, type PosterKind } from "@/lib/sharePoster";
import type { GameSummary, QueueBooking, Prize, TicketDetail } from "@/lib/types";
import { type AuthUser } from "@/lib/stores/authStore";
import { getPresetClass } from "@/lib/presetHelper";
import { HousieTicket, gridToMatrix, type TicketMatrix } from "@/components/HousieTicket";
import { useConfigStore } from "@/lib/stores/configStore";
import { useGameAudio } from "@/hooks/useGameAudio";
import dynamic from "next/dynamic";

const RealisticBingoCage = dynamic(
  () => import("@/components/RealisticBingoCage").then((mod) => mod.RealisticBingoCage),
  { ssr: false }
);

interface WhatsAppShareGroup {
  name: string;
  url: string;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}

export function OperatorHudSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { drawnNumbers, lastDrawn, gameStatus, reset, addDrawn } = useGameStore();
  const [revealed, setRevealed] = useState(true);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedTickets, setSearchedTickets] = useState<{ number: number; matrix: TicketMatrix; owner?: string | null }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllCalled, setShowAllCalled] = useState(false);

  const [muted, setMuted] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);

  const { config } = useConfigStore();
  const game = games.find((g) => g.game_id === selectedId) ?? null;
  const activeGameStatus = game?.game_status || gameStatus;
  const isGameRunning = activeGameStatus === "Live" || activeGameStatus === "Paused" || activeGameStatus === "Draw_Ended";

  const { playGreeting, playOutro, playNumberCall, playCelebration, introPlayingRef } = useGameAudio(
    config?.english_caller_enabled === "true",
    isGameRunning,
    muted
  );

  const pendingDrawsRef = useRef<number[]>([]);


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
      g.gain.exponentialRampToValueAtTime(0.38, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      /* audio unavailable */
    }
  }, [muted]);

  const flushPendingDraws = useCallback(() => {
    const queued = pendingDrawsRef.current.splice(0);
    queued.forEach((num, i) => {
      const offset = i * 2500;
      setTimeout(() => setRevealed(false), offset);
      setTimeout(() => {
        beep();
        addDrawn(num);
        setRevealed(true);
        playNumberCall(num);
      }, offset + 2000);
    });
  }, [beep, addDrawn, playNumberCall]);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        const open = g.filter((x) => x.game_status !== "Completed");
        setGames(open);
      })
      .catch(() => {});
  }, []);

  const onEvent = useCallback((data: SSEEventData) => {
    if (data.event === "draw") {
      const num = data.draw_number as number;

      if (introPlayingRef.current) {
        pendingDrawsRef.current.push(num);
        return;
      }

      setRevealed(false);
      setTimeout(() => {
        beep();
        addDrawn(num);
        setRevealed(true);
        playNumberCall(num);
      }, 2000);
    } else if (data.event === "winner") {
      const w = data as unknown as { prize: string; housie_name: string; winner_ticket_number: number; amount: number; split_count: number };
      setPrizes((prev) =>
        prev.map((p) =>
          p.pattern_name === w.prize
            ? { ...p, claimed: true, winner_housie_name: w.housie_name, winner_ticket_number: w.winner_ticket_number, amount_per_winner: w.amount, split_count: w.split_count }
            : p
        )
      );
      playCelebration();
    }
  }, [beep, playNumberCall, playCelebration, addDrawn]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    reset();
    // Reset the ticket-search UI whenever the selected game changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchedTickets([]);
    setSearchQuery("");
  }, [selectedId, reset]);

  useSSE(selectedId, onEvent);

  useEffect(() => {
    if (!selectedId) return;
    apiFetch<GameSummary>(`/api/games/${selectedId}`)
      .then((g) => {
        setPrizes(g.prize_pool || []);
      })
      .catch(() => {});
  }, [selectedId]);

  const gameStartedAnnouncedRef = useRef<boolean>(false);
  const outroPlayedRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeGameStatus === "Live" && !gameStartedAnnouncedRef.current) {
      gameStartedAnnouncedRef.current = true;
      playGreeting().then(flushPendingDraws);
    }
    if ((activeGameStatus === "Completed" || activeGameStatus === "Draw_Ended") && !outroPlayedRef.current) {
      outroPlayedRef.current = true;
      playOutro();
    }
    if (activeGameStatus !== "Live") {
      gameStartedAnnouncedRef.current = false;
    }
    if (activeGameStatus !== "Completed" && activeGameStatus !== "Draw_Ended") {
      outroPlayedRef.current = false;
    }
  }, [activeGameStatus, playGreeting, playOutro, flushPendingDraws]);

  const act = async (action: "start" | "pause" | "resume" | "stop") => {
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/games/${selectedId}/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const applySpeed = async (s: number) => {
    setSpeed(s);
    if (!selectedId) return;
    try {
      await apiFetch(`/api/games/${selectedId}/speed`, {
        method: "POST",
        body: JSON.stringify({ interval_ms: s * 1000 }),
      });
    } catch {
      /* slider stays; next change retries */
    }
  };

  const handleSearch = () => {
    if (!selectedId || !searchQuery.trim()) return;
    setIsSearching(true);
    apiFetch<TicketDetail[]>(`/api/games/${selectedId}/search-tickets?query=${encodeURIComponent(searchQuery)}`)
      .then((tickets) => {
        const mapped = tickets.map((t) => ({
          number: t.ticket_number,
          matrix: gridToMatrix(t.grid_data),
          owner: t.owner_housie_name,
        }));
        setSearchedTickets((prev) => {
          const existing = new Set(prev.map((x) => x.number));
          const unique = mapped.filter((x) => !existing.has(x.number));
          return [...prev, ...unique];
        });
        setSearchQuery("");
      })
      .catch((err) => {
        console.error("Search failed:", err);
      })
      .finally(() => {
        setIsSearching(false);
      });
  };

  if (!selectedId) {
    return (
      <div className="hg-sec">
        <p className="hg-sec-sub">Select an active or scheduled game to launch the LIVE HUD gameplay control deck.</p>
        {games.length === 0 ? (
          <EmptyHint icon="play" title="No games to run" sub="Once a game is scheduled, its live controls appear here." />
        ) : (
          <div className="hg-fill-grid" style={{ marginTop: "16px" }}>
            {games.map((g) => {
              const pct = Math.round((g.sold_count / g.total_tickets) * 100) || 0;
              const dateStr = fmtDateTime(g.scheduled_at);
              const presetClass = getPresetClass(g.title) || "";
              return (
                <div 
                  key={g.game_id} 
                  className={`hg-fill-card hg-card hover-glow ${presetClass}`}
                  onClick={() => setSelectedId(g.game_id)}
                  style={{ cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s" }}
                >
                  <div className="hg-fill-top">
                    <strong className="hg-card-title" style={{ fontSize: "16px" }}>{g.title}</strong>
                    <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status.replace("_", " ")}</span>
                  </div>
                  <div className="hg-fill-meta" style={{ marginTop: "6px" }}>
                    <span className="hg-card-when">{dateStr}</span>
                  </div>
                  <div className="hg-fill-bar" style={{ marginTop: "12px" }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="hg-fill-pct" style={{ marginTop: "6px" }}>
                    <span>{g.sold_count} / {g.total_tickets} tickets sold ({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!game) return null;

  const status = gameStatus === "Scheduled" ? game.game_status : gameStatus;
  const drawn = new Set(drawnNumbers);
  const count = drawnNumbers.length;
  const recent = drawnNumbers.slice(Math.max(0, count - 9)).reverse();

  return (
    <div className="hg-sec">
      {/* Operator controls header card */}
      <div className="hg-panel" style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", border: "1px solid var(--accent)", background: "rgba(212, 175, 55, 0.05)", borderRadius: "var(--radius)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button className="hg-ic-btn" title="Back to game list" onClick={() => setSelectedId(null)}>
            <Icon name="arrowL" size={16} />
          </button>
          
          <button 
            className="hover:scale-105 active:scale-95" 
            style={{
              borderRadius: "50%",
              border: "1.5px solid var(--accent)",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              color: "var(--accent)",
              cursor: "pointer",
              transition: "transform 0.15s"
            }}
            onClick={() => setMuted(!muted)}
            title={muted ? "Unmute" : "Mute"}
          >
            <Icon name={muted ? "volumeX" : "volume"} size={14} />
          </button>

          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>{game.title} LIVE Deck</h3>
            <span className="hg-dim" style={{ fontSize: "12px" }}>Operator Console</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Controls buttons */}
          {status === "Scheduled" && (
            <Button variant="cta" size="sm" icon="play" disabled={busy} onClick={() => act("start")}>
              Start Draw
            </Button>
          )}
          {status === "Live" && (
            <Button variant="ghost" size="sm" icon="pause" disabled={busy} style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => act("pause")}>
              Pause Draw
            </Button>
          )}
          {status === "Paused" && (
            <Button variant="cta" size="sm" icon="play" disabled={busy} onClick={() => act("resume")}>
              Resume Draw
            </Button>
          )}
          {(status === "Live" || status === "Paused") && (
            <Button variant="ghost" size="sm" icon="trash" disabled={busy} style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => act("stop")}>
              Stop Draw
            </Button>
          )}
        </div>

        {/* Speed settings slider */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "240px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
            <span>Call Speed</span>
            <span>{speed}s interval</span>
          </div>
          <input
            type="range" min={5} max={12} value={speed}
            onChange={(e) => applySpeed(+e.target.value)}
            disabled={status !== "Live"}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </div>
      </div>

      <div className="hg-live-body" style={{ marginTop: "12px" }}>
        <div className="hg-live-left">
          {/* Cage + status */}
          <div className="hg-cage-area">
            <RealisticBingoCage lastDrawn={lastDrawn ?? null} isTeasing={!revealed} />
            
            <div style={{ textAlign: "center", marginTop: "6px", fontSize: "13px", fontWeight: 600, color: !revealed ? "var(--text-dim)" : "var(--cyan)", letterSpacing: "0.5px" }}>
              {status === "Completed" || status === "Draw_Ended"
                ? "Game has ended"
                : status === "Paused"
                  ? "Draw paused…"
                  : !revealed
                    ? "Spinning…"
                    : count > 0 ? `Number ${lastDrawn} called` : "Waiting for the first call…"}
            </div>
          </div>

          {/* Recent numbers called panel */}
          <div className="hg-numbers-area" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--accent)" }}>
                {showAllCalled ? "Calling Sequence (Newest First)" : "Recent Calls"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                  {count}/90 called
                </span>
                {count > 9 && (
                  <button 
                    onClick={() => setShowAllCalled(!showAllCalled)}
                    style={{ background: "transparent", border: "none", color: "var(--cyan)", fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "4px", transition: "background 0.2s" }}
                    className="hover-bg"
                  >
                    {showAllCalled ? "Show Less" : "Show All"}
                    <Icon name={showAllCalled ? "chevU" : "chevD"} size={12} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: showAllCalled ? "wrap" : "nowrap", gap: "6px", justifyContent: "flex-start", alignItems: "center" }}>
              {(showAllCalled ? [...drawnNumbers].reverse() : recent).map((n, i) => {
                const isCurrent = i === 0 && !showAllCalled;
                return (
                  <span 
                    key={n} 
                    className={`hg-recent-chip${isCurrent ? " is-now" : ""}`}
                    style={{ 
                      width: isCurrent ? "32px" : "29px", 
                      height: isCurrent ? "32px" : "29px", 
                      fontSize: isCurrent ? "13px" : "11.5px", 
                      borderRadius: isCurrent ? "10px" : "9px",
                      transition: "all 0.2s ease",
                      flexShrink: 0
                    }}
                  >
                    {n}
                  </span>
                );
              })}
            </div>
          </div>

          {/* 90 number box */}
          <div className="hg-numbers-area" style={{ marginTop: "12px" }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className="hg-prize-winner">
                          {p.winner_housie_name}
                          {p.winner_ticket_number && !p.winner_housie_name.includes('(') && (
                            <span style={{ opacity: 0.8, fontSize: '0.85em', marginLeft: '4px' }}>
                              (Tk #{p.winner_ticket_number})
                            </span>
                          )}
                        </span>
                        {p.split_count > 1 && <span className="hg-prize-tk">split ×{p.split_count}</span>}
                      </div>
                    ) : (
                      <span className="hg-prize-open">Open</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Search Tickets Section */}
          <div className="hg-ticket-search-box" style={{ marginTop: "12px" }}>
            <h2 className="hg-section-title">Search Game Tickets</h2>
            <div className="hg-search-input-wrapper">
              <input
                type="text"
                placeholder="Search ticket # or player name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="hg-search-input"
              />
              <button onClick={handleSearch} className="hg-search-btn" disabled={isSearching} aria-label="Search">
                {isSearching ? <span className="hg-search-spinner" /> : <Icon name="search" size={16} />}
              </button>
            </div>
            {searchedTickets.length > 0 && (
              <div className="hg-searched-results">
                <div className="hg-searched-results-head">
                  <span>Search Results ({searchedTickets.length})</span>
                  <button onClick={() => { setSearchedTickets([]); setSearchQuery(""); }} className="hg-clear-search-btn">
                    Clear
                  </button>
                </div>
                <div className="hg-mytickets-row">
                  {searchedTickets.map((t) => (
                    <div key={t.number} className="hg-live-ticket-card">
                      <HousieTicket
                        matrix={t.matrix}
                        drawn={drawn}
                        compact
                      />
                      <div className="hg-live-ticket-footer">
                        <span className="hg-live-ticket-number">Ticket #{t.number}</span>
                        <span className="hg-live-ticket-player-name">{t.owner || "Player"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="hg-sec-err" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}

interface OverflowHistoryItem {
  booking_id: string;
  housie_name: string;
  game_title: string;
  ticket_numbers: number[];
  total_amount: number;
  booking_status: string;
  processed_at: string | null;
}

export function OverflowSection({ me }: { me: AuthUser }) {
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [history, setHistory] = useState<OverflowHistoryItem[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ user_id: string; full_name: string; role_name: string; receive_overflow: boolean }[]>([]);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => {
    apiFetch<QueueBooking[]>("/api/bookings/operator/overflow-queue").then(setQueue).catch(() => {});
    apiFetch<OverflowHistoryItem[]>("/api/bookings/operator/overflow-history").then(setHistory).catch(() => {});
  }, []);

  const loadSettings = useCallback(() => {
    if (me.role_name !== "Superadmin") return;
    apiFetch<{ user_id: string; full_name: string; role_name: string; receive_overflow: boolean }[]>("/api/users/overflow-settings")
      .then(setSettings)
      .catch(() => {});
  }, [me]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useSocket(
    (event) => {
      if (event === "overflow_booking" || event === "ticket_status_change") {
        load();
        try {
          const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {}
      }
    },
    { event: "join_operator_room", arg: me.user_id }
  );

  const act = async (id: string, action: "confirm" | "reject") => {
    setError(null);
    try {
      const endpoint = action === "confirm" ? "force-confirm" : "force-reject";
      await apiFetch(`/api/bookings/operator/${id}/${endpoint}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const copyReply = (r: QueueBooking) => {
    const text = `✅ Payment received, ${r.housie_name}! Your ticket(s) ${r.ticket_numbers.map((t) => "#" + t).join(", ")} for "${r.game_title}" are confirmed. Good luck! 🍀`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(r.booking_id);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleSetting = async (userId: string, currentVal: boolean) => {
    setUpdatingSettings(true);
    try {
      await apiFetch(`/api/users/${userId}/overflow-settings`, {
        method: "PATCH",
        body: JSON.stringify({ receive_overflow: !currentVal }),
      });
      loadSettings();
    } catch (e) {
      console.error("Failed to update overflow setting:", e);
    } finally {
      setUpdatingSettings(false);
    }
  };

  return (
    <div className="hg-sec">
      {me.role_name === "Superadmin" && (
        <div className="hg-panel" style={{ padding: "16px 20px", marginBottom: "24px" }}>
          <div className="hg-panel-head" style={{ marginBottom: "12px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--accent)" }}>Overflow Routing Settings</h3>
            <p className="hg-sec-sub" style={{ fontSize: "11px", marginTop: "2px" }}>
              Select which active staff members participate in the overflow queue (round-robin turn wise sequence).
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            {settings.map((s) => (
              <label 
                key={s.user_id} 
                className="hover-glow"
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px", 
                  background: "rgba(255,255,255,0.03)", 
                  padding: "8px 14px", 
                  borderRadius: "var(--radius)", 
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: updatingSettings ? "not-allowed" : "pointer" 
                }}
              >
                <input 
                  type="checkbox" 
                  checked={s.receive_overflow}
                  disabled={updatingSettings}
                  onChange={() => toggleSetting(s.user_id, s.receive_overflow)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>{s.full_name}</span>
                  <span className="hg-dim" style={{ fontSize: "10px" }}>{s.role_name}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="hg-sec-sub">Bookie overflow failsafe — bookings routed to you when no agent has wallet balance.</p>
      {error && <p className="hg-sec-err">{error}</p>}
      {queue.length === 0 ? (
        <EmptyHint
          icon="bell"
          title="No overflow bookings right now"
          sub="When every bookie is low on funds, the player's request lands here. Verify their UPI payment, then Force Confirm."
        />
      ) : (
        <div className="hg-bq-list">
          {queue.map((r) => {
            const left = Math.max(0, Math.floor((new Date(r.locked_until).getTime() - now) / 1000));
            const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
            return (
              <div key={r.booking_id} className="hg-bq-card">
                <div className="hg-bq-top">
                  <div><b>{r.housie_name}</b><span className="hg-bq-game">{r.game_title}</span></div>
                  <div className="hg-bq-timer"><Icon name="clock" size={13} /> {timer}</div>
                </div>
                <div className="hg-bq-tickets">
                  Tickets {r.ticket_numbers.map((t) => "#" + t).join(", ")} · <b>{money(r.total_amount)}</b>
                </div>
                <div className="hg-bq-actions">
                  <button className="hg-bq-copy" onClick={() => copyReply(r)}>
                    <Icon name="chat" size={15} /> {copied === r.booking_id ? "Copied!" : "Copy WhatsApp reply"}
                  </button>
                  <button className="hg-bq-confirm" onClick={() => act(r.booking_id, "confirm")}>
                    <Icon name="check" size={15} strokeWidth={2.6} /> Confirm
                  </button>
                  <button className="hg-bq-cancel" onClick={() => act(r.booking_id, "reject")}>
                    <Icon name="x" size={15} strokeWidth={2.6} /> Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking History Panel */}
      <div className="hg-panel" style={{ marginTop: "32px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Booking History (Last 10)
          </h3>
        </div>
        {history.length === 0 ? (
          <EmptyHint icon="clock" title="No history yet" sub="Processed booking requests will show up here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "700px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 1fr" }}>
                <span>Player Name</span>
                <span>Game Title</span>
                <span>Ticket Numbers</span>
                <span>Amount</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {history.map((h) => {
                const formattedDate = h.processed_at 
                  ? new Date(h.processed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                  : "Unknown";
                return (
                  <div key={h.booking_id} className="hg-tr" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 1fr" }}>
                    <div>
                      <b style={{ color: "var(--text)" }}>{h.housie_name}</b>
                      <div className="hg-dim" style={{ fontSize: "10px", marginTop: "2px" }}>{formattedDate}</div>
                    </div>
                    <span className="hg-dim">{h.game_title}</span>
                    <span style={{ color: "var(--text)" }}>
                      {h.ticket_numbers.map((num: number) => `#${num}`).join(", ")}
                    </span>
                    <strong style={{ color: "var(--accent)" }}>{money(h.total_amount)}</strong>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <span 
                        className={`hg-pill hg-pill-${h.booking_status.toLowerCase()}`}
                        style={{
                          background: h.booking_status === "Sold" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: h.booking_status === "Sold" ? "#10B981" : "#EF4444",
                          border: h.booking_status === "Sold" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                        }}
                      >
                        {h.booking_status === "Sold" ? "Sold" : "Rejected"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



export function ShareGamesSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ gameId: string; gameTitle: string; filename: string; caption: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareGroups, setShareGroups] = useState<WhatsAppShareGroup[]>([]);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games").then(setGames).catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<{ groups: WhatsAppShareGroup[] }>("/api/config/share-groups")
      .then((res) => setShareGroups(res.groups))
      .catch(() => setShareGroups([]));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const upcoming = games
    .filter((g) => g.game_status === "Scheduled" || g.game_status === "Live" || g.game_status === "Paused")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const completed = games
    .filter((g) => g.game_status === "Completed")
    .sort((a, b) => new Date(b.completed_at ?? b.scheduled_at).getTime() - new Date(a.completed_at ?? a.scheduled_at).getTime())
    .slice(0, 8);

  const share = async (kind: PosterKind, g: GameSummary) => {
    setError(null);
    setCopied(false);
    setSharingId(g.game_id);
    try {
      const { filename, caption } = await downloadPoster(kind, g);
      setResult({ gameId: g.game_id, gameTitle: g.title, filename, caption });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the share image");
    } finally {
      setSharingId(null);
    }
  };

  const captionRef = useRef<HTMLTextAreaElement>(null);

  const copyCaption = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API blocked (permissions, unfocused doc, etc.) — select the
      // text so the operator can copy it manually with Ctrl/Cmd+C instead.
      captionRef.current?.focus();
      captionRef.current?.select();
    }
  };

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Share a game&apos;s schedule card, or its final winners, as an image straight to a Housie Ghar WhatsApp group.</p>
      {error && <p className="hg-sec-err">{error}</p>}

      {/* Redesigned Modal Popout Card when download is clicked */}
      {result && (
        <div className="hg-modal-scrim" onClick={() => setResult(null)}>
          <div className="hg-modal hg-card" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)", maxWidth: "480px", width: "90%", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text)", fontFamily: "var(--font-head)" }}>
                <Icon name="check" size={16} style={{ color: "var(--success)" }} />
                <span>Poster Generated!</span>
              </strong>
              <button
                onClick={() => setResult(null)}
                title="Dismiss"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-mute)", display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 4, borderRadius: "50%", transition: "all 0.15s"
                }}
                onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"}
                onMouseOut={(e) => e.currentTarget.style.color = "var(--text-mute)"}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            
            <p className="hg-sec-sub" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
              The share poster for <b>&quot;{result.gameTitle}&quot;</b> has been downloaded. Copy the caption below and share:
            </p>

            <div style={{ position: "relative" }}>
              <textarea
                ref={captionRef}
                readOnly
                value={result.caption}
                rows={6}
                style={{
                  width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12,
                  padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--border-2)",
                  background: "var(--bg)", color: "var(--text)", outline: "none",
                }}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copyCaption}
                className={`hg-caption-copy-btn ${copied ? "is-success" : ""}`}
                title={copied ? "Copied to clipboard!" : "Copy Caption"}
              >
                <Icon name={copied ? "check" : "copy"} size={13} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="hg-share-destinations" style={{ borderTop: "1.5px dashed var(--border-2)", paddingTop: 14, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 8 }}>
                Send directly to Official Info Groups
              </span>
              {shareGroups.length > 0 ? (
                <div className="hg-share-group-list" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {shareGroups.map((group) => (
                    <button
                      key={`${group.name}-${group.url}`}
                      className="hg-share-group"
                      onClick={() => {
                        navigator.clipboard.writeText(result.caption).catch(() => {});
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                        window.open(group.url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <Icon name="chat" size={14} style={{ color: "var(--success)" }} />
                      <span>{group.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="hg-share-group"
                    onClick={() => {
                      navigator.clipboard.writeText(result.caption).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2500);
                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(result.caption)}`, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Icon name="chat" size={14} style={{ color: "var(--success)" }} />
                    <span>Share via WhatsApp</span>
                  </button>
                  <p className="hg-dim" style={{ margin: 0, fontSize: 12, alignSelf: "center", color: "var(--text-mute)" }}>
                    No Official Info Groups configured. Click button to share generally.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: "20px 0 12px" }}>
        Upcoming &amp; Live
      </h3>
      {upcoming.length === 0 ? (
        <EmptyHint icon="grid" title="No upcoming games" sub="Scheduled and live games appear here to share." />
      ) : (
        <div className="hg-fill-grid">
          {upcoming.map((g) => {
            const presetClass = getPresetClass(g.title);
            return (
              <div key={g.game_id} className={`hg-fill-card${presetClass ? " " + presetClass : ""}`} style={{ display: "flex", flexDirection: "column", minHeight: "128px", position: "relative" }}>
                <div>
                  <div className="hg-fill-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <strong style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-head)" }}>{g.title}</strong>
                    <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`} style={{ flexShrink: 0 }}>{g.game_status.replace("_", " ")}</span>
                  </div>
                  <div className="hg-fill-meta" style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>
                    {fmtDateTime(g.scheduled_at)}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "8px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--text-mute)", fontWeight: 600 }}>
                    {money(g.prize_pool.reduce((s, p) => s + p.prize_amount, 0))} pool
                  </span>
                  
                  <button
                    className="hg-download-icon-btn"
                    disabled={sharingId === g.game_id}
                    onClick={() => share("scheduled", g)}
                    title="Download Share Image + Caption"
                    aria-label="Download Share Image + Caption"
                  >
                    {sharingId === g.game_id ? (
                      <span className="hg-poll-spin" style={{ width: "16px", height: "16px" }} />
                    ) : (
                      <Icon name="download" size={16} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: "24px 0 12px" }}>
        Completed
      </h3>
      {completed.length === 0 ? (
        <EmptyHint icon="trophy" title="No completed games yet" sub="Winners lists appear here once a game finishes." />
      ) : (
        <div className="hg-fill-grid">
          {completed.map((g) => {
            const wins = g.prize_pool.filter((p) => p.claimed).length;
            const presetClass = getPresetClass(g.title);
            return (
              <div key={g.game_id} className={`hg-fill-card${presetClass ? " " + presetClass : ""}`} style={{ display: "flex", flexDirection: "column", minHeight: "128px", position: "relative" }}>
                <div>
                  <div className="hg-fill-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <strong style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-head)" }}>{g.title}</strong>
                    <span className="hg-pill hg-pill-completed" style={{ flexShrink: 0 }}>Completed</span>
                  </div>
                  <div className="hg-fill-meta" style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>
                    {fmtDateTime(g.completed_at ?? g.scheduled_at)}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "8px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--text-mute)", fontWeight: 600 }}>
                    {wins} prize{wins === 1 ? "" : "s"} claimed
                  </span>
                  
                  <button
                    className="hg-download-icon-btn"
                    disabled={sharingId === g.game_id}
                    onClick={() => share("winners", g)}
                    title="Download Winners Poster + Caption"
                    aria-label="Download Winners Poster + Caption"
                  >
                    {sharingId === g.game_id ? (
                      <span className="hg-poll-spin" style={{ width: "16px", height: "16px" }} />
                    ) : (
                      <Icon name="download" size={16} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


