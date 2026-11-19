/* Ball Path — reward manager: coins, extra moves, milestone and daily gifts, themes and
 * rolling sounds. Game rules live in js/core/rewards.js; this module connects them to the
 * save file and guards every claim so a gift can't be opened (or paid for) twice.
 */
(function (BP) {
  'use strict';
  const { Rewards, RewardsConfig: cfg, SaveManager, LevelManager } = BP;

  let busy = false; // one gift transaction at a time (double taps, ad callbacks, etc.)

  const RewardManager = {
    cfg,
    get state() { return SaveManager.data.rewards; },
    get busy() { return busy; },
    get coins() { return RewardManager.state.coins; },
    get extraMoves() { return RewardManager.state.extraMoves; },

    env() { return { cfg, skins: BP.BallSkins.SKINS, stars: SaveManager.allStars() }; },

    /** Art URL for a config art key (placeholder files in assets/rewards/). */
    artUrl(key) { return 'assets/rewards/' + (cfg.art[key] || key) + '.svg'; },

    /** Distinct levels completed across Classic, Challenge and Time Trial. */
    completedLevels() {
      return SaveManager.MODE_IDS.reduce((n, m) => n + Object.keys(SaveManager.modeProgress(m).levels).length, 0);
    },

    milestone() { return Rewards.milestoneStatus(RewardManager.state, cfg, RewardManager.completedLevels()); },
    dailyNext() { return Rewards.dailyNext(RewardManager.state, cfg, LevelManager.dailyKey()); },

    /** Gifts ready to open right now (milestones + a free daily gift): drives the Home badge. */
    readyCount() {
      return RewardManager.milestone().available + (RewardManager.dailyNext().kind === 'ad' ? 1 : 0);
    },

    // ---- opening gifts -----------------------------------------------------------
    /** Picks and grants one reward, saving straight away. */
    _give(source) {
      const env = RewardManager.env();
      const reward = Rewards.pickReward(source, RewardManager.state, env);
      const entry = Rewards.grant(reward, source, RewardManager.state, env);
      SaveManager.persist();
      return entry;
    },

    openMilestone() {
      if (busy || RewardManager.milestone().available < 1) return null;
      busy = true;
      try {
        RewardManager.state.milestonesClaimed += 1; // claimed before granting: never twice
        return RewardManager._give('milestone');
      } finally { busy = false; }
    },

    /** First daily gift: shows the rewarded ad (`showAd` resolves true when watched to the end). */
    async openDailyWithAd(showAd) {
      if (busy || RewardManager.dailyNext().kind !== 'ad') return { ok: false, reason: 'state' };
      busy = true;
      try {
        const watched = await showAd();
        if (!watched) return { ok: false, reason: 'ad' };
        if (RewardManager.dailyNext().kind !== 'ad') return { ok: false, reason: 'state' }; // re-check after the ad
        RewardManager.state.day.opened += 1;
        return { ok: true, entry: RewardManager._give('daily') };
      } finally { busy = false; }
    },

    /** Extra daily gift for coins. `expectedCost` is the price the player confirmed: if it no
     *  longer matches (e.g. the day rolled over) nothing is charged. */
    openDailyWithCoins(expectedCost) {
      if (busy) return { ok: false, reason: 'busy' };
      const next = RewardManager.dailyNext();
      if (next.kind !== 'coins' || next.cost !== expectedCost) return { ok: false, reason: 'state' };
      const s = RewardManager.state;
      if (s.coins < next.cost) return { ok: false, reason: 'coins' };
      busy = true;
      try {
        s.coins -= next.cost;
        s.day.opened += 1;
        return { ok: true, entry: RewardManager._give('daily') };
      } finally { busy = false; }
    },

    // ---- ball shop & coin ads -------------------------------------------------------
    ballPrice(skin) { return Rewards.ballPrice(cfg, skin); },
    adCoins() { return Rewards.adCoinsStatus(RewardManager.state, cfg, LevelManager.dailyKey()); },

    buyBall(id, expectedPrice) {
      if (busy) return { ok: false, reason: 'busy' };
      busy = true;
      try {
        const res = Rewards.buyBall(RewardManager.state, RewardManager.env(), id, expectedPrice);
        if (res.ok) SaveManager.persist();
        return res;
      } finally { busy = false; }
    },

    /** Rewarded ad for coins; `showAd` resolves true only when the ad was watched to the end. */
    async watchAdForCoins(showAd) {
      if (busy) return { ok: false, reason: 'busy' };
      if (!RewardManager.adCoins().left) return { ok: false, reason: 'limit' };
      busy = true;
      try {
        if (!(await showAd())) return { ok: false, reason: 'ad' };
        const entry = Rewards.grantAdCoins(RewardManager.state, cfg, LevelManager.dailyKey());
        if (!entry) return { ok: false, reason: 'limit' };
        SaveManager.persist();
        return { ok: true, entry };
      } finally { busy = false; }
    },

    // ---- earning / spending ---------------------------------------------------------
    addCoins(n) {
      if (!(n > 0)) return 0;
      RewardManager.state.coins += n;
      SaveManager.persist();
      return n;
    },

    /** Takes up to `extraMovesPerUse` moves from the inventory; returns how many were taken. */
    takeExtraMoves() {
      const s = RewardManager.state;
      const n = Math.min(cfg.extraMovesPerUse, s.extraMoves);
      if (n <= 0) return 0;
      s.extraMoves -= n;
      SaveManager.persist();
      return n;
    },

    // ---- cosmetics ---------------------------------------------------------------------
    isBallOwned(skin) { return Rewards.ballOwned(RewardManager.state, skin, SaveManager.allStars()); },
    isSoundOwned(id) { return Rewards.soundOwned(RewardManager.state, id, RewardManager.env()); },
    isThemeOwned(id) { return Rewards.themeOwned(RewardManager.state, cfg, id); },

    theme() {
      const s = RewardManager.state;
      const t = cfg.themes.find((x) => x.id === s.theme);
      return t && RewardManager.isThemeOwned(t.id) ? t : Rewards.defaultTheme(cfg);
    },
    setTheme(id) {
      if (!RewardManager.isThemeOwned(id)) return false;
      RewardManager.state.theme = id;
      SaveManager.persist();
      return true;
    },

    /** Rolling sound in use: the chosen one, or the selected ball's own sound. */
    rollSoundId() {
      const id = RewardManager.state.rollSound;
      return id && RewardManager.isSoundOwned(id) ? id : SaveManager.selectedBall().id;
    },
    setRollSound(id) {
      if (id && !RewardManager.isSoundOwned(id)) return false;
      RewardManager.state.rollSound = id || '';
      SaveManager.persist();
      return true;
    },

    /** Display text for a reward / history entry. */
    describe(entry) {
      const type = cfg.types[entry.type] || { label: entry.type, art: 'gift' };
      let name = '';
      if (entry.type === 'ball') name = BP.BallSkins.get(entry.item).name;
      else if (entry.type === 'sound') { const sk = BP.BallSkins.get(entry.item); name = sk.name + ' sound'; }
      else if (entry.type === 'theme') name = (cfg.themes.find((t) => t.id === entry.item) || {}).name || entry.item;
      else if (entry.type === 'coins') name = entry.amount + ' Coins';
      else if (entry.type === 'moves') name = '+' + entry.amount + ' Extra Moves';
      return { label: type.label, name, art: type.art };
    },

    /** Where a history entry came from. */
    sourceLabel(entry) {
      if (entry.source === 'milestone') return 'Milestone gift';
      if (entry.source === 'shop') return 'Bought for ' + entry.price + ' coins';
      if (entry.source === 'ad') return 'Watched an ad';
      return 'Daily gift';
    },
  };

  BP.RewardManager = RewardManager;
})(window.BP = window.BP || {});
