"use client";
/** How to Play — six steps + winning patterns (canonical backend pattern names). */

import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";

const STEPS = [
  { ic: "grid", t: "Pick a game", d: "Browse the lobby, check the prize pool and start time, then open a game with tickets still available." },
  { ic: "ticket", t: "Choose your tickets", d: "Tap any open number to preview its housie ticket. Select as many as you like and enter a fun Housie name." },
  { ic: "lock", t: "Reserve & pay your agent", d: "Tap Book Now — your tickets lock for 10 minutes and we route you to a local agent on WhatsApp. Pay them directly via UPI." },
  { ic: "check", t: "Get confirmed", d: "The moment your agent confirms, your digital tickets appear. No refresh needed — we poll for you." },
  { ic: "play", t: "Play live", d: "When the draw begins, numbers are called automatically. Your tickets mark themselves — just watch and cheer!" },
  { ic: "trophy", t: "Win prizes", d: "Early Five, Lines, Four Corners and the Full House are detected instantly and split fairly on a tie. Winners light up the board." },
];

const PATTERNS = [
  { t: "Early Five", d: "First to mark any 5 numbers" },
  { t: "Top / Middle / Bottom Line", d: "All 5 numbers in a row" },
  { t: "Four Corners", d: "The four corner numbers" },
  { t: "Full House", d: "All 15 numbers on your ticket" },
];

export default function HowToPlay() {
  const router = useRouter();
  return (
    <PublicShell>
      <div className="hg-screen">
        <div className="hg-page-head">
          <span className="hg-page-kicker"><Icon name="help" size={14} /> HOW TO PLAY</span>
          <h1 className="hg-page-title">Six steps to your first win</h1>
          <p className="hg-page-sub">Housie (Tambola) the easy way — book on WhatsApp, play automatically.</p>
        </div>

        <div className="hg-steps">
          {STEPS.map((s, i) => (
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
            {PATTERNS.map((p) => (
              <div key={p.t} className="hg-pattern">
                <strong>{p.t}</strong>
                <span>{p.d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hg-cta-block">
          <Button variant="cta" size="lg" full iconRight="chevR" onClick={() => router.push("/")}>Browse games</Button>
        </div>
      </div>
    </PublicShell>
  );
}
