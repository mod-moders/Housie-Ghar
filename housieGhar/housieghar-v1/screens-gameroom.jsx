// screens-gameroom.jsx — Game Room (ticket grid + selection + booking handoff)

// Deterministic-ish ticket state map for a game
function buildTicketStates(game) {
  const states = new Array(game.capacity).fill('available');
  const idxs = [...Array(game.capacity).keys()];
  // shuffle with a fixed seed feel
  let seed = game.capacity * 7 + game.price;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
  idxs.slice(0, game.booked).forEach((i) => { states[i] = 'sold'; });
  idxs.slice(game.booked, game.booked + game.locked).forEach((i) => { states[i] = 'locked'; });
  return states;
}

const BANNED = ['idiot', 'fool', 'damn', 'hell', 'stupid'];
function validateName(name) {
  const v = name.trim();
  if (!v) return { ok: false, msg: '' };
  if (v.length < 3) return { ok: false, msg: 'At least 3 characters' };
  if (v.length > 18) return { ok: false, msg: 'Keep it under 18 characters' };
  if (/\s/.test(v)) return { ok: false, msg: 'No spaces — try an underscore' };
  if (BANNED.some((b) => v.toLowerCase().includes(b))) return { ok: false, msg: 'Keep it clean, please 😊' };
  return { ok: true, msg: 'Looking good!' };
}

function GameRoom({ go, gameId, openBooking }) {
  const { HG_GAMES, hgMakeTicket, HousieTicket, Icon, money, Button } = window;
  const game = HG_GAMES.find((g) => g.id === gameId) || HG_GAMES[0];
  const states = React.useMemo(() => buildTicketStates(game), [game.id]);
  const [selected, setSelected] = React.useState([]);
  const ticketCache = React.useRef({});
  const [name, setName] = React.useState('');
  const nameState = validateName(name);

  const getTicket = (n) => {
    if (!ticketCache.current[n]) ticketCache.current[n] = hgMakeTicket(n);
    return ticketCache.current[n];
  };

  const toggle = (n) => {
    const st = states[n - 1];
    if (st !== 'available') return;
    setSelected((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b));
  };

  const total = selected.length * game.price;
  const canBook = selected.length > 0 && nameState.ok;

  return (
    <div className="hg-screen hg-screen-room">
      {/* Room header */}
      <div className="hg-room-head">
        <button className="hg-back" onClick={() => go('lobby')} aria-label="Back to lobby">
          <Icon name="arrowL" size={20} />
        </button>
        <div className="hg-room-titles">
          <h1>{game.title}</h1>
          <span>{game.date} · {game.time} · {money(game.price)}/ticket</span>
        </div>
      </div>

      {/* Legend */}
      <div className="hg-legend">
        <span><i className="lg-dot lg-avail" />Available</span>
        <span><i className="lg-dot lg-lock"><Icon name="lock" size={9} strokeWidth={2.6} /></i>Locked</span>
        <span><i className="lg-dot lg-sold"><Icon name="x" size={9} strokeWidth={3} /></i>Sold</span>
        <span className="hg-legend-tip">Tap a number to preview its ticket</span>
      </div>

      {/* Number grid */}
      <div className="hg-numgrid">
        {Array.from({ length: game.capacity }, (_, i) => i + 1).map((n) => {
          const st = states[n - 1];
          const isSel = selected.includes(n);
          return (
            <button key={n}
              className={`hg-num hg-num-${st}${isSel ? ' is-sel' : ''}`}
              onClick={() => toggle(n)}
              disabled={st !== 'available'}>
              {st === 'locked'
                ? <Icon name="lock" size={13} strokeWidth={2.4} />
                : st === 'sold'
                  ? <span className="hg-num-sold">{n}</span>
                  : n}
              {st === 'locked' && <span className="hg-num-spin" />}
            </button>
          );
        })}
      </div>

      {/* Selected ticket previews */}
      {selected.length > 0 && (
        <div className="hg-previews">
          <div className="hg-previews-head">
            <h2 className="hg-section-title">Your tickets ({selected.length})</h2>
            <button className="hg-clear" onClick={() => setSelected([])}>Clear all</button>
          </div>
          <div className="hg-previews-scroll">
            {selected.map((n) => (
              <div key={n} className="hg-preview-item">
                <button className="hg-preview-x" onClick={() => toggle(n)} aria-label="Remove"><Icon name="x" size={13} strokeWidth={2.6} /></button>
                <HousieTicket ticket={getTicket(n)} label={`#${n}`} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* spacer so footer doesn't cover content */}
      <div style={{ height: selected.length > 0 ? 168 : 24 }} />

      {/* Sticky action footer */}
      {selected.length > 0 && (
        <div className="hg-action-foot">
          <div className="hg-name-field">
            <input
              className={`hg-name-input${name && !nameState.ok ? ' is-bad' : ''}${nameState.ok ? ' is-good' : ''}`}
              placeholder="Your Housie name (e.g. MomoMaster99)"
              value={name} maxLength={18}
              onChange={(e) => setName(e.target.value)} />
            <span className={`hg-name-hint${nameState.ok ? ' is-good' : ' is-bad'}`}>
              {name ? nameState.msg : 'Pick a fun local nickname — builds the hall spirit!'}
            </span>
          </div>
          <div className="hg-action-row">
            <div className="hg-total">
              <span className="hg-dim">{selected.length} × {money(game.price)}</span>
              <strong>{money(total)}</strong>
            </div>
            <Button variant="cta" size="lg" disabled={!canBook} icon="ticket"
              onClick={() => openBooking({ game, tickets: selected, name: name.trim() })}>
              Book Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { GameRoom });
