"use client";
/** Player self-service profile — contact details, sound preference, and an
 * optional password upgrade beyond the default username-only login. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Button, PasswordInput } from "@/components/ui";
import { usePlayerStore } from "@/lib/stores/playerStore";
import type { PlayerProfile } from "@/lib/types";

function Flash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      style={{
        padding: "6px 14px",
        borderRadius: "var(--radius-sm)",
        background: error ? "var(--danger-soft)" : "var(--success-soft)",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Icon name={error ? "x" : "check"} size={14} style={{ color: error ? "var(--danger)" : "var(--success)" }} />
      <span style={{ color: error ? "var(--danger)" : "var(--success)", fontWeight: 600, fontSize: 13 }}>{text}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const setPlayer = usePlayerStore((s) => s.setPlayer);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [removePw, setRemovePw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    apiFetch<{ player: PlayerProfile }>("/api/players/me")
      .then((res) => {
        setProfile(res.player);
        setFullName(res.player.full_name);
        setPhone(res.player.phone ?? "");
        setEmail(res.player.email ?? "");
        setSoundEnabled(res.player.sound_enabled);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const dirty =
    !!profile &&
    (fullName.trim() !== profile.full_name ||
      phone.trim() !== (profile.phone ?? "") ||
      email.trim() !== (profile.email ?? "") ||
      soundEnabled !== profile.sound_enabled);

  const handleSaveDetails = async () => {
    if (!fullName.trim()) {
      setDetailsMsg({ text: "Full name is required.", error: true });
      return;
    }
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      const res = await apiFetch<{ player: PlayerProfile }>("/api/players/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          sound_enabled: soundEnabled,
        }),
      });
      setProfile(res.player);
      setPlayer({ ...res.player });
      setDetailsMsg({ text: "Profile updated." });
    } catch (e) {
      setDetailsMsg({ text: e instanceof Error ? e.message : "Failed to update profile.", error: true });
    }
    setSavingDetails(false);
  };

  const pwValid = removePw || (newPw.length >= 6 && newPw === confirmPw);

  const handleSavePassword = async () => {
    setPwMsg(null);
    if (!removePw) {
      if (newPw.length < 6) {
        setPwMsg({ text: "Password must be at least 6 characters.", error: true });
        return;
      }
      if (newPw !== confirmPw) {
        setPwMsg({ text: "Passwords don't match.", error: true });
        return;
      }
    }
    setSavingPw(true);
    try {
      const res = await apiFetch<{ player: PlayerProfile }>("/api/players/me", {
        method: "PATCH",
        body: JSON.stringify(removePw ? { remove_password: true } : { password: newPw }),
      });
      setProfile(res.player);
      setPlayer({ ...res.player });
      setNewPw("");
      setConfirmPw("");
      setRemovePw(false);
      setPwMsg({ text: removePw ? "Password protection removed." : "Password set." });
    } catch (e) {
      setPwMsg({ text: e instanceof Error ? e.message : "Failed to update password.", error: true });
    }
    setSavingPw(false);
  };

  if (loading || !profile) {
    return (
      <PublicShell>
        <div className="hg-screen">
          <div className="hg-page-head">
            <span className="hg-page-kicker"><Icon name="user" size={14} /> MY ACCOUNT</span>
            <h1 className="hg-page-title">Profile &amp; settings</h1>
            <p className="hg-page-sub">Loading…</p>
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="hg-screen">
        <div className="hg-page-head">
          <span className="hg-page-kicker"><Icon name="user" size={14} /> MY ACCOUNT</span>
          <h1 className="hg-page-title">Profile &amp; settings</h1>
          <p className="hg-page-sub">Manage your details, password and sound preference.</p>
        </div>

        <div className="hg-panel" style={{ maxWidth: 460, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {detailsMsg && <Flash text={detailsMsg.text} error={detailsMsg.error} />}

          <label className="hg-login-field">
            <span>Username</span>
            <input type="text" value={profile.username} disabled style={{ opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)" }} />
          </label>

          <label className="hg-login-field">
            <span>Full name</span>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
          </label>

          <label className="hg-login-field">
            <span>Phone (optional)</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" />
          </label>

          <label className="hg-login-field">
            <span>Email (optional)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Enable caller sounds</span>
          </label>
          <div className="hg-login-hint" style={{ marginTop: -8 }}>
            Beeps and spoken number calls on the live board follow this setting by default.
          </div>

          <Button variant="cta" onClick={handleSaveDetails} disabled={savingDetails || !dirty}>
            {savingDetails ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <div className="hg-panel" style={{ maxWidth: 460, margin: "18px auto 0", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="lock" size={16} style={{ color: "var(--text-dim)" }} />
            <h3 style={{ margin: 0, fontSize: 15 }}>{profile.has_password ? "Change password" : "Secure your account"}</h3>
          </div>

          {!profile.has_password && (
            <div className="hg-login-hint">
              You currently sign in with just your username. Add a password for extra security.
            </div>
          )}

          {pwMsg && <Flash text={pwMsg.text} error={pwMsg.error} />}

          <label className="hg-login-field" style={{ opacity: removePw ? 0.5 : 1 }}>
            <span>{profile.has_password ? "New password" : "Password"}</span>
            <PasswordInput
              value={newPw}
              disabled={removePw}
              autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          <label className="hg-login-field" style={{ opacity: removePw ? 0.5 : 1 }}>
            <span>Confirm password</span>
            <PasswordInput
              value={confirmPw}
              disabled={removePw}
              autoComplete="new-password"
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter password"
            />
          </label>

          {profile.has_password && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={removePw}
                onChange={(e) => {
                  setRemovePw(e.target.checked);
                  if (e.target.checked) { setNewPw(""); setConfirmPw(""); }
                }}
                style={{ width: 17, height: 17, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 13, color: "var(--danger)" }}>Remove password (revert to username-only sign in)</span>
            </label>
          )}

          <Button variant="cta" onClick={handleSavePassword} disabled={savingPw || !pwValid}>
            {savingPw ? "Saving…" : removePw ? "Remove password" : profile.has_password ? "Update password" : "Set password"}
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}
