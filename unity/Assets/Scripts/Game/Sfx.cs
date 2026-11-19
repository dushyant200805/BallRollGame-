// Ball Roll — audio: sound effects, music and the selected ball's rolling loop (same WAV files as
// the React Native app, rendered from the web game's synth recipes). The rolling loop fades in and
// out and follows the ball's speed, like the other versions.
//
// Robustness on Android:
//  * every clip is loaded and its audio data preloaded at start-up (Init), so the first play of a
//    sound is never dropped or late, and a missing file is reported;
//  * after the app returns from the background, or the audio device changes (headphones,
//    Bluetooth), the audio system is reset if needed and the music is restarted;
//  * Sound and Music are independent switches; volumes apply live.
// Development builds (the -emulator test build) write "[Audio]" lines to logcat for every sound so
// it can be verified without listening.
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace BallRoll
{
    public sealed class Sfx : MonoBehaviour
    {
        public static readonly string[] Effects = { "click", "slide", "bump", "connect", "hint", "win", "fail", "drop", "star0", "star1", "star2" };

        static Sfx inst;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        AudioSource sfx, roll, music, preview;
        float rollTarget, heartbeat;
        string rollId;
        public static bool SoundOn = true, MusicOn = true;
        public static float Master = 0.8f, RollVol = 0.8f, SfxVol = 0.9f, MusicVol = 0.6f;
        public static string Previewing { get; private set; }
        public static event System.Action PreviewEnded;
        static bool Verbose => Debug.isDebugBuild;

        static void Log(string msg) { if (Verbose) Debug.Log("[Audio] " + msg); }

        static Sfx I
        {
            get
            {
                if (inst == null)
                {
                    var go = new GameObject("Sfx");
                    DontDestroyOnLoad(go);
                    inst = go.AddComponent<Sfx>();
                    inst.sfx = inst.Source(false);
                    inst.roll = inst.Source(true);
                    inst.music = inst.Source(true);
                    inst.preview = inst.Source(true);
                    AudioSettings.OnAudioConfigurationChanged += inst.OnAudioConfigChanged;
                }
                return inst;
            }
        }

        AudioSource Source(bool loop)
        {
            var s = gameObject.AddComponent<AudioSource>();
            s.playOnAwake = false;
            s.loop = loop;
            s.spatialBlend = 0; // 2D
            s.ignoreListenerPause = false;
            return s;
        }

        AudioClip Clip(string path)
        {
            if (!clips.TryGetValue(path, out var c))
            {
                c = Resources.Load<AudioClip>("Audio/" + path);
                if (c == null) Debug.LogWarning("[Audio] missing clip: " + path);
                else if (c.loadState != AudioDataLoadState.Loaded) c.LoadAudioData();
                clips[path] = c;
            }
            return c;
        }

        /// <summary>Load every effect, the music and the selected ball's loop up front.</summary>
        public static void Init(string ballId)
        {
            var i = I;
            int ok = 0;
            foreach (var e in Effects) if (i.Clip(e) != null) ok++;
            bool musicOk = i.Clip("music") != null, ballOk = i.Clip("balls/" + ballId) != null;
            var cfg = AudioSettings.GetConfiguration();
            Log($"init: {ok}/{Effects.Length} effects, music={(musicOk ? "ok" : "MISSING")}, ball {ballId}={(ballOk ? "ok" : "MISSING")}, " +
                $"output {AudioSettings.outputSampleRate} Hz, speaker {cfg.speakerMode}, dsp {cfg.dspBufferSize}, sound={SoundOn} music={MusicOn}");
        }

        public static void Play(string name, float volume = 1f)
        {
            if (!SoundOn) { Log("skip " + name + " (sound off)"); return; }
            var c = I.Clip(name);
            if (c == null) return;
            float v = volume * SfxVol * Master;
            I.sfx.PlayOneShot(c, v);
            Log($"play {name} vol={v:0.00}");
        }

        public static void StartMusic()
        {
            var i = I;
            if (!MusicOn) { if (i.music.isPlaying) { i.music.Stop(); Log("music stop (off)"); } return; }
            i.music.volume = MusicVol * Master * 0.5f;
            if (i.music.isPlaying) return;
            i.music.clip = i.Clip("music");
            if (i.music.clip == null) return;
            i.music.Play();
            Log($"music start vol={i.music.volume:0.00}");
        }

        /// <summary>Start the rolling loop of a ball skin (fades in).</summary>
        public static void StartRoll(string ballId)
        {
            if (!SoundOn) { Log("skip roll " + ballId + " (sound off)"); return; }
            var i = I;
            i.roll.clip = i.Clip("balls/" + ballId);
            if (i.roll.clip == null) return;
            i.rollId = ballId;
            i.roll.volume = 0;
            i.roll.pitch = 0.85f;
            i.roll.Play();
            i.rollTarget = 0.35f;
            Log("roll start " + ballId);
        }

        /// <summary>Speed 0..1: louder and higher when the ball moves faster.</summary>
        public static void RollIntensity(float k)
        {
            var i = I;
            if (!i.roll.isPlaying) return;
            i.rollTarget = 0.35f + 0.65f * Mathf.Clamp01(k);
            i.roll.pitch = 0.85f + 0.3f * Mathf.Clamp01(k);
        }

        public static void StopRoll()
        {
            if (inst == null || inst.rollTarget == 0) return;
            inst.rollTarget = 0;
            Log("roll stop " + inst.rollId);
        }

        /// <summary>Apply volume / on-off changes to what is already playing.</summary>
        public static void ApplyVolumes()
        {
            var i = I;
            i.music.volume = MusicVol * Master * 0.5f;
            i.preview.volume = RollVol * Master;
            if (!MusicOn && i.music.isPlaying) { i.music.Stop(); Log("music stop (off)"); }
            if (!SoundOn) { i.rollTarget = 0; StopPreview(); }
            Log($"volumes master={Master:0.00} roll={RollVol:0.00} sfx={SfxVol:0.00} music={MusicVol:0.00} sound={SoundOn} musicOn={MusicOn}");
        }

        /// <summary>Plays a ball's rolling sound for ~1.8 s (one preview at a time).</summary>
        public static void Preview(string ballId)
        {
            var i = I;
            StopPreview();
            if (!SoundOn) { Log("skip preview " + ballId + " (sound off)"); return; }
            i.preview.clip = i.Clip("balls/" + ballId);
            if (i.preview.clip == null) return;
            i.preview.volume = RollVol * Master;
            i.preview.Play();
            Previewing = ballId;
            i.CancelInvoke(nameof(EndPreview));
            i.Invoke(nameof(EndPreview), 1.8f);
            Log("preview " + ballId);
        }

        public static void StopPreview()
        {
            if (inst != null && inst.preview.isPlaying) inst.preview.Stop();
            Previewing = null;
        }

        void EndPreview() { StopPreview(); PreviewEnded?.Invoke(); }

        // ---------- lifecycle ----------
        void OnApplicationPause(bool paused)
        {
            if (paused)
            {
                StopRoll();
                StopPreview();
                Log("app paused");
            }
            else StartCoroutine(Resume());
        }

        IEnumerator Resume()
        {
            yield return null; // let Unity restore its audio output first
            Log($"app resumed: music playing={music.isPlaying}");
            StartMusic();
        }

        void OnAudioConfigChanged(bool deviceWasChanged)
        {
            Log("audio configuration changed, device changed=" + deviceWasChanged);
            if (deviceWasChanged) AudioSettings.Reset(AudioSettings.GetConfiguration());
            StartMusic();
        }

        void Update()
        {
            float target = rollTarget * RollVol * Master;
            roll.volume = Mathf.MoveTowards(roll.volume, target, Time.unscaledDeltaTime * 3f);
            if (rollTarget == 0 && roll.volume <= 0.001f && roll.isPlaying) roll.Stop();
            if (Verbose && (heartbeat += Time.unscaledDeltaTime) > 5f)
            {
                heartbeat = 0;
                Log($"state music={(music.isPlaying ? "playing" : "stopped")}@{music.volume:0.00} roll={(roll.isPlaying ? "playing" : "stopped")} sound={SoundOn} musicOn={MusicOn}");
            }
        }
    }
}
