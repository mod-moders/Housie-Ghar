// screens-staff2.jsx — staff dashboard section content

function EmptyHint({ icon, title, sub, cta }) {
  const { Icon } = window;
  return (
    <div className="hg-empty">
      <div className="hg-empty-ic"><Icon name={icon} size={26} /></div>
      <strong>{title}</strong>
      <span>{sub}</span>
      {cta && <button className="hg-empty-cta">{cta}</button>}
    </div>
  );
}

function KpiCard({ label, value, sub, tone }) {
  return (
    <div className={`hg-kpi${tone ? ' hg-kpi-' + tone : ''}`}>
      <span className="hg-kpi-label">{label}</span>
      <b className="hg-kpi-value">{value}</b>
      {sub && <span className="hg-kpi-sub">{sub}</span>}
    </div>
  );
}

function fillPct(g) { return Math.round(((g.sold + g.locked) / g.cap) * 100); }

function StaffSection({ role, section }) {
  const { Icon, money, STAFF_KPIS, BOOKIES, RECHARGE_QUEUE, BOOKIE_QUEUE, AUDIT, GAMES_ADMIN } = window;

  // ── Admin overview ──
  if (section === 'overview') {
    return (
      <div className="hg-sec">
        <div className="hg-kpi-grid">
          <KpiCard label="Gross processed today" value={money(STAFF_KPIS.grossToday)} sub="+12% vs yesterday" tone="good" />
          <KpiCard label="Platform liability" value={money(STAFF_KPIS.liability)} sub="Across 5 bookie wallets" />
          <KpiCard label="Tickets sold" value={STAFF_KPIS.ticketsSold.toLocaleString('en-IN')} sub="Today" />
          <KpiCard label="Pending recharges" value={STAFF_KPIS.pendingRecharges} sub="Awaiting approval" tone="alert" />
        </div>
        <div className="hg-panel">
          <div className="hg-panel-head"><h3>Live & upcoming games</h3><button className="hg-btn hg-btn-cta hg-btn-sm"><Icon name="grid" size={15} strokeWidth={2.2} /><span>Create Game</span></button></div>
          <GamesTable games={GAMES_ADMIN} />
        </div>
      </div>
    );
  }

  // ── Games management ──
  if (section === 'games') {
    return (
      <div className="hg-sec">
        <div className="hg-sec-head">
          <p className="hg-sec-sub">Schedule, start, pause or stop any game.</p>
          <button className="hg-btn hg-btn-cta hg-btn-sm"><Icon name="grid" size={15} strokeWidth={2.2} /><span>Create Game</span></button>
        </div>
        <div className="hg-panel"><GamesTable games={GAMES_ADMIN} controls /></div>
      </div>
    );
  }

  // ── Filling status (shared widget) ──
  if (section === 'filling') {
    return (
      <div className="hg-sec">
        <p className="hg-sec-sub">Real-time fill rate across all scheduled games.</p>
        <div className="hg-fill-grid">
          {GAMES_ADMIN.map((g) => {
            const pct = fillPct(g);
            return (
              <div key={g.id} className="hg-fill-card">
                <div className="hg-fill-top">
                  <strong>{g.title}</strong>
                  <span className={`hg-pill hg-pill-${g.status.toLowerCase()}`}>{g.status}</span>
                </div>
                <div className="hg-fill-meta">{g.time} · {g.sold + g.locked}/{g.cap} tickets</div>
                <div className="hg-fill-bar"><i style={{ width: pct + '%' }} className={pct >= 80 ? 'is-hot' : ''} /></div>
                <div className="hg-fill-pct">{pct}% full</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Workforce ──
  if (section === 'staff') {
    return (
      <div className="hg-sec">
        <div className="hg-sec-head">
          <p className="hg-sec-sub">Provision Admins, Operators and Bookies.</p>
          <button className="hg-btn hg-btn-cta hg-btn-sm"><Icon name="users" size={15} strokeWidth={2.2} /><span>Add Staff</span></button>
        </div>
        <div className="hg-panel">
          <div className="hg-table">
            <div className="hg-tr hg-tr-head"><span>Bookie</span><span>Town</span><span>Wallet</span><span>Lifetime</span><span>Status</span></div>
            {BOOKIES.map((b) => (
              <div key={b.name} className="hg-tr">
                <span className="hg-td-name"><span className="hg-avatar-sm">{b.name[0]}</span>{b.name}</span>
                <span className="hg-dim">{b.town}</span>
                <span className={b.low ? 'hg-bad-amt' : ''}>{money(b.balance)}</span>
                <span className="hg-dim">{money(b.lifetime)}</span>
                <span><span className="hg-pill hg-pill-active">Active</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Audit log ──
  if (section === 'audit') {
    return (
      <div className="hg-sec">
        <p className="hg-sec-sub">Immutable record of every staff action.</p>
        <div className="hg-panel">
          <div className="hg-audit">
            {AUDIT.map((a, i) => (
              <div key={i} className="hg-audit-row">
                <span className="hg-avatar-sm">{a.who[0].toUpperCase()}</span>
                <div className="hg-audit-body">
                  <div><b>{a.who}</b> {a.action}</div>
                  <span className="hg-dim">{a.target} · {a.ip} · {a.when}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── CFO Finance Hub (split-screen queue) ──
  if (section === 'finance') return <FinanceHub />;
  if (section === 'ledger') {
    return (
      <div className="hg-sec">
        <p className="hg-sec-sub">Macro-view of the entire sales force.</p>
        <div className="hg-panel">
          <div className="hg-table">
            <div className="hg-tr hg-tr-head"><span>Bookie</span><span>Balance</span><span>Lifetime top-ups</span><span>Last recharge</span><span>Trust</span></div>
            {BOOKIES.map((b) => (
              <div key={b.name} className={`hg-tr${b.low ? ' is-low' : ''}`}>
                <span className="hg-td-name"><span className="hg-avatar-sm">{b.name[0]}</span>{b.name}</span>
                <span className={b.low ? 'hg-bad-amt' : ''}>{money(b.balance)}{b.low && <i className="hg-low-tag">LOW</i>}</span>
                <span className="hg-dim">{money(b.lifetime)}</span>
                <span className="hg-dim">{b.last}</span>
                <span><span className={`hg-pill hg-pill-${b.trust.toLowerCase()}`}>{b.trust}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Operator HUD ──
  if (section === 'hud') return <OperatorHud />;
  if (section === 'overflow') {
    return (
      <div className="hg-sec">
        <p className="hg-sec-sub">Bookie overflow failsafe — bookings routed to you when no agent has wallet balance.</p>
        <EmptyHint icon="bell" title="No overflow bookings right now" sub="When every bookie is low on funds, the player's request lands here. Verify their UPI payment, then Force Confirm." />
      </div>
    );
  }

  // ── Bookie queue ──
  if (section === 'queue') return <BookieQueue />;
  if (section === 'wallet') return <BookieWallet />;

  return null;
}

function GamesTable({ games, controls }) {
  const { Icon } = window;
  return (
    <div className="hg-table">
      <div className="hg-tr hg-tr-head"><span>Game</span><span>Time</span><span>Fill</span><span>Status</span>{controls && <span>Controls</span>}</div>
      {games.map((g) => {
        const pct = fillPct(g);
        return (
          <div key={g.id} className="hg-tr">
            <span className="hg-td-name">#{g.id} · {g.title}</span>
            <span className="hg-dim">{g.time}</span>
            <span className="hg-td-fill"><i className="hg-mini-bar"><b style={{ width: pct + '%' }} /></i>{pct}%</span>
            <span><span className={`hg-pill hg-pill-${g.status.toLowerCase()}`}>{g.status}</span></span>
            {controls && (
              <span className="hg-row-ctrls">
                <button className="hg-ic-btn" title="Start"><Icon name="play" size={14} /></button>
                <button className="hg-ic-btn" title="Pause"><Icon name="pause" size={14} /></button>
                <button className="hg-ic-btn" title="Reshuffle"><Icon name="refresh" size={14} /></button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FinanceHub() {
  const { Icon, money, RECHARGE_QUEUE, BOOKIES } = window;
  const [sel, setSel] = React.useState(0);
  const [queue, setQueue] = React.useState(RECHARGE_QUEUE);
  const active = queue[sel];
  const bookie = active ? BOOKIES.find((b) => b.name === active.bookie) : null;
  const resolve = (approve) => {
    setQueue((q) => q.filter((_, i) => i !== sel));
    setSel(0);
  };
  return (
    <div className="hg-sec">
      <div className="hg-split">
        <div className="hg-split-l">
          <div className="hg-split-head">Pending requests <span className="hg-q-count">{queue.length}</span></div>
          {queue.length === 0 && <EmptyHint icon="check" title="Queue clear" sub="All recharge requests processed." />}
          {queue.map((r, i) => (
            <button key={r.id} className={`hg-q-card${i === sel ? ' is-active' : ''}`} onClick={() => setSel(i)}>
              <div className="hg-q-top"><b>{r.bookie}</b><span className="hg-q-amt">{money(r.amount)}</span></div>
              <div className="hg-q-meta">{r.id} · {r.ref} · {r.when}</div>
            </button>
          ))}
        </div>
        <div className="hg-split-r">
          {active ? (
            <>
              <div className="hg-detail-head">
                <span className="hg-avatar-lg">{active.bookie[0]}</span>
                <div><b>{active.bookie}</b><span>{bookie?.town} · Trust: {bookie?.trust}</span></div>
              </div>
              <div className="hg-detail-grid">
                <div><span>Requested</span><b>{money(active.amount)}</b></div>
                <div><span>Current balance</span><b>{money(bookie?.balance || 0)}</b></div>
                <div><span>Lifetime top-ups</span><b>{money(bookie?.lifetime || 0)}</b></div>
                <div><span>Reference</span><b>{active.ref}</b></div>
              </div>
              <div className="hg-detail-note">Verify the deposit in your banking app, then credit the wallet. Action is logged for the Superadmin.</div>
              <div className="hg-detail-actions">
                <button className="hg-fin-approve" onClick={() => resolve(true)}><Icon name="check" size={17} strokeWidth={2.6} /> Credit Wallet {money(active.amount)}</button>
                <button className="hg-fin-reject" onClick={() => resolve(false)}><Icon name="x" size={17} strokeWidth={2.6} /> Reject / Dispute</button>
              </div>
            </>
          ) : <EmptyHint icon="wallet" title="Select a request" sub="Pick a pending recharge to review the bookie's ledger." />}
        </div>
      </div>
    </div>
  );
}

function OperatorHud() {
  const { Icon, money } = window;
  const [speed, setSpeed] = React.useState(8);
  const [running, setRunning] = React.useState(true);
  return (
    <div className="hg-sec">
      <div className="hg-hud-grid">
        <div className="hg-hud-main">
          <div className="hg-hud-game">Tea-Time Tambola · <span className="hg-pill hg-pill-live">LIVE</span></div>
          <div className="hg-hud-num">{running ? 47 : '—'}</div>
          <div className="hg-hud-sub">24 of 90 numbers called</div>
          <div className="hg-hud-controls">
            <button className={`hg-hud-btn${running ? ' is-on' : ''}`} onClick={() => setRunning((r) => !r)}>
              <Icon name={running ? 'pause' : 'play'} size={18} /> {running ? 'Pause draw' : 'Resume draw'}
            </button>
            <button className="hg-hud-btn hg-hud-stop"><Icon name="x" size={18} /> Stop</button>
          </div>
          <div className="hg-speed">
            <div className="hg-speed-lbl"><span>Call speed</span><b>{speed}s interval</b></div>
            <input type="range" min={5} max={12} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="hg-speed-range" />
            <div className="hg-speed-ends"><span>Fast 5s</span><span>Slow 12s</span></div>
          </div>
        </div>
        <div className="hg-hud-side">
          <KpiCard label="Tickets sold" value="146 / 300" sub="49% full" />
          <KpiCard label="Prize pool" value={money(13000)} />
          <div className="hg-ghost-note"><Icon name="shield" size={14} /> Ghost-Host auto-resume is armed. If you disconnect, the draw continues on its own.</div>
        </div>
      </div>
    </div>
  );
}

function BookieQueue() {
  const { Icon, money, BOOKIE_QUEUE } = window;
  const [queue, setQueue] = React.useState(BOOKIE_QUEUE);
  const [copied, setCopied] = React.useState(null);
  const act = (id) => setQueue((q) => q.filter((x) => x.id !== id));
  return (
    <div className="hg-sec">
      <p className="hg-sec-sub">Round-robin booking requests routed to you. 10-minute timer per request.</p>
      {queue.length === 0 && <EmptyHint icon="bell" title="No active requests" sub="New bookings will appear here with a sound ping." />}
      <div className="hg-bq-list">
        {queue.map((r) => (
          <div key={r.id} className="hg-bq-card">
            <div className="hg-bq-top">
              <div><b>{r.name}</b><span className="hg-bq-game">{r.game}</span></div>
              <div className="hg-bq-timer"><Icon name="clock" size={13} /> 9:4{r.left % 10}</div>
            </div>
            <div className="hg-bq-tickets">Tickets {r.tickets.map((t) => '#' + t).join(', ')} · <b>{money(r.amount)}</b></div>
            <div className="hg-bq-actions">
              <button className="hg-bq-copy" onClick={() => { setCopied(r.id); setTimeout(() => setCopied(null), 1500); }}>
                <Icon name="chat" size={15} /> {copied === r.id ? 'Copied!' : 'Copy WhatsApp reply'}
              </button>
              <button className="hg-bq-confirm" onClick={() => act(r.id)}><Icon name="check" size={15} strokeWidth={2.6} /> Confirm</button>
              <button className="hg-bq-cancel" onClick={() => act(r.id)}><Icon name="x" size={15} strokeWidth={2.6} /> Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookieWallet() {
  const { Icon, money } = window;
  const [requested, setRequested] = React.useState(false);
  return (
    <div className="hg-sec">
      <div className="hg-wallet-card">
        <span className="hg-wallet-lbl">Digital wallet balance</span>
        <b className="hg-wallet-bal">{money(320)}</b>
        <div className="hg-wallet-low"><Icon name="bell" size={13} /> Low balance — top up before the 8:00 PM game to keep receiving bookings.</div>
        <button className="hg-wallet-btn" onClick={() => setRequested(true)}>
          <Icon name="chat" size={17} /> {requested ? 'Request sent — opening WhatsApp…' : 'Request funds from Financial Officer'}
        </button>
      </div>
      <div className="hg-fomo"><Icon name="zap" size={15} /> <div><b>You missed 1 booking today</b><span>Your wallet was too low. Recharge to resume sales.</span></div></div>
    </div>
  );
}

Object.assign(window, { StaffSection });
