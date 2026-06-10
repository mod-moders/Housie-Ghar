"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
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

const ease = [0.23, 1, 0.32, 1] as const;
const spring = { type: "spring" as const, duration: 0.25, bounce: 0 };

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const { drawnNumbers, lastDrawn } = useGameStore();
  const reduced = useReducedMotion();

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
    <div className="min-h-[100dvh] font-body text-[#1a1a1a] overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-forest h-[64px] flex items-center justify-between px-6 shadow-lg">
        <a href="#hero" className="font-display text-2xl font-black text-gold tracking-tight leading-none">
          Housie <span className="text-cream/80">Ghar</span>
        </a>
        <ul className="hidden sm:flex gap-0.5">
          {[["#games", "Games"], ["#how-to-play", "How to Play"], ["#live", "Live Draw"]].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="text-cream/65 hover:text-gold text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors duration-200">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/admin/login" className="border border-gold/40 text-gold text-xs font-semibold px-3.5 py-1.5 rounded-lg hover:bg-gold/10 transition-colors duration-200">
          Staff Login
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="relative bg-forest min-h-[100svh] flex items-center justify-center overflow-hidden">
        {/* Housie-board grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,rgba(240,165,0,0.05) 0px,transparent 1px,transparent 48px)," +
              "repeating-linear-gradient(90deg,rgba(240,165,0,0.05) 0px,transparent 1px,transparent 48px)",
          }}
        />
        {/* Layered radial glows — bottom warm bloom + top cool depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_110%,rgba(240,165,0,0.15),transparent)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_0%,rgba(36,80,58,0.55),transparent)] pointer-events-none" />

        <div className="relative text-center px-6 max-w-4xl mx-auto">
          {liveGame && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="inline-flex items-center gap-2 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-green-400 text-xs font-mono font-semibold tracking-[0.12em]">
                Live now · {liveGame.title}
              </span>
            </motion.div>
          )}

          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.65, ease }}
            className="font-display font-black text-cream leading-[0.88] mb-7 text-balance"
            style={{ fontSize: "clamp(2.75rem, 9vw, 5.5rem)" }}
          >
            Play Together,
            <br />
            <span className="text-gold">Win Together</span>
          </motion.h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.7, ease }}
            className="text-cream/60 text-base sm:text-lg max-w-xl mx-auto mb-10 leading-relaxed text-pretty"
          >
            Housie Ghar digitizes the beloved community game with a cryptographically fair draw.
            Join from your phone, no app needed.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36, duration: 0.6, ease }}
            className="flex flex-wrap gap-3 justify-center"
          >
            <motion.a
              href="#games"
              className="bg-gold text-forest font-black text-sm px-8 py-3.5 rounded-full shadow-lg shadow-gold/30 inline-flex items-center"
              whileHover={reduced ? {} : { scale: 1.04, y: -3 }}
              whileTap={reduced ? {} : { scale: 0.97 }}
              transition={spring}
            >
              Browse Games
            </motion.a>
            {liveGame ? (
              <motion.a
                href="#live"
                className="border-2 border-cream/30 text-cream font-bold text-sm px-8 py-3.5 rounded-full"
                whileHover={reduced ? {} : { y: -3, borderColor: "rgba(253,246,227,0.55)" }}
                whileTap={reduced ? {} : { scale: 0.97 }}
                transition={spring}
              >
                Watch Live Draw
              </motion.a>
            ) : (
              <motion.a
                href="#how-to-play"
                className="border-2 border-cream/30 text-cream font-bold text-sm px-8 py-3.5 rounded-full"
                whileHover={reduced ? {} : { y: -3, borderColor: "rgba(253,246,227,0.55)" }}
                whileTap={reduced ? {} : { scale: 0.97 }}
                transition={spring}
              >
                How it works
              </motion.a>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── GAME LOBBY ── */}
      <section id="games" className="py-20 px-6 bg-cream">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between mb-10">
            <h2 className="font-display text-3xl font-bold text-forest text-balance">
              Upcoming Games
            </h2>
            {upcoming.length > 0 && (
              <span className="font-mono text-xs text-[#999]">
                {upcoming.length} available
              </span>
            )}
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-forest/10 rounded-2xl">
              <p className="font-display text-5xl font-black text-forest/10 mb-3">—</p>
              <p className="text-[#666] text-sm">No games scheduled right now. Check back soon.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcoming.map((g, i) => (
                <GameCard key={g.game_id} game={g} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── HOW TO PLAY ── */}
      <section id="how-to-play" className="bg-forest py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-cream mb-16 text-balance">
            How to Play
          </h2>
          <ol className="space-y-10">
            {[
              ["Browse and pick your game", "Choose from upcoming games in the lobby above."],
              ["Select up to 6 tickets", "Each ticket has a unique 3×9 grid of numbers."],
              ["Enter your Housie Name", "Your anonymous nickname for the draw — no account needed."],
              ["Pay your Agent via UPI or WhatsApp", "A local Agent confirms your payment and locks your tickets."],
              ["Watch the live draw", "Numbers highlight on your ticket in real time."],
              ["Claim your prize", "Wins are detected automatically. Collect from the Agent."],
            ].map(([title, desc], i) => (
              <motion.li
                key={i}
                initial={reduced ? false : { opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.05, duration: 0.35, ease }}
                className="flex gap-7 items-start"
              >
                <span
                  className="font-display font-black text-gold/20 leading-none flex-shrink-0 tabular-nums select-none"
                  style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="pt-1.5">
                  <p className="font-semibold text-cream text-base mb-1">{title}</p>
                  <p className="text-cream/50 text-sm leading-relaxed text-pretty">{desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── LIVE DRAW ── */}
      <section id="live" className="py-20 px-6 bg-cream">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-forest mb-10 text-balance">
            Live Draw
          </h2>
          {liveGame ? (
            <div className="grid sm:grid-cols-2 gap-8 items-start">
              {/* Current number */}
              <div className="bg-forest rounded-2xl p-10 text-center shadow-xl shadow-forest/15">
                <p className="text-gold/50 text-xs font-mono tracking-[0.15em] uppercase mb-6">Current Number</p>
                <div className="relative w-36 h-36 mx-auto mb-6">
                  <div
                    className="absolute inset-0 rounded-full bg-gold/15 animate-ping"
                    style={{ animationDuration: "2.4s" }}
                  />
                  <motion.div
                    key={lastDrawn}
                    initial={reduced ? false : { scale: 1.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", duration: 0.45, bounce: 0.2 }}
                    className="relative w-36 h-36 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center shadow-xl shadow-gold/30"
                  >
                    <span className="font-display text-6xl font-black text-forest">{lastDrawn ?? "--"}</span>
                  </motion.div>
                </div>
                <p className="text-cream/35 text-xs font-mono">{drawnNumbers.length} of 90 drawn</p>
              </div>
              {/* Numbers board */}
              <div>
                <p className="text-sm font-semibold text-forest mb-4">Numbers Board</p>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
                    <div
                      key={n}
                      className={`h-7 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-[background-color,color,transform] duration-200 ${
                        drawnNumbers.includes(n)
                          ? "bg-gold text-forest scale-105"
                          : "bg-cream-dark text-[#aaa]"
                      }`}
                    >
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-forest/10 rounded-2xl p-16 text-center">
              <p className="text-[#666] text-sm">No draw is live right now. Check the lobby for upcoming games.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-forest text-cream/30 text-xs text-center py-8 font-mono tracking-wider">
        © 2026 Housie Ghar · Cryptographically fair play
      </footer>
    </div>
  );
}

function GameCard({ game, index }: { game: Game; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const fill = game.fill_percentage;
  const isLive = game.game_status === "Live";
  const isSoldOut = fill >= 100;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ delay: index * 0.05, duration: 0.38, ease }}
      whileHover={reduced ? {} : { y: -6 }}
      whileTap={reduced ? {} : { scale: 0.99 }}
      style={{ willChange: "transform" }}
      className={`group relative rounded-2xl overflow-hidden cursor-default ${
        isLive
          ? "bg-forest shadow-xl shadow-forest/25"
          : "bg-white border-2 border-cream-dark hover:border-forest/20 hover:shadow-lg hover:shadow-forest/8"
      }`}
    >
      {/* Card body */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 bg-green-500/15 text-green-400 border border-green-400/25 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-[11px] font-mono text-[#888] bg-forest/5 border border-forest/8 px-2.5 py-1 rounded-full">
              {new Date(game.scheduled_at).toLocaleDateString("en-IN", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          <span
            className={`font-display font-black text-2xl leading-none tabular-nums ${
              isLive ? "text-gold" : "text-forest"
            }`}
          >
            ₹{game.ticket_price}
          </span>
        </div>

        <h3
          className={`font-display text-lg font-bold leading-tight mb-5 ${
            isLive ? "text-cream" : "text-forest"
          }`}
        >
          {game.title}
        </h3>

        {/* Fill bar */}
        <div>
          <div
            className={`h-1 rounded-full overflow-hidden ${
              isLive ? "bg-cream/10" : "bg-cream-dark"
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${
                fill >= 80 ? "bg-rust" : isLive ? "bg-gold" : "bg-forest-light"
              }`}
              style={{ width: `${Math.min(fill, 100)}%` }}
            />
          </div>
          <p
            className={`text-[10px] font-mono mt-1.5 ${
              isLive ? "text-cream/35" : "text-[#aaa]"
            }`}
          >
            {fill >= 100
              ? "Sold out"
              : fill >= 80
              ? `Filling fast · ${fill}%`
              : `${fill}% booked`}
          </p>
        </div>
      </div>

      {/* Ticket-stub perforated separator */}
      <div
        className={`mx-5 border-t-2 border-dashed ${
          isLive ? "border-cream/10" : "border-cream-dark"
        }`}
      />

      {/* Actions */}
      <div className="p-4 flex gap-2">
        {isLive ? (
          <a
            href="#live"
            className="flex-1 text-center bg-gold text-forest text-xs font-black py-2.5 rounded-xl transition-colors duration-200 hover:bg-gold-light"
          >
            Watch Live Draw
          </a>
        ) : isSoldOut ? (
          <button
            disabled
            className="flex-1 bg-cream-dark text-[#bbb] text-xs font-bold py-2.5 rounded-xl cursor-not-allowed"
          >
            Sold Out
          </button>
        ) : (
          <Link
            href={`/game/${game.game_id}`}
            className="flex-1 text-center bg-forest hover:bg-forest-mid text-gold text-xs font-black py-2.5 rounded-xl transition-colors duration-200"
          >
            Book Tickets
          </Link>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse prize pool" : "View prize pool"}
          className={`px-3 py-2.5 text-xs rounded-xl border transition-colors duration-200 ${
            isLive
              ? "text-cream/45 border-cream/10 hover:text-gold hover:border-gold/30"
              : "text-[#999] border-cream-dark hover:text-forest hover:border-forest/20"
          }`}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Prize dropdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease } }}
            className={`border-t px-5 py-4 space-y-2.5 ${
              isLive ? "border-cream/10" : "border-cream-dark"
            }`}
          >
            <p
              className={`text-[10px] font-mono uppercase tracking-wider mb-3 ${
                isLive ? "text-cream/25" : "text-[#ccc]"
              }`}
            >
              Prize Pool
            </p>
            {game.prize_pool.map((p) => (
              <div key={p.prize_id} className="flex justify-between items-baseline">
                <span
                  className={
                    p.claimed
                      ? "text-[#999] line-through text-xs"
                      : `text-xs font-medium ${isLive ? "text-cream/70" : "text-forest-mid"}`
                  }
                >
                  {p.pattern_name}
                  {p.claimed && p.winner_housie_name && (
                    <span className="ml-1.5 text-[10px] font-mono text-[#aaa]">
                      · {p.winner_housie_name}
                    </span>
                  )}
                </span>
                <span
                  className={`font-mono font-bold text-xs tabular-nums ${
                    p.claimed ? "text-[#aaa]" : "text-amber"
                  }`}
                >
                  ₹{p.prize_amount}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
