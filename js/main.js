/* Ball Path — bootstrap. */
(function (BP) {
  'use strict';

  function boot() {
    const save = BP.SaveManager.load();
    BP.AudioManager.setSound(save.settings.sound);
    BP.AudioManager.setMusic(save.settings.music);
    BP.Engine.init();
    BP.UI.init();
    BP.Engine.applySettings();
    BP.UI.showScreen('home');

    // Tile/ball images: the board draws procedurally until they are decoded.
    BP.Assets.load().then((ok) => {
      if (!ok) console.warn('Ball Path: some images failed to load; using drawn tiles instead.');
      BP.Engine.renderer.dirty = true;
    });

    // Browsers only allow audio after a user gesture.
    const unlock = () => {
      BP.AudioManager.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.BP = window.BP || {});
