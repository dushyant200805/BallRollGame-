/* Ball Path — Game engine: wires session, renderer, ball, input, audio, save and UI together
 * and runs the frame loop.
 */
(function (BP) {
  'use strict';
  const { GameSession, BoardRenderer, BallController, InputController, LevelManager, SaveManager, AudioManager } = BP;

  const FAIL_TEXT = {
    gap: 'The ball fell into an empty slot. Slide a pipe into the marked spot.',
    blocked: "The ball hit a tile that doesn't connect. Fix the marked spot.",
    'wrong-side': 'The goal can only be entered from its open side.',
    edge: 'The ball rolled off the edge of the board.',
    loop: 'The path loops back on itself.',
  };

  const Engine = {
    session: null,
    mode: 'classic',
    number: 0,          // level number (0 for daily)
    dailyKey: null,
    lastConnected: false,
    lastFail: null,
    hudTimer: 0,

    init() {
      this.canvas = document.getElementById('board');
      this.renderer = new BoardRenderer(this.canvas);
      this.ball = new BallController();
      this.input = new InputController(this.canvas, this.renderer, {
        canInteract: () => this.canInteract(),
        onMove: (x, y, dir, offset) => this.move(x, y, dir, offset),
        onInvalid: (x, y) => this.invalidTap(x, y),
        onAmbiguousTap: () => BP.UI.status('Drag the tile toward the slot you want.', 'bad'),
      });

      const wrap = document.getElementById('board-wrap');
      if (window.ResizeObserver) new ResizeObserver(() => this.renderer.resize()).observe(wrap);
      window.addEventListener('resize', () => this.renderer.resize());

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          AudioManager.suspend();
          if (this.session && this.session.state === 'playing' && BP.UI.currentScreen === 'game') this.pause();
          this.saveCurrent();
        } else {
          AudioManager.resume();
        }
      });

      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.tick(dt, now);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },

    canInteract() {
      return !!this.session && this.session.canInteract() && !this.ball.animating && BP.UI.currentScreen === 'game' && !BP.UI.overlayOpen();
    },

    // ---- level lifecycle --------------------------------------------------
    startLevel(mode, number, { resume = true } = {}) {
      const level = LevelManager.get(number);
      if (!level) return;
      this.mode = mode;
      this.number = number;
      this.dailyKey = null;
      SaveManager.data.lastMode = mode;
      this.begin(level, resume);
    },

    startDaily() {
      const key = LevelManager.dailyKey();
      const cached = SaveManager.data.daily.cache;
      const go = () => {
        const level = LevelManager.getDaily(key, cached);
        BP.UI.closeOverlay('loading');
        if (!level) { BP.UI.toast("Couldn't build today's puzzle. Please try again."); return; }
        if (!cached || cached.key !== key) SaveManager.cacheDaily(level);
        this.mode = 'daily';
        this.number = 0;
        this.dailyKey = key;
        this.begin(level, true);
      };
      if (cached && cached.key === key) go();
      else { BP.UI.openOverlay('loading'); setTimeout(go, 60); }
    },

    begin(level, resume) {
      const limits = LevelManager.limitsFor(this.mode, level);
      this.level = level;
      this.session = new GameSession(level, { mode: this.mode, ...limits });
      const cur = SaveManager.data.current;
      if (resume && cur && cur.mode === this.mode && cur.number === this.number &&
          (this.mode !== 'daily' || cur.dailyKey === this.dailyKey) && cur.levelId === level.id) {
        this.session.restore(cur.snapshot);
      }
      this.applySettings();
      this.ball.attach(this.session);
      BP.UI.showScreen('game');
      this.renderer.attach(this.session, this.ball);
      requestAnimationFrame(() => this.renderer.resize());
      this.lastConnected = this.session.connection.ok;
      this.lastFail = null;
      BP.UI.setupHud(this.session, this.level, this.mode, this.dailyKey);
      this.refresh(false);
      this.saveCurrent();
    },

    applySettings() {
      const reduced = SaveManager.settings.animations === 'reduced';
      this.renderer.reduced = reduced;
      document.body.classList.toggle('reduced', reduced);
    },

    // ---- player actions ----------------------------------------------------
    move(x, y, dir, offset) {
      const res = this.session.tryMove(x, y, dir);
      if (!res.ok) {
        if (res.reason === 'limit') {
          AudioManager.play('bump');
          BP.UI.toast('No moves left. Press Play to roll!');
        }
        return false;
      }
      this.renderer.clearHint();
      this.renderer.clearFail();
      this.renderer.animateMove(res.move, offset);
      AudioManager.play('slide');
      this.vibrate(8);
      this.refresh(true);
      return true;
    },

    invalidTap(x, y) {
      const tile = this.session.board.get(x, y);
      if (!tile || tile.t === 'empty') return;
      AudioManager.play('bump');
      const msg = tile.t === 'start' ? 'The start tile is fixed in place.'
        : tile.t === 'end' ? 'The goal tile is fixed in place.'
          : tile.t === 'block' ? 'Stone blocks never move.'
            : tile.f ? 'Bolted tiles cannot be moved.'
              : 'That tile has no empty slot next to it.';
      BP.UI.status(msg, 'bad');
    },

    undo() {
      if (!this.canInteract() || this.renderer.busy) return;
      const back = this.session.undo();
      if (!back) { BP.UI.toast('Nothing to undo'); return; }
      this.renderer.clearHint();
      this.renderer.clearFail();
      this.renderer.animateMove(back, 0);
      AudioManager.play('slide');
      this.refresh(true);
    },

    restart() {
      if (!this.session || this.session.state === 'rolling') return;
      BP.UI.closeAllOverlays();
      this.session.restart();
      this.ball.reset();
      this.ball.attach(this.session);
      this.renderer.attach(this.session, this.ball);
      this.lastConnected = this.session.connection.ok;
      AudioManager.play('click');
      BP.UI.setupHud(this.session, this.level, this.mode, this.dailyKey);
      this.refresh(false);
      this.saveCurrent();
    },

    hint() {
      if (!this.canInteract() || this.renderer.busy) return;
      const h = this.session.hint();
      AudioManager.play('hint');
      if (!h) {
        BP.UI.toast('This board has drifted far from a solution. Try Undo or Restart.');
      } else if (h.solved) {
        BP.UI.toast('The path is complete. Press Play!');
      } else {
        this.renderer.showHint(h.move);
        BP.UI.status(`Hint: slide the highlighted tile. ${h.remaining} move${h.remaining > 1 ? 's' : ''} to go.`, 'good');
      }
    },

    roll() {
      if (!this.canInteract() || this.renderer.busy) return;
      this.renderer.clearHint();
      this.renderer.clearFail();
      const trace = this.session.startRoll();
      if (!trace) return;
      BP.UI.setControlsEnabled(false);
      AudioManager.play('click');
      AudioManager.startRoll();
      const reduced = this.renderer.reduced;
      this.ball.roll(trace, {
        onArrive: () => {
          AudioManager.stopRoll();
          AudioManager.play('win');
          this.vibrate([20, 40, 30]);
          const end = trace.path[trace.path.length - 1];
          const o = this.renderer.origin(end.x, end.y);
          const s = this.renderer.s;
          this.renderer.particles.burst(o.x + s / 2, o.y + s / 2, {
            count: reduced ? 20 : 90, speed: s * 6, size: s * 0.12,
          });
        },
        onBreak: (fail) => {
          AudioManager.stopRoll();
          AudioManager.play(fail.reason === 'gap' || fail.reason === 'edge' ? 'drop' : 'bump');
          setTimeout(() => AudioManager.play('fail'), 200);
          this.vibrate(70);
          this.renderer.showFail(fail, trace.path);
        },
        onDone: (result) => this.finishRoll(result),
      }, reduced);
    },

    finishRoll(result) {
      const outcome = this.session.finishRoll(result);
      BP.UI.setControlsEnabled(true);
      if (outcome === 'won') {
        this.win();
      } else if (outcome === 'lost') {
        this.lose('moves');
      } else {
        this.lastFail = result.fail;
        this.ball.reset();
        this.ball.attach(this.session);
        BP.UI.showFail({
          title: 'Path broken',
          msg: FAIL_TEXT[result.fail.reason] || 'The path is not connected yet.',
          canContinue: true,
        });
        this.renderer.dirty = true;
      }
    },

    win() {
      const s = this.session;
      const stars = s.stars();
      const time = Math.round(s.elapsed);
      let best, isBest;
      if (this.mode === 'daily') {
        const prev = SaveManager.dailyResult(this.dailyKey);
        SaveManager.recordDaily(this.dailyKey, { stars, moves: s.moves, time });
        isBest = !prev || s.moves < prev.bestMoves;
        best = SaveManager.dailyResult(this.dailyKey).bestMoves;
      } else {
        const r = SaveManager.recordWin(this.mode, this.number, { stars, moves: s.moves, time }, LevelManager.count());
        isBest = r.isBest && !!r.previous;
        best = SaveManager.levelResult(this.mode, this.number).bestMoves;
      }
      const hasNext = this.mode !== 'daily' && this.number < LevelManager.count();
      setTimeout(() => {
        BP.UI.showWin({
          stars, moves: s.moves, time, par: this.level.par, best, isBest,
          hasNext, mode: this.mode, hintsUsed: s.hintsUsed,
          isLast: this.mode !== 'daily' && this.number === LevelManager.count(),
        });
      }, this.renderer.reduced ? 150 : 650);
    },

    lose(reason) {
      AudioManager.stopRoll();
      AudioManager.play('fail');
      this.vibrate([60, 60, 60]);
      SaveManager.clearCurrent();
      BP.UI.updateTime(this.session);
      BP.UI.setControlsEnabled(true);
      BP.UI.showFail({
        title: reason === 'time' ? "Time's up!" : 'Out of moves',
        msg: reason === 'time'
          ? 'The clock ran out before the ball reached the goal. Give it another go!'
          : 'You used every move without completing the path. Try a different route!',
        canContinue: false,
      });
    },

    pause() {
      if (!this.session || this.session.state !== 'playing') return;
      this.session.pause();
      this.saveCurrent();
      BP.UI.openOverlay('pause');
    },

    resume() {
      if (!this.session) return;
      this.session.resume();
      BP.UI.closeOverlay('pause');
    },

    next() {
      BP.UI.closeAllOverlays();
      if (this.mode === 'daily') { BP.UI.showScreen('home'); return; }
      if (this.number < LevelManager.count()) this.startLevel(this.mode, this.number + 1, { resume: false });
      else BP.UI.showLevels(this.mode);
    },

    replay() {
      BP.UI.closeAllOverlays();
      if (this.mode === 'daily') this.begin(this.level, false);
      else this.startLevel(this.mode, this.number, { resume: false });
    },

    quit() {
      this.saveCurrent();
      AudioManager.stopRoll();
      BP.UI.closeAllOverlays();
    },

    // ---- helpers ------------------------------------------------------------
    refresh(changed) {
      const ok = this.session.connection.ok;
      if (changed && ok && !this.lastConnected) {
        AudioManager.play('connect');
        this.vibrate([10, 30, 10]);
        // sparkle along the completed path
        const s = this.renderer.s;
        this.session.connection.path.forEach((p, i) => {
          setTimeout(() => {
            const o = this.renderer.origin(p.x, p.y);
            this.renderer.particles.sparkle(o.x + s / 2, o.y + s / 2, this.renderer.reduced ? 3 : 8);
          }, i * 35);
        });
      }
      this.lastConnected = ok;
      BP.UI.updateHud(this.session);
      if (ok) BP.UI.status('Path complete! Press Play to roll the ball.', 'good');
      else if (changed) BP.UI.status(this.session.moveLimit && !this.session.movesLeft ? 'No moves left. Press Play!' : 'Keep sliding to connect the pipe.');
      else BP.UI.status('Slide tiles to connect the pipe from start to goal.');
      this.renderer.dirty = true;
      if (changed) this.saveCurrent();
    },

    saveCurrent() {
      const s = this.session;
      if (!s || (s.state !== 'playing' && s.state !== 'paused')) return;
      SaveManager.saveCurrent({
        mode: this.mode, number: this.number, dailyKey: this.dailyKey, levelId: this.level.id,
        snapshot: s.snapshot(),
      });
    },

    vibrate(pattern) {
      if (SaveManager.settings.vibration && navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
      }
    },

    tick(dt, now) {
      const s = this.session;
      if (s && BP.UI.currentScreen === 'game' && !BP.UI.overlayOpen()) {
        if (s.tick(dt) === 'timeout') this.lose('time');
        this.hudTimer += dt;
        if (this.hudTimer > 0.2) { this.hudTimer = 0; BP.UI.updateTime(s); }
      }
      this.renderer.update(dt);
      this.ball.update(dt);
      if (BP.UI.currentScreen === 'game' && this.renderer.needsFrame()) this.renderer.render(now);
    },
  };

  BP.Engine = Engine;
})(window.BP = window.BP || {});
