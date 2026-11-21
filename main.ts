// news-image-20261121 — draws Saturday 21 November 2026's world news
// as a single 1024x1024 newspaper front page.
// Node 22+ stdlib only. No network, no clock, no randomness:
// running it twice writes byte-identical PNGs.
//
// How it works, in brief:
//   * a tiny raw-pixel canvas (RGB buffer) with rect / line / disc helpers
//   * a hand-made 5x7 bitmap font, drawn at any integer scale
//   * six story panels, each with its own small hand-drawn scene
//   * a from-scratch PNG writer (filter-0 scanlines, zlib, CRC32)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER = [247, 243, 234]; // warm newsprint
const PANEL = [255, 253, 247]; // panel card
const INK = [26, 24, 20]; // near-black text
const MUTED = [96, 90, 80]; // secondary text
const RED = [178, 52, 38]; // accent red
const TEAL = [28, 104, 100]; // accent teal
const GOLD = [186, 130, 24]; // accent gold
const SLATE = [58, 88, 112]; // accent slate blue
const NIGHT = [34, 37, 44]; // dark scene background
const AMBER = [232, 150, 40]; // explosion / warning

// ---------------------------------------------------------------- PNG writer
function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function encodePng(rgb, width, height) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas
class Sheet {
  constructor(width, height, fill) {
    this.w = width;
    this.h = height;
    this.px = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      this.px[i * 3] = fill[0];
      this.px[i * 3 + 1] = fill[1];
      this.px[i * 3 + 2] = fill[2];
    }
  }
  dot(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.dot(xx, yy, c);
    }
  }
  frame(x, y, w, h, c, t) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  hline(x, y, len, c, t = 1) {
    this.rect(x, y, len, t, c);
  }
  vline(x, y, len, c, t = 1) {
    this.rect(x, y, t, len, c);
  }
  // Bresenham line, thickness t.
  line(x0, y0, x1, y1, c, t = 1) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.rect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  disc(cx, cy, r, c) {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let dx = -half; dx <= half; dx++) this.dot(cx + dx, cy + dy, c);
    }
  }
  ring(cx, cy, r, c, t = 2) {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.dot(
          Math.round(cx + (r - k) * Math.cos(rad)),
          Math.round(cy + (r - k) * Math.sin(rad)),
          c,
        );
      }
    }
  }
  // Starburst: n spikes radiating from (cx, cy), alternating long/short.
  burst(cx, cy, spikes, rLong, rShort, c) {
    for (let s = 0; s < spikes; s++) {
      const a = (s * Math.PI * 2) / spikes;
      const r = s % 2 === 0 ? rLong : rShort;
      this.line(
        cx,
        cy,
        Math.round(cx + r * Math.cos(a)),
        Math.round(cy + r * Math.sin(a)),
        c,
        3,
      );
    }
    this.disc(cx, cy, Math.max(3, Math.floor(rShort / 2)), c);
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph is 7 rows of 5 bits, written as "0"/"1" strings.
// Designed for this page: capitals, digits and the punctuation the
// headlines and body copy need. Lowercase is folded to uppercase.
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "00100", "00100", "00100"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  "'": ["00100", "00100", "00100", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "01100", "01000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  $: ["00100", "01111", "10101", "01110", "10101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
};

const BLANK = ["00000", "00000", "00000", "00000", "00000", "00000", "00000"];

function glyphFor(ch) {
  return GLYPHS[ch] || BLANK;
}

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

function drawText(sheet, text, x, y, scale, color) {
  const upper = text.toUpperCase();
  let cx = x;
  for (const ch of upper) {
    const g = glyphFor(ch);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "1") {
          sheet.rect(cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

function drawCentred(sheet, text, centreX, y, scale, color) {
  drawText(sheet, text, centreX - Math.floor(textWidth(text, scale) / 2), y, scale, color);
}

// Greedy word wrap: returns lines that fit inside maxWidth pixels.
function wrapLines(text, maxWidth, scale) {
  const words = text.toUpperCase().split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const trial = current === "" ? word : current + " " + word;
    if (textWidth(trial, scale) <= maxWidth) {
      current = trial;
    } else {
      if (current !== "") lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

// Draw a wrapped paragraph; returns the y just below the last line.
function drawPara(sheet, text, x, y, maxWidth, scale, color, leading) {
  const lines = wrapLines(text, maxWidth, scale);
  let yy = y;
  for (const line of lines) {
    drawText(sheet, line, x, yy, scale, color);
    yy += leading;
  }
  return yy;
}

// ---------------------------------------------------------------- scenes
// Each scene draws a small pictogram inside the given box. All shapes are
// placed with fixed numbers, so the picture is identical on every run.

// A game controller with a rising sales bar chart behind it.
function sceneGamepad(sheet, x, y, w, h) {
  const base = y + h - 26;
  const bars = [34, 58, 92];
  const bw = 26;
  const gap = 14;
  const bx = x + 12;
  for (let i = 0; i < 3; i++) {
    sheet.rect(bx + i * (bw + gap), base - bars[i], bw, bars[i], i === 2 ? RED : SLATE);
  }
  // Controller body.
  const cx = x + w - 118;
  const cy = y + 58;
  sheet.rect(cx, cy, 108, 46, INK);
  sheet.disc(cx + 6, cy + 40, 14, INK);
  sheet.disc(cx + 102, cy + 40, 14, INK);
  // D-pad.
  sheet.rect(cx + 18, cy + 14, 8, 26, PAPER);
  sheet.rect(cx + 9, cy + 23, 26, 8, PAPER);
  // Four action buttons.
  sheet.disc(cx + 74, cy + 16, 5, GOLD);
  sheet.disc(cx + 88, cy + 26, 5, RED);
  sheet.disc(cx + 74, cy + 36, 5, TEAL);
  sheet.disc(cx + 60, cy + 26, 5, PAPER);
  drawText(sheet, "VI", cx + 38, cy + 8, 2, PAPER);
}

// Night skyline, a blast star and drifting smoke, for the strike story.
function sceneBlast(sheet, x, y, w, h) {
  sheet.rect(x, y, w, h, NIGHT);
  const ground = y + h - 14;
  const towers = [
    [0, 52, 46],
    [52, 34, 40],
    [98, 62, 52],
    [156, 30, 44],
    [206, 48, 40],
    [252, 38, 46],
  ];
  for (const [ox, tw, th] of towers) {
    sheet.rect(x + ox, ground - th, tw, th, [58, 62, 72]);
    for (let wy = ground - th + 8; wy < ground - 8; wy += 14) {
      for (let wx = x + ox + 7; wx < x + ox + tw - 6; wx += 13) {
        sheet.rect(wx, wy, 4, 5, GOLD);
      }
    }
  }
  sheet.rect(x, ground, w, 14, [20, 22, 27]);
  const bx = x + Math.floor(w * 0.62);
  const by = y + Math.floor(h / 2) - 2;
  sheet.burst(bx, by, 12, 34, 18, AMBER);
  sheet.burst(bx, by, 12, 22, 12, RED);
  sheet.disc(bx - 52, by - 26, 7, [120, 118, 112]);
  sheet.disc(bx - 38, by - 34, 9, [140, 138, 130]);
  sheet.disc(bx + 58, by - 30, 6, [120, 118, 112]);
}

// A globe with a red thermometer climbing past it, for COP31.
function sceneGlobe(sheet, x, y, w, h) {
  const cx = x + 62;
  const cy = y + Math.floor(h / 2) + 2;
  const r = Math.min(44, Math.floor(h / 2) - 4);
  sheet.disc(cx, cy, r, TEAL);
  sheet.ring(cx, cy, r, INK, 2);
  sheet.rect(cx - r, cy - 4, r * 2, 3, PAPER);
  sheet.rect(cx - r, cy - 26, r * 2, 3, PAPER);
  sheet.rect(cx - r, cy + 20, r * 2, 3, PAPER);
  sheet.disc(cx - 12, cy - 12, 9, [64, 160, 110]);
  sheet.disc(cx + 14, cy + 11, 8, [64, 160, 110]);
  // Thermometer, sized to the band it is given.
  const tx = x + w - 52;
  const tubeTop = y + 12;
  const tubeBot = y + h - 18;
  sheet.rect(tx, tubeTop, 14, tubeBot - tubeTop, PANEL);
  sheet.frame(tx, tubeTop, 14, tubeBot - tubeTop, INK, 2);
  sheet.rect(tx + 2, tubeTop + 16, 10, tubeBot - tubeTop - 16, RED);
  sheet.disc(tx + 7, tubeBot + 2, 10, RED);
  sheet.ring(tx + 7, tubeBot + 2, 10, INK, 2);
  drawText(sheet, "1.5C", x + w - 96, y + 6, 2, RED);
}

// Hospital cross on a teal badge with a heartbeat trace.
function sceneHospital(sheet, x, y, w, h) {
  const cx = x + 52;
  const cy = y + Math.floor(h / 2);
  const bs = Math.max(18, Math.min(34, Math.floor(h / 2) - 2));
  sheet.rect(cx - bs, cy - bs, bs * 2, bs * 2, TEAL);
  sheet.frame(cx - bs, cy - bs, bs * 2, bs * 2, INK, 2);
  sheet.rect(cx - 7, cy - bs + 7, 14, bs * 2 - 14, PAPER);
  sheet.rect(cx - bs + 7, cy - 7, bs * 2 - 14, 14, PAPER);
  // Heartbeat trace across the rest of the box.
  const pts = [
    [x + 104, cy + 8],
    [x + 128, cy + 8],
    [x + 138, cy - 14],
    [x + 150, cy + 22],
    [x + 160, cy + 8],
    [x + 186, cy + 8],
    [x + 196, cy - 6],
    [x + 206, cy + 8],
    [x + w - 8, cy + 8],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    sheet.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 3);
  }
}

// Three bars: Nasdaq, HKEX, NSE — NSE tallest, in gold, with an arrow.
// Bar heights scale with the band, so they never outgrow it.
function sceneBars(sheet, x, y, w, h) {
  const base = y + h - 20;
  const vals = [
    ["NASDAQ", 57.7, SLATE],
    ["HKEX", 58.1, SLATE],
    ["NSE", 59.7, GOLD],
  ];
  const bw = 40;
  const gap = 22;
  const start = x + 14;
  for (let i = 0; i < vals.length; i++) {
    const [label, v, col] = vals[i];
    const bh = Math.max(6, Math.round((v - 50) * (h - 30) / 8));
    const bx = start + i * (bw + gap);
    sheet.rect(bx, base - bh, bw, bh, col);
    sheet.frame(bx, base - bh, bw, bh, INK, 1);
    drawText(sheet, label, bx - 2, base + 4, 1, INK);
  }
  drawText(sheet, "$59.7BN", x + w - 96, y + 4, 2, INK);
  sheet.line(x + w - 40, y + 38, x + w - 14, y + 22, RED, 3);
  sheet.line(x + w - 14, y + 22, x + w - 28, y + 22, RED, 3);
  sheet.line(x + w - 14, y + 22, x + w - 14, y + 36, RED, 3);
}

// A cyclone spiral over a coastline, with rain slashes.
function sceneCyclone(sheet, x, y, w, h) {
  const cx = x + Math.floor(w / 2) - 18;
  const cy = y + Math.floor(h / 2) - 6;
  const sweep = h < 70 ? 540 : 1080;
  for (let a = 0; a < sweep; a += 4) {
    const rad = (a * Math.PI) / 180;
    const r = 3 + a * 0.045;
    sheet.rect(
      Math.round(cx + r * Math.cos(rad)),
      Math.round(cy + r * Math.sin(rad)),
      4,
      4,
      SLATE,
    );
  }
  sheet.disc(cx, cy, 7, PAPER);
  sheet.ring(cx, cy, 7, INK, 2);
  // Coastline and rain.
  sheet.line(x + 8, y + h - 14, x + w - 8, y + h - 14, TEAL, 3);
  for (const [rx, ry] of [
    [x + w - 34, y + 12],
    [x + w - 52, y + 26],
    [x + w - 22, y + 40],
    [x + 16, y + 16],
  ]) {
    sheet.line(rx, ry, rx - 6, ry + 12, SLATE, 2);
  }
  drawText(sheet, "70-80 KM/H", x + 12, y + 6, 1, INK);
}

// ---------------------------------------------------------------- page
function storyPanel(sheet, x, y, w, h, kicker, kickColor, headline, body, scene) {
  sheet.rect(x, y, w, h, PANEL);
  sheet.frame(x, y, w, h, INK, 2);
  // Kicker chip.
  const chipW = textWidth(kicker, 2) + 20;
  sheet.rect(x + 14, y + 12, chipW, 26, kickColor);
  drawText(sheet, kicker, x + 24, y + 18, 2, PANEL);
  // Headline, one or two lines.
  const headLines = wrapLines(headline, w - 28, 3);
  let yy = y + 50;
  for (const line of headLines) {
    drawText(sheet, line, x + 14, yy, 3, INK);
    yy += 26;
  }
  // Body copy. The scene band starts below the last body line, so text
  // and picture can never overlap however the copy wraps.
  const bodyTop = yy + 6;
  const bodyLines = wrapLines(body, w - 28, 2);
  drawPara(sheet, body, x + 14, bodyTop, w - 28, 2, INK, 17);
  const sceneTop = bodyTop + bodyLines.length * 17 + 8;
  const sceneH = y + h - 8 - sceneTop;
  scene(sheet, x + 10, sceneTop, w - 20, sceneH);
}

function render() {
  const s = new Sheet(W, H, PAPER);

  // Masthead.
  drawCentred(s, "THE WORLD TODAY", W / 2, 26, 10, INK);
  s.hline(28, 112, W - 56, INK, 3);
  drawCentred(s, "SATURDAY 21 NOVEMBER 2026", W / 2, 124, 3, RED);
  drawCentred(
    s,
    "SIX STORIES FROM AROUND THE GLOBE - ALL IN ONE PICTURE",
    W / 2,
    152,
    2,
    MUTED,
  );
  s.hline(28, 172, W - 56, INK, 2);

  // ---- Lead story: GTA VI, full width.
  const lead = { x: 28, y: 184, w: 968, h: 232 };
  s.rect(lead.x, lead.y, lead.w, lead.h, PANEL);
  s.frame(lead.x, lead.y, lead.w, lead.h, INK, 2);
  const leadChip = textWidth("ENTERTAINMENT", 2) + 20;
  s.rect(lead.x + 16, lead.y + 12, leadChip, 26, RED);
  drawText(s, "ENTERTAINMENT", lead.x + 26, lead.y + 18, 2, PANEL);
  drawText(s, "GTA VI SMASHES", lead.x + 16, lead.y + 52, 4, INK);
  drawText(s, "ALL RECORDS", lead.x + 16, lead.y + 84, 4, INK);
  drawPara(
    s,
    "ROCKSTAR SAYS THE GAME TOOK $3.79 BILLION IN RETAIL SALES IN ITS FIRST 24 HOURS, THE BIGGEST ENTERTAINMENT LAUNCH EVER. 32.5 MILLION COPIES WERE ALREADY SOLD BEFORE RELEASE DAY.",
    lead.x + 16,
    lead.y + 126,
    600,
    2,
    INK,
    17,
  );
  s.vline(lead.x + 648, lead.y + 14, lead.h - 28, INK, 2);
  drawCentred(s, "$3.79BN", lead.x + 812, lead.y + 26, 5, RED);
  drawCentred(s, "IN ONE DAY", lead.x + 812, lead.y + 68, 2, MUTED);
  sceneGamepad(s, lead.x + 660, lead.y + 104, 296, 116);

  // ---- Middle row: two stories.
  const midY = 428;
  const midH = 260;
  storyPanel(
    s,
    28,
    midY,
    476,
    midH,
    "UKRAINE",
    NIGHT,
    "DOUBLE-TAP STRIKE HITS KRYVYI RIH",
    "TWO BALLISTIC MISSILES HIT A RESTAURANT CAR PARK. DRONES STRUCK AGAIN AS RESCUERS WORKED. A BOY OF 7 AND A PARAMEDIC, 20, WERE KILLED. 42 HURT.",
    sceneBlast,
  );
  storyPanel(
    s,
    520,
    midY,
    476,
    midH,
    "CLIMATE",
    TEAL,
    "COP31 DRIFTS INTO OVERTIME",
    "TALKS IN ANTALYA RAN PAST DEADLINE AS 200 NATIONS ROWED OVER FOSSIL FUELS. THE DRAFT DROPS A $120BN GOAL AND NEVER MENTIONS FOSSIL FUELS.",
    sceneGlobe,
  );

  // ---- Bottom row: three stories.
  const botY = 700;
  const botH = 248;
  storyPanel(
    s,
    28,
    botY,
    312,
    botH,
    "BRAZIL",
    SLATE,
    "BOLSONARO BACK IN HOSPITAL",
    "BOLSONARO, 71, IN HOSPITAL IN BRASILIA. TESTS FOUND A NEAR-COMPLETE INTESTINAL BLOCKAGE.",
    sceneHospital,
  );
  storyPanel(
    s,
    356,
    botY,
    312,
    botH,
    "MARKETS",
    GOLD,
    "INDIA'S NSE PASSES NASDAQ",
    "NOW THE WORLD'S 5TH-LARGEST LISTED EXCHANGE OPERATOR AT $59.7BN, AHEAD OF NASDAQ AND HKEX.",
    sceneBars,
  );
  storyPanel(
    s,
    684,
    botY,
    312,
    botH,
    "WEATHER",
    TEAL,
    "CYCLONE AKVAN FADES ASHORE",
    "THE STORM CROSSED THE COAST NEAR GOPALPUR AT 70-80 KM/H, THEN FADED FAST. NO MAJOR DAMAGE.",
    sceneCyclone,
  );

  // ---- Footer.
  s.hline(28, 962, W - 56, INK, 2);
  drawCentred(
    s,
    "SOURCES: REUTERS - CNN - AP - UN NEWS - IMD - 21 NOVEMBER 2026",
    W / 2,
    974,
    1,
    MUTED,
  );
  drawCentred(s, "THE WORLD TODAY - ONE PAGE, SIX STORIES", W / 2, 990, 1, MUTED);

  return s.px;
}

function main() {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const png = encodePng(render(), W, H);
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
  console.log(`sha256 ${sha}`);
}

main();
