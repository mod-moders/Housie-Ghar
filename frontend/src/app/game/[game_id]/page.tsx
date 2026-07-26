"use client";
/** Game Room — number grid, ticket previews, housie-name entry, booking handoff. */

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAuthError } from "@/lib/api";
import { money } from "@/lib/money";
import { useBookingStore } from "@/lib/stores/bookingStore";
import { PublicShell } from "@/components/PublicShell";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { BookingModal } from "@/components/BookingModal";
import { HousieTicket, TicketMatrix, gridToMatrix } from "@/components/HousieTicket";
import type { GameSummary, LockResponse, TicketDetail, TicketListItem, TicketListResponse } from "@/lib/types";
import { clearPlayerToken } from "@/lib/playerSession";

const BANNED = ["idiot", "fool", "damn", "hell", "stupid"];

function validateName(name: string | undefined | null): { ok: boolean; msg: string } {
  const v = (name || "").trim();
  if (!v) return { ok: false, msg: "" };
  if (v.length < 2) return { ok: false, msg: "At least 2 characters" };
  if (v.length > 16) return { ok: false, msg: "Keep it under 16 characters" };
  if (!/^[A-Za-z0-9_.]+$/.test(v)) {
    if (/\s/.test(v)) return { ok: false, msg: "No spaces allowed" };
    return { ok: false, msg: "Only letters, numbers, underscores, and periods" };
  }
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
  const [myBoughtTickets, setMyBoughtTickets] = useState<TicketDetail[]>([]);

  // Renaming a purchased ticket. This sets display_name only — the ticket stays
  // owned by owner_housie_name, which is what my-tickets and prize claims match
  // on — and the backend closes the window once the draw starts.
  const [renamingTicketId, setRenamingTicketId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [lockedNoticeId, setLockedNoticeId] = useState<number | null>(null);

  // The name to print on the tickets being bought. Separate from `name`, which
  // is the registered housie name the booking is made under and must not change.
  const [ticketName, setTicketName] = useState("");

  // Referral reward — a player who has reached a referral rung (10/15/20…) can
  // claim one ticket free. The backend only discounts one ticket's price off
  // whatever ticket_ids are locked (it never adds a ticket on its own), so the
  // extra ticket has to be picked and appended client-side before locking.
  const [rewardsEnabled, setRewardsEnabled] = useState(false);
  const [creditsAvailable, setCreditsAvailable] = useState(0);
  const [claimReferralTicket, setClaimReferralTicket] = useState(false);
  const [freeTicketNumber, setFreeTicketNumber] = useState<number | null>(null);

  const booking = useBookingStore();

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ enabled: boolean; credits_available: number }>("/api/rewards/player")
      .then((res) => {
        if (cancelled) return;
        setRewardsEnabled(res.enabled);
        setCreditsAvailable(res.credits_available);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Prefill player's registered Housie Name from session. Only a real 401/403
  // means the player isn't actually logged in — a network blip or mid-deploy
  // connection gap must not bounce them to /login; retry instead.
  useEffect(() => {
    let cancelled = false;
    const checkAuth = () => {
      apiFetch<{ player: { housie_name: string } }>("/api/player/me")
        .then((res) => {
          if (!cancelled) setName(res.player.housie_name || "");
        })
        .catch((e) => {
          if (cancelled) return;
          if (!isAuthError(e)) { setTimeout(() => { if (!cancelled) checkAuth(); }, 3000); return; }
          // Clear the stale token — see the matching note in app/page.tsx's
          // auth-check effect: leaving it would make /login bounce straight
          // back to "/" (it gates on sessionStorage presence), reproducing
          // the same redirect loop this pattern is meant to prevent.
          clearPlayerToken();
          router.push("/login");
        });
    };
    checkAuth();
    return () => { cancelled = true; };
  }, [router]);

  const loadTicketsAndBought = useCallback((isAliveRef?: { current: boolean }) => {
    apiFetch<TicketListResponse>(`/api/games/${game_id}/tickets`)
      .then((res) => {
        if (isAliveRef && !isAliveRef.current) return;
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
          setName(b.housieName || "");
          setSelected(
            b.ticketIds
              .map((id) => res.tickets.find((t) => t.ticket_id === id)?.ticket_number ?? 0)
              .filter(Boolean)
          );
        }
      })
      .catch(() => {});

    apiFetch<TicketDetail[]>(`/api/games/${game_id}/my-tickets`)
      .then((res) => {
        if (isAliveRef && !isAliveRef.current) return;
        setMyBoughtTickets(res);
      })
      .catch(() => {});
  }, [game_id]);

  // Load game meta once; refresh the ticket grid every 5s so locks/sales appear live.
  // On the first tickets load, restore an in-flight lock for this game after a reload.
  useEffect(() => {
    const alive = { current: true };
    apiFetch<GameSummary>(`/api/games/${game_id}`)
      .then((g) => { if (alive.current) setGame(g); })
      .catch(() => {});

    const load = () => {
      if (alive.current) {
        loadTicketsAndBought(alive);
      }
    };
    
    load();
    const id = setInterval(load, 5000);
    return () => { alive.current = false; clearInterval(id); };
  }, [game_id, loadTicketsAndBought]);

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
  // Empty is valid — it just means "keep the registered name on the ticket".
  const ticketNameCheck = ticketName.trim() ? validateName(ticketName) : { ok: true, msg: "" };
  const price = game?.ticket_price ?? 0;
  const total = selected.length * price;
  const canBook = selected.length > 0 && nameState.ok && ticketNameCheck.ok && !locking;

  const canClaimReferralTicket = rewardsEnabled && creditsAvailable >= 1;
  const availableCount = tickets.filter((t) => t.status === "Available").length;
  const hasFreeTicketRoom = availableCount - selected.length >= 1;

  const bookNow = async () => {
    if (!game) return;
    setLocking(true);
    setLockError(null);
    const ticketIds = selected
      .map((n) => tickets.find((t) => t.ticket_number === n)?.ticket_id)
      .filter((x): x is number => x != null);

    // Re-check credits right before locking (rather than trusting the mount-time
    // fetch) — sending redeem_credit without an actual credit doesn't error, it
    // just silently charges full price, so a stale "yes" here would quietly
    // overcharge the player for the ticket they thought was free.
    let freeTicketId: number | null = null;
    let freeTicketNum: number | null = null;
    if (claimReferralTicket && canClaimReferralTicket && hasFreeTicketRoom) {
      try {
        const fresh = await apiFetch<{ credits_available: number }>("/api/rewards/player");
        if (fresh.credits_available >= 1) {
          const freeTicket = tickets.find((t) => t.status === "Available" && !selected.includes(t.ticket_number));
          if (freeTicket) {
            freeTicketId = freeTicket.ticket_id;
            freeTicketNum = freeTicket.ticket_number;
            ticketIds.push(freeTicket.ticket_id);
            fetchMatrix(freeTicket.ticket_id, freeTicket.ticket_number);
          }
        }
      } catch {
        // couldn't re-verify — proceed without the free ticket rather than risk an overcharge
      }
    }

    try {
      const res = await apiFetch<LockResponse>("/api/bookings/lock", {
        method: "POST",
        body: JSON.stringify({
          game_id,
          ticket_ids: ticketIds,
          housie_name: (name || "").trim(),
          display_name: ticketName.trim() || null,
          redeem_credit: freeTicketId !== null,
        }),
      });
      if (freeTicketNum !== null) {
        setSelected((prev) => [...prev, freeTicketNum as number].sort((a, b) => a - b));
        setFreeTicketNumber(freeTicketNum);
        setCreditsAvailable((c) => Math.max(0, c - 1));
      }
      booking.setBooking({
        bookingId: res.booking_id,
        housieName: (name || "").trim(),
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
      if (res.whatsapp_link) {
        window.open(res.whatsapp_link, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setLockError(e instanceof Error ? e.message : "Could not reserve tickets — please try again.");
    } finally {
      setLocking(false);
    }
  };

  const when = game
    ? `${new Date(game.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${new Date(game.scheduled_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    : "";

  // Names are fixed once the draw starts: the board is being read live by
  // everyone, and any prize already awarded has the old name written into
  // winner_housie_name, which a rename here cannot rewrite. Non-null means the
  // control is shown locked, with this as its tooltip and click message.
  const renameLockedReason =
    !game || game.game_status === "Scheduled"
      ? null
      : game.game_status === "Completed" || game.game_status === "Draw_Ended"
        ? "This game has finished — the ticket name is now fixed."
        : "Ticket names lock once the game starts.";

  const saveTicketName = async (ticketId: number) => {
    const next = renameValue.trim();
    // An empty value clears the nickname and falls back to the booked name, so
    // only a non-empty one has to pass the name rules.
    if (next) {
      const check = validateName(next);
      if (!check.ok) {
        setRenameError(check.msg || "That name will not work");
        return;
      }
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const updated = await apiFetch<TicketDetail>(`/api/tickets/${ticketId}/display-name`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: next || null }),
      });
      setMyBoughtTickets((prev) =>
        prev.map((t) => (t.ticket_id === ticketId ? { ...t, display_name: updated.display_name } : t))
      );
      setRenamingTicketId(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not save that name — please try again.");
    } finally {
      setRenameSaving(false);
    }
  };

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
        </div>

        <div className="hg-room-body">
          <main className="hg-room-main">
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
                const isMine = myBoughtTickets.some((myT) => myT.ticket_number === t.ticket_number);
                return (
                  <button
                    key={t.ticket_id}
                    className={`hg-num hg-num-${st}${isSel ? " is-sel" : ""}${isMine ? " is-mine" : ""}`}
                    onClick={() => toggle(t)}
                    disabled={st !== "available"}
                    style={isMine ? {
                      borderColor: "var(--success)",
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "var(--success)",
                      cursor: "default"
                    } : undefined}
                  >
                    {st === "locked" ? (
                      <Icon name="lock" size={13} strokeWidth={2.4} />
                    ) : st === "sold" ? (
                      isMine ? (
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px", color: "var(--success)", fontWeight: 800 }}>
                          {t.ticket_number} <Icon name="check" size={10} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="hg-num-sold">{t.ticket_number}</span>
                      )
                    ) : (
                      t.ticket_number
                    )}
                    {st === "locked" && <span className="hg-num-spin" />}
                  </button>
                );
              })}
            </div>
          </main>

          <aside className="hg-room-aside">
            {selected.length > 0 && (
              <>
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
                          style={{ zIndex: 12 }}
                        >
                          <Icon name="x" size={13} strokeWidth={2.6} />
                        </button>
                        <div className="hg-live-ticket-card">
                          <div className="hg-live-ticket-header">
                            <span className="hg-live-ticket-game-name">{game?.title || "Housie Ghar"}</span>
                            <span className="hg-live-ticket-datetime">{when}</span>
                          </div>
                          {matrices[n] ? (
                            <HousieTicket matrix={matrices[n]} compact />
                          ) : (
                            <div className="hg-ticket hg-ticket-compact"><div className="hg-ticket-tag">#{n}</div></div>
                          )}
                          <div className="hg-live-ticket-footer">
                            <span className="hg-live-ticket-number">Ticket #{n}</span>
                            <span className="hg-live-ticket-player-name">{ticketName.trim() || name || "You"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hg-action-foot">
                  <div className="hg-name-field">
                    {/* Editable, but it sets the LABEL on the tickets — the booking
                        itself is still made under the registered housie name below,
                        which is what decides who the tickets belong to. Leaving it
                        empty keeps the registered name on the ticket. */}
                    <input
                      className={`hg-name-input${ticketNameCheck.ok ? " is-good" : " is-bad"}`}
                      placeholder={name || "Name on your ticket"}
                      value={ticketName}
                      maxLength={16}
                      onChange={(e) => setTicketName(e.target.value)}
                      aria-label="Name to print on your tickets"
                    />
                    <span className={`hg-name-hint${ticketNameCheck.ok ? " is-good" : " is-bad"}`}>
                      {ticketNameCheck.ok ? (
                        <>
                          Ticket name: <strong>{ticketName.trim() || name}</strong>
                          {" · "}booked as <strong>{name}</strong>
                        </>
                      ) : (
                        ticketNameCheck.msg
                      )}
                    </span>
                  </div>
                  {lockError && <p className="hg-sec-err">{lockError}</p>}
                  {canClaimReferralTicket && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: "1px solid var(--border-light)",
                        background: "var(--surface-2)",
                        cursor: hasFreeTicketRoom ? "pointer" : "not-allowed",
                        opacity: hasFreeTicketRoom ? 1 : 0.55,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={claimReferralTicket}
                        disabled={!hasFreeTicketRoom}
                        onChange={(e) => setClaimReferralTicket(e.target.checked)}
                      />
                      <span style={{ fontSize: 13, color: "var(--text)" }}>
                        🎁 Claim 1 free referral ticket{!hasFreeTicketRoom ? " (no tickets left to give)" : ""}
                      </span>
                    </label>
                  )}
                  <div className="hg-action-row">
                    <div className="hg-total">
                      <span className="hg-dim">
                        {selected.length} × {money(price)}
                        {claimReferralTicket && hasFreeTicketRoom ? " + 1 free" : ""}
                      </span>
                      <strong>{money(total)}</strong>
                    </div>
                    <Button variant="cta" size="lg" disabled={!canBook} icon="ticket" onClick={bookNow}>
                      {locking ? "Reserving…" : "Book Now"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {selected.length === 0 && myBoughtTickets.length === 0 && (
              <div className="hg-room-aside-hint">
                <div className="hg-empty">
                  <div className="hg-empty-icon"><Icon name="ticket" size={32} /></div>
                  <strong>No tickets selected</strong>
                  <span>Select tickets from the grid to customize your booking.</span>
                </div>
              </div>
            )}

            {myBoughtTickets.length > 0 && (
              <div className="hg-previews" style={{ marginTop: selected.length > 0 ? "24px" : "0" }}>
                <div className="hg-previews-head">
                  <h2 className="hg-section-title" style={{ color: "var(--success)" }}>
                    🏆 Purchased Tickets ({myBoughtTickets.length})
                  </h2>
                </div>
                <div className="hg-previews-scroll">
                  {myBoughtTickets.map((t) => (
                    <div key={t.ticket_id} className="hg-preview-item">
                      <div className="hg-live-ticket-card" style={{ border: "1.5px solid rgba(34, 197, 94, 0.4)" }}>
                        <div className="hg-live-ticket-header" style={{ background: "rgba(34, 197, 94, 0.1)" }}>
                          <span className="hg-live-ticket-game-name">{game?.title || "Housie Ghar"}</span>
                          <span className="hg-live-ticket-datetime">{when}</span>
                        </div>
                        <HousieTicket matrix={gridToMatrix(t.grid_data)} compact />
                        <div className="hg-live-ticket-footer" style={{ background: "rgba(34, 197, 94, 0.05)" }}>
                          <span className="hg-live-ticket-number">Ticket #{t.ticket_number}</span>
                          {renamingTicketId === t.ticket_id ? (
                            <span className="hg-ticket-rename">
                              <input
                                className="hg-ticket-rename-input"
                                value={renameValue}
                                autoFocus
                                maxLength={16}
                                placeholder={t.owner_housie_name || "Ticket name"}
                                onChange={(e) => {
                                  setRenameValue(e.target.value);
                                  setRenameError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveTicketName(t.ticket_id);
                                  if (e.key === "Escape") setRenamingTicketId(null);
                                }}
                              />
                              <button
                                type="button"
                                className="hg-ticket-rename-btn"
                                disabled={renameSaving}
                                onClick={() => saveTicketName(t.ticket_id)}
                                aria-label="Save ticket name"
                                title="Save"
                              >
                                <Icon name="check" size={13} />
                              </button>
                              <button
                                type="button"
                                className="hg-ticket-rename-btn"
                                disabled={renameSaving}
                                onClick={() => setRenamingTicketId(null)}
                                aria-label="Cancel"
                                title="Cancel"
                              >
                                <Icon name="x" size={13} />
                              </button>
                            </span>
                          ) : (
                            <span className="hg-live-ticket-player-name">
                              {t.display_name || t.owner_housie_name || name || "You"}
                              {/* Shown even when renaming is closed. Hiding it outright
                                  made a deliberately locked ticket look like a broken
                                  feature — there was nothing to hover and nothing to
                                  click, so no way to learn the name was fixed. */}
                              <button
                                type="button"
                                className={`hg-ticket-rename-btn${renameLockedReason ? " is-locked" : ""}`}
                                aria-disabled={renameLockedReason ? true : undefined}
                                onClick={() => {
                                  if (renameLockedReason) {
                                    setLockedNoticeId(t.ticket_id);
                                    return;
                                  }
                                  setLockedNoticeId(null);
                                  setRenamingTicketId(t.ticket_id);
                                  setRenameValue(t.display_name || "");
                                  setRenameError(null);
                                }}
                                aria-label={
                                  renameLockedReason
                                    ? `Ticket ${t.ticket_number} name is locked`
                                    : `Rename ticket ${t.ticket_number}`
                                }
                                title={renameLockedReason ?? "Rename this ticket"}
                              >
                                <Icon name={renameLockedReason ? "lock" : "edit"} size={12} />
                              </button>
                            </span>
                          )}
                        </div>
                        {renamingTicketId === t.ticket_id && renameError && (
                          <div className="hg-ticket-rename-error">{renameError}</div>
                        )}
                        {lockedNoticeId === t.ticket_id && renameLockedReason && (
                          <div className="hg-ticket-rename-error">{renameLockedReason}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {lock && game && (
          <BookingModal
            lock={lock}
            housieName={(name || "").trim()}
            gameTitle={game.title}
            ticketNumbers={selected}
            matrices={matrices}
            freeTicketNumber={freeTicketNumber}
            gameTime={when}
            onClose={() => {
              setLock(null);
              setSelected([]);
              setClaimReferralTicket(false);
              setFreeTicketNumber(null);
              loadTicketsAndBought();
            }}
            goLive={() => router.push(`/game/${game_id}/live`)}
          />
        )}
      </div>
    </PublicShell>
  );
}
