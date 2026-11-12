/* Ball Path — Save manager: all persistence goes through LocalStorage here. */
(function (BP) {
  'use strict';

  const KEY = 'ballpath.save.v1';
  const MODE_IDS = ['classic', 'challenge', 'timetrial'];

  const LEVEL_SETS = 2;

  const defaults = () => ({
    version: 1,
    levelSets: LEVEL_SETS,
    settings: { sound: true, music: true, vibration: true, animations: 'full' }, // 'full' | 'reduced'
    progress: {
      classic: { unlocked: 1, levels: {} },   // levels[n] = {stars, bestMoves, bestTime}
      challenge: { unlocked: 1, levels: {} },
      timetrial: { unlocked: 1, levels: {} },
    },
    daily: { results: {}, cache: null, streak: 0, lastDone: null },
    current: null,  // { mode, number, dailyKey, snapshot }
    lastMode: 'classic',
  });

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  /** Deep-merge saved data over defaults: keeps every saved key (e.g. per-level results)
   *  while filling in any defaults added by newer versions. */
  function merge(base, saved) {
    if (!isObj(saved)) return base;
    for (const k of Object.keys(saved)) {
      base[k] = isObj(base[k]) && isObj(saved[k]) ? merge(base[k], saved[k]) : saved[k];
    }
    return base;
  }

  let data = defaults();
  let storageOk = true;

  const SaveManager = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        const saved = raw ? JSON.parse(raw) : null;
        // Level set 2 gave Challenge and Time Trial brand-new levels, so results saved
        // for the old shared levels no longer apply there.
        if (isObj(saved) && (saved.levelSets || 1) < LEVEL_SETS) {
          if (isObj(saved.progress)) { delete saved.progress.challenge; delete saved.progress.timetrial; }
          if (saved.current && saved.current.mode !== 'classic' && saved.current.mode !== 'daily') saved.current = null;
          saved.levelSets = LEVEL_SETS;
        }
        data = merge(defaults(), saved);
      } catch (e) {
        storageOk = false;
        data = defaults();
      }
      return data;
    },

    persist() {
      if (!storageOk) return;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* quota / private mode */ }
    },

    get data() { return data; },
    get settings() { return data.settings; },

    setSetting(name, value) {
      data.settings[name] = value;
      SaveManager.persist();
    },

    modeProgress(mode) { return data.progress[mode]; },

    /** A level is open if it was unlocked, or the level before it is completed (covers saves
     *  made when a mode had fewer levels). */
    isUnlocked(mode, n) {
      const p = data.progress[mode];
      return n <= p.unlocked || n === 1 || !!p.levels[n - 1];
    },

    levelResult(mode, n) { return data.progress[mode].levels[n] || null; },

    totalStars(mode) {
      return Object.values(data.progress[mode].levels).reduce((s, r) => s + (r.stars || 0), 0);
    },

    /** Records a win; returns {isBest, previous}. */
    recordWin(mode, n, { stars, moves, time }, levelCount) {
      const p = data.progress[mode];
      const prev = p.levels[n] || null;
      p.levels[n] = {
        stars: Math.max(stars, prev ? prev.stars : 0),
        bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
        bestTime: prev ? Math.min(prev.bestTime, time) : time,
      };
      p.unlocked = Math.min(Math.max(p.unlocked, n + 1), levelCount);
      data.current = null;
      SaveManager.persist();
      return { previous: prev, isBest: !prev || moves < prev.bestMoves || stars > prev.stars };
    },

    dailyResult(key) { return data.daily.results[key] || null; },

    recordDaily(key, { stars, moves, time }) {
      const prev = data.daily.results[key];
      data.daily.results[key] = {
        stars: Math.max(stars, prev ? prev.stars : 0),
        bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
        bestTime: prev ? Math.min(prev.bestTime, time) : time,
      };
      if (!prev) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = BP.LevelManager.dailyKey(yesterday);
        data.daily.streak = data.daily.lastDone === yKey ? data.daily.streak + 1 : 1;
        data.daily.lastDone = key;
      }
      data.current = null;
      SaveManager.persist();
    },

    cacheDaily(level) {
      data.daily.cache = { key: level.key, id: level.id, size: level.size, par: level.par, rows: level.rows, solution: level.solution };
      SaveManager.persist();
    },

    saveCurrent(current) { data.current = current; SaveManager.persist(); },
    clearCurrent() { data.current = null; SaveManager.persist(); },

    resetProgress() {
      const settings = data.settings;
      data = defaults();
      data.settings = settings;
      SaveManager.persist();
    },

    MODE_IDS,
  };

  BP.SaveManager = SaveManager;
})(window.BP = window.BP || {});
