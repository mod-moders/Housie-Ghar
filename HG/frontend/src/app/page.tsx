"use client";
/** Public lobby — full-screen banner with a rotating hook, then Live Now + Upcoming. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Badge, Button, GameStatusBadge, ProgressBar, EmptyHint } from "@/components/ui";
import type { GameSummary, LuckyNumberResponse, PublicConfigResponse } from "@/lib/types";

// Rotated on the banner every 5s, starting from a random hook each page load.
const HOOKS = [
  "The whole town's playing — don't miss your number.",
  "Mark your numbers. Match the call. Win the house.",
  "Tambola night, every night — straight from the hills.",
];

// Decorative 3×9 ticket grid behind the hero. null = empty cell.
type BannerCell = { n: number; tone: "yellow" | "ocean" | "pink" | "plain"; daub?: "pink" | "ocean" } | null;
const GRID_CELLS: BannerCell[] = [
  null, { n: 12, tone: "yellow" }, null, null, { n: 44, tone: "plain", daub: "pink" }, null, { n: 61, tone: "ocean" }, null, null,
  null, null, { n: 27, tone: "pink" }, null, null, null, { n: 75, tone: "yellow" }, null, null,
  null, null, { n: 9, tone: "ocean" }, null, null, null, { n: 58, tone: "plain", daub: "ocean" }, null, { n: 83, tone: "pink" },
];

// Scattered sticker coins (size/colour/position come from .hg-banner-coin--N in CSS).
const COINS = [33, 7, 62, 88];

const emptySubscribe = () => () => {};

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

function cardStatus(g: GameSummary): "sold" | "fast" | "filling" | "open" {
  if (g.available_count <= 0) return "sold";
  const pct = ((g.sold_count + g.locked_count) / g.total_tickets) * 100;
  if (pct >= 80) return "fast";
  if (pct >= 50) return "filling";
  return "open";
}

function GameCard({ game, go, goLive }: { game: GameSummary; go: (id: string) => void; goLive: (id: string) => void }) {
  const isLive = game.game_status === "Live" || game.game_status === "Paused";
  const status = cardStatus(game);
  const sold = status === "sold";
  const top = game.prize_pool[game.prize_pool.length - 1] ?? game.prize_pool[0];
  const totalPool = game.prize_pool.reduce((s, p) => s + p.prize_amount, 0);
  const when = formatWhen(game.scheduled_at);

  return (
    <article className={`hg-card${sold && !isLive ? " is-sold" : ""}${isLive ? " is-live" : ""}`}>
      {sold && !isLive && <div className="hg-sold-stamp"><span>SOLD OUT</span></div>}
      <div className="hg-card-head">
        <div>
          <h3 className="hg-card-title">{game.title}</h3>
          <div className="hg-card-when">
            <Icon name={isLive ? "play" : "clock"} size={13} strokeWidth={2} />
            {isLive ? (game.game_status === "Paused" ? "Paused mid-draw" : "Drawing now") : `${when.date} · ${when.time}`}
          </div>
        </div>
        {isLive ? (
          <Badge tone="hot" icon="play">{game.game_status === "Paused" ? "Paused" : "Live"}</Badge>
        ) : (
          <GameStatusBadge status={status} />
        )}
      </div>

      {top && (
        <div className="hg-card-prizepool">
          <div className="hg-pp-hero">
            <span className="hg-pp-label">{top.pattern_name}</span>
            <span className="hg-pp-amt">{money(top.prize_amount)}</span>
          </div>
          {game.prize_pool.length > 1 && (
            <div className="hg-pp-more-line">
              + {game.prize_pool.length - 1} more prizes · {money(totalPool)} total pool
            </div>
          )}
        </div>
      )}

      <ProgressBar booked={game.sold_count} locked={game.locked_count} capacity={game.total_tickets} />

      <div className="hg-card-foot">
        <div className="hg-card-price">
          <span className="hg-dim">Ticket</span>
          <strong>{money(game.ticket_price)}</strong>
        </div>
        {isLive ? (
          <Button variant="cta" size="md" iconRight="chevR" onClick={() => goLive(game.game_id)}>Watch Live</Button>
        ) : sold ? (
          <Button variant="ghost" size="md" disabled>Sold Out</Button>
        ) : (
          <Button variant="cta" size="md" iconRight="chevR" onClick={() => go(game.game_id)}>Get Tickets</Button>
        )}
      </div>
    </article>
  );
}

// Shown in the Upcoming feed while the first /api/games request is in flight,
// so the lobby never flashes an empty "0 scheduled" section on load.
function SkeletonCard() {
  return (
    <article className="hg-skel-card" aria-hidden="true">
      <div className="hg-skel hg-skel-line" style={{ width: "62%", height: 20 }} />
      <div className="hg-skel" style={{ height: 56, borderRadius: 14 }} />
      <div className="hg-skel hg-skel-line" style={{ width: "100%", height: 10 }} />
      <div className="hg-card-foot">
        <div className="hg-skel hg-skel-line" style={{ width: 60, height: 22 }} />
        <div className="hg-skel" style={{ width: 124, height: 44, borderRadius: 999 }} />
      </div>
    </article>
  );
}

export default function Lobby() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lucky, setLucky] = useState<LuckyNumberResponse | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [noticeSpeed, setNoticeSpeed] = useState(10);
  const [noticeStep, setNoticeStep] = useState(0);

  // The quote rotates through HOOKS every 5s. A client-only random start (via
  // useSyncExternalStore: null on the server → no hydration mismatch) keeps the
  // first quote fresh each visit; `step` advances on a timer; `key={step}` on the
  // <p> replays the fade-in. React Compiler safe: setState lives in the interval
  // callback, never synchronously in the effect body.
  const startRef = useRef<number | null>(null);
  const start = useSyncExternalStore(
    emptySubscribe,
    () => (startRef.current ??= Math.floor(Math.random() * HOOKS.length)),
    (): number | null => null,
  );
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const quote = start === null ? "" : HOOKS[(start + step) % HOOKS.length];

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch<GameSummary[]>("/api/games")
        .then((g) => { if (alive) { setGames(g); setError(null); } })
        .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // One-shot fetch: the lucky number only changes every 12 days, so no polling.
  // Any failure simply leaves the card hidden.
  useEffect(() => {
    let alive = true;
    apiFetch<LuckyNumberResponse>("/api/stats/lucky-number")
      .then((l) => { if (alive) setLucky(l); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Superadmin announcements (Platform_Config.announcements_list — rotating,
  // per-item + global mute; legacy marquee_text is the fallback when the list
  // is empty). One-shot; empty or failed fetch simply hides the strip.
  useEffect(() => {
    let alive = true;
    apiFetch<PublicConfigResponse>("/api/config/public")
      .then((c) => {
        if (!alive) return;
        const speed = Number(c.announcement_speed);
        if (Number.isFinite(speed) && speed >= 3) setNoticeSpeed(speed);
        if (c.announcements_muted === "true") return;
        let list: { text?: unknown; muted?: unknown }[] = [];
        try { list = JSON.parse(c.announcements_list || "[]"); } catch { /* malformed config — fall back */ }
        const texts = (Array.isArray(list) ? list : [])
          .filter((a) => !a.muted && typeof a.text === "string" && a.text.trim())
          .map((a) => (a.text as string).trim());
        if (texts.length > 0) setNotices(texts);
        else if (c.marquee_text?.trim()) setNotices([c.marquee_text.trim()]);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Rotate through the announcements at the configured speed.
  useEffect(() => {
    if (notices.length < 2) return;
    const id = setInterval(() => setNoticeStep((s) => s + 1), noticeSpeed * 1000);
    return () => clearInterval(id);
  }, [notices.length, noticeSpeed]);
  const notice = notices.length > 0 ? notices[noticeStep % notices.length] : null;

  const go = (id: string) => router.push(`/game/${id}`);
  const goLive = (id: string) => router.push(`/game/${id}/live`);

  const lobbyRef = useRef<HTMLDivElement>(null);
  const scrollToGames = () => lobbyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const all = games ?? [];
  const inProgress = all.filter((g) => g.game_status === "Live" || g.game_status === "Paused");
  const scheduled = all
    .filter((g) => g.game_status === "Scheduled")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // Only genuinely live/paused games ever appear above Upcoming Games —
  // everything else (including the soonest scheduled draw) stays in the grid.
  const gridGames = scheduled;
  const nothingToShow = games !== null && inProgress.length === 0 && scheduled.length === 0;

  return (
    <PublicShell>
      <div className="hg-screen">
        {/* Banner — game-night hero: bloom + ticket grid + coins behind a logo/quote/CTAs hook */}
        <section className="hg-banner">
          <div className="hg-banner-bloom" aria-hidden="true" />
          <div className="hg-banner-grid" aria-hidden="true">
            {GRID_CELLS.map((c, i) => (
              <span key={i} className="hg-banner-cell">
                {c && (
                  <span className={`hg-banner-num hg-banner-num--${c.tone}`}>
                    {c.n}
                    {c.daub && <span className={`hg-banner-daub hg-banner-daub--${c.daub}`} />}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="hg-banner-fade" aria-hidden="true" />
          {COINS.map((n, i) => (
            <span key={n} className={`hg-banner-coin hg-banner-coin--${i + 1}`} aria-hidden="true">{n}</span>
          ))}
          <div className="hg-banner-hook">
            <div className="hg-banner-logo">
              <Image src="/hg-logo-2.png" alt="Housie Ghar" width={185} height={185} priority />
            </div>
            <p className="hg-banner-quote" key={step}>{quote || " "}</p>
            <div className="hg-banner-actions">
              <button className="hg-banner-btn hg-banner-btn--primary" onClick={scrollToGames}>Browse games</button>
            </div>
          </div>
        </section>

        <div className="hg-lobby-v2" ref={lobbyRef}>
          {notice && (
            <div className="hg-notice" role="status">
              <span className="hg-notice-ic" aria-hidden="true"><Icon name="bell" size={15} /></span>
              <p key={notice}>{notice}</p>
            </div>
          )}

          {lucky && lucky.lucky_number !== null && (
            <section className="hg-lucky" aria-label={`Lucky number ${lucky.lucky_number}`}>
              <span className="hg-lucky-bloom" aria-hidden="true" />
              <div className="hg-lucky-stage">
                <span className="hg-lucky-halo" aria-hidden="true" />
                <div className={`hg-lucky-ball${String(lucky.lucky_number).length > 2 ? " is-wide" : ""}`}>
                  {lucky.lucky_number}
                </div>
                <span className="hg-lucky-spark hg-lucky-spark--y" aria-hidden="true" />
                <span className="hg-lucky-spark hg-lucky-spark--o" aria-hidden="true" />
              </div>
              <div className="hg-lucky-meta">
                <h2 className="hg-lucky-title">Lucky Number</h2>
              </div>
            </section>
          )}

          {error && <p className="hg-sec-err">Could not load games: {error}</p>}

          {/* Live Now — only when something is actually drawing */}
          {inProgress.length > 0 && (
            <section className="hg-feed">
              <div className="hg-feed-head">
                <h2 className="hg-section-title hg-section-live"><span className="hg-live-dot" /> Live Now</h2>
                <span className="hg-feed-count">{inProgress.length} playing</span>
              </div>
              <div className="hg-feed-list">
                {inProgress.map((g) => <GameCard key={g.game_id} game={g} go={go} goLive={goLive} />)}
              </div>
            </section>
          )}

          {/* Upcoming Games */}
          <section className="hg-feed">
            <div className="hg-feed-head">
              <h2 className="hg-section-title">Upcoming Games</h2>
              {games !== null && <span className="hg-feed-count">{scheduled.length} scheduled</span>}
            </div>
            {games === null ? (
              <div className="hg-feed-list">
                {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <>
                {nothingToShow && (
                  <EmptyHint icon="grid" title="No games scheduled yet" sub="Check back soon — new draws are announced here first." />
                )}
                {gridGames.length > 0 && (
                  <div className="hg-feed-list">
                    {gridGames.map((g) => <GameCard key={g.game_id} game={g} go={go} goLive={goLive} />)}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
