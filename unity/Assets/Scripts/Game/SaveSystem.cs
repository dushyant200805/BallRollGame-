// Ball Roll — persistent save (port of js/game/save-manager.js): settings, progress per mode,
// stars, best moves/times, daily results + streak, the in-progress board, the selected ball and
// the reward state. Stored as JSON in Application.persistentDataPath, written atomically
// (temp file + replace) so a crash mid-write never corrupts the save.
using System;
using System.Collections.Generic;
using System.IO;
using BallRoll.Core;
using UnityEngine;

namespace BallRoll
{
    [Serializable] public sealed class Volumes { public float master = 0.8f, roll = 0.8f, sfx = 0.9f, music = 0.6f; }

    [Serializable]
    public sealed class Settings
    {
        public bool sound = true, music = true, vibration = true, analytics = true;
        public string animations = "full"; // full | reduced
        public Volumes volumes = new Volumes();
    }

    [Serializable] public sealed class LevelResult { public int n; public int stars; public int bestMoves; public int bestTime; }
    [Serializable] public sealed class ModeProgress { public string mode; public int unlocked = 1; public List<LevelResult> levels = new List<LevelResult>(); }
    [Serializable] public sealed class DailyResult { public string key; public int stars; public int bestMoves; public int bestTime; }

    [Serializable]
    public sealed class CurrentGame
    {
        public string mode;
        public int number;
        public string dailyKey;
        public string levelId;
        public SessionSnapshot snapshot;
    }

    [Serializable]
    public sealed class SaveData
    {
        public int version = 1;
        public Settings settings = new Settings();
        public string ball = "ruby";
        public int ballsSeen = 1;
        public List<ModeProgress> progress = new List<ModeProgress>();
        public List<DailyResult> daily = new List<DailyResult>();
        public int dailyStreak;
        public string dailyLastDone;
        public CurrentGame current;
        public bool hasCurrent;
        public string lastMode = "classic";
        public RewardState rewards;
        public bool noAds; // Remove Ads purchased: no banner / interstitials
    }

    public static class SaveSystem
    {
        static SaveData data;
        static string PathFile => System.IO.Path.Combine(Application.persistentDataPath, "save.json");
        public static event Action Changed;

        public static SaveData Data
        {
            get { if (data == null) Load(); return data; }
        }

        public static Settings Settings => Data.settings;

        public static void Load()
        {
            try
            {
                data = File.Exists(PathFile) ? JsonUtility.FromJson<SaveData>(File.ReadAllText(PathFile)) : null;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[BallRoll] save unreadable, starting fresh: " + e.Message);
                data = null;
            }
            data ??= new SaveData();
            foreach (var m in GameData.ModeIds)
                if (data.progress.Find(p => p.mode == m) == null) data.progress.Add(new ModeProgress { mode = m });
            data.rewards ??= Rewards.DefaultState(GameData.Rewards);
            if (string.IsNullOrEmpty(data.rewards.theme)) data.rewards.theme = Rewards.DefaultTheme(GameData.Rewards).id;
        }

        public static void Save()
        {
            try
            {
                string tmp = PathFile + ".tmp";
                File.WriteAllText(tmp, JsonUtility.ToJson(Data));
                if (File.Exists(PathFile)) File.Replace(tmp, PathFile, null);
                else File.Move(tmp, PathFile);
            }
            catch (Exception e) { Debug.LogWarning("[BallRoll] save failed: " + e.Message); }
            Changed?.Invoke();
        }

        // ---------- progress ----------
        public static ModeProgress Mode(string mode) => Data.progress.Find(p => p.mode == mode);
        public static LevelResult Result(string mode, int n) => Mode(mode).levels.Find(l => l.n == n);

        /// <summary>Unlocked, or the level before it is completed.</summary>
        public static bool IsUnlocked(string mode, int n) => n == 1 || n <= Mode(mode).unlocked || Result(mode, n - 1) != null;

        public static int TotalStars(string mode)
        {
            int s = 0;
            foreach (var l in Mode(mode).levels) s += l.stars;
            return s;
        }

        public static int AllStars()
        {
            int s = 0;
            foreach (var m in GameData.ModeIds) s += TotalStars(m);
            return s;
        }

        public static int CompletedLevels()
        {
            int c = 0;
            foreach (var m in GameData.ModeIds) c += Mode(m).levels.Count;
            return c;
        }

        /// <summary>First unlocked level without a result, else the highest unlocked.</summary>
        public static int NextLevelFor(string mode)
        {
            var p = Mode(mode);
            for (int n = 1; n <= p.unlocked; n++) if (Result(mode, n) == null) return n;
            return Mathf.Min(p.unlocked, GameData.Count(mode));
        }

        /// <summary>Records a win; returns the previous result (null on a first clear).</summary>
        public static LevelResult RecordWin(string mode, int n, int stars, int moves, int time)
        {
            var p = Mode(mode);
            var prev = Result(mode, n);
            LevelResult before = prev == null ? null : new LevelResult { n = n, stars = prev.stars, bestMoves = prev.bestMoves, bestTime = prev.bestTime };
            if (prev == null) p.levels.Add(new LevelResult { n = n, stars = stars, bestMoves = moves, bestTime = time });
            else { prev.stars = Mathf.Max(prev.stars, stars); prev.bestMoves = Mathf.Min(prev.bestMoves, moves); prev.bestTime = Mathf.Min(prev.bestTime, time); }
            p.unlocked = Mathf.Min(Mathf.Max(p.unlocked, n + 1), GameData.Count(mode));
            Data.hasCurrent = false;
            Data.current = null;
            Save();
            return before;
        }

        public static DailyResult DailyResultFor(string key) => Data.daily.Find(d => d.key == key);

        public static DailyResult RecordDaily(string key, int stars, int moves, int time)
        {
            var prev = DailyResultFor(key);
            DailyResult before = prev == null ? null : new DailyResult { key = key, stars = prev.stars, bestMoves = prev.bestMoves, bestTime = prev.bestTime };
            if (prev == null)
            {
                Data.daily.Add(new DailyResult { key = key, stars = stars, bestMoves = moves, bestTime = time });
                string yesterday = LevelRules.DailyKey(DateTime.ParseExact(key, "yyyy-MM-dd", null).AddDays(-1));
                Data.dailyStreak = Data.dailyLastDone == yesterday ? Data.dailyStreak + 1 : 1;
                Data.dailyLastDone = key;
                if (Data.daily.Count > 60) Data.daily.RemoveAt(0);
            }
            else { prev.stars = Mathf.Max(prev.stars, stars); prev.bestMoves = Mathf.Min(prev.bestMoves, moves); prev.bestTime = Mathf.Min(prev.bestTime, time); }
            Data.hasCurrent = false;
            Data.current = null;
            Save();
            return before;
        }

        public static void SaveCurrent(CurrentGame cur)
        {
            Data.current = cur;
            Data.hasCurrent = cur != null;
            Save();
        }

        public static CurrentGame Current => Data.hasCurrent ? Data.current : null;

        public static void ResetProgress()
        {
            var keep = Data.settings;
            var day = Data.rewards?.day;
            var adDay = Data.rewards?.adDay;
            data = new SaveData { settings = keep };
            Load2();
            if (day != null) data.rewards.day = day; // today's gift/ad counts survive a reset
            if (adDay != null) data.rewards.adDay = adDay;
            Save();
        }

        static void Load2()
        {
            foreach (var m in GameData.ModeIds) data.progress.Add(new ModeProgress { mode = m });
            data.rewards = Rewards.DefaultState(GameData.Rewards);
        }

        // ---------- cosmetics ----------
        public static BallSkin SelectedBall()
        {
            var skins = GameData.Skins.skins;
            var s = skins.Find(k => k.id == Data.ball);
            if (s != null && Rewards.BallOwned(Data.rewards, new SkinCost(s.id, s.cost), AllStars())) return s;
            return skins.Find(k => k.id == GameData.Skins.defaultBall) ?? skins[0];
        }

        public static ThemeDef Theme()
        {
            var cfg = GameData.Rewards;
            var t = cfg.themes.Find(x => x.id == Data.rewards.theme);
            return t != null && Rewards.ThemeOwned(Data.rewards, cfg, t.id) ? t : Rewards.DefaultTheme(cfg);
        }
    }
}
