"use client";
/**
 * Player Management (Superadmin/Admin) — every registered player account with
 * engagement stats from GET /api/players. Suspend/reactivate is Admin+;
 * permanent deletion is Superadmin-only (bookings/settlements survive as
 * anonymous rows — the backend NULLs their player_id stamps).
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, Button, EmptyHint } from "@/components/ui";
import type { PlayerAccount } from "@/lib/types";
import type { AuthUser } from "@/lib/stores/authStore";

const GRID8 = "1.8fr 1fr 0.6fr 0.6fr 1fr 1fr 0.9fr 1fr";

function StatBox({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div style={{ background: "var(--bg)", padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
      <span style={{ fontSize: 10, color: "var(--text-mute)", display: "block" }}>{label}</span>
      <strong style={{ fontSize: 16, marginTop: 2, display: "block", color: tone }}>{value}</strong>
    </div>
  );
}

export function PlayersSection({ me }: { me: AuthUser }) {
  const [players, setPlayers] = useState<PlayerAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlayerAccount | null>(null);

  // setState only inside the promise chain (never synchronously) so this is
  // safe to call straight from the mount effect under the React Compiler rules.
  const load = useCallback(() => {
    apiFetch<{ players: PlayerAccount[] }>("/api/players")
      .then((data) => { setPlayers(data.players); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load players"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (player: PlayerAccount) => {
    const nextStatus = player.status === "Active" ? "Suspended" : "Active";
    setActionBusy(player.player_id);
    setError(null);
    try {
      await apiFetch(`/api/players/${player.player_id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setPlayers((prev) => prev.map((p) => (p.player_id === player.player_id ? { ...p, status: nextStatus } : p)));
      setSelected((prev) => (prev && prev.player_id === player.player_id ? { ...prev, status: nextStatus } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setActionBusy(null);
    }
  };

  const deletePlayer = async (player: PlayerAccount) => {
    setActionBusy(player.player_id);
    setConfirmDelId(null);
    setError(null);
    try {
      await apiFetch(`/api/players/${player.player_id}`, { method: "DELETE" });
      setPlayers((prev) => prev.filter((p) => p.player_id !== player.player_id));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete player");
    } finally {
      setActionBusy(null);
    }
  };

  const filtered = players.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return p.username.toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q);
  });

  const activeCount = players.filter((p) => p.status === "Active").length;
  const suspendedCount = players.length - activeCount;
  const totalExpenditure = players.reduce((s, p) => s + p.total_expenditure, 0);
  const totalTickets = players.reduce((s, p) => s + p.tickets_bought, 0);

  const regDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="hg-sec">
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Registered players — inspect stats, suspend/reactivate{me.role_name === "Superadmin" ? ", or delete accounts" : ""}.</p>
        <input
          type="text"
          placeholder="Search by username or name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 300,
            padding: "8px 12px",
            fontSize: 12,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            outline: "none",
          }}
        />
      </div>

      {error && <p className="hg-sec-err">{error}</p>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <span className="hg-poll-spin" />
        </div>
      ) : (
        <>
          <div className="hg-kpi-grid">
            <div className="hg-kpi">
              <span className="hg-kpi-label">Total players</span>
              <b className="hg-kpi-value">{players.length}</b>
              <span className="hg-kpi-sub">{activeCount} active · {suspendedCount} suspended</span>
            </div>
            <div className="hg-kpi">
              <span className="hg-kpi-label">Tickets bought</span>
              <b className="hg-kpi-value">{totalTickets.toLocaleString("en-IN")}</b>
              <span className="hg-kpi-sub">By signed-in players</span>
            </div>
            <div className="hg-kpi hg-kpi-good">
              <span className="hg-kpi-label">Gross player spend</span>
              <b className="hg-kpi-value">{money(totalExpenditure)}</b>
              <span className="hg-kpi-sub">Confirmed bookings only</span>
            </div>
          </div>

          <div className="hg-panel">
            {filtered.length === 0 ? (
              <EmptyHint icon="users" title="No players found" sub="No registered players match your search." />
            ) : (
              <div className="hg-table">
                <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: GRID8 }}>
                  <span>Player</span>
                  <span>Registered</span>
                  <span>Games</span>
                  <span>Tickets</span>
                  <span>Spent</span>
                  <span>Won</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {filtered.map((p) => {
                  const isBusy = actionBusy === p.player_id;
                  return (
                    <div key={p.player_id} className="hg-tr" style={{ gridTemplateColumns: GRID8 }}>
                      <span className="hg-td-name" style={{ cursor: "pointer" }} onClick={() => setSelected(p)}>
                        <Avatar name={p.username} size={28} />
                        <span>
                          <strong style={{ display: "block" }}>{p.username}</strong>
                          {p.full_name && <span className="hg-dim" style={{ display: "block", fontSize: 11 }}>{p.full_name}</span>}
                        </span>
                      </span>
                      <span className="hg-dim">{regDate(p.created_at)}</span>
                      <span>{p.games_played}</span>
                      <span>{p.tickets_bought}</span>
                      <strong className="hg-dim" style={{ fontFamily: "var(--font-mono)" }}>{money(p.total_expenditure)}</strong>
                      <span style={{ color: p.total_won > 0 ? "var(--success)" : "var(--text-dim)", fontWeight: p.total_won > 0 ? 600 : 400, fontFamily: "var(--font-mono)" }}>
                        {money(p.total_won)}
                      </span>
                      <span><span className={`hg-pill hg-pill-${p.status.toLowerCase()}`}>{p.status}</span></span>
                      <span className="hg-row-ctrls">
                        <button
                          className="hg-ic-btn"
                          title={p.status === "Active" ? "Suspend account" : "Reactivate account"}
                          disabled={isBusy}
                          onClick={() => toggleStatus(p)}
                        >
                          <Icon name={p.status === "Active" ? "x" : "check"} size={14} />
                        </button>
                        {me.role_name === "Superadmin" && (
                          confirmDelId === p.player_id ? (
                            <span className="hg-settle-wrap">
                              <button className="hg-settle-btn is-confirm" onClick={() => deletePlayer(p)}>Delete</button>
                              <button className="hg-settle-cancel" aria-label="Cancel delete" onClick={() => setConfirmDelId(null)}>
                                <Icon name="x" size={14} strokeWidth={2.6} />
                              </button>
                            </span>
                          ) : (
                            <button
                              className="hg-ic-btn"
                              style={{ color: "var(--danger)" }}
                              title="Delete account permanently"
                              disabled={isBusy}
                              onClick={() => setConfirmDelId(p.player_id)}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          )
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {selected && (
        <div className="hg-modal-scrim" onClick={() => setSelected(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Player profile: {selected.username}</h3>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Username</span>
                  <strong style={{ display: "block", fontSize: 14, marginTop: 2 }}>{selected.username}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Full name</span>
                  <strong style={{ display: "block", fontSize: 14, marginTop: 2 }}>{selected.full_name || "—"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Date of birth</span>
                  <strong style={{ display: "block", fontSize: 14, marginTop: 2 }}>{regDate(selected.date_of_birth)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Member since</span>
                  <strong style={{ display: "block", fontSize: 14, marginTop: 2 }}>{regDate(selected.created_at)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Last login</span>
                  <strong style={{ display: "block", fontSize: 14, marginTop: 2 }}>
                    {selected.last_login
                      ? new Date(selected.last_login).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Account status</span>
                  <span className={`hg-pill hg-pill-${selected.status.toLowerCase()}`} style={{ display: "inline-block", marginTop: 4 }}>
                    {selected.status}
                  </span>
                </div>
              </div>

              <div style={{ borderTop: "1.5px solid var(--border-2)", paddingTop: 16 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)" }}>
                  Performance stats
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <StatBox label="Games played" value={selected.games_played} />
                  <StatBox label="Tickets bought" value={selected.tickets_bought} />
                  <StatBox label="Total spent" value={money(selected.total_expenditure)} />
                  <StatBox label="Prizes won" value={selected.total_wins} />
                  <StatBox label="Total won" value={money(selected.total_won)} tone="var(--success)" />
                  <StatBox
                    label="Net margin"
                    value={money(selected.total_won - selected.total_expenditure)}
                    tone={selected.total_won - selected.total_expenditure >= 0 ? "var(--success)" : "var(--danger)"}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <Button
                variant={selected.status === "Active" ? "ghost" : "cta"}
                size="sm"
                onClick={() => toggleStatus(selected)}
              >
                {selected.status === "Active" ? "Suspend Player" : "Activate Player"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
