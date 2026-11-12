/* Rasterizes the game's logo (the web favicon/logo design: a maple wood tile with a curved
 * pipe and the red ball) into the native app icon, Android adaptive/monochrome icons and the
 * splash image. Pure Node (signed-distance shapes + zlib PNG encoder), no dependencies.
 *   node scripts/make-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');
fs.mkdirSync(OUT, { recursive: true });

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(name, img) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = y * (w * 4 + 1) + 1 + x * 4;
      const a = px[i + 3];
      // un-premultiply
      raw[o] = a ? Math.round(Math.min(1, px[i] / a) * 255) : 0;
      raw[o + 1] = a ? Math.round(Math.min(1, px[i + 1] / a) * 255) : 0;
      raw[o + 2] = a ? Math.round(Math.min(1, px[i + 2] / a) * 255) : 0;
      raw[o + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`${name}  ${w}x${h}  ${(png.length / 1024).toFixed(0)} KB`);
}

// ---------- tiny SDF painter (premultiplied RGBA floats) ----------
const hex = (s, a = 1) => { const n = parseInt(s.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]; };
const mix = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * Math.max(0, Math.min(1, t)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function image(w, h) { return { w, h, px: new Float32Array(w * h * 4) }; }

/** Paint a shape: sdf(x,y) < 0 inside (in pixels); color(x,y) -> [r,g,b,a]; soft = blur px. */
function paint(img, sdf, color, { soft = 1, clip } = {}) {
  const { w, h, px } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const d = sdf(X, Y);
      if (d > soft) continue;
      let cov = clamp01(0.5 - d / Math.max(1, soft));
      if (clip) cov *= clamp01(0.5 - clip(X, Y));
      if (cov <= 0) continue;
      const c = color(X, Y);
      const a = c[3] * cov;
      const i = (y * w + x) * 4;
      px[i] = c[0] * a + px[i] * (1 - a);
      px[i + 1] = c[1] * a + px[i + 1] * (1 - a);
      px[i + 2] = c[2] * a + px[i + 2] * (1 - a);
      px[i + 3] = a + px[i + 3] * (1 - a);
    }
  }
}

const sdRoundRect = (cx, cy, hw, hh, r) => (x, y) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const sdEllipse = (cx, cy, rx, ry) => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
function sdSegment(ax, ay, bx, by) {
  return (x, y) => {
    const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
    const t = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
    return Math.hypot(pax - bax * t, pay - bay * t);
  };
}
/** Quarter arc around (cx,cy) radius r between angles a0..a1 (radians, a0<a1). */
function sdArc(cx, cy, r, a0, a1) {
  return (x, y) => {
    let a = Math.atan2(y - cy, x - cx);
    if (a < a0 - 1e-9) a += Math.PI * 2;
    if (a >= a0 && a <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - r);
    const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    return Math.min(Math.hypot(x - p0[0], y - p0[1]), Math.hypot(x - p1[0], y - p1[1]));
  };
}
const stroke = (dist, width) => (x, y) => dist(x, y) - width / 2;

/** The favicon pipe in 64-unit logo space: down from the top edge, quarter turn, out the right edge. */
function pipeDist(T) {
  const seg1 = sdSegment(T(32), T(-2), T(32), T(18));
  const arc = sdArc(T(46), T(18), T(14) - T(0), Math.PI / 2, Math.PI);
  const seg2 = sdSegment(T(46), T(32), T(66), T(32));
  return (x, y) => Math.min(seg1(x, y), arc(x, y), seg2(x, y));
}

/**
 * Draw the logo tile. ox, oy = top-left of the 64-unit logo box; scale = px per unit.
 * fullBleed: tile fills the box with square corners (iOS/legacy icon is masked by the OS).
 */
function drawLogo(img, ox, oy, scale, { fullBleed = false, mono = false } = {}) {
  const T = (u) => u * scale;
  const X = (u) => ox + u * scale, Y = (u) => oy + u * scale;
  const tileSdf = fullBleed
    ? sdRoundRect(X(32), Y(32), T(32), T(32), 0)
    : sdRoundRect(X(32), Y(32), T(28), T(28), T(14));
  const tileClip = tileSdf;

  if (mono) {
    const white = () => [1, 1, 1, 1];
    const pd = pipeDist(T);
    paint(img, stroke((x, y) => pd(x - ox, y - oy), T(12)), white, { clip: tileClip });
    paint(img, sdCircle(X(24), Y(42), T(10.5)), white);
    return;
  }

  if (!fullBleed) {
    // drop shadow
    paint(img, sdRoundRect(X(32), Y(34.5), T(28), T(28), T(14)), () => [0, 0, 0, 0.45], { soft: T(3) });
  }
  // maple wood body
  const top = hex('#f6d197'), bot = hex('#d9964f');
  paint(img, tileSdf, (x, y) => mix(top, bot, ((x - X(4)) * 0.4 + (y - Y(4))) / T(56 * 1.2)));
  // wood grain
  for (let i = 0; i < 5; i++) {
    const base = 10 + i * 11 + (i % 2) * 2;
    const grain = (x, y) => {
      const u = (x - ox) / scale;
      return Math.abs((y - oy) / scale - (base + Math.sin(u * 0.18 + i * 1.7) * (1.4 + (i % 3) * 0.5))) * scale - T(0.35);
    };
    paint(img, grain, () => hex('#9a5e2a', 0.16), { clip: tileClip });
  }
  // bevel highlight (top) and shade (bottom)
  paint(img, (x, y) => Math.abs(tileSdf(x, y) + T(1.2)) - T(0.7), (x, y) =>
    (y - Y(4)) / T(56) < 0.5 ? [1, 1, 1, 0.5 * (1 - (y - Y(4)) / T(28))] : [0, 0, 0, 0.3 * ((y - Y(32)) / T(28))], { clip: tileClip });

  // pipe: groove, glowing gold tube, highlight
  const pd = pipeDist(T);
  const P = (x, y) => pd(x - ox, y - oy);
  paint(img, stroke(P, T(14.5)), () => hex('#3c200c', 0.55), { clip: tileClip });
  paint(img, stroke(P, T(13)), () => hex('#ffcc33', 0.35), { soft: T(3), clip: tileClip });
  paint(img, stroke(P, T(9.6)), () => hex('#ffcc33'), { clip: tileClip });
  paint(img, stroke(P, T(6.8)), () => hex('#ffd95c'), { clip: tileClip });
  paint(img, stroke(P, T(2.4)), () => hex('#fffad7', 0.9), { clip: tileClip });

  // the ball: shadow, red radial body, specular
  paint(img, sdEllipse(X(25.5), Y(47.5), T(9.5), T(5)), () => [0, 0, 0, 0.35], { soft: T(1.5) });
  const c0 = hex('#ff9aa4'), c1 = hex('#f23a55'), c2 = hex('#8f0f2a');
  paint(img, sdCircle(X(24), Y(42), T(10)), (x, y) => {
    const d = Math.hypot(x - X(20.5), y - Y(38)) / T(13.5);
    return d < 0.45 ? mix(c0, c1, d / 0.45) : mix(c1, c2, (d - 0.45) / 0.55);
  });
  paint(img, sdEllipse(X(20.2), Y(37.8), T(2.6), T(1.6)), () => [1, 1, 1, 0.8], { soft: T(0.6) });
}

function background(img, top, bottom) {
  const a = hex(top), b = hex(bottom);
  paint(img, () => -1e9, (x, y) => mix(a, b, y / img.h), { soft: 1 });
}

// iOS / legacy icon: opaque, full-bleed wood tile (the OS rounds the corners).
{
  const img = image(1024, 1024);
  background(img, '#1e3d58', '#0f1e2e');
  drawLogo(img, 0, 0, 1024 / 64, { fullBleed: true });
  writePng('icon.png', img);
}
// Android adaptive icon foreground: transparent, logo inside the 66% safe zone.
{
  const img = image(1024, 1024);
  const size = 1024 * 0.62;
  drawLogo(img, (1024 - size) / 2, (1024 - size) / 2, size / 64);
  writePng('adaptive-icon.png', img);
}
// Android 13+ themed (monochrome) icon.
{
  const img = image(1024, 1024);
  const size = 1024 * 0.62;
  drawLogo(img, (1024 - size) / 2, (1024 - size) / 2, size / 64, { mono: true });
  writePng('adaptive-icon-mono.png', img);
}
// Splash image (shown centered on the dark splash background).
{
  const img = image(512, 512);
  drawLogo(img, 32, 32, 448 / 64);
  writePng('splash-icon.png', img);
}
