// Ball Roll — loads the migrated game data (levels, ball skins, rewards config) from
// Resources/Data/*.json, exported from the original game by tools/export-unity.js.
using System;
using System.Collections.Generic;
using BallRoll.Core;
using UnityEngine;

namespace BallRoll
{
    [Serializable] public sealed class TierJson { public string name; public int from; public int to; public string color; }
    [Serializable] public sealed class LevelJson { public int id; public int size; public int par; public string[] rows; public int[] solution; }
    [Serializable] public sealed class ModeJson { public string id; public string label; public string desc; public List<TierJson> tiers; public List<LevelJson> levels; }
    [Serializable] public sealed class LevelsFile { public List<ModeJson> modes; }

    [Serializable] public sealed class BandJson { public string color; public float width; public int count; }
    [Serializable] public sealed class DotJson { public string color; public int n; public float r; }
    [Serializable] public sealed class TwinkleJson { public string color; public int n; }
    [Serializable]
    public sealed class BallSkin
    {
        public string id, name, collection, sound;
        public int cost;
        public string[] body;
        public float alpha = 1;
        public string haloColor;
        public float haloSize;
        public List<BandJson> bands;
        public List<DotJson> dots;
        public string[] sweep;
        public List<TwinkleJson> twinkle;
        public float spec = 0.7f;
    }
    [Serializable] public sealed class SkinsFile { public string defaultBall; public string[] collections; public List<BallSkin> skins; }

    [Serializable] public sealed class DailyJson { public string key; public int par; public string[] rows; public int[] solution; }
    [Serializable] public sealed class DailyExpectedFile { public List<DailyJson> days; }

    public static class GameData
    {
        static LevelsFile levels;
        static SkinsFile skins;
        static RewardsConfig rewards;

        static T Load<T>(string name)
        {
            var asset = Resources.Load<TextAsset>("Data/" + name);
            if (asset == null) throw new InvalidOperationException("Missing Resources/Data/" + name + ".json");
            return JsonUtility.FromJson<T>(asset.text);
        }

        public static LevelsFile Levels => levels ??= Load<LevelsFile>("levels");
        public static SkinsFile Skins => skins ??= Load<SkinsFile>("ball-skins");
        public static RewardsConfig Rewards => rewards ??= Load<RewardsConfig>("rewards-config");
        public static DailyExpectedFile DailyExpected() => Load<DailyExpectedFile>("daily-expected");

        public static readonly string[] ModeIds = { "classic", "challenge", "timetrial" };

        public static ModeJson Mode(string id) => Levels.modes.Find(m => m.id == id);
        public static int Count(string mode) => Mode(mode)?.levels.Count ?? 0;

        public static List<Move> ToMoves(int[] flat)
        {
            var list = new List<Move>();
            if (flat == null) return list;
            for (int i = 0; i + 2 < flat.Length; i += 3) list.Add(new Move(flat[i], flat[i + 1], flat[i + 2]));
            return list;
        }

        /// <summary>1-based level lookup within a mode.</summary>
        public static LevelDef Level(string mode, int number)
        {
            var m = Mode(mode);
            if (m == null || number < 1 || number > m.levels.Count) return null;
            var l = m.levels[number - 1];
            return new LevelDef { Id = mode + "-" + l.id, Number = number, Size = l.size, Par = l.par, Rows = l.rows, Solution = ToMoves(l.solution) };
        }

        public static TierJson TierOf(string mode, int number)
        {
            var tiers = Mode(mode).tiers;
            return tiers.Find(t => number >= t.from && number <= t.to) ?? tiers[tiers.Count - 1];
        }

        public static List<SkinCost> SkinCosts()
        {
            var list = new List<SkinCost>();
            foreach (var s in Skins.skins) list.Add(new SkinCost(s.id, s.cost));
            return list;
        }
    }
}
