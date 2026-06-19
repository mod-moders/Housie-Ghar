"use client";
/** Sticky public top navigation (ported from the prototype). */

import { useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Logo } from "./ui";
import { AccountButton } from "./AccountButton";
import { StaffMenu } from "./StaffMenu";
import { apiFetch } from "@/lib/api";
import { usePlayerStore } from "@/lib/stores/playerStore";
import { STAFF_DOORS, DROPDOWN_DOORS } from "@/lib/staffRoles";

// false during SSR/first paint, true after hydration — keeps the
// localStorage-backed player chip from causing a hydration mismatch.
const emptySubscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(emptySubscribe, () => true, () => false);

// Theme as a tiny external store — body.dataset.theme is the source of truth
// (set pre-hydration by the inline script in layout.tsx). Reading it via
// useSyncExternalStore keeps the toggle off effects/setState-in-effect.
const THEME_KEY = "hg-theme";
const themeListeners = new Set<() => void>();
const subscribeTheme = (cb: () => void) => {
  themeListeners.add(cb);
  return () => { themeListeners.delete(cb); };
};
const readTheme = (): "dark" | "light" =>
  typeof document !== "undefined" && document.body.dataset.theme === "light" ? "light" : "dark";
const setTheme = (next: "dark" | "light") => {
  document.body.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  themeListeners.forEach((f) => f());
};

const ITEMS: [string, string, string][] = [
  ["/", "Games", "grid"],
  ["/winners", "Winners", "trophy"],
  ["/how-to-play", "How to Play", "help"],
];

export function TopNav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const player = usePlayerStore((s) => (hydrated ? s.player : null));
  const clearPlayer = usePlayerStore((s) => s.clear);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark");

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const signOut = async () => {
    try {
      await apiFetch("/api/players/logout", { method: "POST" });
    } catch {
      // cookie may already be gone — still clear local state
    }
    clearPlayer();
    setOpen(false);
    router.push("/login");
  };

  return (
    <header className="hg-nav">
      <Logo onClick={() => go("/")} />
      <nav className="hg-nav-links">
        {ITEMS.map(([href, lbl]) => (
          <button
            key={lbl}
            className={`hg-nav-link${pathname === href ? " is-active" : ""}`}
            onClick={() => go(href)}
          >
            {lbl}
          </button>
        ))}
      </nav>
      <div className="hg-nav-right">
        <AccountButton />
        <button className="hg-theme-btn" onClick={toggleTheme} aria-label="Toggle theme" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={17} strokeWidth={2} />
        </button>
        <StaffMenu />
        <button className="hg-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          <Icon name={open ? "x" : "menu"} size={20} />
        </button>
      </div>
      {open && (
        <div className="hg-nav-sheet">
          {ITEMS.map(([href, lbl, icon]) => (
            <button key={lbl} className="hg-sheet-link" onClick={() => go(href)}>
              <Icon name={icon} size={18} /> {lbl}
            </button>
          ))}
          {DROPDOWN_DOORS.map((role) => (
            <button key={role} className="hg-sheet-link" onClick={() => go(STAFF_DOORS[role].login)}>
              <Icon name={STAFF_DOORS[role].icon} size={18} /> {STAFF_DOORS[role].label}
            </button>
          ))}
          {player && (
            <button className="hg-sheet-link" onClick={signOut}>
              <Icon name="user" size={18} /> Sign out ({player.username})
            </button>
          )}
        </div>
      )}
    </header>
  );
}
