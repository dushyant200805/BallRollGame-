/* Ball Path — Board manager: grid state, move validation and application. */
(function (BP) {
  'use strict';
  const { DIRS, Tiles, TILE } = BP;

  class Board {
    constructor(width, height, cells) {
      this.w = width;
      this.h = height;
      this.cells = cells; // flat array, index = y * w + x
    }

    static fromRows(rows) {
      const parsed = rows.map((r) => r.trim().split(/\s+/));
      const h = parsed.length;
      const w = parsed[0].length;
      const cells = [];
      parsed.forEach((row, y) => {
        if (row.length !== w) throw new Error(`Row ${y} has ${row.length} cells, expected ${w}`);
        row.forEach((tok) => cells.push(Tiles.parseToken(tok)));
      });
      const board = new Board(w, h, cells);
      board.validateStructure();
      return board;
    }

    toRows() {
      const rows = [];
      for (let y = 0; y < this.h; y++) {
        const row = [];
        for (let x = 0; x < this.w; x++) row.push(Tiles.toToken(this.get(x, y)));
        rows.push(row.join(' '));
      }
      return rows;
    }

    validateStructure() {
      const starts = this.cells.filter((c) => c.t === TILE.START).length;
      const ends = this.cells.filter((c) => c.t === TILE.END).length;
      const empties = this.cells.filter((c) => c.t === TILE.EMPTY).length;
      if (starts !== 1) throw new Error('Board needs exactly one start, found ' + starts);
      if (ends !== 1) throw new Error('Board needs exactly one end, found ' + ends);
      if (empties < 1) throw new Error('Board needs at least one empty slot');
    }

    clone() {
      return new Board(this.w, this.h, this.cells.map((c) => ({ t: c.t, o: c.o, f: c.f })));
    }

    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    index(x, y) { return y * this.w + x; }
    get(x, y) { return this.inBounds(x, y) ? this.cells[y * this.w + x] : null; }
    set(x, y, tile) { this.cells[y * this.w + x] = tile; }

    find(type) {
      const i = this.cells.findIndex((c) => c.t === type);
      return i < 0 ? null : { x: i % this.w, y: Math.floor(i / this.w) };
    }

    /** Directions the tile at (x,y) may legally slide (into an adjacent empty slot). */
    movableDirs(x, y) {
      if (!Tiles.isMovable(this.get(x, y))) return [];
      return DIRS.filter((d) => Tiles.isEmpty(this.get(x + d.dx, y + d.dy))).map((d) => d.bit);
    }

    canMove(x, y, dirBit) {
      const d = BP.dirByBit(dirBit);
      if (!d) return false;
      return Tiles.isMovable(this.get(x, y)) && Tiles.isEmpty(this.get(x + d.dx, y + d.dy));
    }

    /** Slide tile (x,y) one cell in dirBit. Returns the move record, or null if illegal. */
    move(x, y, dirBit) {
      if (!this.canMove(x, y, dirBit)) return null;
      const d = BP.dirByBit(dirBit);
      const nx = x + d.dx, ny = y + d.dy;
      const tile = this.get(x, y);
      this.set(nx, ny, tile);
      this.set(x, y, Tiles.empty());
      return { x, y, dir: dirBit, toX: nx, toY: ny };
    }

    /** Every legal move on the board. */
    legalMoves() {
      const moves = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (!Tiles.isEmpty(this.get(x, y))) continue;
          for (const d of DIRS) {
            // A tile at (x - dx, y - dy) moving in direction d lands on (x, y).
            const sx = x - d.dx, sy = y - d.dy;
            if (Tiles.isMovable(this.get(sx, sy))) moves.push({ x: sx, y: sy, dir: d.bit });
          }
        }
      }
      return moves;
    }

    /** Compact state key: fixed cells never move, so only movable/empty content matters. */
    key() {
      let s = '';
      for (const c of this.cells) {
        if (c.t === TILE.EMPTY) s += '.';
        else if (Tiles.isMovable(c)) s += String.fromCharCode(65 + c.o);
        else s += '#';
      }
      return s;
    }
  }

  BP.Board = Board;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
