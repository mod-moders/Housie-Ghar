"use client";
/** Shared UI primitives ported from the housieGhar prototype. */

import React from "react";
import Image from "next/image";
import { Icon } from "./Icon";
import Link from "next/link";

// ── Brand wordmark ───────────────────────────────────────────────────────────
export function Logo({ 
  size = 38, 
  onClick, 
  href = "/" 
}: { 
  size?: number; 
  onClick?: () => void; 
  href?: string;
}) {
  const content = (
    <>
      <Image
        src="/HG Primary.png"
        alt="Housie Ghar Logo"
        width={size}
        height={size}
        priority
        className="object-contain"
      />
      <span style={{ 
        fontFamily: "var(--font-head)", 
        fontSize: "20px", 
        letterSpacing: "-0.03em", 
        color: "var(--text)", 
        display: "flex", 
        gap: "4px" 
      }} className="hg-logo-word">
        <span style={{ fontWeight: 500 }}>Housie</span>
        <b style={{ fontWeight: 800 }}>Ghar</b>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button className="hg-logo" onClick={onClick} aria-label="Housie Ghar home">
        {content}
      </button>
    );
  }

  return (
    <Link href={href} className="hg-logo" aria-label="Housie Ghar home">
      {content}
    </Link>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps {
  children: React.ReactNode;
  variant?: "cta" | "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconRight?: string;
  full?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}

// ── Avatar (role profile picture with initial-letter fallback) ───────────────
export function Avatar({
  src,
  name,
  className = "hg-avatar-sm",
  style,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = React.useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? "Profile picture"}
        className={className}
        style={{ objectFit: "cover", ...style }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={className} style={style}>
      {(name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

export function Button({
  children, variant = "cta", size = "md", icon, iconRight, full, onClick, disabled, type = "button", style,
}: ButtonProps) {
  return (
    <button
      className={`hg-btn hg-btn-${variant} hg-btn-${size}${full ? " hg-btn-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
      type={type}
      style={style}
    >
      {icon && <Icon name={icon} size={size === "lg" ? 20 : 17} strokeWidth={2.2} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={size === "lg" ? 20 : 17} strokeWidth={2.2} />}
    </button>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ tone = "neutral", icon, children }: { tone?: string; icon?: string; children: React.ReactNode }) {
  return (
    <span className={`hg-badge hg-badge-${tone}`} style={{ flexShrink: 0 }}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ booked, locked, capacity }: { booked: number; locked: number; capacity: number }) {
  const b = Math.min(100, (booked / capacity) * 100);
  const l = Math.min(100 - b, (locked / capacity) * 100);
  const total = Math.round(((booked + locked) / capacity) * 100);
  return (
    <div className="hg-prog">
      <div className="hg-prog-track">
        <div className="hg-prog-booked" style={{ width: `${b}%` }} />
        <div className="hg-prog-locked" style={{ width: `${l}%` }} />
      </div>
      <div className="hg-prog-meta">
        <span>
          {booked + locked}
          <span className="hg-dim"> / {capacity} tickets</span>
        </span>
        <span className="hg-prog-pct">{total}% full</span>
      </div>
    </div>
  );
}

// ── Countdown pills ──────────────────────────────────────────────────────────
function useCountdownTs(targetTs: number) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, targetTs - now);
  const h = Math.floor(diff / 3.6e6);
  const m = Math.floor((diff % 3.6e6) / 6e4);
  const s = Math.floor((diff % 6e4) / 1000);
  return { h, m, s, done: diff === 0 };
}

export function CountdownPills({ targetTs }: { targetTs: number }) {
  const { h, m, s } = useCountdownTs(targetTs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const pills: [string, number][] = [["HRS", h], ["MIN", m], ["SEC", s]];
  return (
    <div className="hg-countdown">
      {pills.map(([lbl, v], i) => (
        <React.Fragment key={lbl}>
          {i > 0 && <span className="hg-cd-colon">:</span>}
          <div className="hg-cd-pill">
            <span className="hg-cd-num">{pad(v)}</span>
            <span className="hg-cd-lbl">{lbl}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Status badge for a game card ─────────────────────────────────────────────
export function GameStatusBadge({ status }: { status: "sold" | "fast" | "filling" | "open" }) {
  if (status === "sold") return <Badge tone="dead" icon="x">Sold Out</Badge>;
  if (status === "fast") return <Badge tone="hot" icon="flame">Fast Filling!</Badge>;
  if (status === "filling") return <Badge tone="warm" icon="zap">Filling Fast</Badge>;
  return <Badge tone="open" icon="check">Open</Badge>;
}

// ── Trust line — quiet inline chips ──────────────────────────────────────────
export function TrustBadges() {
  return null;
}

// ── Footer ───────────────────────────────────────────────────────────────────
export function Footer() {
  return null;
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyHint({ icon, title, sub, cta, onCta }: {
  icon: string; title: string; sub: string; cta?: string; onCta?: () => void;
}) {
  return (
    <div className="hg-empty">
      <div className="hg-empty-ic"><Icon name={icon} size={26} /></div>
      <strong>{title}</strong>
      <span>{sub}</span>
      {cta && <button className="hg-empty-cta" onClick={onCta}>{cta}</button>}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, tone }: {
  label: string; value: React.ReactNode; sub?: string; tone?: "good" | "alert";
}) {
  return (
    <div className={`hg-kpi${tone ? " hg-kpi-" + tone : ""}`}>
      <span className="hg-kpi-label">{label}</span>
      <b className="hg-kpi-value">{value}</b>
      {sub && <span className="hg-kpi-sub">{sub}</span>}
    </div>
  );
}
