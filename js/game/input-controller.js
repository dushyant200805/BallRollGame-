/* Ball Path — Input controller: mouse / touch / pen dragging and tapping of tiles via Pointer Events. */
(function (BP) {
  'use strict';

  const COMMIT_FRACTION = 0.35; // drag at least this much of a cell to commit
  const TAP_SLOP = 8;           // px of movement still counted as a tap

  class InputController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {BoardRenderer} renderer
     * @param {{canInteract:()=>boolean, onMove:(x,y,dir,offset)=>boolean, onInvalid:(x,y)=>void, onGrab:()=>void}} handlers
     */
    constructor(canvas, renderer, handlers) {
      this.canvas = canvas;
      this.r = renderer;
      this.h = handlers;
      this.active = null;
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      canvas.addEventListener('pointerup', (e) => this.up(e));
      canvas.addEventListener('pointercancel', () => this.cancel());
      canvas.addEventListener('lostpointercapture', () => { if (this.active) this.up(null); });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    local(e) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    down(e) {
      if (this.active || !this.h.canInteract() || this.r.busy) return;
      const p = this.local(e);
      const cell = this.r.cellAt(p.x, p.y);
      if (!cell) return;
      const board = this.r.session.board;
      const dirs = board.movableDirs(cell.x, cell.y);
      if (!dirs.length) {
        this.h.onInvalid(cell.x, cell.y);
        return;
      }
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this.active = { id: e.pointerId, cell, dirs, sx: p.x, sy: p.y, moved: 0 };
      this.r.drag = { x: cell.x, y: cell.y, dir: dirs[0], offset: 0 };
      this.r.dirty = true;
      this.h.onGrab && this.h.onGrab();
    }

    move(e) {
      const a = this.active;
      if (!a || e.pointerId !== a.id) return;
      const p = this.local(e);
      const dx = p.x - a.sx, dy = p.y - a.sy;
      a.moved = Math.max(a.moved, Math.hypot(dx, dy));
      // Project the drag onto each allowed direction; take the strongest.
      let best = a.dirs[0], bestProj = -Infinity;
      for (const bit of a.dirs) {
        const d = BP.dirByBit(bit);
        const proj = dx * d.dx + dy * d.dy;
        if (proj > bestProj) { bestProj = proj; best = bit; }
      }
      this.r.drag = { x: a.cell.x, y: a.cell.y, dir: best, offset: Math.max(0, Math.min(this.r.s, bestProj)) };
      this.r.dirty = true;
    }

    up(e) {
      const a = this.active;
      if (!a || (e && e.pointerId !== a.id)) return;
      const drag = this.r.drag;
      this.active = null;
      this.r.drag = null;
      this.r.dirty = true;
      if (!drag) return;
      let commitDir = null;
      if (drag.offset >= this.r.s * COMMIT_FRACTION) commitDir = drag.dir;
      else if (a.moved <= TAP_SLOP && a.dirs.length === 1) commitDir = a.dirs[0]; // tap = slide to the only free side
      if (commitDir !== null) {
        const ok = this.h.onMove(a.cell.x, a.cell.y, commitDir, commitDir === drag.dir ? drag.offset : 0);
        if (!ok) this.r.animateSnapBack(a.cell.x, a.cell.y, drag.dir, drag.offset);
      } else {
        this.r.animateSnapBack(a.cell.x, a.cell.y, drag.dir, drag.offset);
        if (a.moved <= TAP_SLOP && a.dirs.length > 1) this.h.onAmbiguousTap && this.h.onAmbiguousTap();
      }
    }

    cancel() {
      if (!this.active) return;
      const drag = this.r.drag;
      this.active = null;
      this.r.drag = null;
      if (drag) this.r.animateSnapBack(drag.x, drag.y, drag.dir, drag.offset);
    }
  }

  BP.InputController = InputController;
})(window.BP = window.BP || {});
