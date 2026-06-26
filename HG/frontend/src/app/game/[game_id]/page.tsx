"use client";
/** Game Room — number grid, ticket previews, housie-name entry, booking handoff. */

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { usePlayerStore } from "@/lib/stores/playerStore";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { AccountButton } from "@/components/AccountButton";
import { Button } from "@/components/ui";
import { BookingModal } from "@/components/BookingModal";
import { HousieTicket, TicketMatrix, gridToMatrix } from "@/components/HousieTicket";
import type { GameSummary, LockResponse, TicketDetail, TicketListItem, TicketListResponse } from "@/lib/types";

const BANNED = ["idiot", "fool", "damn", "hell", "stupid"];

function validateName(name: string): { ok: boolean; msg: string } {
  const v = name.trim();
  if (!v) return { ok: false, msg: "" };
  if (v.length < 3) return { ok: false, msg: "At least 3 characters" };
  if (v.length > 18) return { ok: false, msg: "Keep it under 18 characters" };
  if (/\s/.test(v)) return { ok: false, msg: "No spaces — try an underscore" };
  if (BANNED.some((b) => v.toLowerCase().includes(b))) return { ok: false, msg: "Keep it clean, please 😊" };
  return { ok: true, msg: "Looking good!" };
}

export default function GameRoom({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  const router = useRouter();

  const [game, setGame] = useState<GameSummary | null>(null);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]); // ticket_numbers
  const [name, setName] = useState("");
  const [matrices, setMatrices] = useState<Record<number, TicketMatrix>>({});
  const [lock, setLock] = useState<LockResponse | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const requestedMatrices = useRef<Set<number>>(new Set());
  const restoredLock = useRef(false);
  const prefilledName = useRef(false);

  const booking = useBookingStore();

  // Load game meta once; refresh the ticket grid every 5s so locks/sales appear live.
  // On the first tickets load, restore an in-flight lock for this game after a reload.
  useEffect(() => {
    let alive = true;
    apiFetch<GameSummary>(`/api/games/${game_id}`)
      .then((g) => { if (alive) setGame(g); })
      .catch(() => {});
    const loadTickets = () =>
      apiFetch<TicketListResponse>(`/api/games/${game_id}/tickets`)
        .then((res) => {
          if (!alive) return;
          setTickets(res.tickets);
          const b = useBookingStore.getState();
          if (
            !restoredLock.current &&
            b.bookingId &&
            b.gameId === game_id &&
            b.status === "locked" &&
            b.lockedUntil &&
            new Date(b.lockedUntil).getTime() > Date.now()
          ) {
            restoredLock.current = true;
            setLock({
              booking_id: b.bookingId,
              locked_until: b.lockedUntil,
              agent_name: b.agentName,
              agent_phone: b.agentPhone,
              agent_town: null,
              total_amount: b.totalAmount,
              whatsapp_link: b.whatsappLink,
              is_overflow: false,
            });
            setName(b.housieName);
            setSelected(
              b.ticketIds
                .map((id) => res.tickets.find((t) => t.ticket_id === id)?.ticket_number ?? 0)
                .filter(Boolean)
            );
          } else if (!prefilledName.current) {
            // Logged-in players get their username as the default housie name.
            prefilledName.current = true;
            const p = usePlayerStore.getState().player;
            if (p) setName((prev) => prev || p.username);
          }
        })
        .catch(() => {});
    loadTickets();
    const id = setInterval(loadTickets, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [game_id]);

  const fetchMatrix = useCallback((ticketId: number, ticketNumber: number) => {
    if (requestedMatrices.current.has(ticketNumber)) return;
    requestedMatrices.current.add(ticketNumber);
    apiFetch<TicketDetail>(`/api/tickets/${ticketId}`)
      .then((d) => setMatrices((m) => ({ ...m, [ticketNumber]: gridToMatrix(d.grid_data) })))
      .catch(() => { requestedMatrices.current.delete(ticketNumber); });
  }, []);

  const toggle = (t: TicketListItem) => {
    if (t.status !== "Available") return;
    setSelected((prev) =>
      prev.includes(t.ticket_number)
        ? prev.filter((x) => x !== t.ticket_number)
        : [...prev, t.ticket_number].sort((a, b) => a - b)
    );
    fetchMatrix(t.ticket_id, t.ticket_number);
  };

  const nameState = validateName(name);
  const price = game?.ticket_price ?? 0;
  const total = selected.length * price;
  const canBook = selected.length > 0 && nameState.ok && !locking;

  const bookNow = async () => {
    if (!game) return;
    setLocking(true);
    setLockError(null);
    const ticketIds = selected
      .map((n) => tickets.find((t) => t.ticket_number === n)?.ticket_id)
      .filter((x): x is number => x != null);
    try {
      const res = await apiFetch<LockResponse>("/api/bookings/lock", {
        method: "POST",
        body: JSON.stringify({ game_id, ticket_ids: ticketIds, housie_name: name.trim() }),
      });
      booking.setBooking({
        bookingId: res.booking_id,
        housieName: name.trim(),
        gameId: game_id,
        ticketIds,
        status: "locked",
        agentPhone: res.agent_phone,
        agentName: res.agent_name,
        totalAmount: res.total_amount,
        lockedUntil: res.locked_until,
        whatsappLink: res.whatsapp_link,
      });
      setLock(res);
    } catch (e) {
      setLockError(e instanceof Error ? e.message : "Could not reserve tickets — please try again.");
    } finally {
      setLocking(false);
    }
  };

  const when = game
    ? `${new Date(game.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${new Date(game.scheduled_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    : "";

  return (
    <PublicShell>
      <div className="hg-screen hg-screen-room">
        <div className="hg-room-head">
          <button className="hg-back" onClick={() => router.push("/")} aria-label="Back to lobby">
            <Icon name="arrowL" size={20} />
          </button>
          <div className="hg-room-titles">
            <h1>{game?.title ?? "Loading…"}</h1>
            {game && <span>{when} · {money(game.ticket_price)}/ticket</span>}
          </div>
          <AccountButton compact />
        </div>

        <div className="hg-room-body">
        <div className="hg-room-main">
        <div className="hg-legend">
          <span><i className="lg-dot lg-avail" />Available</span>
          <span><i className="lg-dot lg-lock"><Icon name="lock" size={9} strokeWidth={2.6} /></i>Locked</span>
          <span><i className="lg-dot lg-sold"><Icon name="x" size={9} strokeWidth={3} /></i>Sold</span>
          <span className="hg-legend-tip">Tap a number to preview its ticket</span>
        </div>

        <div className="hg-numgrid">
          {tickets.map((t) => {
            const st = t.status.toLowerCase() as "available" | "locked" | "sold";
            const isSel = selected.includes(t.ticket_number);
            return (
              <button
                key={t.ticket_id}
                className={`hg-num hg-num-${st}${isSel ? " is-sel" : ""}`}
                onClick={() => toggle(t)}
                disabled={st !== "available"}
              >
                {st === "locked" ? (
                  <Icon name="lock" size={13} strokeWidth={2.4} />
                ) : st === "sold" ? (
                  <span className="hg-num-sold">{t.ticket_number}</span>
                ) : (
                  t.ticket_number
                )}
                {st === "locked" && <span className="hg-num-spin" />}
              </button>
            );
          })}
        </div>

        {selected.length > 0 && (
          <div className="hg-previews">
            <div className="hg-previews-head">
              <h2 className="hg-section-title">Your tickets ({selected.length})</h2>
              <button className="hg-clear" onClick={() => setSelected([])}>Clear all</button>
            </div>
            <div className="hg-previews-scroll">
              {selected.map((n) => (
                <div key={n} className="hg-preview-item">
                  <button
                    className="hg-preview-x"
                    onClick={() => setSelected((prev) => prev.filter((x) => x !== n))}
                    aria-label="Remove"
                  >
                    <Icon name="x" size={13} strokeWidth={2.6} />
                  </button>
                  {matrices[n] ? (
                    <HousieTicket matrix={matrices[n]} label={`#${n}`} compact />
                  ) : (
                    <div className="hg-ticket hg-ticket-compact"><div className="hg-ticket-tag">#{n}</div></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        <div className="hg-room-aside">
        {selected.length === 0 && (
          <div className="hg-room-aside-hint">
            <div className="hg-empty">
              <div className="hg-empty-ic"><Icon name="ticket" size={22} /></div>
              <strong>Pick your numbers</strong>
              <span>Tap any open number to add it — your tickets preview under the grid. Then add your Housie name and book here.</span>
            </div>
          </div>
        )}

        <div className="hg-room-spacer" style={{ height: selected.length > 0 ? 168 : 24 }} />

        {selected.length > 0 && (
          <div className="hg-action-foot">
            <div className="hg-name-field">
              <input
                className={`hg-name-input${name && !nameState.ok ? " is-bad" : ""}${nameState.ok ? " is-good" : ""}`}
                placeholder="Your Housie name (e.g. MomoMaster99)"
                value={name}
                maxLength={18}
                onChange={(e) => setName(e.target.value)}
              />
              <span className={`hg-name-hint${nameState.ok ? " is-good" : " is-bad"}`}>
                {name ? nameState.msg : "Pick a fun local nickname — builds the hall spirit!"}
              </span>
            </div>
            {lockError && <p className="hg-sec-err">{lockError}</p>}
            <div className="hg-action-row">
              <div className="hg-total">
                <span className="hg-dim">{selected.length} × {money(price)}</span>
                <strong>{money(total)}</strong>
              </div>
              <Button variant="cta" size="lg" disabled={!canBook} icon="ticket" onClick={bookNow}>
                {locking ? "Reserving…" : "Book Now"}
              </Button>
            </div>
          </div>
        )}
        </div>
        </div>

        {lock && game && (
          <BookingModal
            lock={lock}
            housieName={name.trim()}
            gameTitle={game.title}
            ticketNumbers={selected}
            matrices={matrices}
            onClose={() => { setLock(null); setSelected([]); }}
            goLive={() => router.push(`/game/${game_id}/live`)}
          />
        )}
      </div>
    </PublicShell>
  );
}
