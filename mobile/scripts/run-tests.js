/* Unit tests for the TypeScript game core.
 * Compiles src/game (core + level data + level manager) to CommonJS with tsc, then checks
 * rules, pathfinding, session behaviour, every level of every mode, hints and the daily puzzle.
 *   npm test
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, '.test-build');
fs.rmSync(outDir, { recursive: true, force: true });
const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc,
  '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--strict', '--esModuleInterop',
  '--skipLibCheck', '--rootDir', path.join(root, 'src'),
  path.join(root, 'src/game/levelManager.ts'),
], { stdio: 'inherit' });

const req = (p) => require(path.join(outDir, p));
const { DIR } = req('game/core/constants');
const { Board } = req('game/core/board');
const { trace, solve } = req('game/core/pathfinding');
const { GameSession } = req('game/core/session');
const { LevelManager, LEVEL_MODES } = req('game/levelManager');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

const tiny = { id: 't', size: 3, par: 1, rows: ['Se . Ew', '- o o', 'o o o'] };

console.log('Rules');
test('parse / serialize round-trip', () => {
  const b = Board.fromRows(tiny.rows);
  assert.deepStrictEqual(b.toRows(), tiny.rows);
});
test('slide into empty slot, fixed tiles never move', () => {
  const b = Board.fromRows(['Se . Ew', '-* o o', 'o . #']);
  assert.ok(!b.canMove(0, 1, DIR.N), 'bolted pipe moved');
  assert.ok(!b.canMove(2, 2, DIR.W), 'stone moved');
  assert.ok(b.canMove(1, 1, DIR.N));
  assert.ok(b.move(1, 1, DIR.S));
});
test('trace detects gap, then completes', () => {
  const b = Board.fromRows(tiny.rows);
  assert.strictEqual(trace(b).fail.reason, 'gap');
  b.move(0, 1, DIR.N); // slides '-' up into the gap? (0,1) N -> (0,0) is start, illegal
  const b2 = Board.fromRows(['Se . Ew', 'o - o', 'o o o']);
  b2.move(1, 1, DIR.N);
  assert.ok(trace(b2).ok);
});
test('BFS solves the tiny board in 1 move', () => {
  const b = Board.fromRows(['Se . Ew', 'o - o', 'o o o']);
  assert.strictEqual(solve(b).moves.length, 1);
});

console.log('Session');
test('undo, move limit, timer and pause', () => {
  const lvl = { id: 's', size: 3, par: 1, rows: ['Se . Ew', 'o - o', 'o o o'] };
  const s = new GameSession(lvl, { moveLimit: 1, timeLimit: 5 });
  assert.ok(s.tryMove(1, 1, DIR.N).ok);
  assert.strictEqual(s.tryMove(1, 0, DIR.S).reason, 'limit');
  assert.ok(s.undo());
  s.pause(); s.tick(10); assert.strictEqual(s.state, 'paused');
  s.resume(); assert.strictEqual(s.tick(10), 'timeout');
});
test('roll: win gives stars, broken path returns to play', () => {
  const lvl = { id: 's', size: 3, par: 1, rows: ['Se . Ew', 'o - o', 'o o o'] };
  const s = new GameSession(lvl);
  assert.strictEqual(s.finishRoll(s.startRoll()), 'retry');
  s.tryMove(1, 1, DIR.N);
  assert.strictEqual(s.finishRoll(s.startRoll()), 'won');
  assert.strictEqual(s.stars(), 3);
});
test('snapshot / restore round-trip', () => {
  const lvl = { id: 's', size: 3, par: 1, rows: ['Se . Ew', 'o - o', 'o o o'] };
  const s = new GameSession(lvl);
  s.tryMove(1, 1, DIR.N);
  const s2 = new GameSession(lvl);
  assert.ok(s2.restore(JSON.parse(JSON.stringify(s.snapshot()))));
  assert.ok(s2.connection.ok);
  assert.ok(s2.undo());
});

for (const mode of LEVEL_MODES) {
  console.log(`Levels: ${mode} (${LevelManager.count(mode)})`);
  for (let n = 1; n <= LevelManager.count(mode); n++) {
    test(`${mode} ${n}: unsolved at start, BFS par matches, solution wins, hints follow it`, () => {
      const level = LevelManager.get(mode, n);
      const board = Board.fromRows(level.rows);
      assert.strictEqual(board.w, level.size);
      assert.strictEqual(trace(board).ok, false, 'already solved');
      const res = solve(board, { maxNodes: 4000000 });
      assert.ok(res.moves, 'BFS found no solution');
      assert.strictEqual(res.moves.length, level.par, 'par mismatch');
      const s = new GameSession(level, { mode, ...LevelManager.limitsFor(mode, level) });
      // Following hints from the start must solve the level in exactly par moves.
      for (let i = 0; i < level.par; i++) {
        const h = s.hint(1);
        assert.ok(h && !h.solved, 'no hint at step ' + i);
        assert.strictEqual(h.remaining, level.par - i);
        assert.ok(s.tryMove(h.move.x, h.move.y, h.move.dir).ok, 'illegal hint move');
      }
      assert.strictEqual(s.finishRoll(s.startRoll()), 'won');
      assert.strictEqual(s.stars(), 3);
    });
  }
}

console.log('Daily');
test('daily puzzle is deterministic, solvable and matches the web game', () => {
  const a = LevelManager.getDaily('2026-11-12');
  const b = LevelManager.getDaily('2026-11-12');
  assert.deepStrictEqual(a.rows, b.rows);
  assert.notDeepStrictEqual(a.rows, LevelManager.getDaily('2026-11-13').rows);
  // Same generator + seed as the web build, so both platforms share the same daily puzzle.
  const webBP = require(path.join(root, '..', 'tools', 'load-core'))();
  const webCfg = { size: 6, pathMin: 8, pathMax: 11, empties: 2, blocks: 2, decoyRatio: 0.55, fixedOnPath: 1, scramble: 16, parMin: 6, parMax: 9, maxNodes: 300000, maxAttempts: 120 };
  const web = webBP.Generator.generate(webCfg, 'ballpath-daily-2026-11-12');
  assert.deepStrictEqual(a.rows, web.rows);
  const s = new GameSession(a);
  for (const [x, y, dir] of a.solution) assert.ok(s.tryMove(x, y, dir).ok);
  assert.ok(s.connection.ok);
});
test('limits tighten across levels', () => {
  const c1 = LevelManager.limitsFor('challenge', LevelManager.get('challenge', 1));
  const c20 = LevelManager.limitsFor('challenge', LevelManager.get('challenge', 20));
  assert.ok(c1.moveLimit - LevelManager.get('challenge', 1).par > 0);
  assert.ok((c20.moveLimit - 22) / 22 < (c1.moveLimit - 6) / 6);
  const t20 = LevelManager.limitsFor('timetrial', LevelManager.get('timetrial', 20));
  assert.ok(t20.timeLimit > 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
