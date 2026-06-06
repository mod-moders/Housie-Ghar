"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { io, Socket } from "socket.io-client";

// Define TypeScript interfaces matching shared models
interface Game {
  game_id: string;
  title: string;
  scheduled_at: string;
  ticket_price: number;
  total_tickets: number;
  sold_count: number;
  locked_count: number;
  available_count: number;
  fill_percentage: number;
  game_status: "Scheduled" | "Live" | "Paused" | "Completed";
  prize_pool: Array<{
    prize_id: number;
    pattern_name: string;
    prize_amount: number;
    claimed: boolean;
    winner_housie_name: string | null;
    claimed_at: string | null;
    split_count: number | null;
    amount_per_winner: number | null;
  }>;
}

interface TicketSquare {
  ticket_id: number;
  ticket_number: number;
  status: "Available" | "Locked" | "Sold";
}

interface BookingDetails {
  booking_id: string;
  locked_until: string;
  agent_phone: string;
  agent_name: string;
  total_amount: number;
  whatsapp_link: string;
  status: "Locked" | "Sold" | "Cancelled" | "Expired";
}

interface AgentBooking {
  booking_id: string;
  housie_name: string;
  game_title: string;
  ticket_numbers: number[];
  total_amount: number;
  locked_until: string;
  time_remaining_ms: number;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"player" | "agent" | "operator">("player");
  const [apiBase, setApiBase] = useState("http://localhost:4000");

  // Connection states
  const [socketConnected, setSocketConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Auth states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authError, setAuthError] = useState("");

  // Game/Player States
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [ticketsGrid, setTicketsGrid] = useState<TicketSquare[]>([]);
  const [selectedTicketNums, setSelectedTicketNums] = useState<number[]>([]);
  const [housieName, setHousieName] = useState("");
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [purchasedTickets, setPurchasedTickets] = useState<any[]>([]);

  // Live Draw & Conductor states
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [gameStatus, setGameStatus] = useState<string>("Scheduled");
  const [prizePool, setPrizePool] = useState<any[]>([]);
  const [drawnListFeed, setDrawnListFeed] = useState<string[]>([]);
  const [winnerCelebration, setWinnerCelebration] = useState<{
    prize: string;
    winner: string;
    amount: number;
  } | null>(null);

  // Agent States
  const [agentQueue, setAgentQueue] = useState<AgentBooking[]>([]);
  const [agentBalance, setAgentBalance] = useState<number>(10000);

  // Operator States
  const [speedMs, setSpeedMs] = useState(8000);

  const sseSourceRef = useRef<EventSource | null>(null);

  // 1. Fetch available games and global initial data
  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  // 2. Setup WebSockets client
  useEffect(() => {
    const socketClient = io(apiBase, {
      withCredentials: true,
      autoConnect: true,
    });

    socketClient.on("connect", () => {
      setSocketConnected(true);
      console.log("🔌 Connected to WebSocket Server");
    });

    socketClient.on("disconnect", () => {
      setSocketConnected(false);
      console.log("🔌 Disconnected from WebSocket Server");
    });

    // Handle incoming draw updates
    socketClient.on("draw_update", (data) => {
      setDrawnNumbers((prev) => {
        if (prev.includes(data.draw_number)) return prev;
        return [...prev, data.draw_number];
      });
      setLastDrawn(data.draw_number);
      setDrawnListFeed((prev) => [`Drew number: ${data.draw_number}`, ...prev]);
    });

    // Handle winner updates
    socketClient.on("winner_announced", (data) => {
      setDrawnListFeed((prev) => [
        `🏆 WINNER! ${data.housie_name} claimed ${data.prize} (₹${data.amount})`,
        ...prev,
      ]);
      setWinnerCelebration({
        prize: data.prize,
        winner: data.housie_name,
        amount: data.amount,
      });
      // Clear celebration after 3.5s
      setTimeout(() => setWinnerCelebration(null), 3500);
      fetchGames();
    });

    // Handle other events
    socketClient.on("paused", () => {
      setGameStatus("Paused");
      setDrawnListFeed((prev) => ["⏸ Conductor Paused the draw", ...prev]);
    });

    socketClient.on("resumed", () => {
      setGameStatus("Live");
      setDrawnListFeed((prev) => ["▶ Conductor Resumed the draw", ...prev]);
    });

    socketClient.on("completed", () => {
      setGameStatus("Completed");
      setDrawnListFeed((prev) => ["🏁 Game completed!", ...prev]);
      fetchGames();
    });

    // Handle agent queues
    socketClient.on("new_booking_request", (data) => {
      setDrawnListFeed((prev) => [`🔔 New booking request from ${data.housie_name} (₹${data.total_amount})`, ...prev]);
      fetchAgentQueue();
    });

    socketClient.on("booking_expired", () => {
      fetchAgentQueue();
    });

    setSocket(socketClient);

    return () => {
      socketClient.disconnect();
    };
  }, []);

  // 3. Connect to SSE Live Stream when a game goes Live
  useEffect(() => {
    if (selectedGame && (selectedGame.game_status === "Live" || selectedGame.game_status === "Paused")) {
      connectSSE(selectedGame.game_id);
    } else {
      disconnectSSE();
    }
    return () => disconnectSSE();
  }, [selectedGame]);

  // Connect SSE
  const connectSSE = (gameId: string) => {
    disconnectSSE();
    console.log(`📡 Connecting to SSE for game ${gameId}`);
    const source = new EventSource(`${apiBase}/api/games/${gameId}/live-stream`);
    sseSourceRef.current = source;

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "initial_state") {
        setDrawnNumbers(data.drawn_numbers || []);
        setGameStatus(data.game_status);
        if (data.drawn_numbers && data.drawn_numbers.length > 0) {
          setLastDrawn(data.drawn_numbers[data.drawn_numbers.length - 1]);
        }
      }
    };

    source.onerror = (err) => {
      console.error("SSE stream error:", err);
      source.close();
    };
  };

  const disconnectSSE = () => {
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
  };

  // Helper APIs
  const fetchGames = async () => {
    try {
      const res = await fetch(`${apiBase}/api/games`);
      if (res.ok) {
        const data = await res.json();
        setGames(data);
        if (selectedGame) {
          const updated = data.find((g: Game) => g.game_id === selectedGame.game_id);
          if (updated) setSelectedGame(updated);
        }
      }
    } catch (e) {
      console.error("Failed to fetch games list", e);
    }
  };

  const selectGame = async (game: Game) => {
    setSelectedGame(game);
    setSelectedTicketNums([]);
    setBooking(null);
    setPurchasedTickets([]);
    setDrawnNumbers([]);
    setLastDrawn(null);
    setGameStatus(game.game_status);

    if (socket) {
      socket.emit("join_game_room", game.game_id);
    }

    // Fetch tickets grid for this game
    try {
      const res = await fetch(`${apiBase}/api/games/${game.game_id}/tickets`);
      if (res.ok) {
        const gridData = await res.json();
        setTicketsGrid(gridData.tickets);
      }
    } catch (e) {
      console.error("Failed to fetch tickets", e);
    }
  };

  // Handle auto login for Admin/Agent/Operator roles
  const handleAutoLogin = async (role: "Agent" | "Operator") => {
    setAuthError("");
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "superadmin@housieghar.local", // default Superadmin contains all roles/privileges
          password: "ChangeMe123!",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const loggedInUser = {
          ...data.user,
          roleName: role, // override role dynamically for test workspace simulation
        };
        setCurrentUser(loggedInUser);
        if (socket) {
          if (role === "Agent") {
            socket.emit("join_agent_room", loggedInUser.userId);
            fetchAgentQueue();
          }
        }
      } else {
        const err = await res.json();
        setAuthError(err.message || "Failed to log in");
      }
    } catch (e) {
      setAuthError("Could not connect to API server");
    }
  };

  // Player booking lock
  const handleLockTickets = async () => {
    if (selectedTicketNums.length === 0 || !housieName) return;

    try {
      const res = await fetch(`${apiBase}/api/bookings/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: selectedGame?.game_id,
          ticket_ids: selectedTicketNums,
          housie_name: housieName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBooking({
          ...data,
          status: "Locked",
        });

        // Start polling for booking status
        startBookingPoll(data.booking_id);
      } else {
        const err = await res.json();
        alert(err.message || "Booking failed");
      }
    } catch (e) {
      alert("Network error occurred during booking.");
    }
  };

  // Poll booking status
  const startBookingPoll = (bookingId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/bookings/status/${bookingId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.booking_status === "Sold") {
            clearInterval(pollInterval);
            setBooking((prev) => (prev ? { ...prev, status: "Sold" } : null));
            fetchGames();
            // Fetch purchased grids
            fetchPurchasedGrids(bookingId);
          } else if (data.booking_status === "Cancelled" || data.booking_status === "Expired") {
            clearInterval(pollInterval);
            setBooking((prev) => (prev ? { ...prev, status: data.booking_status } : null));
            alert(`Booking request was: ${data.booking_status}`);
          }
        }
      } catch (e) {
        console.error("Error polling booking status", e);
      }
    }, 2000);
  };

  const fetchPurchasedGrids = async (bookingId: string) => {
    if (!selectedGame) return;
    try {
      const res = await fetch(`${apiBase}/api/games/${selectedGame.game_id}/tickets`);
      if (res.ok) {
        const gridData = await res.json();
        setTicketsGrid(gridData.tickets);
      }

      // Fetch grids for each locked ticket in selection
      const grids = [];
      for (const ticketId of selectedTicketNums) {
        const gridRes = await fetch(`${apiBase}/api/tickets/${ticketId}`);
        if (gridRes.ok) {
          grids.push(await gridRes.json());
        }
      }
      setPurchasedTickets(grids);
    } catch (e) {
      console.error(e);
    }
  };

  // Agent queue approval/rejection
  const fetchAgentQueue = async () => {
    try {
      const res = await fetch(`${apiBase}/api/bookings/agent/queue`);
      if (res.ok) {
        setAgentQueue(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const approveBooking = async (bookingId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/bookings/agent/${bookingId}/confirm`, { method: "POST" });
      if (res.ok) {
        fetchAgentQueue();
        // Update local simulated wallet
        setAgentBalance((prev) => prev - 50);
      } else {
        const err = await res.json();
        alert(err.message || "Failed to approve booking");
      }
    } catch (e) {
      alert("Error confirming booking");
    }
  };

  const rejectBookingRequest = async (bookingId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/bookings/agent/${bookingId}/reject`, { method: "POST" });
      if (res.ok) {
        fetchAgentQueue();
      }
    } catch (e) {
      alert("Error rejecting booking");
    }
  };

  // Operator game control
  const triggerStartGame = async () => {
    if (!selectedGame) return;
    try {
      const res = await fetch(`${apiBase}/api/games/${selectedGame.game_id}/start`, { method: "POST" });
      if (res.ok) {
        setGameStatus("Live");
        setDrawnListFeed((prev) => ["🚀 Game draw sequence generated. Conductor started.", ...prev]);
        fetchGames();
      }
    } catch (e) {
      alert("Failed to start game");
    }
  };

  const triggerPauseGame = async () => {
    if (!selectedGame) return;
    try {
      const res = await fetch(`${apiBase}/api/games/${selectedGame.game_id}/pause`, { method: "POST" });
      if (res.ok) {
        setGameStatus("Paused");
        fetchGames();
      }
    } catch (e) {
      alert("Failed to pause game");
    }
  };

  const triggerResumeGame = async () => {
    if (!selectedGame) return;
    try {
      const res = await fetch(`${apiBase}/api/games/${selectedGame.game_id}/resume`, { method: "POST" });
      if (res.ok) {
        setGameStatus("Live");
        fetchGames();
      }
    } catch (e) {
      alert("Failed to resume game");
    }
  };

  // Grid check helper
  const isNumberDrawn = (num: number | null) => {
    if (num === null) return false;
    return drawnNumbers.includes(num);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Premium Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-md shadow-amber-500/20">
            <span className="text-xl font-bold text-slate-950">🏠</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 bg-clip-text text-transparent">
              Housie Ghar
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Local Dev Sandbox</p>
          </div>
        </div>

        {/* Tab switcher */}
        <nav className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("player")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activeTab === "player"
                ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            Player Hub
          </button>
          <button
            onClick={() => setActiveTab("agent")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activeTab === "agent"
                ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            Agent Panel
          </button>
          <button
            onClick={() => setActiveTab("operator")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
              activeTab === "operator"
                ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            Operator Board
          </button>
        </nav>

        {/* Server Connections status */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${socketConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-slate-400">WS: {socketConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </header>

      {/* Main Sandbox Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 gap-6">
        {/* Winner Announcement Notification */}
        {winnerCelebration && (
          <div className="fixed inset-x-0 top-20 flex justify-center z-50 animate-bounce">
            <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 p-0.5 rounded-2xl shadow-xl shadow-amber-500/20 max-w-md w-full">
              <div className="bg-slate-950 px-6 py-4 rounded-[14px] text-center">
                <span className="text-3xl">🏆</span>
                <h3 className="text-lg font-extrabold text-amber-400 mt-1 uppercase tracking-wider">
                  {winnerCelebration.prize} Claimed!
                </h3>
                <p className="text-slate-200 text-sm mt-1">
                  Congratulations <span className="font-bold text-white text-base">{winnerCelebration.winner}</span>
                </p>
                <div className="mt-2 inline-block bg-amber-500/10 text-amber-400 font-mono text-xs px-3 py-1 rounded-full border border-amber-500/20">
                  Prize Amount: ₹{winnerCelebration.amount}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Views */}

        {/* 1. PLAYER VIEW */}
        {activeTab === "player" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Game List & Tickets Selector */}
            <div className="lg:col-span-2 space-y-6">
              {/* Game selection card */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-4">Available Draws</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {games.map((g) => (
                    <div
                      key={g.game_id}
                      onClick={() => selectGame(g)}
                      className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 ${
                        selectedGame?.game_id === g.game_id
                          ? "bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/5"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full ${
                          g.game_status === "Live"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30 font-bold animate-pulse"
                            : g.game_status === "Paused"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : g.game_status === "Completed"
                            ? "bg-slate-800 text-slate-400"
                            : "bg-blue-500/10 text-blue-400"
                        }`}>
                          {g.game_status}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          ₹{g.ticket_price} / ticket
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-100 text-base mt-2">{g.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        Tickets Sold: {g.sold_count}/{g.total_tickets} ({g.fill_percentage}%)
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ticket Grid Selector */}
              {selectedGame && (
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-400 tracking-wider uppercase">Select Tickets</h2>
                      <p className="text-xs text-slate-500">Pick up to 6 tickets to lock and book.</p>
                    </div>
                    {selectedTicketNums.length > 0 && (
                      <span className="text-xs bg-amber-500/15 border border-amber-500/20 text-amber-400 font-mono px-2.5 py-1 rounded-full">
                        Selected: {selectedTicketNums.length} ticket(s)
                      </span>
                    )}
                  </div>

                  {/* Grid layout for 120 tickets */}
                  <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-2">
                    {ticketsGrid.map((t) => {
                      const isSelected = selectedTicketNums.includes(t.ticket_id);
                      return (
                        <button
                          key={t.ticket_id}
                          disabled={t.status !== "Available" || gameStatus !== "Scheduled"}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTicketNums((prev) => prev.filter((id) => id !== t.ticket_id));
                            } else {
                              if (selectedTicketNums.length >= 6) {
                                alert("Maximum 6 tickets per booking");
                                return;
                              }
                              setSelectedTicketNums((prev) => [...prev, t.ticket_id]);
                            }
                          }}
                          className={`h-11 rounded-lg border text-xs font-bold font-mono transition-all duration-150 flex items-center justify-center ${
                            isSelected
                              ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/10 scale-105"
                              : t.status === "Sold"
                              ? "bg-slate-950 border-slate-900 text-slate-700 cursor-not-allowed"
                              : t.status === "Locked"
                              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 cursor-not-allowed"
                              : "bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-600 hover:scale-105"
                          }`}
                        >
                          {t.ticket_number}
                        </button>
                      );
                    })}
                  </div>

                  {/* Booking input details */}
                  {selectedTicketNums.length > 0 && !booking && (
                    <div className="mt-6 p-4 rounded-xl border border-slate-850 bg-slate-950/40 flex flex-col sm:flex-row gap-4 items-end justify-between">
                      <div className="w-full sm:max-w-xs">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Housie / Display Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. LuckyStar7"
                          value={housieName}
                          onChange={(e) => setHousieName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                      <button
                        onClick={handleLockTickets}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-extrabold uppercase tracking-wider hover:bg-amber-400 shadow-md transition-all duration-200"
                      >
                        Lock & Proceed to Pay (₹{selectedGame.ticket_price * selectedTicketNums.length})
                      </button>
                    </div>
                  )}

                  {/* Active P2P Booking flow overlay/card */}
                  {booking && (
                    <div className="mt-6 border border-slate-800 rounded-xl overflow-hidden shadow-lg bg-slate-900/80">
                      <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">Booking ID: #{booking.booking_id.substring(0, 8).toUpperCase()}</span>
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full ${
                          booking.status === "Sold"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : booking.status === "Locked"
                            ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse"
                            : "bg-red-500/10 text-red-500"
                        }`}>
                          {booking.status === "Locked" ? "Verifying Payment" : booking.status}
                        </span>
                      </div>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500">P2P Booking Workflow</p>
                          <h4 className="text-sm font-bold text-slate-200 mt-1">
                            Your payment is routed to Agent: <span className="text-amber-400 font-bold">{booking.agent_name}</span>
                          </h4>
                          <p className="text-xs text-slate-400 mt-2 font-mono">
                            Total amount due: <span className="text-white font-extrabold text-base">₹{booking.total_amount}</span>
                          </p>

                          {booking.status === "Locked" && (
                            <a
                              href={booking.whatsapp_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                            >
                              💬 Chat on WhatsApp to Pay
                            </a>
                          )}
                        </div>

                        {/* Interactive local test helper alert */}
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-mono text-amber-500 font-bold">Local Test Quick Tool</span>
                            <p className="text-xs text-slate-400 mt-1 leading-normal">
                              To simulate verification without scanning/sending real cash, switch to the <strong className="text-slate-200">Agent Panel</strong> tab above and click "Approve" for this Booking.
                            </p>
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono mt-3">
                            Soft-lock expires: {new Date(booking.locked_until).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmed Tickets layout */}
                  {purchasedTickets.length > 0 && (
                    <div className="mt-8 space-y-6">
                      <h3 className="text-sm font-bold text-slate-400 tracking-wider uppercase">Your Game Tickets</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {purchasedTickets.map((t) => (
                          <div key={t.ticket_id} className="border border-slate-800 rounded-xl p-4 bg-slate-900 shadow-md">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                              <span className="text-xs font-bold text-amber-400 font-mono">TICKET #{t.ticket_number}</span>
                              <span className="text-[10px] text-slate-500 font-mono">Owner: {t.owner_housie_name}</span>
                            </div>
                            <div className="grid grid-rows-3 gap-1">
                              {/* Row 1 */}
                              <div className="grid grid-cols-9 gap-1">
                                {t.grid_data.row1.map((cell: number | null, idx: number) => (
                                  <div
                                    key={idx}
                                    className={`h-9 rounded flex items-center justify-center font-bold text-xs font-mono transition-all duration-300 ${
                                      cell === null
                                        ? "bg-slate-950 text-slate-800"
                                        : isNumberDrawn(cell)
                                        ? "bg-amber-500 text-slate-950 scale-105 ring-2 ring-amber-400 shadow-md shadow-amber-500/20"
                                        : "bg-slate-800/80 text-slate-200 border border-slate-700/50"
                                    }`}
                                  >
                                    {cell}
                                  </div>
                                ))}
                              </div>
                              {/* Row 2 */}
                              <div className="grid grid-cols-9 gap-1">
                                {t.grid_data.row2.map((cell: number | null, idx: number) => (
                                  <div
                                    key={idx}
                                    className={`h-9 rounded flex items-center justify-center font-bold text-xs font-mono transition-all duration-300 ${
                                      cell === null
                                        ? "bg-slate-950 text-slate-800"
                                        : isNumberDrawn(cell)
                                        ? "bg-amber-500 text-slate-950 scale-105 ring-2 ring-amber-400 shadow-md shadow-amber-500/20"
                                        : "bg-slate-800/80 text-slate-200 border border-slate-700/50"
                                    }`}
                                  >
                                    {cell}
                                  </div>
                                ))}
                              </div>
                              {/* Row 3 */}
                              <div className="grid grid-cols-9 gap-1">
                                {t.grid_data.row3.map((cell: number | null, idx: number) => (
                                  <div
                                    key={idx}
                                    className={`h-9 rounded flex items-center justify-center font-bold text-xs font-mono transition-all duration-300 ${
                                      cell === null
                                        ? "bg-slate-950 text-slate-800"
                                        : isNumberDrawn(cell)
                                        ? "bg-amber-500 text-slate-950 scale-105 ring-2 ring-amber-400 shadow-md shadow-amber-500/20"
                                        : "bg-slate-800/80 text-slate-200 border border-slate-700/50"
                                    }`}
                                  >
                                    {cell}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Side: Live Draw, Drawn Board & Prizes */}
            <div className="space-y-6">
              {/* Draw State circle */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mb-2">Live Drawn Number</span>
                <div className="relative flex items-center justify-center">
                  <div className="h-32 w-32 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/10">
                    <span className="text-5xl font-black text-slate-950 font-mono tracking-tighter">
                      {lastDrawn !== null ? lastDrawn : "--"}
                    </span>
                  </div>
                  {lastDrawn !== null && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                    </span>
                  )}
                </div>
                <div className="mt-4 font-mono text-xs text-slate-400">
                  Total Numbers Drawn: {drawnNumbers.length}/90
                </div>
              </div>

              {/* 90 Numbers Board */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3">Housie Draw Board</h3>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => {
                    const isDrawn = drawnNumbers.includes(num);
                    return (
                      <div
                        key={num}
                        className={`h-7 rounded text-[10px] font-bold font-mono flex items-center justify-center transition-all duration-300 ${
                          isDrawn
                            ? "bg-amber-500 text-slate-950 font-black shadow-inner shadow-black/10 scale-105"
                            : "bg-slate-950 text-slate-700"
                        }`}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prize Categories Status */}
              {selectedGame && (
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase">Prize Pool Categories</h3>
                  <div className="space-y-2">
                    {selectedGame.prize_pool.map((p) => (
                      <div
                        key={p.prize_id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-mono transition-all ${
                          p.claimed
                            ? "bg-slate-950/60 border-slate-900 text-slate-500"
                            : "bg-slate-900/60 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-200">{p.pattern_name}</div>
                          {p.claimed && (
                            <div className="text-[10px] text-amber-500 font-bold mt-0.5">
                              Winner: {p.winner_housie_name}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-100">₹{p.prize_amount}</span>
                          <div className="text-[9px] uppercase font-mono mt-0.5">
                            {p.claimed ? "Claimed" : "Active"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. AGENT PANEL */}
        {activeTab === "agent" && (
          <div className="space-y-6">
            {/* Agent login selector */}
            {!currentUser || currentUser.roleName !== "Agent" ? (
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-sm text-center max-w-md mx-auto">
                <span className="text-3xl">🔑</span>
                <h3 className="text-lg font-bold text-slate-100 mt-2">Agent Simulation Login</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">
                  Log in as the default sandbox Agent to view and approve pending ticket bookings.
                </p>
                <button
                  onClick={() => handleAutoLogin("Agent")}
                  className="w-full py-2 px-4 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-amber-400 shadow-md transition-all uppercase tracking-wider"
                >
                  Login as Agent
                </button>
                {authError && <p className="text-xs text-red-500 font-mono mt-3">{authError}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Agent Profile & Wallet */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm h-fit space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase">Agent Sandbox Profile</h3>
                  <div>
                    <p className="text-xs text-slate-500">Name</p>
                    <p className="text-sm font-bold text-slate-200">{currentUser.fullName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Sandbox Wallet Balance</p>
                    <p className="text-xl font-black text-amber-400 font-mono">₹{agentBalance.toLocaleString()}</p>
                    <span className="text-[10px] text-slate-500">Auto-deducted upon ticket approval</span>
                  </div>
                </div>

                {/* Agent Approval Queue */}
                <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 tracking-wider uppercase">Pending Booking Queue</h3>
                  {agentQueue.length === 0 ? (
                    <div className="p-8 text-center text-slate-600 border border-dashed border-slate-850 rounded-xl">
                      No pending bookings to approve.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agentQueue.map((req) => (
                        <div key={req.booking_id} className="border border-slate-800 rounded-xl p-4 bg-slate-950/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-200 font-mono">
                                Player: {req.housie_name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-0.5 rounded">
                                ID: #{req.booking_id.substring(0, 8).toUpperCase()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              Game: <strong className="text-slate-300">{req.game_title}</strong>
                            </p>
                            <p className="text-xs text-slate-400 font-mono">
                              Tickets: {req.ticket_numbers.map((n) => `#${n}`).join(", ")}
                            </p>
                            <p className="text-xs text-amber-500 font-bold font-mono">
                              Total Cost: ₹{req.total_amount}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <button
                              onClick={() => approveBooking(req.booking_id)}
                              className="flex-1 md:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-all uppercase tracking-wider"
                            >
                              Approve Pay
                            </button>
                            <button
                              onClick={() => rejectBookingRequest(req.booking_id)}
                              className="flex-1 md:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-all uppercase tracking-wider border border-slate-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. OPERATOR VIEW */}
        {activeTab === "operator" && (
          <div className="space-y-6">
            {!currentUser || currentUser.roleName !== "Operator" ? (
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 shadow-sm text-center max-w-md mx-auto">
                <span className="text-3xl">🎮</span>
                <h3 className="text-lg font-bold text-slate-100 mt-2">Operator Simulation Login</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">
                  Log in as the default sandbox Operator to start the game conduction engine draw sequence.
                </p>
                <button
                  onClick={() => handleAutoLogin("Operator")}
                  className="w-full py-2 px-4 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-amber-400 shadow-md transition-all uppercase tracking-wider"
                >
                  Login as Operator
                </button>
                {authError && <p className="text-xs text-red-500 font-mono mt-3">{authError}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Conductor Actions */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm h-fit space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase">Live Conductor Board</h3>
                  {selectedGame ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] text-slate-500 font-mono">Current Game</p>
                        <p className="text-sm font-extrabold text-slate-200">{selectedGame.title}</p>
                      </div>

                      <div className="flex flex-col gap-2">
                        {gameStatus === "Scheduled" && (
                          <button
                            onClick={triggerStartGame}
                            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg transition-all uppercase tracking-widest shadow-md"
                          >
                            🚀 Start Draw Sequence
                          </button>
                        )}
                        {gameStatus === "Live" && (
                          <button
                            onClick={triggerPauseGame}
                            className="w-full py-2.5 px-4 bg-yellow-600 hover:bg-yellow-500 text-white font-extrabold text-xs rounded-lg transition-all uppercase tracking-widest shadow-md"
                          >
                            ⏸ Pause Draw
                          </button>
                        )}
                        {gameStatus === "Paused" && (
                          <button
                            onClick={triggerResumeGame}
                            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg transition-all uppercase tracking-widest shadow-md"
                          >
                            ▶ Resume Draw
                          </button>
                        )}
                        {gameStatus === "Completed" && (
                          <div className="text-center p-3 bg-slate-950 rounded-lg text-slate-500 border border-slate-900 text-xs font-mono font-bold">
                            🏁 Game completed
                          </div>
                        )}
                      </div>

                      {/* Speed Slider */}
                      {gameStatus !== "Completed" && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase font-mono mb-2">
                            Draw Interval Speed ({speedMs / 1000}s)
                          </label>
                          <input
                            type="range"
                            min="5000"
                            max="12000"
                            step="1000"
                            value={speedMs}
                            onChange={async (e) => {
                              const ms = parseInt(e.target.value, 10);
                              setSpeedMs(ms);
                              // call api
                              try {
                                await fetch(`${apiBase}/api/games/${selectedGame.game_id}/speed`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ interval_ms: ms }),
                                });
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Select a Game on the Player Hub first.</p>
                  )}
                </div>

                {/* Conductor log feed */}
                <div className="md:col-span-2 bg-slate-900/40 border border-slate-900 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 tracking-wider uppercase">Live Conductor Console Log</h3>
                  <div className="h-64 bg-slate-950/80 rounded-xl border border-slate-900 p-4 font-mono text-xs text-emerald-400 space-y-2 overflow-y-auto">
                    {drawnListFeed.length === 0 ? (
                      <p className="text-slate-700 italic">No events generated yet.</p>
                    ) : (
                      drawnListFeed.map((feed, idx) => <p key={idx}>{`> ${feed}`}</p>)
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-6 text-center text-xs text-slate-600 font-mono">
        © 2026 Housie Ghar. local sandbox environment. Certified fair play RNG.
      </footer>
    </div>
  );
}
