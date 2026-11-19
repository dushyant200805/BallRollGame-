// Ball Roll — mode rules: difficulty tiers, move/time limits and the Daily puzzle.
// Port of the rule parts of js/game/level-manager.js.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace BallRoll.Core
{
    public static class LevelRules
    {
        /// <summary>Move/time limits for a level; they tighten as levels progress.</summary>
        public static void LimitsFor(string mode, LevelDef level, int levelCount, out int moveLimit, out float timeLimit)
        {
            moveLimit = 0;
            timeLimit = 0;
            double t = Math.Min(1, Math.Max(0, (Math.Max(1, level.Number) - 1) / (double)Math.Max(1, levelCount - 1)));
            if (mode == "challenge")
            {
                // spare moves shrink from +50% of par on level 1 to +10% on the last level
                int spare = Math.Max(2, (int)Math.Ceiling(level.Par * (0.5 - 0.4 * t)));
                moveLimit = level.Par + spare;
            }
            else if (mode == "timetrial")
            {
                // seconds allowed per par move drop from 8 to 4
                double perMove = 8 - 4 * t;
                timeLimit = (float)Math.Round(10 + level.Par * perMove + level.Size * 2, MidpointRounding.AwayFromZero);
            }
        }

        public static readonly GeneratorConfig DailyConfig = new GeneratorConfig
        {
            Size = 6, PathMin = 8, PathMax = 11, Empties = 2, Blocks = 2, DecoyRatio = 0.55,
            FixedOnPath = 1, Scramble = 16, ParMin = 6, ParMax = 9, MaxNodes = 300000, MaxAttempts = 120,
        };

        /// <summary>Local-date key YYYY-MM-DD (the Daily puzzle and the daily gift reset use it).</summary>
        public static string DailyKey(DateTime date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        /// <summary>The same puzzle for everyone on a given date.</summary>
        public static LevelDef Daily(string key)
        {
            var res = Generator.Generate(DailyConfig, "ballpath-daily-" + key);
            if (res == null) return null;
            return new LevelDef { Id = "daily-" + key, Number = 0, Size = DailyConfig.Size, Par = res.Par, Rows = res.Rows, Solution = res.Solution };
        }
    }
}
