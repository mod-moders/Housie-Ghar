// screens-extra.jsx — Winners Hall of Fame + How to Play

function Winners({ go }) {
  const { HG_WINNERS, Icon, money, Footer } = window;
  const [top1, top2, top3, ...rest] = HG_WINNERS;
  const podium = [top2, top1, top3]; // visual order: 2 - 1 - 3

  return (
    <div className="hg-screen">
      <div className="hg-page-head">
        <span className="hg-page-kicker"><Icon name="trophy" size={14} /> HALL OF FAME</span>
        <h1 className="hg-page-title">Our Greatest Winners</h1>
        <p className="hg-page-sub">The sharpest daubers in the hills. Ranked by total wins.</p>
      </div>

      {/* podium */}
      <div className="hg-podium">
        {podium.map((w, i) => {
          const rank = w === top1 ? 1 : w === top2 ? 2 : 3;
          return (
            <div key={w.name} className={`hg-pod hg-pod-${rank}`}>
              <div className="hg-pod-medal">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</div>
              <div className="hg-pod-avatar">{w.name[0]}</div>
              <div className="hg-pod-name">{w.name}</div>
              <div className="hg-pod-town">{w.town}</div>
              <div className="hg-pod-wins">{w.wins}<span> wins</span></div>
              <div className="hg-pod-bar" />
            </div>
          );
        })}
      </div>

      {/* rest of leaderboard */}
      <div className="hg-leaderboard">
        {rest.map((w, i) => (
          <div key={w.name} className="hg-lb-row">
            <span className="hg-lb-rank">{i + 4}</span>
            <span className="hg-lb-avatar">{w.name[0]}</span>
            <div className="hg-lb-info">
              <strong>{w.name}</strong>
              <span>{w.town} · biggest win {money(w.biggest)}</span>
            </div>
            <span className="hg-lb-wins">{w.wins}<i>wins</i></span>
          </div>
        ))}
      </div>

      <Footer />
    </div>
  );
}

function HowToPlay({ go }) {
  const { Icon, Button, Footer, TrustBadges } = window;
  const steps = [
    { ic: 'grid', t: 'Pick a game', d: 'Browse the lobby, check the prize pool and start time, then open a game with tickets still available.' },
    { ic: 'ticket', t: 'Choose your tickets', d: 'Tap any open number to preview its housie ticket. Select as many as you like and enter a fun Housie name.' },
    { ic: 'lock', t: 'Reserve & pay your agent', d: 'Tap Book Now — your tickets lock for 10 minutes and we route you to a local agent on WhatsApp. Pay them directly via UPI.' },
    { ic: 'check', t: 'Get confirmed', d: 'The moment your agent confirms, your digital tickets appear. No refresh needed — we poll for you.' },
    { ic: 'play', t: 'Play live', d: 'When the draw begins, numbers are called automatically with local-dialect audio. Your tickets mark themselves — just watch and cheer!' },
    { ic: 'trophy', t: 'Win prizes', d: 'Quick 5, Lines, Lucky Corners and the Full House are detected instantly and split fairly on a tie. Winners light up the board.' },
  ];
  const patterns = [
    { t: 'Quick 5', d: 'First to mark any 5 numbers' },
    { t: 'Top / Middle / Bottom Line', d: 'All 5 numbers in a row' },
    { t: 'Lucky 4 Corners', d: 'The four corner numbers' },
    { t: 'Full House', d: 'All 15 numbers on your ticket' },
  ];

  return (
    <div className="hg-screen">
      <div className="hg-page-head">
        <span className="hg-page-kicker"><Icon name="help" size={14} /> HOW TO PLAY</span>
        <h1 className="hg-page-title">Six steps to your first win</h1>
        <p className="hg-page-sub">Housie (Tambola) the easy way — book on WhatsApp, play automatically.</p>
      </div>

      <div className="hg-steps">
        {steps.map((s, i) => (
          <div key={s.t} className="hg-step">
            <div className="hg-step-num">{i + 1}</div>
            <div className="hg-step-ic"><Icon name={s.ic} size={20} /></div>
            <div className="hg-step-body">
              <strong>{s.t}</strong>
              <p>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="hg-patterns">
        <h2 className="hg-section-title">Winning patterns</h2>
        <div className="hg-patterns-grid">
          {patterns.map((p) => (
            <div key={p.t} className="hg-pattern">
              <strong>{p.t}</strong>
              <span>{p.d}</span>
            </div>
          ))}
        </div>
      </div>

      <TrustBadges />
      <div className="hg-cta-block">
        <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => go('lobby')}>Browse games</Button>
      </div>
      <Footer />
    </div>
  );
}

Object.assign(window, { Winners, HowToPlay });
