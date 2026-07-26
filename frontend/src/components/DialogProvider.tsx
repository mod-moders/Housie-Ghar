"use client";
/**
 * App-wide alert/confirm dialogs, replacing the native browser ones.
 *
 * Wraps the tree in layout.tsx; call sites use `const { alert, confirm } = useDialog()`.
 * `alert` resolves once dismissed, `confirm` resolves true/false, so both can be awaited
 * in place of `window.alert` / `window.confirm`.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

export type DialogType = "info" | "success" | "warning" | "error";

export interface DialogOptions {
  type?: DialogType;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogApi {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
}

interface DialogState extends DialogOptions {
  message: string;
  mode: "alert" | "confirm";
}

const DialogContext = createContext<DialogApi | null>(null);

/** Per-type accent + icon. Every colour is a theme token so dialogs re-skin with the site. */
const TONE: Record<DialogType, { accent: string; soft: string; icon: string }> = {
  info: { accent: "var(--accent)", soft: "var(--accent-soft)", icon: "help" },
  success: { accent: "var(--success)", soft: "var(--success-soft)", icon: "check" },
  warning: { accent: "var(--accent)", soft: "var(--accent-soft)", icon: "alert" },
  error: { accent: "var(--danger)", soft: "var(--danger-soft)", icon: "alert" },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Held across renders so the promise opened in `alert`/`confirm` is settled by
  // whichever button the user presses, rather than being recreated on each render.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(result);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      alert: (message, options) =>
        new Promise<void>((resolve) => {
          resolverRef.current = () => resolve();
          setDialog({ ...options, message, mode: "alert" });
        }),
      confirm: (message, options) =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          setDialog({ ...options, message, mode: "confirm" });
        }),
    }),
    []
  );

  const tone = TONE[dialog?.type ?? "info"];

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <div
          role="presentation"
          onClick={() => close(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "var(--scrim, rgba(0,0,0,0.7))",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            role={dialog.mode === "confirm" ? "alertdialog" : "alert"}
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 380,
              background: "var(--surface)",
              border: "1.5px solid var(--card-line)",
              borderTop: `3px solid ${tone.accent}`,
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--card-shadow)",
              padding: 22,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 30, height: 30, borderRadius: 999, flexShrink: 0,
                  background: tone.soft, color: tone.accent,
                  display: "grid", placeItems: "center",
                }}
              >
                <Icon name={tone.icon} size={16} strokeWidth={2.2} />
              </span>
              <h2
                style={{
                  margin: 0, fontFamily: "var(--font-head)", fontSize: 16,
                  fontWeight: 700, color: "var(--text)",
                }}
              >
                {dialog.title ?? (dialog.mode === "confirm" ? "Are you sure?" : "Housie Ghar")}
              </h2>
            </div>

            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-dim)" }}>
              {dialog.message}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
              {dialog.mode === "confirm" && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  style={{
                    borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", color: "var(--text-dim)",
                    background: "transparent", border: "1.5px solid var(--border-2)",
                  }}
                >
                  {dialog.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                style={{
                  borderRadius: 999, padding: "9px 20px", fontSize: 13, fontWeight: 800,
                  cursor: "pointer", color: "var(--cta-ink)",
                  background: tone.accent, border: "none",
                }}
              >
                {dialog.confirmLabel ?? (dialog.mode === "confirm" ? "Confirm" : "OK")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}
