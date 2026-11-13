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
        case 'level': E.startLevel(el.dataset.mode, +el.dataset.n); break;
        case 'settings': UI.openSettings(); break;
        case 'close-settings': UI.closeSettings(); break;
        case 'toggle-sound': UI.setSetting('sound', !SaveManager.settings.sound); if (SaveManager.settings.sound) AudioManager.play('click'); break;
        case 'toggle-music': UI.setSetting('music', !SaveManager.settings.music); break;
        case 'set-anim': UI.setSetting('animations', el.dataset.value); break;
        case 'reset-progress':
          UI.confirm('Reset all progress?', 'Stars, unlocked levels and best scores will be erased. Settings are kept.', 'Reset').then((yes) => {
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
      if (UI.currentScreen === 'balls' && name !== 'balls') AudioManager.stopPreview();
      UI.currentScreen = name;
      $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
      if (name === 'home') UI.renderHome();
      if (name === 'balls') UI.renderBalls();
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
      const stars = SaveManager.allStars();
      return BP.BallSkins.SKINS.filter((s) => BP.BallSkins.isUnlocked(s, stars)).length;
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
          const unlocked = BP.BallSkins.isUnlocked(skin, stars);
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
      const btn = document.querySelector('.preview-btn[data-ball="' + id + '"]');
      if (!btn) return;
      btn.classList.toggle('playing', playing);
      btn.setAttribute('aria-pressed', String(playing));
      btn.querySelector('.bi').className = 'bi ' + (playing ? 'bi-stop-fill' : 'bi-play-fill');
    },

    toggleBallPreview(id) {
      if (AudioManager.previewing === id) { AudioManager.stopPreview(); return; }
      if (!SaveManager.settings.sound) { UI.toast('Sound effects are off. Turn them on in Settings to hear previews.'); return; }
      const ok = AudioManager.playPreview(id, (endedId) => UI.setPreviewButton(endedId, false));
      if (ok) UI.setPreviewButton(id, true);
      else UI.toast('Sound is unavailable in this browser.');
    },

    useBall(id) {
      const skin = BP.BallSkins.get(id);
      if (!BP.BallSkins.isUnlocked(skin, SaveManager.allStars())) return;
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

    showWin({ stars, moves, time, par, best, isBest, hasNext, mode, isLast, hintsUsed }) {
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

    showFail({ title, msg, canContinue, icon }) {
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

    confirm(title, msg, yesLabel = 'Yes') {
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
