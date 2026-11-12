/* Ball Path — Ball controller: rolls the ball along a traced pipe path with acceleration,
 * spin, sinking into the goal on success, or dropping/bumping at the break on failure.
 */
(function (BP) {
  'use strict';
  const { TILE, Geometry } = BP;

  const RADIUS = 0.115; // in cell units — sits inside the ~0.2-wide pipe channel

  class BallController {
    constructor() { this.reset(); this.session = null; }

    attach(session) { this.session = session; this.reset(); }

    reset() {
      this.mode = 'idle';
      this.dist = 0;
      this.rot = 0;
      this.speed = 0;
      this.t = 0;
      this.segs = null;
      this.total = 0;
      this.result = null;
      this.cb = null;
      this.reduced = false;
    }

    get animating() { return this.mode !== 'idle' && this.mode !== 'done'; }

    /** @param trace result of Pathfinding.trace  @param cb {onArrive, onBreak, onDone} */
    roll(trace, cb, reduced) {
      this.reset();
      this.reduced = !!reduced;
      this.result = trace;
      this.cb = cb || {};
      this.segs = trace.path.map((p) => {
        const len = Geometry.segmentLength(p.inBit, p.outBit, 1);
        const seg = { ...p, len, startDist: this.total };
        this.total += len;
        return seg;
      });
      this.mode = 'rolling';
      this.speed = 2.2;
    }

    update(dt) {
      if (this.mode === 'rolling') {
        const maxSpeed = this.reduced ? 12 : 6;
        this.speed = Math.min(maxSpeed, this.speed + (this.reduced ? 30 : 5) * dt);
        const step = this.speed * dt;
        this.dist = Math.min(this.total, this.dist + step);
        this.rot += step / RADIUS;
        if (this.dist >= this.total) {
          this.t = 0;
          if (this.result.ok) {
            this.mode = 'sinking';
            this.cb.onArrive && this.cb.onArrive();
          } else {
            this.mode = 'breaking';
            this.cb.onBreak && this.cb.onBreak(this.result.fail);
          }
        }
      } else if (this.mode === 'sinking' || this.mode === 'breaking') {
        this.t += dt;
        const dur = this.reduced ? 0.15 : this.mode === 'sinking' ? 0.45 : 0.6;
        if (this.t >= dur) {
          this.t = dur;
          this.mode = 'done';
          this.cb.onDone && this.cb.onDone(this.result);
        }
      }
    }

    /** Position and heading at a distance along the path (cell units). */
    pointAt(r, dist) {
      const s = r.s;
      let seg = this.segs[this.segs.length - 1];
      for (const sg of this.segs) {
        if (dist <= sg.startDist + sg.len) { seg = sg; break; }
      }
      const local = Math.max(0, Math.min(1, (dist - seg.startDist) / seg.len));
      const o = r.origin(seg.x, seg.y);
      const p = Geometry.segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, local);
      const q = Geometry.segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, Math.min(1, local + 0.02));
      const p0 = local >= 0.98 ? Geometry.segmentPoint(o.x, o.y, s, seg.inBit, seg.outBit, local - 0.02) : p;
      let hx = q.x - p0.x, hy = q.y - p0.y;
      if (local >= 0.98) { hx = p.x - p0.x; hy = p.y - p0.y; }
      const hl = Math.hypot(hx, hy) || 1;
      return { x: p.x, y: p.y, hx: hx / hl, hy: hy / hl };
    }

    draw(ctx, r) {
      if (!this.session) return;
      const s = r.s;
      let x, y, hx = 1, hy = 0, scale = 1, alpha = 1;

      if (this.mode === 'idle' || !this.segs) {
        const st = this.session.board.find(TILE.START);
        const o = r.origin(st.x, st.y);
        x = o.x + s / 2; y = o.y + s / 2;
        const d = BP.dirByBit(this.session.board.get(st.x, st.y).o);
        hx = d.dx; hy = d.dy;
      } else {
        const p = this.pointAt(r, this.dist);
        x = p.x; y = p.y; hx = p.hx; hy = p.hy;
        const dur = this.reduced ? 0.15 : this.mode === 'sinking' ? 0.45 : 0.6;
        const k = this.mode === 'sinking' || this.mode === 'breaking' || this.mode === 'done' ? Math.min(1, this.t / dur) : 0;
        if (this.mode === 'sinking' || (this.mode === 'done' && this.result.ok)) {
          scale = 1 - 0.55 * k;
          alpha = 1 - 0.5 * k;
        } else if (this.mode === 'breaking' || this.mode === 'done') {
          const reason = this.result.fail && this.result.fail.reason;
          if (reason === 'gap' || reason === 'edge') {
            // roll a little past the edge and drop out of sight
            x += hx * s * 0.3 * k; y += hy * s * 0.3 * k;
            scale = 1 - 0.85 * k * k;
            alpha = 1 - k * k;
          } else {
            // bump back off the blocking tile, with a little shake
            const back = Math.sin(Math.min(1, k * 2) * Math.PI) * 0.12;
            x -= hx * s * back; y -= hy * s * back;
            x += Math.sin(k * 40) * s * 0.02 * (1 - k);
          }
        }
      }

      const rad = s * RADIUS * scale;
      if (rad <= 0.5 || alpha <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + rad * 0.15, y + rad * 0.55, rad * 0.95, rad * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const img = BP.Assets && BP.Assets.ready && BP.Assets.images.ball;
      if (img) {
        // Marble render: its highlight is baked in, so the image stays upright and only a
        // faint moving sheen hints at the roll.
        ctx.drawImage(img, x - rad, y - rad, rad * 2, rad * 2);
        if (this.mode === 'rolling') {
          const ph = Math.sin(this.rot);
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.08 * ph})`;
          ctx.beginPath();
          ctx.ellipse(x + hx * ph * rad * 0.5, y + hy * ph * rad * 0.5, rad * 0.25, rad * 0.9, Math.atan2(hy, hx), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        return;
      }
      // body (procedural fallback)
      const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
      g.addColorStop(0, '#ff9aa4');
      g.addColorStop(0.45, '#f23a55');
      g.addColorStop(1, '#8f0f2a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      // rolling stripe: a band that sweeps across the ball along the heading
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.clip();
      for (const k of [0, Math.PI]) {
        const ph = this.rot + k;
        const vis = Math.sin(ph);
        if (vis <= 0) continue;
        const along = Math.cos(ph) * rad * 0.8;
        ctx.save();
        ctx.translate(x + hx * along, y + hy * along);
        ctx.rotate(Math.atan2(hy, hx));
        ctx.fillStyle = `rgba(255,240,200,${0.75 * vis})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, rad * 0.16 * vis + 0.5, rad * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      // specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(x - rad * 0.38, y - rad * 0.42, rad * 0.26, rad * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /** Current ball position in canvas pixels (for particle effects). */
    screenPos(r) {
      if (!this.segs) return null;
      return this.pointAt(r, this.dist);
    }
  }

  BP.BallController = BallController;
})(window.BP = window.BP || {});
