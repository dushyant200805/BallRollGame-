/* Ball Path — reward system configuration (shared by the web game and, via
 * mobile/scripts/convert-levels.js, the native app).
 *
 * Everything that is likely to be tuned lives here: reward types, amounts, coin costs,
 * unlock probabilities (weights), game themes and the art used for each reward.
 *
 *   weights   relative chance of each reward type. A cosmetic type (ball / sound / theme)
 *             whose items are all owned already drops out and the roll is made again among
 *             the remaining types, so a gift never gives a duplicate cosmetic.
 *   coins / moves   [min, max] amount (inclusive) for that gift.
 *   art       file names in assets/rewards/ (web) — the native app embeds the same files.
 *             The current art is PLACEHOLDER: swap the files (same names) for final designs.
 */
(function (BP) {
  'use strict';

  const RewardsConfig = {
    /** Coins earned the first time a level (or a day's Daily puzzle) is solved. 0 turns it off. */
    firstClearCoins: 5,

    /** Moves added each time the player uses Extra Moves (Challenge mode). */
    extraMovesPerUse: 3,

    /** A gift after every `every` completed levels (all modes count, each level once). */
    milestone: {
      every: 10,
      weights: { ball: 25, sound: 20, theme: 15, moves: 20, coins: 20 },
      coins: [50, 120],
      moves: [3, 6],
    },

    /** Daily gifts: the first one each day is opened by watching a rewarded ad; every further
     *  gift that day costs coins, doubling each time (25, 50, 100, 200 ...). */
    daily: {
      baseCost: 25,
      costMultiplier: 2,
      maxPerDay: 0, // 0 = unlimited
      weights: { ball: 15, sound: 15, theme: 10, moves: 30, coins: 30 },
      coins: [15, 45],
      moves: [2, 4],
    },

    /** Ball shop on the Ball Collection screen: buy a locked ball with coins, and watch
     *  rewarded ads to earn coins. */
    shop: {
      coinsPerStar: 5,  // a ball's coin price = its star cost x this (Golden 15 stars = 75 coins)
      prices: {},       // per-ball price overrides, e.g. { glow: 999 }
      adCoins: 25,      // coins for watching one rewarded ad to the end
      adsPerDay: 2,     // coin ads per day (0 = unlimited); resets each day
    },

    /** Placeholder rewarded ad (stands in for an ad network until one is integrated). */
    ad: {
      seconds: 5,       // length of the placeholder ad
      loadMs: 900,      // simulated loading time
      simulate: 'ok',   // 'ok' | 'fail' | 'offline' (QA: web also accepts ?ad=fail / ?ad=offline)
    },

    /** Out of moves: watch a rewarded ad for extra moves (limited per level attempt). */
    extraMovesAd: { moves: 3, perLevel: 1 },

    /** How many opened gifts the history keeps. */
    historyLimit: 30,

    /** Reward types: label and art for each. */
    types: {
      ball: { label: 'New Ball', art: 'ball' },
      sound: { label: 'New Rolling Sound', art: 'sound' },
      theme: { label: 'New Game Theme', art: 'theme' },
      moves: { label: 'Extra Moves', art: 'moves' },
      coins: { label: 'Coins', art: 'coins' },
    },

    art: {
      gift: 'gift-box',
      dailyPoster: 'poster-daily',
      milestonePoster: 'poster-milestone',
      adPoster: 'ad-poster',
      coins: 'coins',
      moves: 'moves',
      ball: 'ball',
      sound: 'sound',
      theme: 'theme',
    },

    /** Game themes: background gradient, the two soft glows and the wooden board tray.
     *  The `default` theme is always owned; the others are unlocked from gifts. */
    themes: [
      { id: 'midnight', name: 'Midnight Blue', default: true,
        bg: ['#1e3d58', '#0f1e2e'], glow: ['rgba(255,204,120,0.12)', 'rgba(47,196,182,0.14)'], tray: ['#8a5530', '#4b2a13'] },
      { id: 'sunset', name: 'Sunset Glow',
        bg: ['#7a3b5e', '#2b1430'], glow: ['rgba(255,170,90,0.22)', 'rgba(255,90,120,0.16)'], tray: ['#9a5a34', '#552814'] },
      { id: 'forest', name: 'Deep Forest',
        bg: ['#2f5a3a', '#0f2416'], glow: ['rgba(220,255,150,0.14)', 'rgba(60,200,140,0.16)'], tray: ['#7a5a32', '#3e2a12'] },
      { id: 'candy', name: 'Candy Pop',
        bg: ['#b0508f', '#4a2a7a'], glow: ['rgba(255,220,240,0.2)', 'rgba(120,220,255,0.2)'], tray: ['#c0705a', '#7a3a3a'] },
      { id: 'space', name: 'Outer Space',
        bg: ['#26245a', '#07061a'], glow: ['rgba(170,140,255,0.18)', 'rgba(80,200,255,0.14)'], tray: ['#5a4a6a', '#2a2036'] },
      { id: 'desert', name: 'Desert Sand',
        bg: ['#b07a3e', '#4a2c14'], glow: ['rgba(255,236,170,0.2)', 'rgba(255,150,80,0.16)'], tray: ['#8a4a26', '#4a220e'] },
    ],
  };

  BP.RewardsConfig = RewardsConfig;
  if (typeof module !== 'undefined' && module.exports) module.exports = RewardsConfig;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
