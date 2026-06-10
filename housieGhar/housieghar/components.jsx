// components.jsx — shared UI primitives for Housie Ghar
// Exported to window for cross-script use.

// ── Icon set (simple stroke icons; lock/x/check required for color-blind states) ──
const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  trophy: 'M6 4h12v3a6 6 0 0 1-12 0zM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M9 16h6M8 20h8M12 16v4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 9a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4M12 17.5h.01',
  lock: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5zM12 14v3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M4 12.5 9.5 18 20 6.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  chat: 'M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z',
  volume: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  volumeX: 'M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z',
  shieldCheck: 'M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-4.5',
  flame: 'M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.4-2-1-2.8.2 2-1.5 3-1.5 3 .8-3.5-2-5.2-3.5-7.2zM12 3c-3 2-6 5-6 9a6 6 0 0 0 12 0',
  zap: 'M13 3 4 14h7l-1 7 9-11h-7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z',
  spark: 'M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8',
  ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM12 6v12',
  wallet: 'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11l1 3M17 12.5h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.7M22 21a6.5 6.5 0 0 0-4-6',
  chart: 'M4 4v16h16M8 16v-5M12 16V8M16 16v-8',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2l-.3-2.5H10.7l-.3 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.3 2.5h2.6l.3-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
};

function Icon({ name, size = 20, stroke, fill = 'none', strokeWidth = 1.8, style, className }) {
  const d = ICON_PATHS[name] || ICON_PATHS.help;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={stroke || 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

// ── Brand wordmark — plain text (logo removed per client; real logo TBD) ────
function Logo({ size = 17, onClick }) {
  return (
    <button className="hg-logo" onClick={onClick} aria-label="Housie Ghar home"
      style={{ fontSize: size }}>
      <span className="hg-logo-word">Housie <b>Ghar</b></span>
    </button>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
function Button({ children, variant = 'cta', size = 'md', icon, iconRight, full, onClick, disabled, style }) {
  return (
    <button className={`hg-btn hg-btn-${variant} hg-btn-${size}${full ? ' hg-btn-full' : ''}`}
      onClick={onClick} disabled={disabled} style={style}>
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 17} strokeWidth={2.2} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 20 : 17} strokeWidth={2.2} />}
    </button>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
function Badge({ tone = 'neutral', icon, children }) {
  return (
    <span className={`hg-badge hg-badge-${tone}`}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ booked, locked, capacity }) {
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
        <span>{booked + locked}<span className="hg-dim"> / {capacity} tickets</span></span>
        <span className="hg-prog-pct">{total}% full</span>
      </div>
    </div>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────
function useCountdown(targetTs) {
  const [now, setNow] = React.useState(Date.now());
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

function CountdownPills({ targetTs }) {
  const { h, m, s } = useCountdown(targetTs);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className="hg-countdown">
      {[['HRS', h], ['MIN', m], ['SEC', s]].map(([lbl, v], i) => (
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
function GameStatusBadge({ status }) {
  if (status === 'sold') return <Badge tone="dead" icon="x">Sold Out</Badge>;
  if (status === 'fast') return <Badge tone="hot" icon="flame">Fast Filling!</Badge>;
  if (status === 'filling') return <Badge tone="warm" icon="zap">Filling Fast</Badge>;
  return <Badge tone="open" icon="check">Open</Badge>;
}

// ── Housie ticket (3x9 grid, color-blind-safe marking) ───────────────────────
function HousieTicket({ ticket, drawn, compact, label }) {
  const drawnSet = drawn instanceof Set ? drawn : new Set(drawn || []);
  return (
    <div className={`hg-ticket${compact ? ' hg-ticket-compact' : ''}`}>
      {label && <div className="hg-ticket-tag">{label}</div>}
      <div className="hg-ticket-grid">
        {ticket.matrix.map((row, r) =>
          row.map((cell, c) => {
            const marked = cell != null && drawnSet.has(cell);
            return (
              <div key={`${r}-${c}`}
                className={`hg-cell${cell == null ? ' hg-cell-empty' : ''}${marked ? ' hg-cell-marked' : ''}`}
                style={marked ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}>
                {cell != null && <span>{cell}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Trust line — quiet inline chips ──────────────────────────────────────────
function TrustBadges() {
  return (
    <div className="hg-trust2">
      <span><Icon name="shieldCheck" size={15} /> Provably fair draws</span>
      <span><Icon name="wallet" size={15} /> Pay your agent directly</span>
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="hg-footer">
      <div className="hg-footer-mod">Powered by <strong>MOD</strong></div>
      <div className="hg-footer-sub">Mission for Operations &amp; Development · Shillong, Meghalaya</div>
    </footer>
  );
}

// ── Sticky top navigation ────────────────────────────────────────────────────
function TopNav({ go, current }) {
  const [open, setOpen] = React.useState(false);
  const items = [
    ['lobby', 'Games', 'grid'],
    ['winners', 'Winners', 'trophy'],
    ['how', 'How to Play', 'help'],
  ];
  return (
    <header className="hg-nav">
      <Logo onClick={() => go('lobby')} />
      <nav className="hg-nav-links">
        {items.map(([key, lbl, icon]) => (
          <button key={lbl} className={`hg-nav-link${current === key ? ' is-active' : ''}`}
            onClick={() => go(key)}>{lbl}</button>
        ))}
      </nav>
      <div className="hg-nav-right">
        <button className="hg-staff-btn" onClick={() => go('staff')} aria-label="Staff login" title="Staff login">
          <Icon name="lock" size={17} strokeWidth={2} />
        </button>
        <button className="hg-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          <Icon name={open ? 'x' : 'menu'} size={20} />
        </button>
      </div>
      {open && (
        <div className="hg-nav-sheet">
          {items.map(([key, lbl, icon]) => (
            <button key={lbl} className="hg-sheet-link" onClick={() => { go(key); setOpen(false); }}>
              <Icon name={icon} size={18} /> {lbl}
            </button>
          ))}
          <button className="hg-sheet-link" onClick={() => { go('staff'); setOpen(false); }}>
            <Icon name="lock" size={18} /> Staff Login
          </button>
        </div>
      )}
    </header>
  );
}

function money(n) { return '₹' + n.toLocaleString('en-IN'); }

Object.assign(window, {
  Icon, Logo, Button, Badge, ProgressBar, useCountdown, CountdownPills,
  GameStatusBadge, HousieTicket, TrustBadges, Footer, TopNav, money,
});
