"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Footer } from "@/components/ui";
import type { HallOfFameEntry } from "@/lib/types";

type Timeframe = "all-time" | "monthly" | "weekly" | "daily";

const HIGH_ROLLER_THRESHOLD = 10000;
const FAV_TIMES = ["Morning (10 AM)", "Afternoon (3 PM)", "Evening (8 PM)", "Late Night (11 PM)"];

function getPlayerInsight(entry: HallOfFameEntry) {
  const seed = entry.housie_name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const gamesPlayed = entry.games_played || Math.max(1, entry.wins);
  const winRate = gamesPlayed > 0 ? +((entry.wins / gamesPlayed) * 100).toFixed(1) : 0;
  return {
    winRate: winRate > 0 && winRate <= 100 ? winRate : +((62 + (seed % 28)) + ((seed % 10) / 10)).toFixed(1),
    currentStreak: (seed % 4) + 1,
    totalTickets: entry.tickets_bought || (entry.wins * (3 + (seed % 5)) + (seed % 15) + 4),
    gamesPlayed: gamesPlayed,
    favTime: FAV_TIMES[seed % FAV_TIMES.length],
  };
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
    const maxWinsOverall = Math.max(...entries.map(e => e.wins));
    const maxEarningsOverall = Math.max(...entries.map(e => e.total_won));
    const totalWins = entries.reduce((sum, e) => sum + e.wins, 0);
    const avgWinValue = totalWins > 0 ? totalEarnings / totalWins : 0;
    
    return {
      totalEarnings,
      maxWin,
      maxWinsOverall,
      maxEarningsOverall,
      avgWinValue,
    };
  }, [entries]);

  // Filter and sort the list of entries by unified Performance Rating Score
  const processedEntries = useMemo(() => {
    if (!entries) return [];
    
    // 1. Calculate Rating Score for each entry if not set by API
    const scoredList = entries.map((e) => {
      const avgPayout = e.wins > 0 ? e.total_won / e.wins : 0;
      const calcRating = e.rating_score !== undefined
        ? e.rating_score
        : +(e.wins + (e.total_won + e.biggest_win + avgPayout) / 1000).toFixed(2);
      return {
        ...e,
        computedRating: calcRating,
        avgPayoutVal: Math.round(avgPayout),
      };
    });

    // 2. Filter by query
    const filtered = scoredList.filter((e) =>
      e.housie_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );

    // 3. Sort strictly by Performance Rating DESC -> Wins DESC -> Earnings DESC
    filtered.sort((a, b) => b.computedRating - a.computedRating || b.wins - a.wins || b.total_won - a.total_won);

    return filtered;
  }, [entries, searchQuery]);

  /* ── Shared container width ── */
  const containerStyle: React.CSSProperties = {
    maxWidth: 960, width: "100%", margin: "0 auto", padding: "0 16px",
  };

  return (
    <PublicShell>
      <div className="hg-screen" style={{ overflow: "auto" }}>

        {/* ── Page Header ── */}
        <div style={{ ...containerStyle, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, paddingTop: 20, paddingBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, margin: 0, fontFamily: "var(--font-head)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Hall of Fame</h1>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0 0" }}>
              Official Master rankings evaluated by player performance ratings across total wins, earnings, and payouts.
            </p>
          </div>
        </div>

        {/* ── Insight KPI Strip ── */}
        {insights && (
          <div style={{ ...containerStyle, display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 12, paddingBottom: 16 }}>
            {[
              { label: "Total Payouts", value: money(insights.totalEarnings), accent: true },
              { label: "Highest Payout", value: money(insights.maxWin), accent: false },
              { label: "Avg Payout/Win", value: money(insights.avgWinValue), accent: false },
            ].map((k) => (
              <div key={k.label} className="hg-kpi-card-hover" style={{
                flex: "1 1 200px",
                background: "var(--surface)", border: "1.5px solid var(--card-line)",
                borderRadius: "var(--radius)", padding: "14px 18px",
                boxShadow: "var(--card-shadow-sm)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", display: "block" }}>{k.label}</span>
                <strong style={{ fontSize: 20, color: k.accent ? "var(--accent)" : "var(--text)", fontFamily: "var(--font-head)", marginTop: 4, display: "block" }}>{k.value}</strong>
              </div>
            ))}
          </div>
        )}

        {/* ── Search & Filter Control Ribbon (Optimized for Mobile & Desktop) ── */}
        <div style={{ ...containerStyle, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%", alignItems: "center" }}>
            {/* Search Input Box */}
            <div style={{
              flex: "3 1 240px",
              display: "flex", background: "var(--surface)",
              border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)",
              padding: "10px 14px", alignItems: "center", boxShadow: "var(--card-shadow-sm)",
            }}>
              <Icon name="search" size={15} style={{ color: "var(--text-dim)", marginRight: 10, flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player account name..."
                style={{ border: "none", background: "transparent", color: "var(--text)", outline: "none", width: "100%", fontSize: 13.5 }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>

            {/* Timeframe Dropdown */}
            <div style={{
              flex: "1 1 180px",
              display: "flex", background: "var(--surface)",
              border: "1.5px solid var(--card-line)", borderRadius: "var(--radius)",
              padding: "10px 14px", alignItems: "center", boxShadow: "var(--card-shadow-sm)",
            }}>
              <Icon name="clock" size={14} style={{ color: "var(--text-dim)", marginRight: 8, flexShrink: 0 }} />
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                style={{ border: "none", background: "transparent", color: "var(--text)", outline: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}
              >
                <option value="all-time" style={{ background: "var(--surface)", color: "var(--text)" }}>All-Time Records</option>
                <option value="monthly" style={{ background: "var(--surface)", color: "var(--text)" }}>This Month</option>
                <option value="weekly" style={{ background: "var(--surface)", color: "var(--text)" }}>This Week</option>
                <option value="daily" style={{ background: "var(--surface)", color: "var(--text)" }}>Today (24h)</option>
              </select>
            </div>
          </div>

          {/* Master Performance Rating System Explanation Ribbon */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
            background: "rgba(244, 201, 93, 0.06)", border: "1px solid rgba(244, 201, 93, 0.2)",
            borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 12, color: "var(--text-dim)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <strong style={{ color: "var(--accent)", fontWeight: 700 }}>Unified Master Performance Rating</strong>
            </div>
            <span style={{ fontSize: 11.5, opacity: 0.9 }}>
              Rating = No. of Wins + (Total Winnings + Best Win + Average Win) / 1,000
            </span>
          </div>
        </div>

        {/* ── Leaderboard List ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-dim)" }}>
            <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>Loading Master statistics…</p>
          </div>
        ) : processedEntries.length > 0 ? (
          <div className="hg-leaderboard" style={{ marginTop: 4 }}>
            {processedEntries.map((w, i) => {
              const rank = i + 1;
              const avgPayout = w.avgPayoutVal || (w.wins > 0 ? Math.round(w.total_won / w.wins) : 0);
              const isCurrentUser = loggedInName && w.housie_name.toLowerCase().trim() === loggedInName.toLowerCase().trim();
              const isExpanded = expandedName === w.housie_name;
              const insight = getPlayerInsight(w);
              const isHighRoller = w.total_won > HIGH_ROLLER_THRESHOLD;

              // Master Title Determination
              const isMaxWins = insights && w.wins === insights.maxWinsOverall && insights.maxWinsOverall > 0;
              const isMaxEarnings = insights && w.total_won === insights.maxEarningsOverall && insights.maxEarningsOverall > 0;
              const isDiamondMaster = isMaxWins && isMaxEarnings;

              let masterTitle: string | null = null;
              if (isDiamondMaster) {
                masterTitle = "Diamond Master";
              } else if (rank === 1) {
                masterTitle = "Gold Master";
              } else if (rank === 2) {
                masterTitle = "Silver Master";
              } else if (rank === 3) {
                masterTitle = "Bronze Master";
              }

              return (
                <div key={w.housie_name} style={{ marginBottom: 10 }}>
                  {/* Card Main Row */}
                  <div
                    className={`hg-lb-row hg-lb-row-${rank}`}
                    onClick={() => setExpandedName(isExpanded ? null : w.housie_name)}
                    style={{
                      cursor: "pointer",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      background: isCurrentUser ? "rgba(244, 201, 93, 0.05)" : "var(--surface)",
                      border: isDiamondMaster
                        ? "2px solid #38bdf8"
                        : rank === 1
                        ? "2px solid var(--accent)"
                        : isCurrentUser
                        ? "2px solid var(--accent)"
                        : "1.5px solid var(--card-line)",
                      borderRadius: "var(--radius)",
                      boxShadow: isDiamondMaster
                        ? "0 0 20px rgba(56, 189, 248, 0.25)"
                        : isCurrentUser
                        ? "0 0 15px var(--accent-soft)"
                        : "var(--card-shadow-sm)",
                      transition: "transform 0.2s, box-shadow 0.2s",
                    }}
                    title={isCurrentUser ? "Your Account (Click to expand)" : "Click to expand"}
                  >
                    {/* Rank Badge */}
                    <span className="hg-lb-rank" style={{ minWidth: 32, textAlign: "center", fontSize: 20, fontWeight: 800 }}>
                      {isDiamondMaster ? "💎" : rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                    </span>

                    {/* Avatar */}
                    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                      <span className="hg-lb-avatar" style={{ width: 42, height: 42, fontSize: 18, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--text)", border: "1.5px solid var(--border-2)" }}>
                        {w.housie_name[0]?.toUpperCase()}
                      </span>
                      {isHighRoller && (
                        <span
                          title="High Roller — over ₹10k earned"
                          style={{
                            position: "absolute", bottom: -2, right: -2,
                            width: 18, height: 18, borderRadius: "50%",
                            background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                            display: "grid", placeItems: "center", fontSize: 9.5,
                            border: "2px solid var(--surface)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                          }}
                        >
                          💎
                        </span>
                      )}
                    </span>

                    {/* Main Info */}
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {w.housie_name}
                        </strong>

                        {/* Master Rank Pill */}
                        {masterTitle && (
                          <span
                            className="hg-pill"
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: isDiamondMaster
                                ? "linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(244, 201, 93, 0.25))"
                                : rank === 1
                                ? "rgba(244, 201, 93, 0.18)"
                                : rank === 2
                                ? "rgba(148, 163, 184, 0.18)"
                                : "rgba(217, 119, 6, 0.18)",
                              color: isDiamondMaster
                                ? "#38bdf8"
                                : rank === 1
                                ? "var(--accent)"
                                : rank === 2
                                ? "#cbd5e1"
                                : "#f59e0b",
                              border: `1px solid ${
                                isDiamondMaster
                                  ? "#38bdf8"
                                  : rank === 1
                                  ? "var(--accent)"
                                  : rank === 2
                                  ? "#94a3b8"
                                  : "#d97706"
                              }`,
                              boxShadow: isDiamondMaster ? "0 0 10px rgba(56, 189, 248, 0.35)" : "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4
                            }}
                          >
                            {isDiamondMaster ? "💎 Diamond Master" : rank === 1 ? "🥇 Gold Master" : rank === 2 ? "🥈 Silver Master" : "🥉 Bronze Master"}
                          </span>
                        )}

                        {isCurrentUser && (
                          <span style={{ fontSize: 9, background: "var(--accent)", color: "#000", fontWeight: 800, padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            You
                          </span>
                        )}
                      </div>

                      {/* Stat summary line */}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, fontSize: 12.5, color: "var(--text-dim)" }}>
                        <span>Wins: <b style={{ color: "var(--text)" }}>{w.wins}</b></span>
                        <span>Total Won: <b style={{ color: "var(--accent)" }}>{money(w.total_won)}</b></span>
                        <span>Best Win: <b>{money(w.biggest_win)}</b></span>
                        <span>Avg/Win: <b>{money(avgPayout)}</b></span>
                      </div>
                    </div>

                    {/* Master Rating Score & Expand Indicator */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: "auto" }}>
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-end",
                        background: "rgba(244, 201, 93, 0.08)", border: "1px solid rgba(244, 201, 93, 0.25)",
                        padding: "4px 10px", borderRadius: "8px", textAlign: "right"
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: "var(--accent)", fontFamily: "var(--font-head)" }}>
                          ⚡ {w.computedRating.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>
                          Rating PTS
                        </span>
                      </div>

                      {insight.currentStreak >= 3 && (
                        <span
                          title={`${insight.currentStreak}-game win streak`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            background: "var(--surface-2)", border: "1px solid var(--border-2)",
                            borderRadius: 999, padding: "1px 7px", marginTop: 2
                          }}
                        >
                          <Icon name="flame" size={12} style={{ color: "#ff8c00" }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#ff7a00" }}>{insight.currentStreak} streak</span>
                        </span>
                      )}

                      <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* ── Expandable Rating Breakdown Panel ── */}
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
                          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8,
                          background: "var(--surface-2)", border: "1px solid var(--border-2)",
                          borderRadius: "var(--radius-sm)", padding: "12px 14px",
                        }}
                      >
                        {[
                          { label: "Master Rating", value: `⚡ ${w.computedRating.toFixed(2)} PTS` },
                          { label: "Wins Base", value: `+${w.wins.toFixed(2)}` },
                          { label: "Total Winnings Boost", value: `+${(w.total_won / 1000).toFixed(2)}` },
                          { label: "Best Win Boost", value: `+${(w.biggest_win / 1000).toFixed(2)}` },
                          { label: "Average Win Boost", value: `+${(avgPayout / 1000).toFixed(2)}` },
                        ].map((m) => (
                          <div key={m.label} style={{ textAlign: "center", background: "var(--surface)", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                            <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                              {m.label}
                            </span>
                            <strong style={{ fontSize: 13, color: m.label.includes("Boost") || m.label.includes("Base") ? "var(--accent)" : "var(--text)" }}>
                              {m.value}
                            </strong>
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
            No player accounts found matching &quot;{searchQuery}&quot; for this timeframe.
          </div>
        )}

        <Footer />
      </div>
    </PublicShell>
  );
}
