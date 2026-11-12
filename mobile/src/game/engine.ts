/** Game engine: wires session, renderer, ball, input, audio, haptics and storage together and
 * runs the frame loop (port of js/game/engine.js + js/game/input-controller.js).
 *
 * The engine never touches React state per frame: frames go to a Skia picture shared value,
 * and the UI is told about discrete changes (HUD values, status line, overlays) through onUi.
 */
import type { SkPicture } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { DirBit, GameMode, LevelMode, TILE, dirByBit } from './core/constants';
import { GameSession } from './core/session';
import type { TraceResult } from './core/pathfinding';
import { BoardRenderer } from './render/boardRenderer';
import { BallController } from './render/ball';
import { Level, LevelManager, MODES } from './levelManager';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { haptic } from '../services/haptics';

const COMMIT_FRACTION = 0.35; // drag at least this much of a cell to commit
const TAP_SLOP = 8; //          px of movement still counted as a tap

const FAIL_TEXT: Record<string, string> = {
  gap: 'The ball fell into an empty slot. Slide a pipe into the marked spot.',
  blocked: "The ball hit a tile that doesn't connect. Fix the marked spot.",
  'wrong-side': 'The goal can only be entered from its open side.',
  edge: 'The ball rolled off the edge of the board.',
  loop: 'The path loops back on itself.',
};

export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export interface HudState {
  title: string;
  chip: string;
  chipColor: string;
  moves: number;
  targetLabel: string;
  targetIcon: 'flag' | 'flash';
  target: number;
  targetWarn: boolean;
  timeLabel: string;
  time: string;
  timeWarn: boolean;
  ready: boolean;
  canUndo: boolean;
  controlsEnabled: boolean;
}

export interface WinInfo {
  stars: number;
  moves: number;
  movesText: string;
  time: string;
  best: number;
  title: string;
  note: string;
  hasNext: boolean;
  mode: GameMode;
}

export interface FailInfo {
  title: string;
  msg: string;
  icon: 'broken' | 'time' | 'moves';
  canContinue: boolean;
}

export type Overlay = null | { type: 'pause' } | { type: 'win'; info: WinInfo } | { type: 'fail'; info: FailInfo };

export interface UiPatch {
  hud?: HudState;
  status?: { text: string; kind?: 'good' | 'bad' };
  overlay?: Overlay;
  toast?: string;
}

interface DragState {
  cell: { x: number; y: number };
  dirs: DirBit[];
  sx: number;
  sy: number;
  moved: number;
}

export class GameEngine {
  session: GameSession | null = null;
  level: Level | null = null;
  mode: GameMode = 'classic';
  number = 0;
  dailyKey: string | null = null;
  overlay: Overlay = null;
  readonly renderer = new BoardRenderer();
  readonly ball = new BallController();

  private picture: SharedValue<SkPicture>;
  private onUi: (p: UiPatch) => void;
  private lastConnected = false;
  private hudTimer = 0;
  private raf: number | null = null;
  private lastFrame = 0;
  private active = false;
  private drag: DragState | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private rollingNow = false;

  constructor(picture: SharedValue<SkPicture>, onUi: (p: UiPatch) => void) {
    this.picture = picture;
    this.onUi = onUi;
  }

  // ---- lifecycle ------------------------------------------------------------
  /** Start the frame loop (Game screen focused). */
  activate() {
    if (this.active) return;
    this.active = true;
    this.lastFrame = Date.now();
    const frame = () => {
      if (!this.active) return;
      const now = Date.now();
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.tick(dt, now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stop the frame loop and timers (screen blurred / unmounted). */
  deactivate() {
    this.active = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    AudioService.stopRoll();
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  startLevel(mode: LevelMode, number: number, resume = true): boolean {
    const level = LevelManager.get(mode, number);
    if (!level) return false;
    this.mode = mode;
    this.number = number;
    this.dailyKey = null;
    Storage.setLastMode(mode);
    this.begin(level, resume);
    return true;
  }

  startDaily(level: Level, key: string) {
    this.mode = 'daily';
    this.number = 0;
    this.dailyKey = key;
    this.begin(level, true);
  }

  private begin(level: Level, resume: boolean) {
    const limits = LevelManager.limitsFor(this.mode, level);
    this.level = level;
    this.session = new GameSession(level, { mode: this.mode, ...limits });
    const cur = Storage.data.current;
    if (
      resume && cur && cur.mode === this.mode && cur.number === this.number &&
      (this.mode !== 'daily' || cur.dailyKey === this.dailyKey) && cur.levelId === level.id
    ) {
      this.session.restore(cur.snapshot);
    }
    this.rollingNow = false;
    this.drag = null;
    this.applySettings();
    this.ball.attach(this.session);
    this.renderer.attach(this.session, this.ball);
    this.lastConnected = this.session.connection.ok;
    this.setOverlay(null);
    this.refresh(false);
    this.saveCurrent();
  }

  applySettings() {
    this.renderer.reduced = Storage.settings.animations === 'reduced';
    this.renderer.dirty = true;
  }

  setBoardSize(side: number) {
    if (Math.floor(side) === this.renderer.side) return;
    this.renderer.resize(side);
    this.renderer.dirty = true;
  }

  canInteract(): boolean {
    return !!this.session && this.session.canInteract() && !this.ball.animating && !this.overlay && !this.rollingNow;
  }

  // ---- input (port of InputController) -----------------------------------------
  pointerDown(px: number, py: number) {
    if (this.drag || !this.canInteract() || this.renderer.busy) return;
    const cell = this.renderer.cellAt(px, py);
    if (!cell) return;
    const dirs = this.session!.board.movableDirs(cell.x, cell.y);
    if (!dirs.length) {
      this.invalidTap(cell.x, cell.y);
      return;
    }
    this.drag = { cell, dirs, sx: px, sy: py, moved: 0 };
    this.renderer.drag = { x: cell.x, y: cell.y, dir: dirs[0], offset: 0 };
    this.renderer.dirty = true;
  }

  pointerMove(px: number, py: number) {
    const a = this.drag;
    if (!a) return;
    const dx = px - a.sx;
    const dy = py - a.sy;
    a.moved = Math.max(a.moved, Math.hypot(dx, dy));
    // Project the drag onto each allowed direction; take the strongest.
    let best = a.dirs[0];
    let bestProj = -Infinity;
    for (const bit of a.dirs) {
      const d = dirByBit(bit)!;
      const proj = dx * d.dx + dy * d.dy;
      if (proj > bestProj) {
        bestProj = proj;
        best = bit;
      }
    }
    this.renderer.drag = { x: a.cell.x, y: a.cell.y, dir: best, offset: Math.max(0, Math.min(this.renderer.s, bestProj)) };
    this.renderer.dirty = true;
  }

  pointerUp() {
    const a = this.drag;
    if (!a) return;
    const drag = this.renderer.drag;
    this.drag = null;
    this.renderer.drag = null;
    this.renderer.dirty = true;
    if (!drag) return;
    let commitDir: DirBit | null = null;
    if (drag.offset >= this.renderer.s * COMMIT_FRACTION) commitDir = drag.dir as DirBit;
    else if (a.moved <= TAP_SLOP && a.dirs.length === 1) commitDir = a.dirs[0]; // tap = slide to the only free side
    if (commitDir !== null) {
      const ok = this.move(a.cell.x, a.cell.y, commitDir, commitDir === drag.dir ? drag.offset : 0);
      if (!ok) this.renderer.animateSnapBack(a.cell.x, a.cell.y, drag.dir, drag.offset);
    } else {
      this.renderer.animateSnapBack(a.cell.x, a.cell.y, drag.dir, drag.offset);
      if (a.moved <= TAP_SLOP && a.dirs.length > 1) this.status('Drag the tile toward the slot you want.', 'bad');
    }
  }

  pointerCancel() {
    if (!this.drag) return;
    const drag = this.renderer.drag;
    this.drag = null;
    this.renderer.drag = null;
    if (drag) this.renderer.animateSnapBack(drag.x, drag.y, drag.dir, drag.offset);
  }

  // ---- player actions ------------------------------------------------------------
  private move(x: number, y: number, dir: DirBit, offset: number): boolean {
    const res = this.session!.tryMove(x, y, dir);
    if (!res.ok) {
      if (res.reason === 'limit') {
        AudioService.play('bump');
        haptic('warn');
        this.toast('No moves left. Press Play to roll!');
      }
      return false;
    }
    this.renderer.clearHint();
    this.renderer.clearFail();
    this.renderer.animateMove(res.move, offset);
    AudioService.play('slide');
    haptic('slide');
    this.refresh(true);
    return true;
  }

  private invalidTap(x: number, y: number) {
    const tile = this.session!.board.get(x, y);
    if (!tile || tile.t === TILE.EMPTY) return;
    AudioService.play('bump');
    haptic('tap');
    const msg =
      tile.t === TILE.START ? 'The start tile is fixed in place.'
      : tile.t === TILE.END ? 'The goal tile is fixed in place.'
      : tile.t === TILE.BLOCK ? 'Stone blocks never move.'
      : tile.f ? 'Bolted tiles cannot be moved.'
      : 'That tile has no empty slot next to it.';
    this.status(msg, 'bad');
  }

  undo() {
    if (!this.canInteract() || this.renderer.busy) return;
    const back = this.session!.undo();
    if (!back) {
      this.toast('Nothing to undo');
      return;
    }
    this.renderer.clearHint();
    this.renderer.clearFail();
    this.renderer.animateMove(back, 0);
    AudioService.play('slide');
    haptic('slide');
    this.refresh(true);
  }

  restart() {
    if (!this.session || this.session.state === 'rolling') return;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.session.restart();
    this.rollingNow = false;
    this.ball.attach(this.session);
    this.renderer.attach(this.session, this.ball);
    this.lastConnected = this.session.connection.ok;
    AudioService.play('click');
    this.setOverlay(null);
    this.refresh(false);
    this.saveCurrent();
  }

  hint() {
    if (!this.canInteract() || this.renderer.busy) return;
    AudioService.play('hint');
    const h = this.session!.hint();
    if (!h) {
      this.toast('This board has drifted far from a solution. Try Undo or Restart.');
    } else if (h.solved) {
      this.toast('The path is complete. Press Play!');
    } else {
      this.renderer.showHint(h.move);
      this.status(`Hint: slide the highlighted tile. ${h.remaining} move${h.remaining > 1 ? 's' : ''} to go.`, 'good');
    }
  }

  roll() {
    if (!this.canInteract() || this.renderer.busy) return;
    this.renderer.clearHint();
    this.renderer.clearFail();
    const traceResult = this.session!.startRoll();
    if (!traceResult) return;
    this.rollingNow = true; // guards against double taps until the roll resolves
    this.pushHud();
    AudioService.play('click');
    AudioService.startRoll();
    const reduced = this.renderer.reduced;
    this.ball.roll(
      traceResult,
      {
        onArrive: () => {
          AudioService.stopRoll();
          AudioService.play('win');
          haptic('win');
          const end = traceResult.path[traceResult.path.length - 1];
          const o = this.renderer.origin(end.x, end.y);
          const s = this.renderer.s;
          this.renderer.particles.burst(o.x + s / 2, o.y + s / 2, { count: reduced ? 20 : 90, speed: s * 6, size: s * 0.12 });
        },
        onBreak: (fail) => {
          AudioService.stopRoll();
          AudioService.play(fail.reason === 'gap' || fail.reason === 'edge' ? 'drop' : 'bump');
          this.later(() => AudioService.play('fail'), 200);
          haptic('break');
          this.renderer.showFail(fail, traceResult.path);
        },
        onDone: (result) => this.finishRoll(result),
      },
      reduced,
    );
  }

  private finishRoll(result: TraceResult) {
    const outcome = this.session!.finishRoll(result);
    this.rollingNow = false;
    if (outcome === 'won') {
      this.win();
    } else if (outcome === 'lost') {
      this.lose('moves');
    } else {
      this.ball.attach(this.session!);
      this.setOverlay({
        type: 'fail',
        info: { title: 'Path broken', msg: FAIL_TEXT[result.fail!.reason] || 'The path is not connected yet.', icon: 'broken', canContinue: true },
      });
      this.renderer.dirty = true;
      this.pushHud();
    }
  }

  private win() {
    const s = this.session!;
    const stars = s.stars();
    const time = Math.round(s.elapsed);
    let best: number;
    let isBest: boolean;
    if (this.mode === 'daily') {
      const prev = Storage.dailyResult(this.dailyKey!);
      const y = new Date();
      y.setDate(y.getDate() - 1);
      Storage.recordDaily(this.dailyKey!, { stars, moves: s.moves, time }, LevelManager.dailyKey(y));
      isBest = !prev || s.moves < prev.bestMoves;
      best = Storage.dailyResult(this.dailyKey!)!.bestMoves;
    } else {
      const r = Storage.recordWin(this.mode, this.number, { stars, moves: s.moves, time }, LevelManager.count(this.mode));
      isBest = r.isBest && !!r.previous;
      best = Storage.levelResult(this.mode, this.number)!.bestMoves;
    }
    const count = this.mode === 'daily' ? 0 : LevelManager.count(this.mode);
    const isLast = this.mode !== 'daily' && this.number === count;
    const par = this.level!.par;
    let note = '';
    if (isBest) note = 'New best score!';
    else if (s.moves <= par) note = 'Perfect! You matched par.';
    else if (stars < 3) note = this.mode === 'timetrial' ? 'Finish faster for more stars.' : `Solve it in ${par} moves for 3 stars.`;
    if (s.hintsUsed && !note) note = `Solved with ${s.hintsUsed} hint${s.hintsUsed > 1 ? 's' : ''}.`;
    const info: WinInfo = {
      stars,
      moves: s.moves,
      movesText: this.mode === 'timetrial' ? String(s.moves) : `${s.moves} / ${par}`,
      time: fmtTime(time),
      best,
      title: this.mode === 'daily' ? 'Daily Solved!' : isLast ? 'Final Level Cleared!' : 'Level Complete!',
      note,
      hasNext: this.mode !== 'daily' && this.number < count,
      mode: this.mode,
    };
    this.pushHud();
    this.later(() => this.setOverlay({ type: 'win', info }), this.renderer.reduced ? 150 : 650);
  }

  private lose(reason: 'time' | 'moves') {
    AudioService.stopRoll();
    AudioService.play('fail');
    haptic('fail');
    Storage.clearCurrent();
    this.setOverlay({
      type: 'fail',
      info: {
        title: reason === 'time' ? "Time's up!" : 'Out of moves',
        icon: reason,
        msg: reason === 'time'
          ? 'The clock ran out before the ball reached the goal. Give it another go!'
          : 'You used every move without completing the path. Try a different route!',
        canContinue: false,
      },
    });
    this.pushHud();
  }

  pause() {
    if (!this.session || this.session.state !== 'playing' || this.overlay) return;
    this.pointerCancel();
    this.session.pause();
    this.saveCurrent();
    this.setOverlay({ type: 'pause' });
  }

  resume() {
    if (!this.session) return;
    this.session.resume();
    this.lastFrame = Date.now();
    this.setOverlay(null);
  }

  /** Close the "path broken" dialog and keep playing. */
  dismissFail() {
    if (this.overlay && this.overlay.type === 'fail') this.setOverlay(null);
  }

  /** App moved to the background: pause, save and flush to disk. */
  onBackground() {
    this.pointerCancel();
    if (this.session && this.session.state === 'playing' && !this.overlay) this.pause();
    this.saveCurrent();
    void Storage.flush();
  }

  quit() {
    this.saveCurrent();
    AudioService.stopRoll();
    void Storage.flush();
  }

  // ---- helpers ------------------------------------------------------------
  private setOverlay(o: Overlay) {
    this.overlay = o;
    this.onUi({ overlay: o });
  }

  private status(text: string, kind?: 'good' | 'bad') {
    this.onUi({ status: { text, kind } });
  }

  private toast(msg: string) {
    this.onUi({ toast: msg });
  }

  private refresh(changed: boolean) {
    const s = this.session!;
    const ok = s.connection.ok;
    if (changed && ok && !this.lastConnected) {
      AudioService.play('connect');
      haptic('connect');
      // sparkle along the completed path
      const size = this.renderer.s;
      s.connection.path.forEach((p, i) => {
        this.later(() => {
          const o = this.renderer.origin(p.x, p.y);
          this.renderer.particles.sparkle(o.x + size / 2, o.y + size / 2, this.renderer.reduced ? 3 : 8);
        }, i * 35);
      });
    }
    this.lastConnected = ok;
    this.pushHud();
    if (ok) this.status('Path complete! Press Play to roll the ball.', 'good');
    else if (changed) this.status(s.moveLimit && !s.movesLeft ? 'No moves left. Press Play!' : 'Keep sliding to connect the pipe.');
    else this.status('Slide tiles to connect the pipe from start to goal.');
    this.renderer.dirty = true;
    if (changed) this.saveCurrent();
  }

  hudState(): HudState | null {
    const s = this.session;
    const level = this.level;
    if (!s || !level) return null;
    const title = this.mode === 'daily' ? `Daily · ${LevelManager.dailyLabel(this.dailyKey!)}` : `Level ${level.number}`;
    const modeLabel = this.mode === 'classic' || this.mode === 'daily' ? '' : MODES[this.mode].label + ' · ';
    const limited = !!s.moveLimit;
    return {
      title,
      chip: modeLabel + level.tier.name,
      chipColor: level.tier.color,
      moves: s.moves,
      targetLabel: limited ? 'Moves left' : 'Par',
      targetIcon: limited ? 'flash' : 'flag',
      target: limited ? s.movesLeft : level.par,
      targetWarn: limited && s.movesLeft <= 2,
      timeLabel: s.timeLimit ? 'Time left' : 'Time',
      time: fmtTime(s.timeLimit ? s.timeLeft : Math.floor(s.elapsed)),
      timeWarn: !!s.timeLimit && s.timeLeft <= 10 && s.state === 'playing',
      ready: s.connection.ok,
      canUndo: s.history.length > 0,
      controlsEnabled: !this.rollingNow && s.state !== 'rolling',
    };
  }

  private pushHud() {
    const hud = this.hudState();
    if (hud) this.onUi({ hud });
  }

  private saveCurrent() {
    const s = this.session;
    if (!s || !this.level || (s.state !== 'playing' && s.state !== 'paused')) return;
    Storage.saveCurrent({ mode: this.mode, number: this.number, dailyKey: this.dailyKey, levelId: this.level.id, snapshot: s.snapshot() });
  }

  private tick(dt: number, now: number) {
    const s = this.session;
    if (s && !this.overlay) {
      if (s.tick(dt) === 'timeout') this.lose('time');
      this.hudTimer += dt;
      if (this.hudTimer > 0.2) {
        this.hudTimer = 0;
        this.pushHud();
      }
    }
    this.renderer.update(dt);
    this.ball.update(dt);
    if (this.renderer.needsFrame()) {
      const pic = this.renderer.render(now);
      if (pic) this.picture.value = pic;
    }
  }
}
