/** Reward service: coins, extra moves, milestone and daily gifts, themes and rolling sounds
 * (port of the web js/game/reward-manager.js). Rules live in game/core/rewards.ts; this module
 * connects them to storage and guards every claim so a gift can't be opened (or paid for) twice.
 */
import { REWARDS_CONFIG as cfg, type GameTheme, type RewardType } from '../game/data/rewardsConfig';
import { BALL_SKINS } from '../game/data/ballSkins';
import * as R from '../game/core/rewards';
import { LevelManager } from '../game/levelManager';
import { MODE_IDS, Storage } from './storage';

let busy = false; // one gift transaction at a time (double taps, ad callbacks, ...)
const busyListeners = new Set<(b: boolean) => void>();
const setBusy = (b: boolean) => {
  busy = b;
  busyListeners.forEach((fn) => fn(b));
};

export type OpenResult = { ok: true; entry: R.HistoryEntry } | { ok: false; reason: 'busy' | 'state' | 'ad' | 'coins' };

export const RewardService = {
  cfg,
  get state(): R.RewardState {
    return Storage.data.rewards;
  },
  get busy() {
    return busy;
  },
  subscribeBusy(fn: (b: boolean) => void) {
    busyListeners.add(fn);
    return () => busyListeners.delete(fn);
  },
  get coins() {
    return RewardService.state.coins;
  },
  get extraMoves() {
    return RewardService.state.extraMoves;
  },

  env(): R.RewardEnv {
    return { cfg, skins: BALL_SKINS, stars: Storage.allStars() };
  },

  /** Distinct levels completed across Classic, Challenge and Time Trial. */
  completedLevels(): number {
    return MODE_IDS.reduce((n, m) => n + Object.keys(Storage.modeProgress(m).levels).length, 0);
  },
  milestone() {
    return R.milestoneStatus(RewardService.state, cfg, RewardService.completedLevels());
  },
  dailyNext(): R.DailyNext {
    return R.dailyNext(RewardService.state, cfg, LevelManager.dailyKey());
  },
  /** Gifts ready right now (milestones + a free daily gift): the Home badge. */
  readyCount(): number {
    return RewardService.milestone().available + (RewardService.dailyNext().kind === 'ad' ? 1 : 0);
  },

  // ---- opening gifts -------------------------------------------------------------
  give(source: 'daily' | 'milestone'): R.HistoryEntry | null {
    const env = RewardService.env();
    const entry = R.grant(R.pickReward(source, RewardService.state, env), source, RewardService.state, env);
    Storage.persist();
    void Storage.flush(); // rewards and payments go to disk straight away
    return entry;
  },

  openMilestone(): R.HistoryEntry | null {
    if (busy || RewardService.milestone().available < 1) return null;
    setBusy(true);
    try {
      RewardService.state.milestonesClaimed += 1; // claimed before granting: never twice
      return RewardService.give('milestone');
    } finally {
      setBusy(false);
    }
  },

  /** First daily gift: `showAd` resolves true only when the rewarded ad was watched to the end. */
  async openDailyWithAd(showAd: () => Promise<boolean>): Promise<OpenResult> {
    if (busy) return { ok: false, reason: 'busy' };
    if (RewardService.dailyNext().kind !== 'ad') return { ok: false, reason: 'state' };
    setBusy(true);
    try {
      const watched = await showAd();
      if (!watched) return { ok: false, reason: 'ad' };
      if (RewardService.dailyNext().kind !== 'ad') return { ok: false, reason: 'state' };
      RewardService.state.day.opened += 1;
      const entry = RewardService.give('daily');
      return entry ? { ok: true, entry } : { ok: false, reason: 'state' };
    } finally {
      setBusy(false);
    }
  },

  /** Extra daily gift for coins; `expectedCost` is the price the player confirmed. */
  openDailyWithCoins(expectedCost: number): OpenResult {
    if (busy) return { ok: false, reason: 'busy' };
    const next = RewardService.dailyNext();
    if (next.kind !== 'coins' || next.cost !== expectedCost) return { ok: false, reason: 'state' };
    const s = RewardService.state;
    if (s.coins < next.cost) return { ok: false, reason: 'coins' };
    setBusy(true);
    try {
      s.coins -= next.cost;
      s.day.opened += 1;
      const entry = RewardService.give('daily');
      return entry ? { ok: true, entry } : { ok: false, reason: 'state' };
    } finally {
      setBusy(false);
    }
  },

  // ---- ball shop & coin ads ------------------------------------------------------------
  ballPrice(skin: { id: string; cost: number }) {
    return R.ballPrice(cfg, skin);
  },
  adCoins() {
    return R.adCoinsStatus(RewardService.state, cfg, LevelManager.dailyKey());
  },
  buyBall(id: string, expectedPrice: number): R.BuyResult {
    if (busy) return { ok: false, reason: 'busy' };
    setBusy(true);
    try {
      const res = R.buyBall(RewardService.state, RewardService.env(), id, expectedPrice);
      if (res.ok) {
        Storage.persist();
        void Storage.flush();
      }
      return res;
    } finally {
      setBusy(false);
    }
  },
  /** Rewarded ad for coins; `showAd` resolves true only when the ad was watched to the end. */
  async watchAdForCoins(showAd: () => Promise<boolean>): Promise<{ ok: true; entry: R.HistoryEntry } | { ok: false; reason: 'busy' | 'limit' | 'ad' }> {
    if (busy) return { ok: false, reason: 'busy' };
    if (!RewardService.adCoins().left) return { ok: false, reason: 'limit' };
    setBusy(true);
    try {
      if (!(await showAd())) return { ok: false, reason: 'ad' };
      const entry = R.grantAdCoins(RewardService.state, cfg, LevelManager.dailyKey());
      if (!entry) return { ok: false, reason: 'limit' };
      Storage.persist();
      void Storage.flush();
      return { ok: true, entry };
    } finally {
      setBusy(false);
    }
  },
  sourceLabel(e: R.HistoryEntry): string {
    if (e.source === 'milestone') return 'Milestone gift';
    if (e.source === 'shop') return `Bought for ${e.price} coins`;
    if (e.source === 'ad') return 'Watched an ad';
    return 'Daily gift';
  },

  // ---- earning / spending -----------------------------------------------------------
  addCoins(n: number): number {
    if (!(n > 0)) return 0;
    RewardService.state.coins += n;
    Storage.persist();
    return n;
  },

  /** Takes up to `extraMovesPerUse` moves from the inventory; returns how many were taken. */
  takeExtraMoves(): number {
    const s = RewardService.state;
    const n = Math.min(cfg.extraMovesPerUse, s.extraMoves);
    if (n <= 0) return 0;
    s.extraMoves -= n;
    Storage.persist();
    return n;
  },

  // ---- cosmetics ------------------------------------------------------------------------
  isSoundOwned(id: string) {
    return R.soundOwned(RewardService.state, id, RewardService.env());
  },
  isThemeOwned(id: string) {
    return R.themeOwned(RewardService.state, cfg, id);
  },
  theme(): GameTheme {
    const t = cfg.themes.find((x) => x.id === RewardService.state.theme);
    return t && RewardService.isThemeOwned(t.id) ? t : R.defaultTheme(cfg);
  },
  setTheme(id: string): boolean {
    if (!RewardService.isThemeOwned(id)) return false;
    RewardService.state.theme = id;
    Storage.persist();
    return true;
  },
  /** Rolling sound in use: the chosen one, or the selected ball's own sound. */
  rollSoundId(): string {
    const id = RewardService.state.rollSound;
    return id && RewardService.isSoundOwned(id) ? id : Storage.selectedBall().id;
  },
  setRollSound(id: string): boolean {
    if (id && !RewardService.isSoundOwned(id)) return false;
    RewardService.state.rollSound = id || '';
    Storage.persist();
    return true;
  },

  describe(e: { type: RewardType; item?: string; amount?: number }) {
    const type = cfg.types[e.type];
    let name = '';
    const skin = e.item ? BALL_SKINS.find((s) => s.id === e.item) : undefined;
    if (e.type === 'ball') name = skin?.name ?? '';
    else if (e.type === 'sound') name = (skin?.name ?? '') + ' sound';
    else if (e.type === 'theme') name = cfg.themes.find((t) => t.id === e.item)?.name ?? '';
    else if (e.type === 'coins') name = `${e.amount} Coins`;
    else if (e.type === 'moves') name = `+${e.amount} Extra Moves`;
    return { label: type.label, name, art: type.art };
  },
};
