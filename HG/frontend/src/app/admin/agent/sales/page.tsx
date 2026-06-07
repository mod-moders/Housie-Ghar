"use client";
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAgentStore } from "@/lib/stores/agentStore";

interface Game {
  game_id: string; title: string; ticket_price: number;
  game_status: string; fill_percentage: number;
}
interface Ticket {
  ticket_id: number; ticket_number: number; status: "Available" | "Locked" | "Sold";
}
interface Sale {
  booking_id: string; housie_name: string; game_title: string;
  ticket_numbers: number[]; total_amount: number; confirmed_at: string;
}
export default function AgentSalesPage() {
  const { setBalance } = useAgentStore();

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [housieName, setHousieName] = useState("");
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [saleSuccess, setSaleSuccess] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);

  const loadSales = useCallback(async () => {
    const data = await apiFetch<Sale[]>("/api/bookings/agent/sales").catch(() => []);
    setSales(data);
  }, []);

  const loadTickets = useCallback(async (game: Game) => {
    const data = await apiFetch<{ tickets: Ticket[] }>(`/api/games/${game.game_id}/tickets`).catch(() => ({ tickets: [] }));
    setTickets(data.tickets);
  }, []);

  useEffect(() => {
    apiFetch<Game[]>("/api/games")
      .then((all) => setGames(all.filter((g) => g.game_status === "Scheduled" || g.game_status === "Live")))
      .catch(() => {});
    apiFetch<Sale[]>("/api/bookings/agent/sales").then(setSales).catch(() => {});
  }, []);

  const selectGame = async (gameId: string) => {
    const game = games.find((g) => g.game_id === gameId);
    if (!game) return;
    setSelectedGame(game);
    setSelected([]);
    setHousieName("");
    setSaleError("");
    setSaleSuccess("");
    setTickets([]);
    await loadTickets(game);
  };

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 6 ? prev : [...prev, id]
    );
  };

  const handleSale = async () => {
    if (!selectedGame || selected.length === 0 || !housieName.trim()) return;
    setSaleLoading(true); setSaleError(""); setSaleSuccess("");
    try {
      const result = await apiFetch<{ booking_id: string; total_amount: number; balance_after: number }>(
        "/api/bookings/agent/direct-sale",
        {
          method: "POST",
          body: JSON.stringify({
            game_id: selectedGame.game_id,
            ticket_ids: selected,
            housie_name: housieName.trim(),
          }),
        }
      );
      setSaleSuccess(
        `✓ Sale confirmed — ₹${result.total_amount} · Booking #${result.booking_id.slice(0, 8).toUpperCase()}`
      );
      setSelected([]);
      setHousieName("");
      setBalance(result.balance_after);
      await Promise.all([loadSales(), loadTickets(selectedGame)]);
    } catch (e) {
      setSaleError(e instanceof Error ? e.message : "Sale failed. Try again.");
    } finally { setSaleLoading(false); }
  };

  const totalAmount = selectedGame ? selectedGame.ticket_price * selected.length : 0;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Direct Sale ── */}
      <div className="bg-bg2 border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Direct Sale</h2>

        {/* Game picker */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
            Select Game
          </label>
          <select
            value={selectedGame?.game_id ?? ""}
            onChange={(e) => selectGame(e.target.value)}
            className="w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active">
            <option value="">— Choose a game —</option>
            {games.map((g) => (
              <option key={g.game_id} value={g.game_id}>
                {g.title} · ₹{g.ticket_price}/ticket · {g.fill_percentage}% sold
              </option>
            ))}
          </select>
        </div>

        {selectedGame && (
          <>
            {/* Ticket grid */}
            <p className="text-xs text-[#9ca3af] mb-3">
              Select up to 6 tickets for the customer.
              {selected.length > 0 && (
                <span className="ml-2 text-gold font-mono">{selected.length} selected · ₹{totalAmount}</span>
              )}
            </p>
            <div className="grid grid-cols-10 gap-1.5 mb-5">
              {tickets.map((t) => {
                const sel = selected.includes(t.ticket_id);
                return (
                  <button
                    key={t.ticket_id}
                    disabled={t.status !== "Available"}
                    onClick={() => toggle(t.ticket_id)}
                    className={`h-9 rounded-lg border text-xs font-mono font-bold transition-all ${
                      sel
                        ? "bg-gold/20 border-gold text-gold scale-105"
                        : t.status === "Sold"
                        ? "bg-bg1 border-border/40 text-[#3b3f4a] cursor-not-allowed"
                        : t.status === "Locked"
                        ? "bg-warning/5 border-warning/20 text-warning/40 cursor-not-allowed"
                        : "bg-bg3 border-border text-[#6b7280] hover:border-gold/40 hover:text-white"
                    }`}>
                    {t.status === "Sold" ? "×" : t.status === "Locked" ? "🔒" : t.ticket_number}
                  </button>
                );
              })}
            </div>

            {/* Name + confirm */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
                  Customer Housie Name
                </label>
                <input
                  value={housieName}
                  onChange={(e) => setHousieName(e.target.value)}
                  placeholder="e.g. LuckyStar7"
                  maxLength={20}
                  className="w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active placeholder:text-[#4b5563]"
                />
              </div>
              <button
                onClick={handleSale}
                disabled={saleLoading || selected.length === 0 || !housieName.trim()}
                className="bg-gold text-forest font-black text-xs px-5 py-2.5 rounded-xl hover:bg-gold-light transition-all disabled:opacity-40 whitespace-nowrap">
                {saleLoading ? "Processing..." : `Sell ${selected.length} · ₹${totalAmount}`}
              </button>
            </div>

            {saleError && <p className="text-danger text-xs mt-2">{saleError}</p>}
            {saleSuccess && <p className="text-success text-xs mt-2">{saleSuccess}</p>}
          </>
        )}

        {games.length === 0 && (
          <p className="text-[#6b7280] text-sm">No active or scheduled games available for sales.</p>
        )}
      </div>

      {/* ── Sales History ── */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Sales History</h2>
        {sales.length === 0 ? (
          <div className="bg-bg2 border border-dashed border-border rounded-2xl p-10 text-center text-[#6b7280] text-sm">
            No sales yet. Use Direct Sale above to sell your first ticket.
          </div>
        ) : (
          <div className="space-y-2">
            {sales.map((s) => (
              <div
                key={s.booking_id}
                className="bg-bg2 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{s.housie_name}</p>
                  <p className="text-xs text-[#6b7280] font-mono">
                    {s.game_title} · #{s.ticket_numbers.join(", #")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-gold">₹{s.total_amount}</p>
                  <p className="text-[10px] text-[#6b7280]">
                    {new Date(s.confirmed_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
