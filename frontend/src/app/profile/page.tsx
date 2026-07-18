"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { PlayerProfile } from "@/lib/types";

interface WinningItem {
  prize_id: number;
  game_id: string;
  game_title: string;
  game_date: string;
  pattern_name: string;
  amount: number;
  winner_ticket_number: string;
  player_claimed: boolean;
  player_claimed_at: string | null;
  disbursed: boolean;
  disbursed_at: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Password states
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Winnings states
  const [winnings, setWinnings] = useState<WinningItem[]>([]);
  const [winningsLoading, setWinningsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const fetchWinnings = () => {
    setWinningsLoading(true);
    apiFetch<WinningItem[]>("/api/player/winnings")
      .then((data) => {
        setWinnings(data);
      })
      .catch((err) => {
        console.error("Failed to load winnings:", err);
      })
      .finally(() => {
        setWinningsLoading(false);
      });
  };

  const initiateClaim = async (gameId: string, prizeId: number) => {
    setClaimingId(prizeId);
    try {
      const response = await apiFetch<{whatsapp_url?: string}>(`/api/games/${gameId}/prizes/${prizeId}/claim`, {
        method: "POST",
      });
      fetchWinnings();
      if (response.whatsapp_url) {
        window.open(response.whatsapp_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to initiate claim");
    } finally {
      setClaimingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadProfile = () => {
      apiFetch<{ player: PlayerProfile }>("/api/player/me")
        .then((res) => {
          if (cancelled) return;
          setProfile(res.player);
          setFullName(res.player.full_name || "");
          setPhone(res.player.phone || "");
          setEmail(res.player.email || "");
          setSoundEnabled(res.player.sound_enabled !== false);
          setHasPassword(!!res.player.has_password);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Failed to load profile", err);
          // Only a real 401/403 means the player isn't actually logged in —
          // a network blip must not bounce them to /login; retry instead.
          if (!isAuthError(err)) { setTimeout(() => { if (!cancelled) loadProfile(); }, 3000); return; }
          router.push("/login"); // redirect to login/signup
        });
    };
    loadProfile();

    // Kick off the winnings fetch on mount (flips a loading flag then resolves
    // async — the effect fetch the set-state-in-effect rule over-flags).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWinnings();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!loading && !winningsLoading && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const claimPrizeId = params.get("claim_prize_id");
      const gameId = params.get("game_id");
      if (claimPrizeId && gameId) {
        // Auto-fire a deep-linked prize claim once, after the page has loaded.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        initiateClaim(gameId, parseInt(claimPrizeId, 10));
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
    // initiateClaim is intentionally excluded: this must run once when loading
    // settles, not each time the (non-memoised) callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, winningsLoading]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updates: {
        full_name: string;
        phone: string | null;
        email: string | null;
        sound_enabled: boolean;
        password?: string;
      } = {
        full_name: fullName,
        phone: phone || null,
        email: email || null,
        sound_enabled: soundEnabled,
      };

      if (removePassword) {
        updates.password = ""; // clear password
      } else if (password) {
        updates.password = password; // set/change password
      }

      const res = await apiFetch<{ player: PlayerProfile }>("/api/player/me", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      
      setProfile(res.player);
      setFullName(res.player.full_name || "");
      setPhone(res.player.phone || "");
      setEmail(res.player.email || "");
      setSoundEnabled(res.player.sound_enabled !== false);
      setHasPassword(!!res.player.has_password);
      setPassword(""); // Clear input
      setRemovePassword(false); // Reset checkbox
      
      alert("Profile updated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/player/logout", { method: "POST" });
      if (typeof window !== "undefined") {
        localStorage.removeItem("hg_player_token");
        sessionStorage.removeItem("hg_player_token");
      }
      router.push("/login");
    } catch {
      if (typeof window !== "undefined") {
        localStorage.removeItem("hg_player_token");
        sessionStorage.removeItem("hg_player_token");
      }
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <PublicShell>
        <div className="hg-screen flex items-center justify-center min-h-[50vh]">
          <span style={{ color: "var(--text-dim)", fontSize: 15, fontWeight: 500 }}>Loading profile…</span>
        </div>
      </PublicShell>
    );
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--surface-2)",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s"
  };

  return (
    <PublicShell>
      <div className="hg-screen hg-screen--profile" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px" }}>
        <div className="hg-content-col">
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 24, background: "var(--surface)", padding: "24px 28px", borderRadius: 12, border: "1px solid var(--border-light)" }}>
            
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid var(--border-light)", paddingBottom: 18 }}>
              <div className="hg-avatar-sm" style={{ width: 48, height: 48, fontSize: 20, borderRadius: "50%", background: "var(--brand)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                {(profile?.full_name || profile?.housie_name || "?")[0].toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text)" }}>{profile?.full_name || profile?.housie_name}</h2>
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Player Account Settings</span>
              </div>
            </div>

            {error && <div className="hg-sec-err" style={{ padding: 12, background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 24 }}>
              
              {/* Left Column: Personal Information */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                  Personal Information
                </h3>
                
                <div>
                  <label style={labelStyle}>Housie Name</label>
                  <input type="text" value={profile?.housie_name || ""} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)", padding: "10px 14px" }} />
                </div>
                
                <div>
                  <label style={labelStyle}>Full Name (Optional)</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={{ ...inputStyle, padding: "10px 14px" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Phone Number (Optional)</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9876543210" style={{ ...inputStyle, padding: "10px 14px" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email Id (Optional)</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={{ ...inputStyle, padding: "10px 14px" }} />
                  </div>
                </div>
              </div>

              {/* Right Column: Security & Preferences */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                
                {/* Security */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                    Security
                  </h3>
                  
                  <div>
                    <label style={labelStyle}>
                      {hasPassword ? "Change Password (Optional)" : "Set Password to Secure Account (Leave Blank if Not Required)"}
                    </label>
                    <div className="hg-password-wrapper">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        disabled={removePassword}
                        onChange={e => setPassword(e.target.value)}
                        placeholder={hasPassword ? "•••••••• (Leave blank to keep current)" : "Enter a password (at least 6 characters)"}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bitwarden-ignore="true"
                        style={{ ...inputStyle, padding: "10px 14px", opacity: removePassword ? 0.5 : 1 }}
                      />
                      <button
                        type="button"
                        className="hg-password-toggle"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowPassword(!showPassword)}
                        title={showPassword ? "Hide Password" : "Show Password"}
                        disabled={removePassword}
                        style={{ opacity: removePassword ? 0.5 : 1 }}
                      >
                        <Icon name={showPassword ? "eye" : "eyeOff"} size={16} />
                      </button>
                    </div>
                  </div>

                  {hasPassword && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                      <input 
                        type="checkbox" 
                        checked={removePassword} 
                        onChange={e => {
                          setRemovePassword(e.target.checked);
                          if (e.target.checked) setPassword("");
                        }} 
                        style={{ width: 16, height: 16, accentColor: "var(--accent)" }} 
                      />
                      <span style={{ fontSize: 13, color: "var(--danger)" }}>Remove password security (revert to passwordless login)</span>
                    </label>
                  )}
                </div>

                {/* Preferences */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                    Preferences
                  </h3>
                  
                  <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none", background: "var(--surface-2)", padding: 12, borderRadius: 10, border: "1px solid var(--border-light)" }}>
                    <input 
                      type="checkbox" 
                      checked={soundEnabled} 
                      onChange={e => setSoundEnabled(e.target.checked)} 
                      style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }} 
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Enable Sound Effects</span>
                      <span style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Play immersive sounds for number calls and wins.</span>
                    </div>
                  </label>
                </div>

              </div>

            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", borderTop: "1px solid var(--border-light)", paddingTop: 18 }}>
              <Button type="submit" variant="cta" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleLogout} style={{ marginLeft: "auto", color: "var(--danger)", borderColor: "var(--danger-soft)" }}>
                Logout
              </Button>
            </div>

          </form>

          {/* My Winnings & Claims Card */}
          <div 
            id="winnings-section"
            style={{ 
              marginTop: 24, 
              background: "var(--surface)", 
              padding: "24px 28px", 
              borderRadius: 12, 
              border: "1px solid var(--border-light)", 
              display: "flex", 
              flexDirection: "column", 
              gap: 16 
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
              <Icon name="award" size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0 }}>
                My Winnings & Claims
              </h3>
            </div>
            
            {winningsLoading ? (
              <div style={{ padding: "16px 0", color: "var(--text-dim)", fontSize: 13 }}>Loading winnings...</div>
            ) : winnings.length === 0 ? (
              <div style={{ padding: "16px 0", color: "var(--text-dim)", fontSize: 13 }}>
                You have no recorded winnings yet. Keep playing to win exciting prizes!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {winnings.map((w) => {
                  const isClaimed = w.player_claimed;
                  const isDisbursed = w.disbursed;
                  
                  return (
                    <div 
                      key={w.prize_id}
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 8,
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{w.pattern_name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                          {w.game_title} • Ticket #{w.winner_ticket_number}
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: "var(--accent)" }}>
                          ₹{w.amount.toFixed(2)}
                        </span>
                        
                        {isDisbursed ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "4px 8px", borderRadius: 4 }}>
                            Disbursed
                          </span>
                        ) : isClaimed ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "4px 8px", borderRadius: 4 }}>
                              Pending Disbursal
                            </span>
                            <button
                              onClick={() => initiateClaim(w.game_id, w.prize_id)}
                              style={{
                                background: "none",
                                border: "1px solid var(--border-light)",
                                color: "var(--text)",
                                borderRadius: 6,
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: 500,
                                cursor: "pointer"
                              }}
                            >
                              WhatsApp FO
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => initiateClaim(w.game_id, w.prize_id)}
                            disabled={claimingId === w.prize_id}
                            style={{
                              background: "var(--accent)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              opacity: claimingId === w.prize_id ? 0.6 : 1
                            }}
                          >
                            {claimingId === w.prize_id ? "Claiming..." : "Claim Now"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
