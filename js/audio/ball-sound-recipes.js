/* Ball Path — rolling-sound recipes, one per ball skin (ids match js/data/ball-skins.js).
 *
 * Every sound is synthesized from scratch (filtered noise, oscillators, short events), so
 * there are no copyrighted or third-party audio files. The same code is used:
 *   - in the browser, rendered on demand into a Web Audio buffer (js/game/audio-manager.js)
 *   - by mobile/scripts/synth-audio.js, rendered offline to WAV files for the native app
 *
 * render(id, sampleRate) returns a seamless Float32Array loop (LOOP_SECONDS long, equal loudness).
 */
(function (BP) {
  'use strict';

  const LOOP_SECONDS = 2;
  const XFADE = 0.25; // seconds of tail cross-faded into the head for a seamless loop
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** RBJ biquad with a per-sample cutoff (lowpass / bandpass / highpass). */
  function biquad(type, q) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x, freq, sr) => {
      const w0 = (TAU * Math.min(freq, sr * 0.45)) / sr;
      const cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
      let b0, b1, b2;
      if (type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
      else { b0 = alpha; b1 = 0; b2 = -alpha; }
      const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    };
  }

  /** Synthesis context: a buffer plus building blocks that add into it. */
  function makeCtx(sr, seconds, seed) {
    const n = Math.ceil(sr * seconds);
    const buf = new Float32Array(n);
    const rand = rng(seed);
    const ctx = {
      sr, n, buf, rand, seconds,
      /** Filtered noise. freq/gain may be functions of time t (seconds). */
      noise(type, freq, q, gain) {
        const f = biquad(type, q);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const fr = typeof freq === 'function' ? freq(t) : freq;
          const g = typeof gain === 'function' ? gain(t) : gain;
          buf[i] += f(rand() * 2 - 1, fr, sr) * g;
        }
      },
      /** Continuous oscillator (sine/saw/tri) with optional vibrato and amplitude function. */
      osc(freq, gain, { type = 'sine', vib = 0, vibRate = 5, filterLp = 0 } = {}) {
        let ph = 0;
        const f = filterLp ? biquad('lp', 0.7) : null;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const fr = (typeof freq === 'function' ? freq(t) : freq) * (1 + vib * Math.sin(TAU * vibRate * t));
          ph += fr / sr;
          const p = ph - Math.floor(ph);
          let v = type === 'saw' ? 2 * p - 1 : type === 'tri' ? (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) : Math.sin(TAU * p);
          if (f) v = f(v, filterLp, sr);
          buf[i] += v * (typeof gain === 'function' ? gain(t) : gain);
        }
      },
      /** A short decaying tone event (ping, knock, thump, chirp). */
      ping(at, freq, { gain = 0.2, decay = 0.08, attack = 0.002, freqEnd = 0, partials = [1], noise = 0 } = {}) {
        const start = Math.floor(at * sr);
        const len = Math.ceil((attack + decay * 6) * sr);
        const phases = partials.map(() => 0);
        for (let k = 0; k < len; k++) {
          const i = (start + k) % n; // wrap so events near the end loop cleanly
          const t = k / sr;
          const env = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
          const fr = freqEnd ? freq + (freqEnd - freq) * Math.min(1, t / (decay * 3)) : freq;
          let v = 0;
          partials.forEach((m, j) => {
            phases[j] += (fr * m) / sr;
            v += Math.sin(TAU * phases[j]) / (j + 1);
          });
          if (noise) v += (rand() * 2 - 1) * noise;
          buf[i] += v * env * gain;
        }
      },
      /** Multiply the whole buffer by an amplitude function (rolling rumble, tremolo). */
      am(fn) {
        for (let i = 0; i < n; i++) buf[i] *= fn(i / sr);
      },
      /** Random event times, roughly `rate` per second. */
      events(rate, fn) {
        const count = Math.max(1, Math.round(rate * seconds));
        for (let k = 0; k < count; k++) fn((k + rand() * 0.8) / count * seconds, k);
      },
    };
    return ctx;
  }

  // A gentle "rotation" wobble shared by most rolling sounds.
  const roll = (rate, depth) => (t) => 1 - depth + depth * (0.5 + 0.5 * Math.sin(TAU * rate * t));

  const RECIPES = {
    ruby(c) { // rich glass roll
      c.noise('lp', 1100, 0.8, 0.5);
      c.osc(2093, 0.035); c.osc(3390, 0.02);
      c.events(5, (t) => c.ping(t, 2650, { gain: 0.05, decay: 0.05, partials: [1, 1.5] }));
      c.am(roll(7, 0.25));
    },
    black(c) { // smooth marble roll
      c.noise('lp', 650, 0.7, 0.75);
      c.noise('bp', 1600, 1.2, 0.06);
      c.events(8, (t) => c.ping(t, 1900, { gain: 0.025, decay: 0.012 }));
      c.am(roll(7, 0.18));
    },
    pearl(c) { // soft ceramic roll
      c.noise('bp', 1800, 1.4, 0.55);
      c.noise('lp', 500, 0.7, 0.25);
      c.events(6, (t) => c.ping(t, 2600 + c.rand() * 300, { gain: 0.06, decay: 0.03, partials: [1, 2.7] }));
      c.am(roll(6, 0.22));
    },
    ocean(c) { // gentle watery roll
      c.noise('bp', (t) => 800 + 450 * Math.sin(TAU * 0.75 * t), 2.2, 0.6);
      c.events(9, (t) => c.ping(t, 320 + c.rand() * 180, { gain: 0.12, decay: 0.025, freqEnd: 950 + c.rand() * 300 }));
      c.am(roll(3, 0.3));
    },
    emerald(c) { // natural stone roll
      c.noise('lp', 420, 0.9, 0.85);
      c.events(28, (t) => c.ping(t, 1300 + c.rand() * 900, { gain: 0.03 + c.rand() * 0.04, decay: 0.006, noise: 0.6 }));
      c.am(roll(5, 0.35));
    },
    golden(c) { // subtle metallic roll
      c.noise('bp', 2500, 1.5, 0.3);
      c.noise('lp', 600, 0.7, 0.3);
      c.osc(1320, 0.02); c.osc(2210, 0.015); c.osc(3170, 0.01);
      c.events(4, (t) => c.ping(t, 1760, { gain: 0.05, decay: 0.2, partials: [1, 2.76, 5.4] }));
      c.am(roll(7, 0.25));
    },
    diamond(c) { // delicate crystal ringing
      c.noise('hp', 3000, 0.7, 0.12);
      c.noise('lp', 700, 0.7, 0.18);
      const notes = [3520, 4186, 5274, 6272];
      c.events(8, (t, k) => c.ping(t, notes[k % notes.length], { gain: 0.09, decay: 0.18, partials: [1, 2.01] }));
      c.am(roll(8, 0.15));
    },
    neon(c) { // futuristic electronic hum
      c.osc(110, 0.22, { type: 'saw', vib: 0.01, vibRate: 6, filterLp: 900 });
      c.osc(220.5, 0.08, { type: 'saw', filterLp: 1400 });
      c.noise('bp', (t) => 1200 + 900 * Math.sin(TAU * 0.5 * t), 4, 0.12);
      c.am(roll(4, 0.3));
    },
    fire(c) { // soft fire crackling mixed with rolling
      c.noise('lp', 320, 0.8, 0.6);
      c.noise('bp', 1200, 0.8, (t) => 0.12 + 0.08 * Math.sin(TAU * 1.3 * t));
      c.events(40, (t) => c.ping(t, 2000 + c.rand() * 2500, { gain: 0.04 + c.rand() * 0.08, decay: 0.004, noise: 1 }));
      c.am(roll(6, 0.2));
    },
    ice(c) { // cool icy sliding + crystalline sparkles
      c.noise('bp', 4200, 1.1, 0.45);
      c.noise('lp', 300, 0.7, 0.12);
      c.events(7, (t) => c.ping(t, 4500 + c.rand() * 2000, { gain: 0.06, decay: 0.06, partials: [1, 1.41] }));
      c.am(roll(2.5, 0.25));
    },
    rainbow(c) { // magical sparkling roll
      c.noise('lp', 800, 0.7, 0.3);
      const penta = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349, 2637];
      c.events(14, (t) => c.ping(t, penta[Math.floor(c.rand() * penta.length)], { gain: 0.07, decay: 0.12, partials: [1, 2, 3] }));
      c.am(roll(6, 0.15));
    },
    galaxy(c) { // deep futuristic cosmic hum
      c.osc(55, 0.3); c.osc(82.5, 0.16, { vib: 0.004, vibRate: 0.5 });
      c.osc(165, 0.05, { type: 'tri' });
      c.noise('bp', (t) => 400 + 300 * Math.sin(TAU * 0.5 * t), 3, 0.18);
      c.am((t) => 0.75 + 0.25 * Math.sin(TAU * 0.5 * t));
    },
    football(c) { // soft rubber bouncing and rolling
      c.noise('lp', 350, 0.8, 0.45);
      for (let k = 0; k < 4; k++) c.ping(k * 0.5 + 0.05, 95, { gain: 0.45, decay: 0.06, freqEnd: 70, noise: 0.2 });
      c.am(roll(5, 0.25));
    },
    basketball(c) { // distinct rubber bounce and roll
      c.noise('bp', 420, 1.6, 0.25);
      for (let k = 0; k < 3; k++) {
        const t = k * (2 / 3) + 0.03;
        c.ping(t, 150, { gain: 0.55, decay: 0.05, freqEnd: 105 });
        c.ping(t, 1800, { gain: 0.08, decay: 0.01, noise: 1 }); // the sharp slap
      }
      c.am(roll(4, 0.2));
    },
    crystal(c) { // gentle glass resonance
      c.osc(880, (t) => 0.06 + 0.03 * Math.sin(TAU * 0.5 * t));
      c.osc(1320, (t) => 0.04 + 0.02 * Math.sin(TAU * 0.75 * t + 1));
      c.osc(1760, 0.015);
      c.noise('lp', 900, 0.7, 0.2);
      c.events(3, (t) => c.ping(t, 2640, { gain: 0.05, decay: 0.3 }));
    },
    wooden(c) { // natural wooden rolling
      c.noise('lp', 600, 0.8, 0.6);
      c.events(16, (t) => c.ping(t, 700 + c.rand() * 450, { gain: 0.12, decay: 0.018, partials: [1, 2.3], noise: 0.3 }));
      c.am(roll(8, 0.3));
    },
    metallic(c) { // smooth metal rolling
      c.noise('bp', 3000, 1.3, 0.35);
      c.noise('lp', 500, 0.7, 0.3);
      c.osc(600, 0.03); c.osc(1580, 0.025); c.osc(2730, 0.02);
      c.am(roll(9, 0.3));
    },
    glow(c) { // soft futuristic energy hum
      c.osc(220, 0.14); c.osc(440, 0.08); c.osc(660, 0.03);
      c.noise('hp', 5000, 0.7, 0.06);
      c.am((t) => 0.7 + 0.3 * Math.sin(TAU * 4 * t));
    },
  };

  /** Render one skin's rolling loop. Returns a Float32Array (mono, seamless). */
  function render(id, sampleRate = 22050) {
    const recipe = RECIPES[id] || RECIPES.ruby;
    const total = LOOP_SECONDS + XFADE;
    const c = makeCtx(sampleRate, total, 0x51ed + id.length * 7919 + id.charCodeAt(0) * 131);
    recipe(c);
    const n = Math.floor(LOOP_SECONDS * sampleRate);
    const xf = Math.floor(XFADE * sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = c.buf[i];
    // cross-fade the extra tail into the head so the loop point is inaudible
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      out[i] = c.buf[n + i] * (1 - k) + out[i] * k;
    }
    // normalise loudness (RMS) so every ball feels equally loud, without clipping peaks
    let peak = 0, sum = 0;
    for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(out[i])); sum += out[i] * out[i]; }
    const rms = Math.sqrt(sum / n);
    const g = peak > 0 ? Math.min(0.17 / Math.max(rms, 1e-6), 0.95 / peak) : 1;
    for (let i = 0; i < n; i++) out[i] *= g;
    return out;
  }

  const BallSounds = { LOOP_SECONDS, ids: Object.keys(RECIPES), render };
  BP.BallSounds = BallSounds;
  if (typeof module !== 'undefined' && module.exports) module.exports = BallSounds;
})(typeof window !== 'undefined' ? (window.BP = window.BP || {}) : (globalThis.BP = globalThis.BP || {}));
