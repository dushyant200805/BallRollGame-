/* Ball Path — Level manager: level lookup, difficulty tiers, mode rules, daily puzzle. */
(function (BP) {
  'use strict';

  const TIERS = [
    { name: 'Beginner', from: 1, to: 10, color: '#4cc38a' },
    { name: 'Easy', from: 11, to: 30, color: '#3fa7e0' },
    { name: 'Medium', from: 31, to: 60, color: '#f0a83a' },
    { name: 'Hard', from: 61, to: 100, color: '#e8644a' },
    { name: 'Expert', from: 101, to: Infinity, color: '#a35ee0' },
  ];

  const MODES = {
    classic: { id: 'classic', label: 'Classic', desc: 'Play the levels in order. Fewer moves earn more stars.' },
    challenge: { id: 'challenge', label: 'Challenge', desc: 'Every level has a strict move limit.' },
    timetrial: { id: 'timetrial', label: 'Time Trial', desc: 'Beat the clock before it runs out.' },
    daily: { id: 'daily', label: 'Daily', desc: 'A fresh puzzle every day.' },
  };

  const DAILY_CFG = {
    size: 6, pathMin: 8, pathMax: 11, empties: 2, blocks: 2, decoyRatio: 0.55,
    fixedOnPath: 1, scramble: 16, parMin: 6, parMax: 9, maxNodes: 300000, maxAttempts: 120,
  };

  const pad = (n) => String(n).padStart(2, '0');

  const LevelManager = {
    TIERS,
    MODES,

    count() { return (BP.LEVEL_DATA || []).length; },

    /** 1-based level lookup. */
    get(n) {
      const data = BP.LEVEL_DATA[n - 1];
      if (!data) return null;
      return { ...data, number: n, tier: LevelManager.tierOf(n) };
    },

    tierOf(n) { return TIERS.find((t) => n >= t.from && n <= t.to) || TIERS[TIERS.length - 1]; },

    /** Mode-specific constraints for a level. */
    limitsFor(mode, level) {
      if (mode === 'challenge') return { moveLimit: level.par + Math.max(3, Math.ceil(level.par * 0.6)) };
      if (mode === 'timetrial') return { timeLimit: Math.round(20 + level.par * 7 + level.size * 2) };
      return {};
    },

    dailyKey(date = new Date()) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

    dailyLabel(key) {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },

    /** Deterministic daily puzzle for a date key (YYYY-MM-DD). */
    getDaily(key, cached) {
      if (cached && cached.key === key && Array.isArray(cached.rows)) {
        return { ...cached, number: 0, tier: { name: 'Daily', color: '#f06aa8' } };
      }
      const res = BP.Generator.generate(DAILY_CFG, 'ballpath-daily-' + key);
      if (!res) return null;
      return {
        key, id: 'daily-' + key, size: DAILY_CFG.size, par: res.par, rows: res.rows,
        solution: res.solution.map((m) => [m.x, m.y, m.dir]),
        number: 0, tier: { name: 'Daily', color: '#f06aa8' },
      };
    },
  };

  BP.LevelManager = LevelManager;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
