/** Board renderer: wooden tray, tiles, pipes, hint, fail marker, ball and particles.
 * Port of js/game/renderer.js to the React Native Skia imperative canvas.
 *
 * Each frame is recorded into an SkPicture (shown by <Picture/> via a shared value), so React
 * never re-renders while the game animates. The static art of every tile (body, grain, bevel,
 * screws, pipe, socket) is itself cached as a picture per tile + glow state, and the empty
 * tray is cached per board size, so a frame is a handful of drawPicture calls.
 */
import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { TILE, Tile, Move, dirByBit } from '../core/constants';
import type { GameSession } from '../core/session';
import type { PathStep } from '../core/pathfinding';
import { edgePoint, pipePath, splitMask } from './geometry';
import { ParticleSystem } from './particles';
import { blur, clipRRect, fillPaint, linear, path, radial2, rrect, strokePaint } from './skiaKit';
import type { BallController } from './ball';

type Glow = 'normal' | 'connected' | 'complete';
type Kind = 'maple' | 'walnut' | 'start' | 'end' | 'stone';

const COLORS = {
  tube: { normal: '#c9d2da', connected: '#3fd6c8', complete: '#ffcc33' },
  tubeHi: { normal: 'rgba(255,255,255,0.65)', connected: 'rgba(225,255,252,0.85)', complete: 'rgba(255,250,215,0.9)' },
  groove: 'rgba(60,32,12,0.55)',
};

const WOOD: Record<Kind, [string, string, string]> = {
  maple: ['#f6d197', '#d9964f', '#9a5e2a'],
  walnut: ['#a86b3c', '#6f3f1d', '#3d220f'],
  start: ['#c8f0d6', '#5cc58e', '#2c7a52'],
  end: ['#ffe9a8', '#f0b23a', '#9b6614'],
  stone: ['#b8c0c8', '#77818c', '#4a525b'],
};

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

interface Anim {
  cellX: number;
  cellY: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  onDone?: () => void;
}

export interface Drag {
  x: number;
  y: number;
  dir: number;
  offset: number;
}

export class BoardRenderer {
  session: GameSession | null = null;
  ball: BallController | null = null;
  drag: Drag | null = null;
  anims: Anim[] = [];
  hint: (Move & { t0: number }) | null = null;
  failMark: { px: number; py: number; t0: number } | null = null;
  particles = new ParticleSystem();
  reduced = false;
  dirty = true;
  side = 0;
  s = 0;
  ox = 0;
  oy = 0;

  private grain = new WeakMap<Tile, number>();
  private grainSeq = 1;
  private tileCache = new WeakMap<Tile, { key: string; pic: SkPicture }>();
  private trayCache: { key: string; pic: SkPicture } | null = null;

  attach(session: GameSession, ball: BallController) {
    this.session = session;
    this.ball = ball;
    this.drag = null;
    this.anims = [];
    this.hint = null;
    this.failMark = null;
    this.particles.clear();
    this.resize(this.side);
  }

  resize(side: number) {
    this.side = Math.floor(side);
    if (!this.session || this.side <= 0) return;
    const n = this.session.board.w;
    const frame = Math.max(8, this.side * 0.035);
    this.s = (this.side - frame * 2) / n;
    this.ox = frame;
    this.oy = frame;
    this.dirty = true;
  }

  origin(x: number, y: number) {
    return { x: this.ox + x * this.s, y: this.oy + y * this.s };
  }

  cellAt(px: number, py: number) {
    if (!this.session || !this.s) return null;
    const x = Math.floor((px - this.ox) / this.s);
    const y = Math.floor((py - this.oy) / this.s);
    return this.session.board.inBounds(x, y) ? { x, y } : null;
  }

  private tileId(tile: Tile) {
    let id = this.grain.get(tile);
    if (!id) {
      id = this.grainSeq++;
      this.grain.set(tile, id);
    }
    return id;
  }

  // ---- animation API -------------------------------------------------
  /** Animate a committed move. fromOffset = pixels the tile was already dragged. */
  animateMove(move: { x: number; y: number; toX: number; toY: number; dir: number }, fromOffset = 0, onDone?: () => void) {
    const d = dirByBit(move.dir)!;
    const from = this.origin(move.x, move.y);
    const to = this.origin(move.toX, move.toY);
    const remaining = 1 - Math.min(1, fromOffset / this.s);
    const dur = this.reduced ? 0.06 : 0.07 + 0.11 * remaining;
    this.anims.push({
      cellX: move.toX,
      cellY: move.toY,
      fx: from.x + d.dx * fromOffset,
      fy: from.y + d.dy * fromOffset,
      tx: to.x,
      ty: to.y,
      t: 0,
      dur,
      onDone,
    });
    this.dirty = true;
  }

  animateSnapBack(x: number, y: number, dir: number, offset: number) {
    if (offset <= 0.5) return;
    const d = dirByBit(dir)!;
    const o = this.origin(x, y);
    this.anims.push({ cellX: x, cellY: y, fx: o.x + d.dx * offset, fy: o.y + d.dy * offset, tx: o.x, ty: o.y, t: 0, dur: 0.12 });
    this.dirty = true;
  }

  showHint(move: Move) {
    this.hint = { ...move, t0: Date.now() };
    this.dirty = true;
  }
  clearHint() {
    this.hint = null;
    this.dirty = true;
  }

  showFail(fail: { x: number; y: number }, pathSteps: PathStep[]) {
    const s = this.s;
    let px: number;
    let py: number;
    if (this.session!.board.inBounds(fail.x, fail.y)) {
      const o = this.origin(fail.x, fail.y);
      px = o.x + s / 2;
      py = o.y + s / 2;
    } else {
      const last = pathSteps[pathSteps.length - 1];
      const o = this.origin(last.x, last.y);
      const e = edgePoint(o.x, o.y, s, last.outBit);
      px = e.x;
      py = e.y;
    }
    this.failMark = { px, py, t0: Date.now() };
    this.dirty = true;
  }

  clearFail() {
    this.failMark = null;
    this.dirty = true;
  }

  get busy() {
    return this.anims.length > 0;
  }

  needsFrame(): boolean {
    return (
      this.dirty ||
      this.anims.length > 0 ||
      this.particles.active ||
      !!this.hint ||
      !!this.failMark ||
      !!(this.ball && this.ball.animating) ||
      !!(this.session && this.session.connection.ok)
    );
  }

  update(dt: number) {
    for (const a of this.anims) a.t += dt / a.dur;
    const done = this.anims.filter((a) => a.t >= 1);
    this.anims = this.anims.filter((a) => a.t < 1);
    done.forEach((a) => a.onDone && a.onDone());
    this.particles.update(dt); // the fail marker stays until the next move, undo or restart
  }

  // ---- drawing --------------------------------------------------------
  /** Records the current frame. Returns null when there is nothing to draw yet. */
  render(now: number): SkPicture | null {
    if (!this.session || !this.side || !this.s) return null;
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, this.side, this.side));
    canvas.drawPicture(this.trayPicture());

    const board = this.session.board;
    const conn = this.session.connection;
    const connected = new Map<number, PathStep>();
    conn.path.forEach((p) => connected.set(p.y * board.w + p.x, p));
    const level: Glow = conn.ok ? 'complete' : 'connected';

    const skip = new Set<number>();
    this.anims.forEach((a) => skip.add(a.cellY * board.w + a.cellX));
    if (this.drag) skip.add(this.drag.y * board.w + this.drag.x);

    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        const i = y * board.w + x;
        const tile = board.get(x, y)!;
        if (tile.t === TILE.EMPTY || skip.has(i)) continue;
        const o = this.origin(x, y);
        this.drawTile(canvas, tile, o.x, o.y, connected.has(i) ? level : 'normal', false, now);
      }
    }

    // Moving tiles on top, "lifted".
    for (const a of this.anims) {
      const t = ease(Math.min(1, a.t));
      const tile = board.get(a.cellX, a.cellY)!;
      if (tile.t !== TILE.EMPTY) this.drawTile(canvas, tile, a.fx + (a.tx - a.fx) * t, a.fy + (a.ty - a.fy) * t, 'normal', true, now);
    }
    if (this.drag) {
      const d = dirByBit(this.drag.dir) || { dx: 0, dy: 0 };
      const o = this.origin(this.drag.x, this.drag.y);
      const tile = board.get(this.drag.x, this.drag.y);
      if (tile) this.drawTile(canvas, tile, o.x + d.dx * this.drag.offset, o.y + d.dy * this.drag.offset, 'normal', true, now);
    }

    if (this.hint) this.drawHint(canvas, now);
    if (this.failMark) this.drawFail(canvas, now);
    if (this.ball) this.ball.draw(canvas, this);
    this.particles.draw(canvas);
    this.dirty = false;
    return rec.finishRecordingAsPicture();
  }

  private trayPicture(): SkPicture {
    const n = this.session!.board.w;
    const key = `${this.side}|${n}`;
    if (this.trayCache && this.trayCache.key === key) return this.trayCache.pic;
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(0, 0, this.side, this.side));
    this.drawTray(c, n);
    this.trayCache = { key, pic: rec.finishRecordingAsPicture() };
    return this.trayCache.pic;
  }

  private drawTray(c: SkCanvas, n: number) {
    const side = this.side;
    const body = fillPaint(null);
    body.setShader(linear(0, 0, 0, side, ['#8a5530', '#4b2a13']));
    c.drawRRect(rrect(0, 0, side, side, side * 0.05), body);
    c.drawRRect(rrect(1, 1, side - 2, side - 2, side * 0.05), strokePaint('rgba(255,220,170,0.25)', 2));

    const inner = this.s * n;
    c.drawRRect(rrect(this.ox - 3, this.oy - 3, inner + 6, inner + 6, this.s * 0.18), fillPaint('#2b1a0e'));

    const s = this.s;
    const pad = s * 0.06;
    const slot = fillPaint('#21140a');
    const slotEdge = strokePaint('rgba(0,0,0,0.5)', 1.5);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const o = this.origin(x, y);
        const r = rrect(o.x + pad, o.y + pad, s - pad * 2, s - pad * 2, s * 0.15);
        c.drawRRect(r, slot);
        c.drawRRect(r, slotEdge);
      }
    }
  }

  private kindOf(tile: Tile): Kind {
    return tile.t === TILE.BLOCK ? 'stone' : tile.t === TILE.START ? 'start' : tile.t === TILE.END ? 'end' : tile.f ? 'walnut' : 'maple';
  }

  private drawTile(canvas: SkCanvas, tile: Tile, X: number, Y: number, glow: Glow, lifted: boolean, now: number) {
    const s = this.s;
    const holeLive = tile.t === TILE.END && glow === 'complete';
    const key = `${s}|${glow}|${lifted ? 1 : 0}|${tile.o}|${tile.f ? 1 : 0}`;
    let cached = this.tileCache.get(tile);
    if (!cached || cached.key !== key) {
      const rec = Skia.PictureRecorder();
      const c = rec.beginRecording(Skia.XYWHRect(-s * 0.2, -s * 0.2, s * 1.4, s * 1.4));
      this.drawTileArt(c, tile, glow, lifted, holeLive);
      cached = { key, pic: rec.finishRecordingAsPicture() };
      this.tileCache.set(tile, cached);
    }
    canvas.save();
    canvas.translate(X, Y);
    canvas.drawPicture(cached.pic);
    if (holeLive) {
      const lx = lifted ? -s * 0.01 : 0;
      const ly = lifted ? -s * 0.02 : 0;
      this.drawHole(canvas, lx, ly, true, now);
    }
    canvas.restore();
  }

  /** Static art of one tile at local origin (0, 0). */
  private drawTileArt(c: SkCanvas, tile: Tile, glow: Glow, lifted: boolean, skipHole: boolean) {
    const s = this.s;
    let X = 0;
    let Y = 0;
    const pad = s * 0.05;
    const r = s * 0.17;
    const w = s - pad * 2;
    const kind = this.kindOf(tile);
    const pal = WOOD[kind];

    // drop shadow
    c.drawRRect(rrect(X + pad + (lifted ? s * 0.02 : 0), Y + pad + s * (lifted ? 0.08 : 0.035), w, w, r), fillPaint('#000000', lifted ? 0.45 : 0.38));
    if (lifted) {
      X -= s * 0.01;
      Y -= s * 0.02;
    }
    const bx = X + pad;
    const by = Y + pad;
    const body = rrect(bx, by, w, w, r);

    // body
    const g = fillPaint(null);
    g.setShader(linear(bx, by, bx + w * 0.4, by + w, [pal[0], pal[1]]));
    c.drawRRect(body, g);

    // texture
    c.save();
    clipRRect(c, body);
    if (kind === 'stone') this.drawStone(c, bx, by, w, tile);
    else this.drawGrain(c, bx, by, w, pal[2], tile);
    c.restore();

    // bevel
    const bev = strokePaint(null, Math.max(1.5, s * 0.03));
    bev.setShader(linear(0, by, 0, by + w, ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.35)'], [0, 0.5, 1]));
    c.drawRRect(rrect(bx + 1.2, by + 1.2, w - 2.4, w - 2.4, r * 0.9), bev);

    if (kind === 'walnut') this.drawScrews(c, bx, by, w);

    // pipes
    if (tile.t === TILE.PIPE && tile.o) {
      const [a, b] = splitMask(tile.o);
      this.drawTube(c, X, Y, a, b, glow);
    } else if (tile.t === TILE.START) {
      this.drawTube(c, X, Y, 0, tile.o, glow === 'complete' ? 'complete' : 'connected');
      this.drawSocket(c, X, Y);
    } else if (tile.t === TILE.END) {
      this.drawTube(c, X, Y, tile.o, 0, glow === 'normal' ? 'normal' : glow);
      if (!skipHole) this.drawHole(c, X, Y, false, 0);
    }
  }

  private drawGrain(c: SkCanvas, x: number, y: number, w: number, col: string, tile: Tile) {
    const id = this.tileId(tile);
    const p = strokePaint(col, Math.max(1, w * 0.012));
    p.setAlphaf(0.16);
    const lines = 5;
    for (let i = 0; i < lines; i++) {
      const base = y + ((i + 0.5 + ((id * 0.37) % 1)) / lines) * w;
      const amp = w * (0.03 + ((id * (i + 3)) % 7) / 140);
      const phase = id * 1.7 + i;
      const pth = path();
      for (let k = 0; k <= 12; k++) {
        const px = x + (k / 12) * w;
        const py = base + Math.sin(phase + k * 0.7) * amp;
        if (k === 0) pth.moveTo(px, py);
        else pth.lineTo(px, py);
      }
      c.drawPath(pth, p);
    }
  }

  private drawStone(c: SkCanvas, x: number, y: number, w: number, tile: Tile) {
    const id = this.tileId(tile);
    const dot = fillPaint('rgba(40,46,54,0.35)');
    for (let i = 0; i < 14; i++) {
      const px = x + (((id * 31 + i * 57) % 97) / 97) * w;
      const py = y + (((id * 17 + i * 89) % 101) / 101) * w;
      c.drawCircle(px, py, w * (0.015 + (i % 3) * 0.01), dot);
    }
    const crack = path();
    crack.moveTo(x + w * 0.2, y + w * 0.15);
    crack.lineTo(x + w * 0.42, y + w * 0.45);
    crack.lineTo(x + w * 0.35, y + w * 0.7);
    crack.moveTo(x + w * 0.42, y + w * 0.45);
    crack.lineTo(x + w * 0.72, y + w * 0.55);
    c.drawPath(crack, strokePaint('rgba(30,34,40,0.45)', Math.max(1, w * 0.02)));
  }

  private drawScrews(c: SkCanvas, x: number, y: number, w: number) {
    const off = w * 0.14;
    const rad = Math.max(2, w * 0.05);
    const slot = strokePaint('rgba(60,40,10,0.7)', 1);
    [[off, off], [w - off, off], [off, w - off], [w - off, w - off]].forEach(([dx, dy]) => {
      const head = fillPaint(null);
      head.setShader(radial2(x + dx - rad * 0.3, y + dy - rad * 0.3, rad * 0.1, x + dx, y + dy, rad, ['#fff1b8', '#a37b28']));
      c.drawCircle(x + dx, y + dy, rad, head);
      c.drawLine(x + dx - rad * 0.6, y + dy, x + dx + rad * 0.6, y + dy, slot);
    });
  }

  private drawTube(c: SkCanvas, X: number, Y: number, a: number, b: number, glow: Glow) {
    const s = this.s;
    const p = pipePath(X, Y, s, a, b);
    c.drawPath(p, strokePaint(COLORS.groove, s * 0.36));
    if (glow !== 'normal') {
      c.drawPath(p, blur(strokePaint(COLORS.tube[glow], s * 0.24), s * 0.09));
    }
    c.drawPath(p, strokePaint(COLORS.tube[glow], s * 0.24));
    c.drawPath(p, strokePaint('rgba(0,0,0,0.12)', s * 0.24));
    c.drawPath(p, strokePaint(COLORS.tube[glow], s * 0.17));
    c.drawPath(p, strokePaint(COLORS.tubeHi[glow], s * 0.06));
  }

  private drawSocket(c: SkCanvas, X: number, Y: number) {
    const s = this.s;
    const cx = X + s / 2;
    const cy = Y + s / 2;
    c.drawCircle(cx, cy, s * 0.24, fillPaint('#1f6b47'));
    c.drawCircle(cx, cy, s * 0.24, strokePaint('#e6fff0', s * 0.045));
  }

  private drawHole(c: SkCanvas, X: number, Y: number, complete: boolean, now: number) {
    const s = this.s;
    const cx = X + s / 2;
    const cy = Y + s / 2;
    const pulse = complete ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
    if (complete) {
      c.drawCircle(cx, cy, s * (0.3 + pulse * 0.06), fillPaint(`rgba(255,214,70,${0.25 + pulse * 0.25})`));
    }
    const hole = fillPaint(null);
    hole.setShader(radial2(cx, cy - s * 0.04, s * 0.02, cx, cy, s * 0.22, ['#000000', '#3a2408']));
    c.drawCircle(cx, cy, s * 0.21, hole);
    c.drawCircle(cx, cy, s * 0.21, strokePaint('#ffe48a', s * 0.05));
    // tiny flag
    c.drawLine(cx + s * 0.02, cy, cx + s * 0.02, cy - s * 0.34, strokePaint('#5b3a12', Math.max(1.5, s * 0.025)));
    const flag = path();
    flag.moveTo(cx + s * 0.02, cy - s * 0.34);
    flag.lineTo(cx + s * 0.2, cy - s * 0.28);
    flag.lineTo(cx + s * 0.02, cy - s * 0.21);
    flag.close();
    c.drawPath(flag, fillPaint('#ff5d6c'));
  }

  private drawHint(c: SkCanvas, now: number) {
    const h = this.hint!;
    const s = this.s;
    const o = this.origin(h.x, h.y);
    const pulse = 0.5 + 0.5 * Math.sin((now - h.t0) / 140);
    c.drawRRect(rrect(o.x + s * 0.03, o.y + s * 0.03, s * 0.94, s * 0.94, s * 0.2), strokePaint(`rgba(255,224,102,${0.55 + pulse * 0.45})`, s * 0.06));
    const d = dirByBit(h.dir)!;
    const cx = o.x + s / 2 + d.dx * s * (0.55 + pulse * 0.12);
    const cy = o.y + s / 2 + d.dy * s * (0.55 + pulse * 0.12);
    const ang = (Math.atan2(d.dy, d.dx) * 180) / Math.PI;
    const arrow = path();
    arrow.moveTo(s * 0.2, 0);
    arrow.lineTo(-s * 0.1, -s * 0.18);
    arrow.lineTo(-s * 0.1, s * 0.18);
    arrow.close();
    c.save();
    c.translate(cx, cy);
    c.rotate(ang, 0, 0);
    c.drawPath(arrow, fillPaint('#ffe066'));
    c.drawPath(arrow, strokePaint('#7a5600', 2));
    c.restore();
  }

  private drawFail(c: SkCanvas, now: number) {
    const f = this.failMark!;
    const s = this.s;
    const t = (now - f.t0) / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    const rad = s * (0.26 + pulse * 0.04);
    c.drawCircle(f.px, f.py, rad, fillPaint('rgba(255,70,90,0.28)'));
    const st = strokePaint('#ff4d63', s * 0.05);
    c.drawCircle(f.px, f.py, rad, st);
    const k = rad * 0.45;
    c.drawLine(f.px - k, f.py - k, f.px + k, f.py + k, st);
    c.drawLine(f.px + k, f.py - k, f.px - k, f.py + k, st);
  }
}
