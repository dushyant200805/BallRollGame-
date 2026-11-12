/** Pathfinding system (port of js/core/pathfinding.js).
 *
 * trace():  follows the pipe network from the start tile (a deterministic walk, since every
 *           pipe has exactly two openings) and reports where the ball goes.
 * solve():  breadth-first search over board states to find the shortest sequence of slides
 *           that connects start to end. Used for hints, par and solvability validation.
 */
import { DIRS, DirBit, Move, TILE, Tile, bitCount, dirByBit, opposite } from './constants';
import { Board } from './board';

export interface PathStep {
  x: number;
  y: number;
  inBit: number;
  outBit: number;
}

export type FailReason = 'edge' | 'wrong-side' | 'gap' | 'blocked' | 'loop';

export interface TraceResult {
  ok: boolean;
  path: PathStep[];
  fail: null | { x: number; y: number; reason: FailReason };
}

export function traceWith(
  w: number,
  h: number,
  getTile: (x: number, y: number) => Tile,
  start: { x: number; y: number },
): TraceResult {
  const startTile = getTile(start.x, start.y);
  const path: PathStep[] = [{ x: start.x, y: start.y, inBit: 0, outBit: startTile.o }];
  let x = start.x;
  let y = start.y;
  let outBit = startTile.o;
  const maxSteps = w * h + 1;

  for (let step = 0; step < maxSteps; step++) {
    const d = dirByBit(outBit)!;
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      return { ok: false, path, fail: { x: nx, y: ny, reason: 'edge' } };
    }
    const tile = getTile(nx, ny);
    const need = opposite(outBit);
    if (tile.t === TILE.END) {
      if (tile.o === need) {
        path.push({ x: nx, y: ny, inBit: need, outBit: 0 });
        return { ok: true, path, fail: null };
      }
      return { ok: false, path, fail: { x: nx, y: ny, reason: 'wrong-side' } };
    }
    if (tile.t === TILE.PIPE && tile.o & need && bitCount(tile.o) === 2) {
      const next = tile.o & ~need;
      path.push({ x: nx, y: ny, inBit: need, outBit: next });
      x = nx;
      y = ny;
      outBit = next;
      continue;
    }
    const reason: FailReason = tile.t === TILE.EMPTY ? 'gap' : 'blocked';
    return { ok: false, path, fail: { x: nx, y: ny, reason } };
  }
  return { ok: false, path, fail: { x, y, reason: 'loop' } };
}

export function trace(board: Board): TraceResult {
  return traceWith(board.w, board.h, (x, y) => board.get(x, y)!, board.find(TILE.START)!);
}

const EMPTY_TILE: Tile = Object.freeze({ t: TILE.EMPTY, o: 0, f: false });
const PIPE_CACHE: Tile[] = [];
for (let m = 0; m < 16; m++) PIPE_CACHE.push(Object.freeze({ t: TILE.PIPE, o: m, f: false }));

export interface SolveResult {
  /** null means no solution was found within maxNodes. */
  moves: Move[] | null;
  explored: number;
  exhausted: boolean;
}

/** Shortest solution by BFS over compact state keys. */
export function solve(board: Board, opts: { maxNodes?: number } = {}): SolveResult {
  const maxNodes = opts.maxNodes || 250000;
  const w = board.w;
  const h = board.h;
  const n = w * h;
  const fixedCells = board.cells; // fixed tiles occupy the same cells in every state
  const start = board.find(TILE.START)!;

  const tileFrom = (key: string) => (x: number, y: number) => {
    const i = y * w + x;
    const c = key.charCodeAt(i);
    if (c === 46) return EMPTY_TILE; // '.'
    if (c === 35) return fixedCells[i]; // '#'
    return PIPE_CACHE[c - 65];
  };
  const isGoal = (key: string) => traceWith(w, h, tileFrom(key), start).ok;

  const startKey = board.key();
  if (isGoal(startKey)) return { moves: [], explored: 1, exhausted: false };

  const parent = new Map<string, { prev: string; move: Move } | null>();
  parent.set(startKey, null);
  const queue: string[] = [startKey];
  let head = 0;

  const rebuild = (key: string): Move[] => {
    const moves: Move[] = [];
    let k = key;
    let p = parent.get(k);
    while (p) {
      moves.push(p.move);
      k = p.prev;
      p = parent.get(k);
    }
    return moves.reverse();
  };

  while (head < queue.length) {
    const key = queue[head++];
    for (let i = 0; i < n; i++) {
      if (key.charCodeAt(i) !== 46) continue;
      const ex = i % w;
      const ey = (i - ex) / w;
      for (const d of DIRS) {
        const sx = ex - d.dx;
        const sy = ey - d.dy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const si = sy * w + sx;
        const sc = key.charCodeAt(si);
        if (sc === 46 || sc === 35) continue;
        const chars = key.split('');
        chars[i] = chars[si];
        chars[si] = '.';
        const nk = chars.join('');
        if (parent.has(nk)) continue;
        parent.set(nk, { prev: key, move: { x: sx, y: sy, dir: d.bit as DirBit } });
        if (isGoal(nk)) return { moves: rebuild(nk), explored: parent.size, exhausted: false };
        if (parent.size >= maxNodes) return { moves: null, explored: parent.size, exhausted: true };
        queue.push(nk);
      }
    }
  }
  return { moves: null, explored: parent.size, exhausted: false }; // provably unsolvable
}
