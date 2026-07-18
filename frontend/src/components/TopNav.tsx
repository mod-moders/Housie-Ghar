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
    // 1. First check if logged in as player
    apiFetch<{ player: { housie_name: string } }>("/api/player/me")
      .then((res) => {
        setUser({ role: "player", name: res.player.housie_name, label: res.player.housie_name });
      })
      .catch(() => {
        // 2. If not player, check if logged in as staff
        apiFetch<{ user: { full_name: string; role_name: string } }>("/api/auth/me")
          .then((res) => {
            setUser({
              role: "staff",
              name: res.user.full_name,
              label: `${res.user.full_name} (${res.user.role_name})`
            });
          })
          .catch(() => {
            setUser(null);
          });
      });
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
        {user?.role === "staff" ? (
          <button className="hg-staff-btn is-active" onClick={() => go("/staff")} aria-label="Staff panel" title="Staff panel">
            <Icon name="shield" size={18} strokeWidth={2.2} />
          </button>
        ) : (
          <button className="hg-staff-btn" onClick={() => go("/staff/login")} aria-label="Staff login" title="Staff login">
            <Icon name="lock" size={18} strokeWidth={2.2} />
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
