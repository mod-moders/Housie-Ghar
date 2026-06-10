// app.jsx — Housie Ghar prototype root: routing, tweaks, design tokens

const ACCENTS = {
  pink:   { accent: 'oklch(0.67 0.25 354)', ink: '#fff',     soft: 'oklch(0.67 0.25 354 / 0.16)' },
  cyan:   { accent: 'oklch(0.74 0.13 205)', ink: '#06222b',  soft: 'oklch(0.74 0.13 205 / 0.16)' },
  violet: { accent: 'oklch(0.62 0.22 300)', ink: '#fff',     soft: 'oklch(0.62 0.22 300 / 0.16)' },
  gold:   { accent: 'oklch(0.80 0.16 85)',  ink: '#2a1e00',  soft: 'oklch(0.80 0.16 85 / 0.18)' },
};

const HEADER_FONTS = {
  'Space Grotesk': "'Space Grotesk', sans-serif",
  'Archivo': "'Archivo', sans-serif",
  'Bricolage': "'Bricolage Grotesque', sans-serif",
  'Outfit': "'Outfit', sans-serif",
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "accent": "pink",
  "headerFont": "Space Grotesk",
  "energy": 60,
  "radius": 16
}/*EDITMODE-END*/;

function App() {
  const { Lobby, GameRoom, BookingModal, LiveBoard, Winners, HowToPlay, StaffShell, TopNav, hgMakeTicket } = window;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ screen: 'lobby', gameId: null });
  const [booking, setBooking] = React.useState(null);
  const ticketCache = React.useRef({});
  const scrollRef = React.useRef(null);

  const getTicket = (n) => {
    if (!ticketCache.current[n]) ticketCache.current[n] = hgMakeTicket(n);
    return ticketCache.current[n];
  };

  const go = (screen, gameId = null) => {
    setRoute({ screen, gameId });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  const acc = ACCENTS[t.accent] || ACCENTS.pink;
  const glow = Math.max(0, Math.min(1, t.energy / 100));
  const rootStyle = {
    '--accent': acc.accent,
    '--accent-ink': acc.ink,
    '--accent-soft': acc.soft,
    '--glow': glow,
    '--energy': glow,
    '--radius': t.radius + 'px',
    '--radius-sm': Math.max(4, t.radius - 6) + 'px',
    '--radius-lg': (t.radius + 6) + 'px',
    '--font-head': HEADER_FONTS[t.headerFont] || HEADER_FONTS['Space Grotesk'],
  };

  const isStaff = route.screen === 'staff';
  const showChrome = !isStaff && route.screen !== 'live';

  let screen;
  if (route.screen === 'lobby') screen = <Lobby go={go} />;
  else if (route.screen === 'gameroom') screen = <GameRoom go={go} gameId={route.gameId} openBooking={setBooking} />;
  else if (route.screen === 'live') screen = <LiveBoard go={go} />;
  else if (route.screen === 'winners') screen = <Winners go={go} />;
  else if (route.screen === 'how') screen = <HowToPlay go={go} />;
  else if (route.screen === 'staff') screen = <StaffShell go={go} />;

  return (
    <div className="hg-root" data-theme={t.dark ? 'dark' : 'light'} style={rootStyle}>
      <div className={isStaff ? 'hg-stage hg-stage-wide' : 'hg-stage'}>
        <div className={isStaff ? 'hg-frame hg-frame-wide' : 'hg-frame'} ref={scrollRef}>
          {showChrome && <TopNav go={go} current={route.screen} />}
          {screen}
        </div>
      </div>

      {booking && (
        <BookingModal
          booking={booking}
          getTicket={getTicket}
          close={() => setBooking(null)}
          goLive={() => { setBooking(null); go('live'); }}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakColor label="Accent" value={t.accent}
          options={['pink', 'cyan', 'violet', 'gold']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Energy" />
        <TweakSlider label="Energy level" value={t.energy} min={0} max={100} unit="%"
          onChange={(v) => setTweak('energy', v)} />
        <TweakSection label="Shape & Type" />
        <TweakSlider label="Corner roundness" value={t.radius} min={0} max={22} unit="px"
          onChange={(v) => setTweak('radius', v)} />
        <TweakSelect label="Header font" value={t.headerFont}
          options={Object.keys(HEADER_FONTS)}
          onChange={(v) => setTweak('headerFont', v)} />
      </TweaksPanel>
    </div>
  );
}

// custom TweakColor swatches for named accents
const ACCENT_HEX = { pink: '#ec4899', cyan: '#22b8cf', violet: '#8b5cf6', gold: '#e0a500' };
const _origTweakColor = window.TweakColor;
window.TweakColor = function ({ label, value, options, onChange }) {
  if (options && typeof options[0] === 'string' && ACCENT_HEX[options[0]]) {
    return (
      <TweakRow label={label}>
        <div className="twk-chips" role="radiogroup">
          {options.map((key) => {
            const on = key === value;
            return (
              <button key={key} type="button" className="twk-chip" data-on={on ? '1' : '0'}
                style={{ background: ACCENT_HEX[key] }} onClick={() => onChange(key)} title={key}>
                {on && <svg viewBox="0 0 14 14"><path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" stroke="#fff" /></svg>}
              </button>
            );
          })}
        </div>
      </TweakRow>
    );
  }
  return _origTweakColor({ label, value, options, onChange });
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
