"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";

interface PlayerData {
  player_id: string;
  full_name: string | null;
  housie_name: string;
  registered_at: string;
  phone: string | null;
  email: string | null;
  status: "Active" | "Suspended";
  games_played: number;
  tickets_bought: number;
  total_expenditure: number;
  total_won: number;
}

export function PlayersSection() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PlayerData[]>("/api/player");
      setPlayers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load players list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount data-fetch: loadPlayers() flips the loading flag then resolves
    // async. This is the canonical effect fetch (memoised, runs once) that the
    // set-state-in-effect heuristic intentionally over-flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlayers();
  }, [loadPlayers]);

  const handleToggleStatus = async (player: PlayerData) => {
    const nextStatus = player.status === "Active" ? "Suspended" : "Active";
    const confirmMessage = `Are you sure you want to ${nextStatus.toLowerCase()} player '${player.housie_name}'?`;
    if (!window.confirm(confirmMessage)) return;

    setActionBusy(player.player_id);
    try {
      await apiFetch(`/api/player/${player.player_id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setPlayers((prev) =>
        prev.map((p) => (p.player_id === player.player_id ? { ...p, status: nextStatus } : p))
      );
      if (selectedPlayer && selectedPlayer.player_id === player.player_id) {
        setSelectedPlayer((prev) => prev ? { ...prev, status: nextStatus } : null);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeletePlayer = async (player: PlayerData) => {
    const confirmMessage = `⚠️ WARNING: Are you absolutely sure you want to DELETE player '${player.housie_name}'? This action is permanent and cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    setActionBusy(player.player_id);
    try {
      await apiFetch(`/api/player/${player.player_id}`, {
        method: "DELETE",
      });
      setPlayers((prev) => prev.filter((p) => p.player_id !== player.player_id));
      setSelectedPlayer(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete player profile.");
    } finally {
      setActionBusy(null);
    }
  };

  // Filter players based on search query
  const filteredPlayers = players.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      p.housie_name.toLowerCase().includes(query) ||
      (p.full_name && p.full_name.toLowerCase().includes(query)) ||
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.phone && p.phone.includes(query))
    );
  });

  // Calculate metrics
  const activeCount = players.filter((p) => p.status === "Active").length;
  const suspendedCount = players.filter((p) => p.status === "Suspended").length;
  const totalExpenditure = players.reduce((s, p) => s + p.total_expenditure, 0);

  return (
    <div className="hg-sec" style={{ gap: "20px" }}>
      <div className="hg-sec-head">
        <p className="hg-sec-sub">Manage registered players, inspect stats, suspend/reactivate, or delete profiles.</p>
        <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "320px" }}>
          <input
            type="text"
            className="hg-input"
            placeholder="Search by name, email, phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <span className="hg-poll-spin" />
        </div>
      ) : error ? (
        <p className="hg-sec-err">{error}</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Players</span>
              <strong style={{ fontSize: "24px", color: "var(--text)", display: "block", marginTop: "4px" }}>{players.length}</strong>
              <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>{activeCount} active, {suspendedCount} suspended</span>
            </div>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Ticket Purchases</span>
              <strong style={{ fontSize: "24px", color: "var(--accent)", display: "block", marginTop: "4px" }}>
                {players.reduce((sum, p) => sum + p.tickets_bought, 0)}
              </strong>
              <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>Across all games played</span>
            </div>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)", padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Gross Player Expenditure</span>
              <strong style={{ fontSize: "24px", color: "var(--cyan)", display: "block", marginTop: "4px" }}>{money(totalExpenditure)}</strong>
              <span style={{ fontSize: "11px", color: "var(--text-mute)", display: "block", marginTop: "2px" }}>Total money spent by players</span>
            </div>
          </div>

          {/* Players Table */}
          <div className="hg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {filteredPlayers.length === 0 ? (
              <EmptyHint icon="users" title="No players found" sub="No registered players match your search criteria." />
            ) : (
              <div className="hg-table" style={{ height: "100%", overflowY: "auto" }}>
                <div className="hg-tr hg-tr-players hg-tr-head">
                  <span>Player</span>
                  <span>Registered</span>
                  <span>Games</span>
                  <span>Tickets</span>
                  <span>Expenditure</span>
                  <span>Won</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {filteredPlayers.map((p) => {
                  const isBusy = actionBusy === p.player_id;
                  return (
                    <div key={p.player_id} className="hg-tr hg-tr-players">
                      <span 
                        className="hg-td-name" 
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedPlayer(p)}
                      >
                        <span className="hg-avatar-sm">{(p.housie_name || "?")[0].toUpperCase()}</span>
                        <div>
                          <strong style={{ color: "var(--text)" }}>{p.housie_name}</strong>
                          {p.full_name && <span className="hg-dim" style={{ display: "block", fontSize: "11px" }}>{p.full_name}</span>}
                        </div>
                      </span>
                      <span className="hg-dim">
                        {new Date(p.registered_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span>{p.games_played}</span>
                      <span>{p.tickets_bought}</span>
                      <strong className="hg-dim">{money(p.total_expenditure)}</strong>
                      <span style={{ color: p.total_won > 0 ? "var(--success)" : "var(--text-dim)", fontWeight: p.total_won > 0 ? 600 : 400 }}>
                        {money(p.total_won)}
                      </span>
                      <span>
                        <span className={`hg-pill hg-pill-${p.status === "Active" ? "active" : "suspended"}`}>
                          {p.status}
                        </span>
                      </span>
                      <span className="hg-row-ctrls" style={{ gap: "8px" }}>
                        <button
                          className="hg-ic-btn"
                          title={p.status === "Active" ? "Suspend Account" : "Activate Account"}
                          disabled={isBusy}
                          onClick={() => handleToggleStatus(p)}
                        >
                          <Icon name={p.status === "Active" ? "x" : "check"} size={14} />
                        </button>
                        <button
                          className="hg-ic-btn"
                          style={{ color: "var(--danger)" }}
                          title="Delete Profile"
                          disabled={isBusy}
                          onClick={() => handleDeletePlayer(p)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Details View Modal */}
      {selectedPlayer && (
        <div className="hg-modal-scrim" onClick={() => setSelectedPlayer(null)}>
          <div className="hg-modal" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", color: "var(--text)", maxWidth: "540px", width: "90%" }}>
            <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Player Profile: {selectedPlayer.housie_name}</h3>
              <button 
                onClick={() => setSelectedPlayer(null)} 
                className="text-lg hover:text-accent font-bold"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "var(--text)" }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Housie Name</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>{selectedPlayer.housie_name}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>{selectedPlayer.full_name || "—"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Phone</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>{selectedPlayer.phone || "—"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>{selectedPlayer.email || "—"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Member Since</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>
                    {new Date(selectedPlayer.registered_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Status</span>
                  <strong style={{ display: "block", fontSize: "14px", marginTop: "2px" }}>
                    <span className={`hg-pill hg-pill-${selectedPlayer.status === "Active" ? "active" : "suspended"}`} style={{ display: "inline-block", marginTop: "2px" }}>
                      {selectedPlayer.status}
                    </span>
                  </strong>
                </div>
              </div>

              <div style={{ borderTop: "1.5px solid var(--border-2)", paddingTop: "16px" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)" }}>Performance Stats</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                  <div style={{ background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-mute)", display: "block" }}>Games Played</span>
                    <strong style={{ fontSize: "16px", marginTop: "2px", display: "block" }}>{selectedPlayer.games_played}</strong>
                  </div>
                  <div style={{ background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-mute)", display: "block" }}>Tickets Bought</span>
                    <strong style={{ fontSize: "16px", marginTop: "2px", display: "block" }}>{selectedPlayer.tickets_bought}</strong>
                  </div>
                  <div style={{ background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-mute)", display: "block" }}>Total Spent</span>
                    <strong style={{ fontSize: "16px", marginTop: "2px", display: "block" }}>{money(selectedPlayer.total_expenditure)}</strong>
                  </div>
                  <div style={{ background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-mute)", display: "block" }}>Total Won</span>
                    <strong style={{ fontSize: "16px", marginTop: "2px", display: "block", color: "var(--success)" }}>{money(selectedPlayer.total_won)}</strong>
                  </div>
                  <div style={{ background: "var(--bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-mute)", display: "block" }}>Net Margin</span>
                    <strong style={{ fontSize: "16px", marginTop: "2px", display: "block", color: selectedPlayer.total_won - selectedPlayer.total_expenditure >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {money(selectedPlayer.total_won - selectedPlayer.total_expenditure)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <Button
                variant={selectedPlayer.status === "Active" ? "ghost" : "cta"}
                size="sm"
                onClick={() => handleToggleStatus(selectedPlayer)}
              >
                {selectedPlayer.status === "Active" ? "Suspend Player" : "Activate Player"}
              </Button>
              <Button
                variant="cta"
                size="sm"
                style={{ background: "var(--danger)", color: "#fff" }}
                onClick={() => handleDeletePlayer(selectedPlayer)}
              >
                Delete Profile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPlayer(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
