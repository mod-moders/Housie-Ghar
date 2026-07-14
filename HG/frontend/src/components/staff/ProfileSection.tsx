"use client";
/**
 * My Profile — self-service for every staff role. Edits full name / WhatsApp
 * number / email (+ UPI ID for Bookies) via PATCH /api/auth/me, and changes the
 * password via the existing POST /api/auth/change-password (min 8 chars,
 * matching the backend's MIN_PASSWORD_LENGTH).
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Avatar, Button, PasswordInput } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { roleAvatar } from "@/lib/roleAvatar";
import type { AuthUser } from "@/lib/stores/authStore";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)", background: "var(--bg)",
  color: "var(--text)", fontSize: 13, width: "100%", outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6,
};

function Flash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div style={{
      padding: "6px 14px", borderRadius: "var(--radius-sm)",
      background: error ? "var(--danger-soft)" : "var(--success-soft)",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <Icon name={error ? "x" : "check"} size={14} style={{ color: error ? "var(--danger)" : "var(--success)" }} />
      <span style={{ color: error ? "var(--danger)" : "var(--success)", fontWeight: 600, fontSize: 13 }}>{text}</span>
    </div>
  );
}

export function ProfileSection({ me, onUpdated }: { me: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [fullName, setFullName] = useState(me.full_name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [upiId, setUpiId] = useState(me.upi_id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const roleLabel = me.role_name === "Agent" ? "Bookie" : me.is_cfo ? "Financial Officer" : me.role_name;
  const showUpi = me.role_name === "Agent";
  const dirty =
    fullName.trim() !== me.full_name ||
    phone.trim() !== (me.phone ?? "") ||
    email.trim() !== (me.email ?? "") ||
    (showUpi && upiId.trim() !== (me.upi_id ?? ""));

  const handleSave = async () => {
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setMessage({ text: "Full name, WhatsApp number and email are required.", error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ user: { full_name: string; phone: string | null; email: string; upi_id: string | null } }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          upi_id: showUpi ? (upiId.trim() || null) : undefined,
        }),
      });
      onUpdated({ ...me, full_name: res.user.full_name, phone: res.user.phone, email: res.user.email, upi_id: res.user.upi_id });
      setMessage({ text: "Profile updated." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to update profile.", error: true });
    }
    setSaving(false);
  };

  const pwValid = curPw.length > 0 && newPw.length >= 8 && confirmPw.length > 0;

  const handleChangePassword = async () => {
    setPwMessage(null);
    if (newPw.length < 8) {
      setPwMessage({ text: "New password must be at least 8 characters.", error: true });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ text: "New password and confirmation do not match.", error: true });
      return;
    }
    if (newPw === curPw) {
      setPwMessage({ text: "New password must be different from your current one.", error: true });
      return;
    }
    setPwSaving(true);
    try {
      await apiFetch<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMessage({ text: "Password updated." });
    } catch (e) {
      setPwMessage({ text: e instanceof Error ? e.message : "Failed to update password.", error: true });
    }
    setPwSaving(false);
  };

  return (
    <div className="hg-sec">
      {message && <div style={{ marginBottom: 12 }}><Flash text={message.text} error={message.error} /></div>}

      <div className="hg-panel" style={{ maxWidth: 460, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar src={roleAvatar(me)} name={me.full_name} size={36} />
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{me.full_name}</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{roleLabel}</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Full name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
        </div>

        <div>
          <label style={labelStyle}>WhatsApp number <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="e.g. 9876543210" />
          <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
            Used for booking coordination and payouts — keep this current.
          </span>
        </div>

        {showUpi && (
          <div>
            <label style={labelStyle}>UPI ID</label>
            <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={inputStyle} placeholder="yourname@upi" />
          </div>
        )}

        <div>
          <label style={labelStyle}>Email <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
          <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
            Your login email.
          </span>
        </div>

        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div className="hg-panel" style={{ maxWidth: 460, marginTop: 18, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="lock" size={16} style={{ color: "var(--text-dim)" }} />
          <h3 style={{ margin: 0, fontSize: 15 }}>Change password</h3>
        </div>

        {pwMessage && <Flash text={pwMessage.text} error={pwMessage.error} />}

        <div>
          <label style={labelStyle}>Current password <span style={{ color: "var(--danger)" }}>*</span></label>
          <PasswordInput value={curPw} autoComplete="current-password" onChange={(e) => setCurPw(e.target.value)} style={inputStyle} placeholder="Enter current password" />
        </div>

        <div>
          <label style={labelStyle}>New password <span style={{ color: "var(--danger)" }}>*</span></label>
          <PasswordInput value={newPw} autoComplete="new-password" onChange={(e) => setNewPw(e.target.value)} style={inputStyle} placeholder="At least 8 characters" />
        </div>

        <div>
          <label style={labelStyle}>Confirm new password <span style={{ color: "var(--danger)" }}>*</span></label>
          <PasswordInput value={confirmPw} autoComplete="new-password" onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} placeholder="Re-enter new password" />
        </div>

        <Button onClick={handleChangePassword} disabled={pwSaving || !pwValid}>
          {pwSaving ? "Updating…" : "Update Password"}
        </Button>
      </div>
    </div>
  );
}
