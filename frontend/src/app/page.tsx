"use client";
/** Public lobby — full-screen banner with a rotating hook, then Live Now + Upcoming. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Badge, Button, CountdownPills, Footer, GameStatusBadge, ProgressBar, TrustBadges, EmptyHint } from "@/components/ui";
import { useConfigStore } from "@/lib/stores/configStore";
import type { GameSummary, LuckyNumberResponse } from "@/lib/types";
import { RetroBingoHUD } from "@/components/RetroBingoHUD";

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

function refreshCopy(refreshesAt: string): string {
  const daysLeft = Math.ceil((new Date(refreshesAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 1) return `fresh number in ${daysLeft} days`;
  if (daysLeft === 1) return "fresh number tomorrow";
  return "refreshes today";
}

function cardStatus(g: GameSummary): "sold" | "fast" | "filling" | "open" {
  if (g.available_count <= 0) return "sold";
  const pct = ((g.sold_count + g.locked_count) / g.total_tickets) * 100;
  if (pct >= 80) return "fast";
  if (pct >= 50) return "filling";
  return "open";
}

const PRESET_BG: Record<string, string> = {
  "High Noon Fortune": "/presets/High Noon Fortune.jpg",
  "Prime Time": "/presets/Prime Time.jpg",
  "Snack & Stack": "/presets/Snack & Stack.jpg",
  "Sundown Showdown": "/presets/Sundown Showdown.jpg"
};

function getPresetClass(title: string): string | undefined {
  const t = title.trim().toLowerCase();
  if (t.includes("high noon")) return "hg-card-preset hg-card-preset--high-noon";
  if (t.includes("prime time")) return "hg-card-preset hg-card-preset--prime-time";
  if (t.includes("snack & stack") || t.includes("snack")) return "hg-card-preset hg-card-preset--snack-stack";
  if (t.includes("sundown")) return "hg-card-preset hg-card-preset--sundown";
  return undefined;
}

function GameCard({ game, go, goLive, compact }: { game: GameSummary; go: (id: string) => void; goLive: (id: string) => void; compact?: boolean }) {
  const isLive = game.game_status === "Live" || game.game_status === "Paused";
  const status = cardStatus(game);
  const sold = status === "sold";
  const top = game.prize_pool[game.prize_pool.length - 1] ?? game.prize_pool[0];
  const totalPool = game.prize_pool.reduce((s, p) => s + p.prize_amount, 0);
  const when = formatWhen(game.scheduled_at);
  const presetClass = getPresetClass(game.title);

  return (
    <article className={`hg-card${sold && !isLive ? " is-sold" : ""}${isLive ? " is-live" : ""}${presetClass ? " " + presetClass : ""}${compact ? " hg-card--compact" : ""}`}>
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

      {!compact && game.prize_pool && game.prize_pool.length > 0 && (
        <div className="hg-card-prizepool">
          <div className="hg-pp-list">
            {game.prize_pool.map((p) => (
              <div key={p.prize_id} className="hg-pp-row">
                <span className="hg-pp-label">{p.pattern_name}</span>
                <span className="hg-pp-amt">{money(p.prize_amount)}</span>
              </div>
            ))}
          </div>
          <div className="hg-pp-total-row">
            <span>Total Pool</span>
            <strong>{money(totalPool)}</strong>
          </div>
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

function PastGameCard({ game }: { game: GameSummary }) {
  const [showWinners, setShowWinners] = useState(false);
  const when = formatWhen(game.completed_at || game.scheduled_at);
  const claimedPrizes = game.prize_pool.filter(p => p.claimed);
  const presetClass = getPresetClass(game.title);

  return (
    <article className={`hg-card${presetClass ? " " + presetClass : ""}`} style={{ opacity: 0.9 }}>
      <div className="hg-card-head">
        <div>
          <h3 className="hg-card-title">{game.title}</h3>
          <div className="hg-card-when">
            <Icon name="check" size={13} strokeWidth={2} />
            Completed: {when.date}
          </div>
        </div>
        <Badge tone="gray">Completed</Badge>
      </div>

      {showWinners ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4.5px" }}>
            {claimedPrizes.map(p => (
              <div key={p.prize_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "4.5px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", fontSize: "9px", whiteSpace: "nowrap" }}>{p.pattern_name}:</span>
                  <span style={{ color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {p.winner_housie_name} <span style={{ color: "var(--text-mute)", fontSize: "9.5px" }}>(Tk #{p.winner_ticket_number})</span>
                  </span>
                </div>
                <strong style={{ fontFamily: "var(--font-mono)", color: "var(--brand)", whiteSpace: "nowrap", marginLeft: "8px" }}>{money(p.amount_per_winner ?? p.prize_amount)}</strong>
              </div>
            ))}
            {claimedPrizes.length === 0 && (
              <div style={{ fontSize: "11.5px", color: "var(--text-dim)", textAlign: "center", padding: "10px 0" }}>No prizes were claimed.</div>
            )}
          </div>
          <button 
            onClick={() => setShowWinners(false)}
            style={{ marginTop: "6px", background: "none", border: "none", color: "var(--text-dim)", fontSize: "11px", textDecoration: "underline", cursor: "pointer", alignSelf: "center" }}
          >
            Hide Winners
          </button>
        </div>
      ) : (
        <div className="hg-card-foot" style={{ borderTop: "none", paddingTop: 4 }}>
          <Button variant="ghost" size="md" full iconRight="chevD" onClick={() => setShowWinners(true)}>View Winners</Button>
        </div>
      )}
    </article>
  );
}

export default function Lobby() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { config } = useConfigStore();
  const [lucky, setLucky] = useState<LuckyNumberResponse | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  // Announcement ticker text, derived from config (muted/list/legacy single text).
  const textToScroll = useMemo(() => {
    if (!config || config.announcements_muted === "true") return null;
    let activeAnnouncements: string[] = [];
    try {
      if (config.announcements_list) {
        const list = JSON.parse(config.announcements_list);
        activeAnnouncements = list.filter((a: any) => !a.muted).map((a: any) => a.text);
      }
    } catch (e) {
      console.error("Failed to parse announcements_list", e);
    }
    return activeAnnouncements.length > 0
      ? activeAnnouncements.join("   •   ")
      : config.announcement_text || null;
  }, [config]);

  // News-ticker-style constant scroll speed: duration scales with content length
  // so the text always crosses the screen at the same pixel speed, however long it is.
  const tickerRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [marqueeVars, setMarqueeVars] = useState<{ duration: number; startPx: number; endPx: number } | null>(null);

  useLayoutEffect(() => {
    if (!textToScroll) {
      setMarqueeVars(null);
      return;
    }
    const measure = () => {
      const container = tickerRef.current;
      const text = marqueeRef.current;
      if (!container || !text) return;
      const containerWidth = container.offsetWidth;
      const textWidth = text.scrollWidth;
      const distance = containerWidth + textWidth;
      // config.announcement_speed is "seconds per 1000px" — matches the admin
      // dropdown's Slow(15s)/Medium(10s)/Fast(6s)/Super Fast(3s) labels, and
      // lands in the same 65–330 px/s range real news-channel tickers use.
      const secondsPer1000px = parseInt(config?.announcement_speed || "15", 10);
      const pxPerSecond = 1000 / secondsPer1000px;
      setMarqueeVars({
        duration: distance / pxPerSecond,
        startPx: containerWidth,
        endPx: -textWidth,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [textToScroll, config?.announcement_speed]);

  // Player Onboarding & Referral Hook
  useEffect(() => {
    document.title = "The Housie Wall";
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("hg_ref_promoter_id", ref);
    }

    const token = localStorage.getItem("hg_player_token") || sessionStorage.getItem("hg_player_token");
    if (!token) {
      router.push("/signup");
    } else {
      apiFetch("/api/player/me")
        .then(() => {
          setIsCheckingAuth(false);
        })
        .catch(() => {
          router.push("/signup");
        });
    }
  }, [router]);

  useEffect(() => {
    if (isCheckingAuth) return;
    let alive = true;
    const load = () =>
      apiFetch<GameSummary[]>("/api/games")
        .then((g) => { if (alive) { setGames(g); setError(null); } })
        .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [isCheckingAuth]);

  // One-shot fetch: the lucky number only changes every 12 days, so no polling.
  // Any failure simply leaves the card hidden.
  useEffect(() => {
    if (isCheckingAuth) return;
    let alive = true;
    apiFetch<LuckyNumberResponse>("/api/stats/lucky-number")
      .then((l) => { if (alive) setLucky(l); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isCheckingAuth]);

  const go = (id: string) => router.push(`/game/${id}`);
  const goLive = (id: string) => router.push(`/game/${id}/live`);

  const lobbyRef = useRef<HTMLDivElement>(null);
  const scrollToGames = () => lobbyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const all = games ?? [];
  const inProgress = all.filter((g) => g.game_status === "Live" || g.game_status === "Paused");
  const scheduled = all
    .filter((g) => g.game_status === "Scheduled")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // Disable the featured next card; all scheduled games show in the upcoming grid below.
  const featuredNext: any = undefined;
  const gridGames = scheduled;
  const nothingToShow = games !== null && inProgress.length === 0 && scheduled.length === 0;

  const completed = all
    .filter((g) => g.game_status === "Completed")
    .sort((a, b) => new Date(b.completed_at || b.scheduled_at).getTime() - new Date(a.completed_at || a.scheduled_at).getTime())
    .slice(0, 4);

  if (isCheckingAuth) {
    return (
      <PublicShell>
        <div className="hg-screen flex items-center justify-center min-h-[50vh]">
          <span style={{ color: "var(--text-dim)", fontSize: 15, fontWeight: 500 }}>Entering lobby…</span>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="hg-screen hg-screen--lobby">
        {/* Decorative background layers — bloom + grid + coins drifting in background */}
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
        {COINS.map((n, i) => (
          <span key={n} className={`hg-banner-coin hg-banner-coin--${i + 1}`} aria-hidden="true">{n}</span>
        ))}

        <div className="hg-lobby-v2" ref={lobbyRef}>
          {/* Brand Welcome Header with Logo */}
          <div className="hg-lobby-header">
            <div className="hg-lobby-header-row">
              <Image 
                src="/HG Secondary.png" 
                alt="Housie Ghar" 
                width={160} 
                height={160} 
                priority 
                className="hg-lobby-logo" 
              />
              {lucky && lucky.lucky_number !== null && (
                <section
                  className="hg-lucky-wizard"
                  aria-label={`Lucky number ${lucky.lucky_number}, ${refreshCopy(lucky.refreshes_at)}`}
                >
                  <div className="hg-lucky-wizard-scene">
                     <img src="/assets/wizard_globe.png" className="hg-wizard-img" alt="Wizard predicting lucky number" />
                     <div className="hg-globe-glow"></div>
                     <div className="hg-lucky-number-overlay">
                       <div className="hg-lucky-number-inner">
                         {lucky.lucky_number}
                       </div>
                     </div>
                  </div>
                </section>
              )}
            </div>
            <p className="hg-lobby-tagline">The entire town is playing! Are you?</p>
          </div>

          {textToScroll && (
            <div className="hg-announcement-banner">
              <div className="hg-info-sticker">INFO</div>
              <div className="hg-announcement-ticker" ref={tickerRef}>
                <div
                  key={marqueeVars ? "animated" : "measuring"}
                  className="hg-marquee"
                  ref={marqueeRef}
                  style={marqueeVars ? {
                    animationName: "hgMarqueeScroll",
                    animationDuration: `${marqueeVars.duration}s`,
                    animationTimingFunction: "linear",
                    animationIterationCount: "infinite",
                    ["--marquee-start" as any]: `${marqueeVars.startPx}px`,
                    ["--marquee-end" as any]: `${marqueeVars.endPx}px`,
                  } : { visibility: "hidden" }}
                >
                  {textToScroll}
                </div>
              </div>
            </div>
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
                {inProgress.map((g) => <GameCard key={g.game_id} game={g} go={go} goLive={goLive} compact />)}
              </div>
            </section>
          )}

          {/* Promoted next draw (only when nothing is live) */}
          {featuredNext && (
            <section className="hg-feature">
              <div className="hg-hero-card">
                <div className="hg-hero-kicker"><span className="hg-live-dot" /> NEXT DRAW</div>
                <h1 className="hg-hero-title">{featuredNext.title}</h1>
                <div className="hg-hero-when">
                  {formatWhen(featuredNext.scheduled_at).date} · {formatWhen(featuredNext.scheduled_at).time}
                </div>
                <CountdownPills targetTs={new Date(featuredNext.scheduled_at).getTime()} />
                <div className="hg-hero-line">
                  {featuredNext.prize_pool.length > 0 && (
                    <>
                      {featuredNext.prize_pool[featuredNext.prize_pool.length - 1].pattern_name}{" "}
                      <b>{money(featuredNext.prize_pool[featuredNext.prize_pool.length - 1].prize_amount)}</b>
                      <span className="sep">·</span>
                    </>
                  )}
                  <b>{money(featuredNext.ticket_price)}</b> per ticket
                </div>
                <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => go(featuredNext.game_id)}>
                  Pick Your Tickets
                </Button>
              </div>
            </section>
          )}

          <TrustBadges />

          {/* Upcoming Games */}
          <section className="hg-feed">
            <div className="hg-feed-head">
              <h2 className="hg-section-title">Upcoming Games</h2>
              <span className="hg-feed-count">{scheduled.length} scheduled</span>
            </div>
            {nothingToShow && (
              <EmptyHint icon="grid" title="No games scheduled yet" sub="Check back soon — new draws are announced here first." />
            )}
            {gridGames.length > 0 && (
              <div className="hg-feed-list">
                {gridGames.map((g) => <GameCard key={g.game_id} game={g} go={go} goLive={goLive} />)}
              </div>
            )}
          </section>

          {/* Past Games (Recent 4) */}
          {completed.length > 0 && (
            <section className="hg-feed">
              <div className="hg-feed-head">
                <h2 className="hg-section-title">Past Games</h2>
                <span className="hg-feed-count">{completed.length} recent</span>
              </div>
              <div className="hg-feed-list hg-feed-list--past">
                {completed.map((g) => <PastGameCard key={g.game_id} game={g} />)}
              </div>
            </section>
          )}
        </div>

        <Footer />
      </div>
    </PublicShell>
  );
}
