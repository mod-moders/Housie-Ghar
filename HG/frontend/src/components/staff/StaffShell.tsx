"use client";
/** Staff dashboard shell — role-driven sidebar sections. Shared by the generic
 *  /staff route (no `expects`) and the per-role panels (`expects` enforced). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Avatar, Logo } from "@/components/ui";
import { roleAvatar } from "@/lib/roleAvatar";
import {
  GamesSection, FillingSection, WorkforceSection, AuditSection, HistorySection,
} from "@/components/staff/AdminSections";
import { FinanceHubSection, PrizePayoutsSection } from "@/components/staff/FinanceSections";
import { OperatorHudSection, OverflowSection, ShareGamesSection } from "@/components/staff/OperatorSections";
import { BookieQueueSection, BookieWalletSection } from "@/components/staff/BookieSections";
import { PlayersSection } from "@/components/staff/PlayersSection";
import { ProfileSection } from "@/components/staff/ProfileSection";
import { SettingsSection } from "@/components/staff/SettingsSection";
import { ChangePasswordCard } from "@/components/staff/ChangePasswordCard";
import { STAFF_DOORS, type DoorRole } from "@/lib/staffRoles";
import type { FinancialHud } from "@/lib/types";

type NavItem = [key: string, label: string, icon: string];

function navFor(user: AuthUser): NavItem[] {
  const isFo = user.role_name === "Superadmin" || (user.role_name === "Admin" && user.is_cfo === true);
  if (user.role_id <= 2) {
    const items: NavItem[] = [];
    if (isFo) items.push(["finance", "Finance Hub", "wallet"], ["payouts", "Prize Payouts", "trophy"]);
    items.push(
      ["games", "Games", "grid"],
      ["history", "Past Games", "clock"],
      ["players", "Player Management", "users"],
      ["staff", "Staff Management", "shieldCheck"],
      ["audit", "Website Audits", "shield"],
    );
    if (user.role_name === "Superadmin") items.push(["settings", "Website Settings", "edit"]);
    items.push(["profile", "My Profile", "user"]);
    return items;
  }
  if (user.role_name === "Operator") {
    return [
      ["hud", "Live HUD", "play"],
      ["overflow", "Overflow Queue", "bell"],
      ["filling", "Filling Status", "ticket"],
      ["broadcast", "Share to WhatsApp", "chat"],
      ["profile", "My Profile", "user"],
    ];
  }
  return [
    ["queue", "Booking Queue", "bell"],
    ["wallet", "My Wallet", "wallet"],
    ["filling", "Filling Status", "ticket"],
    ["profile", "My Profile", "user"],
  ];
}

export function StaffShell({ expects }: { expects?: DoorRole }) {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [section, setSection] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hud, setHud] = useState<FinancialHud | null>(null);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  const [checked, setChecked] = useState(false);

  // Authoritative profile (also restores the session after a reload). When this
  // panel is a specific door, enforce that the signed-in role matches — wrong
  // role is sent softly to its own panel; no session goes to this door's login.
  useEffect(() => {
    const loginPath = expects ? STAFF_DOORS[expects].login : "/staff/login";
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((res) => {
        if (expects && res.user.role_name !== expects) {
          router.replace(STAFF_DOORS[res.user.role_name].panel);
          return;
        }
        setUser(res.user);
        setChecked(true);
      })
      .catch(() => router.replace(loginPath));
  }, [setUser, router, expects]);

  // Browser-tab title per role, so several open panels stay tellable apart.
  useEffect(() => {
    if (!user) return;
    const label = user.role_name === "Agent" ? "Bookie" : user.role_name;
    document.title = `HG-${label}`;
  }, [user]);

  const nav = useMemo(() => (user ? navFor(user) : []), [user]);
  const isFo = !!user && (user.role_name === "Superadmin" || (user.role_name === "Admin" && user.is_cfo === true));
  const active = section ?? nav[0]?.[0] ?? null;

  const loadHud = useCallback(() => {
    apiFetch<FinancialHud>("/api/wallet/hud").then(setHud).catch(() => {});
  }, []);

  const loadPendingPayouts = useCallback(() => {
    apiFetch<{ count: number }>("/api/settlements/pending/count")
      .then((r) => setPendingPayouts(r.count))
      .catch(() => {});
  }, []);

  const needsPassword = checked && user?.temp_password_required === true;

  useEffect(() => {
    if (checked && isFo && !needsPassword) { loadHud(); loadPendingPayouts(); }
  }, [checked, isFo, needsPassword, loadHud, loadPendingPayouts]);

  const logout = async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch { /* cookie may already be gone */ }
    setUser(null);
    router.replace(expects ? STAFF_DOORS[expects].login : "/staff/login");
  };

  if (!user || !checked || !active) {
    return (
      <div className="hg-stage hg-stage-wide">
        <div className="hg-frame hg-frame-wide">
          <div className="hg-empty" style={{ paddingTop: 120 }}>
            <span className="hg-poll-spin" />
          </div>
        </div>
      </div>
    );
  }

  // First-login gate: the backend 403s every staff API (except auth) while the
  // temp password stands, so the dashboard is unusable until it's changed.
  if (needsPassword) {
    return (
      <div className="hg-stage">
        <div className="hg-frame">
          <ChangePasswordCard onDone={() => setUser({ ...user, temp_password_required: false })} />
        </div>
      </div>
    );
  }

  const roleLabel = user.role_name === "Agent" ? "Bookie" : user.is_cfo ? "Financial Officer" : user.role_name;
  const showFinanceBar = isFo && hud && active === "finance";

  const renderSection = () => {
    switch (active) {
      case "finance": return <FinanceHubSection onResolved={loadHud} />;
      case "payouts": return <PrizePayoutsSection onSettled={loadPendingPayouts} />;
      case "games": return <GamesSection />;
      case "history": return <HistorySection />;
      case "players": return <PlayersSection me={user} />;
      case "filling": return <FillingSection />;
      case "staff": return <WorkforceSection me={user} />;
      case "audit": return <AuditSection />;
      case "settings": return <SettingsSection />;
      case "hud": return <OperatorHudSection />;
      case "overflow": return <OverflowSection />;
      case "broadcast": return <ShareGamesSection />;
      case "queue": return <BookieQueueSection me={user} />;
      case "wallet": return <BookieWalletSection me={user} />;
      case "profile": return <ProfileSection me={user} onUpdated={setUser} />;
      default: return null;
    }
  };

  return (
    <div className="hg-stage hg-stage-wide">
      <div className="hg-frame hg-frame-wide">
        <div className="hg-dash">
          <aside className={`hg-side${collapsed ? " is-collapsed" : ""}`}>
            <div className="hg-side-brand"><Logo size={44} onClick={() => router.push("/")} /></div>
            <nav className="hg-side-nav">
              {nav.map(([key, lbl, ic]) => (
                <button
                  key={key}
                  className={`hg-side-link${active === key ? " is-active" : ""}`}
                  onClick={() => setSection(key)}
                >
                  <Icon name={ic} size={18} /> <span>{lbl}</span>
                  {key === "payouts" && pendingPayouts > 0 && <span className="hg-side-badge">{pendingPayouts}</span>}
                </button>
              ))}
            </nav>
            <div className="hg-side-foot">
              <button className="hg-side-link" onClick={() => router.push("/")}>
                <Icon name="arrowL" size={18} /> <span>Exit to site</span>
              </button>
              <button className="hg-side-link" onClick={logout}>
                <Icon name="lock" size={18} /> <span>Log out</span>
              </button>
              <div className="hg-side-mod">Powered by MOD</div>
            </div>
          </aside>

          <div className="hg-dash-main">
            <header className={`hg-statusbar${showFinanceBar ? " is-finance" : ""}`}>
              <button className="hg-side-toggle" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
                <Icon name="menu" size={18} />
              </button>
              {showFinanceBar ? (
                <div className="hg-fin-hud">
                  <div className="hg-fin-stat"><span>Platform Liability</span><b>{money(hud.total_liability)}</b></div>
                  <div className="hg-fin-stat"><span>Daily Gross</span><b>{money(hud.daily_gross_processed)}</b></div>
                  <div className={`hg-fin-stat${hud.pending_count > 0 ? " is-alert" : ""}`}>
                    <span>Pending Recharges</span><b>{hud.pending_count}</b>
                  </div>
                </div>
              ) : (
                <div className="hg-status-title">{(nav.find((n) => n[0] === active) ?? nav[0])[1]}</div>
              )}
              <div className="hg-status-right">
                <span className="hg-status-role">{user.full_name} · {roleLabel}</span>
                <Avatar src={roleAvatar(user)} name={user.full_name} size={28} />
              </div>
            </header>

            <main className="hg-dash-content">{renderSection()}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
