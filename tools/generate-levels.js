/* Generates js/data/levels.js — run: node tools/generate-levels.js [mode] [count]
 *   node tools/generate-levels.js            all modes, 20 levels each
 *   node tools/generate-levels.js challenge  regenerate one mode (others kept from the file)
 *
 * Every mode has its own level set with its own style and difficulty curve:
 *   classic    gentle teaching ramp, 2 empty slots, grows to big 7x7 boards
 *   challenge  sliding-puzzle style: ONE empty slot, many bolted tiles and blocks,
 *              deep scrambles (par 6 → 22+)
 *   timetrial  wide-open boards: 3 empty slots, lots of decoy pipes to scan quickly
 *
 * Every level is produced from a seed, scrambled with legal moves only (always solvable),
 * and its par is the BFS-proven minimum number of moves. Re-running gives the same levels.
 */
const fs = require('fs');
const path = require('path');
const BP = require('./load-core')();

const COUNT = 20;
const lerp = (a, b, t) => a + (b - a) * t;

// Hand-tuned ramp for the first classic levels (unchanged, so existing saves stay valid).
const CLASSIC_START = [
  { size: 5, pathMin: 4, pathMax: 5, empties: 3, decoyRatio: 0.25, scramble: 2, parMin: 1, parMax: 1 },
  { size: 5, pathMin: 5, pathMax: 6, empties: 3, decoyRatio: 0.3, scramble: 3, parMin: 2, parMax: 2 },
  { size: 5, pathMin: 5, pathMax: 7, empties: 2, decoyRatio: 0.4, scramble: 5, parMin: 3, parMax: 3 },
  { size: 5, pathMin: 6, pathMax: 7, empties: 2, decoyRatio: 0.4, fixedOnPath: 1, scramble: 6, parMin: 3, parMax: 4 },
  { size: 5, pathMin: 6, pathMax: 8, empties: 2, blocks: 1, decoyRatio: 0.5, fixedOnPath: 1, scramble: 8, parMin: 4, parMax: 5 },
  { size: 5, pathMin: 7, pathMax: 9, empties: 2, blocks: 1, decoyRatio: 0.5, fixedOnPath: 1, scramble: 10, parMin: 5, parMax: 6 },
  { size: 6, pathMin: 7, pathMax: 9, empties: 3, blocks: 1, decoyRatio: 0.5, fixedOnPath: 1, scramble: 10, parMin: 5, parMax: 6 },
  { size: 6, pathMin: 8, pathMax: 10, empties: 2, blocks: 2, decoyRatio: 0.55, fixedOnPath: 1, scramble: 12, parMin: 6, parMax: 7 },
  { size: 6, pathMin: 8, pathMax: 11, empties: 2, blocks: 2, decoyRatio: 0.55, fixedOnPath: 2, scramble: 14, parMin: 7, parMax: 8 },
  { size: 6, pathMin: 9, pathMax: 12, empties: 2, blocks: 2, decoyRatio: 0.6, fixedOnPath: 2, scramble: 16, parMin: 8, parMax: 9 },
];

const PLANS = {
  classic(n) {
    if (n <= CLASSIC_START.length) return CLASSIC_START[n - 1];
    const t = (n - 11) / (COUNT - 11);               // 0 → 1 over levels 11–20
    const par = Math.round(lerp(9, 16, t));
    const size = n <= 14 ? 6 : 7;
    return {
      size, pathMin: size + 3, pathMax: size + 8, empties: 2, blocks: size === 7 ? 3 : 2,
      decoyRatio: 0.65, fixedOnPath: n <= 14 ? 2 : 3, fixedDecoyChance: n > 16 ? 0.1 : 0,
      scramble: par * 3, parMin: par, parMax: par + 2, maxNodes: 2500000, maxAttempts: 200,
    };
  },
  challenge(n) {
    const t = (n - 1) / (COUNT - 1);
    const par = Math.round(lerp(6, 22, t));
    const size = n <= 5 ? 5 : 6;
    return {
      size, pathMin: size + 2, pathMax: size + 8, empties: 1, blocks: n <= 5 ? 1 : 2,
      decoyRatio: 0.7, fixedOnPath: Math.min(1 + Math.floor(n / 5), 4),
      fixedDecoyChance: lerp(0.05, 0.2, t),
      scramble: par * 5, parMin: par, parMax: par + 3, maxNodes: 2000000, maxAttempts: 300,
    };
  },
  timetrial(n) {
    const t = (n - 1) / (COUNT - 1);
    const par = Math.round(lerp(4, 13, t));
    const size = n <= 4 ? 6 : 7;
    return {
      size, pathMin: size + 2, pathMax: size + 9, empties: 3, blocks: n <= 4 ? 1 : 2,
      decoyRatio: lerp(0.65, 0.85, t), fixedOnPath: Math.min(1 + Math.floor(n / 7), 3),
      fixedDecoyChance: n > 10 ? 0.1 : 0,
      scramble: par * 3, parMin: par, parMax: par + 1, maxNodes: 2500000, maxAttempts: 200,
    };
  },
};

const seedFor = (mode, n) => (mode === 'classic' ? 'ballpath-level-' + n : `ballpath-${mode}-${n}`);
const idFor = (mode, n) => (mode === 'classic' ? n : `${mode}-${n}`);

const target = path.join(__dirname, '..', 'js', 'data', 'levels.js');
const onlyMode = process.argv[2] && PLANS[process.argv[2]] ? process.argv[2] : null;
const count = parseInt(process.argv[onlyMode ? 3 : 2] || COUNT, 10);

// Keep the other modes when regenerating only one.
let sets = {};
if (onlyMode && fs.existsSync(target)) {
  const prev = {};
  new Function('globalThis', 'window', fs.readFileSync(target, 'utf8'))(prev, undefined);
  sets = (prev.BP && prev.BP.LEVEL_SETS) || {};
}

for (const mode of Object.keys(PLANS)) {
  if (onlyMode && mode !== onlyMode) continue;
  const levels = [];
  for (let n = 1; n <= count; n++) {
    const cfg = PLANS[mode](n);
    const t0 = Date.now();
    const res = BP.Generator.generate(cfg, seedFor(mode, n));
    if (!res) {
      console.error(`${mode} ${n}: generation failed`);
      process.exit(1);
    }
    levels.push({
      id: idFor(mode, n), size: cfg.size, par: res.par, rows: res.rows,
      solution: res.solution.map((m) => [m.x, m.y, m.dir]),
    });
    console.log(`${mode.padEnd(9)} ${String(n).padStart(3)}  ${cfg.size}x${cfg.size}  empties ${cfg.empties}  par ${String(res.par).padStart(2)}  (${Date.now() - t0} ms)`);
  }
  sets[mode] = levels;
}

const fmt = (l) => `    {
      id: ${JSON.stringify(l.id)}, size: ${l.size}, par: ${l.par},
      rows: [
${l.rows.map((r) => `        ${JSON.stringify(r)},`).join('\n')}
      ],
      solution: ${JSON.stringify(l.solution)},
    },`;

const out = `/* Ball Path — level data. GENERATED by tools/generate-levels.js — do not edit by hand.
 * One set per mode. rows: tile tokens (see js/core/tiles.js); par: BFS-proven minimum
 * moves; solution: [x, y, dirBit] slides from the initial layout.
 */
(function (BP) {
  'use strict';
  BP.LEVEL_SETS = {
${Object.keys(sets).map((m) => `   ${m}: [\n${sets[m].map(fmt).join('\n')}\n   ],`).join('\n')}
  };
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
`;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log(`Wrote ${Object.keys(sets).map((m) => `${m}: ${sets[m].length}`).join(', ')} to ${path.relative(process.cwd(), target)}`);
