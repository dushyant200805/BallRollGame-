/* Ball Path — reward rules (pure logic, no DOM, unit-tested in Node; ported 1:1 to the
 * native app in mobile/src/game/core/rewards.ts).
 *
 * All functions work on the persisted reward state (save.rewards):
 *   { coins, extraMoves, balls[], sounds[], themes[], theme, rollSound,
 *     milestonesClaimed, day: {key, opened}, history[], seq }
 * and an `env` describing the rest of the game:
 *   { cfg: RewardsConfig, skins: [{id, name, cost}], stars: total stars }
 */
(function (BP) {
  'use strict';

  const COSMETIC = ['ball', 'sound', 'theme'];

  const defaultState = (cfg) => ({
    coins: 0,
    extraMoves: 0,
    balls: [],   // ball skins unlocked from gifts (stars unlock the rest)
    sounds: [],  // rolling sounds unlocked from gifts (a ball's own sound comes with the ball)
    themes: [],  // themes unlocked from gifts
    theme: defaultTheme(cfg).id,
    rollSound: '', // '' = use the selected ball's own sound
    milestonesClaimed: 0,
    day: { key: null, opened: 0 },
    history: [],
    seq: 0,
  });

  function defaultTheme(cfg) { return cfg.themes.find((t) => t.default) || cfg.themes[0]; }

  // ---- ownership -------------------------------------------------------------
  function ballOwned(state, skin, stars) { return stars >= skin.cost || state.balls.includes(skin.id); }

  function soundOwned(state, id, env) {
    if (state.sounds.includes(id)) return true;
    const skin = env.skins.find((s) => s.id === id);
    return !!skin && ballOwned(state, skin, env.stars);
  }

  function themeOwned(state, cfg, id) {
    const t = cfg.themes.find((x) => x.id === id);
    return !!t && (!!t.default || state.themes.includes(id));
  }

  /** Items of a cosmetic type the player does not own yet (what a gift may give). */
  function eligibleItems(type, state, env) {
    if (type === 'ball') return env.skins.filter((s) => !ballOwned(state, s, env.stars)).map((s) => s.id);
    if (type === 'sound') return env.skins.filter((s) => !soundOwned(state, s.id, env)).map((s) => s.id);
    if (type === 'theme') return env.cfg.themes.filter((t) => !themeOwned(state, env.cfg, t.id)).map((t) => t.id);
    return null; // moves / coins: always available
  }

  const randInt = (rand, [min, max]) => min + Math.floor(rand() * (max - min + 1));

  /**
   * Pick ONE reward for a gift. Types are drawn by weight; a cosmetic type with nothing left to
   * unlock drops out (so duplicates are impossible). Returns {type, item?, amount?} or null if
   * nothing at all is eligible.
   */
  function pickReward(source, state, env, rand = Math.random) {
    const rules = env.cfg[source];
    const pool = [];
    for (const [type, w] of Object.entries(rules.weights)) {
      if (!(w > 0)) continue;
      const items = eligibleItems(type, state, env);
      if (items && !items.length) continue; // all owned: choose another eligible reward
      pool.push({ type, w, items });
    }
    if (!pool.length) return null;
    let r = rand() * pool.reduce((s, p) => s + p.w, 0);
    let chosen = pool[pool.length - 1];
    for (const p of pool) { if ((r -= p.w) < 0) { chosen = p; break; } }
    if (chosen.items) return { type: chosen.type, item: chosen.items[Math.floor(rand() * chosen.items.length)] };
    return { type: chosen.type, amount: randInt(rand, rules[chosen.type] || [1, 1]) };
  }

  /** Apply a reward to the state and log it. Cosmetics already owned are refused (returns null). */
  function grant(reward, source, state, env, now = Date.now()) {
    if (!reward) return null;
    if (reward.type === 'ball' || reward.type === 'sound' || reward.type === 'theme') {
      const items = eligibleItems(reward.type, state, env);
      if (!items.includes(reward.item)) return null;
      state[reward.type + 's'].push(reward.item);
    } else if (reward.type === 'coins') {
      state.coins += reward.amount;
    } else if (reward.type === 'moves') {
      state.extraMoves += reward.amount;
    } else {
      return null;
    }
    state.seq += 1;
    const entry = { id: state.seq, t: now, source, type: reward.type };
    if (reward.item) entry.item = reward.item;
    if (reward.amount) entry.amount = reward.amount;
    state.history.unshift(entry);
    state.history.length = Math.min(state.history.length, env.cfg.historyLimit || 30);
    return entry;
  }

  // ---- daily gifts -------------------------------------------------------------
  /** Start a fresh counter when the date changes. */
  function rollDay(state, todayKey) {
    if (!state.day || state.day.key !== todayKey) state.day = { key: todayKey, opened: 0 };
    return state.day;
  }

  /** Coin cost of the n-th extra gift of the day (n = gifts already opened, n >= 1). */
  function dailyCost(cfg, opened) {
    return Math.round(cfg.daily.baseCost * Math.pow(cfg.daily.costMultiplier, opened - 1));
  }

  /** What opening the next daily gift needs: {kind: 'ad'} | {kind: 'coins', cost} | {kind: 'limit'}. */
  function dailyNext(state, cfg, todayKey) {
    const opened = rollDay(state, todayKey).opened;
    if (cfg.daily.maxPerDay && opened >= cfg.daily.maxPerDay) return { kind: 'limit', opened };
    if (opened === 0) return { kind: 'ad', opened };
    return { kind: 'coins', cost: dailyCost(cfg, opened), opened };
  }

  // ---- milestone gifts -----------------------------------------------------------
  function milestoneStatus(state, cfg, completed) {
    const every = cfg.milestone.every;
    const earned = Math.floor(completed / every);
    return {
      every,
      completed,
      available: Math.max(0, earned - state.milestonesClaimed),
      progress: completed % every,         // levels toward the next gift
      nextAt: (earned + 1) * every,
    };
  }

  const Rewards = {
    COSMETIC, defaultState, defaultTheme,
    ballOwned, soundOwned, themeOwned, eligibleItems,
    pickReward, grant,
    rollDay, dailyCost, dailyNext, milestoneStatus,
  };

  BP.Rewards = Rewards;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rewards;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
