"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { getPresetClass } from "@/lib/presetHelper";
import { Button, EmptyHint } from "@/components/ui";
import { useSocket } from "@/lib/hooks/useSocket";
import type { GameSummary } from "@/lib/types";
import { LiveBoardContent } from "@/components/LiveBoardContent";
import { TicketSalesModal, StaffManualBookingModal } from "./AdminSections";

function fillPct(g: GameSummary): number {
  return Math.round(((g.sold_count + g.locked_count) / g.total_tickets) * 100);
}

function gameTime(g: GameSummary): string {
  const d = new Date(g.scheduled_at);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export function BookieLiveHudSection() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [salesGameId, setSalesGameId] = useState<string | null>(null);
  const [bookingGameId, setBookingGameId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [drawnData, setDrawnData] = useState<{ drawn_numbers: number[]; current_index: number } | null>(null);
  const [loadingDrawn, setLoadingDrawn] = useState(false);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        setGames(g);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const viewResults = async (game: GameSummary) => {
    setSelectedGame(game);
    setDrawnData(null);
    setLoadingDrawn(true);
    try {
      const drawn = await apiFetch<{ drawn_numbers: number[]; current_index: number }>(`/api/games/${game.game_id}/drawn`);
      setDrawnData(drawn);
    } catch (e) {
      console.error("Failed to load drawn numbers", e);
    } finally {
      setLoadingDrawn(false);
    }
  };

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
  const activeGames = all.filter((g) => g.game_status !== "Completed");
  const pastGames = all.filter((g) => {
    if (g.game_status !== "Completed") return false;
    const date = new Date(g.completed_at || g.scheduled_at);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return date >= threeDaysAgo;
  });

  return (
    <div className="hg-sec" style={{ padding: "0 10px" }}>
      <div className="hg-sec-head">
        <div>
          <h2 className="hg-sec-title">Games &amp; Draw Management</h2>
          <p className="hg-sec-sub">Monitor live ticket sales, booking fill rates, and past game draws.</p>
        </div>
      </div>

      {error && <p className="hg-sec-err">Could not load games: {error}</p>}

      {/* Live Booking Fill Rates panel */}
      {activeGames.length === 0 ? (
        <div style={{ padding: "30px", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "8px", textAlign: "center", color: "var(--text-mute)", fontSize: "13px", marginBottom: "20px" }}>
          No active or scheduled games at the moment.
        </div>
      ) : (
        <div className="hg-panel" style={{ marginBottom: "20px" }}>
          <div className="hg-panel-head">
            <h3>Live Booking Fill Rates</h3>
          </div>
          <div className="hg-fill-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", padding: "4px 0" }}>
            {activeGames.map((g) => {
              const pct = fillPct(g);
              const presetClass = getPresetClass(g.title, g.single_ticket_only);
              const isLive = g.game_status === "Live" || g.game_status === "Paused" || g.game_status === "Draw_Ended";
              return (
                <div key={g.game_id} className={`hg-fill-card${presetClass ? " " + presetClass : ""}`} style={{ margin: 0 }}>
                  <div className="hg-fill-top">
                    <strong>{g.title}</strong>
                    <span className={`hg-pill hg-pill-${g.game_status.toLowerCase().replace("_", "-")}`} style={{ whiteSpace: "nowrap" }}>
                      {g.game_status === "Draw_Ended" ? "Game Ended" : g.game_status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="hg-fill-meta">
                    {gameTime(g)} · {g.sold_count + g.locked_count}/{g.total_tickets} tickets
                  </div>
                  <div className="hg-fill-bar">
                    <i style={{ width: pct + "%" }} className={pct >= 80 ? "is-hot" : ""} />
                  </div>
                  <div className="hg-fill-pct">{pct}% full</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon="ticket"
                      full
                      onClick={() => setSalesGameId(g.game_id)}
                    >
                      View Tickets
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="users"
                      full
                      onClick={() => setBookingGameId(g.game_id)}
                    >
                      Book Ticket
                    </Button>
                    {isLive && (
                      <Button
                        variant="cta"
                        size="sm"
                        iconRight="chevR"
                        full
                        onClick={() => setActiveGameId(g.game_id)}
                      >
                        Watch Live
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Games Panel */}
      <div className="hg-panel hg-table-premium" style={{ marginTop: "24px", overflowX: "auto" }}>
        <div className="hg-panel-head">
          <h3>Past Games (Last 3 Days)</h3>
        </div>
        {pastGames.length === 0 ? (
          <EmptyHint icon="trophy" title="No completed games" sub="Finished games in the last 3 days will show up here." />
        ) : (
          <div className="hg-table" style={{ minWidth: "760px" }}>
            <div className="hg-tr hg-tr-history hg-tr-head">
              <span>Game Name</span><span>Date &amp; Time</span><span>Tickets Sold</span><span>Revenue</span><span>Action</span>
            </div>
            {pastGames.map((g) => {
              const totalRevenue = g.sold_count * g.ticket_price;
              const dateStr = g.completed_at
                ? new Date(g.completed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                : new Date(g.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
              return (
                <div key={g.game_id} className="hg-tr hg-tr-history">
                  <span className="hg-td-name">{g.title}</span>
                  <span className="hg-dim">{dateStr}</span>
                  <span>{g.sold_count} / {g.total_tickets}</span>
                  <strong>{money(totalRevenue)}</strong>
                  <span className="hg-row-ctrls" style={{ display: "flex", gap: 6, justifyContent: "flex-start", flexWrap: "nowrap" }}>
                    <Button variant="ghost" size="sm" onClick={() => viewResults(g)}>View Results</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSalesGameId(g.game_id)}>View Tickets</Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {salesGameId && <TicketSalesModal gameId={salesGameId} onClose={() => setSalesGameId(null)} />}
      {bookingGameId && <StaffManualBookingModal gameId={bookingGameId} onClose={() => setBookingGameId(null)} onSuccess={load} />}

      {selectedGame && (
        <div className="hg-modal-scrim" onClick={() => setSelectedGame(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)", maxWidth: "600px", width: "90%" }}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="font-semibold text-lg">{selectedGame.title} Results</h3>
              <button onClick={() => setSelectedGame(null)} style={{ border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "20px" }}>×</button>
            </div>
            
            <div className="mt-4" style={{ overflowY: "auto", maxHeight: "400px", paddingRight: "4px" }}>
              {/* Stats Block */}
              <div className="grid grid-cols-3 gap-2 mb-4 bg-surface-2 p-3 rounded" style={{ backgroundColor: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                <div>
                  <span className="block text-xs text-dim" style={{ color: "var(--text-dim)" }}>Ticket Price</span>
                  <strong className="text-sm">{money(selectedGame.ticket_price)}</strong>
                </div>
                <div>
                  <span className="block text-xs text-dim" style={{ color: "var(--text-dim)" }}>Tickets Sold</span>
                  <strong className="text-sm">{selectedGame.sold_count}</strong>
                </div>
                <div>
                  <span className="block text-xs text-dim" style={{ color: "var(--text-dim)" }}>Total Collection</span>
                  <strong className="text-sm" style={{ color: "var(--brand)" }}>{money(selectedGame.sold_count * selectedGame.ticket_price)}</strong>
                </div>
              </div>

              {/* Dividends & Winners */}
              <div className="mb-4">
                <h4 className="font-semibold text-sm mb-2" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "4px" }}>Dividends &amp; Winners</h4>
                <div className="space-y-2 flex flex-col gap-2">
                  {selectedGame.prize_pool.map((p) => {
                    return (
                      <div key={p.prize_id} className="flex justify-between items-start p-2 rounded border border-border" style={{ borderColor: "var(--border-2)", borderRadius: "var(--radius-sm)" }}>
                        <div>
                          <div className="font-semibold text-sm">{p.pattern_name}</div>
                          <div className="text-xs text-dim" style={{ color: "var(--text-dim)" }}>Prize: {money(p.prize_amount)}</div>
                        </div>
                        <div className="text-right">
                          {p.claimed ? (
                            <div>
                              <span className="hg-pill hg-pill-completed text-xs mb-1 inline-block" style={{ backgroundColor: "var(--emerald-500)", color: "white" }}>Claimed</span>
                              <div className="text-xs font-semibold">{p.winner_housie_name}</div>
                              {p.split_count > 1 && (
                                <div className="text-xxs text-dim" style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                                  Split: {p.split_count} winners ({money(p.amount_per_winner || 0)} each)
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="hg-pill text-xs" style={{ backgroundColor: "var(--border-2)", color: "var(--text-dim)" }}>Unclaimed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Drawn Numbers Sequence */}
              <div>
                <h4 className="font-semibold text-sm mb-2" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "4px" }}>Drawn Numbers Sequence</h4>
                {loadingDrawn ? (
                  <div className="flex justify-center py-4">
                    <span className="hg-poll-spin" />
                  </div>
                ) : drawnData && drawnData.drawn_numbers && drawnData.drawn_numbers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {drawnData.drawn_numbers.map((num, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center font-mono font-bold text-xs"
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          backgroundColor: "var(--brand-dim, var(--surface-2))",
                          color: "var(--brand, var(--text))",
                          border: "1px solid var(--brand)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title={`Drawn #${i + 1}`}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-dim py-2" style={{ color: "var(--text-dim)" }}>No numbers were drawn.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="cta" size="sm" onClick={() => setSelectedGame(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
