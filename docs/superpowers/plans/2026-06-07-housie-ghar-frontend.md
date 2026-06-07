# Housie Ghar Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Next.js 16 frontend for Housie Ghar — public player site, game room, and 4 role-based admin workspaces (Agent, Operator, Admin, Superadmin).

**Architecture:** App Router with route groups: `(public)` for player-facing pages, `(admin)` for staff workspaces behind JWT middleware. Public site uses SSE for live game data; admin workspaces use Socket.io. All real-time state is managed in Zustand v5 stores.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Zustand v5, socket.io-client v4, TypeScript

**API Base:** `http://localhost:4000` (dev) — read from `NEXT_PUBLIC_API_URL` env var.

---

## File Structure

```
HG/frontend/src/
  app/
    globals.css                    ← MODIFY: add theme variables + fonts
    layout.tsx                     ← MODIFY: add font imports, metadata
    page.tsx                       ← REPLACE: public homepage (hero+games+how-to-play+winners+live)
    middleware.ts                  ← CREATE: JWT auth guard for /admin/*
    game/[game_id]/
      page.tsx                     ← CREATE: ticket selection + booking flow
    admin/
      layout.tsx                   ← CREATE: admin shell (sidebar + topbar)
      login/
        page.tsx                   ← CREATE: staff login form
      agent/
        page.tsx                   ← CREATE: agent queue + wallet workspace
      operator/
        page.tsx                   ← CREATE: operator game list
        console/[game_id]/
          page.tsx                 ← CREATE: live conductor HUD
      admin/
        page.tsx                   ← CREATE: admin dashboard + game builder + agents
      superadmin/
        page.tsx                   ← CREATE: superadmin dashboard + users + audit + theming
  lib/
    api.ts                         ← CREATE: fetch wrapper (auth cookie, error handling)
    stores/
      authStore.ts                 ← CREATE: Zustand auth store
      gameStore.ts                 ← CREATE: live game state (drawn numbers, status)
      bookingStore.ts              ← CREATE: player booking (persisted to localStorage)
      agentStore.ts                ← CREATE: agent queue + wallet
      operatorStore.ts             ← CREATE: operator HUD state
    hooks/
      useSSE.ts                    ← CREATE: EventSource hook for player live feed
      useSocket.ts                 ← CREATE: Socket.io hook for operator/agent
      useCountdown.ts              ← CREATE: countdown timer hook
```

---

## Task 1: Theme, Fonts, and Global CSS

**Files:**
- Modify: `HG/frontend/src/app/globals.css`
- Modify: `HG/frontend/src/app/layout.tsx`
- Modify: `HG/frontend/next.config.ts`

- [ ] **Step 1: Update globals.css with Tailwind v4 theme**

Replace the entire `HG/frontend/src/app/globals.css` with:

```css
@import "tailwindcss";

/* ── PUBLIC SITE PALETTE (warm forest/cream) ── */
@theme {
  --color-forest:       #1a3a2a;
  --color-forest-mid:   #24503a;
  --color-forest-light: #2d6b4a;
  --color-gold:         #f0a500;
  --color-gold-light:   #ffc740;
  --color-amber:        #e07b00;
  --color-cream:        #fdf6e3;
  --color-cream-dark:   #f5e9c8;
  --color-rust:         #c94a1a;

  /* ADMIN PALETTE (dark) */
  --color-bg1:          #0f1117;
  --color-bg2:          #161820;
  --color-bg3:          #1e2029;
  --color-bg4:          #252733;
  --color-border:       rgba(255,255,255,0.07);
  --color-border-active:rgba(255,255,255,0.14);
  --color-wa:           #25D366;

  /* SEMANTIC */
  --color-success:      #22c55e;
  --color-danger:       #ef4444;
  --color-warning:      #f59e0b;

  /* FONT */
  --font-display: 'Baloo 2', cursive;
  --font-body:    'Sora', sans-serif;
  --font-admin:   'DM Sans', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}

* { box-sizing: border-box; }

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Update layout.tsx to load Google Fonts and set metadata**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Housie Ghar — Play Together, Win Together",
  description: "The digital Housie experience for your community.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;700;800&family=Sora:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Update next.config.ts to expose API URL env var**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/monk/1/HG/frontend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, build succeeds or exits only on missing page stubs.

- [ ] **Step 5: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/globals.css HG/frontend/src/app/layout.tsx HG/frontend/next.config.ts && git commit -m "feat(frontend): add theme variables, fonts, and layout"
```

---

## Task 2: API Lib and Zustand Stores

**Files:**
- Create: `HG/frontend/src/lib/api.ts`
- Create: `HG/frontend/src/lib/stores/authStore.ts`
- Create: `HG/frontend/src/lib/stores/gameStore.ts`
- Create: `HG/frontend/src/lib/stores/bookingStore.ts`
- Create: `HG/frontend/src/lib/stores/agentStore.ts`

- [ ] **Step 1: Create API wrapper**

Create `HG/frontend/src/lib/api.ts`:

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Create authStore**

Create `HG/frontend/src/lib/stores/authStore.ts`:

```ts
import { create } from "zustand";

interface AuthUser {
  user_id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: "Superadmin" | "Admin" | "Operator" | "Agent";
  current_balance?: number;
}

interface AuthStore {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

- [ ] **Step 3: Create gameStore**

Create `HG/frontend/src/lib/stores/gameStore.ts`:

```ts
import { create } from "zustand";

interface PrizeEntry {
  prize_id: number;
  pattern_name: string;
  prize_amount: number;
  claimed: boolean;
  winner_housie_name: string | null;
}

interface GameStore {
  drawnNumbers: number[];
  lastDrawn: number | null;
  gameStatus: "Scheduled" | "Live" | "Paused" | "Completed";
  prizes: PrizeEntry[];
  addDrawn: (n: number) => void;
  setStatus: (s: GameStore["gameStatus"]) => void;
  setPrizes: (p: PrizeEntry[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  drawnNumbers: [],
  lastDrawn: null,
  gameStatus: "Scheduled",
  prizes: [],
  addDrawn: (n) =>
    set((s) => ({
      drawnNumbers: s.drawnNumbers.includes(n) ? s.drawnNumbers : [...s.drawnNumbers, n],
      lastDrawn: n,
    })),
  setStatus: (gameStatus) => set({ gameStatus }),
  setPrizes: (prizes) => set({ prizes }),
  reset: () => set({ drawnNumbers: [], lastDrawn: null, gameStatus: "Scheduled", prizes: [] }),
}));
```

- [ ] **Step 4: Create bookingStore (persisted)**

Create `HG/frontend/src/lib/stores/bookingStore.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BookingStore {
  bookingId: string | null;
  housieName: string;
  gameId: string | null;
  ticketIds: number[];
  status: "idle" | "locked" | "sold" | "expired";
  agentPhone: string;
  agentName: string;
  totalAmount: number;
  lockedUntil: string | null;
  whatsappLink: string;
  setBooking: (b: Partial<BookingStore>) => void;
  clear: () => void;
}

const INIT = {
  bookingId: null, housieName: "", gameId: null, ticketIds: [],
  status: "idle" as const, agentPhone: "", agentName: "",
  totalAmount: 0, lockedUntil: null, whatsappLink: "",
};

export const useBookingStore = create<BookingStore>()(
  persist(
    (set) => ({
      ...INIT,
      setBooking: (b) => set((s) => ({ ...s, ...b })),
      clear: () => set(INIT),
    }),
    { name: "hg-booking" }
  )
);
```

- [ ] **Step 5: Create agentStore**

Create `HG/frontend/src/lib/stores/agentStore.ts`:

```ts
import { create } from "zustand";

interface BookingRequest {
  booking_id: string;
  housie_name: string;
  game_title: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_until: string;
}

interface AgentStore {
  queue: BookingRequest[];
  walletBalance: number;
  setQueue: (q: BookingRequest[]) => void;
  setBalance: (b: number) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  queue: [],
  walletBalance: 0,
  setQueue: (queue) => set({ queue }),
  setBalance: (walletBalance) => set({ walletBalance }),
}));
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/monk/1/HG/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/lib/ && git commit -m "feat(frontend): add API lib and Zustand stores"
```

---

## Task 3: Custom Hooks (SSE, Socket.io, Countdown)

**Files:**
- Create: `HG/frontend/src/lib/hooks/useSSE.ts`
- Create: `HG/frontend/src/lib/hooks/useSocket.ts`
- Create: `HG/frontend/src/lib/hooks/useCountdown.ts`

- [ ] **Step 1: Create useSSE hook**

Create `HG/frontend/src/lib/hooks/useSSE.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useSSE(gameId: string | null) {
  const sourceRef = useRef<EventSource | null>(null);
  const { addDrawn, setStatus, setPrizes } = useGameStore();

  useEffect(() => {
    if (!gameId) return;
    sourceRef.current?.close();

    const src = new EventSource(`${BASE}/api/games/${gameId}/live-stream`);
    sourceRef.current = src;

    src.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.event === "initial_state") {
        setStatus(data.game_status);
        (data.drawn_numbers ?? []).forEach((n: number) => addDrawn(n));
        if (data.prizes) setPrizes(data.prizes);
      } else if (data.event === "draw") {
        addDrawn(data.draw_number);
      } else if (data.event === "winner") {
        if (data.prizes) setPrizes(data.prizes);
      } else if (data.event === "paused") {
        setStatus("Paused");
      } else if (data.event === "resumed") {
        setStatus("Live");
      } else if (data.event === "completed") {
        setStatus("Completed");
      }
    };

    src.onerror = () => src.close();
    return () => src.close();
  }, [gameId]);
}
```

- [ ] **Step 2: Create useSocket hook**

Create `HG/frontend/src/lib/hooks/useSocket.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useSocket(onEvent?: (event: string, data: unknown) => void) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(BASE, { withCredentials: true });
    socketRef.current = socket;

    if (onEvent) {
      const events = ["draw_update","winner_announced","paused","resumed","completed",
        "new_booking_request","booking_expired","wallet_credited"];
      events.forEach((ev) => socket.on(ev, (data) => onEvent(ev, data)));
    }

    return () => { socket.disconnect(); };
  }, []);

  return socketRef;
}
```

- [ ] **Step 3: Create useCountdown hook**

Create `HG/frontend/src/lib/hooks/useCountdown.ts`:

```ts
"use client";
import { useState, useEffect } from "react";

export function useCountdown(targetIso: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return { secondsLeft, display: `${mm}:${ss}` };
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/monk/1/HG/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/lib/hooks/ && git commit -m "feat(frontend): add SSE, Socket.io, and countdown hooks"
```

---

## Task 4: Next.js Middleware (Admin Auth Guard)

**Files:**
- Create: `HG/frontend/src/middleware.ts`

- [ ] **Step 1: Create middleware**

Create `HG/frontend/src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("hg_auth_token")?.value;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/middleware.ts && git commit -m "feat(frontend): add admin auth middleware"
```

---

## Task 5: Public Homepage

**Files:**
- Replace: `HG/frontend/src/app/page.tsx`

This is the player-facing landing page. It renders 4 scroll sections: `#hero`, `#games`, `#how-to-play`, `#live`.

- [ ] **Step 1: Write the homepage**

Replace `HG/frontend/src/app/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify it renders**

```bash
cd /Users/monk/1/HG/frontend && npm run dev &
sleep 5 && curl -s http://localhost:3000 | grep -i "housie" | head -5
```

Expected: HTML containing "Housie".

- [ ] **Step 3: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/page.tsx && git commit -m "feat(frontend): build public homepage with hero, games lobby, live draw"
```

---

## Task 6: Game Room — Ticket Selection & Booking

**Files:**
- Create: `HG/frontend/src/app/game/[game_id]/page.tsx`

- [ ] **Step 1: Create the game room page**

Create `HG/frontend/src/app/game/[game_id]/page.tsx`:

```tsx
"use client";
import { use, useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { useCountdown } from "@/lib/hooks/useCountdown";
import Link from "next/link";

interface TicketSquare { ticket_id: number; ticket_number: number; status: "Available"|"Locked"|"Sold"; }
interface Game { game_id: string; title: string; ticket_price: number; total_tickets: number; fill_percentage: number; game_status: string; }

export default function GameRoom({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [tickets, setTickets] = useState<TicketSquare[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [housieName, setHousieName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"select" | "locked" | "sold" | "expired">("select");

  const booking = useBookingStore();
  const { display: countdown, secondsLeft } = useCountdown(booking.lockedUntil);

  const loadData = useCallback(async () => {
    const [g, t] = await Promise.all([
      apiFetch<Game>(`/api/games/${game_id}`).catch(() => null),
      apiFetch<{ tickets: TicketSquare[] }>(`/api/games/${game_id}/tickets`).catch(() => ({ tickets: [] })),
    ]);
    if (g) setGame(g);
    setTickets(t.tickets);
  }, [game_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // poll booking status when locked
  useEffect(() => {
    if (phase !== "locked" || !booking.bookingId) return;
    const id = setInterval(async () => {
      try {
        const d = await apiFetch<{ booking_status: string }>(`/api/bookings/status/${booking.bookingId}`);
        if (d.booking_status === "Sold") { setPhase("sold"); clearInterval(id); }
        else if (d.booking_status === "Expired" || d.booking_status === "Cancelled") { setPhase("expired"); clearInterval(id); booking.clear(); }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [phase, booking.bookingId]);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) :
      prev.length >= 6 ? prev : [...prev, id]
    );
  };

  const handleBook = async () => {
    if (!housieName.trim() || selected.length === 0) return;
    setLoading(true); setError("");
    try {
      const data = await apiFetch<any>("/api/bookings/lock", {
        method: "POST",
        body: JSON.stringify({ game_id, ticket_ids: selected, housie_name: housieName.trim() }),
      });
      booking.setBooking({
        bookingId: data.booking_id, housieName: housieName.trim(), gameId: game_id,
        ticketIds: selected, status: "locked", agentPhone: data.agent_phone,
        agentName: data.agent_name, totalAmount: data.total_amount,
        lockedUntil: data.locked_until, whatsappLink: data.whatsapp_link,
      });
      setPhase("locked");
    } catch (e: any) {
      setError(e.message ?? "Booking failed. Try again.");
    } finally { setLoading(false); }
  };

  if (!game) return <div className="min-h-screen bg-cream flex items-center justify-center text-[#888]">Loading...</div>;

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header */}
      <div className="bg-forest text-cream px-5 py-4 flex items-center gap-4">
        <Link href="/" className="text-gold text-xl">←</Link>
        <div>
          <h1 className="font-display text-xl font-bold">{game.title}</h1>
          <p className="text-cream/60 text-xs font-mono">₹{game.ticket_price}/ticket · {game.fill_percentage}% filled</p>
        </div>
      </div>

      {/* Sold phase */}
      {phase === "sold" && (
        <div className="max-w-md mx-auto mt-16 text-center px-5">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="font-display text-2xl font-bold text-forest">Booking Confirmed!</h2>
          <p className="text-[#888] text-sm mt-2 mb-6">Your tickets are locked. Head to the live draw!</p>
          <Link href="/#live" className="bg-forest text-gold font-bold text-sm px-8 py-3 rounded-xl inline-block">
            Watch Live Draw
          </Link>
        </div>
      )}

      {/* Expired phase */}
      {phase === "expired" && (
        <div className="max-w-md mx-auto mt-16 text-center px-5">
          <div className="text-6xl mb-4">⏱</div>
          <h2 className="font-display text-2xl font-bold text-rust">Booking Expired</h2>
          <p className="text-[#888] text-sm mt-2 mb-6">Your reservation timed out. Please select tickets again.</p>
          <button onClick={() => setPhase("select")} className="bg-forest text-gold font-bold text-sm px-8 py-3 rounded-xl">
            Try Again
          </button>
        </div>
      )}

      {/* Lock modal overlay */}
      {phase === "locked" && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="text-center mb-4">
              <p className="text-xs font-mono text-[#888] uppercase tracking-widest">Tickets Reserved</p>
              <div className="font-display text-5xl font-black text-forest my-3">{countdown}</div>
              <p className="text-sm text-[#888]">Pay within this window to confirm</p>
            </div>
            <div className="bg-cream rounded-xl p-4 mb-4 text-sm">
              <p className="text-[#888]">Agent: <strong className="text-forest">{booking.agentName}</strong></p>
              <p className="text-[#888] mt-1">Amount due: <strong className="text-amber font-mono text-lg">₹{booking.totalAmount}</strong></p>
            </div>
            <a
              href={booking.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-wa text-white font-bold py-3 rounded-xl text-sm mb-3"
            >
              💬 Open WhatsApp to Pay
            </a>
            <p className="text-center text-[10px] text-[#888]">Booking ID: {booking.bookingId?.slice(0, 8).toUpperCase()}</p>
            {secondsLeft === 0 && <p className="text-center text-xs text-rust mt-2">Timer expired — waiting for server confirmation...</p>}
          </div>
        </div>
      )}

      {/* Select phase */}
      {phase === "select" && (
        <div className="max-w-5xl mx-auto px-5 py-6">
          <p className="text-sm text-[#888] mb-4">Select up to 6 tickets. Tap to toggle.</p>
          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-2 mb-8">
            {tickets.map((t) => {
              const sel = selected.includes(t.ticket_id);
              return (
                <button
                  key={t.ticket_id}
                  disabled={t.status !== "Available"}
                  onClick={() => toggle(t.ticket_id)}
                  className={`h-11 rounded-xl border-2 text-xs font-mono font-bold transition-all ${
                    sel ? "bg-forest border-forest text-gold scale-105 shadow-md" :
                    t.status === "Sold" ? "bg-cream-dark border-cream-dark text-[#ccc] cursor-not-allowed" :
                    t.status === "Locked" ? "bg-warning/10 border-warning/30 text-warning cursor-not-allowed" :
                    "bg-white border-cream-dark text-[#888] hover:border-forest hover:text-forest"
                  }`}
                >
                  {t.status === "Sold" ? "✕" : t.status === "Locked" ? "🔒" : t.ticket_number}
                </button>
              );
            })}
          </div>

          {/* Sticky footer */}
          {selected.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cream-dark p-4 shadow-xl">
              <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#888] block mb-1">Your Housie Name</label>
                  <input
                    type="text" value={housieName} onChange={(e) => setHousieName(e.target.value)}
                    placeholder="e.g. LuckyStar7"
                    maxLength={20}
                    className="w-full border-2 border-cream-dark rounded-xl px-4 py-2.5 text-sm font-mono focus:border-forest focus:outline-none"
                  />
                  {error && <p className="text-rust text-xs mt-1">{error}</p>}
                </div>
                <button
                  onClick={handleBook}
                  disabled={!housieName.trim() || loading}
                  className="w-full sm:w-auto bg-forest text-gold font-black text-sm px-6 py-3 rounded-xl disabled:opacity-50 transition-all hover:bg-forest-mid shadow-lg"
                >
                  {loading ? "Booking..." : `Book ${selected.length} ticket${selected.length > 1 ? "s" : ""} — ₹${(game.ticket_price * selected.length).toLocaleString()}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/monk/1/HG/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/game/ && git commit -m "feat(frontend): build game room with ticket selection and booking flow"
```

---

## Task 7: Admin Shell — Login + Shared Layout

**Files:**
- Create: `HG/frontend/src/app/admin/login/page.tsx`
- Create: `HG/frontend/src/app/admin/layout.tsx`

- [ ] **Step 1: Create admin login page**

Create `HG/frontend/src/app/admin/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await apiFetch<{ user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      const role: string = data.user.role_name ?? "";
      const dest = role === "Superadmin" ? "/admin/superadmin"
        : role === "Admin" ? "/admin/admin"
        : role === "Operator" ? "/admin/operator"
        : "/admin/agent";
      router.push(dest);
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-bg1 flex items-center justify-center px-5 font-admin">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-black text-gold">Housie Ghar</h1>
          <p className="text-[#6b7280] text-sm mt-1">Staff Login</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-bg2 border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#9ca3af] block mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none font-mono"
              placeholder="you@housieghar.local" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#9ca3af] block mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-danger text-xs font-mono">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-gold hover:bg-gold-light text-forest font-black text-sm py-3 rounded-xl transition-all disabled:opacity-60">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="text-center text-xs text-[#6b7280] mt-4">
          <a href="/" className="hover:text-gold transition-colors">← Back to public site</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create admin shared layout with sidebar**

Create `HG/frontend/src/app/admin/layout.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { apiFetch } from "@/lib/api";
import { useEffect } from "react";

const NAV: Record<string, { label: string; href: string; roles: number[] }[]> = {
  Superadmin: [
    { label: "Dashboard", href: "/admin/superadmin", roles: [1] },
    { label: "Users", href: "/admin/superadmin/users", roles: [1] },
    { label: "Audit Log", href: "/admin/superadmin/audit", roles: [1] },
    { label: "Theming", href: "/admin/superadmin/theming", roles: [1] },
  ],
  Admin: [
    { label: "Dashboard", href: "/admin/admin", roles: [2] },
    { label: "Game Builder", href: "/admin/admin/game-builder", roles: [2] },
    { label: "Agents", href: "/admin/admin/agents", roles: [2] },
  ],
  Operator: [
    { label: "My Games", href: "/admin/operator", roles: [3] },
  ],
  Agent: [
    { label: "Live Queue", href: "/admin/agent", roles: [4] },
    { label: "Wallet", href: "/admin/agent/wallet", roles: [4] },
    { label: "Sales", href: "/admin/agent/sales", roles: [4] },
  ],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user && pathname !== "/admin/login") {
      apiFetch<{ user: any }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => router.push("/admin/login"));
    }
  }, []);

  if (pathname === "/admin/login") return <>{children}</>;

  const roleName = user?.role_name ?? "Agent";
  const navItems = NAV[roleName] ?? [];

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-bg1 font-admin flex">
      {/* Sidebar */}
      <aside className="w-56 bg-bg2 border-r border-border flex flex-col py-6 px-4 hidden md:flex">
        <div className="mb-8">
          <p className="font-display text-lg font-bold text-gold">Housie Ghar</p>
          <p className="text-[10px] font-mono text-[#6b7280] uppercase tracking-wider mt-0.5">{roleName} Panel</p>
        </div>
        <nav className="space-y-1 flex-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${pathname === item.href ? "bg-gold/10 text-gold font-semibold" : "text-[#9ca3af] hover:text-white hover:bg-bg3"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-[#6b7280] truncate">{user.full_name}</p>
            <button onClick={logout} className="text-xs text-[#6b7280] hover:text-danger mt-1 transition-colors">
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Topbar */}
        <div className="bg-bg2 border-b border-border px-6 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{navItems.find((i) => i.href === pathname)?.label ?? "Dashboard"}</p>
          {user?.current_balance !== undefined && (
            <div className="text-xs font-mono text-gold bg-gold/10 border border-gold/20 px-3 py-1 rounded-full">
              Wallet: ₹{user.current_balance.toLocaleString()}
            </div>
          )}
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create stub index redirector for /admin**

Create `HG/frontend/src/app/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function AdminIndex() { redirect("/admin/login"); }
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/monk/1/HG/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/admin/ && git commit -m "feat(frontend): add admin login page and shared layout with sidebar"
```

---

## Task 8: Agent Workspace

**Files:**
- Create: `HG/frontend/src/app/admin/agent/page.tsx`
- Create: `HG/frontend/src/app/admin/agent/wallet/page.tsx`

- [ ] **Step 1: Create agent queue page**

Create `HG/frontend/src/app/admin/agent/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAgentStore } from "@/lib/stores/agentStore";
import { useSocket } from "@/lib/hooks/useSocket";
import { useCountdown } from "@/lib/hooks/useCountdown";

interface BookingRequest {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; locked_until: string;
}

function QueueCard({ req, onAction }: { req: BookingRequest; onAction: () => void }) {
  const { display: countdown } = useCountdown(req.locked_until);
  const [loading, setLoading] = useState(false);

  const act = async (action: "confirm" | "reject") => {
    setLoading(true);
    try {
      await apiFetch(`/api/bookings/agent/${req.booking_id}/${action}`, { method: "POST" });
      onAction();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-bg2 border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">{req.housie_name}</p>
          <p className="text-xs text-[#9ca3af] font-mono mt-0.5">#{req.booking_id.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-gold font-bold">₹{req.total_amount}</p>
          <p className="text-[10px] text-[#9ca3af] font-mono">{countdown} left</p>
        </div>
      </div>
      <p className="text-xs text-[#9ca3af] mb-1">{req.game_title}</p>
      <p className="text-xs font-mono text-[#9ca3af] mb-4">
        Tickets: {req.ticket_numbers.map((n) => `#${n}`).join(", ")}
      </p>
      <div className="flex gap-2">
        <button onClick={() => act("confirm")} disabled={loading}
          className="flex-1 bg-success/10 border border-success/30 text-success font-bold text-xs py-2.5 rounded-xl hover:bg-success hover:text-white transition-all disabled:opacity-50">
          ✓ Confirm Payment
        </button>
        <button onClick={() => act("reject")} disabled={loading}
          className="flex-1 bg-danger/10 border border-danger/30 text-danger font-bold text-xs py-2.5 rounded-xl hover:bg-danger hover:text-white transition-all disabled:opacity-50">
          ✗ Reject
        </button>
      </div>
    </div>
  );
}

export default function AgentQueuePage() {
  const { queue, walletBalance, setQueue, setBalance } = useAgentStore();

  const reload = async () => {
    try {
      const data = await apiFetch<BookingRequest[]>("/api/bookings/agent/queue");
      setQueue(data);
    } catch {}
    try {
      const me = await apiFetch<{ user: any }>("/api/auth/me");
      setBalance(me.user?.current_balance ?? 0);
    } catch {}
  };

  useSocket((event) => {
    if (event === "new_booking_request" || event === "booking_expired") reload();
    if (event === "wallet_credited") reload();
  });

  useEffect(() => { reload(); }, []);

  return (
    <div className="max-w-2xl">
      {/* Wallet strip */}
      <div className="bg-bg2 border border-border rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider">Wallet Balance</p>
          <p className="font-display text-3xl font-black text-gold mt-0.5">₹{walletBalance.toLocaleString()}</p>
          {walletBalance < 500 && (
            <p className="text-warning text-xs mt-1 font-medium">⚠ Low balance — request a top-up</p>
          )}
        </div>
        <a href="/admin/agent/wallet" className="text-xs border border-border text-[#9ca3af] hover:text-white px-4 py-2 rounded-xl transition-all">
          Wallet →
        </a>
      </div>

      {/* Queue */}
      <h2 className="text-sm font-semibold text-white mb-3">
        Pending Bookings {queue.length > 0 && <span className="ml-1 bg-gold text-forest text-[10px] font-bold px-2 py-0.5 rounded-full">{queue.length}</span>}
      </h2>
      {queue.length === 0 ? (
        <div className="bg-bg2 border border-dashed border-border rounded-2xl p-12 text-center text-[#6b7280] text-sm">
          No pending bookings. You're all caught up!
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((req) => <QueueCard key={req.booking_id} req={req} onAction={reload} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create agent wallet page**

Create `HG/frontend/src/app/admin/agent/wallet/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface LedgerEntry { entry_id: number; transaction_type: string; amount: number; created_at: string; notes: string | null; }

export default function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<{ user: any }>("/api/auth/me").then((d) => setBalance(d.user?.current_balance ?? 0)).catch(() => {});
    apiFetch<LedgerEntry[]>("/api/wallet/ledger").then(setLedger).catch(() => {});
  }, []);

  const requestTopUp = async () => {
    if (!amount) return;
    try {
      await apiFetch("/api/wallet/topup/request", { method: "POST", body: JSON.stringify({ amount: Number(amount), notes: note }) });
      setMsg("Top-up request sent to Admin!"); setAmount(""); setNote("");
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Current Balance</p>
        <p className="font-display text-4xl font-black text-gold">₹{balance.toLocaleString()}</p>
      </div>

      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Request Top-up</h3>
        <div className="space-y-3">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (₹)" className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none font-mono" />
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)" className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none" />
          <button onClick={requestTopUp} className="w-full bg-gold text-forest font-black text-sm py-3 rounded-xl hover:bg-gold-light transition-all">
            Request Top-up
          </button>
          {msg && <p className="text-xs text-success font-mono">{msg}</p>}
        </div>
      </div>

      <div className="bg-bg2 border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Transaction History</h3>
        <div className="space-y-2">
          {ledger.map((e) => (
            <div key={e.entry_id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <div>
                <p className="text-xs font-mono text-[#9ca3af]">{e.transaction_type}</p>
                {e.notes && <p className="text-[10px] text-[#6b7280]">{e.notes}</p>}
              </div>
              <span className={`font-mono font-bold text-sm ${e.transaction_type === "Credit" ? "text-success" : "text-danger"}`}>
                {e.transaction_type === "Credit" ? "+" : "-"}₹{e.amount}
              </span>
            </div>
          ))}
          {ledger.length === 0 && <p className="text-[#6b7280] text-xs">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/admin/agent/ && git commit -m "feat(frontend): build agent workspace — queue and wallet"
```

---

## Task 9: Operator Console

**Files:**
- Create: `HG/frontend/src/app/admin/operator/page.tsx`
- Create: `HG/frontend/src/app/admin/operator/console/[game_id]/page.tsx`

- [ ] **Step 1: Create operator game list**

Create `HG/frontend/src/app/admin/operator/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Game { game_id: string; title: string; scheduled_at: string; game_status: string; fill_percentage: number; }

export default function OperatorPage() {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    apiFetch<Game[]>("/api/games").then(setGames).catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-sm font-semibold text-white mb-4">Your Assigned Games</h2>
      {games.map((g) => (
        <div key={g.game_id} className="bg-bg2 border border-border rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">{g.title}</p>
            <p className="text-xs text-[#9ca3af] font-mono mt-0.5">
              {new Date(g.scheduled_at).toLocaleString("en-IN")} · {g.fill_percentage}% filled
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              g.game_status === "Live" ? "bg-success/10 text-success border border-success/30" :
              g.game_status === "Paused" ? "bg-warning/10 text-warning" :
              g.game_status === "Completed" ? "bg-bg3 text-[#6b7280]" : "bg-bg3 text-[#9ca3af]"
            }`}>{g.game_status}</span>
            <Link href={`/admin/operator/console/${g.game_id}`}
              className="text-xs bg-gold/10 border border-gold/20 text-gold px-4 py-2 rounded-xl hover:bg-gold/20 transition-all">
              Open →
            </Link>
          </div>
        </div>
      ))}
      {games.length === 0 && <p className="text-[#6b7280] text-sm">No games assigned.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create operator live console**

Create `HG/frontend/src/app/admin/operator/console/[game_id]/page.tsx`:

```tsx
"use client";
import { use, useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useGameStore } from "@/lib/stores/gameStore";
import { useSSE } from "@/lib/hooks/useSSE";

interface Game { game_id: string; title: string; game_status: string; }

export default function OperatorConsole({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [speedMs, setSpeedMs] = useState(8000);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const { drawnNumbers, lastDrawn, gameStatus, setStatus, addDrawn } = useGameStore();

  useSSE(game_id);

  useEffect(() => {
    apiFetch<Game>(`/api/games/${game_id}`).then((g) => { setGame(g); setStatus(g.game_status as any); }).catch(() => {});
  }, [game_id]);

  const pushLog = (msg: string) => setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const ctrl = async (action: "start" | "pause" | "resume") => {
    try {
      await apiFetch(`/api/games/${game_id}/${action}`, { method: "POST" });
      pushLog(`${action.charAt(0).toUpperCase() + action.slice(1)} command sent`);
    } catch (e: any) { pushLog(`Error: ${e.message}`); }
  };

  const changeSpeed = async (ms: number) => {
    setSpeedMs(ms);
    try { await apiFetch(`/api/games/${game_id}/speed`, { method: "POST", body: JSON.stringify({ interval_ms: ms }) }); }
    catch {}
  };

  return (
    <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Controls */}
      <div className="space-y-4">
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Game</p>
          <p className="font-semibold text-white">{game?.title ?? "Loading…"}</p>
          <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full mt-2 ${
            gameStatus === "Live" ? "bg-success/10 text-success border border-success/30" :
            gameStatus === "Paused" ? "bg-warning/10 text-warning" : "bg-bg3 text-[#9ca3af]"
          }`}>{gameStatus}</span>
        </div>

        <div className="bg-bg2 border border-border rounded-2xl p-5 space-y-3">
          {gameStatus === "Scheduled" && (
            <button onClick={() => ctrl("start")} className="w-full bg-success text-white font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              🚀 Start Draw
            </button>
          )}
          {gameStatus === "Live" && (
            <button onClick={() => ctrl("pause")} className="w-full bg-warning text-forest font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              ⏸ Pause Draw
            </button>
          )}
          {gameStatus === "Paused" && (
            <button onClick={() => ctrl("resume")} className="w-full bg-success text-white font-black text-sm py-3 rounded-xl hover:opacity-90 transition-all">
              ▶ Resume Draw
            </button>
          )}
          {gameStatus === "Completed" && (
            <div className="text-center text-[#6b7280] text-sm py-3">Game completed 🏁</div>
          )}

          <div>
            <label className="text-[10px] font-mono text-[#9ca3af] uppercase tracking-wider block mb-2">
              Draw Speed: {speedMs / 1000}s
            </label>
            <input type="range" min={5000} max={12000} step={1000} value={speedMs}
              onChange={(e) => changeSpeed(Number(e.target.value))}
              className="w-full accent-gold" />
            <div className="flex justify-between text-[10px] text-[#6b7280] font-mono mt-1">
              <span>5s (fast)</span><span>12s (slow)</span>
            </div>
          </div>
        </div>

        {/* Current number */}
        <div className="bg-bg2 border border-border rounded-2xl p-5 text-center">
          <p className="text-[10px] text-[#9ca3af] uppercase tracking-widest mb-2">Last Drawn</p>
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-gold to-gold-light flex items-center justify-center mx-auto shadow-lg shadow-gold/20">
            <span className="font-display text-3xl font-black text-forest">{lastDrawn ?? "--"}</span>
          </div>
          <p className="text-xs font-mono text-[#9ca3af] mt-2">{drawnNumbers.length}/90</p>
        </div>
      </div>

      {/* Board + log */}
      <div className="lg:col-span-2 space-y-4">
        {/* 90-number board */}
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3">Draw Board</p>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
              <div key={n} className={`h-8 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all ${
                drawnNumbers.includes(n) ? "bg-gold text-forest scale-105" : "bg-bg3 text-[#6b7280]"
              }`}>{n}</div>
            ))}
          </div>
        </div>

        {/* Event log */}
        <div className="bg-bg2 border border-border rounded-2xl p-5">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3">Conductor Log</p>
          <div ref={logRef} className="h-48 bg-bg1 rounded-xl p-4 font-mono text-xs text-success space-y-1 overflow-y-auto">
            {log.length === 0 ? <span className="text-[#6b7280]">Waiting for draw events…</span> : log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/admin/operator/ && git commit -m "feat(frontend): build operator game list and live conductor console"
```

---

## Task 10: Admin Console

**Files:**
- Create: `HG/frontend/src/app/admin/admin/page.tsx`

- [ ] **Step 1: Create admin dashboard page**

Create `HG/frontend/src/app/admin/admin/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

interface Game { game_id: string; title: string; scheduled_at: string; game_status: string; fill_percentage: number; sold_count: number; total_tickets: number; }
interface Agent { user_id: string; full_name: string; current_balance: number; status: string; }
interface TopUpRequest { request_id: string; agent_name: string; amount: number; status: string; }

export default function AdminDashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [topUps, setTopUps] = useState<TopUpRequest[]>([]);
  const [tab, setTab] = useState<"games" | "agents" | "topups">("games");

  useEffect(() => {
    apiFetch<Game[]>("/api/games").then(setGames).catch(() => {});
    apiFetch<Agent[]>("/api/wallet/agents").then(setAgents).catch(() => {});
    apiFetch<TopUpRequest[]>("/api/wallet/topup/pending").then(setTopUps).catch(() => {});
  }, []);

  const approveTopUp = async (id: string) => {
    try { await apiFetch(`/api/wallet/topup/${id}/approve`, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    apiFetch<TopUpRequest[]>("/api/wallet/topup/pending").then(setTopUps).catch(() => {});
  };

  return (
    <div className="max-w-5xl">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Games", value: games.length },
          { label: "Live Games", value: games.filter((g) => g.game_status === "Live").length },
          { label: "Active Agents", value: agents.filter((a) => a.status === "Active").length },
          { label: "Pending Top-ups", value: topUps.length },
        ].map((s) => (
          <div key={s.label} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{s.label}</p>
            <p className="font-display text-2xl font-black text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick create link */}
      <div className="flex gap-3 mb-6">
        <Link href="/admin/admin/game-builder" className="bg-gold text-forest font-black text-xs px-5 py-2.5 rounded-xl hover:bg-gold-light transition-all">
          + New Game
        </Link>
        <Link href="/admin/admin/agents" className="border border-border text-[#9ca3af] hover:text-white text-xs px-5 py-2.5 rounded-xl transition-all">
          Manage Agents
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg2 p-1 rounded-xl border border-border mb-6 w-fit">
        {(["games", "agents", "topups"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${tab === t ? "bg-gold/10 text-gold border border-gold/20" : "text-[#9ca3af] hover:text-white"}`}>
            {t === "topups" ? "Top-ups" : t}
          </button>
        ))}
      </div>

      {tab === "games" && (
        <div className="space-y-3">
          {games.map((g) => (
            <div key={g.game_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{g.title}</p>
                <p className="text-xs text-[#9ca3af] font-mono">{new Date(g.scheduled_at).toLocaleString("en-IN")} · {g.sold_count}/{g.total_tickets} sold</p>
              </div>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${g.game_status === "Live" ? "bg-success/10 text-success" : "bg-bg3 text-[#9ca3af]"}`}>
                {g.game_status}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "agents" && (
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.user_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{a.full_name}</p>
                <p className={`text-[10px] font-mono ${a.status === "Active" ? "text-success" : "text-danger"}`}>{a.status}</p>
              </div>
              <p className="font-mono font-bold text-gold">₹{a.current_balance?.toLocaleString() ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "topups" && (
        <div className="space-y-3">
          {topUps.length === 0 && <p className="text-[#6b7280] text-sm">No pending top-up requests.</p>}
          {topUps.map((r) => (
            <div key={r.request_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{r.agent_name}</p>
                <p className="font-mono font-bold text-gold">₹{r.amount.toLocaleString()}</p>
              </div>
              <button onClick={() => approveTopUp(r.request_id)}
                className="text-xs bg-success/10 border border-success/30 text-success px-4 py-2 rounded-xl hover:bg-success hover:text-white transition-all">
                Approve
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/admin/admin/ && git commit -m "feat(frontend): build admin console dashboard"
```

---

## Task 11: Superadmin Dashboard

**Files:**
- Create: `HG/frontend/src/app/admin/superadmin/page.tsx`

- [ ] **Step 1: Create superadmin dashboard**

Create `HG/frontend/src/app/admin/superadmin/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface User { user_id: string; full_name: string; email: string; role_name: string; status: string; current_balance?: number; }
interface AuditEntry { log_id: number; actor_name: string; action: string; target_entity: string; created_at: string; }
interface Theme { theme_id: number; theme_name: string; is_active: boolean; }

export default function SuperadminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "audit" | "themes">("overview");

  useEffect(() => {
    apiFetch<User[]>("/api/users").then(setUsers).catch(() => {});
    apiFetch<AuditEntry[]>("/api/audit?limit=20").then(setAudit).catch(() => {});
    apiFetch<Theme[]>("/api/themes").then(setThemes).catch(() => {});
  }, []);

  const setTheme = async (id: number) => {
    try { await apiFetch("/api/themes/active", { method: "PUT", body: JSON.stringify({ theme_id: id }) }); }
    catch (e: any) { alert(e.message); }
    apiFetch<Theme[]>("/api/themes").then(setThemes).catch(() => {});
  };

  const toggleUser = async (userId: string, currentStatus: string) => {
    try {
      await apiFetch(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ status: currentStatus === "Active" ? "Suspended" : "Active" }) });
      apiFetch<User[]>("/api/users").then(setUsers).catch(() => {});
    } catch (e: any) { alert(e.message); }
  };

  const roles = ["Superadmin", "Admin", "Operator", "Agent"];

  return (
    <div className="max-w-5xl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {roles.map((r) => ({
          role: r, count: users.filter((u) => u.role_name === r).length
        })).map(({ role, count }) => (
          <div key={role} className="bg-bg2 border border-border rounded-2xl p-4">
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{role}s</p>
            <p className="font-display text-2xl font-black text-white mt-1">{count}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg2 p-1 rounded-xl border border-border mb-6 w-fit">
        {(["overview", "users", "audit", "themes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${tab === t ? "bg-gold/10 text-gold border border-gold/20" : "text-[#9ca3af] hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-bg2 border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Active Theme</h3>
            <p className="text-gold font-mono">{themes.find((t) => t.is_active)?.theme_name ?? "Default"}</p>
          </div>
          <div className="bg-bg2 border border-border rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Total Wallet Liability</h3>
            <p className="font-display text-2xl font-black text-gold">
              ₹{users.filter((u) => u.role_name === "Agent").reduce((s, u) => s + (u.current_balance ?? 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.user_id} className="bg-bg2 border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white text-sm">{u.full_name}</p>
                <p className="text-xs text-[#9ca3af] font-mono">{u.email} · {u.role_name}</p>
              </div>
              <button onClick={() => toggleUser(u.user_id, u.status)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                  u.status === "Active"
                    ? "border-danger/30 text-danger hover:bg-danger hover:text-white"
                    : "border-success/30 text-success hover:bg-success hover:text-white"
                }`}>
                {u.status === "Active" ? "Suspend" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="bg-bg2 border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-[#9ca3af]">
                {["Time", "Actor", "Action", "Target"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.log_id} className="border-b border-border last:border-0 hover:bg-bg3 transition-colors">
                  <td className="px-4 py-3 text-[#6b7280]">{new Date(e.created_at).toLocaleTimeString("en-IN")}</td>
                  <td className="px-4 py-3 text-white">{e.actor_name}</td>
                  <td className="px-4 py-3 text-gold">{e.action}</td>
                  <td className="px-4 py-3 text-[#9ca3af]">{e.target_entity}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6b7280]">No audit entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "themes" && (
        <div className="grid sm:grid-cols-2 gap-4">
          {themes.map((t) => (
            <button key={t.theme_id} onClick={() => setTheme(t.theme_id)}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${t.is_active ? "border-gold bg-gold/10" : "border-border bg-bg2 hover:border-border-active"}`}>
              <p className="font-semibold text-white text-sm">{t.theme_name}</p>
              {t.is_active && <span className="text-[10px] font-mono text-gold uppercase mt-1 block">Active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/monk/1 && git add HG/frontend/src/app/admin/superadmin/ && git commit -m "feat(frontend): build superadmin dashboard with users, audit, themes"
```

---

## Task 12: TypeScript Check and Final Wiring

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/monk/1/HG/frontend && npx tsc --noEmit 2>&1
```

Fix any type errors before proceeding. Common issues:
- `use(params)` — Next.js 16 requires `params` to be a `Promise`; the `use()` hook unwraps it.
- Missing `"use client"` directive on pages using hooks.
- Zustand v5: `create<Store>()` (curried form) is required when using middleware like `persist`.

- [ ] **Step 2: Test dev build**

```bash
cd /Users/monk/1/HG/frontend && npm run dev 2>&1 &
sleep 8
curl -s http://localhost:3000 | grep -i "housie" | head -3
curl -s http://localhost:3000/admin/login | grep -i "sign in" | head -3
```

- [ ] **Step 3: Verify middleware redirects work**

```bash
curl -v http://localhost:3000/admin/agent 2>&1 | grep -E "Location|302|200" | head -5
```

Expected: 302 redirect to `/admin/login` (no auth cookie present).

- [ ] **Step 4: Final commit**

```bash
cd /Users/monk/1 && git add -A && git commit -m "feat(frontend): complete 5-role frontend workspaces for Housie Ghar"
```

---

## Self-Review

**Spec coverage:**
- ✅ Player homepage (hero, games lobby, how-to-play, live draw)
- ✅ Game room ticket selection with soft-lock booking flow
- ✅ Agent workspace (queue + confirm/reject + wallet + top-up)
- ✅ Operator workspace (game list + live conductor console + speed slider + pause/resume)
- ✅ Admin console (overview + games + agents + top-up approvals)
- ✅ Superadmin (users + suspend/activate + audit log + theme switcher)
- ✅ JWT middleware protecting `/admin/*`
- ✅ SSE for player live draw
- ✅ Socket.io for agent/operator real-time events
- ✅ Zustand stores (auth, game, booking persisted to localStorage, agent)
- ✅ Tailwind v4 theme with forest/gold/cream palette
- ⚠ Game builder wizard (POST /api/games form) — deferred; Admin page links to `/admin/admin/game-builder` but that page is not implemented. Add as a follow-up task.
- ⚠ Agent sales page (`/admin/agent/sales`) — deferred similarly.

**Type consistency:** All stores use matching field names across hooks and pages. `BookingRequest.booking_id` used consistently. `game_status` string union matches backend responses.

**Placeholder check:** No TBD/TODO in code blocks. All API paths use actual backend routes from PRD §7.
