"use client";
/** Sticky public top navigation (ported from the prototype). */

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Logo } from "./ui";
import { apiFetch } from "@/lib/api";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ role: "player" | "staff"; name: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Staff and player sessions are independent cookies (hg_auth_token vs
    // hg_player_token) and can both be valid at once — e.g. a bookie who
    // also plays. Checking player first (and only checking staff on
    // failure) meant an active staff session was silently masked whenever
    // a player cookie was also present: the header showed "Staff Login"
    // and hid the Staff Panel shortcut even though the user was already
    // authenticated as staff. Run both checks in parallel and prefer
    // staff whenever it succeeds, so a real staff session is never hidden.
    const playerCheck = apiFetch<{ player: { housie_name: string } }>("/api/player/me").catch(() => null);
    const staffCheck = apiFetch<{ user: { full_name: string; role_name: string } }>("/api/auth/me").catch(() => null);

    Promise.all([playerCheck, staffCheck]).then(([playerRes, staffRes]) => {
      if (cancelled) return;
      if (staffRes) {
        setUser({
          role: "staff",
          name: staffRes.user.full_name,
          label: `${staffRes.user.full_name} (${staffRes.user.role_name})`
        });
      } else if (playerRes) {
        setUser({ role: "player", name: playerRes.player.housie_name, label: playerRes.player.housie_name });
      } else {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const navItems = [
    ["/", "GAMES", "grid"],
    ["/leaderboard", "LEADERBOARD", "trophy"],
    ["/stats", "STATS", "chart"],
    ["/how-to-play", "HOW TO PLAY", "help"],
    user?.role === "staff"
      ? ["/staff", "STAFF PANEL", "shield"]
      : ["/profile", "PROFILE", "user"],
  ];

  return (
    <header className="hg-nav">
      <Logo onClick={() => go("/")} />
      <nav className="hg-nav-links">
        {navItems.map(([href, lbl, icon]) => (
          <button
            key={lbl}
            className={`hg-nav-link${pathname === href ? " is-active" : ""}`}
            onClick={() => go(href)}
          >
            <Icon name={icon} size={16} /> <span style={{ marginLeft: "6px" }}>{lbl}</span>
          </button>
        ))}
      </nav>

      <div className="hg-nav-right">
        {user?.role === "staff" && (
          <button className="hg-staff-btn is-active" onClick={() => go("/staff")} aria-label="Staff panel" title="Staff panel">
            <Icon name="shield" size={18} strokeWidth={2.2} />
          </button>
        )}
        <button className="hg-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          <Icon name={open ? "x" : "menu"} size={20} />
        </button>
      </div>
      {open && (
        <>
          <div className="hg-nav-backdrop" onClick={() => setOpen(false)} />
          <div className="hg-nav-sheet">
            {navItems.map(([href, lbl, icon]) => (
              <button key={lbl} className="hg-sheet-link" onClick={() => go(href)}>
                <Icon name={icon} size={18} /> {lbl}
              </button>
            ))}
            {user?.role === "staff" ? (
              <button className="hg-sheet-link" onClick={() => go("/staff")}>
                <Icon name="shield" size={18} /> Staff Panel ({user.name})
              </button>
            ) : (
              <button className="hg-sheet-link" onClick={() => go("/staff/login")}>
                <Icon name="lock" size={18} /> Staff Login
              </button>
            )}
          </div>
        </>
      )}
    </header>
  );
}
