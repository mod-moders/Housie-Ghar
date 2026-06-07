"use client";
import { use, useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { useCountdown } from "@/lib/hooks/useCountdown";
import Link from "next/link";

interface TicketSquare { ticket_id: number; ticket_number: number; status: "Available"|"Locked"|"Sold"; }
interface Game { game_id: string; title: string; ticket_price: number; total_tickets: number; fill_percentage: number; game_status: string; }

export default function GameRoom({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [tickets, setTickets] = useState<TicketSquare[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [housieName, setHousieName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"select" | "locked" | "sold" | "expired">("select");

  const booking = useBookingStore();
  const { display: countdown, secondsLeft } = useCountdown(booking.lockedUntil);

  const loadData = useCallback(async () => {
    const [g, t] = await Promise.all([
      apiFetch<Game>(`/api/games/${game_id}`).catch(() => null),
      apiFetch<{ tickets: TicketSquare[] }>(`/api/games/${game_id}/tickets`).catch(() => ({ tickets: [] })),
    ]);
    if (g) setGame(g);
    setTickets(t.tickets);
  }, [game_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // poll booking status when locked
  useEffect(() => {
    if (phase !== "locked" || !booking.bookingId) return;
    const id = setInterval(async () => {
      try {
        const d = await apiFetch<{ booking_status: string }>(`/api/bookings/status/${booking.bookingId}`);
        if (d.booking_status === "Sold") { setPhase("sold"); clearInterval(id); }
        else if (d.booking_status === "Expired" || d.booking_status === "Cancelled") { setPhase("expired"); clearInterval(id); booking.clear(); }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [phase, booking.bookingId]);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) :
      prev.length >= 6 ? prev : [...prev, id]
    );
  };

  const handleBook = async () => {
    if (!housieName.trim() || selected.length === 0) return;
    setLoading(true); setError("");
    try {
      const data = await apiFetch<any>("/api/bookings/lock", {
        method: "POST",
        body: JSON.stringify({ game_id, ticket_ids: selected, housie_name: housieName.trim() }),
      });
      booking.setBooking({
        bookingId: data.booking_id, housieName: housieName.trim(), gameId: game_id,
        ticketIds: selected, status: "locked", agentPhone: data.agent_phone,
        agentName: data.agent_name, totalAmount: data.total_amount,
        lockedUntil: data.locked_until, whatsappLink: data.whatsapp_link,
      });
      setPhase("locked");
    } catch (e: any) {
      setError(e.message ?? "Booking failed. Try again.");
    } finally { setLoading(false); }
  };

  if (!game) return <div className="min-h-screen bg-cream flex items-center justify-center text-[#888]">Loading...</div>;

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header */}
      <div className="bg-forest text-cream px-5 py-4 flex items-center gap-4">
        <Link href="/" className="text-gold text-xl">←</Link>
        <div>
          <h1 className="font-display text-xl font-bold">{game.title}</h1>
          <p className="text-cream/60 text-xs font-mono">₹{game.ticket_price}/ticket · {game.fill_percentage}% filled</p>
        </div>
      </div>

      {/* Sold phase */}
      {phase === "sold" && (
        <div className="max-w-md mx-auto mt-16 text-center px-5">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="font-display text-2xl font-bold text-forest">Booking Confirmed!</h2>
          <p className="text-[#888] text-sm mt-2 mb-6">Your tickets are locked. Head to the live draw!</p>
          <Link href="/#live" className="bg-forest text-gold font-bold text-sm px-8 py-3 rounded-xl inline-block">
            Watch Live Draw
          </Link>
        </div>
      )}

      {/* Expired phase */}
      {phase === "expired" && (
        <div className="max-w-md mx-auto mt-16 text-center px-5">
          <div className="text-6xl mb-4">⏱</div>
          <h2 className="font-display text-2xl font-bold text-rust">Booking Expired</h2>
          <p className="text-[#888] text-sm mt-2 mb-6">Your reservation timed out. Please select tickets again.</p>
          <button onClick={() => setPhase("select")} className="bg-forest text-gold font-bold text-sm px-8 py-3 rounded-xl">
            Try Again
          </button>
        </div>
      )}

      {/* Lock modal overlay */}
      {phase === "locked" && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="text-center mb-4">
              <p className="text-xs font-mono text-[#888] uppercase tracking-widest">Tickets Reserved</p>
              <div className="font-display text-5xl font-black text-forest my-3">{countdown}</div>
              <p className="text-sm text-[#888]">Pay within this window to confirm</p>
            </div>
            <div className="bg-cream rounded-xl p-4 mb-4 text-sm">
              <p className="text-[#888]">Agent: <strong className="text-forest">{booking.agentName}</strong></p>
              <p className="text-[#888] mt-1">Amount due: <strong className="text-amber font-mono text-lg">₹{booking.totalAmount}</strong></p>
            </div>
            <a
              href={booking.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-wa text-white font-bold py-3 rounded-xl text-sm mb-3"
            >
              💬 Open WhatsApp to Pay
            </a>
            <p className="text-center text-[10px] text-[#888]">Booking ID: {booking.bookingId?.slice(0, 8).toUpperCase()}</p>
            {secondsLeft === 0 && <p className="text-center text-xs text-rust mt-2">Timer expired — waiting for server confirmation...</p>}
          </div>
        </div>
      )}

      {/* Select phase */}
      {phase === "select" && (
        <div className="max-w-5xl mx-auto px-5 py-6">
          <p className="text-sm text-[#888] mb-4">Select up to 6 tickets. Tap to toggle.</p>
          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-2 mb-8">
            {tickets.map((t) => {
              const sel = selected.includes(t.ticket_id);
              return (
                <button
                  key={t.ticket_id}
                  disabled={t.status !== "Available"}
                  onClick={() => toggle(t.ticket_id)}
                  className={`h-11 rounded-xl border-2 text-xs font-mono font-bold transition-all ${
                    sel ? "bg-forest border-forest text-gold scale-105 shadow-md" :
                    t.status === "Sold" ? "bg-cream-dark border-cream-dark text-[#ccc] cursor-not-allowed" :
                    t.status === "Locked" ? "bg-warning/10 border-warning/30 text-warning cursor-not-allowed" :
                    "bg-white border-cream-dark text-[#888] hover:border-forest hover:text-forest"
                  }`}
                >
                  {t.status === "Sold" ? "✕" : t.status === "Locked" ? "🔒" : t.ticket_number}
                </button>
              );
            })}
          </div>

          {/* Sticky footer */}
          {selected.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cream-dark p-4 shadow-xl">
              <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#888] block mb-1">Your Housie Name</label>
                  <input
                    type="text" value={housieName} onChange={(e) => setHousieName(e.target.value)}
                    placeholder="e.g. LuckyStar7"
                    maxLength={20}
                    className="w-full border-2 border-cream-dark rounded-xl px-4 py-2.5 text-sm font-mono focus:border-forest focus:outline-none"
                  />
                  {error && <p className="text-rust text-xs mt-1">{error}</p>}
                </div>
                <button
                  onClick={handleBook}
                  disabled={!housieName.trim() || loading}
                  className="w-full sm:w-auto bg-forest text-gold font-black text-sm px-6 py-3 rounded-xl disabled:opacity-50 transition-all hover:bg-forest-mid shadow-lg"
                >
                  {loading ? "Booking..." : `Book ${selected.length} ticket${selected.length > 1 ? "s" : ""} — ₹${(game.ticket_price * selected.length).toLocaleString()}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
