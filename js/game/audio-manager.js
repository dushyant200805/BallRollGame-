/* Ball Path — Audio manager: every sound is synthesized live with the Web Audio API
 * (no audio files), including a soft generative background music loop and a unique rolling
 * sound per ball skin (js/audio/ball-sound-recipes.js, rendered on demand into a buffer).
 *
 * Mixer: master -> { sfx bus, roll bus, music bus }, each with its own volume setting.
 */
(function (BP) {
  'use strict';

  let ctx = null, master, sfxBus, musicBus, rollBus, noiseBuffer;
  let sfxOn = true, musicOn = true;
  let rollNodes = null;
  const vol = { master: 0.8, roll: 0.8, sfx: 0.9, music: 0.6 };
  let ballId = 'ruby';
  const ballBuffers = new Map(); // skin id -> AudioBuffer (only the selected + previewed ones are kept)
  let preview = null;            // { id, src, g, timer, onEnd }
  const music = { timer: null, nextTime: 0, step: 0 };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    rollBus = ctx.createGain(); rollBus.connect(master);
    applyVolumes();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(0.9 * vol.master, t, 0.03);
    sfxBus.gain.setTargetAtTime(sfxOn ? vol.sfx : 0, t, 0.03);
    rollBus.gain.setTargetAtTime(sfxOn ? vol.roll : 0, t, 0.03);
    musicBus.gain.setTargetAtTime(musicOn ? 0.55 * vol.music : 0, t, 0.03);
  }

  /** Rendered rolling loop for a skin (cached; rendering takes ~20 ms). */
  function ballBuffer(id) {
    let b = ballBuffers.get(id);
    if (!b) {
      const data = BP.BallSounds.render(id, 22050);
      b = ctx.createBuffer(1, data.length, 22050);
      b.getChannelData(0).set(data);
      ballBuffers.set(id, b);
    }
    return b;
  }

  /** Drop buffers that are neither the selected ball nor the one being previewed. */
  function releaseUnused() {
    for (const id of Array.from(ballBuffers.keys())) {
      if (id !== ballId && !(preview && preview.id === id)) ballBuffers.delete(id);
    }
  }

  function tone({ freq, freqEnd, type = 'sine', at = 0, dur = 0.15, vol = 0.3, attack = 0.005, bus }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.12, vol = 0.2, filter = 'bandpass', freq = 1200, freqEnd, q = 1.2 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  const SFX = {
    click() { tone({ freq: 720, freqEnd: 980, type: 'triangle', dur: 0.07, vol: 0.18 }); },
    slide() {
      noise({ dur: 0.11, vol: 0.22, freq: 900, freqEnd: 500, q: 0.9 });
      tone({ freq: 210, freqEnd: 150, type: 'triangle', at: 0.07, dur: 0.09, vol: 0.32 }); // wooden "tock"
    },
    bump() { tone({ freq: 140, freqEnd: 100, type: 'sine', dur: 0.1, vol: 0.25 }); },
    hint() {
      tone({ freq: 880, type: 'sine', dur: 0.18, vol: 0.18 });
      tone({ freq: 1318.5, type: 'sine', at: 0.09, dur: 0.25, vol: 0.16 });
    },
    connect() {
      tone({ freq: 523.25, type: 'triangle', dur: 0.12, vol: 0.16 });
      tone({ freq: 783.99, type: 'triangle', at: 0.08, dur: 0.18, vol: 0.16 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone({ freq: f, type: 'triangle', at: i * 0.1, dur: 0.3, vol: 0.22 });
        tone({ freq: f * 2, type: 'sine', at: i * 0.1 + 0.02, dur: 0.2, vol: 0.06 });
      });
      tone({ freq: 1567.98, type: 'sine', at: 0.45, dur: 0.6, vol: 0.12 });
    },
    star(i) { tone({ freq: [987.77, 1174.66, 1567.98][i] || 1567.98, type: 'sine', dur: 0.35, vol: 0.18 }); },
    fail() {
      tone({ freq: 392, freqEnd: 330, type: 'sawtooth', dur: 0.22, vol: 0.08 });
      tone({ freq: 311, freqEnd: 220, type: 'sawtooth', at: 0.18, dur: 0.35, vol: 0.08 });
    },
    drop() { tone({ freq: 500, freqEnd: 80, type: 'sine', dur: 0.45, vol: 0.2 }); },
  };

  // Rolling: the selected ball's own seamless loop. One instance at a time, faded in/out,
  // with loudness and pitch following the ball's speed (setRollIntensity).
  const ROLL_FADE_IN = 0.12, ROLL_FADE_OUT = 0.15;

  function startRoll() {
    if (!ensure()) return;
    if (rollNodes) stopRoll(true); // rapid re-rolls: never stack two rolling sounds
    const src = ctx.createBufferSource();
    src.buffer = ballBuffer(ballId);
    src.loop = true;
    src.playbackRate.value = 0.85;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g); g.connect(rollBus);
    g.gain.setTargetAtTime(0.4, ctx.currentTime, ROLL_FADE_IN / 3);
    src.start(0, Math.random() * src.buffer.duration);
    rollNodes = { src, g, id: ballId };
  }

  /** k = 0..1 ball speed relative to its top speed. */
  function setRollIntensity(k) {
    if (!rollNodes) return;
    const t = ctx.currentTime;
    const kk = Math.max(0, Math.min(1, k));
    rollNodes.g.gain.setTargetAtTime(0.35 + 0.65 * kk, t, 0.05);
    rollNodes.src.playbackRate.setTargetAtTime(0.85 + 0.3 * kk, t, 0.05);
  }

  function stopRoll(quick) {
    if (!rollNodes) return;
    const { src, g } = rollNodes;
    rollNodes = null;
    const t = ctx.currentTime;
    const fade = quick ? 0.04 : ROLL_FADE_OUT;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    src.stop(t + fade + 0.02);
  }

  // Ball Collection preview: a short sample of a ball's rolling sound. Only one at a time.
  const PREVIEW_SECONDS = 1.8;

  function stopPreview() {
    if (!preview) return;
    const p = preview;
    preview = null;
    clearTimeout(p.timer);
    const t = ctx.currentTime;
    p.g.gain.cancelScheduledValues(t);
    p.g.gain.setValueAtTime(Math.max(p.g.gain.value, 0.0001), t);
    p.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    p.src.stop(t + 0.12);
    if (p.onEnd) p.onEnd(p.id);
    releaseUnused();
  }

  function playPreview(id, onEnd) {
    if (!ensure()) return false;
    stopPreview();
    const src = ctx.createBufferSource();
    src.buffer = ballBuffer(id);
    src.loop = true;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.12);
    g.gain.setValueAtTime(0.9, t + PREVIEW_SECONDS - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + PREVIEW_SECONDS);
    src.connect(g); g.connect(rollBus);
    src.start();
    src.stop(t + PREVIEW_SECONDS + 0.05);
    preview = { id, src, g, onEnd, timer: setTimeout(() => { if (preview && preview.src === src) stopPreview(); }, PREVIEW_SECONDS * 1000) };
    return true;
  }

  // Background music: I–vi–IV–V pads with a pentatonic pluck, scheduled ahead of time.
  const CHORDS = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  const BEAT = 0.42;

  function scheduleMusic() {
    while (music.nextTime < ctx.currentTime + 0.3) {
      const step = music.step;
      const t = music.nextTime - ctx.currentTime;
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      if (step % 8 === 0) {
        chord.forEach((f) => tone({ freq: f, type: 'sine', at: t, dur: BEAT * 8, vol: 0.05, attack: 0.6, bus: musicBus }));
        tone({ freq: chord[0] / 2, type: 'triangle', at: t, dur: BEAT * 4, vol: 0.07, attack: 0.05, bus: musicBus });
      }
      if (step % 8 === 4) tone({ freq: chord[0] / 2, type: 'triangle', at: t, dur: BEAT * 4, vol: 0.06, attack: 0.05, bus: musicBus });
      // deterministic-but-varied melody
      const r = (Math.sin(step * 12.9898) * 43758.5453) % 1;
      if (step % 2 === 0 && Math.abs(r) > 0.35) {
        const note = PENTA[Math.floor(Math.abs(r) * 997) % PENTA.length];
        tone({ freq: note, type: 'triangle', at: t, dur: 0.5, vol: 0.045, bus: musicBus });
      }
      music.step++;
      music.nextTime += BEAT;
    }
  }

  function startMusic() {
    if (!musicOn || music.timer || !ensure()) return;
    music.nextTime = ctx.currentTime + 0.1;
    music.timer = setInterval(scheduleMusic, 80);
  }

  function stopMusic() {
    clearInterval(music.timer);
    music.timer = null;
  }

  const AudioManager = {
    /** Must be called from a user gesture at least once (browser autoplay policy). */
    unlock() {
      if (!ensure()) return;
      if (musicOn) startMusic();
    },
    play(name, arg) {
      if (!sfxOn || !ensure() || !SFX[name]) return;
      SFX[name](arg);
    },
    startRoll() { if (sfxOn) startRoll(); },
    stopRoll,
    setRollIntensity,
    /** Select the ball whose sound plays while rolling. */
    setBall(id) {
      ballId = id;
      if (ctx) releaseUnused();
    },
    playPreview,
    stopPreview,
    get previewing() { return preview ? preview.id : null; },
    /** Id of the ball whose rolling sound is playing (null when silent). */
    get rolling() { return rollNodes ? rollNodes.id : null; },
    setSound(on) {
      sfxOn = on;
      applyVolumes();
      if (!on) { stopRoll(); stopPreview(); }
    },
    setMusic(on) {
      musicOn = on;
      applyVolumes();
      if (on && ctx) startMusic(); else stopMusic();
    },
    /** Volumes 0..1: {master, roll, sfx, music}. */
    setVolumes(v) {
      Object.assign(vol, v);
      applyVolumes();
    },
    suspend() {
      stopRoll(true);
      stopPreview();
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };

  BP.AudioManager = AudioManager;
})(window.BP = window.BP || {});
