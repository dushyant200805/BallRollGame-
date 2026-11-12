/* Ball Path — Game session: pure gameplay state for one level attempt
 * (moves, undo history, timer, rolling, win/lose rules). No DOM access, so it is unit-tested in Node.
 */
(function (BP) {
  'use strict';
  const { Board, Pathfinding } = BP;

  const STATE = Object.freeze({
    PLAYING: 'playing', PAUSED: 'paused', ROLLING: 'rolling', WON: 'won', LOST: 'lost',
  });

  class GameSession {
    /**
     * @param {{id:any, rows:string[], par:number}} level
     * @param {{mode?:string, moveLimit?:number, timeLimit?:number}} opts
     */
    constructor(level, opts = {}) {
      this.level = level;
      this.mode = opts.mode || 'classic';
      this.moveLimit = opts.moveLimit || 0;  // 0 = unlimited
      this.timeLimit = opts.timeLimit || 0;  // seconds, 0 = none
      this.initial = Board.fromRows(level.rows);
      this.restart();
    }

    restart() {
      this.board = this.initial.clone();
      this.moves = 0;
      this.history = [];
      this.elapsed = 0;
      this.hintsUsed = 0;
      this.state = STATE.PLAYING;
      this.lostReason = null;
      this._trace = null;
    }

    get connection() {
      if (!this._trace) this._trace = Pathfinding.trace(this.board);
      return this._trace;
    }

    get movesLeft() { return this.moveLimit ? Math.max(0, this.moveLimit - this.moves) : Infinity; }
    get timeLeft() { return this.timeLimit ? Math.max(0, this.timeLimit - this.elapsed) : Infinity; }

    canInteract() { return this.state === STATE.PLAYING; }

    /** @returns {{ok:true, move}|{ok:false, reason:string}} */
    tryMove(x, y, dir) {
      if (!this.canInteract()) return { ok: false, reason: 'state' };
      if (this.moveLimit && this.moves >= this.moveLimit) return { ok: false, reason: 'limit' };
      const move = this.board.move(x, y, dir);
      if (!move) return { ok: false, reason: 'illegal' };
      this.history.push(move);
      this.moves++;
      this._trace = null;
      return { ok: true, move };
    }

    /** Reverts the last slide. Returns the reverse move (for animation) or null. */
    undo() {
      if (!this.canInteract() || !this.history.length) return null;
      const m = this.history.pop();
      const back = this.board.move(m.toX, m.toY, BP.opposite(m.dir));
      this.moves = Math.max(0, this.moves - 1);
      this._trace = null;
      return back;
    }

    pause() { if (this.state === STATE.PLAYING) this.state = STATE.PAUSED; }
    resume() { if (this.state === STATE.PAUSED) this.state = STATE.PLAYING; }

    /** Advance the clock. Returns 'timeout' when a time limit runs out. */
    tick(dt) {
      if (this.state !== STATE.PLAYING) return null;
      this.elapsed += dt;
      if (this.timeLimit && this.elapsed >= this.timeLimit) {
        this.elapsed = this.timeLimit;
        this.state = STATE.LOST;
        this.lostReason = 'time';
        return 'timeout';
      }
      return null;
    }

    /** Start the ball; returns the trace the ball will follow. */
    startRoll() {
      if (!this.canInteract()) return null;
      this.state = STATE.ROLLING;
      return this.connection;
    }

    /** Resolve a finished roll. Returns 'won' | 'lost' | 'retry'. */
    finishRoll(result) {
      if (this.state !== STATE.ROLLING) return null;
      if (result.ok) { this.state = STATE.WON; return 'won'; }
      if (this.moveLimit && this.moves >= this.moveLimit) {
        this.state = STATE.LOST;
        this.lostReason = 'moves';
        return 'lost';
      }
      this.state = STATE.PLAYING;
      return 'retry';
    }

    /** Next best move from the current position, or null if none found within budget. */
    hint(maxNodes = 200000) {
      const res = Pathfinding.solve(this.board, { maxNodes });
      this.hintsUsed++;
      if (!res.moves) return null;
      if (!res.moves.length) return { solved: true };
      return { solved: false, move: res.moves[0], remaining: res.moves.length };
    }

    stars() {
      if (this.state !== STATE.WON) return 0;
      if (this.mode === 'timetrial' && this.timeLimit) {
        const frac = this.timeLeft / this.timeLimit;
        return frac >= 0.5 ? 3 : frac >= 0.25 ? 2 : 1;
      }
      const par = this.level.par || 1;
      if (this.moves <= par) return 3;
      if (this.moves <= par + Math.max(2, Math.ceil(par * 0.5))) return 2;
      return 1;
    }

    /** Serializable in-progress state for SaveManager. */
    snapshot() {
      return {
        rows: this.board.toRows(),
        moves: this.moves,
        elapsed: this.elapsed,
        history: this.history.slice(),
        hintsUsed: this.hintsUsed,
      };
    }

    restore(snap) {
      try {
        const b = Board.fromRows(snap.rows);
        if (b.w !== this.initial.w || b.h !== this.initial.h) return false;
        this.board = b;
        this.moves = snap.moves | 0;
        this.elapsed = +snap.elapsed || 0;
        this.history = Array.isArray(snap.history) ? snap.history : [];
        this.hintsUsed = snap.hintsUsed | 0;
        this.state = STATE.PLAYING;
        this._trace = null;
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  GameSession.STATE = STATE;
  BP.GameSession = GameSession;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
