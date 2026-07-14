"use client";
/** Admin/Superadmin staff sections: games, filling, workforce, audit, history, analytics widgets. */

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, Button, EmptyHint, KpiCard } from "@/components/ui";
import { roleAvatar } from "@/lib/roleAvatar";
import type { AuditEntry, DailyPoint, GameSummary, HourlyPoint, OverviewStats, RetentionData, StaffUser } from "@/lib/types";
import type { AuthUser } from "@/lib/stores/authStore";
import { CallVoiceSettings } from "./CallVoiceSettings";

// ── Dividend catalogue ────────────────────────────────────────────────────────
// The 11 patterns the engine can detect (winDetection.ts). "1st Full House"
// auto-downgrades to plain "Full House" on submit when 2nd/3rd aren't selected.
const DIVIDEND_METADATA = [
  { name: "1st Full House", pattern: "1st Full House", defaultAmount: 2000, desc: "The first ticket where all 15 numbers are marked. (Automatically becomes 'Full House' if 2nd and 3rd are not selected.)" },
  { name: "2nd Full House", pattern: "2nd Full House", defaultAmount: 1500, desc: "The second ticket where all 15 numbers are marked — a ticket that already won a Full House tier cannot win this one." },
  { name: "3rd Full House", pattern: "3rd Full House", defaultAmount: 1000, desc: "The third ticket where all 15 numbers are marked — a ticket that already won a Full House tier cannot win this one." },
  { name: "Top Line", pattern: "Top Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the first row." },
  { name: "Middle Line", pattern: "Middle Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the second row." },
  { name: "Bottom Line", pattern: "Bottom Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the third row." },
  { name: "Corner", pattern: "Corner", defaultAmount: 500, desc: "The first ticket where all four corner numbers are marked (the first and last numbers of the first and third rows)." },
  { name: "Star", pattern: "Star", defaultAmount: 1000, desc: "The ticket where all four corner numbers and the center number are marked (the center is the third number of the middle row)." },
  { name: "Early 5", pattern: "Early Five", defaultAmount: 500, desc: "The first ticket where any 5 numbers are marked." },
  { name: "Quick 7", pattern: "Quick 7", defaultAmount: 500, desc: "The first ticket where any 7 numbers are marked." },
  { name: "Box Bonus", pattern: "Box Bonus", defaultAmount: 500, desc: "The first ticket that contains at least two marked numbers in each of the three rows." },
];

type PrizeState = { pattern_name: string; prize_amount: number; enabled: boolean };

const PATTERN_DEFAULTS: PrizeState[] = DIVIDEND_METADATA.map((d) => ({
  pattern_name: d.pattern,
  prize_amount: d.defaultAmount,
  enabled: true,
}));

// Older games may carry pre-dividend pattern names; map them onto the catalogue
// so editing such a game pre-fills correctly.
function dividendMatches(catalogue: string, existing: string): boolean {
  if (catalogue === existing) return true;
  if (catalogue === "1st Full House" && existing === "Full House") return true;
  if (catalogue === "Corner" && existing === "Four Corners") return true;
  return false;
}

// ── Smart game presets ────────────────────────────────────────────────────────
// One-click templates for the daily slots. Applying a preset fills the whole
// form (still editable) and targets the NEXT future occurrence of its time slot
// — clicking "Snack & Stack (3:00 PM)" at 4 PM schedules tomorrow 3 PM.
type GamePreset = {
  name: string;
  hour: number;
  minute: number;
  ticket_price: number;
  total_tickets: number;
  prizes: Record<string, number>;
};

const GAME_PRESETS: GamePreset[] = [
  {
    name: "High Noon Fortune", hour: 12, minute: 0, ticket_price: 100, total_tickets: 30,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 },
  },
  {
    name: "Snack & Stack", hour: 15, minute: 0, ticket_price: 100, total_tickets: 30,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 },
  },
  {
    name: "Sundown Showdown", hour: 18, minute: 0, ticket_price: 100, total_tickets: 30,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 },
  },
  {
    name: "Prime Time", hour: 21, minute: 0, ticket_price: 100, total_tickets: 60,
    prizes: { "1st Full House": 2000, "2nd Full House": 1000, "Top Line": 500, "Middle Line": 500, "Bottom Line": 500, "Corner": 300, "Quick 7": 300 },
  },
];

// Next occurrence of hh:mm with at least 15 minutes of booking lead time.
function nextSlotFor(hour: number, minute: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() - from.getTime() < 15 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d;
}

// datetime-local wants a zone-less "YYYY-MM-DDTHH:MM" in local time —
// Date.toISOString() would shift it to UTC, so build it by hand.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function slotLabel(d: Date, now = new Date()): string {
  const day = d.getDate() === now.getDate() ? "Today" : "Tomorrow";
  return `${day} ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

function fillPct(g: GameSummary): number {
  return Math.round(((g.sold_count + g.locked_count) / g.total_tickets) * 100);
}

function gameTime(g: GameSummary): string {
  const d = new Date(g.scheduled_at);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

// ── Games table with full lifecycle controls ─────────────────────────────────
type GameAction = "start" | "pause" | "resume" | "edit" | "delete" | "speed";

const GRID7 = "2fr 1.1fr 1.2fr 1fr 0.6fr 0.9fr 1.6fr";

function GamesTable({ games, controls, onAction }: {
  games: GameSummary[];
  controls?: boolean;
  onAction?: (id: string, action: GameAction, speedValue?: number) => void;
}) {
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  return (
    <div className="hg-table">
      <div className="hg-tr hg-tr-head" style={controls ? { gridTemplateColumns: GRID7 } : undefined}>
        <span>Game</span>
        <span>Time</span>
        <span>Fill Rate</span>
        <span>Exp. Margin</span>
        <span>Players</span>
        <span>Status</span>
        {controls && <span>Controls</span>}
      </div>
      {games.map((g) => {
        const pct = fillPct(g);
        const prizeTotal = g.prize_pool?.reduce((acc, p) => acc + (p.prize_amount || 0), 0) || 0;
        const expMargin = g.sold_count * g.ticket_price - prizeTotal;

        return (
          <div key={g.game_id} className="hg-tr" style={controls ? { gridTemplateColumns: GRID7 } : undefined}>
            <span className="hg-td-name">{g.title}</span>
            <span className="hg-dim">{gameTime(g)}</span>
            <span className="hg-td-fill">
              <i className="hg-mini-bar"><b style={{ width: pct + "%" }} /></i>{pct}%
            </span>
            <span style={{ color: expMargin >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
              {money(expMargin)}
            </span>
            <span className="hg-dim">{g.player_count ?? 0}</span>
            <span><span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status}</span></span>
            {controls && (
              <span className="hg-row-ctrls" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {g.game_status === "Scheduled" && (
                  <button className="hg-ic-btn" title="Start" onClick={() => onAction?.(g.game_id, "start")}>
                    <Icon name="play" size={14} />
                  </button>
                )}
                {g.game_status === "Live" && (
                  <button className="hg-ic-btn" title="Pause" onClick={() => onAction?.(g.game_id, "pause")}>
                    <Icon name="pause" size={14} />
                  </button>
                )}
                {g.game_status === "Paused" && (
                  <button className="hg-ic-btn" title="Resume" onClick={() => onAction?.(g.game_id, "resume")}>
                    <Icon name="play" size={14} />
                  </button>
                )}
                {(g.game_status === "Live" || g.game_status === "Paused") && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--surface-2)", padding: "2px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)" }}>
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Pace:</span>
                      <select
                        defaultValue="8"
                        onChange={(e) => onAction?.(g.game_id, "speed", parseInt(e.target.value, 10))}
                        style={{ background: "none", border: "none", fontSize: 10, fontWeight: 700, outline: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}
                      >
                        {[5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                          <option key={s} value={s} style={{ background: "var(--surface)", color: "var(--text)" }}>{s}s</option>
                        ))}
                      </select>
                    </label>
                    <a href={`/game/${g.game_id}/live`} target="_blank" rel="noopener noreferrer" className="hg-ic-btn" title="Watch Live" style={{ color: "var(--accent)" }}>
                      <Icon name="eye" size={14} />
                    </a>
                  </>
                )}
                {g.game_status === "Scheduled" && (
                  <button className="hg-ic-btn" title="Edit" onClick={() => onAction?.(g.game_id, "edit")}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
                {g.game_status !== "Live" && g.game_status !== "Paused" && (
                  confirmDelId === g.game_id ? (
                    <span className="hg-settle-wrap">
                      <button className="hg-settle-btn is-confirm" onClick={() => { setConfirmDelId(null); onAction?.(g.game_id, "delete"); }}>Delete</button>
                      <button className="hg-settle-cancel" aria-label="Cancel delete" onClick={() => setConfirmDelId(null)}>
                        <Icon name="x" size={14} strokeWidth={2.6} />
                      </button>
                    </span>
                  ) : (
                    <button className="hg-ic-btn" title="Delete game" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelId(g.game_id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  )
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Analytics widgets (real data via /api/stats/financial-analysis) ──────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const gradId = useId();
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 120;
  const height = 40;
  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width="100%"
      height="40"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ opacity: 0.25, position: "absolute", bottom: 0, left: 0, right: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0 ${height} L ${points} L ${width} ${height} Z`} fill={`url(#${gradId})`} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export function EnhancedKpiCard({ label, value, sub, delta, trendData, trendColor, tone }: {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: { value: string; isPositive: boolean };
  trendData?: number[];
  trendColor?: string;
  tone?: "good" | "alert";
}) {
  return (
    <div
      className={`hg-kpi${tone ? " hg-kpi-" + tone : ""}`}
      style={{ position: "relative", overflow: "hidden", paddingBottom: trendData ? 42 : undefined }}
    >
      <span className="hg-kpi-label">{label}</span>
      <b className="hg-kpi-value" style={{ zIndex: 2, position: "relative" }}>{value}</b>
      {delta && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, zIndex: 2, position: "relative" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: delta.isPositive ? "var(--success)" : "var(--danger)" }}>
            {delta.isPositive ? "▲" : "▼"} {delta.value}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-mute)" }}>vs yesterday</span>
        </div>
      )}
      {sub && <span className="hg-kpi-sub" style={{ zIndex: 2, position: "relative" }}>{sub}</span>}
      {trendData && <Sparkline data={trendData} color={trendColor || "var(--accent)"} />}
    </div>
  );
}

type ChartSource = "margin" | "volume";

export function AnalyticsChart({ daily }: { daily: DailyPoint[] }) {
  const [source, setSource] = useState<ChartSource>("margin");

  const dayLabels = daily.map((d) => new Date(d.day).toLocaleDateString("en-IN", { weekday: "short" }));

  const width = 600;
  const height = 140;

  const getPathPoints = (data: number[], maxVal: number) =>
    data.map((val, idx) => ({
      x: (idx / Math.max(1, data.length - 1)) * width,
      y: height - (val / maxVal) * height,
    }));

  let paths: { points: { x: number; y: number }[]; color: string; label: string }[] = [];
  if (source === "margin") {
    const revenue = daily.map((d) => d.revenue);
    const payouts = daily.map((d) => d.payouts);
    const net = daily.map((d) => d.net);
    const maxVal = Math.max(...revenue, ...payouts, 1) * 1.15;
    paths = [
      { points: getPathPoints(revenue, maxVal), color: "var(--cyan)", label: "Gross Revenue" },
      { points: getPathPoints(payouts, maxVal), color: "var(--danger)", label: "Total Payouts" },
      { points: getPathPoints(net.map((n) => Math.max(0, n)), maxVal), color: "var(--success)", label: "Net Profit" },
    ];
  } else {
    const tickets = daily.map((d) => d.tickets);
    const maxVal = Math.max(...tickets, 1) * 1.15;
    paths = [{ points: getPathPoints(tickets, maxVal), color: "var(--accent)", label: "Ticket Sales Volume" }];
  }

  return (
    <div className="hg-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Platform Performance</h3>
          <p className="hg-sec-sub" style={{ margin: "2px 0 0" }}>Revenue, payouts and volume over the last 7 days.</p>
        </div>
        <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
          {(["margin", "volume"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSource(t)}
              style={{
                background: source === t ? "var(--surface)" : "none",
                color: source === t ? "var(--text)" : "var(--text-dim)",
                border: "none",
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t === "margin" ? "Profit Margin" : "Volume"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height, position: "relative", marginTop: 10 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          {[0.25, 0.5, 0.75, 1].map((p, i) => (
            <line key={i} x1="0" y1={height * (1 - p)} x2={width} y2={height * (1 - p)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" />
          ))}
          {paths.map((p, i) => {
            const pStr = p.points.map((pt) => `${pt.x},${pt.y}`).join(" L ");
            return (
              <g key={i}>
                <path d={`M ${pStr}`} fill="none" stroke={p.color} strokeWidth="2" />
                {p.points.map((pt, j) => (
                  <circle key={j} cx={pt.x} cy={pt.y} r="3.5" fill="var(--bg)" stroke={p.color} strokeWidth="1.5" />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {dayLabels.map((d, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-mute)", width: `${100 / Math.max(1, dayLabels.length)}%`, textAlign: "center" }}>
            {d}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeatmapWidget({ hourly }: { hourly: HourlyPoint[] }) {
  // Condense the 24 hourly buckets into 12 two-hour slots.
  const slots = Array.from({ length: 12 }, (_, i) => {
    const a = hourly.find((h) => h.hour === i * 2)?.tickets ?? 0;
    const b = hourly.find((h) => h.hour === i * 2 + 1)?.tickets ?? 0;
    const h = i * 2;
    const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
    return { label, val: a + b };
  });
  const max = Math.max(...slots.map((s) => s.val), 1);

  return (
    <div className="hg-panel" style={{ flex: 1, minWidth: 260 }}>
      <h3 style={{ margin: 0 }}>Peak Ticket Sales</h3>
      <p className="hg-sec-sub" style={{ margin: "2px 0 12px" }}>Today&apos;s ticket confirmations by time of day.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {slots.map((s, i) => {
          const op = Math.max(0.12, Math.min(1, s.val / max));
          return (
            <div
              key={i}
              style={{
                background: s.val === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--cyan) ${Math.round(op * 100)}%, var(--surface-2))`,
                border: "1.5px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 6px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-mute)" }}>{s.label}</span>
              <strong style={{ fontSize: 12, color: op > 0.6 ? "var(--ink)" : "var(--text)" }}>{s.val} tix</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RetentionWidget({ retention }: { retention: RetentionData }) {
  const returning = retention.returning_players;
  const fresh = retention.new_players;
  const total = returning + fresh;
  const returningPct = total > 0 ? Math.round((returning / total) * 100) : 0;
  const radius = 32;
  const stroke = 8;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (returningPct / 100) * circ;

  return (
    <div className="hg-panel" style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column" }}>
      <h3 style={{ margin: 0 }}>Player Retention</h3>
      <p className="hg-sec-sub" style={{ margin: "2px 0 12px" }}>New vs. returning buyers over the last 7 days (signed-in players only).</p>

      <div style={{ display: "flex", alignItems: "center", gap: 24, margin: "auto 0" }}>
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="transparent" stroke="var(--surface-2)" strokeWidth={stroke} />
            <circle
              cx="40" cy="40" r={radius} fill="transparent" stroke="var(--accent)" strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 40 40)"
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "600 13.5px var(--font-mono)" }}>
            <span>{returningPct}%</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flexGrow: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid var(--border)", paddingBottom: 4 }}>
            <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} /> Returning
            </span>
            <span style={{ font: "600 12px var(--font-mono)" }}>{returning} ({returningPct}%)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid var(--border)", paddingBottom: 4 }}>
            <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border-2)" }} /> New buyers
            </span>
            <span style={{ font: "600 12px var(--font-mono)" }}>{fresh} ({total > 0 ? 100 - returningPct : 0}%)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 2 }}>
            <span style={{ fontSize: 10, color: "var(--text-mute)" }}>Active this week:</span>
            <strong style={{ fontSize: 12 }}>{total} players</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
export function OverviewSection({ goSection }: { goSection: (s: string) => void }) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);

  useEffect(() => {
    apiFetch<OverviewStats>("/api/stats/overview").then(setStats).catch(() => {});
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => setGames(g.filter((x) => x.game_status !== "Completed")))
      .catch(() => {});
  }, []);

  return (
    <div className="hg-sec">
      <div className="hg-kpi-grid">
        <KpiCard label="Gross processed today" value={money(stats?.gross_revenue_today ?? 0)} tone="good" />
        <KpiCard label="Tickets sold today" value={(stats?.tickets_sold_today ?? 0).toLocaleString("en-IN")} />
        <KpiCard
          label="Active games"
          value={stats?.active_games ?? 0}
          sub={`${stats?.scheduled_games ?? 0} scheduled`}
        />
        <KpiCard
          label="Pending recharges"
          value={stats?.pending_topups ?? 0}
          sub="Awaiting approval"
          tone={stats && stats.pending_topups > 0 ? "alert" : undefined}
        />
      </div>
      <div className="hg-panel">
        <div className="hg-panel-head">
          <h3>Live &amp; upcoming games</h3>
          <Button variant="cta" size="sm" icon="grid" onClick={() => goSection("games")}>Create Game</Button>
        </div>
        {games.length === 0 ? (
          <EmptyHint icon="grid" title="No games yet" sub="Create the first game to open bookings." />
        ) : (
          <GamesTable games={games} />
        )}
      </div>
    </div>
  );
}

// ── Games management ─────────────────────────────────────────────────────────
export function GamesSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [managingVoice, setManagingVoice] = useState(false);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", scheduled_at: "", ticket_price: "100", total_tickets: "30" });
  const [prizes, setPrizes] = useState<PrizeState[]>(PATTERN_DEFAULTS);
  const [ruleModal, setRuleModal] = useState<{ title: string; desc: string } | null>(null);

  const resetForm = () => {
    setEditingGameId(null);
    setForm({ title: "", scheduled_at: "", ticket_price: "100", total_tickets: "30" });
    setPrizes(PATTERN_DEFAULTS);
  };

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => setGames(g.filter((x) => x.game_status !== "Completed")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (id: string, action: GameAction, speedValue?: number) => {
    setError(null);
    if (action === "edit") {
      const g = games.find((x) => x.game_id === id);
      if (!g) return;
      setEditingGameId(id);
      setForm({
        title: g.title,
        scheduled_at: toLocalInput(new Date(g.scheduled_at)),
        ticket_price: String(g.ticket_price),
        total_tickets: String(g.total_tickets),
      });
      setPrizes(PATTERN_DEFAULTS.map((pd) => {
        const existing = g.prize_pool.find((p) => dividendMatches(pd.pattern_name, p.pattern_name));
        return {
          pattern_name: pd.pattern_name,
          prize_amount: existing ? existing.prize_amount : pd.prize_amount,
          enabled: !!existing,
        };
      }));
      setManagingVoice(false);
      setCreating(true);
    } else if (action === "speed") {
      try {
        await apiFetch(`/api/games/${id}/speed`, {
          method: "POST",
          body: JSON.stringify({ interval_ms: speedValue! * 1000 }),
        });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Speed update failed");
      }
    } else if (action === "delete") {
      try {
        await apiFetch(`/api/games/${id}`, { method: "DELETE" });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    } else {
      try {
        await apiFetch(`/api/games/${id}/${action}`, { method: "POST" });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    }
  };

  const save = async () => {
    setError(null);
    const isSecondSelected = prizes.find((p) => p.pattern_name === "2nd Full House")?.enabled;
    const isThirdSelected = prizes.find((p) => p.pattern_name === "3rd Full House")?.enabled;

    // A lone "1st Full House" is just the classic Full House.
    const activePrizes = prizes
      .filter((p) => p.enabled)
      .map((p) => ({
        pattern_name:
          p.pattern_name === "1st Full House" && !isSecondSelected && !isThirdSelected
            ? "Full House"
            : p.pattern_name,
        prize_amount: p.prize_amount,
      }));

    if (activePrizes.length === 0) {
      setError("Select at least one dividend.");
      return;
    }

    const body = JSON.stringify({
      title: form.title.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      ticket_price: parseFloat(form.ticket_price),
      total_tickets: parseInt(form.total_tickets, 10),
      prizes: activePrizes,
    });

    try {
      if (editingGameId) {
        await apiFetch(`/api/games/${editingGameId}`, { method: "PATCH", body });
      } else {
        await apiFetch("/api/games", { method: "POST", body });
      }
      setCreating(false);
      resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const applyPreset = (p: GamePreset) => {
    setForm({
      title: p.name,
      scheduled_at: toLocalInput(nextSlotFor(p.hour, p.minute)),
      ticket_price: String(p.ticket_price),
      total_tickets: String(p.total_tickets),
    });
    setPrizes(PATTERN_DEFAULTS.map((pd) => {
      const amt = p.prizes[pd.pattern_name];
      return { ...pd, prize_amount: amt ?? pd.prize_amount, enabled: amt !== undefined };
    }));
  };

  const gross = parseFloat(form.ticket_price || "0") * parseInt(form.total_tickets || "0", 10);
  const pool = prizes.filter((p) => p.enabled).reduce((s, p) => s + p.prize_amount, 0);

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Schedule, edit, start, pause or resume any game.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" icon="volume" onClick={() => {
            setCreating(false);
            setManagingVoice((v) => !v);
          }}>
            {managingVoice ? "Back to Games" : "Voice & TTS Settings"}
          </Button>
          <Button variant="cta" size="sm" icon="grid" onClick={() => {
            setManagingVoice(false);
            if (creating) resetForm();
            setCreating((c) => !c);
          }}>
            {creating ? "Close" : "Create Game"}
          </Button>
        </div>
      </div>

      {managingVoice ? (
        <CallVoiceSettings />
      ) : (
        <>
          {creating && (
            <div className="hg-form">
              {!editingGameId && (
                <div className="hg-preset-row" role="group" aria-label="Game presets">
                  {GAME_PRESETS.map((p) => {
                    const slot = nextSlotFor(p.hour, p.minute);
                    return (
                      <button key={p.name} type="button" className="hg-preset-chip" onClick={() => applyPreset(p)}>
                        <span className="hg-preset-name">{p.name}</span>
                        <span className="hg-preset-when">
                          {slotLabel(slot)} · {money(p.ticket_price)} × {p.total_tickets}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="hg-form-row">
                <label className="hg-form-field">
                  <span>Housie game name</span>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Welcome Mega Draw" />
                </label>
                <label className="hg-form-field">
                  <span>Schedule date &amp; time</span>
                  <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
                </label>
                <label className="hg-form-field">
                  <span>No. of tickets</span>
                  <input type="number" min={1} value={form.total_tickets} onChange={(e) => setForm({ ...form, total_tickets: e.target.value })} />
                </label>
                <label className="hg-form-field">
                  <span>Price of each ticket (₹)</span>
                  <input type="number" min={1} value={form.ticket_price} onChange={(e) => setForm({ ...form, ticket_price: e.target.value })} />
                </label>
              </div>

              <div style={{ marginTop: 14 }}>
                <h4 style={{ margin: "0 0 10px", font: "700 11px var(--font-head)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                  Dividend list
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {DIVIDEND_METADATA.map((d, i) => {
                    const prizeState = prizes[i];
                    const isFirstFHEnabled = prizes.find((p) => p.pattern_name === "1st Full House")?.enabled;
                    const isSecondFHEnabled = prizes.find((p) => p.pattern_name === "2nd Full House")?.enabled;
                    const disabled =
                      (d.pattern === "2nd Full House" && !isFirstFHEnabled) ||
                      (d.pattern === "3rd Full House" && !isSecondFHEnabled);

                    return (
                      <div
                        key={d.pattern}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          padding: 14,
                          border: "2px solid",
                          background: prizeState.enabled ? "var(--surface-2)" : "var(--surface)",
                          borderColor: prizeState.enabled ? "var(--accent)" : "var(--border)",
                          boxShadow: prizeState.enabled ? "var(--card-shadow-sm)" : "none",
                          borderRadius: "var(--radius-sm)",
                          opacity: disabled ? 0.5 : 1,
                          transition: `border-color var(--dur-1) var(--ease-out-quart), background var(--dur-1) var(--ease-out-quart)`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, userSelect: "none", cursor: disabled ? "not-allowed" : "pointer", color: "var(--text)" }}>
                            <input
                              type="checkbox"
                              checked={prizeState.enabled}
                              disabled={disabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPrizes((prev) =>
                                  prev.map((x) => {
                                    if (x.pattern_name === d.pattern) return { ...x, enabled: checked };
                                    // FH tiers cascade: unchecking a tier drops the ones above it,
                                    // checking a tier pulls in the ones below it.
                                    if (d.pattern === "1st Full House" && !checked && (x.pattern_name === "2nd Full House" || x.pattern_name === "3rd Full House")) {
                                      return { ...x, enabled: false };
                                    }
                                    if (d.pattern === "2nd Full House" && !checked && x.pattern_name === "3rd Full House") {
                                      return { ...x, enabled: false };
                                    }
                                    if (d.pattern === "2nd Full House" && checked && x.pattern_name === "1st Full House") {
                                      return { ...x, enabled: true };
                                    }
                                    if (d.pattern === "3rd Full House" && checked && (x.pattern_name === "1st Full House" || x.pattern_name === "2nd Full House")) {
                                      return { ...x, enabled: true };
                                    }
                                    return x;
                                  })
                                );
                              }}
                              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: disabled ? "not-allowed" : "pointer" }}
                            />
                            <span>{d.name}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setRuleModal({ title: d.name, desc: d.desc })}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 10px",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                            }}
                          >
                            View Rule
                          </button>
                        </div>
                        {prizeState.enabled && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Prize (₹):</span>
                            <input
                              type="number"
                              min={1}
                              value={prizeState.prize_amount}
                              onChange={(e) =>
                                setPrizes((prev) => prev.map((x, j) => (j === i ? { ...x, prize_amount: parseInt(e.target.value, 10) || 0 } : x)))
                              }
                              style={{
                                width: 96,
                                padding: "4px 8px",
                                fontSize: 12,
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border-2)",
                                background: "var(--surface)",
                                fontFamily: "var(--font-mono)",
                                color: "var(--text)",
                                outline: "none",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="hg-sec-sub" style={{ marginTop: 10 }}>
                Projected collection: <strong>{money(gross)}</strong> · Overall prize pool: <strong>{money(pool)}</strong>
              </p>
              {pool > gross && (
                <p style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: "var(--danger)" }}>
                  ⚠️ The prize pool exceeds the projected collection!
                </p>
              )}

              <div className="hg-form-actions">
                <Button variant="ghost" size="sm" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
                <Button
                  variant="cta"
                  size="sm"
                  disabled={!form.title.trim() || !form.scheduled_at || pool > gross || pool <= 0}
                  onClick={save}
                >
                  {editingGameId ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="hg-sec-err" style={{ marginBottom: 10 }}>{error}</p>}

          {/* Live booking fill rates, merged in so games + fill live on one screen */}
          {games.length > 0 && (
            <div className="hg-panel" style={{ marginBottom: 20 }}>
              <div className="hg-panel-head">
                <h3>Live Booking Fill Rates</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, padding: "4px 0" }}>
                {games.map((g) => {
                  const pct = fillPct(g);
                  return (
                    <div key={g.game_id} className="hg-fill-card" style={{ margin: 0 }}>
                      <div className="hg-fill-top">
                        <strong>{g.title}</strong>
                        <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status}</span>
                      </div>
                      <div className="hg-fill-meta">
                        {gameTime(g)} · {g.sold_count + g.locked_count}/{g.total_tickets} tickets
                      </div>
                      <div className="hg-fill-bar"><i style={{ width: pct + "%" }} className={pct >= 80 ? "is-hot" : ""} /></div>
                      <div className="hg-fill-pct">{pct}% full</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="hg-panel">
            {games.length === 0 ? (
              <EmptyHint icon="grid" title="No games yet" sub="Create the first game to open bookings." />
            ) : (
              <GamesTable games={games} controls onAction={act} />
            )}
          </div>
        </>
      )}

      {ruleModal && (
        <div className="hg-modal-scrim" onClick={() => setRuleModal(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{ruleModal.title} rule</h3>
              <button
                onClick={() => setRuleModal(null)}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 0", fontSize: 14, lineHeight: 1.6 }}>{ruleModal.desc}</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="cta" size="sm" onClick={() => setRuleModal(null)}>Got it</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filling status (shared widget) ───────────────────────────────────────────
export function FillingSection() {
  const [games, setGames] = useState<GameSummary[]>([]);

  useEffect(() => {
    const load = () =>
      apiFetch<GameSummary[]>("/api/games")
        .then((g) => setGames(g.filter((x) => x.game_status !== "Completed")))
        .catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Real-time fill rate across all scheduled games.</p>
      {games.length === 0 && <EmptyHint icon="ticket" title="Nothing filling yet" sub="Scheduled games appear here with live fill rates." />}
      <div className="hg-fill-grid">
        {games.map((g) => {
          const pct = fillPct(g);
          return (
            <div key={g.game_id} className="hg-fill-card">
              <div className="hg-fill-top">
                <strong>{g.title}</strong>
                <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status}</span>
              </div>
              <div className="hg-fill-meta">
                {gameTime(g)} · {g.sold_count + g.locked_count}/{g.total_tickets} tickets
              </div>
              <div className="hg-fill-bar"><i style={{ width: pct + "%" }} className={pct >= 80 ? "is-hot" : ""} /></div>
              <div className="hg-fill-pct">{pct}% full</div>
              {(g.game_status === "Live" || g.game_status === "Paused") && (
                <a
                  href={`/game/${g.game_id}/live`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--accent)", fontSize: 12, fontWeight: 600 }}
                >
                  <Icon name="eye" size={14} /> Watch Live
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Workforce ────────────────────────────────────────────────────────────────
const ROLE_OPTIONS: [number, string][] = [[2, "Admin"], [3, "Operator"], [4, "Bookie"]];

export function WorkforceSection({ me }: { me: AuthUser }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", town: "", role_id: "4", password: "" });

  const load = useCallback(() => {
    apiFetch<StaffUser[]>("/api/users").then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const addStaff = async () => {
    setError(null);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          town: form.town.trim() || undefined,
          role_id: parseInt(form.role_id, 10),
          password: form.password,
        }),
      });
      setAdding(false);
      setForm({ full_name: "", email: "", phone: "", town: "", role_id: "4", password: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create user");
    }
  };

  const setStatus = async (u: StaffUser, status: "Active" | "Suspended") => {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.user_id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const makeFo = async (u: StaffUser) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.user_id}/cfo`, { method: "PATCH", body: JSON.stringify({ is_cfo: !u.is_cfo }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const removeStaff = async (u: StaffUser) => {
    setError(null);
    setConfirmDelId(null);
    try {
      await apiFetch(`/api/users/${u.user_id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const roleLabel = (u: StaffUser) => (u.role_name === "Agent" ? "Bookie" : u.role_name);

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Provision Admins, Operators and Bookies.</p>
        <Button variant="cta" size="sm" icon="users" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add Staff"}
        </Button>
      </div>

      {adding && (
        <div className="hg-form">
          <div className="hg-form-row">
            <label className="hg-form-field">
              <span>Full name</span>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Phone (WhatsApp)</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Town</span>
              <input value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Role</span>
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                {ROLE_OPTIONS.filter(([id]) => me.role_name === "Superadmin" || id > 2).map(([id, lbl]) => (
                  <option key={id} value={id}>{lbl}</option>
                ))}
              </select>
            </label>
            <label className="hg-form-field">
              <span>Temp password (min 8)</span>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
          </div>
          <div className="hg-form-actions">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="cta" size="sm"
              disabled={!form.full_name.trim() || !form.email.trim() || form.password.length < 8}
              onClick={addStaff}
            >
              Create account
            </Button>
          </div>
        </div>
      )}

      {error && <p className="hg-sec-err">{error}</p>}
      <div className="hg-panel">
        <div className="hg-table">
          <div className="hg-tr hg-tr-6 hg-tr-head">
            <span>Staff</span><span>Role</span><span>Town</span><span>Wallet</span><span>Status</span><span>Actions</span>
          </div>
          {users.map((u) => (
            <div key={u.user_id} className="hg-tr hg-tr-6">
              <span className="hg-td-name">
                <Avatar src={roleAvatar(u)} name={u.full_name} size={28} />{u.full_name}
                {u.is_cfo && <span className="hg-pill hg-pill-trusted">FO</span>}
              </span>
              <span className="hg-dim">{roleLabel(u)}</span>
              <span className="hg-dim">{u.town ?? "—"}</span>
              <span>{u.role_id === 4 ? money(u.current_balance) : "—"}</span>
              <span><span className={`hg-pill hg-pill-${u.status.toLowerCase()}`}>{u.status}</span></span>
              <span className="hg-row-ctrls">
                {u.user_id !== me.user_id && (
                  u.status === "Active" ? (
                    <button className="hg-ic-btn" title="Suspend" onClick={() => setStatus(u, "Suspended")}>
                      <Icon name="x" size={14} />
                    </button>
                  ) : (
                    <button className="hg-ic-btn" title="Reactivate" onClick={() => setStatus(u, "Active")}>
                      <Icon name="check" size={14} />
                    </button>
                  )
                )}
                {me.role_name === "Superadmin" && u.role_id === 2 && (
                  <button className="hg-ic-btn" title={u.is_cfo ? "Revoke Financial Officer" : "Make Financial Officer"} onClick={() => makeFo(u)}>
                    <Icon name="wallet" size={14} />
                  </button>
                )}
                {me.role_name === "Superadmin" && u.user_id !== me.user_id && (
                  confirmDelId === u.user_id ? (
                    <span className="hg-settle-wrap">
                      <button className="hg-settle-btn is-confirm" onClick={() => removeStaff(u)}>Delete</button>
                      <button className="hg-settle-cancel" aria-label="Cancel delete" onClick={() => setConfirmDelId(null)}>
                        <Icon name="x" size={14} strokeWidth={2.6} />
                      </button>
                    </span>
                  ) : (
                    <button className="hg-ic-btn" title="Delete account permanently" onClick={() => setConfirmDelId(u.user_id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
export function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    apiFetch<{ entries: AuditEntry[] }>("/api/audit?page=1&limit=50")
      .then((res) => setEntries(res.entries))
      .catch(() => {});
  }, []);

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Immutable record of every staff action.</p>
      <div className="hg-panel">
        {entries.length === 0 ? (
          <EmptyHint icon="shield" title="No entries yet" sub="Staff actions are recorded here as they happen." />
        ) : (
          <div className="hg-audit">
            {entries.map((a) => (
              <div key={a.log_id} className="hg-audit-row">
                <span className="hg-avatar-sm">{(a.user_name || "?")[0].toUpperCase()}</span>
                <div className="hg-audit-body">
                  <div><b>{a.user_name}</b> {a.action.replaceAll("_", " ").toLowerCase()}</div>
                  <span className="hg-dim">
                    {a.target_description ?? a.target_type ?? ""} · {a.ip_address ?? "—"} ·{" "}
                    {new Date(a.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Past games & results ─────────────────────────────────────────────────────
export function HistorySection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [drawnData, setDrawnData] = useState<{ drawn_numbers: number[]; current_index: number } | null>(null);
  const [loadingDrawn, setLoadingDrawn] = useState(false);

  useEffect(() => {
    // `loading` already inits true; setState only in the promise chain so this
    // mount effect stays clear of the React Compiler set-state-in-effect rule.
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => setGames(g.filter((x) => x.game_status === "Completed").reverse()))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const viewResults = async (game: GameSummary) => {
    setSelectedGame(game);
    setDrawnData(null);
    setLoadingDrawn(true);
    try {
      const drawn = await apiFetch<{ drawn_numbers: number[]; current_index: number }>(`/api/games/${game.game_id}/drawn`);
      setDrawnData(drawn);
    } catch {
      // leave drawnData null — the modal shows "No numbers were drawn."
    } finally {
      setLoadingDrawn(false);
    }
  };

  const completedAt = (g: GameSummary) =>
    new Date(g.completed_at ?? g.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">History and full results of completed games.</p>
      {loading ? (
        <div className="hg-panel" style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <span className="hg-poll-spin" />
        </div>
      ) : games.length === 0 ? (
        <EmptyHint icon="trophy" title="No completed games" sub="Finished games will show up here with their full results." />
      ) : (
        <div className="hg-panel">
          <div className="hg-table">
            <div className="hg-tr hg-tr-head">
              <span>Game name</span><span>Completed</span><span>Tickets sold</span><span>Revenue</span><span>Action</span>
            </div>
            {games.map((g) => (
              <div key={g.game_id} className="hg-tr">
                <span className="hg-td-name">{g.title}</span>
                <span className="hg-dim">{completedAt(g)}</span>
                <span>{g.sold_count} / {g.total_tickets}</span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>{money(g.sold_count * g.ticket_price)}</strong>
                <span>
                  <Button variant="ghost" size="sm" onClick={() => viewResults(g)}>View Results</Button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="hg-modal-scrim" onClick={() => setSelectedGame(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{selectedGame.title} results</h3>
              <button
                onClick={() => setSelectedGame(null)}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto", maxHeight: 400, paddingRight: 4, marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16, background: "var(--surface-2)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                <div>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>Ticket price</span>
                  <strong style={{ fontSize: 13 }}>{money(selectedGame.ticket_price)}</strong>
                </div>
                <div>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>Tickets sold</span>
                  <strong style={{ fontSize: 13 }}>{selectedGame.sold_count}</strong>
                </div>
                <div>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)" }}>Total collection</span>
                  <strong style={{ fontSize: 13, color: "var(--accent)" }}>{money(selectedGame.sold_count * selectedGame.ticket_price)}</strong>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, borderBottom: "1px solid var(--border-2)", paddingBottom: 4 }}>Dividends &amp; winners</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedGame.prize_pool.map((p) => (
                    <div key={p.prize_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: 8, border: "1px solid var(--border-2)", borderRadius: "var(--radius-sm)" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.pattern_name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Prize: {money(p.prize_amount)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {p.claimed ? (
                          <div>
                            <span className="hg-pill hg-pill-completed" style={{ marginBottom: 4, display: "inline-block" }}>Claimed</span>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{p.winner_housie_name}</div>
                            {p.split_count > 1 && (
                              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                                Split: {p.split_count} winners ({money(p.amount_per_winner || 0)} each)
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="hg-pill" style={{ background: "var(--border-2)", color: "var(--text-dim)" }}>Unclaimed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, borderBottom: "1px solid var(--border-2)", paddingBottom: 4 }}>Drawn numbers sequence</h4>
                {loadingDrawn ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <span className="hg-poll-spin" />
                  </div>
                ) : drawnData && drawnData.drawn_numbers.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {drawnData.drawn_numbers.map((num, i) => (
                      <div
                        key={i}
                        title={`Drawn #${i + 1}`}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "var(--accent-soft)",
                          color: "var(--text)",
                          border: "1px solid var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          font: "700 11px var(--font-mono)",
                        }}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>No numbers were drawn.</div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <Button variant="cta" size="sm" onClick={() => setSelectedGame(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
