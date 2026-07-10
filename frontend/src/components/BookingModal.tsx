"use client";
/** Soft-lock modal: countdown, WhatsApp P2P handoff, 3s status polling, success. */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money, moneyStr } from "@/lib/money";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { Icon } from "./Icon";
import { Button } from "./ui";
import { HousieTicket, TicketMatrix } from "./HousieTicket";
import type { BookingStatusResponse, LockResponse } from "@/lib/types";

interface BookingModalProps {
  lock: LockResponse;
  housieName: string;
  gameTitle: string;
  ticketNumbers: number[];
  matrices: Record<number, TicketMatrix>;
  onClose: () => void;
  goLive: () => void;
}

export function BookingModal({ lock, housieName, gameTitle, ticketNumbers, matrices, onClose, goLive }: BookingModalProps) {
  const [phase, setPhase] = useState<"lock" | "confirmed">("lock");
  const [polls, setPolls] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { secondsLeft, display } = useCountdown(lock.locked_until);
  const setBooking = useBookingStore((s) => s.setBooking);
  const clearBooking = useBookingStore((s) => s.clear);

  // Disable background scrolling when modal is active
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Background status polling (every 3s) until the agent confirms.
  useEffect(() => {
    if (phase !== "lock") return;
    const id = setInterval(async () => {
      setPolls((p) => p + 1);
      try {
        const res = await apiFetch<BookingStatusResponse>(`/api/bookings/status/${lock.booking_id}`);
        if (res.booking_status === "Sold") {
          setBooking({ status: "sold" });
          setPhase("confirmed");
        } else if (res.booking_status === "Cancelled" || res.booking_status === "Expired") {
          setError(
            res.booking_status === "Cancelled"
              ? "Your agent could not confirm this booking. Your tickets were released — please try again."
              : "The reservation timer ran out. Your tickets were released — please book again."
          );
          clearBooking();
        }
      } catch {
        // transient poll failure — keep trying
      }
    }, 3000);
    return () => clearInterval(id);
  }, [phase, lock.booking_id, setBooking, clearBooking]);

  // Lock expired client-side — message is derived; the effect only clears the persisted booking.
  const expired = phase === "lock" && secondsLeft <= 0;
  useEffect(() => {
    if (expired) clearBooking();
  }, [expired, clearBooking]);
  const shownError =
    error ?? (expired ? "The reservation timer ran out. Your tickets were released — please book again." : null);

  const urgent = secondsLeft <= 120;
  const shortId = lock.booking_id.substring(0, 8).toUpperCase();
  const routedTo = lock.agent_town ? `${lock.agent_name} · ${lock.agent_town}` : lock.agent_name;
  const waMessage = `Hi ${lock.agent_name}, I am ${housieName}. I want to book Ticket(s): [${ticketNumbers.join(", ")}] for "${gameTitle}". Booking ID: #${shortId}. Amount: ${moneyStr(lock.total_amount)}.`;

  if (phase === "confirmed") {
    return (
      <div className="hg-modal-scrim">
        <div className="hg-modal hg-modal-success">
          <div className="hg-burst" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close modal"
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-mute)",
              padding: "4px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              transition: "color 0.2s"
            }}
          >
            <Icon name="x" size={20} strokeWidth={2.5} />
          </button>
          <div className="hg-success-check"><Icon name="check" size={42} strokeWidth={3} /></div>
          <h2 className="hg-success-title">Payment Confirmed!</h2>
          <p className="hg-success-sub">
            {ticketNumbers.length} ticket{ticketNumbers.length > 1 ? "s" : ""} locked in for <b>{housieName}</b>. Best of luck!
          </p>

          <div className="hg-digital-tickets" style={{ maxHeight: "300px", overflowY: "auto", width: "100%", padding: "4px 8px 4px 4px", display: "grid", gridTemplateColumns: "1fr", gap: "12px", boxSizing: "border-box" }}>
            {ticketNumbers.map((n) =>
              matrices[n] ? (
                <div key={n} className="hg-live-ticket-card" style={{ marginBottom: "12px", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                  <div className="hg-live-ticket-header">
                    <span className="hg-live-ticket-game-name">{gameTitle || "Housie Ghar"}</span>
                    <span className="hg-live-ticket-datetime">CONFIRMED</span>
                  </div>
                  <HousieTicket matrix={matrices[n]} compact />
                  <div className="hg-live-ticket-footer">
                    <span className="hg-live-ticket-number">Ticket #{n}</span>
                    <span className="hg-live-ticket-player-name">{housieName || "Player"}</span>
                  </div>
                </div>
              ) : null
            )}
          </div>

          <div className="hg-success-actions">
            <Button variant="cta" size="lg" full icon="play" onClick={goLive}>Go to the Live Board</Button>
            <Button variant="ghost" size="md" full onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  if (shownError) {
    return (
      <div className="hg-modal-scrim">
        <div className="hg-modal hg-modal-success">
          <h2 className="hg-success-title">Booking not completed</h2>
          <p className="hg-success-sub">{shownError}</p>
          <div className="hg-success-actions">
            <Button variant="ghost" size="md" full onClick={onClose}>Back to the game</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hg-modal-scrim">
      <div className="hg-modal hg-modal-lock">
        <div className="hg-lock-badge"><Icon name="lock" size={16} strokeWidth={2.4} /> TICKETS RESERVED</div>

        <div className={`hg-timer${urgent ? " is-urgent" : ""}`}>
          <span className="hg-timer-clock">{display}</span>
          <span className="hg-timer-cap">Complete payment before the timer runs out</span>
        </div>

        <div className="hg-lock-summary">
          <div className="hg-ls-row"><span>Game</span><b>{gameTitle}</b></div>
          <div className="hg-ls-row"><span>Tickets</span><b>{ticketNumbers.map((t) => "#" + t).join(", ")}</b></div>
          <div className="hg-ls-row"><span>Total payable</span><b className="hg-ls-amt">{money(lock.total_amount)}</b></div>
          <div className="hg-ls-row"><span>Booking ID</span><b>#{shortId}</b></div>
        </div>

        <div className="hg-wa-block">
          <div className="hg-wa-head">
            <span className="hg-wa-ic"><Icon name="chat" size={16} strokeWidth={2.2} /></span>
            <div>
              <strong>Pay {lock.is_overflow ? "the operator" : "agent"} on WhatsApp</strong>
              <span>Routed to {routedTo}</span>
            </div>
          </div>
          <div className="hg-wa-msg">{waMessage}</div>
          <a className="hg-wa-btn" href={lock.whatsapp_link} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" size={18} strokeWidth={2.2} /> Open WhatsApp to Pay
          </a>
        </div>

        <div className="hg-poll">
          <span className="hg-poll-spin" />
          Waiting for {lock.is_overflow ? "the operator" : "your agent"} to confirm your payment{".".repeat((polls % 3) + 1)}
        </div>
      </div>
    </div>
  );
}
