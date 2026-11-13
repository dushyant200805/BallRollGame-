/** Native audio (expo-av). The WAV files are rendered from the web game's synth recipes by
 * scripts/synth-audio.js, so every sound matches the original. Each ball skin has its own
 * rolling loop (assets/audio/balls/<id>.wav, from js/audio/ball-sound-recipes.js).
 *
 * Mixer: effective volume = master × channel (sfx / roll / music).
 * Memory: sound effects and music stay loaded; of the 18 rolling loops only the selected
 * ball's is kept, and a preview loads its own sound and unloads it when it ends.
 */
import { Platform } from 'react-native';
import { Audio, type AVPlaybackSource } from 'expo-av';
import type { Volumes } from './storage';

type SfxName = 'click' | 'slide' | 'bump' | 'hint' | 'connect' | 'win' | 'star0' | 'star1' | 'star2' | 'fail' | 'drop';

const SFX_SOURCES: Record<SfxName | 'music', AVPlaybackSource> = {
  click: require('../../assets/audio/click.wav'),
  slide: require('../../assets/audio/slide.wav'),
  bump: require('../../assets/audio/bump.wav'),
  hint: require('../../assets/audio/hint.wav'),
  connect: require('../../assets/audio/connect.wav'),
  win: require('../../assets/audio/win.wav'),
  star0: require('../../assets/audio/star0.wav'),
  star1: require('../../assets/audio/star1.wav'),
  star2: require('../../assets/audio/star2.wav'),
  fail: require('../../assets/audio/fail.wav'),
  drop: require('../../assets/audio/drop.wav'),
  music: require('../../assets/audio/music.wav'),
};

const BALL_SOURCES: Record<string, AVPlaybackSource> = {
  ruby: require('../../assets/audio/balls/ruby.wav'),
  black: require('../../assets/audio/balls/black.wav'),
  pearl: require('../../assets/audio/balls/pearl.wav'),
  ocean: require('../../assets/audio/balls/ocean.wav'),
  emerald: require('../../assets/audio/balls/emerald.wav'),
  golden: require('../../assets/audio/balls/golden.wav'),
  diamond: require('../../assets/audio/balls/diamond.wav'),
  neon: require('../../assets/audio/balls/neon.wav'),
  fire: require('../../assets/audio/balls/fire.wav'),
  ice: require('../../assets/audio/balls/ice.wav'),
  rainbow: require('../../assets/audio/balls/rainbow.wav'),
  galaxy: require('../../assets/audio/balls/galaxy.wav'),
  football: require('../../assets/audio/balls/football.wav'),
  basketball: require('../../assets/audio/balls/basketball.wav'),
  crystal: require('../../assets/audio/balls/crystal.wav'),
  wooden: require('../../assets/audio/balls/wooden.wav'),
  metallic: require('../../assets/audio/balls/metallic.wav'),
  glow: require('../../assets/audio/balls/glow.wav'),
};

const MUSIC_LEVEL = 0.8;
const ROLL_FADE_IN_MS = 120;
const ROLL_FADE_OUT_MS = 150;
const PREVIEW_MS = 1800;

const sounds = new Map<string, Audio.Sound>();
let sfxOn = true;
let musicOn = true;
let foreground = true;
let loaded = false;
let initPromise: Promise<void> | null = null;
let warned = false;
const vol: Volumes = { master: 0.8, roll: 0.8, sfx: 0.9, music: 0.6 };

// rolling loop of the selected ball
let ballId = 'ruby';
let roll: { id: string; sound: Audio.Sound } | null = null;
let rollLoading: Promise<void> | null = null;
let rolling = false;
let rollLevel = 0; // current loudness factor 0..1 before channel volume
let lastIntensityAt = 0;

// preview
let preview: { id: string; sound: Audio.Sound; timer: ReturnType<typeof setTimeout> } | null = null;
let previewToken = 0;
const previewListeners = new Set<(id: string | null) => void>();

const ramps = new Map<Audio.Sound, ReturnType<typeof setInterval>>();

function report(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn('[audio] playback failed:', String(e));
}

const sfxVolume = () => vol.master * vol.sfx;
const rollVolume = () => vol.master * vol.roll;
const musicVolume = () => vol.master * vol.music * MUSIC_LEVEL;

/** Smoothly move a sound's volume (expo-av has no built-in ramps). */
function ramp(sound: Audio.Sound, from: number, to: number, ms: number, done?: () => void) {
  const prev = ramps.get(sound);
  if (prev) clearInterval(prev);
  const steps = Math.max(1, Math.round(ms / 30));
  let i = 0;
  const timer = setInterval(() => {
    i++;
    const v = from + ((to - from) * i) / steps;
    sound.setVolumeAsync(Math.max(0, Math.min(1, v))).catch(() => {});
    if (i >= steps) {
      clearInterval(timer);
      ramps.delete(sound);
      done?.();
    }
  }, 30);
  ramps.set(sound, timer);
}

async function load(name: keyof typeof SFX_SOURCES) {
  try {
    const isMusic = name === 'music';
    const { sound } = await Audio.Sound.createAsync(SFX_SOURCES[name], {
      shouldPlay: false,
      isLooping: isMusic,
      volume: isMusic ? musicVolume() : sfxVolume(),
    });
    sounds.set(name, sound);
  } catch (e) {
    if (name === 'click') console.warn('[audio] load failed:', String(e));
  }
}

/** Load the selected ball's rolling loop, unloading the previous one. */
function loadRoll(id: string): Promise<void> {
  if (roll && roll.id === id) return Promise.resolve();
  const p = (async () => {
    const old = roll;
    roll = null;
    if (old) old.sound.unloadAsync().catch(() => {});
    try {
      const { sound } = await Audio.Sound.createAsync(BALL_SOURCES[id] || BALL_SOURCES.ruby, { shouldPlay: false, isLooping: true, volume: 0 });
      if (ballId !== id) {
        sound.unloadAsync().catch(() => {}); // selection changed while loading
        return;
      }
      roll = { id, sound };
    } catch (e) {
      report(e);
    }
  })();
  rollLoading = p;
  return p;
}

function syncMusic() {
  const m = sounds.get('music');
  if (!m) return;
  m.setVolumeAsync(musicVolume()).catch(() => {});
  if (musicOn && foreground) m.playAsync().catch(report);
  else m.pauseAsync().catch(() => {});
}

function notifyPreview() {
  const id = preview ? preview.id : null;
  previewListeners.forEach((fn) => fn(id));
}

export const AudioService = {
  init(settings: { sound: boolean; music: boolean; volumes?: Volumes }, ball?: string): Promise<void> {
    sfxOn = settings.sound;
    musicOn = settings.music;
    if (settings.volumes) Object.assign(vol, settings.volumes);
    if (ball) ballId = ball;
    // Load once, even if the app root mounts again (e.g. the Android activity is recreated).
    if (!initPromise) initPromise = AudioService.loadAll();
    return initPromise.then(syncMusic);
  },

  async loadAll() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false, // respect the iPhone silent switch, like most casual games
        // Android: expo-av's own "app is in background" flag can get stuck after the activity
        // is recreated on the New Architecture, which silently rejects every play() call.
        // We pause/resume audio ourselves on AppState changes (setForeground), so let expo-av
        // treat the app as always active there. iOS keeps the default (no background audio).
        staysActiveInBackground: Platform.OS === 'android',
        shouldDuckAndroid: true,
      });
    } catch (e) {
      console.warn('[audio] setAudioModeAsync failed:', String(e));
    }
    const names = Object.keys(SFX_SOURCES) as (keyof typeof SFX_SOURCES)[];
    await Promise.all([...names.map(load), loadRoll(ballId)]);
    loaded = true;
    console.log(`[audio] ${sounds.size}/${names.length} sounds + ${roll ? roll.id : 'no'} rolling loop loaded`);
  },

  play(name: SfxName) {
    if (!sfxOn || !loaded) return;
    const s = sounds.get(name);
    if (s) s.replayAsync({ volume: sfxVolume() }).catch(report);
  },

  star(i: number) {
    AudioService.play((['star0', 'star1', 'star2'] as const)[Math.min(2, Math.max(0, i))]);
  },

  /** Choose the ball whose rolling sound plays (loads its loop, releases the old one). */
  setBall(id: string) {
    if (id === ballId && roll && roll.id === id) return;
    ballId = id;
    if (loaded) void loadRoll(id);
  },

  /** Id of the ball whose rolling sound is playing (null when silent). */
  get rollingBall(): string | null {
    return rolling && roll ? roll.id : null;
  },

  /** Start the selected ball's rolling loop with a short fade-in. Never stacks. */
  startRoll() {
    if (!sfxOn || !foreground) return;
    rolling = true;
    rollLevel = 0.4;
    const begin = () => {
      if (!rolling || !roll) return;
      const s = roll.sound;
      s.setRateAsync(0.85, false).catch(() => {});
      s.setPositionAsync(Math.floor(Math.random() * 1800))
        .then(() => s.playAsync())
        .then(() => ramp(s, 0, rollVolume() * rollLevel, ROLL_FADE_IN_MS))
        .catch(report);
    };
    if (roll && roll.id === ballId) begin();
    else (rollLoading || loadRoll(ballId)).then(begin);
  },

  /** k = 0..1 ball speed relative to its top speed; loudness and pitch follow it. */
  setRollIntensity(k: number) {
    if (!rolling || !roll) return;
    const now = Date.now();
    if (now - lastIntensityAt < 100) return; // throttle native calls
    lastIntensityAt = now;
    const kk = Math.max(0, Math.min(1, k));
    rollLevel = 0.35 + 0.65 * kk;
    if (!ramps.has(roll.sound)) roll.sound.setVolumeAsync(rollVolume() * rollLevel).catch(() => {});
    roll.sound.setRateAsync(0.85 + 0.3 * kk, false).catch(() => {});
  },

  /** Fade the rolling sound out and stop it. */
  stopRoll() {
    if (!rolling) return;
    rolling = false;
    const r = roll;
    if (!r) return;
    ramp(r.sound, rollVolume() * rollLevel, 0, ROLL_FADE_OUT_MS, () => {
      if (!rolling) r.sound.pauseAsync().catch(() => {});
    });
  },

  // ---- Ball Collection preview ---------------------------------------------------
  get previewing(): string | null {
    return preview ? preview.id : null;
  },

  subscribePreview(fn: (id: string | null) => void): () => void {
    previewListeners.add(fn);
    return () => {
      previewListeners.delete(fn);
    };
  },

  /** Play a short sample of a ball's rolling sound; stops any previous preview first. */
  async playPreview(id: string): Promise<boolean> {
    AudioService.stopPreview();
    if (!sfxOn) return false;
    const token = ++previewToken;
    try {
      const { sound } = await Audio.Sound.createAsync(BALL_SOURCES[id], { shouldPlay: false, isLooping: true, volume: 0 });
      if (token !== previewToken) {
        sound.unloadAsync().catch(() => {}); // a newer tap won the race
        return false;
      }
      const timer = setTimeout(() => {
        if (preview && preview.sound === sound) AudioService.stopPreview();
      }, PREVIEW_MS);
      preview = { id, sound, timer };
      notifyPreview();
      await sound.playAsync();
      ramp(sound, 0, rollVolume() * 0.9, 120);
      return true;
    } catch (e) {
      report(e);
      return false;
    }
  },

  stopPreview() {
    previewToken++;
    if (!preview) return;
    const p = preview;
    preview = null;
    clearTimeout(p.timer);
    notifyPreview();
    ramp(p.sound, rollVolume() * 0.9, 0, 120, () => {
      p.sound.unloadAsync().catch(() => {}); // release the preview's memory
    });
  },

  // ---- settings -----------------------------------------------------------------
  setSound(on: boolean) {
    sfxOn = on;
    if (!on) {
      AudioService.stopRoll();
      AudioService.stopPreview();
    }
  },

  setMusic(on: boolean) {
    musicOn = on;
    syncMusic();
  },

  setVolumes(v: Partial<Volumes>) {
    Object.assign(vol, v);
    const m = sounds.get('music');
    if (m) m.setVolumeAsync(musicVolume()).catch(() => {});
    if (rolling && roll && !ramps.has(roll.sound)) roll.sound.setVolumeAsync(rollVolume() * rollLevel).catch(() => {});
  },

  /** App moved to the background / came back. */
  setForeground(isForeground: boolean) {
    foreground = isForeground;
    if (!isForeground) {
      AudioService.stopRoll();
      AudioService.stopPreview();
    }
    syncMusic();
  },
};
