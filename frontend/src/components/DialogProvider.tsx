"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Icon } from "./Icon";

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirm?: boolean;
  type?: "info" | "success" | "warning" | "error";
}

interface DialogState {
  isOpen: boolean;
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirm: boolean;
  type: "info" | "success" | "warning" | "error";
  resolve: ((value: boolean) => void) | null;
}

interface DialogContextType {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    message: "",
    title: "",
    confirmLabel: "OK",
    cancelLabel: "Cancel",
    isConfirm: false,
    type: "info",
    resolve: null,
  });

  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const showDialog = useCallback(
    (message: string, options: DialogOptions = {}, isConfirm = false): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        let defaultTitle = isConfirm ? "Confirm Action" : "Notice";
        if (options.type === "success") defaultTitle = "Success";
        if (options.type === "error") defaultTitle = "Error";
        if (options.type === "warning") defaultTitle = "Warning";

        setState({
          isOpen: true,
          message,
          title: options.title || defaultTitle,
          confirmLabel: options.confirmLabel || (isConfirm ? "Confirm" : "OK"),
          cancelLabel: options.cancelLabel || "Cancel",
          isConfirm,
          type: options.type || (isConfirm ? "warning" : "info"),
          resolve,
        });
      });
    },
    []
  );

  const alert = useCallback(
    (message: string, options?: DialogOptions): Promise<void> => {
      return showDialog(message, options, false).then(() => {});
    },
    [showDialog]
  );

  const confirm = useCallback(
    (message: string, options?: DialogOptions): Promise<boolean> => {
      return showDialog(message, options, true);
    },
    [showDialog]
  );

  const handleClose = useCallback((value: boolean) => {
    if (state.resolve) {
      state.resolve(value);
    }
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [state]);

  // Keyboard accessibility
  useEffect(() => {
    if (!state.isOpen) return;

    // Focus primary button when open
    setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isOpen, handleClose]);

  // Color theme helpers based on alert type
  let typeColor = "var(--accent)";
  let typeIcon: "info" | "check" | "x" | "alert" = "info";
  if (state.type === "success") {
    typeColor = "#10b981"; // success green
    typeIcon = "check";
  } else if (state.type === "error") {
    typeColor = "#ef4444"; // danger red
    typeIcon = "x";
  } else if (state.type === "warning") {
    typeColor = "var(--accent)"; // gold
    typeIcon = "alert";
  }

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {state.isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            animation: "hgFadeIn 0.2s ease-out forwards",
          }}
          onClick={() => handleClose(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              background: "var(--surface)",
              border: "1.5px solid var(--border)",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
              padding: "24px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              animation: "hgSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Icon */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: `rgba(${state.type === "success" ? "16,185,129" : state.type === "error" ? "239,68,68" : "212,175,55"}, 0.12)`,
                  border: `1.5px solid ${typeColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: typeColor,
                  flexShrink: 0
                }}
              >
                <Icon name={typeIcon} size={18} strokeWidth={2.5} />
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text)",
                  fontFamily: "var(--font-space-grotesk)",
                  letterSpacing: "-0.01em"
                }}
              >
                {state.title}
              </h3>
            </div>

            {/* Message Body */}
            <div
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "var(--text-dim)",
                wordBreak: "break-word"
              }}
            >
              {state.message}
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "4px"
              }}
            >
              {state.isConfirm && (
                <button
                  onClick={() => handleClose(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-2)",
                    background: "var(--surface-2)",
                    color: "var(--text-dim)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--surface-3)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--surface-2)";
                    e.currentTarget.style.color = "var(--text-dim)";
                  }}
                >
                  {state.cancelLabel}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                onClick={() => handleClose(true)}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: typeColor,
                  color: state.type === "success" || state.type === "error" ? "#ffffff" : "var(--accent-ink)",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: `0 4px 12px rgba(${state.type === "success" ? "16,185,129" : state.type === "error" ? "239,68,68" : "212,175,55"}, 0.2)`,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 6px 16px rgba(${state.type === "success" ? "16,185,129" : state.type === "error" ? "239,68,68" : "212,175,55"}, 0.3)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `0 4px 12px rgba(${state.type === "success" ? "16,185,129" : state.type === "error" ? "239,68,68" : "212,175,55"}, 0.2)`;
                }}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
