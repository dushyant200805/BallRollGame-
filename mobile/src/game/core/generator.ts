/** Level generator (port of js/core/generator.js). Used at runtime for the Daily Challenge.
 *
 * Builds a solved board around a random self-avoiding pipe path, fills the rest with decoys,
 * blocks and empty slots, then scrambles it with legal slides only. Every slide is
 * reversible, so the result is always solvable; BFS then measures the true par.
 */
import { DIRS, Move, MoveRecord, opposite } from './constants';
import { Board } from './board';
import { Tiles } from './tiles';
import { Rng, createRng } from './rng';
import { solve, trace } from './pathfinding';
import type { Tile } from './constants';

export interface GenConfig {
  size: number;
  pathMin: number;
  pathMax: number;
  empties: number;
  blocks?: number;
  fixedOnPath?: number;
  decoyRatio?: number;
  fixedDecoyChance?: number;
  scramble: number;
  parMin: number;
  parMax: number;
  maxNodes?: number;
  maxAttempts?: number;
}

type P = { x: number; y: number };

function dirBetween(a: P, b: P): number {
  const d = DIRS.find((dd) => a.x + dd.dx === b.x && a.y + dd.dy === b.y);
  return d ? d.bit : 0;
}

export function randomPath(rng: Rng, w: number, h: number, minLen: number, maxLen: number): P[] | null {
  const target = rng.int(minLen, maxLen);
  for (let tries = 0; tries < 40; tries++) {
    const start = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) };
    const visited = new Set([start.y * w + start.x]);
    const path: P[] = [start];
    let budget = 4000;
    const dfs = (): boolean => {
      if (path.length === target) return true;
      if (--budget <= 0) return false;
      const cur = path[path.length - 1];
      const options = rng.shuffle(DIRS.slice());
      for (const d of options) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (visited.has(k)) continue;
        // Keep the path from touching itself sideways.
        let touches = 0;
        for (const d2 of DIRS) {
          const ax = nx + d2.dx;
          const ay = ny + d2.dy;
          if (visited.has(ay * w + ax) && !(ax === cur.x && ay === cur.y) && ax >= 0 && ay >= 0 && ax < w && ay < h) touches++;
        }
        if (touches > 0) continue;
        visited.add(k);
        path.push({ x: nx, y: ny });
        if (dfs()) return true;
        path.pop();
        visited.delete(k);
      }
      return false;
    };
    if (dfs()) return path;
  }
  return null;
}

export function buildSolved(rng: Rng, cfg: GenConfig): Board | null {
  const w = cfg.size;
  const h = cfg.size;
  const path = randomPath(rng, w, h, cfg.pathMin, cfg.pathMax);
  if (!path) return null;
  const cells: (Tile | null)[] = new Array(w * h).fill(null);
  const idx = (p: P) => p.y * w + p.x;
  const last = path.length - 1;

  cells[idx(path[0])] = Tiles.start(dirBetween(path[0], path[1]));
  cells[idx(path[last])] = Tiles.end(dirBetween(path[last], path[last - 1]));

  const middle: number[] = [];
  for (let i = 1; i < last; i++) middle.push(i);
  const fixedSet = new Set(rng.shuffle(middle.slice()).slice(0, cfg.fixedOnPath || 0));
  for (let i = 1; i < last; i++) {
    const mask = dirBetween(path[i], path[i - 1]) | dirBetween(path[i], path[i + 1]);
    cells[idx(path[i])] = Tiles.pipe(mask, fixedSet.has(i));
  }

  const free: number[] = [];
  cells.forEach((c, i) => {
    if (!c) free.push(i);
  });
  if (free.length < cfg.empties + (cfg.blocks || 0) + 1) return null;
  rng.shuffle(free);
  let p = 0;
  for (let i = 0; i < cfg.empties; i++) cells[free[p++]] = Tiles.empty();
  for (let i = 0; i < (cfg.blocks || 0); i++) cells[free[p++]] = Tiles.block();
  const allPipes = Tiles.STRAIGHTS.concat(Tiles.CURVES);
  while (p < free.length) {
    const i = free[p++];
    cells[i] = rng.chance(cfg.decoyRatio == null ? 0.6 : cfg.decoyRatio)
      ? Tiles.pipe(rng.pick(allPipes), rng.chance(cfg.fixedDecoyChance || 0))
      : Tiles.pipe(0);
  }
  return new Board(w, h, cells as Tile[]);
}

export function scramble(rng: Rng, board: Board, count: number): Board {
  const seen = new Set([board.key()]);
  let last: MoveRecord | null = null;
  for (let i = 0; i < count; i++) {
    const prev: MoveRecord | null = last;
    const moves = board.legalMoves().filter((m) => {
      // never immediately undo the previous slide
      if (prev && m.x === prev.toX && m.y === prev.toY && m.dir === opposite(prev.dir)) return false;
      return true;
    });
    if (!moves.length) break;
    // Prefer moves that reach unseen states so the scramble wanders further away.
    rng.shuffle(moves);
    let chosen: Move | null = null;
    for (const m of moves) {
      const b2 = board.clone();
      b2.move(m.x, m.y, m.dir);
      if (!seen.has(b2.key())) {
        chosen = m;
        break;
      }
    }
    if (!chosen) chosen = moves[0];
    last = board.move(chosen.x, chosen.y, chosen.dir);
    seen.add(board.key());
  }
  return board;
}

export interface GenResult {
  rows: string[];
  par: number;
  solution: Move[];
  attempt: number;
}

export function generate(cfg: GenConfig, seed: string | number): GenResult | null {
  const maxAttempts = cfg.maxAttempts || 300;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = createRng(String(seed) + ':' + attempt);
    const board = buildSolved(rng, cfg);
    if (!board) continue;
    scramble(rng, board, cfg.scramble);
    if (trace(board).ok) continue; // scramble left it solved
    const res = solve(board, { maxNodes: cfg.maxNodes || 400000 });
    if (!res.moves) continue;
    const par = res.moves.length;
    if (par < cfg.parMin || par > cfg.parMax) continue;
    return { rows: board.toRows(), par, solution: res.moves, attempt };
  }
  return null;
}
