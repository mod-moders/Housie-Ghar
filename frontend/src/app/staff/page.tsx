"use client";
/** Unified staff dashboard — role-driven sidebar sections, single shell. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { money } from "@/lib/money";
import { useAuthStore, AuthUser } from "@/lib/stores/authStore";
import { Icon } from "@/components/Icon";
import { Logo, Avatar } from "@/components/ui";
import { roleAvatar } from "@/lib/roleAvatar";
import { useSocket } from "@/lib/hooks/useSocket";
import { usePullToRefresh } from "@/components/usePullToRefresh";
import {
  OverviewSection, GamesSection, HistorySection, FillingSection, WorkforceSection, AuditSection,
} from "@/components/staff/AdminSections";
import { SettingsSection } from "@/components/staff/SettingsSection";
import { PlayersSection } from "@/components/staff/PlayersSection";
import { FinanceHubSection, RechargeHubSection } from "@/components/staff/FinanceSections";
import { OperatorHudSection, OverflowSection, ShareGamesSection } from "@/components/staff/OperatorSections";
import { BookieQueueSection, BookieWalletSection } from "@/components/staff/BookieSections";
import { ProfileSection } from "@/components/staff/ProfileSection";
import { FirstTimeSetup } from "@/components/staff/FirstTimeSetup";
import { BookieManagementSection } from "@/components/staff/BookieManagementSection";
import { BookieLiveHudSection } from "@/components/staff/BookieLiveHudSection";
import { CallVoiceSettings } from "@/components/staff/CallVoiceSettings";
import { OperatorStatsSection, BookieStatsSection } from "@/components/staff/MyStatsSections";
import type { FinancialHud } from "@/lib/types";

type NavItem = [key: string, label: string, icon: string];

function navFor(user: AuthUser): NavItem[] {
  if (user.role_name === "Superadmin") {
    return [
      ["hud", "Live HUD & Games", "play"],
      ["broadcast", "Share to WhatsApp", "chat"],
      ["finance", "Finance Hub", "wallet"],
      ["overflow", "Overflow Queue", "bell"],
      ["staff", "Staff Management", "shieldCheck"],
      ["bookies", "Bookie Management", "users"],
      ["players", "Player Management", "star"],
      ["settings", "Website Settings", "edit"],
      ["audio", "Audio Settings", "volume"],
      ["audit", "Website Audits", "shield"],
      ["profile", "My Profile", "user"],
    ];
  }

  if (user.role_name === "Financial Admin") {
    return [
      ["hud", "Live HUD & Games", "play"],
      ["broadcast", "Share to WhatsApp", "chat"],
      ["finance", "Finance Hub", "wallet"],
      ["recharge", "Requests", "rupee"],
      ["overflow", "Overflow Queue", "bell"],
      ["staff", "Staff Management", "shieldCheck"],
      ["bookies", "Bookie Management", "users"],
      ["audit", "Website Audits", "shield"],
      ["profile", "My Profile", "user"],
    ];
  }

  if (user.role_name === "Operator") {
    return [
      ["hud", "Live HUD & Games", "play"],
      ["broadcast", "Share to WhatsApp", "chat"],
      ["overflow", "Overflow Queue", "bell"],
      ["stats", "My Stats", "chart"],
      ["profile", "My Profile", "user"],
    ];
  }

  if (user.role_name === "Bookie") {
    return [
      ["live-hud", "Live HUD & Games", "play"],
      ["bookings", "Bookings", "bell"],
      ["wallet", "My Wallet", "wallet"],
      ["stats", "My Stats", "chart"],
      ["profile", "My Profile", "user"],
    ];
  }

  return [];
}

function LiveHudAndGamesSection({ me }: { me: AuthUser }) {
  const [activeTab, setActiveTab] = useState<"live" | "manage">("live");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }} className="no-print">
        <button
          onClick={() => setActiveTab("live")}
          style={{
            background: activeTab === "live" ? "var(--brand)" : "rgba(255,255,255,0.03)",
            color: activeTab === "live" ? "var(--accent-ink)" : "var(--text)",
            border: activeTab === "live" ? "1px solid var(--brand)" : "1px solid rgba(255,255,255,0.08)",
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "13px",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <Icon name="play" size={14} />
          Live HUD
        </button>
        <button
          onClick={() => setActiveTab("manage")}
          style={{
            background: activeTab === "manage" ? "var(--brand)" : "rgba(255,255,255,0.03)",
            color: activeTab === "manage" ? "var(--accent-ink)" : "var(--text)",
            border: activeTab === "manage" ? "1px solid var(--brand)" : "1px solid rgba(255,255,255,0.08)",
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "13px",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <Icon name="grid" size={14} />
          Manage Games
        </button>
      </div>

      <div>
        {activeTab === "live" ? <OperatorHudSection /> : <GamesSection me={me} />}
      </div>
    </div>
  );
}

export default function StaffDashboard() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [section, setSection] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hg_staff_section") || null;
    }
    return null;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [hud, setHud] = useState<FinancialHud | null>(null);
  const [checked, setChecked] = useState(false);
  const { ref: dashContentRef, indicatorStyle, contentStyle } = usePullToRefresh();

  const setSectionAndPersist = (newSec: string | null) => {
    setSection(newSec);
    if (typeof window !== "undefined") {
      if (newSec) {
        localStorage.setItem("hg_staff_section", newSec);
      } else {
        localStorage.removeItem("hg_staff_section");
      }
    }
  };

  // Authoritative profile (also restores the session after a reload). Only a
  // genuine 401/403 from the server means the session is actually invalid —
  // a network blip, cold start, or mid-deploy connection gap throws with no
  // status and must NOT be treated as "logged out", or every staff member
  // gets bounced to the login screen (and their token wiped) on every such
  // hiccup, which is exactly the "signed out repeatedly" bug this fixes.
  useEffect(() => {
    let cancelled = false;
    const checkAuth = () => {
      apiFetch<{ user: AuthUser }>("/api/auth/me")
        .then((res) => {
          if (cancelled) return;
          setUser(res.user);
          setChecked(true);
        })
        .catch((e) => {
          if (cancelled) return;
          if (!isAuthError(e)) {
            setTimeout(() => { if (!cancelled) checkAuth(); }, 3000);
            return;
          }
          if (typeof window !== "undefined") {
            // If we HELD a token and the server still rejected it, the bounce is
            // anomalous (expired session, or a server-side JWT key problem where
            // login signs tokens that verification then refuses). Carry the reason
            // to the login page instead of bouncing back silently — a silent loop
            // here is indistinguishable from "the login button did nothing".
            const hadToken = !!sessionStorage.getItem("hg_staff_token");
            sessionStorage.removeItem("hg_staff_token");
            // Clear the first-party middleware cookie too, so a rejected session
            // can't keep /staff "unlocked" (cookie present) while the real bearer
            // check keeps failing — that would be a silent bounce loop.
            document.cookie = "hg_auth_token=; path=/; max-age=0; SameSite=Lax; Secure";
            if (hadToken) {
              sessionStorage.setItem(
                "hg_staff_login_notice",
                e instanceof Error && e.message ? e.message : "Your session could not be verified."
              );
            }
          }
          router.replace("/staff/login");
        });
    };
    checkAuth();
    return () => { cancelled = true; };
  }, [setUser, router]);

  // Set page tab title dynamically according to staff role
  useEffect(() => {
    if (!user) return;
    if (user.role_name === "Superadmin") {
      document.title = "HG-Superadmin";
    } else if (user.role_name === "Financial Admin") {
      document.title = "HG-FinancialAdmin";
    } else if (user.role_name === "Operator") {
      document.title = "HG-Operator";
    } else if (user.role_name === "Bookie") {
      document.title = "HG-Bookie";
    }
  }, [user]);

  const nav = useMemo(() => (user ? navFor(user) : []), [user]);
  const isFo = !!user && (user.role_name === "Superadmin" || user.role_name === "Financial Admin");
  const active = section && nav.some((n) => n[0] === section) ? section : (nav[0]?.[0] ?? null);

  const loadHud = useCallback(() => {
    apiFetch<FinancialHud>("/api/wallet/hud").then(setHud).catch(() => {});
  }, []);

  useEffect(() => {
    if (checked && isFo) loadHud();
  }, [checked, isFo, loadHud]);

  useSocket((event) => {
    if (isFo && (event === "topup_request_received" || event === "wallet_credited" || event === "wallet_debited" || event === "wallet_adjusted")) {
      loadHud();
    }
  });

  const logout = async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch { /* cookie may already be gone */ }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("hg_staff_token");
      localStorage.removeItem("hg_staff_section");
      document.cookie = "hg_auth_token=; path=/; max-age=0; SameSite=Lax; Secure";
    }
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

  if (user.temp_password_required) {
    return <FirstTimeSetup user={user} onCompleted={(u) => setUser(u)} onLogout={logout} />;
  }

  const roleLabel = user.role_name;
  const showFinanceBar = isFo && hud && (active === "finance" || active === "overview");

  const renderSection = () => {
    switch (active) {
      case "overview": return <OverviewSection goSection={setSectionAndPersist} />;
      case "finance": return <FinanceHubSection me={user} onResolved={loadHud} />;
      case "recharge": return <RechargeHubSection me={user} onResolved={loadHud} />;
      case "games": return <GamesSection me={user} />;
      case "history": return <HistorySection />;
      case "players": return <PlayersSection />;
      case "filling": return <FillingSection />;
      case "staff": return <WorkforceSection me={user} />;
      case "audit": return <AuditSection />;
      case "bookies": return <BookieManagementSection me={user} goSection={setSectionAndPersist} />;
      case "settings": return <SettingsSection />;
      case "audio": return <CallVoiceSettings />;
      case "hud": return <LiveHudAndGamesSection me={user} />;
      case "overflow": return <OverflowSection me={user} />;
      case "broadcast": return <ShareGamesSection />;
      case "queue": return <BookieQueueSection me={user} />;
      case "bookings": return <BookieQueueSection me={user} />;
      case "wallet": return <BookieWalletSection me={user} />;
      case "profile": return <ProfileSection me={user} onUpdated={setUser} />;
      case "live-hud": return <BookieLiveHudSection />;
      case "stats":
        return user.role_name === "Operator" ? (
          <OperatorStatsSection me={user} />
        ) : (
          <BookieStatsSection me={user} />
        );
      default: return null;
    }
  };

  return (
    <div className="hg-stage hg-stage-wide">
      <div className="hg-frame hg-frame-wide">
        <div className="hg-dash">
          {collapsed && <div className="hg-side-backdrop" onClick={() => setCollapsed(false)} />}
          <aside className={`hg-side${collapsed ? " is-collapsed" : ""}`}>
            <div className="hg-side-brand"><Logo size={38} onClick={() => window.location.reload()} /></div>
             <nav className="hg-side-nav" style={{ gap: "4px" }}>
              {nav.map(([key, lbl, ic]) => {
                const isRecharge = key === "recharge";
                const showBadge = isRecharge && user.role_name === "Financial Admin" && hud && hud.pending_topups > 0;
                return (
                  <button
                    key={key}
                    className={`hg-side-link${active === key ? " is-active" : ""}`}
                    onClick={() => setSectionAndPersist(key)}
                    style={{ position: "relative" }}
                  >
                    <Icon name={ic} size={18} />
                    <span>{lbl}</span>
                    {showBadge && (
                      <span
                        className="hg-badge"
                        style={{
                          position: "absolute",
                          right: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "var(--accent)",
                          color: "#121214",
                          fontSize: "10px",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: "10px",
                          lineHeight: "1",
                          boxShadow: "0 0 8px var(--accent-soft)"
                        }}
                      >
                        {hud.pending_topups}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="hg-side-foot">
              <button className="hg-side-link" onClick={() => router.push("/")}>
                <Icon name="arrowL" size={18} /> <span>Exit to site</span>
              </button>
              <button className="hg-side-link" onClick={logout}>
                <Icon name="lock" size={18} /> <span>Log out</span>
              </button>
            </div>
          </aside>

          <div className="hg-dash-main">
            <header className={`hg-statusbar${showFinanceBar ? " is-finance" : ""}`}>
              <button className="hg-side-toggle" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
                <Icon name="menu" size={18} />
              </button>
              {showFinanceBar ? (
                <div className="hg-fin-hud">
                  <div className="hg-fin-stat"><span>Overall Profit</span><b>{money(hud.overall_profit)}</b></div>
                  <div className="hg-fin-stat"><span>Today&apos;s Collection</span><b>{money(hud.today_collection)}</b></div>
                  <div className="hg-fin-stat"><span>Today&apos;s Profit</span><b>{money(hud.today_profit)}</b></div>
                  <div className="hg-fin-stat"><span>Monthly Profit</span><b>{money(hud.monthly_profit)}</b></div>
                </div>
              ) : (
                <div className="hg-status-title">{(nav.find((n) => n[0] === active) ?? nav[0])[1]}</div>
              )}
              <div className="hg-status-right">
                {user.role_name === "Bookie" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "12px", background: "rgba(255,255,255,0.03)", padding: "4px 10px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: user.receive_overflow ? "#10B981" : "#EF4444" }}>
                      {user.receive_overflow ? "Available" : "Skipped"}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          const nextVal = !user.receive_overflow;
                          const res = await apiFetch<{ user: AuthUser }>("/api/auth/me", {
                            method: "PATCH",
                            body: JSON.stringify({ receive_overflow: nextVal })
                          });
                          setUser({ ...user, ...res.user });
                        } catch {}
                      }}
                      style={{
                        position: "relative",
                        width: "36px",
                        height: "20px",
                        borderRadius: "10px",
                        background: user.receive_overflow ? "#10B981" : "#EF4444",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        transition: "background 0.25s ease"
                      }}
                      title={user.receive_overflow ? "Set skipped / unavailable" : "Set active / available"}
                    >
                      <span style={{
                        display: "block",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "white",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        transform: user.receive_overflow ? "translateX(18px)" : "translateX(2px)"
                      }} />
                    </button>
                  </div>
                )}
                <span className="hg-status-role">{user.full_name} · {roleLabel}</span>
                <Avatar src={roleAvatar(user)} name={user.full_name} />
              </div>
            </header>

            <main className="hg-dash-content" ref={dashContentRef} style={{ position: "relative" }}>
              <div className="hg-ptr-indicator" style={indicatorStyle}>↓</div>
              <div style={contentStyle}>{renderSection()}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
