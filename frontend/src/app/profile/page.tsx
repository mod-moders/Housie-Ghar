"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui";
import type { PlayerProfile } from "@/lib/types";

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

  useEffect(() => {
    apiFetch<{ player: PlayerProfile }>("/api/player/me")
      .then((res) => {
        setProfile(res.player);
        setFullName(res.player.full_name || "");
        setPhone(res.player.phone || "");
        setEmail(res.player.email || "");
        setSoundEnabled(res.player.sound_enabled !== false);
        setHasPassword(!!res.player.has_password);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load profile", err);
        router.push("/login"); // redirect to login/signup
      });
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updates: any = {
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
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
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
        <div style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20, background: "var(--surface)", padding: 20, borderRadius: 12, border: "1px solid var(--border-light)" }}>
            
            {error && <div className="hg-sec-err" style={{ padding: 12, background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8 }}>{error}</div>}

            <section>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            </section>

            <section>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16, borderBottom: "1px solid var(--border-light)", paddingBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Security</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>
                    {hasPassword ? "Change Password (Optional)" : "Set Password to Secure Account (Leave Blank if Not Required)"}
                  </label>
                  <input
                    type="password"
                    value={password}
                    disabled={removePassword}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={hasPassword ? "•••••••• (Leave blank to keep current)" : "Enter a password (at least 6 characters)"}
                    style={{ ...inputStyle, padding: "10px 14px", opacity: removePassword ? 0.5 : 1 }}
                  />
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
            </section>

            <section>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16, borderBottom: "1px solid var(--border-light)", paddingBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Preferences</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            </section>

            <div style={{ marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
              <Button type="submit" variant="cta" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleLogout} style={{ marginLeft: "auto", color: "var(--danger)", borderColor: "var(--danger-soft)" }}>
                Logout
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
