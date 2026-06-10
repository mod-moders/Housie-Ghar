// screens-staff.jsx — Staff backend: login gate + unified dashboard shell + sections

function StaffLogin({ onLogin, go }) {
  const { Icon, Logo, Button } = window;
  const [step, setStep] = React.useState('creds'); // creds → otp
  const [user, setUser] = React.useState('superadmin');
  const [pass, setPass] = React.useState('Housie@2026');
  const [otp, setOtp] = React.useState('');

  return (
    <div className="hg-staff-login">
      <button className="hg-back hg-back-float" onClick={() => go('lobby')}><Icon name="arrowL" size={20} /></button>
      <div className="hg-login-card">
        <div className="hg-login-brand"><Logo size={20} /></div>
        <div className="hg-login-secure"><Icon name="shield" size={13} /> Secure staff portal</div>
        {step === 'creds' ? (
          <>
            <h1 className="hg-login-title">Sign in to continue</h1>
            <label className="hg-login-field">
              <span>Staff ID</span>
              <input value={user} onChange={(e) => setUser(e.target.value)} />
            </label>
            <label className="hg-login-field">
              <span>Password</span>
              <input type="text" value={pass} placeholder="••••••••" onChange={(e) => setPass(e.target.value)} />
            </label>
            <Button variant="cta" size="lg" full onClick={() => setStep('otp')}>Continue</Button>
            <div className="hg-login-cred">
              <span>Demo access</span>
              <span>ID: <code>superadmin</code> · Password: <code>Housie@2026</code></span>
            </div>
          </>
        ) : (
          <>
            <h1 className="hg-login-title">Verify it's you</h1>
            <p className="hg-login-otp-sub">We sent a 6-digit code to your registered number ending ••2303.</p>
            <input className="hg-otp-input" value={otp} maxLength={6} placeholder="• • • • • •"
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
            <Button variant="cta" size="lg" full onClick={onLogin}>Verify &amp; enter</Button>
            <div className="hg-login-cred"><span>Demo code: <code>482193</code> (any 6 digits work)</span></div>
            <button className="hg-link-btn" onClick={() => setStep('creds')}>Back</button>
          </>
        )}
      </div>
      <div className="hg-login-foot">Powered by <strong>MOD</strong></div>
    </div>
  );
}

const ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'cfo', label: 'Financial Officer' },
  { key: 'operator', label: 'Operator' },
  { key: 'bookie', label: 'Bookie' },
];

const NAV_BY_ROLE = {
  admin: [['overview', 'Dashboard', 'chart'], ['games', 'Games', 'grid'], ['filling', 'Filling Status', 'ticket'], ['staff', 'Workforce', 'users'], ['audit', 'Audit Log', 'shield']],
  cfo: [['finance', 'Finance Hub', 'wallet'], ['ledger', 'Bookie Ledger', 'chart'], ['filling', 'Filling Status', 'ticket'], ['audit', 'Audit Log', 'shield']],
  operator: [['hud', 'Live HUD', 'play'], ['overflow', 'Overflow Queue', 'bell'], ['filling', 'Filling Status', 'ticket']],
  bookie: [['queue', 'Booking Queue', 'bell'], ['wallet', 'My Wallet', 'wallet'], ['filling', 'Filling Status', 'ticket']],
};

function StaffDashboard({ go }) {
  const { Icon, money, Logo, STAFF_KPIS } = window;
  const [role, setRole] = React.useState('admin');
  const nav = NAV_BY_ROLE[role];
  const [section, setSection] = React.useState(nav[0][0]);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => { setSection(NAV_BY_ROLE[role][0][0]); }, [role]);

  const isFinance = role === 'cfo';

  return (
    <div className="hg-dash">
      {/* sidebar */}
      <aside className={`hg-side${collapsed ? ' is-collapsed' : ''}`}>
        <div className="hg-side-brand"><Logo size={18} /></div>
        <nav className="hg-side-nav">
          {nav.map(([key, lbl, ic]) => (
            <button key={key} className={`hg-side-link${section === key ? ' is-active' : ''}`} onClick={() => setSection(key)}>
              <Icon name={ic} size={18} /> <span>{lbl}</span>
            </button>
          ))}
        </nav>
        <div className="hg-side-foot">
          <button className="hg-side-link" onClick={() => go('lobby')}><Icon name="arrowL" size={18} /> <span>Exit to site</span></button>
          <div className="hg-side-mod">Powered by MOD</div>
        </div>
      </aside>

      {/* main column */}
      <div className="hg-dash-main">
        {/* status bar */}
        <header className={`hg-statusbar${isFinance ? ' is-finance' : ''}`}>
          <button className="hg-side-toggle" onClick={() => setCollapsed((c) => !c)}><Icon name="menu" size={18} /></button>
          {isFinance ? (
            <div className="hg-fin-hud">
              <div className="hg-fin-stat"><span>Platform Liability</span><b>{money(STAFF_KPIS.liability)}</b></div>
              <div className="hg-fin-stat"><span>Daily Gross</span><b>{money(STAFF_KPIS.grossToday)}</b></div>
              <div className="hg-fin-stat is-alert"><span>Pending Recharges</span><b>{STAFF_KPIS.pendingRecharges}</b></div>
            </div>
          ) : (
            <div className="hg-status-title">{(nav.find((n) => n[0] === section) || nav[0])[1]}</div>
          )}
          <div className="hg-status-right">
            <select className="hg-role-switch" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>View as: {r.label}</option>)}
            </select>
            <div className="hg-status-user"><span className="hg-avatar-sm">R</span></div>
          </div>
        </header>

        {/* content */}
        <main className="hg-dash-content">
          <StaffSection role={role} section={section} setSection={setSection} />
        </main>
      </div>
    </div>
  );
}

function StaffShell({ go }) {
  const [authed, setAuthed] = React.useState(false);
  return authed
    ? <StaffDashboard go={go} />
    : <StaffLogin go={go} onLogin={() => setAuthed(true)} />;
}

Object.assign(window, { StaffShell });
