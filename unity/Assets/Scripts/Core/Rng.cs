// Ball Roll — deterministic seeded RNG (mulberry32), bit-for-bit identical to js/core/rng.js,
// so generated puzzles (the Daily) are the same as in the web and React Native versions.
using System.Collections.Generic;

namespace BallRoll.Core
{
    public sealed class Rng
    {
        uint a;

        public Rng(uint seed) { a = seed; }
        public Rng(string seed) : this(HashString(seed)) { }

        /// <summary>FNV-1a over UTF-16 code units (same as JS charCodeAt).</summary>
        public static uint HashString(string s)
        {
            unchecked
            {
                uint h = 2166136261u;
                foreach (char c in s)
                {
                    h ^= c;
                    h *= 16777619u;
                }
                return h;
            }
        }

        /// <summary>Next value in [0, 1).</summary>
        public double Next()
        {
            unchecked
            {
                a += 0x6d2b79f5u;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>Integer in [min, max] (inclusive).</summary>
        public int Int(int min, int max) => min + (int)System.Math.Floor(Next() * (max - min + 1));

        public T Pick<T>(IList<T> list) => list[(int)System.Math.Floor(Next() * list.Count)];

        public bool Chance(double p) => Next() < p;

        public List<T> Shuffle<T>(List<T> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = (int)System.Math.Floor(Next() * (i + 1));
                (list[i], list[j]) = (list[j], list[i]);
            }
            return list;
        }
    }
}
