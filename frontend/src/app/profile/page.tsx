"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { PlayerProfile, PlayerStats } from "@/lib/types";
import { clearPlayerToken, setPlayerToken } from "@/lib/playerSession";
import { useDialog } from "@/components/DialogProvider";

const AVATAR_PRESETS = [
  { id: "crown", label: "Crown", icon: "👑" },
  { id: "dice", label: "Dice", icon: "🎲" },
  { id: "star", label: "Star", icon: "⭐" },
  { id: "fire", label: "Fire", icon: "🔥" },
  { id: "zap", label: "Spark", icon: "⚡" },
  { id: "clover", label: "Lucky", icon: "🍀" },
  { id: "diamond", label: "Diamond", icon: "💎" },
  { id: "trophy", label: "Trophy", icon: "🏆" },
  { id: "target", label: "Target", icon: "🎯" },
];

export default function ProfilePage() {
  const router = useRouter();
  const { alert } = useDialog();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);

  function localValidateUsername(name: string): { ok: boolean; error?: string } {
    if (!name) return { ok: false };
    if (name.length < 2 || name.length > 16) {
      return { ok: false, error: "Must be between 2 and 16 characters." };
    }
    if (!/^[A-Za-z0-9_.]+$/.test(name)) {
      if (/\s/.test(name)) {
        return { ok: false, error: "Cannot contain spaces." };
      }
      if (/[\uD800-\uDFFF].|[\u2600-\u27FF]/.test(name)) {
        return { ok: false, error: "Cannot contain emojis." };
      }
      return { ok: false, error: "Only alphanumeric, underscores (_), and periods (.) allowed." };
    }
    return { ok: true };
  }

  // Form states
  const [housieName, setHousieName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Password states
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);



  useEffect(() => {
    let cancelled = false;
    const loadData = () => {
      apiFetch<{ player: PlayerProfile }>("/api/player/me")
        .then((res) => {
          if (cancelled) return;
          setProfile(res.player);
          setHousieName(res.player.housie_name || "");
          setFullName(res.player.full_name || "");
          setPhone(res.player.phone || "");
          setEmail(res.player.email || "");
          setAvatarUrl(res.player.avatar_url || "");
          setSoundEnabled(res.player.sound_enabled !== false);
          setHasPassword(!!res.player.has_password);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (!isAuthError(err)) {
            setTimeout(() => { if (!cancelled) loadData(); }, 3000);
            return;
          }
          router.push("/login");
        });

      apiFetch<PlayerStats>("/api/player/stats")
        .then((s) => { if (!cancelled) setStats(s); })
        .catch(() => {});
    };
    loadData();
    return () => { cancelled = true; };
  }, [router]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image file size must be under 5MB", { type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarUrl(reader.result);
        setShowAvatarPicker(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setAlternatives([]);
    try {
      const updates: {
        full_name: string;
        phone: string | null;
        email: string | null;
        avatar_url: string | null;
        sound_enabled: boolean;
        password?: string;
        housie_name?: string;
      } = {
        full_name: fullName,
        phone: phone || null,
        email: email || null,
        avatar_url: avatarUrl || null,
        sound_enabled: soundEnabled,
        housie_name: housieName,
      };

      // Only ever SET a password, never clear one: an empty string is simply not sent.
      // Dropping back to passwordless would strand the account on its known device again.
      if (password) {
        updates.password = password;
      }

      const res = await apiFetch<{ player: PlayerProfile; token?: string }>("/api/player/me", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });

      if (res.token) {
        setPlayerToken(res.token);
      }

      setProfile(res.player);
      setHousieName(res.player.housie_name || "");
      setFullName(res.player.full_name || "");
      setPhone(res.player.phone || "");
      setEmail(res.player.email || "");
      setAvatarUrl(res.player.avatar_url || "");
      setSoundEnabled(res.player.sound_enabled !== false);
      setHasPassword(!!res.player.has_password);
      setPassword("");

      alert("Profile updated successfully!", { type: "success" });
    } catch (err: unknown) {
      const errorObj = err as Error & { alternatives?: string[] };
      setError(errorObj.message || "Failed to save profile");
      if (Array.isArray(errorObj.alternatives)) {
        setAlternatives(errorObj.alternatives);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/player/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      if (typeof window !== "undefined") {
        clearPlayerToken();
      }
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <PublicShell>
        <div className="hg-screen flex items-center justify-center min-h-[50vh]">
          <span style={{ color: "var(--text-dim)", fontSize: 15, fontWeight: 500 }}>Loading player profile…</span>
        </div>
      </PublicShell>
    );
  }

  const memberSinceStr = profile?.registered_at
    ? new Date(profile.registered_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "Active Player";

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-dim)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--surface-2)",
    border: "1px solid var(--border-light)",
    borderRadius: 10,
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
    padding: "10px 14px"
  };

  return (
    <PublicShell>
      <div className="hg-screen hg-screen--profile" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", width: "100%", maxWidth: "1050px", margin: "0 auto" }}>
        
        {/* Top Header Card */}
        <div style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 16, padding: "24px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div 
                style={{ 
                  width: "60px", 
                  height: "60px", 
                  borderRadius: "50%", 
                  background: "var(--brand)", 
                  color: "var(--accent-ink)", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  fontSize: "24px", 
                  fontWeight: "800",
                  border: "2px solid var(--accent)",
                  overflow: "hidden"
                }}
              >
                {avatarUrl && avatarUrl.startsWith("data:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={profile?.housie_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : avatarUrl ? (
                  <span>{avatarUrl}</span>
                ) : (
                  (profile?.full_name || profile?.housie_name || "?")[0].toUpperCase()
                )}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>
                    {profile?.full_name ? profile.full_name.trim().split(/\s+/)[0] : profile?.housie_name}
                  </h1>
                  <span style={{ fontSize: "11px", fontWeight: "bold", background: "rgba(244,201,93,0.15)", color: "var(--accent)", border: "1px solid rgba(244,201,93,0.3)", padding: "2px 10px", borderRadius: "12px" }}>
                    PLAYER
                  </span>
                </div>
                
                <div style={{ display: "flex", gap: "14px", marginTop: "4px", fontSize: "12px", color: "var(--text-dim)", flexWrap: "wrap" }}>
                  {profile?.full_name && <span>Name: <strong style={{ color: "var(--text)" }}>{profile.full_name}</strong></span>}
                  <span>Member since: <strong style={{ color: "var(--accent)" }}>{memberSinceStr}</strong></span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Icon name="edit" size={14} /> Change Avatar
              </button>
              
              <Button type="button" variant="ghost" onClick={handleLogout} style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}>
                Logout
              </Button>
            </div>

          </div>

          {/* Avatar Selector Options for Player */}
          {showAvatarPicker && (
            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-dim)" }}>
                  Choose Avatar Badge or Upload Picture
                </span>

                <label
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--accent)",
                    background: "rgba(244, 201, 93, 0.15)",
                    color: "var(--accent)",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Icon name="upload" size={14} /> Upload Picture from Device
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {AVATAR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setAvatarUrl(p.icon); setShowAvatarPicker(false); }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "15px",
                      cursor: "pointer",
                      border: avatarUrl === p.icon ? "2px solid var(--accent)" : "1px solid var(--border-light)",
                      background: avatarUrl === p.icon ? "rgba(244, 201, 93, 0.15)" : "var(--surface-2)",
                      transition: "all 0.2s"
                    }}
                    title={p.label}
                  >
                    {p.icon} <span style={{ fontSize: "11px", marginLeft: "4px", color: "var(--text-dim)" }}>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>


        {/* Profile Settings Form */}
        <form onSubmit={handleSave} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20, background: "var(--surface)", padding: "24px", borderRadius: 16, border: "1px solid var(--border-light)" }}>
          
          {error && (
            <div className="hg-sec-err" style={{ padding: 16, background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>{error}</div>
              {alternatives.length > 0 && (
                <div style={{ borderTop: "1.5px solid rgba(239, 68, 68, 0.15)", paddingTop: 10, fontSize: "12px" }}>
                  <span style={{ opacity: 0.8, display: "block", marginBottom: 8, fontWeight: 600 }}>Suggested Usernames:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => {
                          setHousieName(alt);
                          setAlternatives([]);
                          setError(null);
                        }}
                        style={{
                          padding: "4px 10px",
                          background: "rgba(6, 182, 212, 0.12)",
                          border: "1.5px solid rgba(6, 182, 212, 0.25)",
                          borderRadius: "6px",
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(6, 182, 212, 0.2)";
                          e.currentTarget.style.borderColor = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(6, 182, 212, 0.12)";
                          e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.25)";
                        }}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 20 }}>
            
            {/* Personal Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                Personal Details
              </h3>
              
              <div>
                <label style={labelStyle}>
                  {profile && (profile.housie_name_changes || 0) >= 1 ? "Housie Name (Permanent)" : "Housie Name (Can be changed once)"}
                </label>
                <input 
                  type="text" 
                  value={housieName} 
                  onChange={e => setHousieName(e.target.value)} 
                  disabled={profile ? (profile.housie_name_changes || 0) >= 1 : true} 
                  style={{ 
                    ...inputStyle, 
                    ...(profile && (profile.housie_name_changes || 0) >= 1 ? { opacity: 0.6, cursor: "not-allowed" } : {}), 
                    fontFamily: "var(--font-mono)" 
                  }} 
                />
                {housieName && profile && (profile.housie_name_changes || 0) < 1 && (
                  <div 
                    style={{ 
                      fontSize: "11px", 
                      marginTop: "6px", 
                      fontWeight: 600, 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "4px",
                      color: localValidateUsername(housieName).ok ? "#10b981" : "#ef4444" 
                    }}
                  >
                    {localValidateUsername(housieName).ok ? (
                      <>
                        <Icon name="check" size={12} strokeWidth={3} /> Username format is valid
                      </>
                    ) : (
                      <>
                        ✕ {localValidateUsername(housieName).error}
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <div>
                <label style={labelStyle}>Full Name (Optional)</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>WhatsApp Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9876543210" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Security & Preferences */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                  Security & Password
                </h3>
                
                <div>
                  <label style={labelStyle}>
                    {hasPassword ? "Change Password" : "Set Password for Secure Sign In"}
                  </label>
                  <div className="hg-password-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={hasPassword ? "•••••••• (Leave blank to keep current)" : "At least 6 characters"}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      className="hg-password-toggle"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <Icon name={showPassword ? "eye" : "eyeOff"} size={16} />
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "var(--text-mute)", margin: 0, lineHeight: 1.5 }}>
                  {hasPassword
                    ? "Your password is what lets you sign in on any device. It can be changed here, but not removed."
                    : "Set a password so you can sign in from any device, not just this one."}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
                  Game Preferences
                </h3>
                
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none", background: "var(--surface-2)", padding: 12, borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <input 
                    type="checkbox" 
                    checked={soundEnabled} 
                    onChange={e => setSoundEnabled(e.target.checked)} 
                    style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }} 
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Enable Game Sound Effects</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Audio voice calls & winning claim sounds.</span>
                  </div>
                </label>
              </div>

            </div>

          </div>

          <div style={{ marginTop: 8, borderTop: "1px solid var(--border-light)", paddingTop: 16 }}>
            <Button type="submit" variant="cta" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

        </form>

      </div>
    </PublicShell>
  );
}
