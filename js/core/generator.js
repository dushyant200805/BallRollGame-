/* Ball Path — Level generator.
 *
 * Builds a solved board around a random self-avoiding pipe path, fills the rest with
 * decoys, blocks and empty slots, then scrambles it with legal slides only. Since every
 * slide is reversible, the result is always solvable; a BFS then measures the true
 * minimum number of moves (par) and the attempt is rejected unless par is in range.
 *
 * Used offline by tools/generate-levels.js (static level data) and at runtime for the
 * Daily Challenge (seeded by date, so every player gets the same puzzle).
 */
(function (BP) {
  'use strict';
  const { DIRS, Tiles, Board, createRng, Pathfinding } = BP;

  function dirBetween(a, b) {
    const d = DIRS.find((dd) => a.x + dd.dx === b.x && a.y + dd.dy === b.y);
    return d ? d.bit : 0;
  }

  function randomPath(rng, w, h, minLen, maxLen) {
    const target = rng.int(minLen, maxLen);
    for (let tries = 0; tries < 40; tries++) {
      const start = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) };
      const visited = new Set([start.y * w + start.x]);
      const path = [start];
      let budget = 4000;
      const dfs = () => {
        if (path.length === target) return true;
        if (--budget <= 0) return false;
        const cur = path[path.length - 1];
        const options = rng.shuffle(DIRS.slice());
        for (const d of options) {
          const nx = cur.x + d.dx, ny = cur.y + d.dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (visited.has(k)) continue;
          // Keep the path from touching itself sideways; it reads better and avoids
          // trivial shortcuts.
          let touches = 0;
          for (const d2 of DIRS) {
            const ax = nx + d2.dx, ay = ny + d2.dy;
            if (visited.has(ay * w + ax) && !(ax === cur.x && ay === cur.y) &&
                ax >= 0 && ay >= 0 && ax < w && ay < h) touches++;
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

  function buildSolved(rng, cfg) {
    const w = cfg.size, h = cfg.size;
    const path = randomPath(rng, w, h, cfg.pathMin, cfg.pathMax);
    if (!path) return null;
    const cells = new Array(w * h).fill(null);
    const idx = (p) => p.y * w + p.x;
    const last = path.length - 1;

    cells[idx(path[0])] = Tiles.start(dirBetween(path[0], path[1]));
    cells[idx(path[last])] = Tiles.end(dirBetween(path[last], path[last - 1]));

    const middle = [];
    for (let i = 1; i < last; i++) middle.push(i);
    const fixedSet = new Set(rng.shuffle(middle.slice()).slice(0, cfg.fixedOnPath || 0));
    for (let i = 1; i < last; i++) {
      const mask = dirBetween(path[i], path[i - 1]) | dirBetween(path[i], path[i + 1]);
      cells[idx(path[i])] = Tiles.pipe(mask, fixedSet.has(i));
    }

    const free = [];
    cells.forEach((c, i) => { if (!c) free.push(i); });
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
    return new Board(w, h, cells);
  }

  function scramble(rng, board, count) {
    const seen = new Set([board.key()]);
    let last = null;
    for (let i = 0; i < count; i++) {
      const moves = board.legalMoves().filter((m) => {
        // never immediately undo the previous slide
        if (last && m.x === last.toX && m.y === last.toY && m.dir === BP.opposite(last.dir)) return false;
        return true;
      });
      if (!moves.length) break;
      // Prefer moves that reach unseen states so the scramble wanders further away.
      rng.shuffle(moves);
      let chosen = null;
      for (const m of moves) {
        const b2 = board.clone();
        b2.move(m.x, m.y, m.dir);
        if (!seen.has(b2.key())) { chosen = m; break; }
      }
      if (!chosen) chosen = moves[0];
      last = board.move(chosen.x, chosen.y, chosen.dir);
      seen.add(board.key());
    }
    return board;
  }

  /**
   * @param {object} cfg {size, pathMin, pathMax, empties, blocks, fixedOnPath, decoyRatio,
   *                      fixedDecoyChance, scramble, parMin, parMax, maxNodes, maxAttempts}
   * @param {string|number} seed
   * @returns {{rows:string[], par:number, solution:Array, attempt:number}|null}
   */
  function generate(cfg, seed) {
    const maxAttempts = cfg.maxAttempts || 300;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rng = createRng(String(seed) + ':' + attempt);
      const board = buildSolved(rng, cfg);
      if (!board) continue;
      scramble(rng, board, cfg.scramble);
      if (Pathfinding.trace(board).ok) continue; // scramble left it solved
      const res = Pathfinding.solve(board, { maxNodes: cfg.maxNodes || 400000 });
      if (!res.moves) continue;
      const par = res.moves.length;
      if (par < cfg.parMin || par > cfg.parMax) continue;
      return { rows: board.toRows(), par, solution: res.moves, attempt };
    }
    return null;
  }

  BP.Generator = { generate, buildSolved, scramble, randomPath };
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
