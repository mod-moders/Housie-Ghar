"use client";
import { useEffect, useState } from "react";
import { useSSE } from "@/lib/hooks/useSSE";
import { useGameStore } from "@/lib/stores/gameStore";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Game {
  game_id: string; title: string; scheduled_at: string;
  ticket_price: number; total_tickets: number; sold_count: number;
  locked_count: number; fill_percentage: number;
  game_status: "Scheduled" | "Live" | "Paused" | "Completed";
  prize_pool: Array<{ prize_id: number; pattern_name: string; prize_amount: number; claimed: boolean; winner_housie_name: string | null }>;
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const { drawnNumbers, lastDrawn } = useGameStore();

  useSSE(liveGame?.game_id ?? null);

  useEffect(() => {
    const load = () =>
      apiFetch<Game[]>("/api/games").then((data) => {
        setGames(data);
        setLiveGame(data.find((g) => g.game_status === "Live") ?? null);
      }).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const upcoming = games.filter((g) => g.game_status === "Scheduled" || g.game_status === "Live");

  return (
    <div className="min-h-screen bg-cream font-body text-[#1a1a1a] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-forest h-[60px] flex items-center justify-between px-5 shadow-lg">
        <a href="#hero" className="font-display text-2xl font-black text-gold tracking-tight">
          Housie <span className="text-cream">Ghar</span>
        </a>
        <ul className="hidden sm:flex gap-1">
          {["#games", "#how-to-play", "#live"].map((href) => (
            <li key={href}>
              <a href={href} className="text-cream/75 hover:text-gold text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all">
                {href.replace("#", "").replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/admin/login" className="border border-gold/40 text-gold text-xs px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-all">
          Staff Login
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="bg-gradient-to-br from-forest via-forest-mid to-[#1a4a35] text-center py-16 px-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_110%,rgba(240,165,0,0.18),transparent)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 bg-gold/15 border border-gold/35 rounded-full px-4 py-1 text-gold-light text-xs font-semibold tracking-widest uppercase mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            MOD Certified Fair Play
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black text-cream leading-tight mb-3">
            Play Together,<br /><span className="text-gold">Win Together</span>
          </h1>
          <p className="text-cream/65 text-sm max-w-xs mx-auto mb-8 leading-relaxed">
            Housie Ghar digitizes the beloved community game with a cryptographically fair draw. Join from your phone — no app needed.
          </p>
          <a href="#games" className="inline-block bg-gold hover:bg-gold-light text-forest font-black text-sm px-8 py-3 rounded-xl transition-all shadow-lg shadow-gold/20">
            Browse Games →
          </a>
        </div>
      </section>

      {/* ── GAMES LOBBY ── */}
      <section id="games" className="py-14 px-5 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl font-bold text-forest mb-6">Upcoming Games</h2>
        {upcoming.length === 0 ? (
          <p className="text-[#888] text-sm">No games scheduled right now. Check back soon!</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcoming.map((g) => (
              <GameCard key={g.game_id} game={g} />
            ))}
          </div>
        )}
      </section>

      {/* ── HOW TO PLAY ── */}
      <section id="how-to-play" className="bg-cream-dark py-14 px-5">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-2xl font-bold text-forest mb-8 text-center">How To Play</h2>
          <ol className="space-y-4">
            {[
              ["Browse & pick your game", "Choose from upcoming games in the lobby above."],
              ["Select up to 6 tickets", "Each ticket has a unique 3×9 grid of numbers."],
              ["Enter your Housie Name", "Your anonymous nickname for the game."],
              ["Pay your Agent via UPI/WhatsApp", "A local Agent confirms your payment and locks your ticket."],
              ["Watch the live draw", "Numbers highlight on your ticket in real-time!"],
              ["Claim your prize", "Win automatically detected — collect from the Agent."],
            ].map(([title, desc], i) => (
              <li key={i} className="flex gap-4 items-start">
                <span className="w-8 h-8 rounded-full bg-forest text-gold font-display font-black text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-forest-mid text-sm">{title}</p>
                  <p className="text-[#888] text-xs leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── LIVE SECTION ── */}
      <section id="live" className="py-14 px-5 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl font-bold text-forest mb-6">Live Draw</h2>
        {liveGame ? (
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="bg-forest rounded-2xl p-8 text-center shadow-xl">
              <p className="text-gold text-xs font-mono tracking-widest uppercase mb-3">Current Number</p>
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-gold to-gold-light flex items-center justify-center mx-auto shadow-lg shadow-gold/20">
                <span className="font-display text-5xl font-black text-forest">{lastDrawn ?? "--"}</span>
              </div>
              <p className="text-cream/60 text-xs font-mono mt-4">{drawnNumbers.length} / 90 drawn</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-forest mb-3">Numbers Board</p>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
                  <div key={n} className={`h-7 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-all ${drawnNumbers.includes(n) ? "bg-gold text-forest scale-105" : "bg-cream-dark text-[#888]"}`}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-cream-dark rounded-2xl p-10 text-center text-[#888] text-sm">
            No game is live right now. Check the lobby for upcoming games!
          </div>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-forest text-cream/40 text-xs text-center py-6 font-mono">
        © 2026 Housie Ghar · Powered by MOD · Fair play guaranteed
      </footer>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const [expanded, setExpanded] = useState(false);
  const fill = game.fill_percentage;
  const isLive = game.game_status === "Live";
  const isSoldOut = fill >= 100;

  return (
    <div className={`bg-white rounded-2xl shadow-md border-2 transition-all ${isLive ? "border-success" : "border-cream-dark"}`}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          {isLive ? (
            <span className="bg-success/10 text-success border border-success/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full animate-pulse">
              LIVE NOW
            </span>
          ) : (
            <span className="bg-forest/10 text-forest text-[10px] font-mono px-2 py-0.5 rounded-full">
              {new Date(game.scheduled_at).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          )}
          <span className="text-xs font-mono text-[#888]">₹{game.ticket_price}/ticket</span>
        </div>
        <h3 className="font-display text-lg font-bold text-forest">{game.title}</h3>

        {/* Fill bar */}
        <div className="mt-3 mb-1">
          <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${fill >= 80 ? "bg-rust" : "bg-forest-light"}`}
              style={{ width: `${Math.min(fill, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-[#888] font-mono mt-1">
            {fill >= 100 ? "Sold Out" : fill >= 80 ? `Fast Filling! ${fill}%` : `${fill}% filled`}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {isLive ? (
            <a href="#live" className="flex-1 text-center bg-success text-white text-xs font-bold py-2 rounded-xl transition-all hover:opacity-90">
              Watch Live
            </a>
          ) : isSoldOut ? (
            <button disabled className="flex-1 bg-cream-dark text-[#888] text-xs font-bold py-2 rounded-xl cursor-not-allowed">
              Sold Out
            </button>
          ) : (
            <Link href={`/game/${game.game_id}`} className="flex-1 text-center bg-forest hover:bg-forest-mid text-gold text-xs font-bold py-2 rounded-xl transition-all">
              Book Now
            </Link>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-2 text-xs text-[#888] hover:text-forest border border-cream-dark rounded-xl transition-all"
          >
            {expanded ? "▲" : "▼"} Prizes
          </button>
        </div>
      </div>

      {/* Prize dropdown */}
      {expanded && (
        <div className="border-t border-cream-dark px-5 py-3 space-y-1.5">
          {game.prize_pool.map((p) => (
            <div key={p.prize_id} className="flex justify-between text-xs">
              <span className={p.claimed ? "text-[#888] line-through" : "text-forest-mid font-medium"}>
                {p.pattern_name}
              </span>
              <span className="font-mono font-bold text-amber">₹{p.prize_amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
