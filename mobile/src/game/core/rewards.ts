/** Reward rules — 1:1 port of the web game's js/core/rewards.js (pure logic, no UI).
 * Works on the persisted reward state (save.rewards) plus an env describing the rest of the game.
 */
import type { GameTheme, RewardType, RewardsConfigT } from '../data/rewardsConfig';

export interface HistoryEntry {
  id: number;
  t: number;
  source: 'daily' | 'milestone' | 'shop' | 'ad';
  type: RewardType;
  item?: string;
  amount?: number;
  price?: number; // coins paid (shop)
}

export interface RewardState {
  coins: number;
  extraMoves: number;
  balls: string[]; // ball skins unlocked from gifts (stars unlock the rest)
  sounds: string[]; // rolling sounds unlocked from gifts (a ball's own sound comes with the ball)
  themes: string[]; // themes unlocked from gifts
  theme: string;
  rollSound: string; // '' = the selected ball's own sound
  milestonesClaimed: number;
  day: { key: string | null; opened: number };
  adDay: { key: string | null; count: number }; // coin ads watched today (ball shop)
  history: HistoryEntry[];
  seq: number;
}

export interface RewardEnv {
  cfg: RewardsConfigT;
  skins: { id: string; cost: number }[];
  stars: number;
}

export interface Reward {
  type: RewardType;
  item?: string;
  amount?: number;
}

export type DailyNext = { kind: 'ad'; opened: number } | { kind: 'coins'; cost: number; opened: number } | { kind: 'limit'; opened: number };

export function defaultTheme(cfg: RewardsConfigT): GameTheme {
  return cfg.themes.find((t) => t.default) || cfg.themes[0];
}

export const defaultRewardState = (cfg: RewardsConfigT): RewardState => ({
  coins: 0,
  extraMoves: 0,
  balls: [],
  sounds: [],
  themes: [],
  theme: defaultTheme(cfg).id,
  rollSound: '',
  milestonesClaimed: 0,
  day: { key: null, opened: 0 },
  adDay: { key: null, count: 0 },
  history: [],
  seq: 0,
});

// ---- ownership -------------------------------------------------------------
export function ballOwned(state: RewardState, skin: { id: string; cost: number }, stars: number): boolean {
  return stars >= skin.cost || state.balls.includes(skin.id);
}

export function soundOwned(state: RewardState, id: string, env: RewardEnv): boolean {
  if (state.sounds.includes(id)) return true;
  const skin = env.skins.find((s) => s.id === id);
  return !!skin && ballOwned(state, skin, env.stars);
}

export function themeOwned(state: RewardState, cfg: RewardsConfigT, id: string): boolean {
  const t = cfg.themes.find((x) => x.id === id);
  return !!t && (!!t.default || state.themes.includes(id));
}

/** Items of a cosmetic type the player does not own yet; null for moves / coins. */
export function eligibleItems(type: RewardType, state: RewardState, env: RewardEnv): string[] | null {
  if (type === 'ball') return env.skins.filter((s) => !ballOwned(state, s, env.stars)).map((s) => s.id);
  if (type === 'sound') return env.skins.filter((s) => !soundOwned(state, s.id, env)).map((s) => s.id);
  if (type === 'theme') return env.cfg.themes.filter((t) => !themeOwned(state, env.cfg, t.id)).map((t) => t.id);
  return null;
}

const randInt = (rand: () => number, [min, max]: [number, number]) => min + Math.floor(rand() * (max - min + 1));

/** Pick ONE reward. A cosmetic type with nothing left drops out, so duplicates are impossible. */
export function pickReward(source: 'daily' | 'milestone', state: RewardState, env: RewardEnv, rand: () => number = Math.random): Reward | null {
  const rules = env.cfg[source];
  const pool: { type: RewardType; w: number; items: string[] | null }[] = [];
  for (const [type, w] of Object.entries(rules.weights) as [RewardType, number][]) {
    if (!(w > 0)) continue;
    const items = eligibleItems(type, state, env);
    if (items && !items.length) continue;
    pool.push({ type, w, items });
  }
  if (!pool.length) return null;
  let r = rand() * pool.reduce((s, p) => s + p.w, 0);
  let chosen = pool[pool.length - 1];
  for (const p of pool) {
    if ((r -= p.w) < 0) {
      chosen = p;
      break;
    }
  }
  if (chosen.items) return { type: chosen.type, item: chosen.items[Math.floor(rand() * chosen.items.length)] };
  const range = chosen.type === 'coins' ? rules.coins : rules.moves;
  return { type: chosen.type, amount: randInt(rand, range || [1, 1]) };
}

/** Apply a reward and log it. Cosmetics already owned are refused (null). */
export function grant(reward: Reward | null, source: 'daily' | 'milestone', state: RewardState, env: RewardEnv, now = Date.now()): HistoryEntry | null {
  if (!reward) return null;
  if (reward.type === 'ball' || reward.type === 'sound' || reward.type === 'theme') {
    const items = eligibleItems(reward.type, state, env)!;
    if (!reward.item || !items.includes(reward.item)) return null;
    (reward.type === 'ball' ? state.balls : reward.type === 'sound' ? state.sounds : state.themes).push(reward.item);
  } else if (reward.type === 'coins') {
    state.coins += reward.amount || 0;
  } else if (reward.type === 'moves') {
    state.extraMoves += reward.amount || 0;
  } else {
    return null;
  }
  state.seq += 1;
  const entry: HistoryEntry = { id: state.seq, t: now, source, type: reward.type };
  if (reward.item) entry.item = reward.item;
  if (reward.amount) entry.amount = reward.amount;
  state.history.unshift(entry);
  state.history.length = Math.min(state.history.length, env.cfg.historyLimit || 30);
  return entry;
}

// ---- daily gifts -------------------------------------------------------------
/** A new day only starts when the date moves FORWARD (YYYY-MM-DD keys sort by date). Setting the
 *  device clock back keeps today's counts, so gifts and coin ads can't be farmed. */
const isNewDay = (stored: { key: string | null } | undefined, todayKey: string) => !stored || !stored.key || todayKey > stored.key;

export function rollDay(state: RewardState, todayKey: string) {
  if (isNewDay(state.day, todayKey)) state.day = { key: todayKey, opened: 0 };
  return state.day;
}

export function dailyCost(cfg: RewardsConfigT, opened: number): number {
  return Math.round(cfg.daily.baseCost * Math.pow(cfg.daily.costMultiplier, opened - 1));
}

export function dailyNext(state: RewardState, cfg: RewardsConfigT, todayKey: string): DailyNext {
  const opened = rollDay(state, todayKey).opened;
  if (cfg.daily.maxPerDay && opened >= cfg.daily.maxPerDay) return { kind: 'limit', opened };
  if (opened === 0) return { kind: 'ad', opened };
  return { kind: 'coins', cost: dailyCost(cfg, opened), opened };
}

// ---- ball shop & coin ads -------------------------------------------------------
function logEntry(state: RewardState, cfg: RewardsConfigT, entry: Omit<HistoryEntry, 'id' | 't'>, now: number): HistoryEntry {
  state.seq += 1;
  const e: HistoryEntry = { id: state.seq, t: now, ...entry };
  state.history.unshift(e);
  state.history.length = Math.min(state.history.length, cfg.historyLimit || 30);
  return e;
}

/** Coin price of a ball: config override, else star cost x coinsPerStar. */
export function ballPrice(cfg: RewardsConfigT, skin: { id: string; cost: number }): number {
  const o = cfg.shop.prices && cfg.shop.prices[skin.id];
  return o != null ? o : skin.cost * cfg.shop.coinsPerStar;
}

export type BuyResult = { ok: true; entry: HistoryEntry } | { ok: false; reason: 'owned' | 'coins' | 'state' | 'busy' };

/** Buy a locked ball at the price the player confirmed (nothing is charged if it changed). */
export function buyBall(state: RewardState, env: RewardEnv, id: string, expectedPrice: number, now = Date.now()): BuyResult {
  const skin = env.skins.find((s) => s.id === id);
  if (!skin) return { ok: false, reason: 'state' };
  if (ballOwned(state, skin, env.stars)) return { ok: false, reason: 'owned' };
  const price = ballPrice(env.cfg, skin);
  if (price !== expectedPrice) return { ok: false, reason: 'state' };
  if (state.coins < price) return { ok: false, reason: 'coins' };
  state.coins -= price;
  state.balls.push(id);
  return { ok: true, entry: logEntry(state, env.cfg, { source: 'shop', type: 'ball', item: id, price }, now) };
}

/** Coin ads left today; max 0 = unlimited. */
export function adCoinsStatus(state: RewardState, cfg: RewardsConfigT, todayKey: string) {
  if (isNewDay(state.adDay, todayKey)) state.adDay = { key: todayKey, count: 0 };
  const max = cfg.shop.adsPerDay || 0;
  return { max, left: max ? Math.max(0, max - state.adDay.count) : 99, coins: cfg.shop.adCoins };
}

/** Pay out one watched coin ad; null when today's limit is used up. */
export function grantAdCoins(state: RewardState, cfg: RewardsConfigT, todayKey: string, now = Date.now()): HistoryEntry | null {
  if (!adCoinsStatus(state, cfg, todayKey).left) return null;
  state.adDay.count += 1;
  state.coins += cfg.shop.adCoins;
  return logEntry(state, cfg, { source: 'ad', type: 'coins', amount: cfg.shop.adCoins }, now);
}

// ---- milestone gifts -----------------------------------------------------------
export function milestoneStatus(state: RewardState, cfg: RewardsConfigT, completed: number) {
  const every = cfg.milestone.every;
  const earned = Math.floor(completed / every);
  return {
    every,
    completed,
    available: Math.max(0, earned - state.milestonesClaimed),
    progress: completed % every,
    nextAt: (earned + 1) * every,
  };
}
