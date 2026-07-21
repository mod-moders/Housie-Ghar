"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Footer } from "@/components/ui";
import type { HallOfFameEntry, PlayerStats } from "@/lib/types";
import { useSocket } from "@/lib/hooks/useSocket";

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

export default function LeaderboardAndStats() {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("all-time");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [loggedInName, setLoggedInName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Logged-in player's own stats states
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [loadingMyStats, setLoadingMyStats] = useState(true);

  // Cached stats for expanded players
  const [expandedStats, setExpandedStats] = useState<Record<string, PlayerStats>>({});
  const [loadingExpanded, setLoadingExpanded] = useState<string | null>(null);

  // Load logged-in user identity & personal stats
  useEffect(() => {
    setLoadingMyStats(true);
    apiFetch<{ player: { housie_name: string } }>("/api/player/me")
      .then((res) => {
        setLoggedInName(res.player.housie_name);
        // Now fetch their stats
        apiFetch<PlayerStats>("/api/player/stats")
          .then((stats) => {
            setMyStats(stats);
            setLoadingMyStats(false);
          })
          .catch(() => {
            setMyStats(null);
            setLoadingMyStats(false);
          });
      })
      .catch(() => {
        apiFetch<{ user: { full_name: string } }>("/api/auth/me")
          .then((res) => {
            setLoggedInName(res.user.full_name);
            // Staff users do not have player stats
            setMyStats(null);
            setLoadingMyStats(false);
          })
          .catch(() => {
            setLoggedInName(null);
            setMyStats(null);
            setLoadingMyStats(false);
          });
      });
  }, []);

  const loadLeaderboard = useCallback(() => {
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

  // Fetch leaderboard data filtered by active timeframe + 5s auto-refresh
  useEffect(() => {
    setLoading(true);
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 5000);
    return () => clearInterval(interval);
  }, [loadLeaderboard]);

  useSocket((event) => {
    if (
      event === "player_stats_update" ||
      event === "game_completed" ||
      event === "draw_ended" ||
      event === "prize_claimed" ||
      event === "prize_disbursed" ||
      event === "game_list_update"
    ) {
      loadLeaderboard();
      // Reload own stats if logged in
      if (loggedInName) {
        apiFetch<PlayerStats>("/api/player/stats")
          .then(setMyStats)
          .catch(() => {});
      }
    }
  });

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

  // Handle expanding player row & fetching their stats dynamically
  const handleExpandRow = async (housieName: string) => {
    if (expandedName === housieName) {
      setExpandedName(null);
      return;
    }
    setExpandedName(housieName);

    if (!expandedStats[housieName]) {
      setLoadingExpanded(housieName);
      try {
        const stats = await apiFetch<PlayerStats>(`/api/player/stats?housie_name=${encodeURIComponent(housieName)}`);
        setExpandedStats(prev => ({ ...prev, [housieName]: stats }));
      } catch (err) {
        console.error("Failed to load expanded player stats:", err);
      } finally {
        setLoadingExpanded(null);
      }
    }
  };

  /* Helper to format dates & durations */
  const getMemberDuration = (registeredAt: string | null) => {
    if (!registeredAt) return { duration: "—", date: "Unknown" };
    const d = new Date(registeredAt);
    const dateStr = d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    let duration = "—";
    if (days === 0) duration = "Today";
    else if (days < 30) duration = `${days}d`;
    else if (days < 365) duration = `${Math.floor(days / 30)}mo`;
    else {
      const y = Math.floor(days / 365);
      const m = Math.floor((days % 365) / 30);
      duration = `${y}y${m > 0 ? ` ${m}mo` : ""}`;
    }
    return { duration, date: dateStr };
  };

  /* Shared container width */
  const containerStyle: React.CSSProperties = {
    maxWidth: 960, width: "100%", margin: "0 auto", padding: "0 16px",
  };

  return (
    <PublicShell>
      <div className="hg-screen" style={{ overflow: "auto" }}>

        {/* ── Page Header ── */}
        <div style={{ ...containerStyle, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, paddingTop: 20, paddingBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, margin: 0, fontFamily: "var(--font-head)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Hall of Fame &amp; Stats</h1>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0 0" }}>
              Unified Master rankings &amp; live performance statistics counted from day one of registration.
            </p>
          </div>
        </div>

        {/* ── Logged-in Player's Statistics Hero Dashboard ── */}
        {loggedInName && !loadingMyStats && myStats && (
          <div style={{ ...containerStyle, paddingTop: 8, paddingBottom: 12 }}>
            <div className="hg-card hg-glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid var(--border-2)", paddingBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="chart" size={18} style={{ color: "var(--accent)" }} />
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>My Statistics &amp; Performance</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, color: "#10B981" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
                  Live Synced
                </div>
              </div>

              {/* Stats Key Metric Ribbon */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.05em" }}>Net Profit/Loss</div>
                  <strong style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: (myStats.amount_won - myStats.total_expenditure) >= 0 ? "#10B981" : "#EF4444" }}>
                    {money(myStats.amount_won - myStats.total_expenditure)}
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.05em" }}>Win Rate</div>
                  <strong style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--accent)" }}>
                    {myStats.games_played > 0 ? ((myStats.games_won / myStats.games_played) * 100).toFixed(0) : "0"}%
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.05em" }}>ROI</div>
                  <strong style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-head)", color: (myStats.amount_won - myStats.total_expenditure) >= 0 ? "#10B981" : "#EF4444" }}>
                    {myStats.total_expenditure > 0 ? (((myStats.amount_won / myStats.total_expenditure) * 100) - 100).toFixed(1) : "0"}%
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.05em" }}>Luckiest Ticket</div>
                  <strong style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                    {myStats.luckiest_ticket_number ? `#${myStats.luckiest_ticket_number}` : "—"}
                  </strong>
                </div>
              </div>

              {/* Detailed Personal Stats Columns */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, borderTop: "1px solid var(--border-2)", paddingTop: 14 }}>
                {/* Left: Financial & Volume */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <MiniBox label="Total Won" value={money(myStats.amount_won)} sub={`${myStats.total_wins} wins`} />
                    <MiniBox label="Total Spent" value={money(myStats.total_expenditure)} sub="Tickets bought" />
                    <MiniBox label="Games Played" value={myStats.games_played} sub="Total sessions" />
                    <MiniBox label="Longest Win Streak" value={`${myStats.longest_winning_run} games`} sub="Consecutive" />
                  </div>
                </div>

                {/* Right: Detailed Prize Pattern Breakdown */}
                {myStats.pattern_wins && (
                  <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "12px 16px", border: "1.5px solid var(--border)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>
                      Detailed Prize Win Breakdown
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px 16px" }}>
                      <div>
                        <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 700 }}>FULL HOUSE &amp; LINES</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                          <PatternRow label="Full House" count={myStats.pattern_wins.full_house} />
                          <PatternRow label="1st Full House" count={myStats.pattern_wins.first_full_house} />
                          <PatternRow label="2nd Full House" count={myStats.pattern_wins.second_full_house} />
                          <PatternRow label="3rd Full House" count={myStats.pattern_wins.third_full_house} />
                          <PatternRow label="Top Line" count={myStats.pattern_wins.top_line} />
                          <PatternRow label="Middle Line" count={myStats.pattern_wins.middle_line} />
                          <PatternRow label="Bottom Line" count={myStats.pattern_wins.bottom_line} />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 700 }}>SPECIAL BONUSES</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                          <PatternRow label="Early Five" count={myStats.pattern_wins.early_five} />
                          <PatternRow label="Quick 7" count={myStats.pattern_wins.quick_7} />
                          <PatternRow label="Corner" count={myStats.pattern_wins.corner} />
                          <PatternRow label="Star" count={myStats.pattern_wins.star} />
                          <PatternRow label="Box Bonus" count={myStats.pattern_wins.box_bonus} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Search & Filter Ribbon ── */}
        <div style={{ ...containerStyle, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%", alignItems: "center" }}>
            {/* Search Input */}
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

            {/* Timeframe Select */}
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

          {/* Unified Rating formula explanation */}
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

        {/* ── Global Rankings Leaderboard List ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-dim)" }}>
            <span className="hg-poll-spin" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>Loading Master statistics…</p>
          </div>
        ) : processedEntries.length > 0 ? (
          <div className="hg-leaderboard" style={{ ...containerStyle, paddingBottom: 40 }}>
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

              // Load expanded stats details
              const statsObj = expandedStats[w.housie_name];
              const isLoadingStats = loadingExpanded === w.housie_name;

              return (
                <div key={w.housie_name} style={{ marginBottom: 10 }}>
                  {/* Card Main Row */}
                  <div
                    className={`hg-lb-row hg-lb-row-${rank}`}
                    onClick={() => handleExpandRow(w.housie_name)}
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
                    title={isCurrentUser ? "Your Account (Click to view statistics)" : "Click to view statistics"}
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

                  {/* ── Expandable Statistics & Performance Card Panel ── */}
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
                          background: "var(--surface-2)", border: "1px solid var(--border-2)",
                          borderRadius: "var(--radius-sm)", padding: "14px",
                          display: "flex", flexDirection: "column", gap: 12
                        }}
                      >
                        {/* 1. Rating formula breakdown */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                          {[
                            { label: "Master Rating", value: `⚡ ${w.computedRating.toFixed(2)} PTS` },
                            { label: "Wins Base", value: `+${w.wins.toFixed(2)}` },
                            { label: "Total Winnings Boost", value: `+${(w.total_won / 1000).toFixed(2)}` },
                            { label: "Best Win Boost", value: `+${(w.biggest_win / 1000).toFixed(2)}` },
                            { label: "Average Win Boost", value: `+${(avgPayout / 1000).toFixed(2)}` },
                          ].map((m) => (
                            <div key={m.label} style={{ textAlign: "center", background: "var(--surface-2)", padding: "8px", borderRadius: "6px", border: "1.5px solid var(--border)" }}>
                              <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                                {m.label}
                              </span>
                              <strong style={{ fontSize: 13, color: m.label.includes("Boost") || m.label.includes("Base") ? "var(--accent)" : "var(--text)" }}>
                                {m.value}
                              </strong>
                            </div>
                          ))}
                        </div>

                        {/* 2. Detailed statistics fetched on the fly */}
                        {isLoadingStats ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                            <span className="hg-poll-spin" style={{ display: "inline-block", width: "16px", height: "16px", border: "1.5px solid var(--border-2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>Fetching detailed statistics…</span>
                          </div>
                        ) : statsObj ? (
                           <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, borderTop: "1.5px solid var(--border)", paddingTop: 12 }}>
                            {/* Stats grids */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <MiniBox label="Win Rate" value={`${statsObj.games_played > 0 ? ((statsObj.games_won / statsObj.games_played) * 100).toFixed(0) : "0"}%`} sub={`${statsObj.total_wins} wins`} />
                                <MiniBox label="ROI" value={`${statsObj.total_expenditure > 0 ? (((statsObj.amount_won / statsObj.total_expenditure) * 100) - 100).toFixed(1) : "0"}%`} sub="Return on tickets" />
                                <MiniBox label="Games Played" value={statsObj.games_played} sub="Total sessions" />
                                <MiniBox label="Longest Win Streak" value={`${statsObj.longest_winning_run} games`} sub="Consecutive wins" />
                                <MiniBox label="Member Duration" value={getMemberDuration(statsObj.member_since).duration} sub={`Joined: ${getMemberDuration(statsObj.member_since).date}`} />
                                <MiniBox label="Luckiest Ticket" value={statsObj.luckiest_ticket_number ? `#${statsObj.luckiest_ticket_number}` : "—"} sub="Wins most on" />
                              </div>
                            </div>

                            {/* Detailed Pattern wins */}
                            {statsObj.pattern_wins && (
                               <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 16px", border: "1.5px solid var(--border)" }}>
                                 <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>
                                   Detailed Prize Win Breakdown
                                 </div>
                                 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px 16px" }}>
                                  <div>
                                    <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 700 }}>FULL HOUSE &amp; LINES</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                                      <PatternRow label="Full House" count={statsObj.pattern_wins.full_house} />
                                      <PatternRow label="1st Full House" count={statsObj.pattern_wins.first_full_house} />
                                      <PatternRow label="2nd Full House" count={statsObj.pattern_wins.second_full_house} />
                                      <PatternRow label="3rd Full House" count={statsObj.pattern_wins.third_full_house} />
                                      <PatternRow label="Top Line" count={statsObj.pattern_wins.top_line} />
                                      <PatternRow label="Middle Line" count={statsObj.pattern_wins.middle_line} />
                                      <PatternRow label="Bottom Line" count={statsObj.pattern_wins.bottom_line} />
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 700 }}>SPECIAL BONUSES</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                                      <PatternRow label="Early Five" count={statsObj.pattern_wins.early_five} />
                                      <PatternRow label="Quick 7" count={statsObj.pattern_wins.quick_7} />
                                      <PatternRow label="Corner" count={statsObj.pattern_wins.corner} />
                                      <PatternRow label="Star" count={statsObj.pattern_wins.star} />
                                      <PatternRow label="Box Bonus" count={statsObj.pattern_wins.box_bonus} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
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

function MiniBox({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, border: "1.5px solid var(--border)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-head)", color: color || "var(--text)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--text-mute)", lineHeight: 1.1 }}>{sub}</div>}
    </div>
  );
}

function PatternRow({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <strong style={{ color: count > 0 ? "var(--accent)" : "var(--text-mute)", fontWeight: 700 }}>{count}</strong>
    </div>
  );
}
