/** Save manager: all persistence goes through AsyncStorage here (port of js/game/save-manager.js).
 * The data is loaded once at startup into memory; every change is written back (batched).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameMode, LevelMode } from '../game/core/constants';
import type { Snapshot } from '../game/core/session';
import type { DailyCache } from '../game/levelManager';
import { BALL_SKINS, DEFAULT_BALL, type BallSkin } from '../game/data/ballSkins';

const KEY = 'ballroll.save.v1';
const LEVEL_SETS = 2;
export const MODE_IDS: LevelMode[] = ['classic', 'challenge', 'timetrial'];

export interface LevelResult {
  stars: number;
  bestMoves: number;
  bestTime: number;
}

export interface Volumes {
  master: number; // 0..1
  roll: number;
  sfx: number;
  music: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  animations: 'full' | 'reduced';
  volumes: Volumes;
}

export interface CurrentGame {
  mode: GameMode;
  number: number;
  dailyKey: string | null;
  levelId: number | string;
  snapshot: Snapshot;
}

export interface SaveData {
  version: number;
  levelSets: number;
  settings: Settings;
  progress: Record<LevelMode, { unlocked: number; levels: Record<string, LevelResult> }>;
  daily: { results: Record<string, LevelResult>; cache: DailyCache | null; streak: number; lastDone: string | null };
  current: CurrentGame | null;
  lastMode: GameMode;
  ball: string; // selected ball skin id
  ballsSeen: number; // unlocked-ball count when the collection was last opened ("New" badge)
}

const defaults = (): SaveData => ({
  version: 1,
  levelSets: LEVEL_SETS,
  settings: {
    sound: true,
    music: true,
    vibration: true,
    animations: 'full',
    volumes: { master: 0.8, roll: 0.8, sfx: 0.9, music: 0.6 },
  },
  progress: {
    classic: { unlocked: 1, levels: {} },
    challenge: { unlocked: 1, levels: {} },
    timetrial: { unlocked: 1, levels: {} },
  },
  daily: { results: {}, cache: null, streak: 0, lastDone: null },
  current: null,
  lastMode: 'classic',
  ball: DEFAULT_BALL,
  ballsSeen: 1,
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge saved data over defaults: keeps every saved key while filling in new defaults. */
function merge<T>(base: T, saved: unknown): T {
  if (!isObj(saved)) return base;
  const b = base as Record<string, unknown>;
  for (const k of Object.keys(saved)) {
    b[k] = isObj(b[k]) && isObj(saved[k]) ? merge(b[k], saved[k]) : saved[k];
  }
  return base;
}

let data: SaveData = defaults();
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const Storage = {
  async load(): Promise<SaveData> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      data = merge(defaults(), saved);
    } catch {
      data = defaults();
    }
    return data;
  },

  /** Writes soon (batched). Use flush() when the app is going to the background. */
  persist(): void {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void Storage.flush();
    }, 250);
    notify();
  },

  async flush(): Promise<void> {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable: keep playing with in-memory data */
    }
  },

  /** Subscribe to any change (used by screens to re-render progress). */
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  get data(): SaveData {
    return data;
  },
  get settings(): Settings {
    return data.settings;
  },

  setSetting<K extends keyof Settings>(name: K, value: Settings[K]): void {
    data.settings[name] = value;
    Storage.persist();
  },

  setLastMode(mode: GameMode): void {
    data.lastMode = mode;
    Storage.persist();
  },

  modeProgress(mode: LevelMode) {
    return data.progress[mode];
  },

  /** A level is open if it was unlocked, or the level before it is completed. */
  isUnlocked(mode: LevelMode, n: number): boolean {
    const p = data.progress[mode];
    return n <= p.unlocked || n === 1 || !!p.levels[n - 1];
  },

  levelResult(mode: LevelMode, n: number): LevelResult | null {
    return data.progress[mode].levels[n] || null;
  },

  /** Stars across every mode (unlocks ball skins). */
  allStars(): number {
    return MODE_IDS.reduce((sum, m) => sum + Storage.totalStars(m), 0);
  },

  setVolume(name: keyof Volumes, value: number): void {
    data.settings.volumes[name] = Math.max(0, Math.min(1, value));
    Storage.persist();
  },

  isBallUnlocked(skin: BallSkin): boolean {
    return Storage.allStars() >= skin.cost;
  },

  unlockedBallCount(): number {
    const stars = Storage.allStars();
    return BALL_SKINS.filter((s) => stars >= s.cost).length;
  },

  /** Selected ball; falls back to the default if it is no longer unlocked (e.g. after a reset). */
  selectedBall(): BallSkin {
    const skin = BALL_SKINS.find((s) => s.id === data.ball);
    if (skin && Storage.isBallUnlocked(skin)) return skin;
    return BALL_SKINS.find((s) => s.id === DEFAULT_BALL) || BALL_SKINS[0];
  },

  setBall(id: string): void {
    data.ball = id;
    Storage.persist();
  },

  markBallsSeen(): void {
    data.ballsSeen = Storage.unlockedBallCount();
    Storage.persist();
  },

  totalStars(mode: LevelMode): number {
    return Object.values(data.progress[mode].levels).reduce((s, r) => s + (r.stars || 0), 0);
  },

  /** Records a win; returns {isBest, previous}. */
  recordWin(mode: LevelMode, n: number, r: { stars: number; moves: number; time: number }, levelCount: number) {
    const p = data.progress[mode];
    const prev = p.levels[n] || null;
    p.levels[n] = {
      stars: Math.max(r.stars, prev ? prev.stars : 0),
      bestMoves: prev ? Math.min(prev.bestMoves, r.moves) : r.moves,
      bestTime: prev ? Math.min(prev.bestTime, r.time) : r.time,
    };
    p.unlocked = Math.min(Math.max(p.unlocked, n + 1), levelCount);
    data.current = null;
    Storage.persist();
    return { previous: prev, isBest: !prev || r.moves < prev.bestMoves || r.stars > prev.stars };
  },

  dailyResult(key: string): LevelResult | null {
    return data.daily.results[key] || null;
  },

  recordDaily(key: string, r: { stars: number; moves: number; time: number }, yesterdayKey: string): void {
    const prev = data.daily.results[key];
    data.daily.results[key] = {
      stars: Math.max(r.stars, prev ? prev.stars : 0),
      bestMoves: prev ? Math.min(prev.bestMoves, r.moves) : r.moves,
      bestTime: prev ? Math.min(prev.bestTime, r.time) : r.time,
    };
    if (!prev) {
      data.daily.streak = data.daily.lastDone === yesterdayKey ? data.daily.streak + 1 : 1;
      data.daily.lastDone = key;
    }
    data.current = null;
    Storage.persist();
  },

  cacheDaily(level: DailyCache): void {
    data.daily.cache = { key: level.key, id: level.id, size: level.size, par: level.par, rows: level.rows, solution: level.solution };
    Storage.persist();
  },

  saveCurrent(current: CurrentGame): void {
    data.current = current;
    Storage.persist();
  },
  clearCurrent(): void {
    data.current = null;
    Storage.persist();
  },

  resetProgress(): void {
    const settings = data.settings;
    data = defaults();
    data.settings = settings;
    Storage.persist();
  },
};
