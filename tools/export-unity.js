/* Exports the game data for the Unity (C#) version into unity/Assets/Resources/Data/*.json.
 *   node tools/export-unity.js
 * The shapes are flattened for Unity's JsonUtility, which can't read nested arrays or maps:
 *   solutions become flat [x, y, dir, x, y, dir, ...] lists, and maps become {key, value} lists.
 * daily-expected.json holds Daily puzzles made by the JS generator, so the C# port can be
 * checked to produce exactly the same puzzle for each date.
 */
const fs = require('fs');
const path = require('path');
const loadCore = require('./load-core');

const BP = loadCore({ withLevels: true });
const root = path.join(__dirname, '..');
const out = path.join(root, 'unity', 'Assets', 'Resources', 'Data');
fs.mkdirSync(out, { recursive: true });
const write = (name, obj) => {
  fs.writeFileSync(path.join(out, name), JSON.stringify(obj, null, 1));
  console.log('Wrote', path.relative(root, path.join(out, name)));
};

// ---- levels ----
const LM = BP.LevelManager;
const modes = ['classic', 'challenge', 'timetrial'].map((mode) => ({
  id: mode,
  label: LM.MODES[mode].label,
  desc: LM.MODES[mode].desc,
  tiers: LM.tiersFor(mode).map((t) => ({ name: t.name, from: t.from, to: t.to === Infinity ? 9999 : t.to, color: t.color })),
  levels: LM.setFor(mode).map((l) => ({
    id: l.id, size: l.size, par: l.par, rows: l.rows, solution: [].concat(...l.solution),
  })),
}));
write('levels.json', { modes });

// ---- Daily puzzles from the JS generator (C# must match) ----
const dates = ['2026-01-01', '2026-06-15', '2026-11-19', '2027-02-28'];
write('daily-expected.json', {
  days: dates.map((key) => {
    const d = LM.getDaily(key, null);
    return { key, par: d.par, rows: d.rows, solution: [].concat(...d.solution) };
  }),
});

// ---- ball skins ----
const { SKINS, DEFAULT, COLLECTIONS } = require(path.join(root, 'js', 'data', 'ball-skins.js'));
write('ball-skins.json', {
  defaultBall: DEFAULT,
  collections: COLLECTIONS,
  skins: SKINS.map((s) => ({
    id: s.id, name: s.name, collection: s.collection, cost: s.cost, sound: s.sound,
    body: s.body, alpha: s.alpha == null ? 1 : s.alpha,
    haloColor: s.halo ? s.halo[0] : '', haloSize: s.halo ? s.halo[1] : 0,
    bands: s.bands || [], dots: s.dots || [], sweep: s.sweep || [], twinkle: s.twinkle || [],
    spec: s.spec == null ? 0.7 : s.spec,
  })),
});

// ---- rewards config ----
const cfg = require(path.join(root, 'js', 'data', 'rewards-config.js'));
const weights = (w) => Object.entries(w).map(([type, weight]) => ({ type, weight }));
write('rewards-config.json', {
  firstClearCoins: cfg.firstClearCoins,
  extraMovesPerUse: cfg.extraMovesPerUse,
  milestone: { every: cfg.milestone.every, weights: weights(cfg.milestone.weights), coins: cfg.milestone.coins, moves: cfg.milestone.moves },
  daily: {
    baseCost: cfg.daily.baseCost, costMultiplier: cfg.daily.costMultiplier, maxPerDay: cfg.daily.maxPerDay,
    weights: weights(cfg.daily.weights), coins: cfg.daily.coins, moves: cfg.daily.moves,
  },
  shop: {
    coinsPerStar: cfg.shop.coinsPerStar, adCoins: cfg.shop.adCoins, adsPerDay: cfg.shop.adsPerDay,
    prices: Object.entries(cfg.shop.prices || {}).map(([id, price]) => ({ id, price })),
  },
  extraMovesAd: cfg.extraMovesAd,
  historyLimit: cfg.historyLimit,
  types: Object.entries(cfg.types).map(([type, t]) => ({ type, label: t.label, art: t.art })),
  themes: cfg.themes.map((t) => ({ id: t.id, name: t.name, isDefault: !!t.default, bg: t.bg, glow: t.glow, tray: t.tray })),
});
