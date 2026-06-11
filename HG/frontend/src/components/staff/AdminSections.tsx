"use client";
/** Admin/Superadmin staff sections: overview, games, filling, workforce, audit. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint, KpiCard } from "@/components/ui";
import type { AuditEntry, GameSummary, OverviewStats, StaffUser } from "@/lib/types";
import type { AuthUser } from "@/lib/stores/authStore";

const PATTERN_DEFAULTS: { pattern_name: string; prize_amount: number }[] = [
  { pattern_name: "Early Five", prize_amount: 500 },
  { pattern_name: "Top Line", prize_amount: 1000 },
  { pattern_name: "Middle Line", prize_amount: 1000 },
  { pattern_name: "Bottom Line", prize_amount: 1000 },
  { pattern_name: "Four Corners", prize_amount: 500 },
  { pattern_name: "Full House", prize_amount: 2000 },
];

function fillPct(g: GameSummary): number {
  return Math.round(((g.sold_count + g.locked_count) / g.total_tickets) * 100);
}

function gameTime(g: GameSummary): string {
  const d = new Date(g.scheduled_at);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

// ── Games table with start/pause/resume controls ─────────────────────────────
function GamesTable({ games, controls, onAction }: {
  games: GameSummary[];
  controls?: boolean;
  onAction?: (id: string, action: "start" | "pause" | "resume") => void;
}) {
  return (
    <div className="hg-table">
      <div className="hg-tr hg-tr-head">
        <span>Game</span><span>Time</span><span>Fill</span><span>Status</span>{controls && <span>Controls</span>}
      </div>
      {games.map((g) => {
        const pct = fillPct(g);
        return (
          <div key={g.game_id} className="hg-tr">
            <span className="hg-td-name">{g.title}</span>
            <span className="hg-dim">{gameTime(g)}</span>
            <span className="hg-td-fill">
              <i className="hg-mini-bar"><b style={{ width: pct + "%" }} /></i>{pct}%
            </span>
            <span><span className={`hg-pill hg-pill-${g.game_status.toLowerCase()}`}>{g.game_status}</span></span>
            {controls && (
              <span className="hg-row-ctrls">
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
              </span>
            )}
          </div>
        );
      })}
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
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", scheduled_at: "", ticket_price: "50", total_tickets: "100" });
  const [prizes, setPrizes] = useState(PATTERN_DEFAULTS);

  const load = useCallback(() => {
    apiFetch<GameSummary[]>("/api/games").then(setGames).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "start" | "pause" | "resume") => {
    setError(null);
    try {
      await apiFetch(`/api/games/${id}/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const create = async () => {
    setError(null);
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          ticket_price: parseFloat(form.ticket_price),
          total_tickets: parseInt(form.total_tickets, 10),
          prizes,
        }),
      });
      setCreating(false);
      setForm({ title: "", scheduled_at: "", ticket_price: "50", total_tickets: "100" });
      setPrizes(PATTERN_DEFAULTS);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create game");
    }
  };

  const gross = parseFloat(form.ticket_price || "0") * parseInt(form.total_tickets || "0", 10);
  const pool = prizes.reduce((s, p) => s + p.prize_amount, 0);

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Schedule, start, pause or resume any game.</p>
        <Button variant="cta" size="sm" icon="grid" onClick={() => setCreating((c) => !c)}>
          {creating ? "Close" : "Create Game"}
        </Button>
      </div>

      {creating && (
        <div className="hg-form">
          <div className="hg-form-row">
            <label className="hg-form-field">
              <span>Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Scheduled at</span>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Ticket price (₹)</span>
              <input type="number" min={1} value={form.ticket_price} onChange={(e) => setForm({ ...form, ticket_price: e.target.value })} />
            </label>
            <label className="hg-form-field">
              <span>Total tickets</span>
              <input type="number" min={1} value={form.total_tickets} onChange={(e) => setForm({ ...form, total_tickets: e.target.value })} />
            </label>
          </div>
          <div className="hg-form-row">
            {prizes.map((p, i) => (
              <label key={p.pattern_name} className="hg-form-field">
                <span>{p.pattern_name} (₹)</span>
                <input
                  type="number"
                  min={0}
                  value={p.prize_amount}
                  onChange={(e) =>
                    setPrizes((prev) => prev.map((x, j) => (j === i ? { ...x, prize_amount: parseInt(e.target.value, 10) || 0 } : x)))
                  }
                />
              </label>
            ))}
          </div>
          <p className="hg-sec-sub">
            Prize pool {money(pool)} of {money(gross)} gross {gross > 0 && `(${Math.round((pool / gross) * 100)}% — cap 80%)`}
          </p>
          <div className="hg-form-actions">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="cta"
              size="sm"
              disabled={!form.title.trim() || !form.scheduled_at}
              onClick={create}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {error && <p className="hg-sec-err">{error}</p>}
      <div className="hg-panel">
        {games.length === 0 ? (
          <EmptyHint icon="grid" title="No games yet" sub="Create the first game to open bookings." />
        ) : (
          <GamesTable games={games} controls onAction={act} />
        )}
      </div>
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
                <span className="hg-avatar-sm">{u.full_name[0]}</span>{u.full_name}
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
