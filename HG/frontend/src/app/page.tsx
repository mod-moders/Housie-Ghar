"use client";
/** Public lobby — hero with the next draw + games feed. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Button, CountdownPills, Footer, GameStatusBadge, ProgressBar, TrustBadges, EmptyHint } from "@/components/ui";
import type { GameSummary } from "@/lib/types";

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

function GameCard({ game, go }: { game: GameSummary; go: (id: string) => void }) {
  const status = cardStatus(game);
  const sold = status === "sold";
  const top = game.prize_pool[game.prize_pool.length - 1] ?? game.prize_pool[0];
  const totalPool = game.prize_pool.reduce((s, p) => s + p.prize_amount, 0);
  const when = formatWhen(game.scheduled_at);

  return (
    <article className={`hg-card${sold ? " is-sold" : ""}`}>
      {sold && <div className="hg-sold-stamp"><span>SOLD OUT</span></div>}
      <div className="hg-card-head">
        <div>
          <h3 className="hg-card-title">{game.title}</h3>
          <div className="hg-card-when">
            <Icon name="clock" size={13} strokeWidth={2} />
            {when.date} · {when.time}
          </div>
        </div>
        <GameStatusBadge status={status} />
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
        {sold ? (
          <Button variant="ghost" size="md" disabled>Sold Out</Button>
        ) : (
          <Button variant="cta" size="md" iconRight="chevR" onClick={() => go(game.game_id)}>Get Tickets</Button>
        )}
      </div>
    </article>
  );
}

export default function Lobby() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const go = (id: string) => router.push(`/game/${id}`);
  const upcoming = (games ?? []).filter((g) => g.game_status !== "Completed");
  const featured =
    upcoming.find((g) => g.game_status === "Live") ??
    upcoming.find((g) => g.game_status === "Scheduled" && g.available_count > 0) ??
    upcoming[0];

  return (
    <PublicShell>
      <div className="hg-screen">
        {featured && (
          <section className="hg-hero">
            <div className="hg-hero-card">
              <div className="hg-hero-kicker">
                <span className="hg-live-dot" /> {featured.game_status === "Live" ? "LIVE NOW" : "NEXT DRAW"}
              </div>
              <h1 className="hg-hero-title">{featured.title}</h1>
              <div className="hg-hero-when">
                {formatWhen(featured.scheduled_at).date} · {formatWhen(featured.scheduled_at).time}
              </div>
              {featured.game_status === "Scheduled" && (
                <CountdownPills targetTs={new Date(featured.scheduled_at).getTime()} />
              )}
              <div className="hg-hero-line">
                {featured.prize_pool.length > 0 && (
                  <>
                    {featured.prize_pool[featured.prize_pool.length - 1].pattern_name}{" "}
                    <b>{money(featured.prize_pool[featured.prize_pool.length - 1].prize_amount)}</b>
                    <span className="sep">·</span>
                  </>
                )}
                <b>{money(featured.ticket_price)}</b> per ticket
              </div>
              {featured.game_status === "Live" ? (
                <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => router.push(`/game/${featured.game_id}/live`)}>
                  Watch the Live Board
                </Button>
              ) : (
                <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => go(featured.game_id)}>
                  Pick Your Tickets
                </Button>
              )}
            </div>
          </section>
        )}

        <TrustBadges />

        <section className="hg-feed">
          <div className="hg-feed-head">
            <h2 className="hg-section-title">Upcoming Games</h2>
            <span className="hg-feed-count">{upcoming.length} live now</span>
          </div>
          {error && <p className="hg-sec-err">Could not load games: {error}</p>}
          {games && upcoming.length === 0 && (
            <EmptyHint icon="grid" title="No games scheduled yet" sub="Check back soon — new draws are announced here first." />
          )}
          <div className="hg-feed-list">
            {upcoming.map((g) => <GameCard key={g.game_id} game={g} go={go} />)}
          </div>
        </section>

        <Footer />
      </div>
    </PublicShell>
  );
}
