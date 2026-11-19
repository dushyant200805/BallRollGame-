// Ball Roll — audio: sound effects, music and the selected ball's rolling loop (same WAV files as
// the React Native app, rendered from the web game's synth recipes). The rolling loop fades in and
// out and follows the ball's speed, like the other versions.
using System.Collections.Generic;
using UnityEngine;

namespace BallRoll
{
    public sealed class Sfx : MonoBehaviour
    {
        static Sfx inst;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        AudioSource sfx, roll, music;
        float rollTarget;
        public static bool SoundOn = true, MusicOn = true;
        public static float Master = 0.8f, RollVol = 0.8f, SfxVol = 0.9f, MusicVol = 0.6f;

        static Sfx I
        {
            get
            {
                if (inst == null)
                {
                    var go = new GameObject("Sfx");
                    DontDestroyOnLoad(go);
                    inst = go.AddComponent<Sfx>();
                    inst.sfx = go.AddComponent<AudioSource>();
                    inst.roll = go.AddComponent<AudioSource>();
                    inst.roll.loop = true;
                    inst.music = go.AddComponent<AudioSource>();
                    inst.music.loop = true;
                }
                return inst;
            }
        }

        AudioClip Clip(string path)
        {
            if (!clips.TryGetValue(path, out var c)) { c = Resources.Load<AudioClip>("Audio/" + path); clips[path] = c; }
            return c;
        }

        public static void Play(string name, float volume = 1f)
        {
            if (!SoundOn) return;
            var c = I.Clip(name);
            if (c != null) I.sfx.PlayOneShot(c, volume * SfxVol * Master);
        }

        public static void StartMusic()
        {
            var i = I;
            if (!MusicOn) { i.music.Stop(); return; }
            if (i.music.isPlaying) return;
            i.music.clip = i.Clip("music");
            i.music.volume = MusicVol * Master * 0.5f;
            if (i.music.clip != null) i.music.Play();
        }

        /// <summary>Start the rolling loop of a ball skin (fades in).</summary>
        public static void StartRoll(string ballId)
        {
            if (!SoundOn) return;
            var i = I;
            i.roll.clip = i.Clip("balls/" + ballId);
            if (i.roll.clip == null) return;
            i.roll.volume = 0;
            i.roll.pitch = 0.85f;
            i.roll.Play();
            i.rollTarget = 0.35f;
        }

        /// <summary>Speed 0..1: louder and higher when the ball moves faster.</summary>
        public static void RollIntensity(float k)
        {
            var i = I;
            if (!i.roll.isPlaying) return;
            i.rollTarget = 0.35f + 0.65f * Mathf.Clamp01(k);
            i.roll.pitch = 0.85f + 0.3f * Mathf.Clamp01(k);
        }

        /// <summary>Apply volume / on-off changes to the music that is already playing.</summary>
        public static void ApplyVolumes()
        {
            var i = I;
            i.music.volume = MusicVol * Master * 0.5f;
            if (!MusicOn && i.music.isPlaying) i.music.Stop();
            if (!SoundOn) i.rollTarget = 0;
        }

        public static void StopRoll() { if (inst != null) inst.rollTarget = 0; }

        void Update()
        {
            float target = rollTarget * RollVol * Master;
            roll.volume = Mathf.MoveTowards(roll.volume, target, Time.unscaledDeltaTime * 3f);
            if (rollTarget == 0 && roll.volume <= 0.001f && roll.isPlaying) roll.Stop();
        }
    }
}
