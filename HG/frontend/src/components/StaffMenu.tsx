"use client";
/** TopNav lock dropdown — three staff doors (Super Admin, Admin, Bookie).
 *  Reuses the .hg-acct-menu popover pattern; outside-click + Esc close. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { STAFF_DOORS, DROPDOWN_DOORS } from "@/lib/staffRoles";

export function StaffMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (login: string) => { setOpen(false); router.push(login); };

  return (
    <div className="hg-acct" ref={rootRef}>
      <button
        className="hg-staff-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Staff login"
        title="Staff login"
      >
        <Icon name="lock" size={17} strokeWidth={2} />
      </button>
      {open && (
        <div className="hg-acct-menu" role="menu">
          <div className="hg-acct-head"><span className="hg-acct-who">Staff portal</span></div>
          {DROPDOWN_DOORS.map((role) => (
            <button
              key={role}
              className="hg-acct-item"
              role="menuitem"
              onClick={() => go(STAFF_DOORS[role].login)}
            >
              <Icon name={STAFF_DOORS[role].icon} size={15} strokeWidth={2} /> {STAFF_DOORS[role].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
