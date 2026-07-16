import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";

export function BookieApplicationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    fullName: "",
    nationality: "",
    dob: "",
    gender: "Male",
    phone: "",
    email: "",
    occupation: "Student"
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple validations
    if (!form.fullName.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!form.nationality.trim()) {
      setError("Nationality is required.");
      return;
    }
    if (!form.dob) {
      setError("Date of Birth is required.");
      return;
    }
    if (!form.phone.trim()) {
      setError("WhatsApp number is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email ID is required.");
      return;
    }

    setBusy(true);
    try {
      await apiFetch("/api/users/apply-bookie", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          nationality: form.nationality.trim(),
          date_of_birth: form.dob,
          gender: form.gender,
          phone: form.phone.trim(),
          email: form.email.trim(),
          occupation: form.occupation
        })
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit application. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(5px)", padding: "40px 20px", overflowY: "auto" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: "980px", background: "var(--surface)", border: "1.5px solid var(--accent)", borderRadius: "var(--radius)", boxShadow: "0 25px 50px rgba(0, 0, 0, 0.7)", padding: "32px", color: "var(--text)" }}>
        {/* Close Button */}
        <button 
          onClick={onClose} 
          style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", color: "var(--text-mute)", cursor: "pointer", transition: "color 0.2s" }}
          className="hover:text-white"
          aria-label="Close modal"
        >
          <Icon name="x" size={20} />
        </button>

        {success ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px", color: "var(--accent)" }}>
              <Icon name="check" size={64} strokeWidth={3} />
            </div>
            <h3 style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent)", marginBottom: "12px" }}>Application Submitted!</h3>
            <p className="hg-sec-sub" style={{ fontSize: "14px", lineHeight: "1.6", maxWidth: "500px", margin: "0 auto" }}>
              Thank you for applying to be a Bookie for Housie Ghar. Our team will review your application and contact you on WhatsApp shortly.
            </p>
            <Button onClick={onClose} variant="cta" style={{ marginTop: "28px", minWidth: "140px" }}>
              Close
            </Button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "32px" }}>
            
            {/* Left Column: Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon name="users" size={20} />
                  Apply as Bookie
                </h2>
                <p className="hg-sec-sub" style={{ fontSize: "12px", marginTop: "4px" }}>
                  Provision details to apply for the Bookie role in Housie Ghar.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label className="hg-form-field" style={{ gridColumn: "span 2" }}>
                  <span>Full Name (First & Last Name) <span style={{ color: "#F43F5E" }}>*</span></span>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. John Doe"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </label>

                <label className="hg-form-field">
                  <span>Nationality <span style={{ color: "#F43F5E" }}>*</span></span>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Indian"
                    value={form.nationality}
                    onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  />
                </label>

                <label className="hg-form-field">
                  <span>Date of Birth <span style={{ color: "#F43F5E" }}>*</span></span>
                  <input 
                    type="date" 
                    required 
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                  />
                </label>

                <label className="hg-form-field">
                  <span>Gender <span style={{ color: "#F43F5E" }}>*</span></span>
                  <select 
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="hg-form-field">
                  <span>WhatsApp Number <span style={{ color: "#F43F5E" }}>*</span></span>
                  <input 
                    type="tel" 
                    required 
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>

                <label className="hg-form-field" style={{ gridColumn: "span 2" }}>
                  <span>Email ID <span style={{ color: "#F43F5E" }}>*</span></span>
                  <input 
                    type="email" 
                    required 
                    placeholder="e.g. john@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>

                <label className="hg-form-field" style={{ gridColumn: "span 2" }}>
                  <span>Occupation <span style={{ color: "#F43F5E" }}>*</span></span>
                  <select 
                    value={form.occupation}
                    onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                  >
                    <option value="Student">Student</option>
                    <option value="Self-employed">Self-employed</option>
                    <option value="Business Owner">Business Owner</option>
                    <option value="Salaried Employee">Salaried Employee</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>

              {error && (
                <p className="hg-sec-err" style={{ margin: 0, fontSize: "12px", textAlign: "center" }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <Button type="button" onClick={onClose} variant="ghost" disabled={busy} style={{ flex: 1 }}>
                  Cancel
                </Button>
                <Button type="submit" variant="cta" disabled={busy} style={{ flex: 2 }}>
                  {busy ? "Submitting..." : "Submit Application"}
                </Button>
              </div>
            </form>

            {/* Right Column: Bookie Guide */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", background: "rgba(212, 175, 55, 0.02)", border: "1px solid rgba(212, 175, 55, 0.15)", borderRadius: "var(--radius)", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                <Icon name="shieldCheck" size={16} />
                Bookie Guide: Your Role & Earnings
              </h3>
              
              <div style={{ fontSize: "12px", lineHeight: "1.6", color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <b style={{ color: "var(--text)", display: "block", fontSize: "13px", marginBottom: "4px" }}>1. How the System Works (Your Role)</b>
                  As a Bookie, your primary responsibility is to sell game tickets to players. When a player requests a ticket on the platform, our system automatically passes that request to an active Bookie. The system assigns these requests fairly by taking turns, so everyone gets a chance to make a sale. Once a player is assigned to you, they will message you directly on WhatsApp to coordinate and complete their purchase.
                </div>
                
                <div>
                  <b style={{ color: "var(--text)", display: "block", fontSize: "13px", marginBottom: "4px" }}>2. Confirming Player Bookings</b>
                  When a player pays you for their tickets via UPI, you must first check your personal bank account or UPI app to ensure the money has successfully arrived. Once you see the payment is safely in your account, open your booking dashboard and click the <b>"Confirm"</b> button.
                  <p style={{ marginTop: "6px", color: "var(--accent)", fontStyle: "italic" }}>
                    * <b>Important Time Limit:</b> You must verify the payment and click confirm within a 10-minute window. Once you click confirm, the system will officially issue the active tickets to the player.
                  </p>
                </div>

                <div>
                  <b style={{ color: "var(--text)", display: "block", fontSize: "13px", marginBottom: "4px" }}>3. How You Earn Money</b>
                  Your income comes from the difference between the wholesale price and the retail price of the tickets, allowing you to get paid instantly.
                  <ul style={{ paddingLeft: "16px", margin: "6px 0", listStyleType: "disc", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <li><b>Buying:</b> You purchase ticket tokens in bulk from the Financial Officer at a special discounted wholesale rate.</li>
                    <li><b>Selling:</b> You sell those tickets to players at the regular, full price.</li>
                    <li><b>Profit:</b> You keep the extra money (the profit margin) right away.</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
