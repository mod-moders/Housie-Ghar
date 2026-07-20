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

function drawParticleSparkles(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Scattered sparkles (stars & circles) for celebration ambiance
  const particles: [number, number, number, string, "star" | "circle" | "rect"][] = [
    [80, 140, 6, GOLD, "star"],
    [1000, 160, 8, PINK, "star"],
    [140, 320, 5, CYAN, "circle"],
    [940, 340, 7, GOLD, "rect"],
    [65, 580, 7, GOLD, "star"],
    [1015, 590, 6, PINK, "circle"],
    [90, 820, 5, CYAN, "circle"],
    [990, 840, 8, GOLD, "star"],
    [120, 1140, 7, PINK, "rect"],
    [960, 1120, 6, GOLD, "star"],
    [240, 1260, 5, CYAN, "circle"],
    [840, 1270, 7, GOLD, "circle"],
  ];

  for (const [px, py, pr, pColor, pShape] of particles) {
    ctx.fillStyle = pColor;
    ctx.strokeStyle = pColor;
    ctx.globalAlpha = 0.45;

    if (pShape === "circle") {
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    } else if (pShape === "rect") {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pr, -pr, pr * 2, pr * 2);
      ctx.restore();
    } else if (pShape === "star") {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? pr : pr * 0.4;
        const a = (Math.PI / 4) * i;
        const x = px + Math.cos(a) * r;
        const y = py + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
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

    // Vignette dark gradient overlay for optimal readability
    const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
    overlayGrad.addColorStop(0, "rgba(8, 7, 14, 0.65)");
    overlayGrad.addColorStop(0.4, "rgba(10, 8, 18, 0.82)");
    overlayGrad.addColorStop(1, "rgba(6, 5, 10, 0.95)");
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0b0914");
    g.addColorStop(0.35, "#150f24");
    g.addColorStop(0.7, "#120c1d");
    g.addColorStop(1, "#08060e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Premium radial ambient glows: gold top-center halo, pink upper-left, cyan upper-right
  const goldHalo = ctx.createRadialGradient(W / 2, 160, 10, W / 2, 160, 480);
  goldHalo.addColorStop(0, "rgba(244, 201, 93, 0.22)");
  goldHalo.addColorStop(0.6, "rgba(244, 201, 93, 0.05)");
  goldHalo.addColorStop(1, "rgba(244, 201, 93, 0)");
  ctx.fillStyle = goldHalo;
  ctx.fillRect(0, 0, W, H);

  const pinkGlow = ctx.createRadialGradient(W * 0.22, 220, 20, W * 0.22, 220, 520);
  pinkGlow.addColorStop(0, "rgba(255,79,168,0.18)");
  pinkGlow.addColorStop(1, "rgba(255,79,168,0)");
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, W, H);

  const cyanGlow = ctx.createRadialGradient(W * 0.78, 320, 20, W * 0.78, 320, 480);
  cyanGlow.addColorStop(0, "rgba(95,212,232,0.14)");
  cyanGlow.addColorStop(1, "rgba(95,212,232,0)");
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, W, H);

  // Sparkles texture
  drawParticleSparkles(ctx);

  // Outer dual-line border frame with rounded corners
  ctx.save();
  ctx.strokeStyle = "rgba(244,201,93,0.45)";
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 32, 32, W - 64, H - 64, 22);
  ctx.stroke();
  ctx.restore();
}

async function paintHeader(ctx: CanvasRenderingContext2D): Promise<number> {
  const logo = await loadLogo();
  const logoSize = 230;
  const logoY = 44;
  if (logo) {
    ctx.save();
    // Radial glowing backdrop for logo
    const logoGlow = ctx.createRadialGradient(W / 2, logoY + logoSize / 2, 20, W / 2, logoY + logoSize / 2, 160);
    logoGlow.addColorStop(0, "rgba(244, 201, 93, 0.25)");
    logoGlow.addColorStop(1, "rgba(244, 201, 93, 0)");
    ctx.fillStyle = logoGlow;
    ctx.fillRect(W / 2 - 200, logoY - 40, 400, logoSize + 80);

    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(logo, W / 2 - logoSize / 2, logoY, logoSize, logoSize);
    ctx.restore();

    return logoY + logoSize + 22;
  }

  // fallback wordmark
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 36px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("HOUSIE GHAR", W / 2, logoY + 40);
  return logoY + 80;
}

function paintFooter(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const footerY = H - 68;
  const footerW = 340;
  const footerH = 44;

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = "rgba(244, 201, 93, 0.3)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, W / 2 - footerW / 2, footerY - footerH / 2, footerW, footerH, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.font = "700 22px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillStyle = GOLD;
  ctx.fillText(`🌐 ${SITE_URL}`, W / 2, footerY + 7);
  ctx.restore();
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
  ctx.lineWidth = Math.max(2.2, size * 0.1);
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

/* ── content-fitted prize card (glassmorphic aesthetic with badge icons) ── */

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
  const headingH = 82;
  const contentH = rows.length > 0 ? rows.length * rowHeight + 24 : 100;
  const cardH = headingH + contentH;
  const left = 80;
  const cardW = W - 160;

  ctx.save();
  // Glassmorphic Card Container: Dark frosted glass fill + double golden outline
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;

  ctx.fillStyle = "rgba(18, 15, 28, 0.85)";
  ctx.strokeStyle = "rgba(244, 201, 93, 0.45)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, left, top, cardW, cardH, 28);
  ctx.fill();
  ctx.stroke();

  // Inner subtle border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, left + 4, top + 4, cardW - 8, cardH - 8, 24);
  ctx.stroke();
  ctx.restore();

  // Header Banner
  ctx.save();
  roundRect(ctx, left, top, cardW, headingH, 28);
  ctx.clip();
  const headGrad = ctx.createLinearGradient(left, top, left + cardW, top);
  headGrad.addColorStop(0, "rgba(244, 201, 93, 0.12)");
  headGrad.addColorStop(0.5, "rgba(255, 79, 168, 0.12)");
  headGrad.addColorStop(1, "rgba(244, 201, 93, 0.12)");
  ctx.fillStyle = headGrad;
  ctx.fillRect(left, top, cardW, headingH);
  ctx.restore();

  ctx.strokeStyle = "rgba(244, 201, 93, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left + 24, top + headingH);
  ctx.lineTo(left + cardW - 24, top + headingH);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = headingColor;
  ctx.font = "800 28px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(heading, W / 2, top + headingH / 2 + 10);

  if (rows.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = DIM;
    ctx.font = "600 28px 'DM Sans', system-ui, sans-serif";
    ctx.fillText(emptyMessage ?? "No prizes yet.", W / 2, top + headingH + contentH / 2 + 10);
    return top + cardH;
  }

  const rowStart = top + headingH + 16;
  rows.forEach((row, i) => {
    const rowTop = rowStart + i * rowHeight;
    const midY = rowTop + rowHeight / 2;

    // Stylish Circular Icon Badge Container
    const badgeSize = 46;
    const badgeX = left + 48;
    const badgeY = midY - (row.sub ? 4 : 0);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.strokeStyle = row.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawIcon(ctx, row.kind, badgeX, badgeY, 26, row.color);
    ctx.restore();

    // Prize Pattern Name
    ctx.textAlign = "left";
    ctx.fillStyle = WHITE;
    ctx.font = "700 30px 'Space Grotesk', system-ui, sans-serif";
    ctx.fillText(row.label, left + 92, midY - (row.sub ? 10 : -8));

    // Winner Subtext — highlighted in rich GOLD for maximum visual impact & contrast
    if (row.sub) {
      ctx.fillStyle = GOLD;
      ctx.font = "600 23px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText(row.sub, left + 92, midY + 22);
    }

    // Right-aligned Prize Amount Badge Box
    const amtStr = row.amount;
    ctx.font = "800 30px 'JetBrains Mono', ui-monospace, monospace";
    const amtWidth = ctx.measureText(amtStr).width;
    const boxPaddingH = 16;
    const boxH = 46;
    const boxW = amtWidth + boxPaddingH * 2;
    const boxX = left + cardW - 32 - boxW;
    const boxY = midY - boxH / 2;

    ctx.save();
    ctx.fillStyle = "rgba(244, 201, 93, 0.12)";
    ctx.strokeStyle = "rgba(244, 201, 93, 0.4)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.fillText(amtStr, boxX + boxW / 2, midY + 9);
    ctx.restore();

    // Subtle fading row divider line
    if (i < rows.length - 1) {
      const lineGrad = ctx.createLinearGradient(left + 24, 0, left + cardW - 24, 0);
      lineGrad.addColorStop(0, "rgba(255,255,255,0)");
      lineGrad.addColorStop(0.5, "rgba(255,255,255,0.1)");
      lineGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = lineGrad;
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

  // Scheduled Tag Pill
  ctx.save();
  const tagStr = `✨ ${seg.label.toUpperCase()} GAME DRAW ✨`;
  ctx.font = "800 24px 'Space Grotesk', system-ui, sans-serif";
  const tagW = ctx.measureText(tagStr).width + 36;
  ctx.fillStyle = "rgba(255, 79, 168, 0.18)";
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1.8;
  roundRect(ctx, W / 2 - tagW / 2, y - 28, tagW, 44, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = PINK;
  ctx.fillText(tagStr, W / 2, y + 2);
  ctx.restore();
  y += 48;

  // Title
  ctx.fillStyle = WHITE;
  ctx.font = "800 56px 'Space Grotesk', system-ui, sans-serif";
  const titleLines = wrapText(ctx, game.title, W - 160);
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 66;
  }
  y += 8;

  // Time & Tickets Badge
  ctx.fillStyle = CYAN;
  ctx.font = "700 28px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(`⏰ ${fmtTime(game.scheduled_at)}  ·  🎟️ ${game.total_tickets} TICKETS ONLY`, W / 2, y);
  y += 44;

  const rows: PrizeRowSpec[] = game.prize_pool.map((p) => ({
    kind: prizeIconKind(p.pattern_name),
    color: p.pattern_name.toLowerCase().includes("full house") ? (MEDAL_COLOR[prizeIconKind(p.pattern_name)] ?? GOLD) : PINK,
    label: p.pattern_name,
    amount: inr(p.prize_amount),
  }));

  const cardBottom = paintPrizeCard(ctx, {
    top: y,
    heading: "🏆 TODAY'S PRIZE POOL 🏆",
    headingColor: GOLD,
    rows,
    rowHeight: 78,
  });

  // Ticket Price CTA Button Box
  const pillY = cardBottom + 30;
  const pillH = 86;
  ctx.save();
  ctx.shadowColor = "rgba(244, 201, 93, 0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;

  const grad = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
  grad.addColorStop(0, GOLD);
  grad.addColorStop(1, GOLD_DIM);
  ctx.fillStyle = grad;
  roundRect(ctx, 120, pillY, W - 240, pillH, pillH / 2);
  ctx.fill();
  ctx.restore();

  drawIcon(ctx, "ticket", W / 2 - 200, pillY + pillH / 2, 34, INK);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "800 34px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(`TICKETS @ ${inr(game.ticket_price)} ONLY`, W / 2 + 20, pillY + pillH / 2 + 11);

  ctx.fillStyle = DIM;
  ctx.font = "italic 600 26px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("The entire town is playing! Are you?", W / 2, pillY + pillH + 48);

  paintFooter(ctx);
}

/* ── winners poster ──────────────────────────────────────────────────── */

async function drawWinnersPoster(ctx: CanvasRenderingContext2D, game: GameSummary, bgImage: HTMLImageElement | null) {
  paintBackground(ctx, bgImage);
  let y = await paintHeader(ctx);

  // Official Winners Badge Pill
  ctx.save();
  const tagStr = "🏆 OFFICIAL GAME WINNERS 🏆";
  ctx.font = "800 26px 'Space Grotesk', system-ui, sans-serif";
  const tagW = ctx.measureText(tagStr).width + 40;
  ctx.fillStyle = "rgba(244, 201, 93, 0.18)";
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  roundRect(ctx, W / 2 - tagW / 2, y - 28, tagW, 46, 23);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.fillText(tagStr, W / 2, y + 3);
  ctx.restore();
  y += 52;

  // Title
  ctx.fillStyle = WHITE;
  ctx.font = "800 58px 'Space Grotesk', system-ui, sans-serif";
  const titleLines = wrapText(ctx, game.title, W - 160);
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 66;
  }
  y += 20;

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

  const cardBottom = paintPrizeCard(ctx, {
    top: y,
    heading: "✨ WINNING TICKETS & REWARDS ✨",
    headingColor: GOLD,
    rows,
    rowHeight: 92,
    emptyMessage: "No prizes were claimed this round.",
  });

  // Congratulations Badge Pill & Subtext
  const congratsY = cardBottom + 44;
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = PINK;
  ctx.font = "800 32px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText("🎉 Congratulations to all our winners! 🎉", W / 2, congratsY);

  ctx.fillStyle = DIM;
  ctx.font = "italic 600 26px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("Ready for more? Book your next game today!", W / 2, congratsY + 44);
  ctx.restore();

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
