"use client";
/** How to Play — six steps + winning patterns (canonical backend pattern names). */

import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Button, Footer, TrustBadges } from "@/components/ui";

const STEPS = [
  { ic: "grid", t: "Pick a Game", d: "Look through the list of games, check the prizes and start time, and choose a game that still has tickets left." },
  { ic: "ticket", t: "Select Your Tickets", d: "Tap to look at the tickets, pick the ones you want to buy, and type in a fun nickname for yourself." },
  { ic: "lock", t: "Book and Pay", d: "Tap \"Book Now\" to hold your tickets for 10 minutes. You will be sent to WhatsApp to pay an agent directly using UPI." },
  { ic: "check", t: "Get Your Tickets", d: "As soon as the agent confirms your payment, your ready-to-play tickets will automatically appear on your screen." },
  { ic: "play", t: "Watch the Game", d: "When the game starts, the numbers are called and crossed off your tickets for you. Just sit back and watch!" },
  { ic: "trophy", t: "Win Prizes", d: "The game automatically spots all winners (like Full House, Lines, or Early 5). If there is a tie, the prize money is shared evenly." },
];

const PATTERNS = [
  { t: "1st Full House / Full House", d: "First to mark all 15 numbers on the ticket" },
  { t: "2nd Full House", d: "Second to mark all 15 numbers on the ticket" },
  { t: "3rd Full House", d: "Third to mark all 15 numbers on the ticket" },
  { t: "Top / Middle / Bottom Line", d: "All 5 numbers in the respective row" },
  { t: "Box Bonus", d: "At least two marked numbers in each row" },
  { t: "Star", d: "Four corner numbers + the center number of the ticket" },
  { t: "Corner", d: "The first and last numbers of the top and bottom rows" },
  { t: "Quick 7", d: "First to mark any 7 numbers" },
  { t: "Early 5", d: "First to mark any 5 numbers" },
];

export default function HowToPlay() {
  const router = useRouter();
  return (
    <PublicShell>
      <div className="hg-screen">
        <div className="hg-steps" style={{ marginTop: 24 }}>
          {STEPS.map((s, i) => (
            <div key={s.t} className="hg-step">
              <div className="hg-step-ic"><Icon name={s.ic} size={20} /></div>
              <div className="hg-step-body">
                <div className="hg-step-label">Step {i + 1}</div>
                <strong>{s.t}</strong>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="hg-patterns">
          <h2 className="hg-section-title">Winning patterns</h2>
          <div className="hg-patterns-grid">
            {PATTERNS.map((p) => (
              <div key={p.t} className="hg-pattern">
                <strong>{p.t}</strong>
                <span>{p.d}</span>
              </div>
            ))}
          </div>
        </div>

        <TrustBadges />
        <div className="hg-cta-block">
          <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => router.push("/")}>Browse games</Button>
        </div>
        <Footer />
      </div>
    </PublicShell>
  );
}
