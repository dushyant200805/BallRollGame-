/** Ball controller: rolls the ball along a traced pipe path with acceleration, spin, sinking
 * into the goal on success, or dropping/bumping at the break on failure.
 * Port of js/game/ball-controller.js.
 */
import type { SkCanvas } from '@shopify/react-native-skia';
import { TILE, dirByBit } from '../core/constants';
import type { GameSession } from '../core/session';
import type { FailReason, PathStep, TraceResult } from '../core/pathfinding';
import { segmentLength, segmentPoint } from './geometry';
import { drawBall } from './ballPainter';
import { BALL_SKINS, DEFAULT_BALL, type BallSkin } from '../data/ballSkins';

const DEFAULT_SKIN = BALL_SKINS.find((b) => b.id === DEFAULT_BALL) || BALL_SKINS[0];

const RADIUS = 0.17; // in cell units

type Mode = 'idle' | 'rolling' | 'sinking' | 'breaking' | 'done';

export interface RollCallbacks {
  onArrive?: () => void;
  onBreak?: (fail: { x: number; y: number; reason: FailReason }) => void;
  onDone?: (result: TraceResult) => void;
}

interface Seg extends PathStep {
  len: number;
  startDist: number;
}

interface Layout {
  s: number;
  origin(x: number, y: number): { x: number; y: number };
}

export class BallController {
  session: GameSession | null = null;
  skin: BallSkin | null = null; // set by the engine from the player's selection
  mode: Mode = 'idle';
  dist = 0;
  rot = 0;
  speed = 0;
  t = 0;
  segs: Seg[] | null = null;
  total = 0;
  result: TraceResult | null = null;
  cb: RollCallbacks = {};
  reduced = false;

  attach(session: GameSession) {
    this.session = session;
    this.reset();
  }

  reset() {
    this.mode = 'idle';
    this.dist = 0;
    this.rot = 0;
    this.speed = 0;
    this.t = 0;
    this.segs = null;
    this.total = 0;
    this.result = null;
    this.cb = {};
    this.reduced = false;
  }

  get animating() {
    return this.mode !== 'idle' && this.mode !== 'done';
  }

  /** Rolling speed relative to top speed (0..1), drives the rolling sound's intensity. */
  get intensity() {
    if (this.mode !== 'rolling') return 0;
    return Math.min(1, this.speed / (this.reduced ? 12 : 6));
  }

  roll(traceResult: TraceResult, cb: RollCallbacks, reduced: boolean) {
    this.reset();
    this.reduced = !!reduced;
    this.result = traceResult;
    this.cb = cb || {};
    this.segs = traceResult.path.map((p) => {
      const len = segmentLength(p.inBit, p.outBit, 1);
      const seg = { ...p, len, startDist: this.total };
      this.total += len;
      return seg;
    });
    this.mode = 'rolling';
    this.speed = 2.2;
  }

  private sinkDur() {
    return this.reduced ? 0.15 : this.mode === 'sinking' ? 0.45 : 0.6;
  }

  update(dt: number) {
    if (this.mode === 'rolling') {
      const maxSpeed = this.reduced ? 12 : 6;
      this.speed = Math.min(maxSpeed, this.speed + (this.reduced ? 30 : 5) * dt);
      const step = this.speed * dt;
      this.dist = Math.min(this.total, this.dist + step);
      this.rot += step / RADIUS;
      if (this.dist >= this.total) {
        this.t = 0;
        if (this.result!.ok) {
          this.mode = 'sinking';
          this.cb.onArrive && this.cb.onArrive();
        } else {
          this.mode = 'breaking';
          this.cb.onBreak && this.cb.onBreak(this.result!.fail!);
        }
      }
    } else if (this.mode === 'sinking' || this.mode === 'breaking') {
      this.t += dt;
      const dur = this.sinkDur();
      if (this.t >= dur) {
        this.t = dur;
        this.mode = 'done';
        this.cb.onDone && this.cb.onDone(this.result!);
      }
    }
  }

  /** Position and heading at a distance along the path. */
  pointAt(r: Layout, dist: number) {
    const s = r.s;
    const segs = this.segs!;
    let seg = segs[segs.length - 1];
    for (const sg of segs) {
      if (dist <= sg.startDist + sg.len) {
        seg = sg;
        break;
      }
    }
    const local = Math.max(0, Math.min(1, (dist - seg.startDist) / seg.len));
    const o = r.origin(seg.x, seg.y);
    const p = segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, local);
    const q = segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, Math.min(1, local + 0.02));
    const p0 = local >= 0.98 ? segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, local - 0.02) : p;
    let hx = q.x - p0.x;
    let hy = q.y - p0.y;
    if (local >= 0.98) {
      hx = p.x - p0.x;
      hy = p.y - p0.y;
    }
    const hl = Math.hypot(hx, hy) || 1;
    return { x: p.x, y: p.y, hx: hx / hl, hy: hy / hl };
  }

  draw(c: SkCanvas, r: Layout) {
    if (!this.session) return;
    const s = r.s;
    let x: number;
    let y: number;
    let hx = 1;
    let hy = 0;
    let scale = 1;
    let alpha = 1;

    if (this.mode === 'idle' || !this.segs) {
      const st = this.session.board.find(TILE.START)!;
      const o = r.origin(st.x, st.y);
      x = o.x + s / 2;
      y = o.y + s / 2;
      const d = dirByBit(this.session.board.get(st.x, st.y)!.o)!;
      hx = d.dx;
      hy = d.dy;
    } else {
      const p = this.pointAt(r, this.dist);
      x = p.x;
      y = p.y;
      hx = p.hx;
      hy = p.hy;
      const dur = this.reduced ? 0.15 : this.mode === 'sinking' ? 0.45 : 0.6;
      const k = this.mode === 'sinking' || this.mode === 'breaking' || this.mode === 'done' ? Math.min(1, this.t / dur) : 0;
      if (this.mode === 'sinking' || (this.mode === 'done' && this.result!.ok)) {
        scale = 1 - 0.55 * k;
        alpha = 1 - 0.5 * k;
      } else if (this.mode === 'breaking' || this.mode === 'done') {
        const reason = this.result!.fail && this.result!.fail.reason;
        if (reason === 'gap' || reason === 'edge') {
          // roll a little past the edge and drop out of sight
          x += hx * s * 0.3 * k;
          y += hy * s * 0.3 * k;
          scale = 1 - 0.85 * k * k;
          alpha = 1 - k * k;
        } else {
          // bump back off the blocking tile, with a little shake
          const back = Math.sin(Math.min(1, k * 2) * Math.PI) * 0.12;
          x -= hx * s * back;
          y -= hy * s * back;
          x += Math.sin(k * 40) * s * 0.02 * (1 - k);
        }
      }
    }

    drawBall(c, this.skin || DEFAULT_SKIN, x, y, s * RADIUS * scale, this.rot, hx, hy, alpha);
  }

  /** Current ball position in board pixels (for particle effects). */
  screenPos(r: Layout) {
    if (!this.segs) return null;
    return this.pointAt(r, this.dist);
  }
}
