// screens-booking.jsx — Soft-lock modal, WhatsApp P2P handoff, polling, success

function BookingModal({ booking, close, getTicket, goLive }) {
  const { game, tickets, name } = booking;
  const { Icon, money, Button, HousieTicket } = window;
  const [phase, setPhase] = React.useState('lock'); // lock → confirmed
  const [secs, setSecs] = React.useState(600); // 10:00
  const [polls, setPolls] = React.useState(0);
  const bookingId = React.useMemo(() => 'HG' + Math.floor(100000 + Math.random() * 900000), []);
  const agent = React.useMemo(() => {
    const agents = ['Tashi (Gangtok)', 'Rinchen (Darjeeling)', 'Dorjee (Kalimpong)'];
    return agents[Math.floor(Math.random() * agents.length)];
  }, []);

  // countdown
  React.useEffect(() => {
    if (phase !== 'lock') return;
    if (secs <= 0) { close(); return; }
    const id = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs, phase]);

  // background polling simulation (every 3s); auto-confirm after a few polls
  React.useEffect(() => {
    if (phase !== 'lock') return;
    const id = setInterval(() => setPolls((p) => p + 1), 3000);
    return () => clearInterval(id);
  }, [phase]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const total = tickets.length * game.price;
  const urgent = secs <= 120;

  const waMessage = `Hi! I am ${name}. I want to book Ticket(s): ${tickets.join(', ')} for the ${game.title} at ${game.time}. Booking ID: #${bookingId}.`;
  const waUrl = `https://wa.me/919046682303?text=${encodeURIComponent(waMessage)}`;

  const confirm = () => setPhase('confirmed');

  if (phase === 'confirmed') {
    return (
      <div className="hg-modal-scrim">
        <div className="hg-modal hg-modal-success">
          <div className="hg-burst" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}
          </div>
          <div className="hg-success-check"><Icon name="check" size={42} strokeWidth={3} /></div>
          <h2 className="hg-success-title">Payment Confirmed!</h2>
          <p className="hg-success-sub">{tickets.length} ticket{tickets.length > 1 ? 's' : ''} locked in for <b>{name}</b>. Best of luck!</p>

          <div className="hg-digital-tickets">
            {tickets.map((n) => (
              <HousieTicket key={n} ticket={getTicket(n)} label={`Ticket #${n}`} compact />
            ))}
          </div>

          <div className="hg-success-actions">
            <Button variant="cta" size="lg" full icon="play" onClick={goLive}>Go to the Live Board</Button>
            <Button variant="ghost" size="md" full onClick={close}>Back to lobby</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hg-modal-scrim">
      <div className="hg-modal hg-modal-lock">
        <div className="hg-lock-badge"><Icon name="lock" size={16} strokeWidth={2.4} /> TICKETS RESERVED</div>

        <div className={`hg-timer${urgent ? ' is-urgent' : ''}`}>
          <span className="hg-timer-clock">{mm}:{ss}</span>
          <span className="hg-timer-cap">Complete payment before the timer runs out</span>
        </div>

        <div className="hg-lock-summary">
          <div className="hg-ls-row"><span>Game</span><b>{game.title}</b></div>
          <div className="hg-ls-row"><span>Tickets</span><b>{tickets.map((t) => '#' + t).join(', ')}</b></div>
          <div className="hg-ls-row"><span>Total payable</span><b className="hg-ls-amt">{money(total)}</b></div>
          <div className="hg-ls-row"><span>Booking ID</span><b>#{bookingId}</b></div>
        </div>

        <div className="hg-wa-block">
          <div className="hg-wa-head">
            <span className="hg-wa-ic"><Icon name="chat" size={16} strokeWidth={2.2} /></span>
            <div>
              <strong>Pay agent on WhatsApp</strong>
              <span>Routed to {agent}</span>
            </div>
          </div>
          <div className="hg-wa-msg">{waMessage}</div>
          <a className="hg-wa-btn" href={waUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" size={18} strokeWidth={2.2} /> Open WhatsApp to Pay
          </a>
        </div>

        <div className="hg-poll">
          <span className="hg-poll-spin" />
          Waiting for agent to confirm your payment{'.'.repeat((polls % 3) + 1)}
        </div>

        {/* prototype helper — simulates the agent's "Confirm Payment" click */}
        <button className="hg-sim" onClick={confirm}>▸ Simulate agent confirming payment (demo)</button>
      </div>
    </div>
  );
}

Object.assign(window, { BookingModal });
