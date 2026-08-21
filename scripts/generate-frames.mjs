/**
 * Frame asset generator (Hybrid Dynamic Frame Engine, 2026-08-21).
 *
 * Writes the 3 luxury wedding overlay PNGs (1080×1920, colorType 6 RGBA,
 * fully transparent central photo area) using Node stdlib only. Text is
 * NEVER baked — names render as dynamic canvas layers (lib/frames.ts).
 *
 * Usage: node scripts/generate-frames.mjs
 * ponytail: raster art is programmatic geometric ornament; upgrade to
 * hand-drawn/illustrator assets by dropping replacement PNGs into
 * public/frames/ — only the IHDR invariants (lib/frames.assets.test.ts)
 * are contractual.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const W = 1080;
const H = 1920;

// --- Minimal PNG writer (stdlib only) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colorType RGBA
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Raster helpers ---
function canvas() {
  return Buffer.alloc(W * H * 4, 0); // fully transparent
}

function blend(px, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const sa = a / 255;
  const da = px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
  px[i + 3] = Math.round(oa * 255);
}

function rect(px, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) blend(px, x, y, col);
}

/** Rect outline of thickness t. */
function rectOutline(px, x0, y0, x1, y1, t, col) {
  rect(px, x0, y0, x1, y0 + t, col);
  rect(px, x0, y1 - t, x1, y1, col);
  rect(px, x0, y0, x0 + t, y1, col);
  rect(px, x1 - t, y0, x1, y1, col);
}

/** Filled circle (anti-aliased edge via supersample 2×2). */
function circle(px, cx, cy, r, col) {
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      let cover = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const dx = x + ox - cx;
        const dy = y + oy - cy;
        if (dx * dx + dy * dy <= r * r) cover++;
      }
      if (cover > 0) blend(px, x, y, [col[0], col[1], col[2], (col[3] * cover) / 4]);
    }
  }
}

/** Line segment with round caps, thickness t. */
function line(px, x0, y0, x1, y1, t, col) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + ((x1 - x0) * s) / steps;
    const y = y0 + ((y1 - y0) * s) / steps;
    circle(px, x, y, t / 2, col);
  }
}

/** Leaf/petal silhouette between two points (two circular arcs approximated by tapered circles). */
function leaf(px, x0, y0, x1, y1, w, col) {
  const steps = 24;
  for (let s = 0; s <= steps; s++) {
    const p = s / steps;
    const x = x0 + (x1 - x0) * p;
    const y = y0 + (y1 - y0) * p;
    const r = (w / 2) * Math.sin(Math.PI * p);
    circle(px, x, y, r, col);
  }
}

/** Quarter-circle corner flourish (arcs of decreasing radius). */
function cornerFlourish(px, cx, cy, dirX, dirY, col) {
  for (const [r, t] of [[120, 6], [100, 4], [80, 3]]) {
    const steps = 28;
    for (let s = 0; s <= steps; s++) {
      const a = (Math.PI / 2) * (s / steps);
      const x = cx + dirX * Math.cos(a) * r;
      const y = cy + dirY * Math.sin(a) * r;
      circle(px, x, y, t / 2, col);
    }
  }
  // Tip dot.
  circle(px, cx + dirX * 140, cy + dirY * 140, 5, col);
}

const GOLD = [212, 175, 55, 255];
const GOLD_SOFT = [212, 175, 55, 190];
const IVORY = [247, 242, 234, 235];
const SAGE = [154, 143, 130, 220];

// --- 1. royal-gold: classic double-hairline border + corner flourishes ---
function royalGold() {
  const px = canvas();
  const M = 54; // outer margin
  rectOutline(px, M, M, W - M, H - M, 6, GOLD);
  rectOutline(px, M + 26, M + 26, W - M - 26, H - M - 26, 3, GOLD_SOFT);
  cornerFlourish(px, M + 26, M + 26, 1, 1, GOLD);
  cornerFlourish(px, W - M - 26, M + 26, -1, 1, GOLD);
  cornerFlourish(px, M + 26, H - M - 26, 1, -1, GOLD);
  cornerFlourish(px, W - M - 26, H - M - 26, -1, -1, GOLD);
  // Small center-top / center-bottom diamonds.
  for (const cy of [M + 13, H - M - 13]) {
    line(px, W / 2 - 14, cy, W / 2, cy - 14, 3, GOLD);
    line(px, W / 2, cy - 14, W / 2 + 14, cy, 3, GOLD);
    line(px, W / 2 + 14, cy, W / 2, cy + 14, 3, GOLD);
    line(px, W / 2, cy + 14, W / 2 - 14, cy, 3, GOLD);
  }
  return px;
}

// --- 2. botanical-romance: botanical silhouette vignette (corners + edges) ---
function botanicalRomance() {
  const px = canvas();
  const M = 60;
  // Thin organic double border: wavy top & bottom rails.
  for (const y of [M, H - M]) {
    for (let s = 0; s <= 200; s++) {
      const x = M + ((W - 2 * M) * s) / 200;
      const wob = Math.sin((s / 200) * Math.PI * 6) * 4;
      circle(px, x, y + wob, 2.5, SAGE);
    }
  }
  for (const x of [M, W - M]) {
    for (let s = 0; s <= 200; s++) {
      const y = M + ((H - 2 * M) * s) / 200;
      const wob = Math.sin((s / 200) * Math.PI * 10) * 4;
      circle(px, x + wob, y, 2.5, SAGE);
    }
  }
  // Corner botanical clusters: layered leaves fanning from each corner.
  const corners = [
    [M + 14, M + 14, 1, 1],
    [W - M - 14, M + 14, -1, 1],
    [M + 14, H - M - 14, 1, -1],
    [W - M - 14, H - M - 14, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    for (const [len, w, col] of [
      [300, 34, SAGE],
      [230, 26, IVORY],
      [160, 18, SAGE],
    ]) {
      for (const spread of [-0.45, 0, 0.45]) {
        const angle = Math.PI / 4 + spread; // fan around the diagonal
        leaf(
          px,
          cx,
          cy,
          cx + dx * Math.cos(angle) * len,
          cy + dy * Math.sin(angle) * len,
          w,
          col,
        );
      }
    }
    circle(px, cx, cy, 10, IVORY);
  }
  // Scattered accent berries along the side rails.
  for (let i = 0; i < 12; i++) {
    const y = 260 + i * 140;
    const side = i % 2 === 0 ? M - 18 : W - M + 18;
    circle(px, side, y, 5, IVORY);
    circle(px, side + (i % 2 === 0 ? -10 : 10), y + 16, 3.5, SAGE);
  }
  return px;
}

// --- 3. modern-editorial: high-fashion rules + monogram block ---
function modernEditorial() {
  const px = canvas();
  const M = 66;
  // Top & bottom editorial rules (thick + thin pairing).
  rect(px, M, M, W - M, M + 10, IVORY);
  rect(px, M, M + 22, W - M, M + 25, IVORY);
  rect(px, M, H - M - 10, W - M, H - M, IVORY);
  rect(px, M, H - M - 25, W - M, H - M - 22, IVORY);
  // Side rails: short baseline ticks every 120px (fashion crop marks).
  for (let y = M + 60; y < H - M - 60; y += 120) {
    rect(px, M, y, M + 18, y + 2, IVORY);
    rect(px, W - M - 18, y, W - M, y + 2, IVORY);
  }
  // Monogram block top-center: geometric "R&C"-style double square.
  const cx = W / 2;
  rectOutline(px, cx - 34, M + 48, cx + 34, M + 116, 4, IVORY);
  rectOutline(px, cx - 22, M + 60, cx + 22, M + 104, 2, IVORY);
  // Center dot accents on the outer square midpoints.
  circle(px, cx, M + 48, 4, IVORY);
  circle(px, cx, M + 116, 4, IVORY);
  // Bottom-center corner brackets (frame-within-frame).
  const by = H - M - 130;
  line(px, cx - 90, by + 60, cx - 90, by, 4, IVORY);
  line(px, cx - 90, by, cx - 40, by, 4, IVORY);
  line(px, cx + 90, by + 60, cx + 90, by, 4, IVORY);
  line(px, cx + 90, by, cx + 40, by, 4, IVORY);
  return px;
}

// --- Emit ---
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "frames");
mkdirSync(out, { recursive: true });
for (const [name, paint] of [
  ["royal-gold", royalGold],
  ["botanical-romance", botanicalRomance],
  ["modern-editorial", modernEditorial],
]) {
  const png = encodePng(paint());
  writeFileSync(join(out, `${name}.png`), png);
  console.log(`${name}.png — ${png.length} bytes`);
}
