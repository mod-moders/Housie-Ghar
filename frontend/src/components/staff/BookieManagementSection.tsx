"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Button, EmptyHint } from "@/components/ui";
import type { AuthUser } from "@/lib/stores/authStore";
import Image from "next/image";

interface BookieStats {
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  upi_id: string;
  town: string;
  status: string;
  current_balance: number;
  receive_overflow: boolean;
  temp_password_required: boolean;
  confirmed_bookings: number;
  cancelled_bookings: number;
  credit_transactions_count: number;
  credit_transactions_amount: number;
}

interface BookieApplication {
  application_id: string;
  full_name: string;
  nationality: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  occupation: string;
  status: string;
  created_at: string;
}

export function BookieManagementSection({ me, goSection }: { me: AuthUser; goSection?: (section: string) => void }) {
  const [activeTab, setActiveTab] = useState<"registered" | "created" | "applications">("registered");
  const [bookies, setBookies] = useState<BookieStats[]>([]);
  const [apps, setApps] = useState<BookieApplication[]>([]);
  const [selectedApp, setSelectedApp] = useState<BookieApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commission, setCommission] = useState("10");
  const [savingComm, setSavingComm] = useState(false);
  const [commMessage, setCommMessage] = useState("");

  const loadCommission = useCallback(async () => {
    if (me.role_name !== "Superadmin") return;
    try {
      const items = await apiFetch<Array<{ config_key: string; config_value: string }>>("/api/config");
      const item = items.find((i) => i.config_key === "bookie_commission_per_ticket");
      if (item) setCommission(item.config_value);
    } catch (e) {
      console.error("Failed to load commission configuration:", e);
    }
  }, [me.role_name]);

  useEffect(() => {
    loadCommission();
  }, [loadCommission]);

  const handleSaveCommission = async () => {
    setSavingComm(true);
    setCommMessage("");
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        body: JSON.stringify({ bookie_commission_per_ticket: commission }),
      });
      setCommMessage("Commission updated successfully!");
      setTimeout(() => setCommMessage(""), 3000);
    } catch (e: any) {
      setCommMessage(e.message || "Failed to update commission.");
    }
    setSavingComm(false);
  };

  const canModifyStatus = me.role_name === "Superadmin" || me.role_name === "Financial Admin";

  const loadBookies = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<BookieStats[]>("/api/users/bookies-stats");
      setBookies(data);
    } catch (e: any) {
      setError(e.message || "Failed to load bookies stats");
    }
  }, []);

  const loadApps = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<BookieApplication[]>("/api/users/bookie-applications");
      setApps(data);
    } catch (e: any) {
      setError(e.message || "Failed to load applications");
    }
  }, []);

  useEffect(() => {
    if (activeTab === "registered" || activeTab === "created") loadBookies();
    else loadApps();
  }, [activeTab, loadBookies, loadApps]);

  const toggleReceiveBookings = async (b: BookieStats) => {
    setBusy(true);
    try {
      await apiFetch(`/api/users/bookie/${b.user_id}/receive-bookings`, {
        method: "PATCH",
        body: JSON.stringify({ receive_overflow: !b.receive_overflow }),
      });
      loadBookies();
    } catch {} finally {
      setBusy(false);
    }
  };

  const setBookieStatus = async (b: BookieStats, newStatus: "Active" | "Suspended") => {
    setBusy(true);
    try {
      await apiFetch(`/api/users/${b.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      loadBookies();
    } catch (e: any) {
      setError(e.message || "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const deleteBookie = async (b: BookieStats) => {
    if (!window.confirm(`Delete Bookie ${b.full_name}? This action is permanent and cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/users/${b.user_id}`, { method: "DELETE" });
      loadBookies();
    } catch (e: any) {
      setError(e.message || "Failed to delete bookie");
    } finally {
      setBusy(false);
    }
  };

  const updateAppStatus = async (appId: string, status: "Approved" | "Rejected") => {
    setBusy(true);
    try {
      await apiFetch(`/api/users/bookie-applications/${appId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      loadApps();
      const app = apps.find((a) => a.application_id === appId) || selectedApp;
      if (selectedApp?.application_id === appId) {
        setSelectedApp((prev) => prev ? { ...prev, status } : null);
      }

      if (status === "Approved" && app) {
        const nextPassNum = 5 + bookies.length;
        const nextPassStr = `Enterhg@${nextPassNum < 10 ? "0" + nextPassNum : nextPassNum}`;
        const rawName = app.full_name.toLowerCase().trim();
        const username = rawName.replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");

        sessionStorage.setItem("hg_prefill_staff", JSON.stringify({
          full_name: app.full_name,
          username,
          email: app.email,
          phone: app.phone,
          town: app.nationality || "",
          password: nextPassStr
        }));

        if (goSection) {
          goSection("staff");
        }
      }
    } catch {} finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // KPIs
  const totalBookies = bookies.length;
  const activeBookies = bookies.filter((b) => b.status === "Active").length;
  const totalWalletSum = bookies.reduce((sum, b) => sum + b.current_balance, 0);

  const pendingAppsCount = apps.filter((a) => a.status === "Pending").length;

  return (
    <div className="hg-sec">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-application-document, #printable-application-document * {
            visibility: visible !important;
          }
          #printable-application-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 40px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {me.role_name === "Superadmin" && (
        <div className="hg-card" style={{ padding: "20px", marginBottom: "28px", border: "1.5px solid var(--accent)", background: "rgba(212, 175, 55, 0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Icon name="star" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Bookie Commission Settings</h3>
          </div>
          <p className="hg-dim" style={{ fontSize: "12.5px", margin: "0 0 16px 0", lineHeight: "1.4" }}>
            Set the default commission in Indian Rupees (₹) per ₹100 of recharge for bookies. When bookies request wallet recharges, their payable amounts will be discounted based on this commission rate (e.g., ₹10 discount per ₹100 of recharge).
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", fontWeight: 600, fontSize: "14px" }}>₹</span>
              <input
                type="number"
                min="0"
                step="0.5"
                className="hg-input"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                style={{ paddingLeft: "26px", width: "120px", height: "38px" }}
              />
            </div>
            <span style={{ color: "var(--text-dim)", fontSize: "13px", fontWeight: 600 }}>per ₹100 of recharge</span>
            <Button
              variant="cta"
              size="sm"
              disabled={savingComm || !commission || parseFloat(commission) < 0}
              onClick={handleSaveCommission}
            >
              {savingComm ? "Saving..." : "Save Commission"}
            </Button>
            {commMessage && (
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "13px" }}>{commMessage}</span>
            )}
          </div>
        </div>
      )}

      {/* Premium Pill Tabs Segmented Control */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
        <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "30px", padding: "4px", gap: "4px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          <button
            onClick={() => setActiveTab("registered")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "26px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.25s ease",
              border: "none",
              color: activeTab === "registered" ? "#121214" : "var(--text-dim)",
              background: activeTab === "registered" ? "var(--accent)" : "transparent",
              boxShadow: activeTab === "registered" ? "0 4px 12px rgba(212, 175, 55, 0.25)" : "none"
            }}
          >
            <Icon name="users" size={15} /> Registered Bookies ({bookies.filter(b => !b.temp_password_required).length})
          </button>

          <button
            onClick={() => setActiveTab("created")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "26px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.25s ease",
              border: "none",
              color: activeTab === "created" ? "#121214" : "var(--text-dim)",
              background: activeTab === "created" ? "var(--accent)" : "transparent",
              boxShadow: activeTab === "created" ? "0 4px 12px rgba(212, 175, 55, 0.25)" : "none"
            }}
          >
            <Icon name="clock" size={15} /> Created Bookies ({bookies.filter(b => b.temp_password_required).length})
          </button>
          
          <button
            onClick={() => setActiveTab("applications")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "26px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.25s ease",
              border: "none",
              color: activeTab === "applications" ? "#121214" : "var(--text-dim)",
              background: activeTab === "applications" ? "var(--accent)" : "transparent",
              boxShadow: activeTab === "applications" ? "0 4px 12px rgba(212, 175, 55, 0.25)" : "none"
            }}
          >
            <Icon name="edit" size={15} /> Bookie Applications ({apps.length})
            {pendingAppsCount > 0 && (
              <span style={{ 
                background: activeTab === "applications" ? "#121214" : "var(--accent)", 
                color: activeTab === "applications" ? "var(--accent)" : "#121214", 
                fontSize: "10px", 
                fontWeight: "bold", 
                padding: "2px 6px", 
                borderRadius: "10px", 
                marginLeft: "6px" 
              }}>
                {pendingAppsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {error && <p className="hg-sec-err" style={{ marginBottom: "16px" }}>{error}</p>}

      {activeTab === "registered" || activeTab === "created" ? (
        <>
          {/* KPIs */}
          <div className="hg-sec-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div className="hg-kpi">
              <span className="hg-kpi-label">
                {activeTab === "registered" ? "Total Bookies" : "Pending Onboarding"}
              </span>
              <b className="hg-kpi-value">
                {activeTab === "registered" ? bookies.filter((b) => !b.temp_password_required).length : bookies.filter((b) => b.temp_password_required).length}
              </b>
              <span className="hg-kpi-sub">
                {activeTab === "registered" 
                  ? `${bookies.filter((b) => !b.temp_password_required && b.status === "Active").length} Active Bookies`
                  : "Created but setup incomplete"}
              </span>
            </div>
            <div className="hg-kpi">
              <span className="hg-kpi-label">Cumulative Balance</span>
              <b className="hg-kpi-value">
                {money(
                  bookies
                    .filter((b) => activeTab === "registered" ? !b.temp_password_required : b.temp_password_required)
                    .reduce((sum, b) => sum + b.current_balance, 0)
                )}
              </b>
              <span className="hg-kpi-sub">Total capital held by Bookies</span>
            </div>
          </div>

          {/* Bookies List Table */}
          <div className="hg-panel">
            <div className="hg-panel-head">
              <h3>{activeTab === "registered" ? "Registered Bookies" : "Created Bookies (Pending Onboarding)"}</h3>
            </div>
            {bookies.filter((b) => activeTab === "registered" ? !b.temp_password_required : b.temp_password_required).length === 0 ? (
              <EmptyHint 
                icon={activeTab === "registered" ? "users" : "clock"} 
                title={activeTab === "registered" ? "No bookies registered" : "No created bookies"} 
                sub={activeTab === "registered" ? "Create a staff profile with the Bookie role to start." : "Bookies who haven't completed first-time onboarding setup appear here."} 
              />
            ) : (
              <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
                <div className="hg-table" style={{ minWidth: "900px" }}>
                  <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.8fr 1.3fr 1.2fr 1.2fr 1fr 1.5fr" }}>
                    <span>Name / Town</span>
                    <span>Contact Info</span>
                    <span>Wallet Info</span>
                    <span>Sales Stats</span>
                    <span style={{ textAlign: "center" }}>Receive Bookings</span>
                    <span style={{ textAlign: "right" }}>Actions</span>
                  </div>
                  {bookies
                    .filter((b) => activeTab === "registered" ? !b.temp_password_required : b.temp_password_required)
                    .map((b) => (
                      <div key={b.user_id} className="hg-tr" style={{ gridTemplateColumns: "1.8fr 1.3fr 1.2fr 1.2fr 1fr 1.5fr" }}>
                        <div>
                          <b style={{ color: "var(--text)" }}>{b.full_name}</b>
                          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{b.town || "Pending Setup"}</div>
                        </div>
                        <div>
                          <div style={{ color: "var(--text)" }}>{b.phone || "Pending Setup"}</div>
                          <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{b.email || "Pending Setup"}</div>
                        </div>
                        <div>
                          <b style={{ color: b.current_balance < 500 ? "var(--danger)" : "var(--accent)" }}>
                            {money(b.current_balance)}
                          </b>
                          <div className="hg-dim" style={{ fontSize: "10px", marginTop: "2px" }}>
                            Recharged {b.credit_transactions_count} times
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px" }}>
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>{b.confirmed_bookings} Sold</span>
                            <span style={{ color: "var(--text-mute)", margin: "0 4px" }}>·</span>
                            <span style={{ color: "var(--danger)" }}>{b.cancelled_bookings} Rej</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                          {b.receive_overflow ? (
                            <div 
                              onClick={() => canModifyStatus && !busy && toggleReceiveBookings(b)}
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "4px",
                                border: "2px solid var(--accent)",
                                background: "rgba(212, 175, 55, 0.15)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: canModifyStatus ? "pointer" : "default",
                                opacity: busy ? 0.6 : 1,
                                color: "var(--accent)"
                              }}
                              title="Available - Toggled on"
                            >
                              <Icon name="check" size={14} />
                            </div>
                          ) : (
                            <div 
                              onClick={() => canModifyStatus && !busy && toggleReceiveBookings(b)}
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "4px",
                                border: "2px solid var(--border-2)",
                                background: "transparent",
                                cursor: canModifyStatus ? "pointer" : "default",
                                opacity: busy ? 0.6 : 1
                              }}
                              title="Unavailable - Toggled off"
                            />
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                          {canModifyStatus ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                              {b.status === "Active" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => setBookieStatus(b, "Suspended")}
                                >
                                  <Icon name="pause" size={12} /> Suspend
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="cta"
                                  disabled={busy}
                                  onClick={() => setBookieStatus(b, "Active")}
                                  style={{ background: "#10B981", borderColor: "#10B981", color: "white" }}
                                >
                                  <Icon name="check" size={12} /> Activate
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => deleteBookie(b)}
                                style={{ color: "var(--danger)" }}
                              >
                                <Icon name="trash" size={12} /> Delete
                              </Button>
                            </div>
                          ) : (
                            <span className="hg-dim" style={{ fontSize: "11px" }}>Locked</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Applications List */}
          <div className="hg-panel">
            <div className="hg-panel-head">
              <h3>Applications for Bookie Position</h3>
            </div>
            {apps.length === 0 ? (
              <EmptyHint icon="edit" title="No applications yet" sub="When a user applies from the login/signup page, their details will display here." />
            ) : (
              <div className="hg-table-scroll" style={{ overflowX: "auto" }}>
                <div className="hg-table" style={{ minWidth: "900px" }}>
                  <div className="hg-tr hg-tr-head" style={{ gridTemplateColumns: "1.8fr 1.5fr 1fr 1fr 1fr 1.8fr" }}>
                    <span>Name / Country</span>
                    <span>Contact Details</span>
                    <span>Occupation</span>
                    <span>Submission Date</span>
                    <span>Status</span>
                    <span style={{ textAlign: "right" }}>Actions</span>
                  </div>
                  {apps.map((a) => (
                    <div key={a.application_id} className="hg-tr" style={{ gridTemplateColumns: "1.8fr 1.5fr 1fr 1fr 1fr 1.8fr" }}>
                      <div>
                        <b style={{ color: "var(--text)" }}>{a.full_name}</b>
                        <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{a.nationality} · {a.gender}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--text)" }}>WhatsApp: {a.phone}</div>
                        <div className="hg-dim" style={{ fontSize: "11px", marginTop: "2px" }}>{a.email}</div>
                      </div>
                      <div>
                        <span style={{ color: "var(--text)" }}>{a.occupation}</span>
                      </div>
                      <div>
                        <span className="hg-dim">{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: a.status === "Approved" ? "rgba(16, 185, 129, 0.15)" : a.status === "Rejected" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: a.status === "Approved" ? "#10B981" : a.status === "Rejected" ? "#EF4444" : "#F59E0B"
                        }}>
                          {a.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                        <Button size="sm" variant="cta" onClick={() => setSelectedApp(a)}>
                          <Icon name="eye" size={13} /> View Form
                        </Button>
                        {a.status === "Pending" && canModifyStatus && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => updateAppStatus(a.application_id, "Approved")}
                              style={{ color: "#10B981", border: "1px solid rgba(16, 185, 129, 0.2)" }}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => updateAppStatus(a.application_id, "Rejected")}
                              style={{ color: "#EF4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Classic Paper Style PDF Modal */}
      {selectedApp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(6px)", padding: "40px 20px", overflowY: "auto" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: "800px", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Modal Actions Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px 20px", borderRadius: "var(--radius)" }} className="no-print">
              <span style={{ fontWeight: 600, fontSize: "14px" }}>Bookie Application Profile</span>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button size="sm" variant="cta" icon="download" onClick={handlePrint}>
                  Download PDF (A4)
                </Button>
                {selectedApp.status === "Pending" && (
                  <>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      icon="check" 
                      style={{ color: "#10B981", border: "1.5px solid rgba(16, 185, 129, 0.4)", background: "rgba(16, 185, 129, 0.05)" }} 
                      onClick={() => updateAppStatus(selectedApp.application_id, "Approved")}
                    >
                      Accept
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      icon="x" 
                      style={{ color: "#EF4444", border: "1.5px solid rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.05)" }} 
                      onClick={() => updateAppStatus(selectedApp.application_id, "Rejected")}
                    >
                      Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" icon="x" onClick={() => setSelectedApp(null)}>
                  Close
                </Button>
              </div>
            </div>

            {/* A4 Paper Document Content */}
            <div 
              id="printable-application-document"
              style={{
                background: "#ffffff",
                color: "#111827",
                padding: "60px 50px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                border: "4px double #b59410",
                fontFamily: "Georgia, serif",
                fontSize: "14px",
                lineHeight: "1.6",
                minHeight: "1000px",
                position: "relative"
              }}
            >
              {/* Top Watermark or Header Lines */}
              <div style={{ borderBottom: "2px solid #b59410", paddingBottom: "20px", marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <Image 
                    src="/HG Primary.png" 
                    alt="Housie Ghar Primary Logo" 
                    width={72} 
                    height={72} 
                    style={{ objectFit: "contain" }}
                  />
                  <div>
                    <h1 style={{ margin: 0, fontSize: "28px", fontWeight: "bold", letterSpacing: "1px", color: "#1f2937", textTransform: "uppercase" }}>
                      Housie Ghar
                    </h1>
                    <span style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "#6b7280", display: "block", marginTop: "2px" }}>
                      Official Bookie Franchise Network
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ border: "2px solid #10B981", color: "#10B981", padding: "4px 10px", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", borderRadius: "4px", display: "inline-block", marginBottom: "8px" }}>
                    {selectedApp.status}
                  </span>
                  <div style={{ fontSize: "11px", color: "#4b5563" }}>
                    No: <b>#{selectedApp.application_id.substring(0, 8).toUpperCase()}</b>
                  </div>
                </div>
              </div>

              {/* Title Section */}
              <div style={{ textAlign: "center", marginBottom: "40px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: "bold", borderBottom: "1px solid #e5e7eb", display: "inline-block", paddingBottom: "6px", textTransform: "uppercase", color: "#1f2937" }}>
                  Franchise Bookie Application Profile
                </h2>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "6px" }}>
                  Submitted on: {new Date(selectedApp.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "numeric" })}
                </div>
              </div>

              {/* Grid Fields Block */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Block 1: Personal Profile */}
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: "bold", borderBottom: "1.5px solid #b59410", paddingBottom: "4px", marginBottom: "14px", textTransform: "uppercase", color: "#b59410" }}>
                    I. Personal Profile Details
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ width: "30%", padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Full Name:</td>
                        <td style={{ padding: "8px 0", color: "#111827", fontSize: "15px" }}>{selectedApp.full_name}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Nationality:</td>
                        <td style={{ padding: "8px 0", color: "#111827" }}>{selectedApp.nationality}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Date of Birth:</td>
                        <td style={{ padding: "8px 0", color: "#111827" }}>
                          {new Date(selectedApp.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Gender:</td>
                        <td style={{ padding: "8px 0", color: "#111827" }}>{selectedApp.gender}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Block 2: Professional & Contact Details */}
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: "bold", borderBottom: "1.5px solid #b59410", paddingBottom: "4px", marginBottom: "14px", textTransform: "uppercase", color: "#b59410" }}>
                    II. Professional & Contact Specifications
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ width: "30%", padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>WhatsApp Number:</td>
                        <td style={{ padding: "8px 0", color: "#111827", fontWeight: "bold" }}>{selectedApp.phone}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Email Address:</td>
                        <td style={{ padding: "8px 0", color: "#111827" }}>{selectedApp.email}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 0", fontWeight: "bold", color: "#4b5563" }}>Current Occupation:</td>
                        <td style={{ padding: "8px 0", color: "#111827" }}>{selectedApp.occupation}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Block 3: Declaration */}
                <div style={{ marginTop: "20px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: "bold", borderBottom: "1.5px solid #b59410", paddingBottom: "4px", marginBottom: "14px", textTransform: "uppercase", color: "#b59410" }}>
                    III. Declarations & Agreements
                  </h3>
                  <p style={{ fontSize: "12px", color: "#374151", textAlign: "justify", textIndent: "24px", margin: 0 }}>
                    I hereby declare that all details provided in this registration application form are true, accurate, and complete to the best of my knowledge and belief. I agree to operate within the guidelines specified by the Housie Ghar administration, to maintain the required wholesale inventory liquidity, and to systematically execute player booking verifications. I understand that any fraudulent transaction confirmation or delay of sales will result in immediate franchise suspension and permanent deletion of my account.
                  </p>
                </div>

              </div>

              {/* Signature Blocks */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "100px", padding: "0 20px" }}>
                <div style={{ textAlign: "center", width: "40%" }}>
                  <div style={{ borderBottom: "1px solid #9ca3af", marginBottom: "8px" }} />
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4b5563", textTransform: "uppercase" }}>
                    Signature of Applicant
                  </span>
                </div>
                <div style={{ textAlign: "center", width: "40%" }}>
                  <div style={{ borderBottom: "1px solid #9ca3af", marginBottom: "8px" }} />
                  <span style={{ fontSize: "12px", fontWeight: "bold", color: "#4b5563", textTransform: "uppercase" }}>
                    Authorized Official / Stamp
                  </span>
                </div>
              </div>

              {/* Official Seal Watermark */}
              <div style={{ position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)", fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px" }}>
                Housie Ghar Official Franchise Document
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
