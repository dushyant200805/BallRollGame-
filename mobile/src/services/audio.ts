/** Native audio (expo-av). The WAV files are rendered from the web game's Web Audio synth
 * recipes by scripts/synth-audio.js, so every sound matches the original.
 */
import { Audio, type AVPlaybackSource } from 'expo-av';

type SfxName = 'click' | 'slide' | 'bump' | 'hint' | 'connect' | 'win' | 'star0' | 'star1' | 'star2' | 'fail' | 'drop';

const SOURCES: Record<SfxName | 'roll' | 'music', AVPlaybackSource> = {
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
  roll: require('../../assets/audio/roll.wav'),
  music: require('../../assets/audio/music.wav'),
};

const MUSIC_VOLUME = 0.8;

const sounds = new Map<string, Audio.Sound>();
let sfxOn = true;
let musicOn = true;
let foreground = true;
let rolling = false;
let loaded = false;

async function load(name: keyof typeof SOURCES, opts: { isLooping?: boolean; volume?: number } = {}) {
  try {
    const { sound } = await Audio.Sound.createAsync(SOURCES[name], { shouldPlay: false, ...opts });
    sounds.set(name, sound);
  } catch (e) {
    // a missing sound must never break the game
    if (name === 'click') console.warn('[audio] load failed:', String(e));
  }
}

function syncMusic() {
  const m = sounds.get('music');
  if (!m) return;
  if (musicOn && foreground) m.playAsync().catch(() => {});
  else m.pauseAsync().catch(() => {});
}

export const AudioService = {
  async init(settings: { sound: boolean; music: boolean }) {
    sfxOn = settings.sound;
    musicOn = settings.music;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false, // respect the iPhone silent switch, like most casual games
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {
      /* ignore */
    }
    const names = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
    await Promise.all(
      names.map((n) =>
        load(n, n === 'music' ? { isLooping: true, volume: MUSIC_VOLUME } : n === 'roll' ? { isLooping: true } : {}),
      ),
    );
    loaded = true;
    console.log(`[audio] ${sounds.size}/${names.length} sounds loaded`);
    syncMusic();
  },

  play(name: SfxName) {
    if (!sfxOn || !loaded) return;
    const s = sounds.get(name);
    if (s) s.replayAsync().catch(() => {});
  },

  star(i: number) {
    AudioService.play((['star0', 'star1', 'star2'] as const)[Math.min(2, Math.max(0, i))]);
  },

  startRoll() {
    if (!sfxOn || rolling) return;
    const s = sounds.get('roll');
    if (!s) return;
    rolling = true;
    s.setPositionAsync(0).then(() => s.playAsync()).catch(() => {});
  },

  stopRoll() {
    if (!rolling) return;
    rolling = false;
    sounds.get('roll')?.pauseAsync().catch(() => {});
  },

  setSound(on: boolean) {
    sfxOn = on;
    if (!on) AudioService.stopRoll();
  },

  setMusic(on: boolean) {
    musicOn = on;
    syncMusic();
  },

  /** App moved to the background / came back. */
  setForeground(isForeground: boolean) {
    foreground = isForeground;
    if (!isForeground) AudioService.stopRoll();
    syncMusic();
  },
};
