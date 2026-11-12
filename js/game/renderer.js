/* Ball Path — Board renderer: draws the wooden tray, tiles, pipes, hints, ball and effects on a canvas. */
(function (BP) {
  'use strict';
  const { TILE, DIRS, Geometry, ParticleSystem } = BP;

  const COLORS = {
    tube: { normal: '#c9d2da', connected: '#3fd6c8', complete: '#ffcc33' },
    tubeHi: { normal: 'rgba(255,255,255,0.65)', connected: 'rgba(225,255,252,0.85)', complete: 'rgba(255,250,215,0.9)' },
    groove: 'rgba(60,32,12,0.55)',
  };

  const WOOD = {
    maple: ['#f6d197', '#d9964f', '#9a5e2a'],
    walnut: ['#a86b3c', '#6f3f1d', '#3d220f'],
    start: ['#c8f0d6', '#5cc58e', '#2c7a52'],
    end: ['#ffe9a8', '#f0b23a', '#9b6614'],
    stone: ['#b8c0c8', '#77818c', '#4a525b'],
  };

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class BoardRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.session = null;
      this.ball = null;
      this.drag = null;        // {x, y, dir, offset}
      this.anims = [];         // tile slide animations
      this.hint = null;        // {x, y, dir, t0}
      this.failMark = null;    // {px, py, t0}
      this.particles = new ParticleSystem();
      this.grain = new WeakMap();
      this.grainSeq = 1;
      this.reduced = false;
      this.dirty = true;
      this.side = 0;
      this.s = 0;
      this.ox = 0;
      this.oy = 0;
    }

    attach(session, ball) {
      this.session = session;
      this.ball = ball;
      this.drag = null;
      this.anims = [];
      this.hint = null;
      this.failMark = null;
      this.particles.clear();
      this.resize();
    }

    resize() {
      const parent = this.canvas.parentElement;
      if (!parent || !this.session) return;
      const rect = parent.getBoundingClientRect();
      const side = Math.floor(Math.min(rect.width, rect.height));
      if (side <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.side = side;
      this.dpr = dpr;
      this.canvas.style.width = side + 'px';
      this.canvas.style.height = side + 'px';
      this.canvas.width = Math.round(side * dpr);
      this.canvas.height = Math.round(side * dpr);
      const n = this.session.board.w;
      const frame = Math.max(8, side * 0.035);
      this.s = (side - frame * 2) / n;
      this.ox = frame;
      this.oy = frame;
      this.dirty = true;
    }

    origin(x, y) { return { x: this.ox + x * this.s, y: this.oy + y * this.s }; }

    cellAt(px, py) {
      const x = Math.floor((px - this.ox) / this.s);
      const y = Math.floor((py - this.oy) / this.s);
      return this.session.board.inBounds(x, y) ? { x, y } : null;
    }

    tileId(tile) {
      let id = this.grain.get(tile);
      if (!id) { id = this.grainSeq++; this.grain.set(tile, id); }
      return id;
    }

    // ---- animation API -------------------------------------------------
    /** Animate a committed move. fromOffset = pixels the tile was already dragged. */
    animateMove(move, fromOffset = 0, onDone) {
      const d = BP.dirByBit(move.dir);
      const from = this.origin(move.x, move.y);
      const to = this.origin(move.toX, move.toY);
      const remaining = 1 - Math.min(1, fromOffset / this.s);
      const dur = this.reduced ? 0.06 : 0.07 + 0.11 * remaining;
      this.anims.push({
        cellX: move.toX, cellY: move.toY,
        fx: from.x + d.dx * fromOffset, fy: from.y + d.dy * fromOffset,
        tx: to.x, ty: to.y, t: 0, dur, onDone,
      });
      this.dirty = true;
    }

    animateSnapBack(x, y, dir, offset) {
      if (offset <= 0.5) return;
      const d = BP.dirByBit(dir);
      const o = this.origin(x, y);
      this.anims.push({ cellX: x, cellY: y, fx: o.x + d.dx * offset, fy: o.y + d.dy * offset, tx: o.x, ty: o.y, t: 0, dur: 0.12 });
    }

    showHint(move) { this.hint = { ...move, t0: performance.now() }; this.dirty = true; }
    clearHint() { this.hint = null; this.dirty = true; }

    showFail(fail, path) {
      const s = this.s;
      let px, py;
      if (this.session.board.inBounds(fail.x, fail.y)) {
        const o = this.origin(fail.x, fail.y);
        px = o.x + s / 2; py = o.y + s / 2;
      } else {
        const last = path[path.length - 1];
        const o = this.origin(last.x, last.y);
        const e = Geometry.edgePoint(o.x, o.y, s, last.outBit);
        px = e.x; py = e.y;
      }
      this.failMark = { px, py, t0: performance.now() };
    }

    clearFail() { this.failMark = null; }

    get busy() { return this.anims.length > 0; }

    needsFrame() {
      return this.dirty || this.anims.length || this.particles.active || this.hint || this.failMark ||
        (this.ball && this.ball.animating) || (this.session && this.session.connection.ok);
    }

    update(dt) {
      for (const a of this.anims) a.t += dt / a.dur;
      const done = this.anims.filter((a) => a.t >= 1);
      this.anims = this.anims.filter((a) => a.t < 1);
      done.forEach((a) => a.onDone && a.onDone());
      this.particles.update(dt); // the fail marker stays until the next move, undo or restart
    }

    // ---- drawing --------------------------------------------------------
    render(now) {
      if (!this.session || !this.side) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.side, this.side);
      this.drawTray(ctx);

      const board = this.session.board;
      const conn = this.session.connection;
      const connected = new Map();
      conn.path.forEach((p) => connected.set(p.y * board.w + p.x, p));
      const level = conn.ok ? 'complete' : 'connected';

      const skip = new Set();
      this.anims.forEach((a) => skip.add(a.cellY * board.w + a.cellX));
      if (this.drag) skip.add(this.drag.y * board.w + this.drag.x);

      for (let y = 0; y < board.h; y++) {
        for (let x = 0; x < board.w; x++) {
          const i = y * board.w + x;
          const tile = board.get(x, y);
          if (tile.t === TILE.EMPTY || skip.has(i)) continue;
          const o = this.origin(x, y);
          this.drawTile(ctx, tile, o.x, o.y, connected.has(i) ? level : 'normal', false, now);
        }
      }

      // Moving tiles on top, "lifted".
      for (const a of this.anims) {
        const t = ease(Math.min(1, a.t));
        const tile = board.get(a.cellX, a.cellY);
        if (tile.t !== TILE.EMPTY) this.drawTile(ctx, tile, a.fx + (a.tx - a.fx) * t, a.fy + (a.ty - a.fy) * t, 'normal', true, now);
      }
      if (this.drag) {
        const d = BP.dirByBit(this.drag.dir) || { dx: 0, dy: 0 };
        const o = this.origin(this.drag.x, this.drag.y);
        this.drawTile(ctx, board.get(this.drag.x, this.drag.y), o.x + d.dx * this.drag.offset, o.y + d.dy * this.drag.offset, 'normal', true, now);
      }

      if (this.hint) this.drawHint(ctx, now);
      if (this.failMark) this.drawFail(ctx, now);
      if (this.ball) this.ball.draw(ctx, this);
      this.particles.draw(ctx);
      this.dirty = false;
    }

    drawTray(ctx) {
      const side = this.side;
      const g = ctx.createLinearGradient(0, 0, 0, side);
      g.addColorStop(0, '#8a5530');
      g.addColorStop(1, '#4b2a13');
      rr(ctx, 0, 0, side, side, side * 0.05);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,170,0.25)';
      ctx.lineWidth = 2;
      rr(ctx, 1, 1, side - 2, side - 2, side * 0.05);
      ctx.stroke();

      const n = this.session.board.w;
      const inner = this.s * n;
      rr(ctx, this.ox - 3, this.oy - 3, inner + 6, inner + 6, this.s * 0.18);
      ctx.fillStyle = '#2b1a0e';
      ctx.fill();

      const s = this.s, pad = s * 0.06;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const o = this.origin(x, y);
          rr(ctx, o.x + pad, o.y + pad, s - pad * 2, s - pad * 2, s * 0.15);
          ctx.fillStyle = '#21140a';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    drawTile(ctx, tile, X, Y, glow, lifted, now) {
      const s = this.s;
      const pad = s * 0.05, r = s * 0.17;
      const x = X + pad, y = Y + pad, w = s - pad * 2;
      const kind = tile.t === TILE.BLOCK ? 'stone'
        : tile.t === TILE.START ? 'start'
          : tile.t === TILE.END ? 'end'
            : tile.f ? 'walnut' : 'maple';
      const pal = WOOD[kind];

      // drop shadow
      rr(ctx, x + (lifted ? s * 0.02 : 0), y + s * (lifted ? 0.08 : 0.035), w, w, r);
      ctx.fillStyle = lifted ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.38)';
      ctx.fill();
      if (lifted) { X -= s * 0.01; Y -= s * 0.02; }
      const bx = X + pad, by = Y + pad;

      // body
      const g = ctx.createLinearGradient(bx, by, bx + w * 0.4, by + w);
      g.addColorStop(0, pal[0]);
      g.addColorStop(1, pal[1]);
      rr(ctx, bx, by, w, w, r);
      ctx.fillStyle = g;
      ctx.fill();

      // texture
      ctx.save();
      rr(ctx, bx, by, w, w, r);
      ctx.clip();
      if (kind === 'stone') this.drawStone(ctx, bx, by, w, tile);
      else this.drawGrain(ctx, bx, by, w, pal[2], tile);
      ctx.restore();

      // bevel
      const bev = ctx.createLinearGradient(0, by, 0, by + w);
      bev.addColorStop(0, 'rgba(255,255,255,0.55)');
      bev.addColorStop(0.5, 'rgba(255,255,255,0)');
      bev.addColorStop(1, 'rgba(0,0,0,0.35)');
      rr(ctx, bx + 1.2, by + 1.2, w - 2.4, w - 2.4, r * 0.9);
      ctx.strokeStyle = bev;
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      ctx.stroke();

      if (kind === 'walnut') this.drawScrews(ctx, bx, by, w);

      // pipes
      if (tile.t === TILE.PIPE && tile.o) {
        const [a, b] = Geometry.splitMask(tile.o);
        this.drawTube(ctx, X, Y, a, b, glow);
      } else if (tile.t === TILE.START) {
        this.drawTube(ctx, X, Y, 0, tile.o, glow === 'complete' ? 'complete' : 'connected');
        this.drawSocket(ctx, X, Y);
      } else if (tile.t === TILE.END) {
        this.drawTube(ctx, X, Y, tile.o, 0, glow === 'normal' ? 'normal' : glow);
        this.drawHole(ctx, X, Y, glow === 'complete', now);
      }
    }

    drawGrain(ctx, x, y, w, color, tile) {
      const id = this.tileId(tile);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = Math.max(1, w * 0.012);
      const lines = 5;
      for (let i = 0; i < lines; i++) {
        const base = y + ((i + 0.5 + ((id * 0.37) % 1)) / lines) * w;
        const amp = w * (0.03 + ((id * (i + 3)) % 7) / 140);
        const phase = id * 1.7 + i;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const px = x + (k / 12) * w;
          const py = base + Math.sin(phase + k * 0.7) * amp;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawStone(ctx, x, y, w, tile) {
      const id = this.tileId(tile);
      ctx.fillStyle = 'rgba(40,46,54,0.35)';
      for (let i = 0; i < 14; i++) {
        const px = x + (((id * 31 + i * 57) % 97) / 97) * w;
        const py = y + (((id * 17 + i * 89) % 101) / 101) * w;
        ctx.beginPath();
        ctx.arc(px, py, w * (0.015 + (i % 3) * 0.01), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(30,34,40,0.45)';
      ctx.lineWidth = Math.max(1, w * 0.02);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y + w * 0.15);
      ctx.lineTo(x + w * 0.42, y + w * 0.45);
      ctx.lineTo(x + w * 0.35, y + w * 0.7);
      ctx.moveTo(x + w * 0.42, y + w * 0.45);
      ctx.lineTo(x + w * 0.72, y + w * 0.55);
      ctx.stroke();
    }

    drawScrews(ctx, x, y, w) {
      const off = w * 0.14, rad = Math.max(2, w * 0.05);
      [[off, off], [w - off, off], [off, w - off], [w - off, w - off]].forEach(([dx, dy]) => {
        const g = ctx.createRadialGradient(x + dx - rad * 0.3, y + dy - rad * 0.3, rad * 0.1, x + dx, y + dy, rad);
        g.addColorStop(0, '#fff1b8');
        g.addColorStop(1, '#a37b28');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,10,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + dx - rad * 0.6, y + dy);
        ctx.lineTo(x + dx + rad * 0.6, y + dy);
        ctx.stroke();
      });
    }

    drawTube(ctx, X, Y, a, b, glow) {
      const s = this.s;
      ctx.lineCap = 'butt';
      const stroke = (width, color) => {
        ctx.beginPath();
        Geometry.tracePipe(ctx, X, Y, s, a, b);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      stroke(s * 0.36, COLORS.groove);
      if (glow !== 'normal') {
        ctx.save();
        ctx.shadowColor = COLORS.tube[glow];
        ctx.shadowBlur = s * 0.18;
        stroke(s * 0.24, COLORS.tube[glow]);
        ctx.restore();
      } else {
        stroke(s * 0.24, COLORS.tube.normal);
      }
      stroke(s * 0.24, 'rgba(0,0,0,0.12)');
      stroke(s * 0.17, COLORS.tube[glow]);
      stroke(s * 0.06, COLORS.tubeHi[glow]);
    }

    drawSocket(ctx, X, Y) {
      const s = this.s, cx = X + s / 2, cy = Y + s / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = '#1f6b47';
      ctx.fill();
      ctx.lineWidth = s * 0.045;
      ctx.strokeStyle = '#e6fff0';
      ctx.stroke();
    }

    drawHole(ctx, X, Y, complete, now) {
      const s = this.s, cx = X + s / 2, cy = Y + s / 2;
      const pulse = complete ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
      if (complete) {
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.3 + pulse * 0.06), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,214,70,${0.25 + pulse * 0.25})`;
        ctx.fill();
      }
      const g = ctx.createRadialGradient(cx, cy - s * 0.04, s * 0.02, cx, cy, s * 0.22);
      g.addColorStop(0, '#000');
      g.addColorStop(1, '#3a2408');
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.21, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = s * 0.05;
      ctx.strokeStyle = '#ffe48a';
      ctx.stroke();
      // tiny flag
      ctx.strokeStyle = '#5b3a12';
      ctx.lineWidth = Math.max(1.5, s * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.02, cy);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.34);
      ctx.stroke();
      ctx.fillStyle = '#ff5d6c';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.02, cy - s * 0.34);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.28);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.21);
      ctx.closePath();
      ctx.fill();
    }

    drawHint(ctx, now) {
      const h = this.hint, s = this.s;
      const o = this.origin(h.x, h.y);
      const pulse = 0.5 + 0.5 * Math.sin((now - h.t0) / 140);
      rr(ctx, o.x + s * 0.03, o.y + s * 0.03, s * 0.94, s * 0.94, s * 0.2);
      ctx.strokeStyle = `rgba(255,224,102,${0.55 + pulse * 0.45})`;
      ctx.lineWidth = s * 0.06;
      ctx.stroke();
      const d = BP.dirByBit(h.dir);
      const cx = o.x + s / 2 + d.dx * s * (0.55 + pulse * 0.12);
      const cy = o.y + s / 2 + d.dy * s * (0.55 + pulse * 0.12);
      const ang = Math.atan2(d.dy, d.dx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(s * 0.2, 0);
      ctx.lineTo(-s * 0.1, -s * 0.18);
      ctx.lineTo(-s * 0.1, s * 0.18);
      ctx.closePath();
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = '#7a5600';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawFail(ctx, now) {
      const f = this.failMark, s = this.s;
      const t = (now - f.t0) / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      const rad = s * (0.26 + pulse * 0.04);
      ctx.beginPath();
      ctx.arc(f.px, f.py, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,70,90,0.28)';
      ctx.fill();
      ctx.lineWidth = s * 0.05;
      ctx.strokeStyle = '#ff4d63';
      ctx.stroke();
      const k = rad * 0.45;
      ctx.beginPath();
      ctx.moveTo(f.px - k, f.py - k); ctx.lineTo(f.px + k, f.py + k);
      ctx.moveTo(f.px + k, f.py - k); ctx.lineTo(f.px - k, f.py + k);
      ctx.stroke();
    }
  }

  BP.BoardRenderer = BoardRenderer;
})(window.BP = window.BP || {});
