// screens-lobby.jsx — Landing page / public lobby

function GameCard({ game, go }) {
  const { money, ProgressBar, GameStatusBadge, Button, Icon } = window;
  const sold = game.status === 'sold';
  const top = game.prizes[0];
  return (
    <article className={`hg-card${sold ? ' is-sold' : ''}`}>
      {sold && <div className="hg-sold-stamp"><span>SOLD OUT</span></div>}
      <div className="hg-card-head">
        <div>
          <h3 className="hg-card-title">{game.title}</h3>
          <div className="hg-card-when">
            <Icon name="clock" size={13} strokeWidth={2} />
            {game.date} · {game.time}
          </div>
        </div>
        <GameStatusBadge status={game.status} />
      </div>

      <div className="hg-card-prizepool">
        <div className="hg-pp-hero">
          <span className="hg-pp-label">{top.label}</span>
          <span className="hg-pp-amt">{money(top.amount)}</span>
        </div>
        <div className="hg-pp-rest">
          {game.prizes.slice(1, 4).map((p) => (
            <div key={p.label} className="hg-pp-chip">
              <span>{p.label}</span><b>{money(p.amount)}</b>
            </div>
          ))}
          {game.prizes.length > 4 && <div className="hg-pp-more">+{game.prizes.length - 4} more</div>}
        </div>
      </div>

      <ProgressBar booked={game.booked} locked={game.locked} capacity={game.capacity} />

      <div className="hg-card-foot">
        <div className="hg-card-price">
          <span className="hg-dim">Ticket</span>
          <strong>{money(game.price)}</strong>
        </div>
        {sold
          ? <Button variant="ghost" size="md" disabled>Sold Out</Button>
          : <Button variant="cta" size="md" iconRight="chevR" onClick={() => go('gameroom', game.id)}>Get Tickets</Button>}
      </div>
    </article>
  );
}

function Lobby({ go }) {
  const { HG_GAMES, CountdownPills, TrustBadges, Footer, money, Icon, Button } = window;
  const featured = HG_GAMES.find((g) => g.featured) || HG_GAMES[0];

  return (
    <div className="hg-screen">
      {/* Hero */}
      <section className="hg-hero">
        <div className="hg-hero-glow" aria-hidden="true" />
        <div className="hg-hero-inner">
          <div className="hg-hero-kicker">
            <span className="hg-live-dot" /> NEXT DRAW STARTS IN
          </div>
          <h1 className="hg-hero-title">{featured.title}</h1>
          <div className="hg-hero-when">{featured.date} · {featured.time}</div>
          <CountdownPills targetTs={featured.startsAt} />
          <div className="hg-hero-stats">
            <div><b>{money(featured.prizes[0].amount)}</b><span>Full House</span></div>
            <div className="hg-hero-div" />
            <div><b>{money(featured.price)}</b><span>per ticket</span></div>
            <div className="hg-hero-div" />
            <div><b>{featured.capacity - featured.booked - featured.locked}</b><span>tickets left</span></div>
          </div>
          <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => go('gameroom', featured.id)}>
            Pick Your Tickets
          </Button>
        </div>
      </section>

      <TrustBadges />

      {/* Games feed */}
      <section className="hg-feed">
        <div className="hg-feed-head">
          <h2 className="hg-section-title">Upcoming Games</h2>
          <span className="hg-feed-count">{HG_GAMES.length} live now</span>
        </div>
        <div className="hg-feed-list">
          {HG_GAMES.map((g) => <GameCard key={g.id} game={g} go={go} />)}
        </div>
      </section>

      <Footer />
    </div>
  );
}

Object.assign(window, { Lobby });
