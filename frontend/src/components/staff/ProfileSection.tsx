"use client";
/** Staff "My Profile" Section — Redesigned & Optimized for all devices. */

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { roleAvatar } from "@/lib/roleAvatar";
import type { AuthUser } from "@/lib/stores/authStore";

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--border-2)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--text)",
  fontSize: 13,
  width: "100%",
  outline: "none",
  transition: "all 0.2s ease"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 6,
};

export function ProfileSection({ me, onUpdated }: { me: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [fullName, setFullName] = useState(me.full_name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [upiId, setUpiId] = useState(me.upi_id ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [nationality, setNationality] = useState(me.nationality ?? "");
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Password change form
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const roleLabel = me.role_name;

  const memberSinceStr = me.created_at
    ? new Date(me.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "Active Member";

  const dirty =
    fullName.trim() !== me.full_name ||
    phone.trim() !== (me.phone ?? "") ||
    upiId.trim() !== (me.upi_id ?? "") ||
    email.trim() !== (me.email ?? "") ||
    nationality.trim() !== (me.nationality ?? "") ||
    avatarUrl.trim() !== (me.avatar_url ?? "");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image file size must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!fullName.trim() || !phone.trim()) {
      setMessage({ text: "Full name and WhatsApp number are required.", error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ user: AuthUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          upi_id: upiId.trim() || null,
          email: email.trim() || null,
          nationality: nationality.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      });
      onUpdated({ ...me, ...res.user });
      setMessage({ text: "Profile details updated successfully." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to update profile.", error: true });
    }
    setSaving(false);
  };

  const pwValid = curPw.length > 0 && newPw.length >= 6 && confirmPw.length > 0;

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
    } catch (e) {
      setPwMessage({ text: e instanceof Error ? e.message : "Failed to update password.", error: true });
    }
    setPwSaving(false);
  };

  return (
    <div className="hg-sec" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Top Banner Card */}
      <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(244, 201, 93, 0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ position: "relative" }}>
              <div 
                className="hg-avatar-sm" 
                style={{ 
                  width: "64px", 
                  height: "64px", 
                  fontSize: "24px", 
                  borderRadius: "50%", 
                  border: "2px solid var(--accent)", 
                  background: "var(--surface-2)",
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  overflow: "hidden"
                }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={me.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Avatar src={roleAvatar(me)} name={me.full_name} style={{ width: "100%", height: "100%" }} />
                )}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text)" }}>{me.full_name}</h2>
                <span className="hg-pill" style={{ background: "rgba(244, 201, 93, 0.15)", color: "var(--accent)", border: "1px solid rgba(244, 201, 93, 0.3)", fontWeight: "bold" }}>
                  {roleLabel}
                </span>
              </div>
              
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "12px", color: "var(--text-dim)", flexWrap: "wrap" }}>
                <span>Username: <strong style={{ color: "var(--text)" }}>@{me.username}</strong></span>
                <span>•</span>
                <span>Member since: <strong style={{ color: "var(--accent)" }}>{memberSinceStr}</strong></span>
                {me.phone && (
                  <>
                    <span>•</span>
                    <span>WhatsApp: <strong style={{ color: "#10B981" }}>{me.phone}</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--text)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Icon name="edit" size={14} /> Upload Profile Picture
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
            </label>

            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl("")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#EF4444",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Icon name="x" size={14} /> Reset to Default
              </button>
            )}
          </div>

        </div>
      </div>

      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: message.error ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
          border: message.error ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name={message.error ? "x" : "check"} size={16} style={{ color: message.error ? "#EF4444" : "#10B981" }} />
          <span style={{ color: message.error ? "#EF4444" : "#10B981", fontWeight: 600, fontSize: 13 }}>{message.text}</span>
        </div>
      )}

      {/* Two Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, width: "100%" }}>
        
        {/* Personal Details */}
        <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
            <Icon name="user" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Personal Information</h3>
          </div>

          <div>
            <label style={labelStyle}>Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
          </div>

          <div>
            <label style={labelStyle}>WhatsApp Number <span style={{ color: "#EF4444" }}>*</span></label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="e.g. 9876543210" />
            <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
              Used for booking notifications and account recovery.
            </span>
          </div>

          <div>
            <label style={labelStyle}>UPI ID <span style={{ color: "#EF4444" }}>*</span></label>
            <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={inputStyle} placeholder="e.g. yourname@upi" />
            <span style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "block" }}>
              Required to verify booking payments directly.
            </span>
          </div>

          <div>
            <label style={labelStyle}>Nationality</label>
            <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} style={inputStyle} placeholder="e.g. Indian" />
          </div>

          <div>
            <label style={labelStyle}>Username (Fixed)</label>
            <input type="text" value={me.username} disabled style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
          </div>

          <div>
            <label style={labelStyle}>Email Address</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. you@example.com" />
          </div>

          <Button onClick={handleSave} disabled={saving || !dirty} style={{ marginTop: 8 }}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        {/* Change Password Panel */}
        <div className="hg-panel" style={{ padding: "24px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
            <Icon name="shieldCheck" size={18} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Account Security</h3>
          </div>

          {pwMessage && (
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: pwMessage.error ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
              border: pwMessage.error ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon name={pwMessage.error ? "x" : "check"} size={14} style={{ color: pwMessage.error ? "#EF4444" : "#10B981" }} />
              <span style={{ color: pwMessage.error ? "#EF4444" : "#10B981", fontWeight: 600, fontSize: 13 }}>{pwMessage.text}</span>
            </div>
          )}

          <div>
            <label style={labelStyle}>Current Password <span style={{ color: "#EF4444" }}>*</span></label>
            <div className="hg-password-wrapper">
              <input type={showCurPw ? "text" : "password"} value={curPw} autoComplete="current-password" onChange={(e) => setCurPw(e.target.value)} style={inputStyle} placeholder="Enter current password" />
              <button
                type="button"
                className="hg-password-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowCurPw(!showCurPw)}
              >
                <Icon name={showCurPw ? "eye" : "eyeOff"} size={16} />
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>New Password <span style={{ color: "#EF4444" }}>*</span></label>
            <div className="hg-password-wrapper">
              <input type={showNewPw ? "text" : "password"} value={newPw} autoComplete="new-password" onChange={(e) => setNewPw(e.target.value)} style={inputStyle} placeholder="At least 6 characters" />
              <button
                type="button"
                className="hg-password-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowNewPw(!showNewPw)}
              >
                <Icon name={showNewPw ? "eye" : "eyeOff"} size={16} />
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password <span style={{ color: "#EF4444" }}>*</span></label>
            <div className="hg-password-wrapper">
              <input type={showConfirmPw ? "text" : "password"} value={confirmPw} autoComplete="new-password" onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} placeholder="Re-enter new password" />
              <button
                type="button"
                className="hg-password-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowConfirmPw(!showConfirmPw)}
              >
                <Icon name={showConfirmPw ? "eye" : "eyeOff"} size={16} />
              </button>
            </div>
          </div>

          <Button onClick={handleChangePassword} disabled={pwSaving || !pwValid} style={{ marginTop: 8 }}>
            {pwSaving ? "Updating…" : "Update Password"}
          </Button>
        </div>

      </div>

    </div>
  );
}
