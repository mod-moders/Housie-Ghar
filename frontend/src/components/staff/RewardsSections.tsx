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

/* ── Shared progress bar ─────────────────────────────────────────────── */

function RewardProgress({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ marginTop: "10px" }}>
      <div
        style={{
          height: "8px",
          borderRadius: "999px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            borderRadius: "999px",
            background: "var(--cta)",
            transition: "width .35s ease",
          }}
        />
      </div>
      <div className="hg-dim" style={{ fontSize: "11px", marginTop: "6px" }}>
        {label}
      </div>
    </div>
  );
}

/* ── Bookie rewards ──────────────────────────────────────────────────── */

export function BookieRewardsSection() {
  const [data, setData] = useState<BookieRewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="hg-sec">
      <p className="hg-sec-sub">
        Earn 1 point for every {data.tickets_per_point} tickets you sell. {data.points_per_free_ticket} points get you a
        free ticket, applied straight to a booking at confirm time.
      </p>

      <div className="hg-kpi-grid">
        <KpiCard label="Free tickets ready" value={String(data.free_tickets_available)} tone={data.free_tickets_available > 0 ? "good" : undefined} />
        <KpiCard label="Points available" value={String(data.points_available)} sub={`${data.points_earned} earned · ${data.points_redeemed} spent`} />
        <KpiCard label="Tickets sold" value={String(data.lifetime_tickets_sold)} sub="counted since the programme started" />
      </div>

      <div className="hg-panel" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="star" size={16} /> Progress to your next free ticket
          </h3>
        </div>

        {data.free_tickets_available > 0 ? (
          <p style={{ fontSize: "13px", color: "var(--success)", fontWeight: 600, margin: 0 }}>
            You have {data.free_tickets_available} free ticket{data.free_tickets_available === 1 ? "" : "s"} ready. Tick
            &ldquo;use free ticket&rdquo; on any booking in your queue to apply one.
          </p>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: 0 }}>
            {data.points_to_next_free_ticket} more point{data.points_to_next_free_ticket === 1 ? "" : "s"} to go —
            that&rsquo;s about {data.points_to_next_free_ticket * data.tickets_per_point} more tickets sold.
          </p>
        )}

        <RewardProgress
          pct={pct}
          label={`${intoCurrent} / ${perFree} points · next point in ${data.tickets_to_next_point} ticket${data.tickets_to_next_point === 1 ? "" : "s"}`}
        />
      </div>

      <div className="hg-panel" style={{ marginTop: "24px" }}>
        <div className="hg-panel-head" style={{ borderBottom: "1px solid var(--border-2)", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={16} /> Redemption history
          </h3>
        </div>
        {data.history.length === 0 ? (
          <EmptyHint icon="star" title="Nothing redeemed yet" sub="Free tickets you claim will be listed here with the booking they were used on." />
        ) : (
          <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
            <div className="hg-table" style={{ minWidth: "560px" }}>
              <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr" }}>
                <span>When</span>
                <span>Game</span>
                <span>Points</span>
                <span style={{ textAlign: "right" }}>Value</span>
              </div>
              {data.history.map((h) => (
                <div key={h.redemption_id} className="hg-tr" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr" }}>
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
