"use client";
/**
 * Loyalty reward sections.
 *
 *  - BookieRewardsSection : a bookie's own points, ladder progress and history.
 *  - RewardsCostSection   : the Financial Admin / Superadmin reward-cost P&L plus
 *                           the abuse signals from bookieNF.md §5.8.
 *
 * Both reuse the existing .hg-panel / .hg-kpi / .hg-table primitives so they sit
 * inside the staff shell without introducing any new layout system.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { EmptyHint, KpiCard } from "@/components/ui";

/* ── Types ───────────────────────────────────────────────────────────── */

export interface BookieRewardsData {
  enabled: boolean;
  tickets_per_point: number;
  points_per_free_ticket: number;
  lifetime_tickets_sold: number;
  points_earned: number;
  points_redeemed: number;
  points_available: number;
  free_tickets_available: number;
  tickets_to_next_point: number;
  points_to_next_free_ticket: number;
  history: {
    redemption_id: string;
    units_spent: number;
    amount_waived: number;
    created_at: string;
    booking_ref: string | null;
    game_title: string | null;
  }[];
}

interface RewardsSummaryData {
  enabled: boolean;
  config: {
    tickets_per_point: number;
    points_per_free_ticket: number;
    referral_ladder: number[];
    referral_repeat_step: number;
  };
  cost: {
    total_all_time: number;
    total_30d: number;
    bookie_all_time: number;
    bookie_30d: number;
    player_all_time: number;
    player_30d: number;
    redemptions_all_time: number;
    redemptions_30d: number;
  };
  bookies: {
    user_id: string;
    full_name: string;
    lifetime_tickets_sold: number;
    points_available: number;
    points_redeemed: number;
    free_tickets_available: number;
    reward_cost: number;
    sold_tickets: number;
    direct_sale_tickets: number;
    direct_sale_share: number;
    flagged: boolean;
  }[];
  outstanding_free_tickets: number;
  suspicious_referrals: {
    referee: string;
    referrer: string;
    registered_at: string;
    qualified_at: string;
    seconds_to_qualify: number;
  }[];
}

/* ── Bookie rewards ──────────────────────────────────────────────────── */

export function BookieRewardsSection() {
  const [data, setData] = useState<BookieRewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const load = useCallback(() => {
    apiFetch<BookieRewardsData>("/api/rewards/bookie")
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load rewards"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (loading) return <div className="hg-sec"><p className="hg-sec-sub">Loading rewards…</p></div>;
  if (error) return <div className="hg-sec"><p className="hg-sec-err">{error}</p></div>;
  if (!data) return null;

  if (!data.enabled) {
    return (
      <div className="hg-sec">
        <EmptyHint icon="star" title="Rewards are paused" sub="The loyalty programme is currently switched off by the platform." />
      </div>
    );
  }

  // Progress toward the next whole free ticket.
  const perFree = data.points_per_free_ticket;
  const intoCurrent = perFree > 0 ? data.points_available % perFree : 0;
  const pct = perFree > 0 ? (intoCurrent / perFree) * 100 : 0;

  return (
    <div className="hg-sec" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Dynamic Program Guide Banner */}
      <div style={{ 
        background: "var(--surface-2)", 
        border: "1.5px solid var(--border-light)",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        padding: "16px",
        borderRadius: "16px"
      }}>
        <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "2px" }}>
          <Icon name="star" size={20} strokeWidth={2.2} />
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>
          Earn <strong style={{ color: "var(--text)" }}>1 point</strong> for every <strong style={{ color: "var(--text)" }}>{data.tickets_per_point}</strong> tickets you sell. 
          Every <strong style={{ color: "var(--text)" }}>{data.points_per_free_ticket} points</strong> unlocks a free ticket, applied directly during booking confirmation.
        </p>
      </div>

      {/* Main Stats and Cockpit Area */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", 
        gap: "20px" 
      }}>
        {/* Left Side: Balance & Progress to Next Ticket */}
        <div className="hg-panel" 
             style={{ 
               position: "relative",
               overflow: "hidden",
               border: "2px solid var(--accent)", 
               background: "linear-gradient(135deg, var(--surface), var(--surface-2))",
               boxShadow: "var(--card-shadow)",
               borderRadius: "20px",
               padding: "24px",
               display: "flex",
               flexDirection: "column",
               justifyContent: "space-between"
             }}>
          {/* Subtle Accent Glow */}
          <div style={{
            position: "absolute",
            top: "-40px",
            right: "-40px",
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: "var(--accent)",
            filter: "blur(40px)",
            opacity: 0.12,
            pointerEvents: "none"
          }} />

          <div>
            <span style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)" }}>
              Loyalty standing
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "8px" }}>
              <span style={{ fontSize: "38px", fontWeight: 900, color: "var(--accent)", fontFamily: "var(--font-head)", lineHeight: 1 }}>
                {data.points_available}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-dim)" }}>
                points available
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-mute)", marginTop: "6px" }}>
              <span>{data.points_earned} total earned</span>
              <span>•</span>
              <span>{data.points_redeemed} spent</span>
            </div>
          </div>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>
              <span style={{ color: "var(--text-dim)" }}>Next Free Ticket Progress</span>
              <span style={{ color: "var(--accent)" }}>{intoCurrent} / {perFree} pts</span>
            </div>

            {/* Glowing Custom Progress Bar */}
            <div style={{ 
              width: "100%", 
              height: "10px", 
              borderRadius: "999px", 
              background: "rgba(0, 0, 0, 0.15)",
              border: "1px solid var(--border-light)",
              position: "relative",
              overflow: "hidden"
            }}>
              <div style={{ 
                width: `${pct}%`, 
                height: "100%", 
                borderRadius: "999px", 
                background: "var(--cta)",
                boxShadow: pct > 0 ? "0 0 12px var(--cta)" : "none",
                transition: "width .4s cubic-bezier(0.4, 0, 0.2, 1)"
              }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-mute)", marginTop: "10px" }}>
              <span>Next point in: <strong>{data.tickets_to_next_point} ticket{data.tickets_to_next_point === 1 ? "" : "s"}</strong></span>
              {data.points_to_next_free_ticket > 0 && (
                <span><strong>{data.points_to_next_free_ticket} pts</strong> to unlock</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Free Tickets & Action Prompt */}
        <div className="hg-panel" 
             style={{ 
               border: "1.5px solid var(--border)", 
               background: "var(--surface)",
               borderRadius: "20px",
               padding: "24px",
               display: "flex",
               flexDirection: "column",
               justifyContent: "space-between"
             }}>
          <div>
            <span style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)" }}>
              Reward tickets
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px" }}>
              <div style={{ 
                width: "48px", 
                height: "48px", 
                borderRadius: "14px", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                background: data.free_tickets_available > 0 ? "var(--accent-soft)" : "var(--surface-2)",
                color: data.free_tickets_available > 0 ? "var(--accent)" : "var(--text-mute)",
                border: "1.5px solid var(--border-light)"
              }}>
                <Icon name="ticket" size={22} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: "32px", fontWeight: 900, color: "var(--text)", fontFamily: "var(--font-head)", lineHeight: 1 }}>
                  {data.free_tickets_available}
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-dim)", marginTop: "4px" }}>
                  free ticket{data.free_tickets_available === 1 ? "" : "s"} ready
                </div>
              </div>
            </div>
          </div>

          <div style={{ 
            marginTop: "20px", 
            padding: "14px", 
            borderRadius: "12px", 
            fontSize: "12px", 
            lineHeight: 1.5,
            background: data.free_tickets_available > 0 ? "var(--success-soft)" : "var(--surface-2)", 
            color: data.free_tickets_available > 0 ? "var(--success)" : "var(--text-dim)",
            border: data.free_tickets_available > 0 ? "1px solid var(--success)" : "1px solid var(--border-light)"
          }}>
            {data.free_tickets_available > 0 ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <div style={{ color: "var(--success)", flexShrink: 0, marginTop: "1px" }}>
                  <Icon name="check" size={16} strokeWidth={2.5} />
                </div>
                <span>
                  <strong>Free Ticket Ready!</strong> Toggle the <em>&ldquo;use free ticket&rdquo;</em> checkbox on your next booking queue confirmation.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <div style={{ color: "var(--text-mute)", flexShrink: 0, marginTop: "1px" }}>
                  <Icon name="clock" size={16} strokeWidth={2} />
                </div>
                <span>
                  Loyalty rewards are applied automatically. Sell more tickets to reach your next reward.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row of Performance Statistics Cards */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", 
        gap: "12px" 
      }}>
        <div className="hg-panel" style={{ padding: "16px", borderRadius: "16px", border: "1.5px solid var(--border-light)", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ color: "var(--accent)", background: "var(--surface-2)", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", flexShrink: 0, border: "1px solid var(--border-light)", justifyContent: "center" }}>
            <Icon name="grid" size={16} />
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-mute)" }}>Total Tickets Sold</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)", marginTop: "2px" }}>{data.lifetime_tickets_sold}</div>
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "16px", borderRadius: "16px", border: "1.5px solid var(--border-light)", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ color: "var(--success)", background: "var(--surface-2)", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", flexShrink: 0, border: "1px solid var(--border-light)", justifyContent: "center" }}>
            <Icon name="star" size={16} />
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-mute)" }}>Lifetime Points</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)", marginTop: "2px" }}>{data.points_earned}</div>
          </div>
        </div>

        <div className="hg-panel" style={{ padding: "16px", borderRadius: "16px", border: "1.5px solid var(--border-light)", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ color: "var(--text-dim)", background: "var(--surface-2)", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", flexShrink: 0, border: "1px solid var(--border-light)", justifyContent: "center" }}>
            <Icon name="check" size={16} />
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-mute)" }}>Points Redeemed</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)", marginTop: "2px" }}>{data.points_redeemed}</div>
          </div>
        </div>
      </div>

      {/* Redemption History Panel (Fully Responsive: Table on Desktop, Cards on Mobile) */}
      <div className="hg-panel" style={{ borderRadius: "20px", border: "1.5px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1.5px solid var(--border-light)", padding: "16px 20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={15} /> Redemption history
          </h3>
        </div>

        {data.history.length === 0 ? (
          <EmptyHint icon="star" title="Nothing redeemed yet" sub="Free tickets you claim will be listed here with the booking they were used on." />
        ) : isMobile ? (
          /* Mobile Card List Layout: 100% visible on small screens without side-scrolling */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
            {data.history.map((h) => (
              <div key={h.redemption_id} 
                   style={{ 
                     background: "var(--surface-2)", 
                     border: "1px solid var(--border-light)", 
                     borderRadius: "14px", 
                     padding: "14px",
                     display: "flex",
                     flexDirection: "column",
                     gap: "10px"
                   }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                      {h.game_title ?? "Housie Draw"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-mute)", marginTop: "2px" }}>
                      {new Date(h.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  <strong style={{ fontSize: "14px", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                    {money(h.amount_waived)}
                  </strong>
                </div>

                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  fontSize: "11px", 
                  paddingTop: "8px", 
                  borderTop: "1px dashed var(--border-light)", 
                  color: "var(--text-dim)" 
                }}>
                  <span>Cost</span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{h.units_spent} points spent</span>
                </div>

                {h.booking_ref && (
                  <div style={{ fontSize: "10px", color: "var(--text-mute)" }}>
                    Booking Ref: <code style={{ color: "var(--text-dim)" }}>{h.booking_ref}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Table Layout */
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "560px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr", borderBottom: "1.5px solid var(--border-light)" }}>
                <span>When</span>
                <span>Game</span>
                <span>Points</span>
                <span style={{ textAlign: "right" }}>Value</span>
              </div>
              {data.history.map((h) => (
                <div key={h.redemption_id} className="hg-tr" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <b style={{ color: "var(--text)" }}>
                      {new Date(h.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </b>
                    {h.booking_ref && (
                      <div className="hg-dim" style={{ fontSize: "10px", marginTop: "2px" }}>{h.booking_ref}</div>
                    )}
                  </div>
                  <span className="hg-dim">{h.game_title ?? "—"}</span>
                  <span style={{ color: "var(--text)" }}>{h.units_spent} pts</span>
                  <strong style={{ color: "var(--accent)", textAlign: "right" }}>{money(h.amount_waived)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Reward cost + abuse signals (Financial Admin / Superadmin) ───────── */

export function RewardsCostSection() {
  const [data, setData] = useState<RewardsSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<RewardsSummaryData>("/api/rewards/summary")
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reward costs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="hg-sec"><p className="hg-sec-sub">Loading reward costs…</p></div>;
  if (error) return <div className="hg-sec"><p className="hg-sec-err">{error}</p></div>;
  if (!data) return null;

  const flagged = data.bookies.filter((b) => b.flagged);

  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">
        What the loyalty programme actually costs. Free tickets are absorbed by the platform, so every rupee here is
        margin that has already left the building.
      </p>

      <div className="hg-kpi-grid">
        <KpiCard label="Reward cost (30 days)" value={money(data.cost.total_30d)} sub={`${data.cost.redemptions_30d} redemptions`} tone="alert" />
        <KpiCard label="Reward cost (all time)" value={money(data.cost.total_all_time)} sub={`${data.cost.redemptions_all_time} redemptions`} />
        <KpiCard label="Unclaimed free tickets" value={String(data.outstanding_free_tickets)} sub="earned but not yet spent" />
      </div>

      <div className="hg-panel" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="wallet" size={16} /> Cost split by programme
          </h3>
        </div>
        <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
          <div className="hg-table" style={{ minWidth: "480px" }}>
            <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <span>Programme</span>
              <span>Last 30 days</span>
              <span style={{ textAlign: "right" }}>All time</span>
            </div>
            <div className="hg-tr" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <span style={{ color: "var(--text)" }}>Bookie points</span>
              <span>{money(data.cost.bookie_30d)}</span>
              <strong style={{ color: "var(--accent)", textAlign: "right" }}>{money(data.cost.bookie_all_time)}</strong>
            </div>
            <div className="hg-tr" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <span style={{ color: "var(--text)" }}>Player referrals</span>
              <span>{money(data.cost.player_30d)}</span>
              <strong style={{ color: "var(--accent)", textAlign: "right" }}>{money(data.cost.player_all_time)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="hg-panel" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="users" size={16} /> Bookie standing
          </h3>
        </div>
        {data.bookies.length === 0 ? (
          <EmptyHint icon="users" title="No bookies yet" sub="Bookie point balances will appear here once agents start selling." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "760px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr" }}>
                <span>Bookie</span>
                <span>Tickets sold</span>
                <span>Points left</span>
                <span>Free tickets</span>
                <span>Reward cost</span>
                <span style={{ textAlign: "right" }}>Direct sales</span>
              </div>
              {data.bookies.map((b) => (
                <div key={b.user_id} className="hg-tr" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr" }}>
                  <div>
                    <b style={{ color: "var(--text)" }}>{b.full_name}</b>
                    {b.flagged && (
                      <div style={{ fontSize: "10px", marginTop: "2px", color: "var(--danger)", fontWeight: 600 }}>
                        needs a look
                      </div>
                    )}
                  </div>
                  <span className="hg-dim">{b.lifetime_tickets_sold}</span>
                  <span style={{ color: "var(--text)" }}>{b.points_available}</span>
                  <span style={{ color: "var(--text)" }}>{b.free_tickets_available}</span>
                  <strong style={{ color: "var(--accent)" }}>{money(b.reward_cost)}</strong>
                  <span style={{ textAlign: "right", color: b.flagged ? "var(--danger)" : "var(--text-dim)" }}>
                    {b.direct_sale_share}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {flagged.length > 0 && (
          <p className="hg-dim" style={{ fontSize: "11px", marginTop: "12px", lineHeight: 1.6 }}>
            Points only accrue on a sold booking, so the way to inflate them is to self-issue direct sales. A bookie
            whose volume is almost entirely direct sales is worth checking. This is a prompt to look, not proof of
            anything.
          </p>
        )}
      </div>

      <div className="hg-panel" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="shield" size={16} /> Fast-qualifying referrals
          </h3>
        </div>
        {data.suspicious_referrals.length === 0 ? (
          <EmptyHint icon="shieldCheck" title="Nothing unusual" sub="Referrals that sign up and buy within 5 minutes of each other would be listed here." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "560px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr" }}>
                <span>New player</span>
                <span>Referred by</span>
                <span style={{ textAlign: "right" }}>Signup → purchase</span>
              </div>
              {data.suspicious_referrals.map((s, i) => (
                <div key={`${s.referee}-${i}`} className="hg-tr" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr" }}>
                  <b style={{ color: "var(--text)" }}>{s.referee}</b>
                  <span className="hg-dim">{s.referrer}</span>
                  <span style={{ textAlign: "right", color: "var(--danger)" }}>{s.seconds_to_qualify}s</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
