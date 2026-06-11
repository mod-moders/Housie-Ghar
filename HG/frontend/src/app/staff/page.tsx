"use client";
/** Unified staff dashboard — role-driven sidebar sections, single shell. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/ui";
import {
  OverviewSection, GamesSection, FillingSection, WorkforceSection, AuditSection,
} from "@/components/staff/AdminSections";
import { FinanceHubSection, MasterLedgerSection } from "@/components/staff/FinanceSections";
import { OperatorHudSection, OverflowSection } from "@/components/staff/OperatorSections";
import { BookieQueueSection, BookieWalletSection } from "@/components/staff/BookieSections";
import type { FinancialHud } from "@/lib/types";

type NavItem = [key: string, label: string, icon: string];

function navFor(user: AuthUser): NavItem[] {
  const isFo = user.role_name === "Superadmin" || (user.role_name === "Admin" && user.is_cfo === true);
  if (user.role_id <= 2) {
    const items: NavItem[] = [["overview", "Dashboard", "chart"]];
    if (isFo) items.push(["finance", "Finance Hub", "wallet"], ["ledger", "Bookie Ledger", "chart"]);
    items.push(
      ["games", "Games", "grid"],
      ["filling", "Filling Status", "ticket"],
      ["staff", "Workforce", "users"],
      ["audit", "Audit Log", "shield"],
    );
    return items;
  }
  if (user.role_name === "Operator") {
    return [["hud", "Live HUD", "play"], ["overflow", "Overflow Queue", "bell"], ["filling", "Filling Status", "ticket"]];
  }
  return [["queue", "Booking Queue", "bell"], ["wallet", "My Wallet", "wallet"], ["filling", "Filling Status", "ticket"]];
}

export default function StaffDashboard() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [section, setSection] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hud, setHud] = useState<FinancialHud | null>(null);
  const [checked, setChecked] = useState(false);

  // Authoritative profile (also restores the session after a reload)
  useEffect(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((res) => { setUser(res.user); setChecked(true); })
      .catch(() => router.replace("/staff/login"));
  }, [setUser, router]);

  const nav = useMemo(() => (user ? navFor(user) : []), [user]);
  const isFo = !!user && (user.role_name === "Superadmin" || (user.role_name === "Admin" && user.is_cfo === true));
  const active = section ?? nav[0]?.[0] ?? null;

  const loadHud = useCallback(() => {
    apiFetch<FinancialHud>("/api/wallet/hud").then(setHud).catch(() => {});
  }, []);

  useEffect(() => {
    if (checked && isFo) loadHud();
  }, [checked, isFo, loadHud]);

  const logout = async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch { /* cookie may already be gone */ }
    setUser(null);
    router.replace("/staff/login");
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

  const roleLabel = user.role_name === "Agent" ? "Bookie" : user.is_cfo ? "Financial Officer" : user.role_name;
  const showFinanceBar = isFo && hud && (active === "finance" || active === "ledger" || active === "overview");

  const renderSection = () => {
    switch (active) {
      case "overview": return <OverviewSection goSection={setSection} />;
      case "finance": return <FinanceHubSection onResolved={loadHud} />;
      case "ledger": return <MasterLedgerSection />;
      case "games": return <GamesSection />;
      case "filling": return <FillingSection />;
      case "staff": return <WorkforceSection me={user} />;
      case "audit": return <AuditSection />;
      case "hud": return <OperatorHudSection />;
      case "overflow": return <OverflowSection />;
      case "queue": return <BookieQueueSection me={user} />;
      case "wallet": return <BookieWalletSection me={user} />;
      default: return null;
    }
  };

  return (
    <div className="hg-stage hg-stage-wide">
      <div className="hg-frame hg-frame-wide">
        <div className="hg-dash">
          <aside className={`hg-side${collapsed ? " is-collapsed" : ""}`}>
            <div className="hg-side-brand"><Logo size={18} onClick={() => router.push("/")} /></div>
            <nav className="hg-side-nav">
              {nav.map(([key, lbl, ic]) => (
                <button
                  key={key}
                  className={`hg-side-link${active === key ? " is-active" : ""}`}
                  onClick={() => setSection(key)}
                >
                  <Icon name={ic} size={18} /> <span>{lbl}</span>
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
                <span className="hg-avatar-sm">{user.full_name[0]}</span>
              </div>
            </header>

            <main className="hg-dash-content">{renderSection()}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
