// data.jsx — mock data + tambola ticket generator for Housie Ghar prototype
// Exported to window for use across babel script scopes.

// ── Tambola ticket generator ───────────────────────────────────────────────
// Produces a valid-ish 3x9 matrix: 15 numbers, 5 per row, column ranges
// (col0: 1-9, col1: 10-19 ... col8: 80-90), numbers sorted top→bottom per column.
function colRange(col) {
  if (col === 0) return [1, 9];
  if (col === 8) return [80, 90];
  return [col * 10, col * 10 + 9];
}

function pickColCounts() {
  // 9 columns, each 1..3, summing to 15.
  const counts = new Array(9).fill(1); // sum 9
  let remaining = 6;
  while (remaining > 0) {
    const c = Math.floor(Math.random() * 9);
    if (counts[c] < 3) { counts[c]++; remaining--; }
  }
  return counts;
}

function assignRows(colCounts) {
  // Build 3x9 binary occupancy with row sums == 5 and col sums == colCounts.
  for (let attempt = 0; attempt < 400; attempt++) {
    const grid = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)];
    const rowTotals = [0, 0, 0];
    let ok = true;
    for (let col = 0; col < 9; col++) {
      const need = colCounts[col];
      // candidate rows sorted by current load (prefer emptier rows)
      const rows = [0, 1, 2]
        .filter((r) => rowTotals[r] < 5)
        .sort((a, b) => rowTotals[a] - rowTotals[b] || Math.random() - 0.5);
      if (rows.length < need) { ok = false; break; }
      const chosen = rows.slice(0, need);
      chosen.forEach((r) => { grid[r][col] = 1; rowTotals[r]++; });
    }
    if (ok && rowTotals.every((t) => t === 5)) return grid;
  }
  // Fallback: deterministic safe ticket
  return [
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0, 1, 0, 1, 1].slice(0, 9),
    [1, 1, 0, 1, 1, 1, 0, 0, 0],
  ];
}

function makeTicket(seedId) {
  const colCounts = pickColCounts();
  const occ = assignRows(colCounts);
  const matrix = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
  for (let col = 0; col < 9; col++) {
    const [lo, hi] = colRange(col);
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    // shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const rowsWithCell = [0, 1, 2].filter((r) => occ[r][col]);
    const nums = pool.slice(0, rowsWithCell.length).sort((a, b) => a - b);
    rowsWithCell.forEach((r, i) => { matrix[r][col] = nums[i]; });
  }
  return { id: seedId, matrix };
}

// ── Games feed ──────────────────────────────────────────────────────────────
function prize(label, amount) { return { label, amount }; }

const NOW = Date.now();
const GAMES = [
  {
    id: 'g-sunday',
    title: 'Sunday Mega Draw',
    date: 'Sun, 14 Jun',
    time: '8:00 PM',
    startsAt: NOW + 1000 * 60 * 47 + 1000 * 33, // ~47 min
    price: 100,
    capacity: 500,
    booked: 312,
    locked: 71,
    featured: true,
    status: 'filling',
    prizes: [
      prize('Full House', 15000),
      prize('Top Line', 3000),
      prize('Middle Line', 3000),
      prize('Bottom Line', 3000),
      prize('Quick 5', 2000),
      prize('Lucky 4 Corners', 2500),
    ],
  },
  {
    id: 'g-noon',
    title: 'Afternoon Quickie',
    date: 'Today',
    time: '4:30 PM',
    startsAt: NOW + 1000 * 60 * 60 * 3,
    price: 50,
    capacity: 200,
    booked: 168,
    locked: 18,
    status: 'fast', // ~93%
    prizes: [prize('Full House', 5000), prize('Top Line', 1200), prize('Quick 5', 800)],
  },
  {
    id: 'g-darj',
    title: 'Darjeeling Tea-Time Tambola',
    date: 'Today',
    time: '6:00 PM',
    startsAt: NOW + 1000 * 60 * 60 * 4.5,
    price: 80,
    capacity: 300,
    booked: 122,
    locked: 24,
    status: 'open',
    prizes: [prize('Full House', 8000), prize('Top Line', 2000), prize('Bottom Line', 2000), prize('Quick 5', 1000)],
  },
  {
    id: 'g-mid',
    title: 'Midnight Express',
    date: 'Today',
    time: '11:00 PM',
    startsAt: NOW + 1000 * 60 * 60 * 9,
    price: 120,
    capacity: 250,
    booked: 250,
    locked: 0,
    status: 'sold',
    prizes: [prize('Full House', 10000), prize('Top Line', 2500), prize('Quick 5', 1500)],
  },
  {
    id: 'g-sik',
    title: 'Sikkim Sunrise Special',
    date: 'Mon, 15 Jun',
    time: '9:00 AM',
    startsAt: NOW + 1000 * 60 * 60 * 20,
    price: 60,
    capacity: 400,
    booked: 56,
    locked: 9,
    status: 'open',
    prizes: [prize('Full House', 6000), prize('Top Line', 1500), prize('Quick 5', 900)],
  },
];

// ── Hall of Fame ──────────────────────────────────────────────────────────────
const WINNERS = [
  { name: 'Pemzy_Gangtok', wins: 41, biggest: 15000, town: 'Gangtok' },
  { name: 'TeaTime_Tashi', wins: 37, biggest: 12000, town: 'Darjeeling' },
  { name: 'KalimpongKing', wins: 33, biggest: 10000, town: 'Kalimpong' },
  { name: 'ShillongSher', wins: 29, biggest: 8000, town: 'Shillong' },
  { name: 'MomoMaster99', wins: 26, biggest: 9000, town: 'Gangtok' },
  { name: 'Rinchen_Luck', wins: 22, biggest: 7000, town: 'Pelling' },
  { name: 'DaisyBhutia', wins: 19, biggest: 6500, town: 'Namchi' },
  { name: 'OrangePekoe', wins: 17, biggest: 5000, town: 'Darjeeling' },
];

// ── Live draw recent winners (for live board) ────────────────────────────────
const LIVE_PRIZES = [
  { label: 'Quick 5', amount: 2000, winner: 'MomoMaster99', ticket: 14 },
  { label: 'Top Line', amount: 3000, winner: null, ticket: null },
  { label: 'Middle Line', amount: 3000, winner: null, ticket: null },
  { label: 'Bottom Line', amount: 3000, winner: null, ticket: null },
  { label: 'Lucky 4 Corners', amount: 2500, winner: 'TeaTime_Tashi', ticket: 207 },
  { label: 'Full House', amount: 15000, winner: null, ticket: null },
];

// A cryptographic-feel pre-shuffled sequence (mock). 1..90 shuffled.
function shuffledSequence() {
  const a = [];
  for (let i = 1; i <= 90; i++) a.push(i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Object.assign(window, {
  HG_GAMES: GAMES,
  HG_WINNERS: WINNERS,
  HG_LIVE_PRIZES: LIVE_PRIZES,
  hgMakeTicket: makeTicket,
  hgShuffledSequence: shuffledSequence,
});
