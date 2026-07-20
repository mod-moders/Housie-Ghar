/**
 * Generates a shareable JPEG poster (Canvas 2D, no DOM-capture dependency) plus
 * a matching prewritten WhatsApp caption, for a scheduled game announcement or
 * a completed game's winners list. Used by the Operator's "Share to WhatsApp"
 * section — see components/staff/OperatorSections.tsx.
 *
 * Visual design mirrors the live site's actual tokens rather than approximating
 * them: the real circular logo badge, the real brand palette (pink accent / gold
 * CTA / cyan highlight — see .hg-root in globals.css), Space Grotesk + DM Sans +
 * JetBrains Mono at the same weights the site uses, and hand-drawn stroke icons
 * matching components/Icon.tsx instead of native OS emoji (which render
 * inconsistently across platforms and don't match the site's line-icon style).
 */
import type { GameSummary } from "./types";

const INK = "#08090d";
const GOLD = "#f4c95d";
const GOLD_DIM = "#c9a24a";
const PINK = "#ff4fa8";
const CYAN = "#5fd4e8";
const WHITE = "#ffffff";
const DIM = "#b7bccb";

const SITE_URL = "www.housieghar.in";
const LOGO_SRC = "/HG Secondary.png";

/* ── shared helpers ──────────────────────────────────────────────────── */

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}/-`;
}

const PRIZE_EMOJI: Record<string, string> = {
  "full house": "🥇",
  "1st full house": "🥇",
  "2nd full house": "🥈",
  "3rd full house": "🥉",
  "top line": "⬆️",
  "middle line": "➡️",
  "bottom line": "⬇️",
  "corner": "🎯",
  "quick 7": "⚡",
  "early 5": "🍀",
  "star": "⭐",
  "box bonus": "📦",
};

function prizeEmoji(pattern: string): string {
  return PRIZE_EMOJI[pattern.trim().toLowerCase()] ?? "🎁";
}

interface TimeSegment {
  emoji: string;
  label: string;
  greeting: string;
  signoff: string;
}

function timeSegment(date: Date): TimeSegment {
  const h = date.getHours();
  if (h < 12) return { emoji: "🌅", label: "Morning", greeting: "Morning fun, let's get it done!", signoff: "Good Morning ☀️" };
  if (h < 17) return { emoji: "🌤️", label: "Afternoon", greeting: "Afternoon fun, let's get it done!", signoff: "Enjoy the rest of your day! 🌤️" };
  if (h < 20) return { emoji: "🌇", label: "Evening", greeting: "Evening fun, let's get it done!", signoff: "Have a wonderful evening! 🌇" };
  return { emoji: "🌙", label: "Night", greeting: "Night fun, let's get it done!", signoff: "Good Night 😴" };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} · ${timeStr}`;
  } catch {
    return iso;
  }
}

/* ── captions (unchanged — this is WhatsApp text, emoji are fine there) ─ */

export function buildScheduledCaption(game: GameSummary): string {
  const when = new Date(game.scheduled_at);
  const seg = timeSegment(when);
  const time = fmtTime(game.scheduled_at);
  const prizeLines = game.prize_pool
    .map((p) => `${prizeEmoji(p.pattern_name)} ${p.pattern_name}: ${inr(p.prize_amount)}`)
    .join("\n");

  return [
    `${seg.emoji} Get Ready for the '${game.title}' game ${seg.emoji}`,
    ``,
    `${seg.greeting} at ${time} today! Serious cash prizes are waiting to be claimed today at Housie Ghar's ${seg.label} Game. 🏠🔥`,
    ``,
    `We are hosting an exclusive ${seg.label.toLowerCase()} game, and spots are extremely limited. Only ${game.total_tickets} Tickets! Grab yours before they sell out!`,
    ``,
    `💸 Today's Prize Pool:`,
    ``,
    prizeLines,
    ``,
    `🎟️ Tickets: BUY TICKETS @ ${inr(game.ticket_price)} ONLY`,
    ``,
    `Pair your ${seg.label.toLowerCase()} with a winning ticket. Secure your lucky numbers and let the fun begin!`,
    ``,
    `👇 BOOK NOW:`,
    `🌐 ${SITE_URL}`,
  ].join("\n");
}

export function buildWinnersCaption(game: GameSummary): string {
  const when = new Date(game.completed_at ?? game.scheduled_at);
  const seg = timeSegment(when);
  return [
    `🌝 ${game.title} WINNERS 🏆`,
    ``,
    `All the rewards have been distributed successfully.`,
    ``,
    `Thank you everyone for joining and congratulations to the winners 🎉`,
    ``,
    seg.signoff,
  ].join("\n");
}

/* ── canvas drawing primitives ───────────────────────────────────────── */

const W = 1080;
const H = 1350;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let cachedLogo: HTMLImageElement | null | undefined;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (cachedLogo !== undefined) return Promise.resolve(cachedLogo);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cachedLogo = img; resolve(img); };
    img.onerror = () => { cachedLogo = null; resolve(null); };
    img.src = LOGO_SRC;
  });
}

function paintBackground(ctx: CanvasRenderingContext2D, bgImage: HTMLImageElement | null) {
  if (bgImage) {
    const canvasRatio = W / H;
    const imageRatio = bgImage.width / bgImage.height;
    let sx = 0, sy = 0, sw = bgImage.width, sh = bgImage.height;
    if (imageRatio > canvasRatio) {
      sw = bgImage.height * canvasRatio;
      sx = (bgImage.width - sw) / 2;
    } else {
      sh = bgImage.width / canvasRatio;
      sy = (bgImage.height - sh) / 2;
    }
    ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, W, H);

    // apply a linear dark overlay gradient to ensure text readability
    const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
    overlayGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    overlayGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.7)");
    overlayGrad.addColorStop(1, "rgba(0, 0, 0, 0.9)");
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0c0a12");
    g.addColorStop(0.5, "#140d1c");
    g.addColorStop(1, "#0a0810");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // tri-color glow: pink upper-left, cyan upper-right
  const pinkGlow = ctx.createRadialGradient(W * 0.28, 130, 20, W * 0.28, 130, 520);
  pinkGlow.addColorStop(0, "rgba(255,79,168,0.20)");
  pinkGlow.addColorStop(1, "rgba(255,79,168,0)");
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, W, H);

  const cyanGlow = ctx.createRadialGradient(W * 0.78, 260, 20, W * 0.78, 260, 420);
  cyanGlow.addColorStop(0, "rgba(95,212,232,0.14)");
  cyanGlow.addColorStop(1, "rgba(95,212,232,0)");
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, W, H);

  // faint scattered "lottery ball" dots for texture
  ctx.save();
  ctx.globalAlpha = 0.10;
  const dots: [number, number, number][] = [
    [90, 260, 7], [980, 210, 5], [60, 640, 5], [1010, 610, 8],
    [50, 980, 6], [1000, 1020, 5], [130, 1180, 5], [930, 1160, 7],
  ];
  for (const [dx, dy, dr] of dots) {
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
  }
  ctx.restore();

  // border frame
  ctx.strokeStyle = "rgba(244,201,93,0.35)";
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();
}

async function paintHeader(ctx: CanvasRenderingContext2D): Promise<number> {
  const logo = await loadLogo();
  const logoSize = 190;
  const logoY = 40;
  if (logo) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(logo, W / 2 - logoSize / 2, logoY, logoSize, logoSize);
    ctx.restore();

    return logoY + logoSize + 20;
  }

  // fallback if the logo fails to load: plain wordmark, still on-brand
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 32px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("HOUSIE GHAR", W / 2, logoY + 40);
  return logoY + 70;
}

function paintFooter(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = "center";
  ctx.font = "600 24px 'DM Sans', system-ui, sans-serif";
  ctx.fillStyle = DIM;
  ctx.fillText(SITE_URL, W / 2, H - 56);
}

/* ── stroke icon set — mirrors components/Icon.tsx's line-icon language ── */

type IconKind = "medal-1" | "medal-2" | "medal-3" | "arrow-up" | "arrow-right" | "arrow-down" | "target" | "bolt" | "star" | "gift" | "trophy" | "ticket";

function prizeIconKind(pattern: string): IconKind {
  const p = pattern.trim().toLowerCase();
  if (p.includes("1st full house")) return "medal-1";
  if (p.includes("2nd full house")) return "medal-2";
  if (p.includes("3rd full house")) return "medal-3";
  if (p === "full house") return "medal-1";
  if (p.includes("top line")) return "arrow-up";
  if (p.includes("middle line")) return "arrow-right";
  if (p.includes("bottom line")) return "arrow-down";
  if (p.includes("corner")) return "target";
  if (p.includes("quick") || p.includes("early")) return "bolt";
  if (p.includes("star")) return "star";
  return "gift";
}

const MEDAL_COLOR: Record<string, string> = { "medal-1": "#f4c95d", "medal-2": "#c9d2df", "medal-3": "#d3874a" };

function drawIcon(ctx: CanvasRenderingContext2D, kind: IconKind, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = size / 2;

  switch (kind) {
    case "arrow-up":
    case "arrow-down": {
      const dir = kind === "arrow-up" ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(0, s * -dir);
      ctx.lineTo(0, s * dir);
      ctx.moveTo(-s * 0.5, s * dir * 0.25);
      ctx.lineTo(0, s * dir);
      ctx.lineTo(s * 0.5, s * dir * 0.25);
      ctx.stroke();
      break;
    }
    case "arrow-right": {
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.moveTo(s * 0.25, -s * 0.5);
      ctx.lineTo(s, 0);
      ctx.lineTo(s * 0.25, s * 0.5);
      ctx.stroke();
      break;
    }
    case "target": {
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "bolt": {
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -s);
      ctx.lineTo(-s * 0.35, s * 0.1);
      ctx.lineTo(s * 0.05, s * 0.1);
      ctx.lineTo(-s * 0.15, s);
      ctx.lineTo(s * 0.35, -s * 0.1);
      ctx.lineTo(0, -s * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "star": {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s : s * 0.42;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "gift": {
      roundRect(ctx, -s * 0.85, -s * 0.1, s * 1.7, s * 1.1, s * 0.14);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.3); ctx.lineTo(s * 0.85, s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.32, s * 0.26, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.32, s * 0.26, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "trophy": {
      roundRect(ctx, -s * 0.5, -s, s, s * 0.85, s * 0.12);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.8); ctx.bezierCurveTo(-s * 1.15, -s * 0.8, -s * 1.15, -s * 0.1, -s * 0.42, -s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.8); ctx.bezierCurveTo(s * 1.15, -s * 0.8, s * 1.15, -s * 0.1, s * 0.42, -s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(0, s * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.35); ctx.lineTo(s * 0.42, s * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.62, s); ctx.lineTo(s * 0.62, s); ctx.stroke();
      break;
    }
    case "ticket": {
      // rounded rect with a semicircular notch bitten into each side — a
      // clearer, more universally-recognized ticket silhouette than a plain
      // divided box.
      const hw = s, hh = s * 0.58, nr = s * 0.34, cr = s * 0.14;
      ctx.beginPath();
      ctx.moveTo(-hw + cr, -hh);
      ctx.lineTo(hw - cr, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + cr);
      ctx.lineTo(hw, -nr);
      ctx.arc(hw, 0, nr, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(hw, hh - cr);
      ctx.quadraticCurveTo(hw, hh, hw - cr, hh);
      ctx.lineTo(-hw + cr, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - cr);
      ctx.lineTo(-hw, nr);
      ctx.arc(-hw, 0, nr, Math.PI / 2, -Math.PI / 2, true);
      ctx.lineTo(-hw, -hh + cr);
      ctx.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([s * 0.14, s * 0.14]);
      ctx.beginPath(); ctx.moveTo(0, -hh * 0.6); ctx.lineTo(0, hh * 0.6); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "medal-1": case "medal-2": case "medal-3": {
      // Solid medallion + inner ring + small star — a ribbon reads as stray
      // "ears" at icon scale, so it's dropped in favor of a cleaner disc.
      const fill = MEDAL_COLOR[kind];
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.32)";
      ctx.lineWidth = Math.max(1.5, size * 0.045);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.68, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.34 : s * 0.14;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/* ── content-fitted prize card (no dead space, regardless of row count) ── */

interface PrizeRowSpec {
  kind: IconKind;
  color: string;
  label: string;
  sub?: string;
  amount: string;
}

function paintPrizeCard(
  ctx: CanvasRenderingContext2D,
  opts: { top: number; heading: string; headingColor: string; rows: PrizeRowSpec[]; rowHeight: number; emptyMessage?: string }
): number {
  const { top, heading, headingColor, rows, rowHeight, emptyMessage } = opts;
  const headingH = 78;
  const contentH = rows.length > 0 ? rows.length * rowHeight + 24 : 90;
  const cardH = headingH + contentH;
  const left = 90;
  const cardW = W - 180;

  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.strokeStyle = "rgba(244,201,93,0.4)";
  ctx.lineWidth = 2;
  roundRect(ctx, left, top, cardW, cardH, 26);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  roundRect(ctx, left, top, cardW, headingH, 26);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(left, top, cardW, headingH);
  ctx.restore();
  ctx.strokeStyle = "rgba(244,201,93,0.25)";
  ctx.beginPath(); ctx.moveTo(left + 20, top + headingH); ctx.lineTo(left + cardW - 20, top + headingH); ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = headingColor;
  ctx.font = "700 30px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(heading, W / 2, top + headingH / 2 + 11);

  if (rows.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = DIM;
    ctx.font = "600 30px 'DM Sans', system-ui, sans-serif";
    ctx.fillText(emptyMessage ?? "No prizes yet.", W / 2, top + headingH + contentH / 2 + 10);
    return top + cardH;
  }

  const rowStart = top + headingH + 18;
  rows.forEach((row, i) => {
    const rowTop = rowStart + i * rowHeight;
    const midY = rowTop + rowHeight / 2;

    drawIcon(ctx, row.kind, left + 54, midY - (row.sub ? 6 : 0), 34, row.color);

    ctx.textAlign = "left";
    ctx.fillStyle = WHITE;
    ctx.font = "700 32px 'Space Grotesk', system-ui, sans-serif";
    ctx.fillText(row.label, left + 96, midY - (row.sub ? 8 : -10));

    if (row.sub) {
      ctx.fillStyle = DIM;
      ctx.font = "500 22px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(row.sub, left + 96, midY + 24);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = GOLD;
    ctx.font = "700 32px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText(row.amount, left + cardW - 32, midY + 10);

    if (i < rows.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 24, rowTop + rowHeight);
      ctx.lineTo(left + cardW - 24, rowTop + rowHeight);
      ctx.stroke();
    }
  });

  return top + cardH;
}

/* ── scheduled-game poster ───────────────────────────────────────────── */

async function drawScheduledPoster(ctx: CanvasRenderingContext2D, game: GameSummary, bgImage: HTMLImageElement | null) {
  paintBackground(ctx, bgImage);
  let y = await paintHeader(ctx);

  const seg = timeSegment(new Date(game.scheduled_at));

  y += 12;
  ctx.textAlign = "center";
  ctx.fillStyle = PINK;
  ctx.font = "700 24px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(`GET READY — ${seg.label.toUpperCase()} GAME`, W / 2, y);
  y += 44;

  ctx.fillStyle = GOLD;
  ctx.font = "700 52px 'Space Grotesk', system-ui, sans-serif";
  const titleLines = wrapText(ctx, game.title, W - 160);
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 60;
  }
  y += 8;

  ctx.fillStyle = CYAN;
  ctx.font = "600 26px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(`${fmtDateTime(game.scheduled_at)}  ·  ${game.total_tickets} TICKETS ONLY`, W / 2, y);
  y += 40;

  const rows: PrizeRowSpec[] = game.prize_pool.map((p) => ({
    kind: prizeIconKind(p.pattern_name),
    color: p.pattern_name.toLowerCase().includes("full house") ? (MEDAL_COLOR[prizeIconKind(p.pattern_name)] ?? GOLD) : PINK,
    label: p.pattern_name,
    amount: inr(p.prize_amount),
  }));

  const rowHeight = rows.length > 6 ? 64 : rows.length > 4 ? 70 : 74;

  const cardBottom = paintPrizeCard(ctx, {
    top: y,
    heading: "TODAY'S PRIZE POOL",
    headingColor: PINK,
    rows,
    rowHeight,
  });

  const footerY = H - 52;
  const subtextY = Math.min(cardBottom + 130, footerY - 44);
  const pillY = Math.min(cardBottom + 24, subtextY - 100);
  const pillH = 80;
  const grad = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
  grad.addColorStop(0, GOLD);
  grad.addColorStop(1, GOLD_DIM);
  ctx.fillStyle = grad;
  roundRect(ctx, 120, pillY, W - 240, pillH, pillH / 2);
  ctx.fill();

  drawIcon(ctx, "ticket", W / 2 - 190, pillY + pillH / 2, 32, INK);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "700 32px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(`TICKETS @ ${inr(game.ticket_price)} ONLY`, W / 2 + 24, pillY + pillH / 2 + 11);

  ctx.fillStyle = DIM;
  ctx.font = "italic 500 26px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("The entire town is playing! Are you?", W / 2, subtextY);

  paintFooter(ctx);
}

/* ── winners poster ──────────────────────────────────────────────────── */

async function drawWinnersPoster(ctx: CanvasRenderingContext2D, game: GameSummary, bgImage: HTMLImageElement | null) {
  paintBackground(ctx, bgImage);
  let y = await paintHeader(ctx);

  y += 12;
  drawIcon(ctx, "trophy", W / 2 - 150, y - 12, 34, GOLD);
  drawIcon(ctx, "trophy", W / 2 + 150, y - 12, 34, GOLD);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 34px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("WINNERS", W / 2, y);
  y += 48;

  ctx.fillStyle = WHITE;
  ctx.font = "700 52px 'Space Grotesk', system-ui, sans-serif";
  const titleLines = wrapText(ctx, game.title, W - 160);
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 60;
  }
  y += 8;

  const gameDateStr = fmtDateTime(game.scheduled_at ?? game.completed_at);
  if (gameDateStr) {
    ctx.fillStyle = CYAN;
    ctx.font = "600 24px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText(gameDateStr, W / 2, y);
    y += 38;
  } else {
    y += 10;
  }

  const claimed = game.prize_pool.filter((p) => p.claimed);
  const rows: PrizeRowSpec[] = claimed.map((p) => {
    const name = p.winner_housie_name ?? "—";
    const sub = name.includes("(") || !p.winner_ticket_number ? name : `${name} (${p.winner_ticket_number})`;
    return {
      kind: prizeIconKind(p.pattern_name),
      color: p.pattern_name.toLowerCase().includes("full house") ? (MEDAL_COLOR[prizeIconKind(p.pattern_name)] ?? GOLD) : PINK,
      label: p.pattern_name,
      sub,
      amount: inr(p.prize_amount),
    };
  });

  const rowHeight = claimed.length > 6 ? 72 : claimed.length > 4 ? 80 : 88;

  const cardBottom = paintPrizeCard(ctx, {
    top: y,
    heading: "WINNING TICKETS",
    headingColor: GOLD,
    rows,
    rowHeight,
    emptyMessage: "No prizes were claimed this round.",
  });

  const footerY = H - 52;
  const subtextY = Math.min(cardBottom + 84, footerY - 44);
  const congratsY = subtextY - 42;

  ctx.textAlign = "center";
  ctx.fillStyle = PINK;
  ctx.font = "700 30px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("Congratulations to all our winners! 🎉", W / 2, congratsY);

  ctx.fillStyle = DIM;
  ctx.font = "italic 500 28px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("Ready for more? Book your next game today!", W / 2, subtextY);

  paintFooter(ctx);
}

/* ── public entry points ─────────────────────────────────────────────── */

export type PosterKind = "scheduled" | "winners";

export async function generatePosterBlob(kind: PosterKind, game: GameSummary): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser");

  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* proceed with fallback fonts */ }
  }

  // Load preset background if match
  const title = game.title.trim().toLowerCase();
  let bgPath = "";
  if (title.includes("high noon")) bgPath = "/presets/High Noon Fortune.jpg";
  else if (title.includes("prime time")) bgPath = "/presets/Prime Time.jpg";
  else if (title.includes("snack & stack") || title.includes("snack")) bgPath = "/presets/Snack & Stack.jpg";
  else if (title.includes("sundown")) bgPath = "/presets/Sundown Showdown.jpg";

  let bgImage: HTMLImageElement | null = null;
  if (bgPath) {
    bgImage = await loadImage(bgPath);
  }

  if (kind === "scheduled") await drawScheduledPoster(ctx, game, bgImage);
  else await drawWinnersPoster(ctx, game, bgImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to render poster image"))),
      "image/jpeg",
      0.92
    );
  });
}

export interface PosterResult {
  filename: string;
  caption: string;
}

/**
 * Generates the poster image and always downloads it as a JPEG — no OS share
 * sheet involved, since that path is unpredictable (some browsers hand the
 * caption off silently with no way to recover it if the operator picks
 * anything other than WhatsApp, or don't support file-sharing at all).
 * Returns the prewritten caption so the caller can keep it visible on screen
 * for the operator to copy or open in WhatsApp themselves.
 */
export async function downloadPoster(kind: PosterKind, game: GameSummary): Promise<PosterResult> {
  const blob = await generatePosterBlob(kind, game);
  const caption = kind === "scheduled" ? buildScheduledCaption(game) : buildWinnersCaption(game);
  const filename = `${game.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${kind}.jpg`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return { filename, caption };
}
