/* Core logic tests — run: node tools/test-core.js */
const assert = require('assert');
const BP = require('./load-core')({ withLevels: true });
const { Board, Pathfinding, GameSession, LevelManager, DIR } = BP;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('Tiles & board');
test('token round-trip', () => {
  const rows = ['Se - 7 . #', 'o |* . F J', 'L En o - .', 'o o o o o', '# # o . o'];
  assert.deepStrictEqual(Board.fromRows(rows).toRows(), rows);
});
test('rejects boards without start/end', () => {
  assert.throws(() => Board.fromRows(['. - -', '- - -', '- - -']));
});
test('cannot move fixed tiles, blocks, start, end', () => {
  const b = Board.fromRows(['Se -* .', '# . o', 'En . .']);
  assert.strictEqual(b.canMove(1, 0, DIR.E), false, 'fixed pipe');
  assert.strictEqual(b.canMove(0, 0, DIR.S), false, 'start');
  assert.strictEqual(b.canMove(0, 1, DIR.E), false, 'block');
  assert.strictEqual(b.canMove(0, 2, DIR.E), false, 'end');
});
test('cannot move into occupied cell or off the board', () => {
  const b = Board.fromRows(['Se - o', '. . o', 'En . .']);
  assert.strictEqual(b.canMove(1, 0, DIR.E), false, 'occupied');
  assert.strictEqual(b.canMove(2, 0, DIR.E), false, 'off board');
  assert.strictEqual(b.canMove(2, 0, DIR.N), false, 'off board N');
  assert.strictEqual(b.canMove(1, 0, DIR.S), true, 'into empty');
});
test('move swaps tile with empty slot', () => {
  const b = Board.fromRows(['Se - o', '. . o', 'En . .']);
  const m = b.move(1, 0, DIR.S);
  assert.deepStrictEqual([m.toX, m.toY], [1, 1]);
  assert.strictEqual(b.get(1, 0).t, 'empty');
  assert.strictEqual(b.get(1, 1).o, DIR.E | DIR.W);
});

console.log('Pathfinding');
test('trace follows straight and curved pipes to the end', () => {
  const b = Board.fromRows(['Se - 7', '. . |', 'Ee - J']);
  const r = Pathfinding.trace(b);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.path.length, 7);
});
test('trace reports the gap', () => {
  const b = Board.fromRows(['Se . 7', '- . |', 'Ee - J']);
  const r = Pathfinding.trace(b);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual([r.fail.x, r.fail.y, r.fail.reason], [1, 0, 'gap']);
});
test('trace detects wrong end side and board edge', () => {
  assert.strictEqual(Pathfinding.trace(Board.fromRows(['Se Es .', '. . .', '. . .'])).fail.reason, 'wrong-side');
  assert.strictEqual(Pathfinding.trace(Board.fromRows(['Sn . .', '. . .', 'Ee . .'])).fail.reason, 'edge');
});
test('BFS solves a small puzzle optimally', () => {
  const b = Board.fromRows(['Se . 7', '- . |', 'Ee - J']);
  const r = Pathfinding.solve(b);
  assert.strictEqual(r.moves.length, 2);
});
test('BFS proves an unsolvable board unsolvable', () => {
  const b = Board.fromRows(['Se . o', '. # .', '. . En']);
  const r = Pathfinding.solve(b);
  assert.strictEqual(r.moves, null);
  assert.strictEqual(r.exhausted, false);
});

console.log('Session');
const lvl = { id: 't', par: 2, rows: ['Se . 7', '- . |', 'Ee - J'] };
test('moves, undo and restart', () => {
  const s = new GameSession(lvl);
  assert.ok(s.tryMove(0, 1, DIR.E).ok);
  assert.strictEqual(s.moves, 1);
  assert.strictEqual(s.tryMove(0, 0, DIR.S).ok, false, 'start is fixed');
  const back = s.undo();
  assert.ok(back);
  assert.strictEqual(s.moves, 0);
  assert.deepStrictEqual(s.board.toRows(), lvl.rows);
  s.tryMove(0, 1, DIR.E); s.restart();
  assert.deepStrictEqual(s.board.toRows(), lvl.rows);
  assert.strictEqual(s.undo(), null, 'nothing to undo');
});
test('win flow and stars', () => {
  const s = new GameSession(lvl);
  s.tryMove(0, 1, DIR.E); s.tryMove(1, 1, DIR.N);
  assert.ok(s.connection.ok);
  const r = s.startRoll();
  assert.strictEqual(s.finishRoll(r), 'won');
  assert.strictEqual(s.stars(), 3);
  assert.strictEqual(s.tryMove(1, 0, DIR.S).ok, false, 'no moves after win');
});
test('failed roll returns to play; challenge limit loses', () => {
  const s = new GameSession(lvl, { mode: 'challenge', moveLimit: 1 });
  assert.strictEqual(s.finishRoll(s.startRoll()), 'retry');
  s.tryMove(0, 1, DIR.E);
  assert.strictEqual(s.tryMove(1, 1, DIR.N).reason, 'limit');
  assert.strictEqual(s.finishRoll(s.startRoll()), 'lost');
});
test('extra moves raise the limit and revive an out-of-moves loss', () => {
  const s = new GameSession(lvl, { mode: 'challenge', moveLimit: 1 });
  s.tryMove(0, 1, DIR.E);
  assert.strictEqual(s.finishRoll(s.startRoll()), 'lost');
  assert.ok(s.addMoves(3));
  assert.strictEqual(s.state, 'playing');
  assert.strictEqual(s.movesLeft, 3);
  const snap = s.snapshot();
  const t = new GameSession(lvl, { mode: 'challenge', moveLimit: 1 });
  t.restore(snap);
  assert.strictEqual(t.moveLimit, 4);
  assert.ok(!new GameSession(lvl).addMoves(3), 'no limit, nothing to add');
});
test('time limit expires; pause stops clock', () => {
  const s = new GameSession(lvl, { mode: 'timetrial', timeLimit: 10 });
  s.pause(); s.tick(50); assert.strictEqual(s.elapsed, 0);
  s.resume(); assert.strictEqual(s.tick(11), 'timeout');
  assert.strictEqual(s.state, 'lost');
});
test('hint returns the first move of an optimal solution', () => {
  const s = new GameSession(lvl);
  const h = s.hint();
  assert.strictEqual(h.remaining, 2);
  assert.ok(s.board.canMove(h.move.x, h.move.y, h.move.dir));
});
test('snapshot/restore round-trips', () => {
  const s = new GameSession(lvl);
  s.tryMove(0, 1, DIR.E);
  const snap = JSON.parse(JSON.stringify(s.snapshot()));
  const s2 = new GameSession(lvl);
  assert.ok(s2.restore(snap));
  assert.deepStrictEqual(s2.board.toRows(), s.board.toRows());
  assert.ok(s2.undo());
  assert.deepStrictEqual(s2.board.toRows(), lvl.rows);
});

for (const mode of ['classic', 'challenge', 'timetrial']) {
console.log(`Levels: ${mode} (${LevelManager.count(mode)})`);
for (let n = 1; n <= LevelManager.count(mode); n++) {
  test(`${mode} ${n}: unsolved at start, BFS par matches, stored solution wins`, () => {
    const level = LevelManager.get(mode, n);
    const board = Board.fromRows(level.rows);
    assert.strictEqual(board.w, level.size);
    assert.strictEqual(Pathfinding.trace(board).ok, false, 'already solved');
    const res = Pathfinding.solve(board, { maxNodes: 4000000 });
    assert.ok(res.moves, 'BFS found no solution');
    assert.strictEqual(res.moves.length, level.par, 'par mismatch');
    const s = new GameSession(level);
    for (const [x, y, dir] of level.solution) assert.ok(s.tryMove(x, y, dir).ok, 'illegal stored move');
    assert.strictEqual(s.finishRoll(s.startRoll()), 'won');
  });
}
}

console.log('Daily');
test('daily puzzle is deterministic and solvable', () => {
  const a = LevelManager.getDaily('2026-11-12');
  const b = LevelManager.getDaily('2026-11-12');
  assert.deepStrictEqual(a.rows, b.rows);
  const c = LevelManager.getDaily('2026-11-13');
  assert.notDeepStrictEqual(a.rows, c.rows);
  const s = new GameSession(a);
  for (const [x, y, dir] of a.solution) assert.ok(s.tryMove(x, y, dir).ok);
  assert.ok(s.connection.ok);
});

console.log('Rewards');
{
  const cfg = require('../js/data/rewards-config.js');
  const R = require('../js/core/rewards.js');
  const { SKINS } = require('../js/data/ball-skins.js');
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  test('gifts never give a cosmetic twice and fall back when all are owned', () => {
    const st = R.defaultState(cfg);
    const env = { cfg, skins: SKINS, stars: 0 };
    for (let i = 0; i < 400; i++) {
      const r = R.pickReward('milestone', st, env, rand);
      assert.ok(R.grant(r, 'milestone', st, env), 'duplicate ' + JSON.stringify(r));
    }
    assert.strictEqual(new Set(st.balls).size, st.balls.length);
    assert.strictEqual(st.balls.length, SKINS.filter((s) => s.cost > 0).length, 'every ball eventually unlocked');
    assert.strictEqual(st.themes.length, cfg.themes.length - 1);
    for (let i = 0; i < 50; i++) assert.ok(['coins', 'moves'].includes(R.pickReward('daily', st, env, rand).type));
    assert.strictEqual(st.history.length, cfg.historyLimit);
  });
  test('granting an owned cosmetic is refused', () => {
    const st = R.defaultState(cfg);
    const env = { cfg, skins: SKINS, stars: 0 };
    assert.ok(R.grant({ type: 'theme', item: 'space' }, 'daily', st, env));
    assert.strictEqual(R.grant({ type: 'theme', item: 'space' }, 'daily', st, env), null);
    assert.strictEqual(R.grant({ type: 'ball', item: 'ruby' }, 'daily', st, env), null, 'ruby is free');
    assert.strictEqual(R.grant({ type: 'sound', item: 'ruby' }, 'daily', st, env), null, 'comes with the ball');
  });
  test('daily gift: free by ad, then doubling coin cost, reset next day', () => {
    const st = R.defaultState(cfg);
    assert.deepStrictEqual(R.dailyNext(st, cfg, '2026-11-17'), { kind: 'ad', opened: 0 });
    const costs = [];
    for (let i = 1; i <= 4; i++) { st.day.opened = i; costs.push(R.dailyNext(st, cfg, '2026-11-17').cost); }
    assert.deepStrictEqual(costs, [25, 50, 100, 200]);
    assert.strictEqual(R.dailyNext(st, cfg, '2026-11-18').kind, 'ad');
  });
  test('ball shop: buy a locked ball once, charged exactly the confirmed price', () => {
    const st = R.defaultState(cfg);
    const env = { cfg, skins: SKINS, stars: 0 };
    const golden = SKINS.find((x) => x.id === 'golden');
    const price = R.ballPrice(cfg, golden);
    assert.strictEqual(price, golden.cost * cfg.shop.coinsPerStar);
    assert.strictEqual(R.buyBall(st, env, 'golden', price).reason, 'coins');
    st.coins = price * 2;
    assert.strictEqual(R.buyBall(st, env, 'golden', price + 1).reason, 'state', 'stale price charges nothing');
    assert.ok(R.buyBall(st, env, 'golden', price).ok);
    assert.strictEqual(st.coins, price);
    assert.strictEqual(R.buyBall(st, env, 'golden', price).reason, 'owned', 'never twice');
    assert.strictEqual(st.coins, price);
    assert.strictEqual(R.buyBall(st, env, 'ruby', 0).reason, 'owned', 'free ball is owned');
    assert.ok(!R.eligibleItems('ball', st, env).includes('golden'), 'gifts skip bought balls');
  });
  test('coin ads pay out up to the daily limit and reset next day', () => {
    const st = R.defaultState(cfg);
    for (let i = 0; i < cfg.shop.adsPerDay; i++) assert.ok(R.grantAdCoins(st, cfg, 'd1'));
    assert.strictEqual(R.grantAdCoins(st, cfg, 'd1'), null);
    assert.strictEqual(st.coins, cfg.shop.adsPerDay * cfg.shop.adCoins);
    assert.strictEqual(R.adCoinsStatus(st, cfg, 'd2').left, cfg.shop.adsPerDay);
  });
  test('setting the clock back does not reset daily gifts or coin ads', () => {
    const st = R.defaultState(cfg);
    R.dailyNext(st, cfg, '2026-11-19'); st.day.opened = 3;
    R.adCoinsStatus(st, cfg, '2026-11-19'); st.adDay.count = 2;
    assert.strictEqual(R.dailyNext(st, cfg, '2026-11-18').opened, 3, 'clock moved back');
    assert.strictEqual(R.adCoinsStatus(st, cfg, '2026-11-18').left, 0);
    assert.strictEqual(R.dailyNext(st, cfg, '2026-11-19').opened, 3, 'back to today');
    assert.strictEqual(R.dailyNext(st, cfg, '2026-11-20').kind, 'ad', 'real next day resets');
  });
  test('milestone gift every 10 completed levels', () => {
    assert.strictEqual(R.milestoneStatus({ milestonesClaimed: 0 }, cfg, 9).available, 0);
    assert.strictEqual(R.milestoneStatus({ milestonesClaimed: 0 }, cfg, 21).available, 2);
    assert.strictEqual(R.milestoneStatus({ milestonesClaimed: 2 }, cfg, 21).progress, 1);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
