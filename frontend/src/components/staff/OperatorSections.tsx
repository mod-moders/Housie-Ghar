"use client";
/** Operator sections: live HUD with draw controls + overflow failsafe queue. */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSSE } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { Icon } from "@/components/Icon";
import { EmptyHint, KpiCard } from "@/components/ui";
import { downloadPoster, type PosterKind } from "@/lib/sharePoster";
import type { GameSummary, QueueBooking } from "@/lib/types";

interface WhatsAppShareGroup {
  name: string;
  url: string;
}

export function OperatorHudSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { drawnNumbers, lastDrawn, gameStatus, reset } = useGameStore();

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        const open = g.filter((x) => x.game_status !== "Completed");
        setGames(open);
        setSelectedId((cur) => {
          if (cur && open.some((x) => x.game_id === cur)) return cur;
          const live = open.find((x) => x.game_status === "Live" || x.game_status === "Paused");
          return (live ?? open[0])?.game_id ?? null;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { reset(); }, [selectedId, reset]);

  useSSE(selectedId);

  const game = games.find((g) => g.game_id === selectedId) ?? null;
  const running = gameStatus === "Live";

  const act = async (action: "start" | "pause" | "resume") => {
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

  if (!game) {
    return (
      <div className="hg-sec">
        <EmptyHint icon="play" title="No game to run" sub="Once a game is scheduled, its live controls appear here." />
      </div>
    );
  }

  const status = gameStatus === "Scheduled" ? game.game_status : gameStatus;

  return (
    <div className="hg-sec">
      {games.length > 1 && (
        <div className="hg-form-row" style={{ maxWidth: 360 }}>
          <label className="hg-form-field">
            <span>Game</span>
            <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
              {games.map((g) => (
                <option key={g.game_id} value={g.game_id}>{g.title} ({g.game_status})</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="hg-hud-grid">
        <div className="hg-hud-main">
          <div className="hg-hud-game">
            {game.title} · <span className={`hg-pill hg-pill-${status.toLowerCase()}`}>{status.toUpperCase()}</span>
          </div>
          <div className="hg-hud-num">{lastDrawn ?? "—"}</div>
          <div className="hg-hud-sub">{drawnNumbers.length} of 90 numbers called</div>
          <div className="hg-hud-controls">
            {status === "Scheduled" && (
              <button className="hg-hud-btn is-on" disabled={busy} onClick={() => act("start")}>
                <Icon name="play" size={18} /> Start draw
              </button>
            )}
            {status === "Live" && (
              <button className="hg-hud-btn is-on" disabled={busy} onClick={() => act("pause")}>
                <Icon name="pause" size={18} /> Pause draw
              </button>
            )}
            {status === "Paused" && (
              <button className="hg-hud-btn" disabled={busy} onClick={() => act("resume")}>
                <Icon name="play" size={18} /> Resume draw
              </button>
            )}
          </div>
          <div className="hg-speed">
            <div className="hg-speed-lbl"><span>Call speed</span><b>{speed}s interval</b></div>
            <input
              type="range" min={5} max={12} value={speed}
              onChange={(e) => applySpeed(+e.target.value)}
              className="hg-speed-range"
              disabled={!running}
            />
            <div className="hg-speed-ends"><span>Fast 5s</span><span>Slow 12s</span></div>
          </div>
          {error && <p className="hg-sec-err" style={{ marginTop: 10 }}>{error}</p>}
        </div>
        <div className="hg-hud-side">
          <KpiCard
            label="Tickets sold"
            value={`${game.sold_count} / ${game.total_tickets}`}
            sub={`${Math.round((game.sold_count / game.total_tickets) * 100)}% full`}
          />
          <KpiCard label="Prize pool" value={money(game.prize_pool.reduce((s, p) => s + p.prize_amount, 0))} />
          <div className="hg-ghost-note">
            <Icon name="shield" size={14} /> Ghost-Host auto-resume is armed. If you disconnect, the draw continues on its own.
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverflowSection() {
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<QueueBooking[]>("/api/bookings/operator/overflow-queue").then(setQueue).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const forceConfirm = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/bookings/operator/${id}/force-confirm`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Force-confirm failed");
    }
  };

  return (
    <div className="hg-sec">
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
          {queue.map((r) => (
            <OverflowCard key={r.booking_id} booking={r} onConfirm={() => forceConfirm(r.booking_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Share to WhatsApp ───────────────────────────────────────────────────────
// Generates a JPEG poster (Canvas 2D — see lib/sharePoster.ts) with a matching
// prewritten caption. Every click always downloads the image (no OS share
// sheet — that path was unpredictable and could swallow the caption with no
// way to recover it). The caption stays visible on screen afterward so the
// operator can copy it or open WhatsApp with it whenever they're ready.
function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}

export function ShareGamesSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ gameTitle: string; filename: string; caption: string } | null>(null);
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
      setResult({ gameTitle: g.title, filename, caption });
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
      <p className="hg-sec-sub">Share a game's schedule card, or its final winners, as an image straight to a Housie Ghar WhatsApp group.</p>
      {error && <p className="hg-sec-err">{error}</p>}

      {result && (
        <div className="hg-card" style={{ padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>
              <Icon name="check" size={14} style={{ color: "var(--success)", verticalAlign: -2, marginRight: 6 }} />
              "{result.filename}" downloaded — caption for {result.gameTitle}:
            </strong>
            <button
              className="hg-ic-btn"
              onClick={() => setResult(null)}
              title="Dismiss"
              style={{ color: "var(--text-dim)" }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <textarea
            ref={captionRef}
            readOnly
            value={result.caption}
            rows={8}
            style={{
              width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12.5,
              padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)",
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="hg-hud-share-btn"
                onClick={copyCaption}
                style={{ color: copied ? "var(--success)" : "var(--brand)", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Caption Copied" : "Copy Caption"}
              </button>
            </div>
            
            <div className="hg-share-destinations" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 6 }}>
                Send directly to Official Info Groups
              </span>
              {shareGroups.length > 0 ? (
                <div className="hg-share-group-list" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {shareGroups.map((group) => (
                    <button
                      key={`${group.name}-${group.url}`}
                      className="hg-share-group"
                      onClick={() => {
                        navigator.clipboard.writeText(result.caption).catch(() => {});
                        window.open(group.url, "_blank", "noopener,noreferrer");
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border-2)",
                        background: "var(--surface)", color: "var(--text)", fontSize: 12,
                        fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      <Icon name="chat" size={13} style={{ color: "var(--success)" }} /> {group.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="hg-share-group"
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(result.caption)}`, "_blank", "noopener,noreferrer")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border-2)",
                      background: "var(--surface)", color: "var(--text)", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Icon name="chat" size={13} style={{ color: "var(--success)" }} /> Share via WhatsApp
                  </button>
                  <p className="hg-dim" style={{ margin: 0, fontSize: 11, alignSelf: "center" }}>
                    No Official Info Groups configured. Click button to share generally.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", margin: "18px 0 10px" }}>
        Upcoming &amp; Live
      </h3>
      {upcoming.length === 0 ? (
        <EmptyHint icon="grid" title="No upcoming games" sub="Scheduled and live games appear here to share." />
      ) : (
        <div className="hg-fill-grid">
          {upcoming.map((g) => (
            <div key={g.game_id} className="hg-fill-card">
              <div className="hg-fill-top">
                <strong>{g.title}</strong>
                <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status}</span>
              </div>
              <div className="hg-fill-meta">
                {fmtDateTime(g.scheduled_at)} · {money(g.prize_pool.reduce((s, p) => s + p.prize_amount, 0))} pool
              </div>
              <button
                className="hg-ic-btn"
                disabled={sharingId === g.game_id}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--brand)", fontSize: 12, fontWeight: 600 }}
                onClick={() => share("scheduled", g)}
              >
                <Icon name="chat" size={14} /> {sharingId === g.game_id ? "Generating…" : "Download Image + Caption"}
              </button>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", margin: "22px 0 10px" }}>
        Completed
      </h3>
      {completed.length === 0 ? (
        <EmptyHint icon="trophy" title="No completed games yet" sub="Winners lists appear here once a game finishes." />
      ) : (
        <div className="hg-fill-grid">
          {completed.map((g) => {
            const wins = g.prize_pool.filter((p) => p.claimed).length;
            return (
              <div key={g.game_id} className="hg-fill-card">
                <div className="hg-fill-top">
                  <strong>{g.title}</strong>
                  <span className="hg-pill hg-pill-completed">Completed</span>
                </div>
                <div className="hg-fill-meta">
                  {fmtDateTime(g.completed_at ?? g.scheduled_at)} · {wins} prize{wins === 1 ? "" : "s"} claimed
                </div>
                <button
                  className="hg-ic-btn"
                  disabled={sharingId === g.game_id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--brand)", fontSize: 12, fontWeight: 600 }}
                  onClick={() => share("winners", g)}
                >
                  <Icon name="chat" size={14} /> {sharingId === g.game_id ? "Generating…" : "Download Image + Caption"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverflowCard({ booking, onConfirm }: { booking: QueueBooking; onConfirm: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((new Date(booking.locked_until).getTime() - now) / 1000));
  const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="hg-bq-card">
      <div className="hg-bq-top">
        <div><b>{booking.housie_name}</b><span className="hg-bq-game">{booking.game_title}</span></div>
        <div className="hg-bq-timer"><Icon name="clock" size={13} /> {timer}</div>
      </div>
      <div className="hg-bq-tickets">
        Tickets {booking.ticket_numbers.map((t) => "#" + t).join(", ")} · <b>{money(booking.total_amount)}</b>
      </div>
      <div className="hg-bq-actions">
        <button className="hg-bq-confirm" onClick={onConfirm}>
          <Icon name="check" size={15} strokeWidth={2.6} /> Force Confirm
        </button>
      </div>
    </div>
  );
}
