// screens-live.jsx — Live Execution Board (automated draw)

function LiveBoard({ go }) {
  const { hgShuffledSequence, hgMakeTicket, HG_LIVE_PRIZES, HousieTicket, Icon, money, Button } = window;
  const seq = React.useMemo(() => hgShuffledSequence(), []);
  const myTickets = React.useMemo(() => [hgMakeTicket(42), hgMakeTicket(207)], []);

  const [count, setCount] = React.useState(8);       // numbers drawn so far
  const [revealed, setRevealed] = React.useState(true);
  const [muted, setMuted] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [reactions, setReactions] = React.useState([]);
  const [winOverlay, setWinOverlay] = React.useState(null);
  const [prizes, setPrizes] = React.useState(HG_LIVE_PRIZES);
  const audioCtx = React.useRef(null);

  const drawn = React.useMemo(() => new Set(seq.slice(0, count)), [count, seq]);
  const current = seq[count - 1];
  const recent = seq.slice(Math.max(0, count - 6), count).reverse();

  // mock prize claims as the game progresses
  const claimSchedule = React.useRef({
    12: { idx: 1, winner: 'Pemzy_Gangtok', ticket: 88 },   // Top Line
    18: { idx: 2, winner: 'KalimpongKing', ticket: 31 },   // Middle Line
    26: { idx: 3, winner: 'MomoMaster99', ticket: 42 },    // Bottom Line (mine!)
  });

  const beep = React.useCallback(() => {
    if (muted) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.2);
    } catch (e) { /* ignore */ }
  }, [muted]);

  // The draw loop with audio-tease (audio first, number reveals ~1.2s later)
  React.useEffect(() => {
    if (paused || winOverlay || count >= 90) return;
    const id = setTimeout(() => {
      const next = count + 1;
      // tease: hide number, play audio, reveal after 1200ms
      setRevealed(false);
      beep();
      setTimeout(() => setRevealed(true), 1200);
      setCount(next);
      // check claims
      const claim = claimSchedule.current[next];
      if (claim) {
        setPrizes((prev) => prev.map((p, i) => i === claim.idx ? { ...p, winner: claim.winner, ticket: claim.ticket } : p));
        setTimeout(() => {
          setWinOverlay({ ...prizes[claim.idx], winner: claim.winner, ticket: claim.ticket });
          setTimeout(() => setWinOverlay(null), 4000);
        }, 1400);
      }
    }, 4200);
    return () => clearTimeout(id);
  }, [count, paused, winOverlay, beep]);

  const react = (emoji) => {
    const id = Math.random();
    setReactions((r) => [...r, { id, emoji, x: 8 + Math.random() * 70 }]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2600);
  };

  return (
    <div className="hg-screen hg-live">
      {/* top bar */}
      <div className="hg-live-top">
        <button className="hg-back" onClick={() => go('lobby')}><Icon name="arrowL" size={20} /></button>
        <div className="hg-live-title">
          <span className="hg-live-badge"><span className="hg-live-dot" /> LIVE</span>
          Sunday Mega Draw
        </div>
        <button className="hg-mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'volumeX' : 'volume'} size={18} />
        </button>
      </div>

      <div className="hg-wakelock"><Icon name="zap" size={11} strokeWidth={2.4} /> Screen kept awake during the draw</div>

      {/* Tambola cage / current number */}
      <div className="hg-cage">
        <div className="hg-cage-ring" aria-hidden="true" />
        <div className={`hg-cage-num${revealed ? ' is-revealed' : ' is-teasing'}`}>
          {revealed ? current : <span className="hg-cage-dots"><i /><i /><i /></span>}
        </div>
        <div className="hg-cage-cap">{revealed ? 'Number called' : 'Caller is teasing…'}</div>
      </div>

      {/* recent calls */}
      <div className="hg-recent">
        {recent.map((n, i) => (
          <span key={n} className={`hg-recent-chip${i === 0 ? ' is-now' : ''}`}
            style={i === 0 ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--ink)' } : undefined}>{n}</span>
        ))}
        <span className="hg-recent-count">{count}/90 called</span>
      </div>

      {/* prize board */}
      <div className="hg-prizeboard">
        <h2 className="hg-section-title">Prizes</h2>
        <div className="hg-prizeboard-grid">
          {prizes.map((p) => (
            <div key={p.label} className={`hg-prize-row${p.winner ? ' is-won' : ''}`}>
              <div className="hg-prize-l">
                <span className="hg-prize-name">{p.label}</span>
                <span className="hg-prize-amt">{money(p.amount)}</span>
              </div>
              <div className="hg-prize-r">
                {p.winner
                  ? <><span className="hg-prize-winner">{p.winner}</span><span className="hg-prize-tk">#{p.ticket}</span></>
                  : <span className="hg-prize-open">Open</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* my auto-marked tickets */}
      <div className="hg-mytickets">
        <h2 className="hg-section-title">Your tickets · auto-marked</h2>
        <div className="hg-mytickets-row">
          {myTickets.map((t, i) => (
            <HousieTicket key={i} ticket={t} drawn={drawn} label={`#${[42, 207][i]}`} compact />
          ))}
        </div>
      </div>

      {/* number board 1-90 */}
      <div className="hg-board90">
        {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
          <span key={n} className={`hg-b90${drawn.has(n) ? ' is-called' : ''}${n === current && revealed ? ' is-current' : ''}`}
            style={n === current && revealed ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : undefined}>{n}</span>
        ))}
      </div>

      <div style={{ height: 80 }} />

      {/* emoji reaction bar */}
      <div className="hg-emoji-bar">
        {['🎉', '🔥', '👏', '😮', '🍀', '❤️'].map((e) => (
          <button key={e} className="hg-emoji-btn" onClick={() => react(e)}>{e}</button>
        ))}
      </div>

      {/* floating reactions */}
      <div className="hg-reactions" aria-hidden="true">
        {reactions.map((r) => (
          <span key={r.id} className="hg-react-float" style={{ left: `${r.x}%` }}>{r.emoji}</span>
        ))}
      </div>

      {/* win celebration overlay (pop-art) */}
      {winOverlay && (
        <div className="hg-win-overlay">
          <div className="hg-win-burst" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}
          </div>
          <div className="hg-win-card">
            <div className="hg-win-label">{winOverlay.label}!</div>
            <div className="hg-win-name">{winOverlay.winner}</div>
            <div className="hg-win-sub">Ticket #{winOverlay.ticket} · {money(winOverlay.amount)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { LiveBoard });
