// Ball Roll — reward rules: gifts with no duplicate cosmetics, daily gift costs, milestones,
// ball shop and coin ads. Port of js/core/rewards.js. The config classes match
// Resources/Data/rewards-config.json (exported by tools/export-unity.js).
using System;
using System.Collections.Generic;

namespace BallRoll.Core
{
    // ---------- config (JsonUtility-friendly: public lowercase fields) ----------
    [Serializable] public sealed class TypeWeight { public string type; public int weight; }
    [Serializable] public sealed class GiftRules { public List<TypeWeight> weights = new List<TypeWeight>(); public int[] coins = { 1, 1 }; public int[] moves = { 1, 1 }; }
    [Serializable] public sealed class MilestoneRules { public int every = 10; public List<TypeWeight> weights = new List<TypeWeight>(); public int[] coins = { 1, 1 }; public int[] moves = { 1, 1 }; }
    [Serializable] public sealed class DailyRules { public int baseCost = 25; public int costMultiplier = 2; public int maxPerDay; public List<TypeWeight> weights = new List<TypeWeight>(); public int[] coins = { 1, 1 }; public int[] moves = { 1, 1 }; }
    [Serializable] public sealed class PriceOverride { public string id; public int price; }
    [Serializable] public sealed class ShopRules { public int coinsPerStar = 5; public int adCoins = 25; public int adsPerDay = 2; public List<PriceOverride> prices = new List<PriceOverride>(); }
    [Serializable] public sealed class ExtraMovesAdRules { public int moves = 3; public int perLevel = 1; }
    [Serializable] public sealed class AdRules { public int seconds = 5; public int loadMs = 900; public string simulate = "ok"; }
    [Serializable] public sealed class RewardTypeInfo { public string type; public string label; public string art; }
    [Serializable] public sealed class ThemeDef { public string id; public string name; public bool isDefault; public string[] bg; public string[] glow; public string[] tray; }

    [Serializable]
    public sealed class RewardsConfig
    {
        public int firstClearCoins = 5;
        public int extraMovesPerUse = 3;
        public MilestoneRules milestone = new MilestoneRules();
        public DailyRules daily = new DailyRules();
        public ShopRules shop = new ShopRules();
        public ExtraMovesAdRules extraMovesAd = new ExtraMovesAdRules();
        public AdRules ad = new AdRules();
        public int historyLimit = 30;
        public List<RewardTypeInfo> types = new List<RewardTypeInfo>();
        public List<ThemeDef> themes = new List<ThemeDef>();
    }

    // ---------- persisted state ----------
    [Serializable] public sealed class DayCount { public string key; public int count; }

    [Serializable]
    public sealed class HistoryEntry
    {
        public int id;
        public long t;          // unix ms
        public string source;   // daily | milestone | shop | ad
        public string type;     // ball | sound | theme | moves | coins
        public string item;
        public int amount;
        public int price;
    }

    [Serializable]
    public sealed class RewardState
    {
        public int coins;
        public int extraMoves;
        public List<string> balls = new List<string>();
        public List<string> sounds = new List<string>();
        public List<string> themes = new List<string>();
        public string theme;
        public string rollSound = "";
        public int milestonesClaimed;
        public DayCount day = new DayCount();    // daily gifts opened today
        public DayCount adDay = new DayCount();  // coin ads watched today
        public List<HistoryEntry> history = new List<HistoryEntry>();
        public int seq;
    }

    public struct SkinCost { public string Id; public int Cost; public SkinCost(string id, int cost) { Id = id; Cost = cost; } }

    public sealed class RewardEnv
    {
        public RewardsConfig Cfg;
        public List<SkinCost> Skins;
        public int Stars;
    }

    public sealed class Reward { public string Type; public string Item; public int Amount; }

    public enum DailyKind { Ad, Coins, Limit }
    public struct DailyNext { public DailyKind Kind; public int Cost; public int Opened; }
    public struct MilestoneStatus { public int Every, Completed, Available, Progress, NextAt; }
    public struct AdCoinsStatus { public int Max, Left, Coins; }

    public static class Rewards
    {
        public static ThemeDef DefaultTheme(RewardsConfig cfg) => cfg.themes.Find(t => t.isDefault) ?? cfg.themes[0];

        public static RewardState DefaultState(RewardsConfig cfg) => new RewardState { theme = DefaultTheme(cfg).id };

        // ---- ownership ----
        public static bool BallOwned(RewardState s, SkinCost skin, int stars) => stars >= skin.Cost || s.balls.Contains(skin.Id);

        public static bool SoundOwned(RewardState s, string id, RewardEnv env)
        {
            if (s.sounds.Contains(id)) return true;
            int i = env.Skins.FindIndex(k => k.Id == id);
            return i >= 0 && BallOwned(s, env.Skins[i], env.Stars);
        }

        public static bool ThemeOwned(RewardState s, RewardsConfig cfg, string id)
        {
            var t = cfg.themes.Find(x => x.id == id);
            return t != null && (t.isDefault || s.themes.Contains(id));
        }

        /// <summary>Cosmetics not owned yet (what a gift may give); null for moves / coins.</summary>
        public static List<string> EligibleItems(string type, RewardState s, RewardEnv env)
        {
            var list = new List<string>();
            switch (type)
            {
                case "ball": foreach (var k in env.Skins) if (!BallOwned(s, k, env.Stars)) list.Add(k.Id); return list;
                case "sound": foreach (var k in env.Skins) if (!SoundOwned(s, k.Id, env)) list.Add(k.Id); return list;
                case "theme": foreach (var t in env.Cfg.themes) if (!ThemeOwned(s, env.Cfg, t.id)) list.Add(t.id); return list;
                default: return null;
            }
        }

        static int RandInt(Func<double> rand, int[] range) => range[0] + (int)Math.Floor(rand() * (range[1] - range[0] + 1));

        /// <summary>Pick ONE reward. A cosmetic type with nothing left drops out (no duplicates).</summary>
        public static Reward PickReward(string source, RewardState s, RewardEnv env, Func<double> rand)
        {
            List<TypeWeight> weights;
            int[] coins, moves;
            if (source == "milestone") { weights = env.Cfg.milestone.weights; coins = env.Cfg.milestone.coins; moves = env.Cfg.milestone.moves; }
            else { weights = env.Cfg.daily.weights; coins = env.Cfg.daily.coins; moves = env.Cfg.daily.moves; }

            var pool = new List<(string type, int w, List<string> items)>();
            foreach (var tw in weights)
            {
                if (tw.weight <= 0) continue;
                var items = EligibleItems(tw.type, s, env);
                if (items != null && items.Count == 0) continue;
                pool.Add((tw.type, tw.weight, items));
            }
            if (pool.Count == 0) return null;
            int total = 0;
            foreach (var p in pool) total += p.w;
            double r = rand() * total;
            var chosen = pool[pool.Count - 1];
            foreach (var p in pool) { r -= p.w; if (r < 0) { chosen = p; break; } }
            if (chosen.items != null) return new Reward { Type = chosen.type, Item = chosen.items[(int)Math.Floor(rand() * chosen.items.Count)] };
            return new Reward { Type = chosen.type, Amount = RandInt(rand, chosen.type == "coins" ? coins : moves) };
        }

        static HistoryEntry Log(RewardState s, RewardsConfig cfg, HistoryEntry e, long now)
        {
            s.seq += 1;
            e.id = s.seq;
            e.t = now;
            s.history.Insert(0, e);
            int limit = cfg.historyLimit > 0 ? cfg.historyLimit : 30;
            if (s.history.Count > limit) s.history.RemoveRange(limit, s.history.Count - limit);
            return e;
        }

        /// <summary>Apply a reward and log it. Cosmetics already owned are refused (null).</summary>
        public static HistoryEntry Grant(Reward reward, string source, RewardState s, RewardEnv env, long now)
        {
            if (reward == null) return null;
            switch (reward.Type)
            {
                case "ball":
                case "sound":
                case "theme":
                    var items = EligibleItems(reward.Type, s, env);
                    if (!items.Contains(reward.Item)) return null;
                    (reward.Type == "ball" ? s.balls : reward.Type == "sound" ? s.sounds : s.themes).Add(reward.Item);
                    break;
                case "coins": s.coins += reward.Amount; break;
                case "moves": s.extraMoves += reward.Amount; break;
                default: return null;
            }
            return Log(s, env.Cfg, new HistoryEntry { source = source, type = reward.Type, item = reward.Item, amount = reward.Amount }, now);
        }

        // ---- daily gifts ----
        /// <summary>A new day starts only when the date moves FORWARD (YYYY-MM-DD keys sort by date),
        /// so setting the device clock back can't be used to farm gifts.</summary>
        static bool IsNewDay(DayCount stored, string today) => stored == null || string.IsNullOrEmpty(stored.key) || string.CompareOrdinal(today, stored.key) > 0;

        public static DayCount RollDay(RewardState s, string today)
        {
            if (IsNewDay(s.day, today)) s.day = new DayCount { key = today, count = 0 };
            return s.day;
        }

        public static int DailyCost(RewardsConfig cfg, int opened) => (int)Math.Round(cfg.daily.baseCost * Math.Pow(cfg.daily.costMultiplier, opened - 1));

        public static DailyNext NextDaily(RewardState s, RewardsConfig cfg, string today)
        {
            int opened = RollDay(s, today).count;
            if (cfg.daily.maxPerDay > 0 && opened >= cfg.daily.maxPerDay) return new DailyNext { Kind = DailyKind.Limit, Opened = opened };
            if (opened == 0) return new DailyNext { Kind = DailyKind.Ad, Opened = 0 };
            return new DailyNext { Kind = DailyKind.Coins, Cost = DailyCost(cfg, opened), Opened = opened };
        }

        // ---- milestones ----
        public static MilestoneStatus Milestone(RewardState s, RewardsConfig cfg, int completed)
        {
            int every = cfg.milestone.every, earned = completed / every;
            return new MilestoneStatus
            {
                Every = every, Completed = completed, Available = Math.Max(0, earned - s.milestonesClaimed),
                Progress = completed % every, NextAt = (earned + 1) * every,
            };
        }

        // ---- ball shop & coin ads ----
        public static int BallPrice(RewardsConfig cfg, SkinCost skin)
        {
            var o = cfg.shop.prices?.Find(p => p.id == skin.Id);
            return o != null ? o.price : skin.Cost * cfg.shop.coinsPerStar;
        }

        /// <summary>Buy a locked ball at the confirmed price. reason: owned | coins | state.</summary>
        public static HistoryEntry BuyBall(RewardState s, RewardEnv env, string id, int expectedPrice, long now, out string reason)
        {
            reason = null;
            int i = env.Skins.FindIndex(k => k.Id == id);
            if (i < 0) { reason = "state"; return null; }
            var skin = env.Skins[i];
            if (BallOwned(s, skin, env.Stars)) { reason = "owned"; return null; }
            int price = BallPrice(env.Cfg, skin);
            if (price != expectedPrice) { reason = "state"; return null; }
            if (s.coins < price) { reason = "coins"; return null; }
            s.coins -= price;
            s.balls.Add(id);
            return Log(s, env.Cfg, new HistoryEntry { source = "shop", type = "ball", item = id, price = price }, now);
        }

        public static AdCoinsStatus AdCoins(RewardState s, RewardsConfig cfg, string today)
        {
            if (IsNewDay(s.adDay, today)) s.adDay = new DayCount { key = today, count = 0 };
            int max = cfg.shop.adsPerDay;
            return new AdCoinsStatus { Max = max, Left = max > 0 ? Math.Max(0, max - s.adDay.count) : 99, Coins = cfg.shop.adCoins };
        }

        public static HistoryEntry GrantAdCoins(RewardState s, RewardsConfig cfg, string today, long now)
        {
            if (AdCoins(s, cfg, today).Left == 0) return null;
            s.adDay.count += 1;
            s.coins += cfg.shop.adCoins;
            return Log(s, cfg, new HistoryEntry { source = "ad", type = "coins", amount = cfg.shop.adCoins }, now);
        }
    }
}
