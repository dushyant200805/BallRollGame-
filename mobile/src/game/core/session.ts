/** Game session: pure gameplay state for one level attempt (port of js/core/session.js).
 * Moves, undo history, timer, rolling, win/lose rules. No UI access, so it is unit-tested in Node.
 */
import { GameMode, Move, MoveRecord, opposite } from './constants';
import { Board } from './board';
import { TraceResult, solve, trace } from './pathfinding';

export type SessionState = 'playing' | 'paused' | 'rolling' | 'won' | 'lost';

export interface LevelDef {
  id: number | string;
  size: number;
  par: number;
  rows: readonly string[];
  /** Stored optimal solution as [x, y, dirBit] from the initial layout. */
  solution?: readonly (readonly number[])[];
}

export interface SessionOptions {
  mode?: GameMode;
  moveLimit?: number;
  timeLimit?: number;
}

export interface Snapshot {
  rows: string[];
  moves: number;
  elapsed: number;
  history: MoveRecord[];
  hintsUsed: number;
}

export type HintResult = null | { solved: true } | { solved: false; move: Move; remaining: number };

export class GameSession {
  readonly level: LevelDef;
  readonly mode: GameMode;
  readonly moveLimit: number; // 0 = unlimited
  readonly timeLimit: number; // seconds, 0 = none
  readonly initial: Board;
  board!: Board;
  moves = 0;
  history: MoveRecord[] = [];
  elapsed = 0;
  hintsUsed = 0;
  state: SessionState = 'playing';
  lostReason: 'time' | 'moves' | null = null;
  private trace_: TraceResult | null = null;
  /** Board key → next optimal move, for every state along the stored solution. */
  private solutionMap: Map<string, { move: Move; remaining: number }> | null = null;

  constructor(level: LevelDef, opts: SessionOptions = {}) {
    this.level = level;
    this.mode = opts.mode || 'classic';
    this.moveLimit = opts.moveLimit || 0;
    this.timeLimit = opts.timeLimit || 0;
    this.initial = Board.fromRows(level.rows);
    this.restart();
  }

  restart(): void {
    this.board = this.initial.clone();
    this.moves = 0;
    this.history = [];
    this.elapsed = 0;
    this.hintsUsed = 0;
    this.state = 'playing';
    this.lostReason = null;
    this.trace_ = null;
  }

  get connection(): TraceResult {
    if (!this.trace_) this.trace_ = trace(this.board);
    return this.trace_;
  }

  get movesLeft(): number {
    return this.moveLimit ? Math.max(0, this.moveLimit - this.moves) : Infinity;
  }
  get timeLeft(): number {
    return this.timeLimit ? Math.max(0, this.timeLimit - this.elapsed) : Infinity;
  }

  canInteract(): boolean {
    return this.state === 'playing';
  }

  tryMove(x: number, y: number, dir: number): { ok: true; move: MoveRecord } | { ok: false; reason: string } {
    if (!this.canInteract()) return { ok: false, reason: 'state' };
    if (this.moveLimit && this.moves >= this.moveLimit) return { ok: false, reason: 'limit' };
    const move = this.board.move(x, y, dir);
    if (!move) return { ok: false, reason: 'illegal' };
    this.history.push(move);
    this.moves++;
    this.trace_ = null;
    return { ok: true, move };
  }

  /** Reverts the last slide. Returns the reverse move (for animation) or null. */
  undo(): MoveRecord | null {
    if (!this.canInteract() || !this.history.length) return null;
    const m = this.history.pop()!;
    const back = this.board.move(m.toX, m.toY, opposite(m.dir));
    this.moves = Math.max(0, this.moves - 1);
    this.trace_ = null;
    return back;
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
  }
  resume(): void {
    if (this.state === 'paused') this.state = 'playing';
  }

  /** Advance the clock. Returns 'timeout' when a time limit runs out. */
  tick(dt: number): 'timeout' | null {
    if (this.state !== 'playing') return null;
    this.elapsed += dt;
    if (this.timeLimit && this.elapsed >= this.timeLimit) {
      this.elapsed = this.timeLimit;
      this.state = 'lost';
      this.lostReason = 'time';
      return 'timeout';
    }
    return null;
  }

  /** Start the ball; returns the trace the ball will follow. */
  startRoll(): TraceResult | null {
    if (!this.canInteract()) return null;
    this.state = 'rolling';
    return this.connection;
  }

  /** Resolve a finished roll. */
  finishRoll(result: TraceResult): 'won' | 'lost' | 'retry' | null {
    if (this.state !== 'rolling') return null;
    if (result.ok) {
      this.state = 'won';
      return 'won';
    }
    if (this.moveLimit && this.moves >= this.moveLimit) {
      this.state = 'lost';
      this.lostReason = 'moves';
      return 'lost';
    }
    this.state = 'playing';
    return 'retry';
  }

  private buildSolutionMap(): Map<string, { move: Move; remaining: number }> {
    const map = new Map<string, { move: Move; remaining: number }>();
    const sol = this.level.solution;
    if (!sol || !sol.length) return map;
    const b = this.initial.clone();
    for (let i = 0; i < sol.length; i++) {
      const [x, y, dir] = sol[i];
      const key = b.key();
      if (!map.has(key)) map.set(key, { move: { x, y, dir: dir as Move['dir'] }, remaining: sol.length - i });
      if (!b.move(x, y, dir)) break;
    }
    return map;
  }

  /** Next best move from the current position. Instant when the board is on the stored
   *  optimal solution; otherwise a BFS (same result, just slower). */
  hint(maxNodes = 200000): HintResult {
    this.hintsUsed++;
    if (this.connection.ok) return { solved: true };
    if (!this.solutionMap) this.solutionMap = this.buildSolutionMap();
    const known = this.solutionMap.get(this.board.key());
    if (known) return { solved: false, move: known.move, remaining: known.remaining };
    const res = solve(this.board, { maxNodes });
    if (!res.moves) return null;
    if (!res.moves.length) return { solved: true };
    return { solved: false, move: res.moves[0], remaining: res.moves.length };
  }

  stars(): number {
    if (this.state !== 'won') return 0;
    if (this.mode === 'timetrial' && this.timeLimit) {
      const frac = this.timeLeft / this.timeLimit;
      return frac >= 0.5 ? 3 : frac >= 0.25 ? 2 : 1;
    }
    const par = this.level.par || 1;
    if (this.moves <= par) return 3;
    if (this.moves <= par + Math.max(2, Math.ceil(par * 0.5))) return 2;
    return 1;
  }

  /** Serializable in-progress state for storage. */
  snapshot(): Snapshot {
    return {
      rows: this.board.toRows(),
      moves: this.moves,
      elapsed: this.elapsed,
      history: this.history.slice(),
      hintsUsed: this.hintsUsed,
    };
  }

  restore(snap: Snapshot | null | undefined): boolean {
    try {
      if (!snap) return false;
      const b = Board.fromRows(snap.rows);
      if (b.w !== this.initial.w || b.h !== this.initial.h) return false;
      this.board = b;
      this.moves = snap.moves | 0;
      this.elapsed = +snap.elapsed || 0;
      this.history = Array.isArray(snap.history) ? snap.history : [];
      this.hintsUsed = snap.hintsUsed | 0;
      this.state = 'playing';
      this.trace_ = null;
      return true;
    } catch {
      return false;
    }
  }
}
