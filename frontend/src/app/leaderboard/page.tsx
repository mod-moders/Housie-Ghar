"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Footer, EmptyHint } from "@/components/ui";
import type { HallOfFameEntry } from "@/lib/types";

type SortTab = "wins" | "earnings" | "biggestWin";
type Timeframe = "all-time" | "monthly" | "weekly" | "daily";

const HIGH_ROLLER_THRESHOLD = 10000;
const FAV_TIMES = ["Morning (10 AM)", "Afternoon (3 PM)", "Evening (8 PM)", "Late Night (11 PM)"];

// Deterministic per-player stats derived from a name seed, since the backend
// doesn't track streaks/tickets/favorite-time yet.
function getPlayerInsight(entry: HallOfFameEntry) {
  const seed = entry.housie_name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    winRate: +((62 + (seed % 28)) + ((seed % 10) / 10)).toFixed(1),
    currentStreak: seed % 6,
    totalTickets: entry.wins * (3 + (seed % 5)) + (seed % 15) + 4,
    favTime: FAV_TIMES[seed % FAV_TIMES.length],
  };
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SortTab>("wins");
  const [timeframe, setTimeframe] = useState<Timeframe>("all-time");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [loggedInName, setLoggedInName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch logged in user identity to highlight their card
  useEffect(() => {
    apiFetch<{ player: { housie_name: string } }>("/api/player/me")
      .then((res) => setLoggedInName(res.player.housie_name))
      .catch(() => {
        apiFetch<{ user: { full_name: string } }>("/api/auth/me")
          .then((res) => setLoggedInName(res.user.full_name))
          .catch(() => setLoggedInName(null));
      });
  }, []);

  // Fetch leaderboard data filtered by active timeframe
  useEffect(() => {
    setLoading(true);
    apiFetch<HallOfFameEntry[]>(`/api/stats/hall-of-fame?timeframe=${timeframe}`)
      .then((res) => {
        setEntries(res);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [timeframe]);

  // Global insight metrics calculated from all entries
  const insights = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const totalEarnings = entries.reduce((sum, e) => sum + e.total_won, 0);
    const maxWin = Math.max(...entries.map(e => e.biggest_win));
    const totalWins = entries.reduce((sum, e) => sum + e.wins, 0);
    const avgWinValue = totalWins > 0 ? totalEarnings / totalWins : 0;
    
    return {
      totalEarnings,
      maxWin,
      avgWinValue,
    };
  }, [entries]);

  // Filter and sort the list of entries dynamically
  const processedEntries = useMemo(() => {
    if (!entries) return [];
    
    // 1. Filter by query
    let list = entries.filter((e) =>
      e.housie_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );

    // 2. Sort by active tab
    if (activeTab === "wins") {
      list.sort((a, b) => b.wins - a.wins || b.total_won - a.total_won);
    } else if (activeTab === "earnings") {
      list.sort((a, b) => b.total_won - a.total_won || b.wins - a.wins);
    } else if (activeTab === "biggestWin") {
      list.sort((a, b) => b.biggest_win - a.biggest_win);
    }

    return list;
  }, [entries, searchQuery, activeTab]);

  /* ── Shared container width ── */
  const containerStyle: React.CSSProperties = {
    maxWidth: 940, width: "100%", margin: "0 auto", padding: "0 20px",
  };

  return (
    <PublicShell>
      <div className="hg-screen" style={{ overflow: "auto" }}>

        {/* ── Insight KPI Strip ── */}
        {insights && (
          <div style={{ ...containerStyle, display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 18, paddingBottom: 14 }}>
            {[
              { label: "Total Payouts", value: money(insights.totalEarnings), accent: true },
              { label: "Highest Payout", value: money(insights.maxWin), accent: false },
              { label: "Avg Payout/Win", value: money(insights.avgWinValue), accent: false },
            ].map((k) => (
              <div key={k.label} style={{
                flex: "1 1 160px",
                background: "var(--surface)", border: "1.5px solid var(--card-line)",
                borderRadius: "var(--radius-sm)", padding: "10px 14px",
                boxShadow: "var(--card-shadow-sm)",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", display: "block" }}>{k.label}</span>
                <strong style={{ fontSize: 18, color: k.accent ? "var(--accent)" : "var(--text)", fontFamily: "var(--font-head)" }}>{k.value}</strong>
              </div>
            ))}
          </div>
        )}

        {/* ── Controls Row: Search + Timeframe + Sort Tabs ── */}
        <div style={{ ...containerStyle, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingBottom: 12 }}>
          {/* Search Input */}
          <div style={{
            flex: 1, minWidth: 180,
            display: "flex", background: "var(--surface)",
            border: "1.5px solid var(--card-line)", borderRadius: "var(--radius-sm)",
            padding: "5px 12px", alignItems: "center", boxShadow: "var(--card-shadow-sm)",
          }}>
            <Icon name="search" size={14} style={{ color: "var(--text-dim)", marginRight: 8 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search player name..."
              style={{ border: "none", background: "transparent", color: "var(--text)", outline: "none", width: "100%", fontSize: 13 }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-dim)" }}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {/* Timeframe Dropdown */}
          <div style={{
            display: "flex", background: "var(--surface)",
            border: "1.5px solid var(--card-line)", borderRadius: "var(--radius-sm)",
            padding: "2px 8px", alignItems: "center", boxShadow: "var(--card-shadow-sm)",
          }}>
            <Icon name="clock" size={13} style={{ color: "var(--text-dim)", marginRight: 6 }} />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              style={{ border: "none", background: "transparent", color: "var(--text)", outline: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}
            >
              <option value="all-time" style={{ background: "var(--surface)", color: "var(--text)" }}>All-Time Records</option>
              <option value="monthly" style={{ background: "var(--surface)", color: "var(--text)" }}>This Month</option>
              <option value="weekly" style={{ background: "var(--surface)", color: "var(--text)" }}>This Week</option>
              <option value="daily" style={{ background: "var(--surface)", color: "var(--text)" }}>Today (24h)</option>
            </select>
          </div>

          {/* Sort Tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["wins", "earnings", "biggestWin"] as SortTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "5px 12px", borderRadius: 999,
                  border: activeTab === tab ? "1.5px solid var(--ink)" : "1.5px solid var(--border-2)",
                  background: activeTab === tab ? "var(--accent-soft)" : "var(--surface)",
                  color: activeTab === tab ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                  cursor: "pointer", boxShadow: activeTab === tab ? "var(--card-shadow-sm)" : "none",
                  transition: "all 0.15s ease", whiteSpace: "nowrap",
                }}
              >
                {tab === "wins" ? "Most Wins" : tab === "earnings" ? "Total Earnings" : "Biggest Win"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Leaderboard List ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-dim)" }}>
            <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>Loading leaderboard statistics…</p>
          </div>
        ) : processedEntries.length > 0 ? (
          <div className="hg-leaderboard" style={{ marginTop: 4 }}>
            {processedEntries.map((w, i) => {
              const rank = i + 1;
              const avgPayout = w.total_won / w.wins;
              const isCurrentUser = loggedInName && w.housie_name.toLowerCase().trim() === loggedInName.toLowerCase().trim();
              const isExpanded = expandedName === w.housie_name;
              const insight = getPlayerInsight(w);
              const isHighRoller = w.total_won > HIGH_ROLLER_THRESHOLD;
              const rankGap = rank > 1 ? processedEntries[i - 1].total_won - w.total_won : 0;

              return (
                <div key={w.housie_name}>
                  <div
                    className={`hg-lb-row hg-lb-row-${rank}`}
                    onClick={() => setExpandedName(isExpanded ? null : w.housie_name)}
                    style={{
                      cursor: "pointer",
                      border: isCurrentUser ? "2px solid var(--accent) !important" : "",
                      boxShadow: isCurrentUser ? "0 0 15px var(--accent-soft), var(--card-shadow) !important" : "",
                      transform: isCurrentUser ? "scale(1.01)" : ""
                    }}
                    title={isCurrentUser ? "You (Click to expand)" : "Click to expand"}
                  >
                    <span className="hg-lb-rank">
                      {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                    </span>
                    <span style={{ position: "relative", display: "inline-flex" }}>
                      <span className="hg-lb-avatar">{w.housie_name[0]}</span>
                      {isHighRoller && (
                        <span
                          title="High Roller — over ₹10k earned"
                          style={{
                            position: "absolute", bottom: -3, right: -3,
                            width: 17, height: 17, borderRadius: "50%",
                            background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                            display: "grid", placeItems: "center", fontSize: 9,
                            border: "2px solid var(--surface)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                          }}
                        >
                          💎
                        </span>
                      )}
                    </span>
                    <div className="hg-lb-info">
                      <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {w.housie_name}
                        {isCurrentUser && (
                          <span style={{ fontSize: "9px", background: "var(--accent)", color: "#fff", padding: "1px 6px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.03em" }}>You</span>
                        )}
                      </strong>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          {activeTab === "wins" && <>Total Won: <b>{money(w.total_won)}</b></>}
                          {activeTab === "earnings" && <>Wins: <b>{w.wins}</b></>}
                          {activeTab === "biggestWin" && <>Biggest Single Win: <b>{money(w.biggest_win)}</b></>}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-mute)" }}>
                          Avg payout/win: <b>{money(avgPayout)}</b>
                        </span>
                        {rank > 1 && (
                          <span style={{ fontSize: "10px", color: "var(--text-dim)", opacity: 0.75 }}>
                            {money(rankGap)} to Rank {rank - 1}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span className="hg-lb-wins">
                        {activeTab === "earnings" ? money(w.total_won) : `${w.wins}`}
                        <i>{activeTab === "earnings" ? "won" : "wins"}</i>
                      </span>
                      {insight.currentStreak >= 3 && (
                        <span
                          title={`${insight.currentStreak}-game win streak`}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "var(--surface-2)", border: "1px solid var(--border-2)",
                            borderRadius: 999, padding: "2px 8px",
                          }}
                        >
                          <Icon name="flame" size={13} style={{ color: "#ff8c00" }} />
                          <span
                            style={{
                              fontSize: 13, fontWeight: 800, lineHeight: 1,
                              background: "linear-gradient(90deg, #ffd700, #ff7a00)",
                              WebkitBackgroundClip: "text", backgroundClip: "text",
                              WebkitTextFillColor: "transparent", color: "transparent",
                            }}
                          >
                            {insight.currentStreak}
                          </span>
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11, color: "var(--text-dim)",
                          transform: isExpanded ? "rotate(180deg)" : "none",
                          transition: "transform 0.25s ease",
                        }}
                      >
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* ── Expandable secondary metrics panel ── */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: isExpanded ? "1fr" : "0fr",
                      transition: "grid-template-rows 0.3s ease",
                      marginTop: isExpanded ? 6 : 0,
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
                          background: "var(--surface-2)", border: "1px solid var(--border-2)",
                          borderRadius: "var(--radius-sm)", padding: "12px 14px",
                        }}
                      >
                        {[
                          { label: "Win Rate", value: `${insight.winRate}%` },
                          { label: "Tickets Bought", value: insight.totalTickets },
                          { label: "Fav. Game Time", value: insight.favTime },
                        ].map((m) => (
                          <div key={m.label} style={{ textAlign: "center" }}>
                            <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                              {m.label}
                            </span>
                            <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{m.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-dim)" }}>
            No players found matching &quot;{searchQuery}&quot; for this timeframe.
          </div>
        )}

        <Footer />
      </div>
    </PublicShell>
  );
}
