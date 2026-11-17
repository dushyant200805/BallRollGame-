/* Ball Path — UI manager: screens, overlays, HUD, level grid, settings. All buttons are wired here. */
(function (BP) {
  'use strict';
  const { LevelManager, SaveManager, AudioManager } = BP;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const fmtTime = (sec) => {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  let toastTimer = null;
  let confirmResolve = null;
  let levelsMode = 'classic';
  let settingsReturn = null;
  let adResolve = null;
  let adTimer = null;
  let rewardShown = null; // history entry shown in the reward dialog

  const UI = {
    currentScreen: 'home',

    init() {
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        UI.handle(el.dataset.action, el);
      });
      $$('[data-setting]').forEach((input) => {
        input.addEventListener('change', () => UI.setSetting(input.dataset.setting, input.checked));
      });
      $$('[data-volume]').forEach((input) => {
        const name = input.dataset.volume;
        input.addEventListener('input', () => {
          const v = input.value / 100;
          SaveManager.setVolume(name, v);
          AudioManager.setVolumes({ [name]: v });
          UI.syncVolumeLabel(name);
        });
        // a short sample when the slider is released, so the level can be judged
        input.addEventListener('change', () => {
          AudioManager.unlock();
          if (name === 'roll') AudioManager.playPreview(SaveManager.selectedBall().id);
          else if (name !== 'music') AudioManager.play('connect');
        });
      });
      // Close overlays with Escape / pause with P or Escape in game.
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if ($('#overlay-confirm').classList.contains('open')) UI.resolveConfirm(false);
          else if ($('#overlay-ad').classList.contains('open')) UI.closeAd(false);
          else if ($('#overlay-reward').classList.contains('open')) { if (!$('#btn-reward-close').disabled) UI.closeReward(); }
          else if ($('#overlay-settings').classList.contains('open')) UI.closeSettings();
          else if ($('#overlay-pause').classList.contains('open')) BP.Engine.resume();
          else if (UI.currentScreen === 'game' && !UI.overlayOpen()) BP.Engine.pause();
        } else if (UI.currentScreen === 'game' && !UI.overlayOpen()) {
          const k = e.key.toLowerCase();
          if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); BP.Engine.undo(); }
          else if (k === 'u') BP.Engine.undo();
          else if (k === 'r') BP.Engine.restart();
          else if (k === 'h') BP.Engine.hint();
          else if (k === ' ' || k === 'enter') { e.preventDefault(); BP.Engine.roll(); }
        }
      });
      UI.syncAudioIcons();
    },

    handle(action, el) {
      AudioManager.unlock();
      const quiet = ['undo', 'restart', 'roll', 'hint', 'toggle-sound', 'ball-preview'];
      if (!quiet.includes(action)) AudioManager.play('click');
      const E = BP.Engine;
      switch (action) {
        case 'play': UI.playContinue(); break;
        case 'levels': UI.showLevels(SaveManager.data.lastMode === 'daily' ? 'classic' : SaveManager.data.lastMode || 'classic'); break;
        case 'mode': UI.showLevels(el.dataset.mode); break;
        case 'daily': E.startDaily(); break;
        case 'home': UI.showScreen('home'); break;
        case 'tab': UI.renderLevels(el.dataset.mode); break;
        case 'balls': UI.showScreen('balls'); break;
        case 'ball-preview': UI.toggleBallPreview(el.dataset.ball); break;
        case 'ball-use': UI.useBall(el.dataset.ball); break;
        case 'gifts': UI.showScreen('gifts'); break;
        case 'open-daily': UI.openDailyGift(); break;
        case 'open-milestone': UI.openMilestoneGift(); break;
        case 'win-gift': UI.openMilestoneGift(); break;
        case 'reward-close': UI.closeReward(); break;
        case 'reward-use': UI.useReward(); break;
        case 'ad-close': UI.closeAd(false); break;
        case 'ad-claim': UI.closeAd(true); break;
        case 'theme-use': UI.useTheme(el.dataset.theme); break;
        case 'sound-use': UI.useSound(el.dataset.sound); break;
        case 'use-moves': E.useExtraMoves(); break;
        case 'level': E.startLevel(el.dataset.mode, +el.dataset.n); break;
        case 'settings': UI.openSettings(); break;
        case 'close-settings': UI.closeSettings(); break;
        case 'toggle-sound': UI.setSetting('sound', !SaveManager.settings.sound); if (SaveManager.settings.sound) AudioManager.play('click'); break;
        case 'toggle-music': UI.setSetting('music', !SaveManager.settings.music); break;
        case 'set-anim': UI.setSetting('animations', el.dataset.value); break;
        case 'reset-progress':
          UI.confirm('Reset all progress?', 'Stars, unlocked levels, best scores, coins and gift rewards will be erased. Settings are kept.', 'Reset').then((yes) => {
            if (!yes) return;
            SaveManager.resetProgress();
            UI.toast('Progress reset');
            UI.renderHome();
          });
          break;
        case 'confirm-yes': UI.resolveConfirm(true); break;
        case 'confirm-no': UI.resolveConfirm(false); break;
        // game
        case 'pause': E.pause(); break;
        case 'resume': E.resume(); break;
        case 'undo': E.undo(); break;
        case 'restart': E.restart(); break;
        case 'hint': E.hint(); break;
        case 'roll': E.roll(); break;
        case 'quit-levels': E.quit(); UI.showLevels(E.mode === 'daily' ? 'classic' : E.mode); break;
        case 'quit-home': E.quit(); UI.showScreen('home'); break;
        case 'next': E.next(); break;
        case 'replay': E.replay(); break;
        case 'win-menu': UI.closeAllOverlays(); if (E.mode === 'daily') UI.showScreen('home'); else UI.showLevels(E.mode); break;
        case 'fail-continue': UI.closeOverlay('fail'); break;
        case 'fail-retry': E.restart(); break;
        default: break;
      }
    },

    // ---- screens ------------------------------------------------------------
    showScreen(name) {
      if ((UI.currentScreen === 'balls' || UI.currentScreen === 'gifts') && name !== UI.currentScreen) AudioManager.stopPreview();
      UI.currentScreen = name;
      $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
      if (name === 'home') UI.renderHome();
      if (name === 'balls') UI.renderBalls();
      if (name === 'gifts') UI.renderGifts();
    },

    // ---- gifts & rewards ---------------------------------------------------------
    renderGifts() {
      const RM = BP.RewardManager;
      const coins = RM.coins;
      $('#gifts-coins span').textContent = coins;
      $('#wallet-coins').textContent = coins;
      $('#wallet-moves').textContent = RM.extraMoves;

      // daily gift
      const next = RM.dailyNext();
      const btn = $('#btn-open-daily');
      btn.disabled = RM.busy;
      btn.removeAttribute('aria-label');
      btn.classList.toggle('btn-gold', next.kind === 'coins');
      if (next.kind === 'ad') {
        btn.innerHTML = '<i class="bi bi-play-btn-fill"></i>Watch ad to open';
        $('#daily-gift-desc').textContent = "Today's first gift is free: watch a short ad to open it.";
      } else if (next.kind === 'coins') {
        btn.innerHTML = 'Open for <img class="btn-coin" src="' + RM.artUrl('coins') + '" alt="">' + next.cost;
        btn.setAttribute('aria-label', 'Open another gift for ' + next.cost + ' coins');
        $('#daily-gift-desc').textContent = 'Want more? Open another gift with coins. The price doubles with each gift and resets tomorrow.';
      } else {
        btn.textContent = 'Come back tomorrow';
        btn.disabled = true;
        $('#daily-gift-desc').textContent = "You've opened every gift for today.";
      }
      $('#daily-gift-meta').textContent = 'Opened today: ' + next.opened +
        (next.kind === 'coins' && coins < next.cost ? ' \u00b7 You need ' + (next.cost - coins) + ' more coins' : '');

      // milestone gift
      const m = RM.milestone();
      const fill = m.available ? 1 : m.progress / m.every;
      $('#milestone-fill').style.width = Math.round(fill * 100) + '%';
      $('#milestone-text').textContent = m.available
        ? m.available + ' gift' + (m.available > 1 ? 's' : '') + ' ready!'
        : m.progress + ' / ' + m.every + ' levels';
      const bar = $('#milestone-bar');
      bar.setAttribute('aria-valuemax', String(m.every));
      bar.setAttribute('aria-valuenow', String(m.available ? m.every : m.progress));
      const mb = $('#btn-open-milestone');
      const left = m.every - m.progress;
      mb.disabled = !m.available || RM.busy;
      mb.innerHTML = m.available ? '<i class="bi bi-gift-fill"></i>Open milestone gift'
        : '<i class="bi bi-lock-fill"></i>Clear ' + left + ' more level' + (left > 1 ? 's' : '');

      // themes
      const themeGrid = $('#theme-grid');
      themeGrid.innerHTML = '';
      const current = RM.theme().id;
      RM.cfg.themes.forEach((t) => {
        const owned = RM.isThemeOwned(t.id);
        const isCur = t.id === current;
        const b = document.createElement('button');
        b.className = 'theme-card' + (owned ? '' : ' locked') + (isCur ? ' selected' : '');
        b.style.setProperty('--t1', t.bg[0]);
        b.style.setProperty('--t2', t.bg[1]);
        b.style.setProperty('--tray', t.tray[0]);
        if (owned && !isCur) { b.dataset.action = 'theme-use'; b.dataset.theme = t.id; }
        if (!owned) b.disabled = true;
        b.setAttribute('aria-label', t.name + (isCur ? ', in use' : owned ? ', tap to use' : ', locked, win it from a gift'));
        b.innerHTML = '<span class="theme-swatch"><i></i></span><span class="theme-name">' + t.name + '</span>' +
          '<span class="theme-state">' + (isCur ? '<i class="bi bi-check-lg"></i> In use' : owned ? 'Use' : '<i class="bi bi-lock-fill"></i> Gift') + '</span>';
        themeGrid.appendChild(b);
      });

      // rolling sounds
      const list = $('#sound-list');
      list.innerHTML = '';
      const ball = SaveManager.selectedBall();
      const rollSel = RM.state.rollSound && RM.isSoundOwned(RM.state.rollSound) ? RM.state.rollSound : '';
      const row = (id, title, sub, owned, selected) => {
        const pid = id || ball.id;
        const playing = AudioManager.previewing === pid;
        const d = document.createElement('div');
        d.className = 'sound-row' + (owned ? '' : ' locked') + (selected ? ' selected' : '');
        d.innerHTML = '<div class="sound-info"><b>' + title + '</b><small>' + sub + '</small></div>' +
          (owned ? '<button class="preview-btn' + (playing ? ' playing' : '') + '" data-action="ball-preview" data-ball="' + pid +
            '" aria-label="Preview ' + title + '" aria-pressed="' + playing + '"><i class="bi ' + (playing ? 'bi-stop-fill' : 'bi-play-fill') + '"></i></button>' : '') +
          '<button class="use-btn" ' + (owned && !selected ? 'data-action="sound-use" data-sound="' + id + '"' : 'disabled') +
          ' aria-label="' + (selected ? title + ' in use' : owned ? 'Use ' + title : title + ', locked') + '">' +
          (selected ? '<i class="bi bi-check-lg"></i> In use' : owned ? 'Use' : '<i class="bi bi-lock-fill"></i>') + '</button>';
        list.appendChild(d);
      };
      row('', "Ball's own sound", ball.name + ' \u00b7 ' + ball.sound, true, rollSel === '');
      BP.BallSkins.SKINS.forEach((sk) => {
        const owned = RM.isSoundOwned(sk.id);
        row(sk.id, sk.name, sk.sound + (owned ? '' : ' \u00b7 unlock the ball or win it from a gift'), owned, rollSel === sk.id);
      });

      // history
      const hist = $('#gift-history');
      hist.innerHTML = '';
      if (!RM.state.history.length) hist.innerHTML = '<li class="empty">No gifts opened yet.</li>';
      RM.state.history.slice(0, 15).forEach((h) => {
        const d = RM.describe(h);
        const li = document.createElement('li');
        li.innerHTML = '<img src="' + RM.artUrl(d.art) + '" alt=""><div><b>' + d.name + '</b><small>' +
          (h.source === 'milestone' ? 'Milestone gift' : 'Daily gift') + ' \u00b7 ' + new Date(h.t).toLocaleDateString() + '</small></div>';
        hist.appendChild(li);
      });
    },

    async openDailyGift() {
      const RM = BP.RewardManager;
      if (RM.busy) return;
      const next = RM.dailyNext();
      let res;
      if (next.kind === 'ad') {
        res = await RM.openDailyWithAd(() => UI.showAd());
        if (!res.ok && res.reason === 'ad') UI.toast('Watch the whole ad to get the gift.');
      } else if (next.kind === 'coins') {
        if (RM.coins < next.cost) { UI.toast('Not enough coins. This gift costs ' + next.cost + ' coins.'); return; }
        const yes = await UI.confirm('Open another gift?',
          'This gift costs ' + next.cost + ' coins. You have ' + RM.coins + ' coins.', 'Spend ' + next.cost, { icon: 'coin', tone: 'gold' });
        if (!yes) return;
        res = RM.openDailyWithCoins(next.cost);
        if (!res.ok) UI.toast(res.reason === 'coins' ? 'Not enough coins.' : 'The price changed. Please try again.');
      } else return;
      if (UI.currentScreen === 'gifts') UI.renderGifts();
      if (res && res.ok) UI.showReward(res.entry);
    },

    openMilestoneGift() {
      const entry = BP.RewardManager.openMilestone();
      $('#btn-win-gift').hidden = true;
      if (UI.currentScreen === 'gifts') UI.renderGifts();
      if (entry) UI.showReward(entry);
    },

    /** Placeholder rewarded ad: resolves true only when it was watched to the end.
     *  Replace with an ad network SDK later; RewardManager only needs this promise. */
    showAd() {
      let left = BP.RewardsConfig.ad.seconds;
      const timer = $('#ad-timer');
      const claim = $('#btn-ad-claim');
      claim.disabled = true;
      timer.textContent = 'Reward in ' + left + 's';
      UI.openOverlay('ad');
      clearInterval(adTimer);
      adTimer = setInterval(() => {
        left -= 1;
        if (left > 0) { timer.textContent = 'Reward in ' + left + 's'; return; }
        clearInterval(adTimer);
        timer.textContent = 'Reward unlocked';
        claim.disabled = false;
        claim.focus();
      }, 1000);
      return new Promise((resolve) => { adResolve = resolve; });
    },

    closeAd(claimed) {
      if (claimed && $('#btn-ad-claim').disabled) return;
      clearInterval(adTimer);
      UI.closeOverlay('ad');
      const r = adResolve;
      adResolve = null;
      if (r) r(!!claimed);
    },

    showReward(entry) {
      const RM = BP.RewardManager;
      const d = RM.describe(entry);
      rewardShown = entry;
      const stage = $('#reward-stage');
      const art = $('#reward-art');
      art.innerHTML = '';
      if (entry.type === 'ball') {
        const c = document.createElement('canvas');
        art.appendChild(c);
        UI.paintBall(c, BP.BallSkins.get(entry.item), 130);
      } else if (entry.type === 'theme') {
        const t = RM.cfg.themes.find((x) => x.id === entry.item);
        art.innerHTML = '<span class="theme-swatch big" style="--t1:' + t.bg[0] + ';--t2:' + t.bg[1] + ';--tray:' + t.tray[0] + '"><i></i></span>';
      } else {
        art.innerHTML = '<img src="' + RM.artUrl(d.art) + '" alt="">';
      }
      $('#reward-label').textContent = 'Opening\u2026';
      $('#reward-title').textContent = '';
      $('#btn-reward-use').hidden = true;
      $('#btn-reward-close').disabled = true;
      stage.classList.remove('revealed');
      UI.openOverlay('reward');
      AudioManager.play('hint');
      const delay = SaveManager.settings.animations === 'reduced' ? 150 : 1100;
      setTimeout(() => {
        stage.classList.add('revealed');
        AudioManager.play('win');
        $('#reward-label').textContent = 'You got: ' + d.label;
        $('#reward-title').textContent = d.name;
        const canUse = entry.type === 'ball' || entry.type === 'theme' || entry.type === 'sound';
        const use = $('#btn-reward-use');
        use.hidden = !canUse;
        use.textContent = entry.type === 'theme' ? 'Use this theme' : entry.type === 'sound' ? 'Use this sound' : 'Use this ball';
        $('#btn-reward-close').disabled = false;
        (canUse ? use : $('#btn-reward-close')).focus();
      }, delay);
    },

    useReward() {
      const e = rewardShown;
      if (!e) return;
      if (e.type === 'ball') { SaveManager.setBall(e.item); BP.Engine.applyBall(); }
      if (e.type === 'theme') UI.useTheme(e.item, true);
      if (e.type === 'sound') UI.useSound(e.item, true);
      UI.toast(BP.RewardManager.describe(e).name + ' is now in use');
      UI.closeReward();
    },

    closeReward() {
      UI.closeOverlay('reward');
      rewardShown = null;
      if (UI.currentScreen === 'gifts') UI.renderGifts();
      if (UI.currentScreen === 'home') UI.renderHome();
    },

    useTheme(id, quiet) {
      if (!BP.RewardManager.setTheme(id)) return;
      BP.Engine.applyTheme();
      if (UI.currentScreen === 'gifts') UI.renderGifts();
      if (!quiet) UI.toast(BP.RewardManager.theme().name + ' theme on');
    },

    useSound(id, quiet) {
      if (!BP.RewardManager.setRollSound(id)) return;
      BP.Engine.applyBall();
      if (UI.currentScreen === 'gifts') UI.renderGifts();
      if (!quiet) UI.toast(id ? BP.BallSkins.get(id).name + ' sound selected' : "Using the ball's own sound");
    },

    // ---- ball collection ---------------------------------------------------------
    /** Draw a skin into a canvas (CSS size `css` px), crisp on high-DPI screens. */
    paintBall(canvas, skin, css, rot = 0.6) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, css, css);
      // same ball size for every skin; glow halos simply extend around it
      BP.BallPainter.drawBall(c, skin, css / 2, css / 2 - css * 0.04, css * 0.33, rot, 1, 0, 1);
    },

    unlockedBallCount() {
      return BP.BallSkins.SKINS.filter((s) => SaveManager.isBallOwned(s)).length;
    },

    renderBalls() {
      const stars = SaveManager.allStars();
      const selected = SaveManager.selectedBall().id;
      $('#balls-stars span').textContent = stars;
      SaveManager.data.ballsSeen = UI.unlockedBallCount();
      SaveManager.persist();
      const grid = $('#ball-grid');
      grid.innerHTML = '';
      const playing = AudioManager.previewing;
      BP.BallSkins.COLLECTIONS.forEach((col) => {
        const head = document.createElement('div');
        head.className = 'tier-head';
        head.style.setProperty('--tier', col === 'Basic' ? '#4cc38a' : col === 'Premium' ? '#a35ee0' : '#f0a83a');
        head.innerHTML = col + ' <small>Collection</small>';
        grid.appendChild(head);
        const cards = document.createElement('div');
        cards.className = 'ball-cards';
        BP.BallSkins.SKINS.filter((s) => s.collection === col).forEach((skin) => {
          const unlocked = SaveManager.isBallOwned(skin);
          const isSel = skin.id === selected;
          const isPlaying = playing === skin.id;
          const card = document.createElement('div');
          card.className = 'ball-card' + (unlocked ? '' : ' locked') + (isSel ? ' selected' : '');
          const lock = unlocked ? '' :
            '<span class="lock-tag"><i class="bi bi-lock-fill"></i>' + skin.cost + '<i class="bi bi-star-fill"></i></span>';
          const useLabel = unlocked ? (isSel ? skin.name + ' selected' : 'Use ' + skin.name)
            : skin.name + ', locked, needs ' + skin.cost + ' stars';
          const useText = isSel ? '<i class="bi bi-check-lg"></i> In use' : unlocked ? 'Use' : 'Need ' + (skin.cost - stars) + ' \u2605';
          card.innerHTML = lock +
            '<canvas aria-hidden="true"></canvas>' +
            '<h3>' + skin.name + '</h3>' +
            '<div class="ball-sound">' + skin.sound + '</div>' +
            '<div class="ball-actions">' +
              '<button class="use-btn" data-action="ball-use" data-ball="' + skin.id + '"' + (unlocked && !isSel ? '' : ' disabled') +
                ' aria-label="' + useLabel + '">' + useText + '</button>' +
              '<button class="preview-btn' + (isPlaying ? ' playing' : '') + '" data-action="ball-preview" data-ball="' + skin.id + '"' +
                ' aria-label="Preview ' + skin.name + ' sound" aria-pressed="' + isPlaying + '">' +
                '<i class="bi ' + (isPlaying ? 'bi-stop-fill' : 'bi-play-fill') + '"></i></button>' +
            '</div>';
          cards.appendChild(card);
          UI.paintBall(card.querySelector('canvas'), skin, 76);
        });
        grid.appendChild(cards);
      });
    },

    setPreviewButton(id, playing) {
      $$('.preview-btn[data-ball="' + id + '"]').forEach((btn) => {
        btn.classList.toggle('playing', playing);
        btn.setAttribute('aria-pressed', String(playing));
        btn.querySelector('.bi').className = 'bi ' + (playing ? 'bi-stop-fill' : 'bi-play-fill');
      });
    },

    toggleBallPreview(id) {
      if (AudioManager.previewing === id) { AudioManager.stopPreview(); UI.setPreviewButton(id, false); return; }
      if (AudioManager.previewing) UI.setPreviewButton(AudioManager.previewing, false);
      if (!SaveManager.settings.sound) { UI.toast('Sound effects are off. Turn them on in Settings to hear previews.'); return; }
      const ok = AudioManager.playPreview(id, (endedId) => UI.setPreviewButton(endedId, false));
      if (ok) UI.setPreviewButton(id, true);
      else UI.toast('Sound is unavailable in this browser.');
    },

    useBall(id) {
      const skin = BP.BallSkins.get(id);
      if (!SaveManager.isBallOwned(skin)) return;
      SaveManager.setBall(id);
      BP.Engine.applyBall();
      UI.renderBalls();
      UI.toast(skin.name + ' selected');
    },

    playContinue() {
      const cur = SaveManager.data.current;
      if (cur && cur.mode === 'classic' && SaveManager.isUnlocked('classic', cur.number)) {
        BP.Engine.startLevel('classic', cur.number);
        return;
      }
      BP.Engine.startLevel('classic', UI.nextLevelFor('classic'), { resume: false });
    },

    /** First unlocked level without a result, else the highest unlocked. */
    nextLevelFor(mode) {
      const p = SaveManager.modeProgress(mode);
      for (let n = 1; n <= p.unlocked; n++) if (!p.levels[n]) return n;
      return Math.min(p.unlocked, LevelManager.count(mode));
    },

    renderHome() {
      const cur = SaveManager.data.current;
      const n = cur && cur.mode === 'classic' ? cur.number : UI.nextLevelFor('classic');
      const allDone = Object.keys(SaveManager.modeProgress('classic').levels).length >= LevelManager.count('classic');
      $('#home-play-sub').textContent = cur && cur.mode === 'classic' ? `Continue level ${n}` : allDone ? 'All levels complete!' : `Level ${n}`;
      const total = SaveManager.MODE_IDS.reduce((s, m) => s + SaveManager.totalStars(m), 0);
      $('#home-stars span').textContent = total;
      $('#home-coins span').textContent = BP.RewardManager.coins;
      const ready = BP.RewardManager.readyCount();
      $('#gifts-badge').hidden = !ready;
      $('#gifts-badge').textContent = ready;
      UI.paintBall($('#home-ball-icon'), SaveManager.selectedBall(), 36);
      $('#balls-badge').hidden = UI.unlockedBallCount() <= (SaveManager.data.ballsSeen || 1);
      const badge = $('#daily-badge');
      const done = SaveManager.dailyResult(LevelManager.dailyKey());
      badge.hidden = false;
      badge.textContent = done ? '✓ Done' : 'New';
      badge.classList.toggle('done', !!done);
      UI.syncAudioIcons();
    },

    showLevels(mode) {
      UI.showScreen('levels');
      UI.renderLevels(mode);
    },

    renderLevels(mode) {
      levelsMode = mode;
      $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
      $('#mode-desc').textContent = LevelManager.MODES[mode].desc;
      $('#levels-stars span').textContent = `${SaveManager.totalStars(mode)} / ${LevelManager.count(mode) * 3}`;
      const grid = $('#level-grid');
      grid.innerHTML = '';
      const current = UI.nextLevelFor(mode);
      const count = LevelManager.count(mode);
      LevelManager.tiersFor(mode).forEach((tier) => {
        if (tier.from > count) return;
        const to = Math.min(tier.to, count);
        const head = document.createElement('div');
        head.className = 'tier-head';
        head.style.setProperty('--tier', tier.color);
        head.innerHTML = `${tier.name} <small>Levels ${tier.from}–${to}</small>`;
        grid.appendChild(head);
        const g = document.createElement('div');
        g.className = 'level-grid';
        for (let n = tier.from; n <= to; n++) {
          const btn = document.createElement('button');
          const unlocked = SaveManager.isUnlocked(mode, n);
          const res = SaveManager.levelResult(mode, n);
          btn.className = 'level-btn';
          if (!unlocked) {
            btn.classList.add('locked');
            btn.disabled = true;
            btn.setAttribute('aria-label', `Level ${n}, locked`);
            btn.innerHTML = '<i class="bi bi-lock-fill lock" aria-hidden="true"></i>';
          } else {
            btn.dataset.action = 'level';
            btn.dataset.mode = mode;
            btn.dataset.n = n;
            const stars = res ? res.stars : 0;
            btn.setAttribute('aria-label', `Level ${n}${res ? `, ${stars} stars` : ''}`);
            btn.innerHTML = `<span class="lv-num">${n}</span><span class="lv-stars" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="bi bi-star-fill${i < stars ? ' on' : ''}"></i>`).join('')}</span>`;
            if (res) btn.classList.add('done');
            if (n === current && !res) btn.classList.add('current');
          }
          g.appendChild(btn);
        }
        grid.appendChild(g);
      });
      const cur = grid.querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    },

    // ---- HUD ------------------------------------------------------------------
    setupHud(session, level, mode, dailyKey) {
      const title = mode === 'daily' ? `Daily · ${LevelManager.dailyLabel(dailyKey)}` : `Level ${level.number}`;
      $('#hud-title').textContent = title;
      const chip = $('#hud-tier');
      const modeLabel = mode === 'classic' || mode === 'daily' ? '' : LevelManager.MODES[mode].label + ' · ';
      chip.textContent = modeLabel + level.tier.name;
      chip.style.setProperty('--tier', level.tier.color);
      $('#hud-target-label').textContent = mode === 'challenge' ? 'Moves left' : 'Par';
      $('#hud-target-icon').className = 'bi ' + (mode === 'challenge' ? 'bi-lightning-charge-fill' : 'bi-flag-fill');
      $('#hud-time-label').textContent = mode === 'timetrial' ? 'Time left' : 'Time';
      UI.setControlsEnabled(true);
      UI.syncAudioIcons();
    },

    updateHud(session) {
      $('#hud-moves').textContent = session.moves;
      const target = $('#hud-target');
      const stat = target.closest('.stat');
      const extra = $('#hud-extra');
      const have = BP.RewardManager.extraMoves;
      extra.hidden = !session.moveLimit || !have;
      extra.querySelector('span').textContent = Math.min(BP.RewardManager.cfg.extraMovesPerUse, have);
      extra.setAttribute('aria-label', 'Use extra moves (' + have + ' left)');
      if (session.moveLimit) {
        target.textContent = session.movesLeft;
        stat.classList.toggle('warn', session.movesLeft <= 2);
        stat.classList.add('limit');
      } else {
        target.textContent = session.level.par;
        stat.classList.remove('warn', 'limit');
      }
      $('#btn-roll').classList.toggle('ready', session.connection.ok);
      $('[data-action="undo"].ctrl').disabled = !session.history.length;
      UI.updateTime(session);
    },

    updateTime(session) {
      const el = $('#hud-time');
      const stat = $('#hud-time-stat');
      if (session.timeLimit) {
        el.textContent = fmtTime(session.timeLeft);
        stat.classList.toggle('warn', session.timeLeft <= 10 && session.state === 'playing');
      } else {
        el.textContent = fmtTime(Math.floor(session.elapsed));
        stat.classList.remove('warn');
      }
    },

    setControlsEnabled(on) {
      $$('.controls .ctrl').forEach((b) => { b.disabled = !on; });
      if (on && BP.Engine.session) $('[data-action="undo"].ctrl').disabled = !BP.Engine.session.history.length;
    },

    status(text, kind) {
      const el = $('#status-line');
      el.textContent = text;
      el.className = 'status-line' + (kind ? ' ' + kind : '');
    },

    // ---- overlays ---------------------------------------------------------------
    openOverlay(name) { $('#overlay-' + name).classList.add('open'); },
    closeOverlay(name) { $('#overlay-' + name).classList.remove('open'); },
    closeAllOverlays() { $$('.overlay.open').forEach((o) => o.classList.remove('open')); },
    overlayOpen() { return !!document.querySelector('.overlay.open'); },

    showWin({ stars, moves, time, par, best, isBest, hasNext, mode, isLast, hintsUsed, coins, giftReady }) {
      $('#win-coins').hidden = !coins;
      $('#win-coins span').textContent = '+' + coins + ' coins for your first clear';
      $('#btn-win-gift').hidden = !giftReady;
      $('#win-title').textContent = mode === 'daily' ? 'Daily Solved!' : isLast ? 'Final Level Cleared!' : 'Level Complete!';
      $('#win-moves').textContent = mode === 'challenge' || mode === 'classic' || mode === 'daily' ? `${moves} / ${par}` : moves;
      $('#win-time').textContent = fmtTime(time);
      $('#win-best').textContent = best;
      let note = '';
      if (isBest) note = 'New best score!';
      else if (moves <= par) note = 'Perfect! You matched par.';
      else if (stars < 3) note = mode === 'timetrial' ? 'Finish faster for more stars.' : `Solve it in ${par} moves for 3 stars.`;
      if (hintsUsed && !note) note = `Solved with ${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}.`;
      $('#win-note').textContent = note;
      $('#btn-next').hidden = !hasNext && mode !== 'daily';
      $('#btn-next-label').textContent = mode === 'daily' ? 'Home' : 'Next';
      $('#btn-win-menu').textContent = mode === 'daily' ? 'Home' : 'Level select';
      $('#btn-win-menu').hidden = mode === 'daily';
      const els = $$('#win-stars .wstar');
      els.forEach((e) => e.classList.remove('on'));
      UI.openOverlay('win');
      const delay = SaveManager.settings.animations === 'reduced' ? 60 : 320;
      [0, 1, 2].forEach((i) => {
        if (i < stars) {
          setTimeout(() => {
            els[i].classList.add('on');
            AudioManager.play('star', i);
          }, 300 + i * delay);
        }
      });
    },

    showFail({ title, msg, canContinue, icon, extraMoves }) {
      const fm = $('#btn-fail-moves');
      const have = BP.RewardManager.extraMoves;
      fm.hidden = !extraMoves || !have;
      fm.querySelector('span').textContent = 'Use +' + Math.min(BP.RewardManager.cfg.extraMovesPerUse, have) + ' Extra Moves (' + have + ' left)';
      $('#fail-icon').className = 'bi ' + (icon || 'bi-exclamation-octagon-fill');
      $('#fail-title').textContent = title;
      $('#fail-msg').textContent = msg;
      $('#btn-fail-continue').hidden = !canContinue;
      UI.openOverlay('fail');
    },

    openSettings() {
      settingsReturn = $('#overlay-pause').classList.contains('open') ? 'pause' : null;
      if (settingsReturn) UI.closeOverlay('pause');
      UI.syncSettings();
      UI.openOverlay('settings');
    },

    closeSettings() {
      UI.closeOverlay('settings');
      if (settingsReturn) UI.openOverlay(settingsReturn);
      settingsReturn = null;
    },

    syncVolumeLabel(name) {
      const out = document.querySelector('[data-volume-out="' + name + '"]');
      if (out) out.textContent = Math.round(SaveManager.settings.volumes[name] * 100) + '%';
    },

    syncSettings() {
      const s = SaveManager.settings;
      $$('[data-setting]').forEach((i) => { i.checked = !!s[i.dataset.setting]; });
      $$('[data-volume]').forEach((i) => {
        i.value = Math.round(s.volumes[i.dataset.volume] * 100);
        UI.syncVolumeLabel(i.dataset.volume);
      });
      $$('[data-action="set-anim"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === s.animations)));
    },

    setSetting(name, value) {
      SaveManager.setSetting(name, value);
      if (name === 'sound') AudioManager.setSound(value);
      if (name === 'music') AudioManager.setMusic(value);
      if (name === 'animations') BP.Engine.applySettings();
      if (name === 'vibration' && value) BP.Engine.vibrate(30);
      UI.syncSettings();
      UI.syncAudioIcons();
    },

    syncAudioIcons() {
      const s = SaveManager.settings;
      ['#home-sound', '#game-sound'].forEach((id) => {
        const b = $(id);
        b.querySelector('.bi').className = 'bi ' + (s.sound ? 'bi-volume-up-fill' : 'bi-volume-mute-fill');
        b.classList.toggle('off', !s.sound);
        b.setAttribute('aria-pressed', String(!!s.sound));
      });
      const m = $('#home-music');
      m.classList.toggle('off', !s.music); // CSS draws a slash over the note when off
      m.setAttribute('aria-pressed', String(!!s.music));
    },

    confirm(title, msg, yesLabel = 'Yes', opts = {}) {
      const icon = $('#confirm-icon');
      icon.className = 'panel-icon ' + (opts.tone === 'gold' ? 'win' : 'fail');
      icon.innerHTML = opts.icon === 'coin' ? '<img src="' + BP.RewardManager.artUrl('coins') + '" alt="">' : '<i class="bi bi-exclamation-triangle-fill"></i>';
      $('#confirm-yes').className = 'btn ' + (opts.tone === 'gold' ? 'btn-primary' : 'btn-danger');
      $('#confirm-title').textContent = title;
      $('#confirm-msg').textContent = msg;
      $('#confirm-yes').textContent = yesLabel;
      UI.openOverlay('confirm');
      return new Promise((resolve) => { confirmResolve = resolve; });
    },

    resolveConfirm(value) {
      UI.closeOverlay('confirm');
      if (confirmResolve) confirmResolve(value);
      confirmResolve = null;
    },

    toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
    },

    get levelsMode() { return levelsMode; },
  };

  BP.UI = UI;
})(window.BP = window.BP || {});
