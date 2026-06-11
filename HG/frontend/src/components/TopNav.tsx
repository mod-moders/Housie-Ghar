"use client";
/** Sticky public top navigation (ported from the prototype). */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Logo } from "./ui";

const ITEMS: [string, string, string][] = [
  ["/", "Games", "grid"],
  ["/winners", "Winners", "trophy"],
  ["/how-to-play", "How to Play", "help"],
];

export function TopNav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
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
        <button className="hg-staff-btn" onClick={() => go("/staff/login")} aria-label="Staff login" title="Staff login">
          <Icon name="lock" size={17} strokeWidth={2} />
        </button>
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
          <button className="hg-sheet-link" onClick={() => go("/staff/login")}>
            <Icon name="lock" size={18} /> Staff Login
          </button>
        </div>
      )}
    </header>
  );
}
