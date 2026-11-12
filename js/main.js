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
