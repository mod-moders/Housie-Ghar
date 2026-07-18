"use client";
/** Live Execution Board Content component — no direct Promise unwrapping of Next.js routing params. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSSE, SSEEventData } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { Icon } from "@/components/Icon";
import { HousieTicket, TicketMatrix, gridToMatrix } from "@/components/HousieTicket";
import dynamic from "next/dynamic";
import { useConfigStore } from "@/lib/stores/configStore";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useSocket } from "@/lib/hooks/useSocket";
import { soundSynthesizer } from "@/lib/soundSynthesizer";
import type { GameSummary, Prize, TicketDetail } from "@/lib/types";

const RealisticBingoCage = dynamic(
  () => import("@/components/RealisticBingoCage").then((mod) => mod.RealisticBingoCage),
  { ssr: false }
);

const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

interface WinOverlay {
  prize: string;
  housie_name: string;
  ticket_id: number;
  winner_ticket_number?: number;
  amount: number;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  senderName: string;
  x: number;
}

let reactionSeq = 0;
function makeReaction(emoji: string, senderName: string): FloatingReaction {
  reactionSeq += 1;
  // Float from the right side of the screen (between 72% and 88%) to look like Facebook/Instagram Live
  return { id: reactionSeq, emoji, senderName, x: 72 + Math.random() * 16 };
}

export function LiveBoardContent({ gameId, isStaff, onBack }: { gameId: string; isStaff?: boolean; onBack?: () => void }) {
  const game_id = gameId;
  const router = useRouter();

  const [game, setGame] = useState<GameSummary | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [revealed, setRevealed] = useState(true);
  const [muted, setMuted] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [winOverlay, setWinOverlay] = useState<WinOverlay | null>(null);
  const [myTickets, setMyTickets] = useState<{ number: number; matrix: TicketMatrix; owner?: string | null }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedTickets, setSearchedTickets] = useState<{ number: number; matrix: TicketMatrix; owner?: string | null }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("hg_player_token") || localStorage.getItem("hg_player_token");
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(window.atob(base64));
          return payload.housieName || "Player";
        } catch {
          // ignore
        }
      }
      const staffToken = sessionStorage.getItem("hg_staff_token");
      if (staffToken) {
        try {
          const base64Url = staffToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(window.atob(base64));
          return payload.fullName || "Staff";
        } catch {
          // ignore
        }
      }
    }
    return "Player";
  });
  const [showAllCalled, setShowAllCalled] = useState(false);
  const [claimingPrize, setClaimingPrize] = useState<string | null>(null);

const { drawnNumbers, lastDrawn, gameStatus, reset } = useGameStore();
  const [showWinnersOverlay, setShowWinnersOverlay] = useState(false);

  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const delay = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current = timersRef.current.filter((x) => x !== t);
      fn();
    }, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const booking = useBookingStore();
  const { config } = useConfigStore();
  
  const { playGreeting, playOutro, playNumberCall, playCelebration, introPlayingRef } = useGameAudio(
    config?.english_caller_enabled === "true" && !muted,
    gameStatus === "Live"
  );

  const outroPlayedRef = useRef<boolean>(false);
  useEffect(() => {
    if (gameStatus === "Completed" || gameStatus === "Draw_Ended") {
      setShowWinnersOverlay(true);
      if (!outroPlayedRef.current) {
        outroPlayedRef.current = true;
        playOutro();
      }
    } else {
      setShowWinnersOverlay(false);
      outroPlayedRef.current = false;
    }
  }, [gameStatus, playOutro]);

  // Track winners for audio celebration

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

  const { addDrawn } = useGameStore();

  // Draws that arrive (e.g. for a client joining mid-game) while the welcome/
  // instruction intro is still playing get queued here instead of revealed
  // immediately, so the board never shows/calls a number over the intro.
  const pendingDrawsRef = useRef<number[]>([]);

  const revealDraw = useCallback((num: number) => {
    beep();
    addDrawn(num);       // set new number FIRST
    setRevealed(true);   // THEN reveal badge — no stale flash
    playNumberCall(num);
  }, [beep, addDrawn, playNumberCall]);

  const flushPendingDraws = useCallback(() => {
    const queued = pendingDrawsRef.current.splice(0);
    queued.forEach((num, i) => {
      const offset = i * 2500;
      delay(() => setRevealed(false), offset);
      delay(() => revealDraw(num), offset + 2000);
    });
  }, [delay, revealDraw]);

  const gameStartedAnnouncedRef = useRef<boolean>(false);
  useEffect(() => {
    if (gameStatus === "Live" && !gameStartedAnnouncedRef.current) {
      gameStartedAnnouncedRef.current = true;
      playGreeting().then(flushPendingDraws);
    }
  }, [gameStatus, playGreeting, flushPendingDraws]);

  // Fresh store per game visit
  useEffect(() => { reset(); }, [game_id, reset]);

  // Player or Staff session check
  useEffect(() => {
    apiFetch<{ player: { housie_name: string } }>("/api/player/me")
      .then((res) => {
        setDisplayName(res.player?.housie_name || "Player");
      })
      .catch(() => {
        return apiFetch<{ user: { full_name: string } }>("/api/auth/me")
          .then((res) => {
            setDisplayName(res.user?.full_name || "Staff");
          })
          .catch(() => {
            router.push("/login");
          });
      });
  }, [router]);

  const loadGameData = useCallback(() => {
    apiFetch<GameSummary>(`/api/games/${game_id}`)
      .then((g) => {
        setGame(g);
        setPrizes(g.prize_pool || []);
      })
      .catch(() => {});
  }, [game_id]);

  // Game meta + prize board
  useEffect(() => {
    loadGameData();
  }, [loadGameData]);

  const loadMyTickets = useCallback(() => {
    let alive = true;

    // First try fetching directly from API (handles page refreshes)
    apiFetch<TicketDetail[]>(`/api/games/${game_id}/my-tickets`)
      .then((tickets) => {
        if (!alive) return;
        if (tickets && tickets.length > 0) {
          setMyTickets(
            tickets.map((t) => ({
              number: t.ticket_number,
              matrix: gridToMatrix(t.grid_data),
              owner: t.owner_housie_name,
            }))
          );
        } else {
          fetchFromBookingStore();
        }
      })
      .catch(() => {
        if (alive) {
          fetchFromBookingStore();
        }
      });

    function fetchFromBookingStore() {
      if (booking.gameId !== game_id || booking.ticketIds.length === 0) return;
      Promise.all(
        booking.ticketIds.map((id) =>
          apiFetch<TicketDetail>(`/api/tickets/${id}`).catch(() => null)
        )
      ).then((details) => {
        if (!alive) return;
        setMyTickets(
          details
            .filter((d): d is TicketDetail => d != null)
            .map((d) => ({
              number: d.ticket_number,
              matrix: gridToMatrix(d.grid_data),
              owner: d.owner_housie_name,
            }))
        );
      });
    }

    return () => {
      alive = false;
    };
  }, [game_id, booking.gameId, booking.ticketIds]);

  // My booked tickets — auto-marked
  useEffect(() => {
    return loadMyTickets();
  }, [loadMyTickets]);

  useSocket((event) => {
    if (event === "ticket_status_change" || event === "game_list_update" || event === "prize_claim_received" || event === "prize_disbursed") {
      loadMyTickets();
      loadGameData();
    }
  });

  // Search handler
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    apiFetch<TicketDetail[]>(`/api/games/${game_id}/search-tickets?query=${encodeURIComponent(searchQuery)}`)
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

  // SSE: reveal-tease on draw, prize updates + overlay on winner
  const onEvent = useCallback((data: SSEEventData) => {
    if (data.event === "draw") {
      const num = data.draw_number as number;

      // Intro (welcome + instruction voice notes) still playing for this
      // client — queue the draw instead of revealing/calling it now, so the
      // board never shows or calls a number over the intro.
      if (introPlayingRef.current) {
        pendingDrawsRef.current.push(num);
        return;
      }

      // Step 1 — Cage spins, badge hidden
      setRevealed(false);

      // Step 2 — After spin (2s), show badge + play audio together (number set in same tick)
      delay(() => revealDraw(num), 2000);
    } else if (data.event === "winner") {
      const w = data as unknown as WinOverlay & { split_count: number; winner_ticket_number: number };
      setPrizes((prev) =>
        prev.map((p) =>
          p.pattern_name === w.prize
            ? { ...p, claimed: true, winner_housie_name: w.housie_name, winner_ticket_number: w.winner_ticket_number, amount_per_winner: w.amount, split_count: w.split_count }
            : p
        )
      );
      playCelebration();
      delay(() => {
        const config = useConfigStore.getState().config;
        const isSoundEnabled = config?.celebration_sound_enabled !== "false";
        if (isSoundEnabled) {
          soundSynthesizer.playCelebration();
        }
        setWinOverlay(w);
        delay(() => {
           setWinOverlay(null);
        }, 6000);
      }, 1400);
    } else if (data.event === "emoji_reaction") {
      const next = makeReaction(data.emoji as string, (data.player_id as string) || "Player");
      setReactions((r) => [...r, next]);
      delay(() => setReactions((r) => r.filter((x) => x.id !== next.id)), 2600);
    }
  }, [revealDraw, playCelebration, introPlayingRef, delay]);

  useSSE(game_id, onEvent);

  const formatGameDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const react = (emoji: string) => {
    apiFetch(`/api/games/${game_id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji, sender_name: displayName }),
    }).catch((err) => console.error("Failed to send reaction:", err));
  };

  const claimPrize = async (prizeId: number) => {
    setClaimingPrize(String(prizeId));
    try {
      const response = await apiFetch<{ whatsapp_url?: string }>(`/api/games/${game_id}/prizes/${prizeId}/claim`, {
        method: "POST",
      });
      loadGameData();
      if (response.whatsapp_url) {
        window.open(response.whatsapp_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to initiate claim");
    } finally {
      setClaimingPrize(null);
    }
  };

  const drawn = new Set(drawnNumbers);
  const count = drawnNumbers.length;
  const recent = drawnNumbers.slice(Math.max(0, count - 9)).reverse();

  return (
    <div className="hg-stage">
      <div className="hg-frame">
        <div className="hg-screen hg-live">
          <div className="hg-live-top">
            {!isStaff && (
              <button className="hg-back" onClick={onBack || (() => router.push("/"))} aria-label="Back">
                <Icon name="arrowL" size={20} />
              </button>
            )}
            <div className="hg-live-title">
              {gameStatus === "Live" && (
                <span className="hg-live-badge"><span className="hg-live-dot" /> LIVE</span>
              )}
              {gameStatus === "Paused" && <span className="hg-live-badge">PAUSED</span>}
              {game?.title ?? ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button className="hg-mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
                <Icon name={muted ? "volumeX" : "volume"} size={18} />
              </button>
              {isStaff && onBack && (
                <button className="hg-mute" onClick={onBack} aria-label="Close" title="Exit Live View">
                  <Icon name="x" size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="hg-live-body">
            <div className="hg-live-left">
              {/* Cage + status — outside the card on desktop */}
              <div className="hg-cage-area">
                <RealisticBingoCage lastDrawn={lastDrawn ?? null} isTeasing={!revealed} />
                
                <div style={{ textAlign: "center", marginTop: "6px", fontSize: "13px", fontWeight: 600, color: !revealed ? "var(--text-dim)" : "var(--cyan)", letterSpacing: "0.5px" }}>
                  {gameStatus === "Completed" || gameStatus === "Draw_Ended"
                    ? "Game has ended"
                    : gameStatus === "Paused"
                      ? "Draw paused…"
                      : !revealed
                        ? "Spinning…"
                        : count > 0 ? `Number ${lastDrawn} called` : "Waiting for the first call…"}
                </div>
                {(gameStatus === "Completed" || gameStatus === "Draw_Ended") && !showWinnersOverlay && (
                  <button
                    onClick={() => setShowWinnersOverlay(true)}
                    style={{
                      marginTop: "12px",
                      width: "100%",
                      padding: "10px 16px",
                      background: "linear-gradient(135deg, var(--accent) 0%, #ff7043 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 15px rgba(244, 63, 94, 0.4)",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(244, 63, 94, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 15px rgba(244, 63, 94, 0.4)";
                    }}
                  >
                    <Icon name="trophy" size={16} /> View Winners & Claim Prizes
                  </button>
                )}
              </div>

              {/* Recent numbers called panel — in a separate card just below the cage & call notification */}
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

              {/* 90 number box — shown in another box below */}
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
                  {prizes.map((p) => {
                    const isWinner = p.winner_housie_name === displayName || 
                      (p.winner_housie_name && p.winner_housie_name.split(/[,&()]/).map((s: string) => s.trim()).includes(displayName));
                    const isClaimed = p.player_claimed;
                    const isDrawFinished = gameStatus === "Completed" || gameStatus === "Draw_Ended";
                    const showClaimBtn = !isStaff && isDrawFinished && isWinner && !isClaimed;
                    return (
                      <div key={p.prize_id} className={`hg-prize-row${p.claimed ? " is-won" : ""}${isWinner && isClaimed ? " player-claimed" : ""}`}>
                        <div className="hg-prize-l">
                          <span className="hg-prize-name">{p.pattern_name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                            <span className="hg-prize-amt">{money(p.amount_per_winner ?? p.prize_amount)}</span>
                            {isClaimed && (
                              <span className="hg-claimed-badge" style={{
                                background: p.disbursed ? 'var(--success)' : '#d97706',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}>
                                {p.disbursed ? 'Disbursed' : 'Claimed'}
                              </span>
                            )}
                            {showClaimBtn && (
                              <button
                                className="hg-claim-btn"
                                onClick={() => claimPrize(p.prize_id)}
                                disabled={claimingPrize === String(p.prize_id)}
                                style={{
                                  background: 'var(--accent)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: claimingPrize === String(p.prize_id) ? 'not-allowed' : 'pointer',
                                  opacity: claimingPrize === String(p.prize_id) ? 0.7 : 1,
                                  transition: 'opacity 0.2s',
                                }}
                              >
                                {claimingPrize === String(p.prize_id) ? 'Claiming...' : 'Claim Prize'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="hg-prize-r">
                          {p.claimed && p.winner_housie_name ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="hg-prize-winner">
                                  {p.winner_housie_name}
                                  {p.winner_ticket_number && !p.winner_housie_name?.includes('(') && (
                                    <span style={{ opacity: 0.8, fontSize: '0.85em', marginLeft: '4px' }}>
                                      (Tk #{p.winner_ticket_number})
                                    </span>
                                  )}
                                </span>
                              </div>
                              {p.split_count > 1 && <span className="hg-prize-tk">split ×{p.split_count}</span>}
                            </div>
                          ) : (
                            <span className="hg-prize-open">Open</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* My Tickets Section (always rendered now!) */}
              <div className="hg-mytickets">
                <h2 className="hg-section-title">My Tickets · auto-marked</h2>
                {myTickets.length > 0 ? (
                  <div className="hg-mytickets-row">
                    {myTickets.map((t) => (
                      <div key={t.number} className="hg-live-ticket-card">
                        <div className="hg-live-ticket-header">
                          <span className="hg-live-ticket-game-name">{game?.title || "Housie Ghar"}</span>
                          <span className="hg-live-ticket-datetime">{formatGameDate(game?.scheduled_at)}</span>
                        </div>
                        <HousieTicket
                          matrix={t.matrix}
                          drawn={drawn}
                          compact
                        />
                        <div className="hg-live-ticket-footer">
                          <span className="hg-live-ticket-number">Ticket #{t.number}</span>
                          <span className="hg-live-ticket-player-name">{t.owner || "You"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hg-empty-tickets-placeholder">
                    No tickets owned for this game. Book tickets to view them here.
                  </div>
                )}
              </div>

              {/* Search Tickets Section */}
              <div className="hg-ticket-search-box">
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
                          <div className="hg-live-ticket-header">
                            <span className="hg-live-ticket-game-name">{game?.title || "Housie Ghar"}</span>
                            <span className="hg-live-ticket-datetime">{formatGameDate(game?.scheduled_at)}</span>
                          </div>
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

          <div style={{ height: 80 }} />

          {!isStaff && (
            <div className="hg-emoji-bar">
              {["🎉", "🔥", "👏", "😮", "🍀", "❤️"].map((e) => (
                <button key={e} className="hg-emoji-btn" onClick={() => react(e)}>{e}</button>
              ))}
            </div>
          )}

          <div className="hg-reactions" aria-hidden="true">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="hg-react-float hg-react-pill"
                style={{ left: `${r.x}%` }}
              >
                <span className="hg-react-avatar">{r.senderName.slice(0, 2).toUpperCase()}</span>
                <span className="hg-react-name">{r.senderName}</span>
                <span className="hg-react-emoji">{r.emoji}</span>
              </div>
            ))}
          </div>

          {winOverlay && (
            <>
              <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, pointerEvents: "none" }}>
                <Confetti width={typeof window !== "undefined" ? window.innerWidth : 1000} height={typeof window !== "undefined" ? window.innerHeight : 1000} recycle={true} numberOfPieces={500} />
              </div>
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
            </>
          )}

          {(gameStatus === "Completed" || gameStatus === "Draw_Ended") && showWinnersOverlay && (
            <div className="hg-game-over-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.5s ease" }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <Confetti recycle={gameStatus === "Draw_Ended"} numberOfPieces={600} gravity={0.08} />
              </div>
              <div className="hg-card" style={{ padding: 40, width: "90%", maxWidth: 600, textAlign: "center", background: "var(--surface)", border: "2px solid var(--accent)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
                <h1 style={{ color: "var(--accent)", fontSize: "2.5rem", marginBottom: 8 }}>
                  {gameStatus === "Completed" ? "Game Completed!" : "Draw Concluded!"}
                </h1>
                <p style={{ color: "var(--text-dim)", marginBottom: 32 }}>
                  {gameStatus === "Completed" 
                    ? "All prizes have been claimed and disbursed. Thank you for playing Housie Ghar." 
                    : "The draw has concluded. Winners can claim their prize rewards directly below."}
                </p>
                
                <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16, textAlign: "left" }}>Final Winners List</h3>
                <div style={{ maxHeight: "40vh", overflowY: "auto", textAlign: "left" }}>
                  {prizes.filter(p => p.claimed).map((p) => {
                    const isWinner = p.winner_housie_name === displayName || 
                      (p.winner_housie_name && p.winner_housie_name.split(/[,&()]/).map((s: string) => s.trim()).includes(displayName));
                    const isClaimed = p.player_claimed;
                    const showRowClaimBtn = !isStaff && gameStatus === "Draw_Ended" && isWinner && !isClaimed;
                    return (
                      <div key={p.prize_id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: "bold", fontSize: 16 }}>{p.pattern_name}</div>
                          <div style={{ color: "var(--accent)", fontSize: 14, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{p.winner_housie_name}</span>
                            {p.winner_ticket_number && !p.winner_housie_name?.includes('(') && (
                              <span style={{ color: 'var(--text-mute)', fontSize: '12px' }}>
                                (Tk #{p.winner_ticket_number})
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 600 }}>{money(p.amount_per_winner ?? p.prize_amount)}</span>
                          
                          {showRowClaimBtn && (
                            <button
                              onClick={() => claimPrize(p.prize_id)}
                              disabled={claimingPrize === String(p.prize_id)}
                              style={{
                                background: 'var(--accent)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: claimingPrize === String(p.prize_id) ? 'not-allowed' : 'pointer',
                                opacity: claimingPrize === String(p.prize_id) ? 0.7 : 1,
                                transition: 'opacity 0.2s',
                              }}
                            >
                              {claimingPrize === String(p.prize_id) ? 'Claiming...' : 'Claim Prize'}
                            </button>
                          )}

                          {isClaimed && (
                            <span style={{
                              background: p.disbursed ? 'var(--success)' : '#d97706',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}>
                              {p.disbursed ? 'Disbursed' : 'Claimed'}
                            </span>
                          )}

                          {!isClaimed && !showRowClaimBtn && (
                            <span style={{
                              background: 'rgba(255,255,255,0.05)',
                              color: 'var(--text-dim)',
                              fontSize: '11px',
                              fontWeight: 500,
                              padding: '4px 8px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}>
                              Pending Claim
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginTop: 32 }}>
                  <button 
                    onClick={() => setShowWinnersOverlay(false)} 
                    style={{ flex: 1, padding: "12px 24px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer", transition: "opacity 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    Close Winners List
                  </button>
                  <button 
                    onClick={() => router.push("/")} 
                    style={{ flex: 1, padding: "12px 24px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    Return to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
