// staff-data.jsx — mock data for the staff backend

const STAFF_KPIS = {
  grossToday: 248600,
  liability: 86400,        // sum of bookie wallet balances
  pendingRecharges: 3,
  activeGames: 4,
  ticketsSold: 1842,
};

const BOOKIES = [
  { name: 'Tashi_BK', town: 'Gangtok', balance: 320, lifetime: 84000, last: '6 min ago', trust: 'High', low: true },
  { name: 'Rinchen_BK', town: 'Darjeeling', balance: 7400, lifetime: 156000, last: '2 min ago', trust: 'High', low: false },
  { name: 'Dorjee_BK', town: 'Kalimpong', balance: 1980, lifetime: 61000, last: '18 min ago', trust: 'Medium', low: false },
  { name: 'Peden_BK', town: 'Namchi', balance: 410, lifetime: 33000, last: '1 hr ago', trust: 'Medium', low: true },
  { name: 'Sonam_BK', town: 'Pelling', balance: 12200, lifetime: 211000, last: 'just now', trust: 'High', low: false },
];

const RECHARGE_QUEUE = [
  { id: 'TXN-9043', bookie: 'Tashi_BK', amount: 5000, ref: 'UPI/4471/SBI', when: '1 min ago' },
  { id: 'TXN-9042', bookie: 'Peden_BK', amount: 3000, ref: 'UPI/2210/HDFC', when: '4 min ago' },
  { id: 'TXN-9041', bookie: 'Dorjee_BK', amount: 8000, ref: 'UPI/8830/ICICI', when: '12 min ago' },
];

const BOOKIE_QUEUE = [
  { id: 'HG481922', name: 'MomoMaster99', tickets: [42, 43], game: 'Sunday Mega Draw', amount: 200, left: 512 },
  { id: 'HG481921', name: 'TeaTime_Tashi', tickets: [108], game: 'Sunday Mega Draw', amount: 100, left: critOrFresh(380) },
];
function critOrFresh(n) { return n; }

const AUDIT = [
  { who: 'superadmin', action: 'Approved Top-Up TXN-9039 (₹10,000)', target: 'Sonam_BK', ip: '49.36.x.x', when: '2 min ago' },
  { who: 'admin_rina', action: 'Created Game #1042 “Sunday Mega Draw”', target: 'game:1042', ip: '103.21.x.x', when: '22 min ago' },
  { who: 'superadmin', action: 'Designated admin_rina as Financial Officer', target: 'user:rina', ip: '49.36.x.x', when: '1 hr ago' },
  { who: 'op_karma', action: 'Started live draw', target: 'game:1039', ip: '157.32.x.x', when: '3 hr ago' },
  { who: 'admin_rina', action: 'Suspended agent Bhola_BK', target: 'user:bhola', ip: '103.21.x.x', when: '5 hr ago' },
];

const GAMES_ADMIN = [
  { id: 1042, title: 'Sunday Mega Draw', time: '8:00 PM', cap: 500, sold: 312, locked: 71, status: 'Scheduled' },
  { id: 1041, title: 'Afternoon Quickie', time: '4:30 PM', cap: 200, sold: 168, locked: 18, status: 'Scheduled' },
  { id: 1039, title: 'Tea-Time Tambola', time: '6:00 PM', cap: 300, sold: 146, locked: 24, status: 'Live' },
  { id: 1038, title: 'Midnight Express', time: '11:00 PM', cap: 250, sold: 250, locked: 0, status: 'Scheduled' },
];

Object.assign(window, {
  STAFF_KPIS, BOOKIES, RECHARGE_QUEUE, BOOKIE_QUEUE, AUDIT, GAMES_ADMIN,
});
