/* Ball Path — Pathfinding system.
 *
 * trace():  follows the pipe network from the start tile (a deterministic DFS walk, since
 *           every pipe has exactly two openings) and reports where the ball goes.
 * solve():  breadth-first search over board states to find the shortest sequence of
 *           slides that connects start to end. Used for hints, par (star) scores and
 *           solvability validation of every level.
 */
(function (BP) {
  'use strict';
  const { DIRS, TILE, Board } = BP;

  /**
   * Walk the pipe path from the start tile.
   * @param {number} w @param {number} h
   * @param {(x:number,y:number)=>object|null} getTile
   * @param {{x:number,y:number}} start
   * @returns {{ok:boolean, path:Array<{x,y,inBit,outBit}>, fail:null|{x,y,reason}}}
   */
  function traceWith(w, h, getTile, start) {
    const startTile = getTile(start.x, start.y);
    const path = [{ x: start.x, y: start.y, inBit: 0, outBit: startTile.o }];
    let x = start.x, y = start.y, outBit = startTile.o;
    const maxSteps = w * h + 1;

    for (let step = 0; step < maxSteps; step++) {
      const d = BP.dirByBit(outBit);
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        return { ok: false, path, fail: { x: nx, y: ny, reason: 'edge' } };
      }
      const tile = getTile(nx, ny);
      const need = BP.opposite(outBit);
      if (tile.t === TILE.END) {
        if (tile.o === need) {
          path.push({ x: nx, y: ny, inBit: need, outBit: 0 });
          return { ok: true, path, fail: null };
        }
        return { ok: false, path, fail: { x: nx, y: ny, reason: 'wrong-side' } };
      }
      if (tile.t === TILE.PIPE && (tile.o & need) && BP.bitCount(tile.o) === 2) {
        const next = tile.o & ~need;
        path.push({ x: nx, y: ny, inBit: need, outBit: next });
        x = nx; y = ny; outBit = next;
        continue;
      }
      const reason = tile.t === TILE.EMPTY ? 'gap' : 'blocked';
      return { ok: false, path, fail: { x: nx, y: ny, reason } };
    }
    return { ok: false, path, fail: { x, y, reason: 'loop' } };
  }

  function trace(board) {
    return traceWith(board.w, board.h, (x, y) => board.get(x, y), board.find(TILE.START));
  }

  const EMPTY_TILE = Object.freeze({ t: TILE.EMPTY, o: 0, f: false });
  const PIPE_CACHE = [];
  for (let m = 0; m < 16; m++) PIPE_CACHE.push(Object.freeze({ t: TILE.PIPE, o: m, f: false }));

  /**
   * Shortest solution by BFS over compact state keys.
   * @returns {{moves: Array<{x,y,dir}>|null, explored:number, exhausted:boolean}}
   *   moves === null means no solution was found within maxNodes.
   */
  function solve(board, opts = {}) {
    const maxNodes = opts.maxNodes || 250000;
    const w = board.w, h = board.h, n = w * h;
    const fixedCells = board.cells; // fixed tiles occupy the same cells in every state
    const start = board.find(TILE.START);

    const tileFrom = (key) => (x, y) => {
      const i = y * w + x;
      const c = key.charCodeAt(i);
      if (c === 46) return EMPTY_TILE;        // '.'
      if (c === 35) return fixedCells[i];     // '#'
      return PIPE_CACHE[c - 65];
    };
    const isGoal = (key) => traceWith(w, h, tileFrom(key), start).ok;

    const startKey = board.key();
    if (isGoal(startKey)) return { moves: [], explored: 1, exhausted: false };

    const parent = new Map();
    parent.set(startKey, null);
    const queue = [startKey];
    let head = 0;

    const rebuild = (key) => {
      const moves = [];
      let k = key;
      while (parent.get(k)) {
        const p = parent.get(k);
        moves.push(p.move);
        k = p.prev;
      }
      return moves.reverse();
    };

    while (head < queue.length) {
      const key = queue[head++];
      for (let i = 0; i < n; i++) {
        if (key.charCodeAt(i) !== 46) continue;
        const ex = i % w, ey = (i - ex) / w;
        for (const d of DIRS) {
          const sx = ex - d.dx, sy = ey - d.dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const si = sy * w + sx;
          const sc = key.charCodeAt(si);
          if (sc === 46 || sc === 35) continue;
          const chars = key.split('');
          chars[i] = chars[si];
          chars[si] = '.';
          const nk = chars.join('');
          if (parent.has(nk)) continue;
          parent.set(nk, { prev: key, move: { x: sx, y: sy, dir: d.bit } });
          if (isGoal(nk)) return { moves: rebuild(nk), explored: parent.size, exhausted: false };
          if (parent.size >= maxNodes) return { moves: null, explored: parent.size, exhausted: true };
          queue.push(nk);
        }
      }
    }
    return { moves: null, explored: parent.size, exhausted: false }; // provably unsolvable
  }

  BP.Pathfinding = { trace, traceWith, solve };
  // Board convenience
  Board.prototype.trace = function () { return trace(this); };
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
