/* Renders the web game's synthesized sounds (js/game/audio-manager.js) to WAV files, offline.
 * Same recipes: oscillators with exponential envelopes, filtered noise, the per-ball rolling loops and
 * the I–vi–IV–V background music. Output: assets/audio/*.wav
 *   node scripts/synth-audio.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });

const MASTER = 0.9;

// Deterministic noise so re-running produces identical files.
let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Web Audio style exponential ramp value at time t between (t0,v0) and (t1,v1). */
const expAt = (t, t0, v0, t1, v1) => (t <= t0 ? v0 : t >= t1 ? v1 : v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0)));

function osc(type, phase) {
  const p = phase - Math.floor(phase);
  switch (type) {
    case 'triangle': return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    case 'sawtooth': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    default: return Math.sin(2 * Math.PI * p);
  }
}

class Mix {
  constructor(seconds, rate = 44100, wrap = false) {
    this.rate = rate;
    this.buf = new Float32Array(Math.ceil(seconds * rate));
    this.wrap = wrap; // add overflow back at the start (seamless loops)
  }
  add(i, v) {
    if (i < this.buf.length) this.buf[i] += v;
    else if (this.wrap) this.buf[i % this.buf.length] += v;
  }

  tone({ freq, freqEnd, type = 'sine', at = 0, dur = 0.15, vol = 0.3, attack = 0.005, gain = 1 }) {
    const r = this.rate;
    const end = at + dur + 0.05;
    let phase = 0;
    for (let i = Math.floor(at * r); i < Math.ceil(end * r); i++) {
      const t = i / r;
      const f = freqEnd ? expAt(t, at, freq, at + dur, freqEnd) : freq;
      phase += f / r;
      const env = t < at + attack ? expAt(t, at, 0.0001, at + attack, vol) : expAt(t, at + attack, vol, at + dur, 0.0001);
      this.add(i, osc(type, phase) * env * gain);
    }
  }

  /** White noise through an RBJ biquad (bandpass / lowpass) with a swept cutoff. */
  noise({ at = 0, dur = 0.12, vol = 0.2, filter = 'bandpass', freq = 1200, freqEnd, q = 1.2, gain = 1, envelope }) {
    const r = this.rate;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = Math.floor(at * r); i < Math.ceil((at + dur + 0.05) * r); i++) {
      const t = i / r;
      const f = freqEnd ? expAt(t, at, freq, at + dur, freqEnd) : freq;
      const w0 = (2 * Math.PI * f) / r, cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
      let b0, b1, b2;
      if (filter === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
      else { b0 = alpha; b1 = 0; b2 = -alpha; }
      const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
      const x = rand() * 2 - 1;
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const env = envelope ? envelope(t) : expAt(t, at, vol, at + dur, 0.0001);
      this.add(i, y * env * gain);
    }
  }

  write(name) {
    const n = this.buf.length;
    const data = Buffer.alloc(44 + n * 2);
    data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8);
    data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(this.rate, 24); data.writeUInt32LE(this.rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, this.buf[i] * MASTER));
      data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    }
    fs.writeFileSync(path.join(OUT, name + '.wav'), data);
    console.log(`${name}.wav  ${(n / this.rate).toFixed(2)} s  ${(data.length / 1024).toFixed(0)} KB`);
  }
}

// ---- sound effects (same parameters as the web SFX table) ----
const sfx = {
  click: [0.15, (m) => m.tone({ freq: 720, freqEnd: 980, type: 'triangle', dur: 0.07, vol: 0.18 })],
  slide: [0.25, (m) => {
    m.noise({ dur: 0.11, vol: 0.22, freq: 900, freqEnd: 500, q: 0.9 });
    m.tone({ freq: 210, freqEnd: 150, type: 'triangle', at: 0.07, dur: 0.09, vol: 0.32 });
  }],
  bump: [0.18, (m) => m.tone({ freq: 140, freqEnd: 100, type: 'sine', dur: 0.1, vol: 0.25 })],
  hint: [0.4, (m) => {
    m.tone({ freq: 880, type: 'sine', dur: 0.18, vol: 0.18 });
    m.tone({ freq: 1318.5, type: 'sine', at: 0.09, dur: 0.25, vol: 0.16 });
  }],
  connect: [0.33, (m) => {
    m.tone({ freq: 523.25, type: 'triangle', dur: 0.12, vol: 0.16 });
    m.tone({ freq: 783.99, type: 'triangle', at: 0.08, dur: 0.18, vol: 0.16 });
  }],
  win: [1.1, (m) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      m.tone({ freq: f, type: 'triangle', at: i * 0.1, dur: 0.3, vol: 0.22 });
      m.tone({ freq: f * 2, type: 'sine', at: i * 0.1 + 0.02, dur: 0.2, vol: 0.06 });
    });
    m.tone({ freq: 1567.98, type: 'sine', at: 0.45, dur: 0.6, vol: 0.12 });
  }],
  star0: [0.42, (m) => m.tone({ freq: 987.77, type: 'sine', dur: 0.35, vol: 0.18 })],
  star1: [0.42, (m) => m.tone({ freq: 1174.66, type: 'sine', dur: 0.35, vol: 0.18 })],
  star2: [0.42, (m) => m.tone({ freq: 1567.98, type: 'sine', dur: 0.35, vol: 0.18 })],
  fail: [0.6, (m) => {
    m.tone({ freq: 392, freqEnd: 330, type: 'sawtooth', dur: 0.22, vol: 0.08 });
    m.tone({ freq: 311, freqEnd: 220, type: 'sawtooth', at: 0.18, dur: 0.35, vol: 0.08 });
  }],
  drop: [0.52, (m) => m.tone({ freq: 500, freqEnd: 80, type: 'sine', dur: 0.45, vol: 0.2 })],
};
for (const [name, [len, fn]] of Object.entries(sfx)) {
  const m = new Mix(len);
  fn(m);
  m.write(name);
}

// ---- one rolling loop per ball skin, from the shared recipes in js/audio/ball-sound-recipes.js ----
{
  const BallSounds = require(path.join(__dirname, '..', '..', 'js', 'audio', 'ball-sound-recipes.js'));
  fs.mkdirSync(path.join(OUT, 'balls'), { recursive: true });
  for (const id of BallSounds.ids) {
    const data = BallSounds.render(id, 22050);
    const m = new Mix(data.length / 22050, 22050);
    m.buf.set(data);
    m.write('balls/' + id);
  }
}

// ---- background music: I–vi–IV–V pads, bass and pentatonic pluck, 4 cycles, seamless loop ----
{
  const CHORDS = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  const BEAT = 0.42;
  const STEPS = 128;
  const m = new Mix(STEPS * BEAT, 22050, true);
  const g = 0.55; // music bus
  for (let step = 0; step < STEPS; step++) {
    const t = step * BEAT;
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    if (step % 8 === 0) {
      chord.forEach((f) => m.tone({ freq: f, type: 'sine', at: t, dur: BEAT * 8, vol: 0.05, attack: 0.6, gain: g }));
      m.tone({ freq: chord[0] / 2, type: 'triangle', at: t, dur: BEAT * 4, vol: 0.07, attack: 0.05, gain: g });
    }
    if (step % 8 === 4) m.tone({ freq: chord[0] / 2, type: 'triangle', at: t, dur: BEAT * 4, vol: 0.06, attack: 0.05, gain: g });
    const r = (Math.sin(step * 12.9898) * 43758.5453) % 1;
    if (step % 2 === 0 && Math.abs(r) > 0.35) {
      const note = PENTA[Math.floor(Math.abs(r) * 997) % PENTA.length];
      m.tone({ freq: note, type: 'triangle', at: t, dur: 0.5, vol: 0.045, gain: g });
    }
  }
  m.write('music');
}
