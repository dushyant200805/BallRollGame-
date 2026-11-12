import type { LevelMode } from '../game/core/constants';
import { LevelManager } from '../game/levelManager';
import { Storage, MODE_IDS } from '../services/storage';

/** First unlocked level without a result, else the highest unlocked (port of UI.nextLevelFor). */
export function nextLevelFor(mode: LevelMode): number {
  const count = LevelManager.count(mode);
  for (let n = 1; n <= count; n++) {
    if (!Storage.isUnlocked(mode, n)) break;
    if (!Storage.levelResult(mode, n)) return n;
  }
  let last = 1;
  for (let n = 1; n <= count; n++) if (Storage.isUnlocked(mode, n)) last = n;
  return last;
}

export function totalStarsAllModes(): number {
  return MODE_IDS.reduce((s, m) => s + Storage.totalStars(m), 0);
}

/** Classic level to start from the home Play button, and whether it resumes a saved board. */
export function playTarget(): { number: number; resume: boolean; allDone: boolean } {
  const cur = Storage.data.current;
  if (cur && cur.mode === 'classic' && Storage.isUnlocked('classic', cur.number)) {
    return { number: cur.number, resume: true, allDone: false };
  }
  const allDone = Object.keys(Storage.modeProgress('classic').levels).length >= LevelManager.count('classic');
  return { number: nextLevelFor('classic'), resume: false, allDone };
}
