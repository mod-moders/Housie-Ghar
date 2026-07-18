import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthUser } from "@/lib/stores/authStore";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Image from "next/image";

export function FirstTimeSetup({ user, onCompleted, onLogout }: {
  user: AuthUser;
  onCompleted: (u: AuthUser) => void;
  onLogout: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    upi_id: "",
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Survives a failed submit: if the password change already went through but a
  // later step failed, a retry must NOT re-attempt it (the "current" temp
  // password would no longer match and the retry would confusingly fail).
  const [passwordChanged, setPasswordChanged] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation checks
    if (!form.full_name.trim() || form.full_name.trim().toLowerCase() === user.username.toLowerCase()) {
      setError("Please enter a valid Full Name different from your username");
      return;
    }
    if (!form.phone.trim()) {
      setError("WhatsApp Number is required");
      return;
    }
    if (!form.email.trim()) {
      setError("Email ID is required");
      return;
    }
    if (!form.upi_id.trim()) {
      setError("UPI ID is required");
      return;
    }
    if (!form.current_password) {
      setError("Current (temporary) password is required");
      return;
    }
    if (form.new_password.length < 6) {
      setError("New password must be at least 6 characters long");
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match");
      return;
    }

    setBusy(true);
    try {
      // 1. Change the password FIRST. These are two separate API calls, so one
      //    can succeed while the other fails — and updating the profile first
      //    could change the LOGIN EMAIL and then fail here, leaving the account
      //    half-migrated (new email, old temp password) with an error message
      //    that doesn't say which half saved. The credential is the critical
      //    step, so it goes first, and every failure names its step.
      if (!passwordChanged) {
        try {
          await apiFetch("/api/auth/change-password", {
            method: "POST",
            body: JSON.stringify({
              current_password: form.current_password,
              new_password: form.new_password,
            }),
          });
          setPasswordChanged(true);
        } catch (err) {
          setError(
            `Password change failed — nothing has been saved yet. ` +
            `${err instanceof Error ? err.message : "Check your temporary password."}`
          );
          return;
        }
      }

      // 2. Update profile
      try {
        await apiFetch("/api/auth/me", {
          method: "PATCH",
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            upi_id: form.upi_id.trim(),
          }),
        });
      } catch (err) {
        setError(
          `Your NEW password is saved and working, but the profile update failed: ` +
          `${err instanceof Error ? err.message : "unknown error"}. ` +
          `Fix the field and press the button again (your password will not be re-changed).`
        );
        return;
      }

      // 3. Re-fetch final session state
      const res = await apiFetch<{ user: AuthUser }>("/api/auth/me");
      onCompleted(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Check your temporary password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hg-stage hg-stage-wide" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "40px 20px" }}>
      <div className="hg-frame" style={{ maxWidth: "960px", width: "100%" }}>
        
        {/* Split Grid Card */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          background: "var(--surface)",
          border: "1.5px solid rgba(212, 175, 55, 0.25)",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)"
        }}>
          
          {/* Left Column: Premium Welcome & Steps */}
          <div style={{
            background: "linear-gradient(135deg, #111115 0%, #070709 100%)",
            borderRight: "1px solid rgba(255, 255, 255, 0.05)",
            padding: "50px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "36px" }}>
                <Image
                  src="/HG Primary.png"
                  alt="Housie Ghar Primary Logo"
                  width={48}
                  height={48}
                  style={{ objectFit: "contain" }}
                />
                <span style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "1px", color: "var(--accent)", textTransform: "uppercase", fontFamily: "var(--font-head)" }}>
                  Housie Ghar
                </span>
              </div>

              <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "16px", lineHeight: "1.3" }}>
                Franchise Portal <br /> Onboarding Setup
              </h2>
              <p style={{ color: "var(--text-mute)", fontSize: "13px", lineHeight: "1.6", marginBottom: "32px" }}>
                As a newly provisioned staff member, you must complete your profile configuration and replace the temporary password before gaining access to the dashboard.
              </p>

              {/* Progress Bullet Steps */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", gap: "14px" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "rgba(212, 175, 55, 0.15)", border: "1px solid var(--accent)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "bold" }}>
                    1
                  </div>
                  <div>
                    <h4 style={{ color: "#fff", fontSize: "13px", fontWeight: 600, margin: 0 }}>Verify Profile Details</h4>
                    <p style={{ color: "var(--text-mute)", fontSize: "11px", margin: "2px 0 0" }}>Update your full name, WhatsApp contact number and email.</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "14px" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "rgba(212, 175, 55, 0.15)", border: "1px solid var(--accent)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "bold" }}>
                    2
                  </div>
                  <div>
                    <h4 style={{ color: "#fff", fontSize: "13px", fontWeight: 600, margin: 0 }}>Configure Payment Gateways</h4>
                    <p style={{ color: "var(--text-mute)", fontSize: "11px", margin: "2px 0 0" }}>Provide your active UPI ID to verify booking payments directly.</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "14px" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "rgba(212, 175, 55, 0.15)", border: "1px solid var(--accent)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "bold" }}>
                    3
                  </div>
                  <div>
                    <h4 style={{ color: "#fff", fontSize: "13px", fontWeight: 600, margin: 0 }}>Establish Account Key</h4>
                    <p style={{ color: "var(--text-mute)", fontSize: "11px", margin: "2px 0 0" }}>Create a secure new password to replace your temporary key.</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: "11px", color: "var(--text-mute)", marginTop: "40px" }}>
              Secure Onboarding Network · Version 2.4.0
            </div>
          </div>

          {/* Right Column: Two-Column Form */}
          <form onSubmit={handleSubmit} style={{ padding: "40px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)" }}>Complete Profile Setup</h3>
                <span className="hg-dim" style={{ fontSize: "12px" }}>Ensure all inputs are populated accurately.</span>
              </div>

              {error && (
                <p className="hg-sec-err" style={{ marginBottom: "20px" }}>{error}</p>
              )}

              {/* Form Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Section I: Identity Details */}
                <div>
                  <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--accent)", fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "6px", marginBottom: "16px" }}>
                    I. Franchise Identity Details
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                    <label className="hg-form-field">
                      <span>Full Name</span>
                      <input 
                        type="text" 
                        placeholder="Enter your real full name"
                        value={form.full_name} 
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })} 
                        required 
                      />
                    </label>

                    <label className="hg-form-field">
                      <span>WhatsApp Number</span>
                      <input 
                        type="tel" 
                        placeholder="e.g. 9876543210"
                        value={form.phone} 
                        onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                        required 
                      />
                    </label>

                    <label className="hg-form-field">
                      <span>Email Address</span>
                      <input 
                        type="email" 
                        placeholder="e.g. you@example.com"
                        value={form.email} 
                        onChange={(e) => setForm({ ...form, email: e.target.value })} 
                        required 
                      />
                    </label>

                    <label className="hg-form-field">
                      <span>UPI ID</span>
                      <input 
                        type="text" 
                        placeholder="e.g. name@upi"
                        value={form.upi_id} 
                        onChange={(e) => setForm({ ...form, upi_id: e.target.value })} 
                        required 
                      />
                    </label>
                  </div>
                </div>

                {/* Section II: Password Configuration */}
                <div>
                  <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--accent)", fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "6px", marginBottom: "16px" }}>
                    II. Access & Password Security
                  </h4>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <label className="hg-form-field">
                      <span>Current Temporary Password</span>
                      <div className="hg-password-wrapper">
                        <input 
                          type={showCurPw ? "text" : "password"} 
                          placeholder="Enter password you used to log in"
                          value={form.current_password} 
                          onChange={(e) => setForm({ ...form, current_password: e.target.value })} 
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bitwarden-ignore="true"
                          required 
                        />
                        <button 
                          type="button" 
                          className="hg-password-toggle"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowCurPw(!showCurPw)}
                          title={showCurPw ? "Hide Password" : "Show Password"}
                        >
                          <Icon name={showCurPw ? "eye" : "eyeOff"} size={16} />
                        </button>
                      </div>
                    </label>
 
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                      <label className="hg-form-field">
                        <span>New Password (min 6 chars)</span>
                        <div className="hg-password-wrapper">
                          <input 
                            type={showNewPw ? "text" : "password"} 
                            placeholder="Enter a secure password"
                            value={form.new_password} 
                            onChange={(e) => setForm({ ...form, new_password: e.target.value })} 
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bitwarden-ignore="true"
                            required 
                          />
                          <button 
                            type="button" 
                            className="hg-password-toggle"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setShowNewPw(!showNewPw)}
                            title={showNewPw ? "Hide Password" : "Show Password"}
                          >
                            <Icon name={showNewPw ? "eye" : "eyeOff"} size={16} />
                          </button>
                        </div>
                      </label>
 
                      <label className="hg-form-field">
                        <span>Confirm New Password</span>
                        <div className="hg-password-wrapper">
                          <input 
                            type={showConfirmPw ? "text" : "password"} 
                            placeholder="Re-enter new password"
                            value={form.confirm_password} 
                            onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} 
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bitwarden-ignore="true"
                            required 
                          />
                          <button 
                            type="button" 
                            className="hg-password-toggle"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setShowConfirmPw(!showConfirmPw)}
                            title={showConfirmPw ? "Hide Password" : "Show Password"}
                          >
                            <Icon name={showConfirmPw ? "eye" : "eyeOff"} size={16} />
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Submit Block */}
            <div style={{ display: "flex", gap: "12px", marginTop: "40px" }}>
              <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={onLogout} style={{ flex: 1 }}>
                <Icon name="lock" size={14} style={{ marginRight: 6 }} /> Log Out
              </Button>
              <Button variant="cta" size="sm" type="submit" disabled={busy} style={{ flex: 2 }}>
                {busy ? "Saving details..." : "Complete Setup & Launch Portal"}
              </Button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
}
