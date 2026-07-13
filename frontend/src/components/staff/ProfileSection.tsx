"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { roleAvatar } from "@/lib/roleAvatar";
import type { AuthUser } from "@/lib/stores/authStore";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--bg)",
  color: "var(--text)", fontSize: 13, width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6,
};

export function ProfileSection({ me, onUpdated }: { me: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [fullName, setFullName] = useState(me.full_name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [upiId, setUpiId] = useState(me.upi_id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Password change form
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const roleLabel = me.role_name === "Agent" ? "Bookie" : me.role_name;
  const showUpi = me.role_name === "Agent";
  const dirty = fullName.trim() !== me.full_name || phone.trim() !== (me.phone ?? "") || upiId.trim() !== (me.upi_id ?? "");

  const handleSave = async () => {
    if (!fullName.trim() || !phone.trim()) {
      setMessage({ text: "Full name and WhatsApp number are required.", error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ user: any }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          upi_id: showUpi ? (upiId.trim() || null) : undefined,
        }),
      });
      onUpdated({ ...me, full_name: res.user.full_name, phone: res.user.phone, upi_id: res.user.upi_id });
      setMessage({ text: "Profile updated successfully." });
    } catch (e: any) {
      setMessage({ text: e.message || "Failed to update profile.", error: true });
    }
    setSaving(false);
  };

  const pwValid =
    curPw.length > 0 && newPw.length >= 6 && confirmPw.length > 0;

  const handleChangePassword = async () => {
    setPwMessage(null);
    if (newPw.length < 6) {
      setPwMessage({ text: "New password must be at least 6 characters.", error: true });
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
      setPwMessage({ text: "Password updated successfully." });
    } catch (e: any) {
      setPwMessage({ text: e.message || "Failed to update password.", error: true });
    }
    setPwSaving(false);
  };

  return (
    <div className="hg-dash-section" style={{ paddingTop: 8 }}>
      {message && (
        <div style={{
          marginBottom: 12, padding: "6px 14px", borderRadius: 8,
          background: message.error ? "var(--danger-soft)" : "var(--success-soft)",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <Icon name={message.error ? "x" : "check"} size={14} style={{ color: message.error ? "var(--danger)" : "var(--success)" }} />
          <span style={{ color: message.error ? "var(--danger)" : "var(--success)", fontWeight: 600, fontSize: 13 }}>{message.text}</span>
        </div>
      )}

      <div className="hg-card" style={{ padding: "16px 20px", maxWidth: 460, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar src={roleAvatar(me)} name={me.full_name} className="hg-avatar-sm" style={{ width: 36, height: 36, fontSize: 15 }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{me.full_name}</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{roleLabel}</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Full Name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
        </div>

        <div>
          <label style={labelStyle}>WhatsApp Number <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="e.g. 9876543210" />
          <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
            Used for booking coordination and account recovery — keep this current.
          </span>
        </div>

        {showUpi && (
          <div>
            <label style={labelStyle}>UPI ID</label>
            <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={inputStyle} placeholder="yourname@upi" />
          </div>
        )}

        <div>
          <label style={labelStyle}>Email</label>
          <input type="text" value={me.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
          <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
            Your login email — contact an administrator to change it.
          </span>
        </div>

        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div className="hg-card" style={{ padding: "16px 20px", maxWidth: 460, marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="wallet" size={16} style={{ color: "var(--text-dim)" }} />
          <h3 style={{ margin: 0, fontSize: 15 }}>Change Password</h3>
        </div>

        {pwMessage && (
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: pwMessage.error ? "var(--danger-soft)" : "var(--success-soft)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon name={pwMessage.error ? "x" : "check"} size={14} style={{ color: pwMessage.error ? "var(--danger)" : "var(--success)" }} />
            <span style={{ color: pwMessage.error ? "var(--danger)" : "var(--success)", fontWeight: 600, fontSize: 13 }}>{pwMessage.text}</span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Current Password <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="password" value={curPw} autoComplete="current-password" onChange={(e) => setCurPw(e.target.value)} style={inputStyle} placeholder="Enter current password" />
        </div>

        <div>
          <label style={labelStyle}>New Password <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="password" value={newPw} autoComplete="new-password" onChange={(e) => setNewPw(e.target.value)} style={inputStyle} placeholder="At least 6 characters" />
        </div>

        <div>
          <label style={labelStyle}>Confirm New Password <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="password" value={confirmPw} autoComplete="new-password" onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} placeholder="Re-enter new password" />
        </div>

        <Button onClick={handleChangePassword} disabled={pwSaving || !pwValid}>
          {pwSaving ? "Updating…" : "Update Password"}
        </Button>
      </div>
    </div>
  );
}
