/** Board manager: grid state, move validation and application (port of js/core/board.js). */
import { DIRS, DirBit, MoveRecord, Move, TILE, Tile, TileType, dirByBit } from './constants';
import { Tiles } from './tiles';

export class Board {
  constructor(
    public w: number,
    public h: number,
    public cells: Tile[], // flat array, index = y * w + x
  ) {}

  static fromRows(rows: readonly string[]): Board {
    const parsed = rows.map((r) => r.trim().split(/\s+/));
    const h = parsed.length;
    const w = parsed[0].length;
    const cells: Tile[] = [];
    parsed.forEach((row, y) => {
      if (row.length !== w) throw new Error(`Row ${y} has ${row.length} cells, expected ${w}`);
      row.forEach((tok) => cells.push(Tiles.parseToken(tok)));
    });
    const board = new Board(w, h, cells);
    board.validateStructure();
    return board;
  }

  toRows(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      const row: string[] = [];
      for (let x = 0; x < this.w; x++) row.push(Tiles.toToken(this.get(x, y)!));
      rows.push(row.join(' '));
    }
    return rows;
  }

  validateStructure(): void {
    const starts = this.cells.filter((c) => c.t === TILE.START).length;
    const ends = this.cells.filter((c) => c.t === TILE.END).length;
    const empties = this.cells.filter((c) => c.t === TILE.EMPTY).length;
    if (starts !== 1) throw new Error('Board needs exactly one start, found ' + starts);
    if (ends !== 1) throw new Error('Board needs exactly one end, found ' + ends);
    if (empties < 1) throw new Error('Board needs at least one empty slot');
  }

  clone(): Board {
    return new Board(this.w, this.h, this.cells.map((c) => ({ t: c.t, o: c.o, f: c.f })));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  index(x: number, y: number): number {
    return y * this.w + x;
  }
  get(x: number, y: number): Tile | null {
    return this.inBounds(x, y) ? this.cells[y * this.w + x] : null;
  }
  set(x: number, y: number, tile: Tile): void {
    this.cells[y * this.w + x] = tile;
  }

  find(type: TileType): { x: number; y: number } | null {
    const i = this.cells.findIndex((c) => c.t === type);
    return i < 0 ? null : { x: i % this.w, y: Math.floor(i / this.w) };
  }

  /** Directions the tile at (x,y) may legally slide (into an adjacent empty slot). */
  movableDirs(x: number, y: number): DirBit[] {
    if (!Tiles.isMovable(this.get(x, y))) return [];
    return DIRS.filter((d) => Tiles.isEmpty(this.get(x + d.dx, y + d.dy))).map((d) => d.bit);
  }

  canMove(x: number, y: number, dirBit: number): boolean {
    const d = dirByBit(dirBit);
    if (!d) return false;
    return Tiles.isMovable(this.get(x, y)) && Tiles.isEmpty(this.get(x + d.dx, y + d.dy));
  }

  /** Slide tile (x,y) one cell in dirBit. Returns the move record, or null if illegal. */
  move(x: number, y: number, dirBit: number): MoveRecord | null {
    if (!this.canMove(x, y, dirBit)) return null;
    const d = dirByBit(dirBit)!;
    const nx = x + d.dx;
    const ny = y + d.dy;
    const tile = this.get(x, y)!;
    this.set(nx, ny, tile);
    this.set(x, y, Tiles.empty());
    return { x, y, dir: d.bit, toX: nx, toY: ny };
  }

  /** Every legal move on the board. */
  legalMoves(): Move[] {
    const moves: Move[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!Tiles.isEmpty(this.get(x, y))) continue;
        for (const d of DIRS) {
          // A tile at (x - dx, y - dy) moving in direction d lands on (x, y).
          const sx = x - d.dx;
          const sy = y - d.dy;
          if (Tiles.isMovable(this.get(sx, sy))) moves.push({ x: sx, y: sy, dir: d.bit });
        }
      }
    }
    return moves;
  }

  /** Compact state key: fixed cells never move, so only movable/empty content matters. */
  key(): string {
    let s = '';
    for (const c of this.cells) {
      if (c.t === TILE.EMPTY) s += '.';
      else if (Tiles.isMovable(c)) s += String.fromCharCode(65 + c.o);
      else s += '#';
    }
    return s;
  }
}
