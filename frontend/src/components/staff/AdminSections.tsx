"use client";
/** Admin/Superadmin staff sections: overview, games, filling, workforce, audit. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint, Avatar } from "@/components/ui";
import { roleAvatar } from "@/lib/roleAvatar";
import type { AuditEntry, GameSummary, StaffUser } from "@/lib/types";
import type { AuthUser } from "@/lib/stores/authStore";
import { getPresetClass } from "@/lib/presetHelper";
import { useSocket } from "@/lib/hooks/useSocket";

const DIVIDEND_METADATA = [
  { name: "1st Full House", pattern: "1st Full House", defaultAmount: 2000, desc: "The first ticket where all 15 numbers are marked. (Automatically becomes 'Full House' if 2nd and 3rd are not selected)." },
  { name: "2nd Full House", pattern: "2nd Full House", defaultAmount: 1500, desc: "The second ticket where all 15 numbers are marked." },
  { name: "3rd Full House", pattern: "3rd Full House", defaultAmount: 1000, desc: "The third ticket where all 15 numbers are marked." },
  { name: "Top Line", pattern: "Top Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the first row." },
  { name: "Middle Line", pattern: "Middle Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the second row." },
  { name: "Bottom Line", pattern: "Bottom Line", defaultAmount: 1000, desc: "The first ticket containing full markings (all 5 numbers) in the third row." },
  { name: "Corner", pattern: "Corner", defaultAmount: 500, desc: "The first ticket where all four corner numbers are marked (the first and last non-null numbers in the first and third rows)." },
  { name: "Star", pattern: "Star", defaultAmount: 1000, desc: "The ticket where all four corner numbers and the center number are marked (the center number is the third non-null number in the second row)." },
  { name: "Early 5", pattern: "Early Five", defaultAmount: 500, desc: "The first ticket where any 5 numbers are marked." },
  { name: "Quick 7", pattern: "Quick 7", defaultAmount: 500, desc: "The first ticket where any 7 numbers are marked." },
  { name: "Box Bonus", pattern: "Box Bonus", defaultAmount: 500, desc: "The first ticket that contains at least two marked numbers in each of the three rows." }
];

const PATTERN_DEFAULTS = DIVIDEND_METADATA.map(d => ({
  pattern_name: d.pattern,
  prize_amount: d.defaultAmount,
  enabled: true
}));

const GAME_PRESETS = [
  {
    name: "High Noon Fortune",
    tickets: "30",
    price: "100",
    timeHour: 12,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 }
  },
  {
    name: "Snack & Stack",
    tickets: "30",
    price: "100",
    timeHour: 15,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 }
  },
  {
    name: "Sundown Showdown",
    tickets: "30",
    price: "100",
    timeHour: 18,
    prizes: { "1st Full House": 1200, "Top Line": 300, "Middle Line": 300, "Bottom Line": 300, "Corner": 200, "Quick 7": 200 }
  },
  {
    name: "Prime Time",
    tickets: "60",
    price: "100",
    timeHour: 21,
    prizes: { "1st Full House": 2000, "2nd Full House": 1000, "Top Line": 500, "Middle Line": 500, "Bottom Line": 500, "Corner": 300, "Quick 7": 300 }
  }
];

function getNextAvailableSlot(hour: number, minute: number = 0): string {
  const now = new Date();
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  
  if (now.getTime() >= d.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillPct(g: GameSummary): number {
  return Math.round(((g.sold_count + g.locked_count) / g.total_tickets) * 100);
}

function gameTime(g: GameSummary): string {
  const d = new Date(g.scheduled_at);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

// ── Games table with start/pause/resume controls ─────────────────────────────
function GamesTable({ games, controls, onAction, onCompletedClick, canManage }: {
  games: GameSummary[];
  controls?: boolean;
  onAction?: (id: string, action: "start" | "pause" | "resume" | "edit" | "delete" | "speed", speedValue?: number) => void;
  onCompletedClick?: (game: GameSummary) => void;
  onViewTickets?: (id: string) => void;
  onManualBook?: (id: string) => void;
  canManage?: boolean;
}) {
  const rowClass = controls ? "hg-tr hg-tr-games" : "hg-tr hg-tr-6";

  return (
    <div className="hg-table">
      <div className={`${rowClass} hg-tr-head`}>
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
        const expMargin = (g.sold_count * g.ticket_price) - prizeTotal;
        const playerCount = g.player_count !== undefined ? g.player_count : (g.sold_count > 0 ? Math.round(g.sold_count * 0.8) + 1 : 0);
        const isCompleted = g.game_status === "Completed";

        return (
          <div 
            key={g.game_id} 
            className={rowClass}
            onClick={() => {
              if (isCompleted && onCompletedClick) {
                onCompletedClick(g);
              }
            }}
            style={isCompleted ? { cursor: "pointer", background: "rgba(255, 255, 255, 0.02)", transition: "background 0.2s" } : {}}
          >
            <span className="hg-td-name" style={isCompleted ? { textDecoration: "underline", color: "var(--cyan)" } : {}}>
              {g.title}
              <span style={{ marginLeft: "6px", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--accent)" }}>
                {g.call_mode === "Audio" ? "Audio" : "TTS"}
              </span>
            </span>
            <span className="hg-dim">{gameTime(g)}</span>
            <span className="hg-td-fill">
              <i className="hg-mini-bar"><b style={{ width: pct + "%" }} /></i>{pct}%
            </span>
            <span style={{ color: expMargin >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
              {money(expMargin)}
            </span>
            <span className="hg-dim">{playerCount}</span>
            <span><span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status.replace("_", " ")}</span></span>
            {controls && (
              <span className="hg-row-ctrls" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
                {g.game_status === "Scheduled" && (
                  <button className="hg-ic-btn" title="Start" onClick={(e) => { e.stopPropagation(); onAction?.(g.game_id, "start"); }}>
                    <Icon name="play" size={14} />
                  </button>
                )}
                {g.game_status === "Live" && (
                  <button className="hg-ic-btn" title="Pause" onClick={(e) => { e.stopPropagation(); onAction?.(g.game_id, "pause"); }}>
                    <Icon name="pause" size={14} />
                  </button>
                )}
                {g.game_status === "Paused" && (
                  <button className="hg-ic-btn" title="Resume" onClick={(e) => { e.stopPropagation(); onAction?.(g.game_id, "resume"); }}>
                    <Icon name="play" size={14} />
                  </button>
                )}
                {(g.game_status === "Live" || g.game_status === "Paused") && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "var(--surface-2)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border-2)" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Pace:</span>
                      <select
                        defaultValue="8"
                        onChange={(e) => onAction?.(g.game_id, "speed", parseInt(e.target.value, 10))}
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: "none", border: "none", fontSize: "10px", fontWeight: "bold", outline: "none", color: "var(--brand)", cursor: "pointer", padding: 0 }}
                      >
                        {[5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                          <option key={s} value={s} style={{ background: "var(--surface)", color: "var(--text)" }}>{s}s</option>
                        ))}
                      </select>
                    </div>
                    <a href={`/game/${g.game_id}/live`} target="_blank" rel="noopener noreferrer" className="hg-ic-btn" title="Watch Live" style={{ color: "var(--brand)" }} onClick={(e) => e.stopPropagation()}>
                      <Icon name="eye" size={14} />
                    </a>
                  </>
                )}
                {g.game_status === "Scheduled" && canManage && (
                  <button className="hg-ic-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onAction?.(g.game_id, "edit"); }}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
                {g.game_status !== "Live" && g.game_status !== "Paused" && canManage && (
                  <button className="hg-ic-btn" title="Delete" style={{ color: "var(--danger)" }} onClick={(e) => { e.stopPropagation(); onAction?.(g.game_id, "delete"); }}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
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
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0 ${height} L ${points} L ${width} ${height} Z`} fill={`url(#grad-${color})`} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export function EnhancedKpiCard({
  label,
  value,
  sub,
  delta,
  trendData,
  trendColor,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: { value: string; isPositive: boolean };
  trendData?: number[];
  trendColor?: string;
  tone?: "good" | "alert";
}) {
  return (
    <div
      className={`hg-kpi${tone ? " hg-kpi-" + tone : ""}`}
      style={{
        position: "relative",
        overflow: "hidden",
        paddingBottom: trendData ? "42px" : "16px",
      }}
    >
      <span className="hg-kpi-label">{label}</span>
      <b className="hg-kpi-value" style={{ zIndex: 2, position: "relative" }}>
        {value}
      </b>
      {delta && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "4px",
            zIndex: 2,
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: delta.isPositive ? "var(--success)" : "var(--danger)",
            }}
          >
            {delta.isPositive ? "▲" : "▼"} {delta.value}
          </span>
          <span className="text-[10px] text-mute">vs yesterday</span>
        </div>
      )}
      {sub && (
        <span className="hg-kpi-sub" style={{ zIndex: 2, position: "relative" }}>
          {sub}
        </span>
      )}
      {trendData && <Sparkline data={trendData} color={trendColor || "var(--accent)"} />}
    </div>
  );
}

type ChartSource = "margin" | "volume" | "engagement";

export interface PerformanceSeries {
  days: string[];
  revenue: number[];
  payouts: number[];
  net: number[];
  volume: number[];
  dau: number[];
  mau: number[];
}

const EMPTY_SERIES: PerformanceSeries = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  revenue: [0, 0, 0, 0, 0, 0, 0],
  payouts: [0, 0, 0, 0, 0, 0, 0],
  net: [0, 0, 0, 0, 0, 0, 0],
  volume: [0, 0, 0, 0, 0, 0, 0],
  dau: [0, 0, 0, 0, 0, 0, 0],
  mau: [0, 0, 0, 0, 0, 0, 0],
};

export function AnalyticsChart({ series }: { series?: PerformanceSeries | null }) {
  const [source, setSource] = useState<ChartSource>("margin");

  const data = series ?? EMPTY_SERIES;
  const days = data.days;
  const marginData = { revenue: data.revenue, payouts: data.payouts, net: data.net };
  const volumeData = data.volume;
  const engagementData = { dau: data.dau, mau: data.mau };

  const getPathPoints = (data: number[], w: number, h: number, maxVal: number) => {
    return data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * w;
      const y = h - (val / maxVal) * h;
      return { x, y };
    });
  };

  const width = 600;
  const height = 140;
  let maxVal = 10;
  let paths: { points: { x: number; y: number }[]; color: string; label: string }[] = [];

  if (source === "margin") {
    maxVal = Math.max(1, Math.max(...marginData.revenue) * 1.15);
    paths = [
      { points: getPathPoints(marginData.revenue, width, height, maxVal), color: "var(--cyan)", label: "Gross Revenue" },
      { points: getPathPoints(marginData.payouts, width, height, maxVal), color: "var(--danger)", label: "Total Payouts" },
      { points: getPathPoints(marginData.net, width, height, maxVal), color: "var(--success)", label: "Net Profit" },
    ];
  } else if (source === "volume") {
    maxVal = Math.max(1, Math.max(...volumeData) * 1.15);
    paths = [
      { points: getPathPoints(volumeData, width, height, maxVal), color: "var(--accent)", label: "Ticket Sales Volume" },
    ];
  } else {
    maxVal = Math.max(1, Math.max(...engagementData.mau) * 1.15);
    paths = [
      { points: getPathPoints(engagementData.dau, width, height, maxVal), color: "var(--accent)", label: "Daily Active (DAU)" },
      { points: getPathPoints(engagementData.mau, width, height, maxVal), color: "var(--cyan)", label: "Monthly Active (MAU)" },
    ];
  }

  return (
    <div className="hg-panel" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Platform Performance Charts</h3>
          <p className="text-xs text-mute mt-0.5">Performance indices and operational margins over the last 7 days.</p>
        </div>
        <div style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
          {(["margin", "volume", "engagement"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSource(t)}
              style={{
                background: source === t ? "var(--surface)" : "none",
                color: source === t ? "var(--text)" : "var(--text-dim)",
                border: "none",
                outline: "none",
                boxShadow: "none",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                margin: 0,
                whiteSpace: "nowrap",
                display: "inline-block"
              }}
            >
              {t === "margin" ? "Profit Margin" : t === "volume" ? "Volume" : "Engagement"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: `${height}px`, position: "relative", marginTop: "10px" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          {[0.25, 0.5, 0.75, 1].map((p, i) => (
            <line
              key={i}
              x1="0"
              y1={height * (1 - p)}
              x2={width}
              y2={height * (1 - p)}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="4,4"
            />
          ))}
          {paths.map((p, i) => {
            const pStr = p.points.map((pt) => `${pt.x},${pt.y}`).join(" L ");
            return (
              <g key={i}>
                <defs>
                  <linearGradient id={`chart-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.color} stopOpacity="0.12" />
                    <stop offset="100%" stopColor={p.color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`M 0 ${height} L ${pStr} L ${width} ${height} Z`} fill={`url(#chart-grad-${i})`} />
                <path d={`M ${pStr}`} fill="none" stroke={p.color} strokeWidth="2" style={{ transition: "d 0.3s" }} />
                {p.points.map((pt, j) => (
                  <circle key={j} cx={pt.x} cy={pt.y} r="3.5" fill="var(--bg)" stroke={p.color} strokeWidth="1.5" />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {days.map((d, i) => (
          <span key={i} className="text-[10px] text-mute font-bold" style={{ width: `${100 / days.length}%`, textAlign: "center" }}>
            {d}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "4px" }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: p.color }} />
            <span className="text-[11px] font-semibold text-text-dim">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface HeatmapHour {
  label: string;
  value: number;
}

const EMPTY_HEATMAP: HeatmapHour[] = [
  "12 AM", "2 AM", "4 AM", "6 AM", "8 AM", "10 AM",
  "12 PM", "2 PM", "4 PM", "6 PM", "8 PM", "10 PM",
].map((label) => ({ label, value: 0 }));

export function HeatmapWidget({ hours }: { hours?: HeatmapHour[] | null }) {
  const data = hours ?? EMPTY_HEATMAP;
  const peak = Math.max(1, ...data.map((h) => h.value));

  const getOpacity = (val: number) => {
    return val === 0 ? 0.12 : Math.max(0.12, Math.min(1.0, val / peak));
  };

  return (
    <div className="hg-panel" style={{ flex: 1, minWidth: "260px", padding: "16px 20px" }}>
      <h3 className="text-sm font-semibold mb-1">Peak Ticket Sales Heatmap</h3>
      <p className="text-xs text-mute mb-4">Optimized game scheduling hours based on today&apos;s traffic.</p>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginTop: "12px" }}>
        {data.map((h, i) => {
          const op = getOpacity(h.value);
          return (
            <div 
              key={i} 
              style={{
                background: `color-mix(in srgb, var(--cyan) ${Math.round(op * 100)}%, var(--surface-2))`,
                border: "1.5px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 6px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: "2px"
              }}
            >
              <span className="text-[9px] text-mute font-bold">{h.label}</span>
              <strong style={{ fontSize: "12px", color: op > 0.6 ? "#fff" : "var(--text)" }}>{h.value} tix</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface RetentionData {
  returning: number;
  new_signups: number;
  total: number;
}

export function RetentionWidget({ retention }: { retention?: RetentionData | null }) {
  const returning = retention?.returning ?? 0;
  const newSignups = retention?.new_signups ?? 0;
  const total = retention?.total ?? 0;
  const returningPct = total > 0 ? Math.round((returning / total) * 100) : 0;
  const radius = 32;
  const stroke = 8;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (returningPct / 100) * circ;

  return (
    <div className="hg-panel" style={{ flex: 1, minWidth: "260px", display: "flex", flexDirection: "column", padding: "16px 20px" }}>
      <h3 className="text-sm font-semibold mb-1">User Retention Tracker</h3>
      <p className="text-xs text-mute mb-4">Ratio of new vs. returning users active on the platform today.</p>

      <div style={{ display: "flex", alignItems: "center", gap: "24px", margin: "auto 0" }}>
        <div style={{ position: "relative", width: "80px", height: "80px", flexShrink: 0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="transparent" stroke="var(--surface-2)" strokeWidth={stroke} />
            <circle 
              cx="40" 
              cy="40" 
              r={radius} 
              fill="transparent" 
              stroke="var(--accent)" 
              strokeWidth={stroke}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", font: "600 13.5px var(--font-mono)" }}>
            <span>{returningPct}%</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", flexGrow: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px" }}>
            <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
              <i style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} /> Returning Users
            </span>
            <span className="font-mono text-xs font-semibold">{returning} ({returningPct}%)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px" }}>
            <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
              <i style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--surface-2)" }} /> New Signups
            </span>
            <span className="font-mono text-xs font-semibold">{newSignups} ({total > 0 ? 100 - returningPct : 0}%)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "2px" }}>
            <span className="text-[10px] text-mute">Total Active Today:</span>
            <strong className="text-xs">{total} users</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverviewSection({ goSection }: { goSection: (s: string) => void }) {
  useEffect(() => {
    goSection("finance");
  }, [goSection]);

  return (
    <div className="hg-sec flex items-center justify-center min-h-[40vh]">
      <span className="hg-poll-spin" />
    </div>
  );
}

function formatDateForLocalInput(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Games management ─────────────────────────────────────────────────────────
export function GamesSection({ me }: { me: AuthUser }) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [pastGames, setPastGames] = useState<GameSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prizes, setPrizes] = useState(PATTERN_DEFAULTS);
  const [ruleModal, setRuleModal] = useState<{ title: string; desc: string } | null>(null);
  const [salesGameId, setSalesGameId] = useState<string | null>(null);
  const [bookingGameId, setBookingGameId] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; scheduled_at: string; ticket_price: string; total_tickets: string; call_mode: "TTS" | "Audio" }>({
    title: "", scheduled_at: "", ticket_price: "50", total_tickets: "120", call_mode: "Audio"
  });

  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [drawnData, setDrawnData] = useState<{ drawn_numbers: number[]; current_index: number } | null>(null);
  const [loadingDrawn, setLoadingDrawn] = useState(false);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        setGames(g.filter((x) => x.game_status !== "Completed"));
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        setPastGames(g.filter((x) => {
          if (x.game_status !== "Completed") return false;
          const date = new Date(x.completed_at || x.scheduled_at);
          return date >= threeDaysAgo;
        }));
      })
      .catch(() => {});
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
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useSocket((event) => {
    if (event === "game_list_update" || event === "ticket_status_change") {
      load();
    }
  });

  const act = async (id: string, action: "start" | "pause" | "resume" | "edit" | "delete" | "speed", speedValue?: number) => {
    setError(null);
    if (action === "edit") {
      const g = games.find((x) => x.game_id === id);
      if (!g) return;
      setEditingGameId(id);
      setForm({
        title: g.title,
        scheduled_at: formatDateForLocalInput(g.scheduled_at),
        ticket_price: String(g.ticket_price),
        total_tickets: String(g.total_tickets),
        call_mode: g.call_mode === "TTS" ? "TTS" : "Audio",
      });
      setPrizes(PATTERN_DEFAULTS.map((pd) => {
        const matchingPrize = g.prize_pool.find((p) => p.pattern_name === pd.pattern_name || (pd.pattern_name === "1st Full House" && p.pattern_name === "Full House"));
        return {
          pattern_name: pd.pattern_name,
          prize_amount: matchingPrize ? matchingPrize.prize_amount : pd.prize_amount,
          enabled: !!matchingPrize,
        };
      }));
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
      if (!window.confirm("Are you sure you want to delete this game?")) return;
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

  const create = async () => {
    setError(null);
    const isSecondSelected = prizes.find((p) => p.pattern_name === "2nd Full House")?.enabled;
    const isThirdSelected = prizes.find((p) => p.pattern_name === "3rd Full House")?.enabled;

    const activePrizes = prizes
      .filter((p) => p.enabled)
      .map((p) => {
        let pattern_name = p.pattern_name;
        if (p.pattern_name === "1st Full House") {
          if (!isSecondSelected && !isThirdSelected) {
            pattern_name = "Full House";
          }
        }
        return { pattern_name, prize_amount: p.prize_amount };
      });

    if (activePrizes.length === 0) {
      setError("Please select at least one dividend.");
      return;
    }

    try {
      if (editingGameId) {
        await apiFetch(`/api/games/${editingGameId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: form.title.trim(),
            scheduled_at: new Date(form.scheduled_at).toISOString(),
            ticket_price: parseFloat(form.ticket_price),
            total_tickets: parseInt(form.total_tickets, 10),
            prizes: activePrizes,
            call_mode: form.call_mode,
          }),
        });
      } else {
        await apiFetch("/api/games", {
          method: "POST",
          body: JSON.stringify({
            title: form.title.trim(),
            scheduled_at: new Date(form.scheduled_at).toISOString(),
            ticket_price: parseFloat(form.ticket_price),
            total_tickets: parseInt(form.total_tickets, 10),
            prizes: activePrizes,
            call_mode: form.call_mode,
          }),
        });
      }
      setCreating(false);
      setEditingGameId(null);
      setForm({ title: "", scheduled_at: "", ticket_price: "50", total_tickets: "120", call_mode: "Audio" });
      setPrizes(PATTERN_DEFAULTS);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const gross = parseFloat(form.ticket_price || "0") * parseInt(form.total_tickets || "0", 10);
  const pool = prizes.filter(p => p.enabled).reduce((s, p) => s + p.prize_amount, 0);

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <div>
          <h2 className="hg-sec-title">Games &amp; Draw Management</h2>
          {me.role_name === "Operator" ? (
            <p className="hg-sec-sub">Start, pause, edit and delete games</p>
          ) : (me.role_name === "Superadmin" || me.role_name === "Financial Admin") ? (
            <p className="hg-sec-sub">Schedule, start, pause or resume any game.</p>
          ) : (
            <p className="hg-sec-sub">Monitor live ticket sales, booking fill rates, and past game draws.</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {(me.role_name === "Superadmin" || me.role_name === "Financial Admin") && (
            <Button variant="cta" size="sm" icon="grid" onClick={() => {
              if (creating) {
                setEditingGameId(null);
                setForm({ title: "", scheduled_at: "", ticket_price: "50", total_tickets: "120", call_mode: "Audio" });
                setPrizes(PATTERN_DEFAULTS);
              }
              setCreating(!creating);
            }}>
              {creating ? "Close" : "Create Game"}
            </Button>
          )}
        </div>
      </div>

      <>
          {creating && (
            <div className="hg-form">
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
            <span className="hg-dim" style={{ fontSize: "14px", fontWeight: 600, marginRight: "4px" }}>Auto-Fill Presets:</span>
            {GAME_PRESETS.map((p) => {
              const isActive = form.title === p.name;
              return (
                <Button 
                  key={p.name} 
                  variant={isActive ? "cta" : "ghost"} 
                  size="sm" 
                  style={isActive ? { boxShadow: "0 0 12px var(--brand)", borderColor: "var(--brand)" } : {}}
                  onClick={() => {
                    setForm({ ...form, title: p.name, total_tickets: p.tickets, ticket_price: p.price, scheduled_at: getNextAvailableSlot(p.timeHour, 0) });
                    setPrizes(PATTERN_DEFAULTS.map(pd => {
                      const presetAmount = p.prizes[pd.pattern_name as keyof typeof p.prizes];
                      return {
                        ...pd,
                        prize_amount: presetAmount || pd.prize_amount,
                        enabled: presetAmount !== undefined
                      };
                    }));
                  }}
                >
                  {p.name}
                </Button>
              );
            })}
          </div>

          <div className="hg-form-row">
            <label className="hg-form-field">
              <span>Housie Game Name</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Welcome Mega Draw" />
            </label>
            <label className="hg-form-field">
              <span>Schedule Date and Time</span>
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
            <label className="hg-form-field">
              <span>Number Calling Style</span>
              <select
                value={form.call_mode}
                onChange={(e) => setForm({ ...form, call_mode: e.target.value as "TTS" | "Audio" })}
                style={{
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--border-2)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  fontSize: "13px",
                }}
              >
                <option value="TTS">Text-to-Speech (TTS)</option>
                <option value="Audio">Pre-recorded Audio</option>
              </select>
            </label>
          </div>

          <div className="mt-4 mb-2">
            <h4 className="font-bold text-sm mb-2 text-dim" style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>Dividend List</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
              {DIVIDEND_METADATA.map((d, i) => {
                const prizeState = prizes[i];
                const isFirstFHEnabled = prizes.find((p) => p.pattern_name === "1st Full House")?.enabled;
                const isSecondFHEnabled = prizes.find((p) => p.pattern_name === "2nd Full House")?.enabled;

                let disabled = false;
                if (d.pattern === "2nd Full House" && !isFirstFHEnabled) {
                  disabled = true;
                }
                if (d.pattern === "3rd Full House" && !isSecondFHEnabled) {
                  disabled = true;
                }

                return (
                  <div
                    key={d.pattern}
                    className="hg-prize-card-select p-4 flex flex-col justify-between border-2 rounded-xl transition-all"
                    style={{
                      borderStyle: "solid",
                      background: prizeState.enabled ? "var(--surface-2)" : "var(--surface)",
                      borderColor: prizeState.enabled ? "var(--accent)" : "var(--border)",
                      boxShadow: prizeState.enabled ? "var(--card-shadow-sm)" : "none",
                      borderRadius: "var(--radius-sm)",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <label 
                        className={`flex items-center gap-2 font-bold select-none text-sm ${disabled ? "cursor-not-allowed text-mute" : "cursor-pointer text-text"}`} 
                        style={{ color: "var(--text)" }}
                      >
                        <input
                          type="checkbox"
                          checked={prizeState.enabled}
                          disabled={disabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPrizes((prev) => {
                              return prev.map((x) => {
                                if (x.pattern_name === d.pattern) {
                                  return { ...x, enabled: checked };
                                }
                                // If unchecking 1st FH, also uncheck 2nd and 3rd
                                if (d.pattern === "1st Full House" && !checked) {
                                  if (x.pattern_name === "2nd Full House" || x.pattern_name === "3rd Full House") {
                                    return { ...x, enabled: false };
                                  }
                                }
                                // If unchecking 2nd FH, also uncheck 3rd
                                if (d.pattern === "2nd Full House" && !checked) {
                                  if (x.pattern_name === "3rd Full House") {
                                    return { ...x, enabled: false };
                                  }
                                }
                                // If checking 2nd FH, automatically check 1st FH
                                if (d.pattern === "2nd Full House" && checked) {
                                  if (x.pattern_name === "1st Full House") {
                                    return { ...x, enabled: true };
                                  }
                                }
                                // If checking 3rd FH, automatically check 1st and 2nd FH
                                if (d.pattern === "3rd Full House" && checked) {
                                  if (x.pattern_name === "1st Full House" || x.pattern_name === "2nd Full House") {
                                    return { ...x, enabled: true };
                                  }
                                }
                                return x;
                              });
                            });
                          }}
                          className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span>{d.name}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setRuleModal({ title: d.name, desc: d.desc })}
                        className="text-xs font-semibold px-2.5 py-1 rounded bg-surface hover:bg-surface-2 border border-border text-dim transition-colors"
                        style={{ borderRadius: "var(--radius-sm)", color: "var(--text-dim)" }}
                      >
                        View Rule
                      </button>
                    </div>
                    {prizeState.enabled && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-dim">Prize (₹):</span>
                        <input
                          type="number"
                          min={1}
                          value={prizeState.prize_amount}
                          onChange={(e) =>
                            setPrizes((prev) => prev.map((x, j) => (j === i ? { ...x, prize_amount: parseInt(e.target.value, 10) || 0 } : x)))
                          }
                          className="w-24 px-2 py-1 text-xs border rounded outline-none bg-surface"
                          style={{
                            borderRadius: "var(--radius-sm)",
                            borderColor: "var(--border-2)",
                            fontFamily: "var(--font-mono)",
                            color: "var(--text)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="hg-sec-sub mt-2" style={{ color: "var(--text-dim)" }}>
            Projected Collection: <strong>{money(gross)}</strong> | Overall Prize Pool: <strong>{money(pool)}</strong>
          </p>
          {pool > gross && (
            <p className="text-xs font-semibold mt-1" style={{ color: "var(--danger)" }}>⚠️ Warning: Overall prize pool exceeds projected collection!</p>
          )}

          <div className="hg-form-actions">
            <Button variant="ghost" size="sm" onClick={() => {
              setCreating(false);
              setEditingGameId(null);
              setForm({ title: "", scheduled_at: "", ticket_price: "50", total_tickets: "120", call_mode: "Audio" });
              setPrizes(PATTERN_DEFAULTS);
            }}>Cancel</Button>
            <Button
              variant="cta"
              size="sm"
              disabled={!form.title.trim() || !form.scheduled_at || pool > gross || pool <= 0}
              onClick={create}
            >
              {editingGameId ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="hg-sec-err" style={{ marginBottom: '10px' }}>{error}</p>}
      {/* Live Booking Fill Rates panel (merged from FillingSection) */}
      {games.length > 0 && (
        <div className="hg-panel" style={{ marginBottom: "20px" }}>
          <div className="hg-panel-head">
            <h3>Live Booking Fill Rates</h3>
          </div>
          <div className="hg-fill-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", padding: "4px 0" }}>
            {games.map((g) => {
              const pct = fillPct(g);
              const presetClass = getPresetClass(g.title);
              return (
                <div key={g.game_id} className={`hg-fill-card${presetClass ? " " + presetClass : ""}`} style={{ margin: 0 }}>
                  <div className="hg-fill-top">
                    <strong>{g.title}</strong>
                    <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status.replace("_", " ")}</span>
                  </div>
                  <div className="hg-fill-meta">
                    {gameTime(g)} · {g.sold_count + g.locked_count}/{g.total_tickets} tickets
                  </div>
                  <div className="hg-fill-bar"><i style={{ width: pct + "%" }} className={pct >= 80 ? "is-hot" : ""} /></div>
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
                    {g.game_status !== "Completed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="users"
                        full
                        onClick={() => setBookingGameId(g.game_id)}
                      >
                        Book Ticket
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="hg-panel hg-table-premium">
        {games.length === 0 ? (
          <EmptyHint icon="grid" title="No games yet" sub="Create the first game to open bookings." />
        ) : (
          <GamesTable games={games} controls={true} onAction={act} onViewTickets={setSalesGameId} onManualBook={setBookingGameId} canManage={me.role_name === "Superadmin" || me.role_name === "Financial Admin" || me.role_name === "Operator"} />
        )}
      </div>

      {/* Past Games Panel */}
      <div className="hg-panel hg-table-premium" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head">
          <h3>Past Games (Last 3 Days)</h3>
        </div>
        {pastGames.length === 0 ? (
          <EmptyHint icon="trophy" title="No completed games" sub="Finished games in the last 3 days will show up here." />
        ) : (
          <div className="hg-table">
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
                  <span className="hg-row-ctrls" style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <Button variant="ghost" size="sm" onClick={() => viewResults(g)}>View Results</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSalesGameId(g.game_id)}>View Tickets</Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>

      {ruleModal && (
        <div className="hg-modal-scrim" onClick={() => setRuleModal(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)" }}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{ruleModal.title} Rule</h3>
              <button 
                onClick={() => setRuleModal(null)} 
                className="text-lg hover:text-accent font-bold"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "var(--text)" }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "16px 0", fontSize: "14px", lineHeight: "1.6" }}>
              {ruleModal.desc}
            </div>
            <div className="flex justify-end mt-2">
              <Button variant="cta" size="sm" onClick={() => setRuleModal(null)}>Got it</Button>
            </div>
          </div>
        </div>
      )}
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

// ── Ticket Sales details Modal ───────────────────────────────────────────────
export function TicketSalesModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const [data, setData] = useState<{
    title: string;
    tickets: Array<{
      ticket_number: number;
      status: string;
      owner_housie_name: string;
      bookie_username: string;
      bookie_name: string;
      bookie_role?: string;
    }>;
    agents: Array<{
      bookie_username: string;
      bookie_name: string;
      bookie_role?: string;
      total_sold: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tickets" | "agents">("tickets");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Mount/param fetch: sets the loading flag then resolves async — the effect
    // fetch the set-state-in-effect rule over-flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch<NonNullable<typeof data>>(`/api/games/${gameId}/sales-details?_=${Date.now()}`)
      .then((res) => setData(res))
      .catch((err) => console.error("Failed to load sales details:", err))
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) {
    return (
      <div className="hg-modal-scrim" onClick={onClose}>
        <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: "600px", display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <span className="hg-poll-spin" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Filter logic
  const query = searchQuery.trim().toLowerCase();
  const filteredTickets = data.tickets.filter((t) => {
    if (!query) return true;
    return (
      t.ticket_number.toString().includes(query) ||
      t.owner_housie_name.toLowerCase().includes(query) ||
      t.bookie_username.toLowerCase().includes(query) ||
      t.bookie_name.toLowerCase().includes(query) ||
      (t.bookie_role || '').toLowerCase().includes(query)
    );
  });

  const filteredAgents = data.agents.filter((a) => {
    if (!query) return true;
    return (
      a.bookie_username.toLowerCase().includes(query) ||
      a.bookie_name.toLowerCase().includes(query)
    );
  });

  return (
    <div className="hg-modal-scrim" onClick={onClose}>
      <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: "680px", background: "var(--surface)", color: "var(--text)" }}>
        
        {/* Header */}
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{data.title} Sales Info</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Detailed ticket bookings audit logs</span>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "var(--text-dim)", padding: 4 }}
          >
            &times;
          </button>
        </div>

        {/* Search & Tabs */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 10, background: "rgba(0,0,0,0.15)", padding: 4, borderRadius: 30, width: "fit-content" }}>
            <button
              onClick={() => setActiveTab("tickets")}
              style={{
                border: "none",
                background: activeTab === "tickets" ? "var(--brand)" : "transparent",
                color: activeTab === "tickets" ? "var(--accent-ink)" : "var(--text-dim)",
                padding: "8px 18px",
                borderRadius: 24,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              TICKET LIST
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              style={{
                border: "none",
                background: activeTab === "agents" ? "var(--brand)" : "transparent",
                color: activeTab === "agents" ? "var(--accent-ink)" : "var(--text-dim)",
                padding: "8px 18px",
                borderRadius: 24,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              BOOKIE LIST
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Enter keyword (Ticket #, name, bookie...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: 8,
                border: "1px solid var(--border-light)",
                background: "var(--surface-2)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none"
              }}
            />
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", display: "flex" }}>
              <Icon name="search" size={14} />
            </span>
          </div>
        </div>

        {/* Content Table */}
        <div style={{ marginTop: 16, maxHeight: "360px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: 8 }}>
          {activeTab === "tickets" ? (
            filteredTickets.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                No matching tickets found.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border-light)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-dim)" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>TNO</th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Name</th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Bookie</th>
                    <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => (
                    <tr key={t.ticket_number} style={{ borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--brand)" }}>
                        {t.ticket_number}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{t.owner_housie_name}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-dim)" }}>
                        {t.bookie_name} <span style={{ fontSize: 11, color: "var(--text-mute)" }}>({t.bookie_role || 'System'})</span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <span className={`hg-pill hg-pill-${t.status.toLowerCase()}`} style={{ fontSize: 11 }}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            filteredAgents.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                No matching bookies found.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border-light)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-dim)" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>No.</th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Name</th>
                    <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Total Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((a, idx) => (
                    <tr key={a.bookie_username} style={{ borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{idx + 1}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                        {a.bookie_name} <span style={{ fontSize: 11, color: "var(--text-mute)", fontWeight: 400 }}>({a.bookie_role || 'System'})</span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>{a.total_sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
          <Button variant="cta" size="sm" onClick={onClose}>Close</Button>
        </div>

      </div>
    </div>
  );
}

// ── Staff Manual Booking Modal ───────────────────────────────────────────────
export function StaffManualBookingModal({ gameId, onClose, onSuccess }: { gameId: string; onClose: () => void; onSuccess?: () => void }) {
  const [tickets, setTickets] = useState<Array<{ ticket_id: number; ticket_number: number; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [housieName, setHousieName] = useState("");
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mount/param fetch: sets the loading flag then resolves async — the effect
    // fetch the set-state-in-effect rule over-flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch<{ tickets?: typeof tickets }>(`/api/games/${gameId}/tickets`)
      .then((res) => {
        setTickets(res.tickets || []);
      })
      .catch((err) => console.error("Failed to load tickets:", err))
      .finally(() => setLoading(false));
  }, [gameId]);

  const toggleSelect = (ticketId: number) => {
    setError(null);
    setSelectedTicketIds((prev) => {
      if (prev.includes(ticketId)) {
        return prev.filter((id) => id !== ticketId);
      }
      return [...prev, ticketId];
    });
  };

  const formatSelectedTickets = () => {
    if (selectedTicketIds.length === 0) return "None";
    const nums = selectedTicketIds
      .map((id) => tickets.find((t) => t.ticket_id === id)?.ticket_number)
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b);
    if (nums.length === 1) return nums[0].toString();
    if (nums.length === 2) return `${nums[0]} & ${nums[1]}`;
    const lastNum = nums[nums.length - 1];
    const otherNums = nums.slice(0, -1).join(", ");
    return `${otherNums} & ${lastNum}`;
  };



  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!housieName.trim()) {
      setError("Housie Name is required.");
      return;
    }
    if (selectedTicketIds.length === 0) {
      setError("Please select at least one ticket.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/bookings/staff/manual-book", {
        method: "POST",
        body: JSON.stringify({
          game_id: gameId,
          ticket_ids: selectedTicketIds,
          housie_name: housieName.trim()
        })
      });
      alert("Manual booking confirmed!");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm manual booking.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hg-modal-scrim" onClick={onClose}>
      <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ width: "95%", maxWidth: "560px", background: "var(--surface)", color: "var(--text)" }}>
        
        {/* Header */}
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manual Ticket Booking</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Direct platform booking without wallet deduction</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "var(--text-dim)", padding: 4 }}>
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <span className="hg-poll-spin" />
          </div>
        ) : (
          <form onSubmit={handleBook} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {error && <div className="hg-sec-err" style={{ padding: 10, background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 6, fontSize: 13, margin: 0 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                  Housie Name (Player) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={housieName}
                  onChange={(e) => setHousieName(e.target.value)}
                  placeholder="Enter player's housie name"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-light)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    fontSize: 13,
                    outline: "none"
                  }}
                  required
                />
              </div>

              {/* Selected tickets section */}
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                  Selected Tickets
                </label>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "40px",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1.5px dashed var(--border)",
                  background: "rgba(0,0,0,0.15)",
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: selectedTicketIds.length === 0 ? "var(--text-mute)" : "var(--text)",
                  fontStyle: selectedTicketIds.length === 0 ? "italic" : "normal"
                }}>
                  {formatSelectedTickets()}
                </div>
              </div>
            </div>

            {/* 6-column spreadsheet-like grid layout */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Select Tickets
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {selectedTicketIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTicketIds([])}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--brand)",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: 0
                      }}
                    >
                      CLEAR SELECTION
                    </button>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>
                    ({selectedTicketIds.length} selected)
                  </span>
                </div>
              </div>

              <div style={{
                background: "var(--surface-2)",
                padding: "16px",
                borderRadius: "var(--radius-sm, 8px)",
                border: "2px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                boxShadow: "var(--shadow, 0 4px 12px rgba(0,0,0,0.15))"
              }}>
                {/* Red BOOK NOW button */}
                <button
                  type="submit"
                  disabled={saving || !housieName.trim() || selectedTicketIds.length === 0}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "var(--brand)",
                    color: "var(--accent-ink)",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "15px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    cursor: (saving || !housieName.trim() || selectedTicketIds.length === 0) ? "not-allowed" : "pointer",
                    opacity: (saving || !housieName.trim() || selectedTicketIds.length === 0) ? 0.5 : 1,
                    transition: "background 0.2s"
                  }}
                >
                  {saving ? "Booking..." : "Book Now"}
                </button>

                {/* Grid Box */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: "1px",
                  background: "var(--border)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  overflow: "hidden",
                  maxHeight: "320px",
                  overflowY: "auto"
                }}>
                  {tickets.map((t) => {
                    const isAvailable = t.status === "Available";
                    const isSelected = selectedTicketIds.includes(t.ticket_id);
                    return (
                      <button
                        key={t.ticket_id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => toggleSelect(t.ticket_id)}
                        style={{
                          padding: "12px 0",
                          border: "none",
                          background: isSelected
                            ? "var(--success)"
                            : isAvailable
                            ? "var(--surface)"
                            : "var(--surface-3)",
                          color: isSelected
                            ? "#ffffff"
                            : isAvailable
                            ? "var(--text)"
                            : "var(--text-mute)",
                          fontFamily: "var(--font-body)",
                          fontWeight: "bold",
                          fontSize: "15px",
                          cursor: isAvailable ? "pointer" : "not-allowed",
                          transition: "all 0.15s",
                          textDecoration: isAvailable ? "none" : "line-through"
                        }}
                      >
                        {t.ticket_number}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Close */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Filling status (shared widget) ───────────────────────────────────────────
export function FillingSection() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [salesGameId, setSalesGameId] = useState<string | null>(null);
  const [bookingGameId, setBookingGameId] = useState<string | null>(null);

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

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Real-time fill rate across all scheduled games.</p>
      {games.length === 0 && <EmptyHint icon="ticket" title="Nothing filling yet" sub="Scheduled games appear here with live fill rates." />}
      <div className="hg-fill-grid">
        {games.map((g) => {
          const pct = fillPct(g);
          const presetClass = getPresetClass(g.title);
          return (
            <div key={g.game_id} className={`hg-fill-card${presetClass ? " " + presetClass : ""}`}>
              <div className="hg-fill-top">
                <strong>{g.title}</strong>
                <span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status.replace("_", " ")}</span>
              </div>
              <div className="hg-fill-meta">
                {gameTime(g)} · {g.sold_count + g.locked_count}/{g.total_tickets} tickets
              </div>
              <div className="hg-fill-bar"><i style={{ width: pct + "%" }} className={pct >= 80 ? "is-hot" : ""} /></div>
              <div className="hg-fill-pct">{pct}% full</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {(g.game_status === "Live" || g.game_status === "Paused") && (
                  <Link href={`/game/${g.game_id}/live`} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                    <Button variant="cta" size="sm" icon="eye" full>Watch Live</Button>
                  </Link>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon="ticket"
                  full
                  onClick={() => setSalesGameId(g.game_id)}
                >
                  View Tickets
                </Button>
                {g.game_status !== "Completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="users"
                    full
                    onClick={() => setBookingGameId(g.game_id)}
                  >
                    Book Ticket
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {salesGameId && <TicketSalesModal gameId={salesGameId} onClose={() => setSalesGameId(null)} />}
      {bookingGameId && <StaffManualBookingModal gameId={bookingGameId} onClose={() => setBookingGameId(null)} onSuccess={load} />}
    </div>
  );
}

// ── Workforce ────────────────────────────────────────────────────────────────
const ROLE_OPTIONS: [number, string][] = [[2, "Financial Admin"], [3, "Operator"], [4, "Bookie"]];

export function WorkforceSection({ me }: { me: AuthUser }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", username: "bookie", email: "", phone: "", town: "", role_id: "4", password: "" });

  const load = useCallback(() => {
    apiFetch<StaffUser[]>("/api/users").then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const prefill = sessionStorage.getItem("hg_prefill_staff");
      if (prefill) {
        try {
          const data = JSON.parse(prefill);
          // Seed the form once from a prefill payload in storage (client-only).
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setForm({
            full_name: data.full_name || "",
            username: data.username || "",
            email: data.email || "",
            phone: data.phone || "",
            town: data.town || "",
            role_id: "4",
            password: data.password || ""
          });
          setAdding(true);
        } catch {}
        sessionStorage.removeItem("hg_prefill_staff");
      }
    }
  }, []);

  const addStaff = async () => {
    setError(null);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name.trim() || form.username.trim(),
          username: form.username.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          town: form.town.trim() || null,
          role_id: parseInt(form.role_id, 10),
          password: form.password,
        }),
      });
      setAdding(false);
      setForm({ full_name: "", username: "bookie", email: "", phone: "", town: "", role_id: "4", password: "" });
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



  const deleteUser = async (u: StaffUser) => {
    if (!window.confirm(`Delete ${u.full_name} (${roleLabel(u)})? This action cannot be undone.`)) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${u.user_id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const resetPassword = async (u: StaffUser) => {
    const pw = window.prompt(
      `Set a new password for ${u.full_name} (${roleLabel(u)}). Minimum 6 characters — they can change it themselves after signing in.`
    );
    if (pw === null) return; // cancelled
    if (pw.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    setError(null);
    try {
      await apiFetch(`/api/users/${u.user_id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: pw }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password reset failed");
    }
  };

  const roleLabel = (u: StaffUser) => u.role_name;

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Provision Financial Admins, Operators and Bookies.</p>
        <Button variant="cta" size="sm" icon="users" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add Staff"}
        </Button>
      </div>

      {adding && (
        <div className="hg-form">
          {form.full_name && (
            <div style={{ background: "rgba(212, 175, 55, 0.05)", border: "1px solid rgba(212, 175, 55, 0.2)", padding: "10px 14px", borderRadius: "8px", color: "var(--accent)", fontSize: "12px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
              <Icon name="check" size={14} />
              <span>Pre-filled from Application: <b>{form.full_name}</b> · WhatsApp: <b>{form.phone}</b> · Email: <b>{form.email}</b></span>
            </div>
          )}
          <div className="hg-form-row">
            <label className="hg-form-field">
              <span>Username</span>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Role</span>
              <select
                value={form.role_id}
                onChange={(e) => {
                  const roleId = e.target.value;
                  let defaultUsername = "";
                  if (roleId === "2") defaultUsername = "admin";
                  else if (roleId === "3") defaultUsername = "operator";
                  else if (roleId === "4") defaultUsername = "bookie";
                  setForm({ ...form, role_id: roleId, username: defaultUsername });
                }}
              >
                {ROLE_OPTIONS.filter(([id]) => me.role_name === "Superadmin" || id > 2).map(([id, lbl]) => (
                  <option key={id} value={id}>{lbl}</option>
                ))}
              </select>
            </label>
            <label className="hg-form-field">
              <span>Temp password (min 6)</span>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
          </div>
          <div className="hg-form-actions">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="cta" size="sm"
              disabled={!form.username.trim() || form.password.length < 6}
              onClick={addStaff}
            >
              Create account
            </Button>
          </div>
        </div>
      )}

      {error && <p className="hg-sec-err">{error}</p>}
      <div 
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "20px",
          marginTop: "16px"
        }}
      >
        {users.map((u) => {
          const isSuper = me.role_name === "Superadmin";
          const isActive = u.status === "Active";
          
          // Role pill colors matching the website's professional design
          let roleColor = "var(--text-dim)";
          let roleBg = "rgba(255, 255, 255, 0.05)";
          let roleBorder = "rgba(255, 255, 255, 0.1)";
          if (u.role_name === "Financial Admin") {
            roleColor = "var(--cyan)";
            roleBg = "rgba(0, 242, 254, 0.05)";
            roleBorder = "rgba(0, 242, 254, 0.2)";
          } else if (u.role_name === "Operator") {
            roleColor = "var(--accent)";
            roleBg = "rgba(212, 175, 55, 0.05)";
            roleBorder = "rgba(212, 175, 55, 0.2)";
          } else if (u.role_name === "Bookie") {
            roleColor = "#10B981";
            roleBg = "rgba(16, 185, 129, 0.05)";
            roleBorder = "rgba(16, 185, 129, 0.2)";
          }

          return (
            <div 
              key={u.user_id}
              className="hg-card"
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: "var(--card-shadow)",
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative",
                gap: "14px"
              }}
            >
              {/* Header: Avatar, Name, and Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Avatar src={roleAvatar(u)} name={u.full_name} className="hg-avatar-lg" />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <b style={{ color: "var(--text)", fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.full_name}
                  </b>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                    <span 
                      style={{ 
                        fontSize: "10px", 
                        padding: "2px 8px", 
                        borderRadius: "10px", 
                        fontWeight: 600, 
                        color: roleColor, 
                        background: roleBg, 
                        border: `1px solid ${roleBorder}`
                      }}
                    >
                      {roleLabel(u)}
                    </span>
                    <span 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "4px", 
                        fontSize: "11px", 
                        color: isActive ? "var(--success)" : "var(--danger)",
                        fontWeight: 600
                      }}
                    >
                      <span 
                        style={{ 
                          width: "6px", 
                          height: "6px", 
                          borderRadius: "50%", 
                          background: isActive ? "var(--success)" : "var(--danger)" 
                        }} 
                      />
                      {u.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Username (Superadmin only) */}
              {isSuper && (
                <div 
                  style={{ 
                    fontSize: "12.5px", 
                    color: "var(--text-dim)", 
                    background: "var(--surface-2)", 
                    padding: "8px 12px", 
                    borderRadius: "6px", 
                    border: "1px solid var(--border-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <span className="hg-dim" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="users" size={13} /> Username:
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, wordBreak: "break-all" }}>
                    {u.username}
                  </span>
                </div>
              )}

              {/* Action buttons at the bottom */}
              <div 
                style={{ 
                  display: "flex", 
                  gap: "8px", 
                  marginTop: "auto", 
                  paddingTop: "12px", 
                  borderTop: "1px solid var(--border-2)",
                  justifyContent: "flex-end"
                }}
              >
                {((me.role_name === "Superadmin" && u.user_id !== me.user_id) ||
                  (me.role_name === "Financial Admin" && u.user_id !== me.user_id && u.role_id > 2)) ? (
                  <>
                    {/* Suspend/Reactivate Button */}
                    <button 
                      onClick={() => setStatus(u, isActive ? "Suspended" : "Active")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        color: isActive ? "var(--danger)" : "var(--success)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                      title={isActive ? "Suspend User" : "Activate User"}
                    >
                      <Icon name={isActive ? "x" : "check"} size={12} />
                      {isActive ? "Suspend" : "Activate"}
                    </button>

                    {/* Reset Password Button */}
                    <button 
                      onClick={() => resetPassword(u)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        color: "var(--cyan)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                      title="Reset Password"
                    >
                      <Icon name="key" size={12} />
                      Password
                    </button>

                    {/* Delete Button */}
                    <button 
                      onClick={() => deleteUser(u)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        color: "var(--danger)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                      title="Delete User"
                    >
                      <Icon name="trash" size={12} />
                      Delete
                    </button>
                  </>
                ) : (
                  <span className="hg-dim" style={{ fontSize: "11px", fontStyle: "italic", alignSelf: "center" }}>
                    Self / System account
                  </span>
                )}
              </div>
            </div>
          );
        })}
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
  const [salesGameId, setSalesGameId] = useState<string | null>(null);

  useEffect(() => {
    // Mount fetch: sets the loading flag then resolves async — the effect fetch
    // the set-state-in-effect rule over-flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch<GameSummary[]>("/api/games")
      .then((g) => {
        setGames(g.filter((x) => x.game_status === "Completed"));
      })
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
    } catch (e) {
      console.error("Failed to load drawn numbers", e);
    } finally {
      setLoadingDrawn(false);
    }
  };

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">View history and results of completed games.</p>
      {loading ? (
        <div className="hg-panel flex justify-center py-8">
          <span className="hg-poll-spin" />
        </div>
      ) : games.length === 0 ? (
        <EmptyHint icon="trophy" title="No completed games" sub="Finished games will show up here with their full results." />
      ) : (
        <div className="hg-panel">
          <div className="hg-table">
            <div className="hg-tr hg-tr-head">
              <span>Game Name</span><span>Date &amp; Time</span><span>Tickets Sold</span><span>Revenue</span><span>Action</span>
            </div>
            {games.map((g) => {
              const totalRevenue = g.sold_count * g.ticket_price;
              const dateStr = g.completed_at
                ? new Date(g.completed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                : new Date(g.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
              return (
                <div key={g.game_id} className="hg-tr">
                  <span className="hg-td-name">{g.title}</span>
                  <span className="hg-dim">{dateStr}</span>
                  <span>{g.sold_count} / {g.total_tickets}</span>
                  <strong>{money(totalRevenue)}</strong>
                  <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button variant="ghost" size="sm" onClick={() => viewResults(g)}>View Results</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSalesGameId(g.game_id)}>View Tickets</Button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

              {/* Drawn Numbers */}
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
      {salesGameId && <TicketSalesModal gameId={salesGameId} onClose={() => setSalesGameId(null)} />}
    </div>
  );
}

