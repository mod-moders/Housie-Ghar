"use client";
/** Sticky public top navigation (ported from the prototype). */

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Logo } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";
import { PLAYER_UPDATED_EVENT, type PlayerUpdatedDetail } from "@/lib/playerSession";
import { apiFetch } from "@/lib/api";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{
    role: "player" | "staff";
    name: string;
    label: string;
    avatar?: string | null;
  } | null>(null);

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
    const playerCheck = apiFetch<{ player: { housie_name: string; avatar_url: string | null } }>(
      "/api/player/me"
    ).catch(() => null);
    const staffCheck = apiFetch<{ user: { full_name: string; role_name: string; avatar_url: string | null } }>("/api/auth/me").catch(() => null);

    Promise.all([playerCheck, staffCheck]).then(([playerRes, staffRes]) => {
      if (cancelled) return;
      if (staffRes) {
        setUser({
          role: "staff",
          name: staffRes.user.full_name,
          label: `${staffRes.user.full_name} (${staffRes.user.role_name})`,
          avatar: staffRes.user.avatar_url,
        });
      } else if (playerRes) {
        setUser({
          role: "player",
          name: playerRes.player.housie_name,
          label: playerRes.player.housie_name,
          avatar: playerRes.player.avatar_url,
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The profile page and the nav are separate trees, and saving a profile does
  // not remount the nav — so without this the new picture only appeared after a
  // navigation or a reload. The profile page announces what it saved and the
  // chip follows immediately.
  useEffect(() => {
    const onPlayerUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PlayerUpdatedDetail>).detail;
      if (!detail) return;
      setUser((prev) =>
        prev && prev.role === "player"
          ? {
              ...prev,
              name: detail.housie_name || prev.name,
              label: detail.housie_name || prev.label,
              avatar: detail.avatar_url ?? null,
            }
          : prev
      );
    };
    window.addEventListener(PLAYER_UPDATED_EVENT, onPlayerUpdated);
    return () => window.removeEventListener(PLAYER_UPDATED_EVENT, onPlayerUpdated);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // The four section links sit in the centre column; the account link is
  // pulled out so it can live at the far end of the bar next to the staff
  // shortcut. The mobile sheet still lists all five together.
  const sectionItems = [
    ["/", "GAMES", "grid"],
    ["/leaderboard", "LEADERBOARD", "trophy"],
    ["/stats", "STATS", "chart"],
    ["/how-to-play", "HOW TO PLAY", "help"],
  ];
  // A signed-in user — player or staff — gets their own name in place of the
  // generic label: in the bar as an avatar chip, and in the burger sheet.
  //
  // Staff used to get "STAFF LOGIN" pointing at /staff/login here even while
  // signed in, sitting immediately next to a shield that already went to their
  // dashboard. It read as "you are signed out" to someone who was signed in,
  // and the burger sheet listed the same dead link above a working
  // "My Dashboard" row.
  const account = user;
  const accountItem =
    user?.role === "staff"
      ? ["/staff", user.name, "shieldCheck"]
      : ["/profile", user?.role === "player" ? user.name : "PROFILE", "user"];
  const navItems = [...sectionItems, accountItem];

  return (
    <header className="hg-nav">
      <div className="hg-nav-left">
        <Logo onClick={() => go("/")} />
      </div>
      <nav className="hg-nav-links">
        {sectionItems.map(([href, lbl, icon]) => (
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
        {account ? (
          <button
            className={`hg-player-chip hg-account-chip${pathname === accountItem[0] ? " is-active" : ""}`}
            onClick={() => go(accountItem[0])}
            title={account.label}
            aria-label={account.role === "staff" ? `Staff panel — ${account.label}` : `Profile — ${account.name}`}
          >
            <span className="hg-account-avatar" aria-hidden="true">
              <PlayerAvatar avatar={account.avatar} name={account.name} />
            </span>
            <span className="hg-account-name">{account.name}</span>
          </button>
        ) : (
          <button
            className={`hg-nav-link hg-nav-account${pathname === accountItem[0] ? " is-active" : ""}`}
            onClick={() => go(accountItem[0])}
          >
            <Icon name={accountItem[2]} size={16} /> <span style={{ marginLeft: "6px" }}>{accountItem[1]}</span>
          </button>
        )}
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
            {/* Signed-in staff already have their dashboard in navItems above
                (accountItem points at /staff), so only offer the login link to
                someone who is not signed in as staff. */}
            {user?.role !== "staff" && (
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
