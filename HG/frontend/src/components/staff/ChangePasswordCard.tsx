"use client";
/** Forced first-login password change. Rendered by StaffShell whenever the
 *  authenticated staff profile carries temp_password_required — the backend
 *  403s every other staff API until /api/auth/change-password succeeds. */

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { Button, Logo, PasswordInput } from "@/components/ui";

export function ChangePasswordCard({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (newPw.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New passwords don't match");
      return;
    }
    if (newPw === current) {
      setError("New password must be different from the current one");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: newPw }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update password");
      setBusy(false);
    }
  };

  return (
    <div className="hg-staff-login">
      <div className="hg-login-card">
        <div className="hg-login-brand"><Logo size={72} /></div>
        <div className="hg-login-secure"><Icon name="lock" size={13} /> First sign-in</div>
        <h1 className="hg-login-title">Set a new password</h1>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label className="hg-login-field">
            <span>Current password</span>
            <PasswordInput
              value={current}
              placeholder="••••••••"
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className="hg-login-field">
            <span>New password</span>
            <PasswordInput
              value={newPw}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)}
            />
          </label>
          <label className="hg-login-field">
            <span>Confirm new password</span>
            <PasswordInput
              value={confirmPw}
              placeholder="••••••••"
              autoComplete="new-password"
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </label>
          {error && <div className="hg-login-err">{error}</div>}
          <Button variant="cta" size="lg" full type="submit" disabled={busy || !current || !newPw || !confirmPw}>
            {busy ? "Saving…" : "Save & continue"}
          </Button>
          <div className="hg-login-hint">
            Your account was created with a temporary password — choose your own to continue.
          </div>
        </form>
      </div>
      <div className="hg-login-foot">Powered by <strong>MOD</strong></div>
    </div>
  );
}
