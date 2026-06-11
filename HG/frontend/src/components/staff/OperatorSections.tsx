"use client";
/** Operator sections: live HUD with draw controls + overflow failsafe queue. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useSSE } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { Icon } from "@/components/Icon";
import { EmptyHint, KpiCard } from "@/components/ui";
import type { GameSummary, QueueBooking } from "@/lib/types";

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
