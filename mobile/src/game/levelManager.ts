/** Level manager: level lookup, difficulty tiers, mode rules, daily puzzle (port of js/game/level-manager.js). */
import { GameMode, LevelMode } from './core/constants';
import { LevelDef } from './core/session';
import { GenConfig, generate } from './core/generator';
import { LEVEL_SETS } from './data/levels';

export interface Tier {
  name: string;
  from: number;
  to: number;
  color: string;
}

export interface Level extends LevelDef {
  number: number; // 0 for daily
  tier: { name: string; color: string };
  key?: string; // daily date key
}

const C = { beginner: '#4cc38a', easy: '#3fa7e0', medium: '#f0a83a', hard: '#e8644a', expert: '#a35ee0', master: '#e0446e' };

/** Each mode has its own level set and its own difficulty curve. */
export const TIERS: Record<LevelMode, Tier[]> = {
  classic: [
    { name: 'Beginner', from: 1, to: 6, color: C.beginner },
    { name: 'Easy', from: 7, to: 12, color: C.easy },
    { name: 'Medium', from: 13, to: 17, color: C.medium },
    { name: 'Hard', from: 18, to: Infinity, color: C.hard },
  ],
  challenge: [
    { name: 'Medium', from: 1, to: 5, color: C.medium },
    { name: 'Hard', from: 6, to: 11, color: C.hard },
    { name: 'Expert', from: 12, to: 16, color: C.expert },
    { name: 'Master', from: 17, to: Infinity, color: C.master },
  ],
  timetrial: [
    { name: 'Easy', from: 1, to: 4, color: C.easy },
    { name: 'Medium', from: 5, to: 10, color: C.medium },
    { name: 'Hard', from: 11, to: 15, color: C.hard },
    { name: 'Expert', from: 16, to: Infinity, color: C.expert },
  ],
};

export const MODES: Record<GameMode, { id: GameMode; label: string; short: string; desc: string }> = {
  classic: { id: 'classic', label: 'Classic', short: 'Classic', desc: 'Learn the ropes, then take on big boards. Fewer moves earn more stars.' },
  challenge: { id: 'challenge', label: 'Challenge', short: 'Challenge', desc: 'Only one empty slot, bolted tiles and a move limit that keeps shrinking.' },
  timetrial: { id: 'timetrial', label: 'Time Trial', short: 'Time', desc: 'Huge boards full of decoys, and the clock gets tighter every level.' },
  daily: { id: 'daily', label: 'Daily', short: 'Daily', desc: 'A fresh puzzle every day.' },
};

export const LEVEL_MODES: LevelMode[] = ['classic', 'challenge', 'timetrial'];

const DAILY_CFG: GenConfig = {
  size: 6, pathMin: 8, pathMax: 11, empties: 2, blocks: 2, decoyRatio: 0.55,
  fixedOnPath: 1, scramble: 16, parMin: 6, parMax: 9, maxNodes: 300000, maxAttempts: 120,
};
const DAILY_TIER = { name: 'Daily', color: '#f06aa8' };

const pad = (n: number) => String(n).padStart(2, '0');

export const LevelManager = {
  setFor(mode: LevelMode): LevelDef[] {
    return LEVEL_SETS[mode] || LEVEL_SETS.classic;
  },

  tiersFor(mode: LevelMode): Tier[] {
    return TIERS[mode] || TIERS.classic;
  },

  count(mode: LevelMode = 'classic'): number {
    return LevelManager.setFor(mode).length;
  },

  /** 1-based level lookup within a mode's own level set. */
  get(mode: LevelMode, n: number): Level | null {
    const data = LevelManager.setFor(mode)[n - 1];
    if (!data) return null;
    return { ...data, number: n, tier: LevelManager.tierOf(mode, n) };
  },

  tierOf(mode: LevelMode, n: number): Tier {
    const tiers = LevelManager.tiersFor(mode);
    return tiers.find((t) => n >= t.from && n <= t.to) || tiers[tiers.length - 1];
  },

  /** Mode-specific constraints for a level; they tighten as levels progress. */
  limitsFor(mode: GameMode, level: Level): { moveLimit?: number; timeLimit?: number } {
    if (mode === 'daily') return {};
    const t = Math.min(1, Math.max(0, ((level.number || 1) - 1) / Math.max(1, LevelManager.count(mode) - 1)));
    if (mode === 'challenge') {
      // Spare moves shrink from +50% of par on level 1 to +10% on the last level.
      const spare = Math.max(2, Math.ceil(level.par * (0.5 - 0.4 * t)));
      return { moveLimit: level.par + spare };
    }
    if (mode === 'timetrial') {
      // Seconds allowed per par move drop from 8 to 4.
      const perMove = 8 - 4 * t;
      return { timeLimit: Math.round(10 + level.par * perMove + level.size * 2) };
    }
    return {};
  },

  dailyKey(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },

  dailyLabel(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[new Date(y, m - 1, d).getMonth()]} ${d}`;
  },

  /** Deterministic daily puzzle for a date key (YYYY-MM-DD). */
  getDaily(key: string, cached?: DailyCache | null): Level | null {
    if (cached && cached.key === key && Array.isArray(cached.rows)) {
      return { ...cached, number: 0, tier: DAILY_TIER };
    }
    const res = generate(DAILY_CFG, 'ballpath-daily-' + key);
    if (!res) return null;
    return {
      key,
      id: 'daily-' + key,
      size: DAILY_CFG.size,
      par: res.par,
      rows: res.rows,
      solution: res.solution.map((m) => [m.x, m.y, m.dir]),
      number: 0,
      tier: DAILY_TIER,
    };
  },
};

export interface DailyCache {
  key: string;
  id: string | number;
  size: number;
  par: number;
  rows: string[];
  solution: number[][];
}
