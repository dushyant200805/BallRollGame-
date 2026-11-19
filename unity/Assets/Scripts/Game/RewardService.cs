// Ball Roll — reward service (port of js/game/reward-manager.js): coins, extra moves, milestone
// and daily gifts, ball shop, coin ads, themes and rolling sounds on top of the C# rules in
// Core/Rewards.cs. Every claim is guarded (one transaction at a time) and saved immediately.
// AdService is the simulated rewarded ad (load → play → reward, or load error + retry) that stands
// in for the Google Mobile Ads SDK until AdMob is set up.
using System;
using System.Collections;
using BallRoll.Art;
using BallRoll.Core;
using BallRoll.UI;
using UnityEngine;
using UnityEngine.UI;

namespace BallRoll
{
    public static class RewardService
    {
        static bool busy;
        public static bool Busy => busy;
        public static RewardsConfig Cfg => GameData.Rewards;
        public static RewardState State => SaveSystem.Data.rewards;
        static string Today => LevelRules.DailyKey(DateTime.Now);
        static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static RewardEnv Env() => new RewardEnv { Cfg = Cfg, Skins = GameData.SkinCosts(), Stars = SaveSystem.AllStars() };

        public static MilestoneStatus Milestone() => Rewards.Milestone(State, Cfg, SaveSystem.CompletedLevels());
        public static DailyNext NextDaily() => Rewards.NextDaily(State, Cfg, Today);
        public static AdCoinsStatus AdCoins() => Rewards.AdCoins(State, Cfg, Today);
        public static int ReadyCount() => Milestone().Available + (NextDaily().Kind == DailyKind.Ad ? 1 : 0);

        public static bool IsBallOwned(BallSkin s) => Rewards.BallOwned(State, new SkinCost(s.id, s.cost), SaveSystem.AllStars());
        public static bool IsSoundOwned(string id) => Rewards.SoundOwned(State, id, Env());
        public static bool IsThemeOwned(string id) => Rewards.ThemeOwned(State, Cfg, id);
        public static int BallPrice(BallSkin s) => Rewards.BallPrice(Cfg, new SkinCost(s.id, s.cost));

        static HistoryEntry Give(string source)
        {
            var env = Env();
            var e = Rewards.Grant(Rewards.PickReward(source, State, env, () => UnityEngine.Random.value), source, State, env, Now);
            SaveSystem.Save();
            return e;
        }

        public static HistoryEntry OpenMilestone()
        {
            if (busy || Milestone().Available < 1) return null;
            busy = true;
            try { State.milestonesClaimed += 1; return Give("milestone"); } // claimed before granting: never twice
            finally { busy = false; }
        }

        /// <summary>First daily gift: plays the rewarded ad; done(entry, failedToLoad).</summary>
        public static void OpenDailyWithAd(Action<HistoryEntry, bool> done)
        {
            if (busy || NextDaily().Kind != DailyKind.Ad) { done(null, false); return; }
            busy = true;
            AdService.ShowRewarded((watched, failed) =>
            {
                busy = false;
                if (!watched || NextDaily().Kind != DailyKind.Ad) { done(null, failed); return; }
                State.day.count += 1;
                done(Give("daily"), false);
            });
        }

        /// <summary>Extra daily gift for coins at the price the player confirmed. reason: busy|state|coins.</summary>
        public static HistoryEntry OpenDailyWithCoins(int expectedCost, out string reason)
        {
            reason = null;
            if (busy) { reason = "busy"; return null; }
            var next = NextDaily();
            if (next.Kind != DailyKind.Coins || next.Cost != expectedCost) { reason = "state"; return null; }
            if (State.coins < next.Cost) { reason = "coins"; return null; }
            busy = true;
            try { State.coins -= next.Cost; State.day.count += 1; return Give("daily"); }
            finally { busy = false; }
        }

        public static HistoryEntry BuyBall(BallSkin s, int expectedPrice, out string reason)
        {
            reason = "busy";
            if (busy) return null;
            busy = true;
            try
            {
                var e = Rewards.BuyBall(State, Env(), s.id, expectedPrice, Now, out reason);
                if (e != null) SaveSystem.Save();
                return e;
            }
            finally { busy = false; }
        }

        public static void WatchAdForCoins(Action<HistoryEntry, string> done)
        {
            if (busy) { done(null, "busy"); return; }
            if (AdCoins().Left == 0) { done(null, "limit"); return; }
            busy = true;
            AdService.ShowRewarded((watched, failed) =>
            {
                busy = false;
                if (!watched) { done(null, failed ? "failed" : "ad"); return; }
                var e = Rewards.GrantAdCoins(State, Cfg, Today, Now);
                if (e != null) SaveSystem.Save();
                done(e, e == null ? "limit" : null);
            });
        }

        public static int TakeExtraMoves()
        {
            int n = Mathf.Min(Cfg.extraMovesPerUse, State.extraMoves);
            if (n <= 0) return 0;
            State.extraMoves -= n;
            SaveSystem.Save();
            return n;
        }

        public static bool SetTheme(string id)
        {
            if (!IsThemeOwned(id)) return false;
            State.theme = id;
            SaveSystem.Save();
            return true;
        }

        public static bool SetRollSound(string id)
        {
            if (!string.IsNullOrEmpty(id) && !IsSoundOwned(id)) return false;
            State.rollSound = id ?? "";
            SaveSystem.Save();
            return true;
        }

        /// <summary>The rolling sound in use: the chosen one, else the selected ball's own sound.</summary>
        public static string RollSoundId()
        {
            var id = State.rollSound;
            return !string.IsNullOrEmpty(id) && IsSoundOwned(id) ? id : SaveSystem.SelectedBall().id;
        }

        public static (string label, string name) Describe(HistoryEntry e)
        {
            var type = Cfg.types.Find(t => t.type == e.type);
            string label = type != null ? type.label : e.type;
            var skin = GameData.Skins.skins.Find(s => s.id == e.item);
            string name = e.type switch
            {
                "ball" => skin?.name ?? e.item,
                "sound" => (skin?.name ?? e.item) + " sound",
                "theme" => Cfg.themes.Find(t => t.id == e.item)?.name ?? e.item,
                "coins" => e.amount + " Coins",
                "moves" => "+" + e.amount + " Extra Moves",
                _ => e.type,
            };
            return (label, name);
        }

        public static string SourceLabel(HistoryEntry e) => e.source switch
        {
            "milestone" => "Milestone gift",
            "shop" => "Bought for " + e.price + " coins",
            "ad" => "Watched an ad",
            _ => "Daily gift",
        };
    }

    /// <summary>Simulated rewarded ad (clearly labelled as a test ad). Replace with the Google Mobile
    /// Ads SDK later: callers only need done(watchedToTheEnd, failedToLoad).</summary>
    public sealed class AdService : MonoBehaviour
    {
        static AdService active;
        Action<bool, bool> done;
        Text timer, info;
        GameButton claim, retry;
        int left;
        bool failed;

        public static void ShowRewarded(Action<bool, bool> done)
        {
            if (active != null) { done(false, false); return; } // one ad at a time
            var root = UIKit.Rect("Ad", App.I.Root);
            UIKit.Stretch(root, -200, -200, -200, -200);
            root.SetAsLastSibling();
            root.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0.94f);
            active = root.gameObject.AddComponent<AdService>();
            active.done = done;
            active.Build(root);
        }

        void Build(RectTransform root)
        {
            var tag = UIKit.Box(root, Palette.Gold, 12, "Tag");
            UIKit.Place(tag.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(90, 54), new Vector2(-400, 760));
            var tt = UIKit.Label(tag.rectTransform, "Ad", 32, Painter.Hex("#5a3d00")); UIKit.Stretch(tt.rectTransform);
            timer = UIKit.Label(root, "Loading…", 36, Palette.InkDim, TextAnchor.MiddleLeft, false);
            UIKit.Place(timer.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(560, 60), new Vector2(-60, 760));
            var close = UIKit.Button(root, "X", Palette.Cream, Palette.CreamEdge, Palette.PanelInk, () => Finish(false), 40);
            UIKit.Place((RectTransform)close.transform, new Vector2(0.5f, 0.5f), new Vector2(110, 110), new Vector2(400, 760));

            var card = UIKit.Box(root, Painter.Hex("#24425f"), 50, "Creative");
            UIKit.Place(card.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(820, 1100), new Vector2(0, 60));
            info = UIKit.Label(card.rectTransform, "Loading ad…", 48, Palette.Ink);
            UIKit.Stretch(info.rectTransform, 40, 40, 40, 40);
            retry = UIKit.Primary(card.rectTransform, "Try again", () => StartCoroutine(Load()));
            UIKit.Place((RectTransform)retry.transform, new Vector2(0.5f, 0.2f), new Vector2(520, 130));
            retry.gameObject.SetActive(false);

            claim = UIKit.Primary(root, "Claim reward", () => Finish(true));
            UIKit.Place((RectTransform)claim.transform, new Vector2(0.5f, 0.5f), new Vector2(820, 140), new Vector2(0, -600));
            claim.Interactable = false;
            var note = UIKit.Label(root, "Test ad (simulated). No real advertising is shown.", 30, Palette.InkDim, TextAnchor.MiddleCenter, false);
            UIKit.Place(note.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(900, 60), new Vector2(0, -710));
            StartCoroutine(Load());
        }

        IEnumerator Load()
        {
            var cfg = RewardService.Cfg.ad;
            failed = false;
            retry.gameObject.SetActive(false);
            claim.Interactable = false;
            info.text = "Loading ad…";
            timer.text = "Loading…";
            yield return new WaitForSecondsRealtime(cfg.loadMs / 1000f);
            bool offline = cfg.simulate == "offline";
            if (cfg.simulate != "ok")
            {
                failed = true;
                info.text = offline ? "No internet connection.\nConnect and try again." : "Ad not available right now.\nPlease try again.";
                timer.text = "Ad failed to load";
                retry.gameObject.SetActive(true);
                yield break;
            }
            info.text = "<size=80><b>Your Ad Here</b></size>\n\nTest rewarded ad";
            info.supportRichText = true;
            for (left = cfg.seconds; left > 0; left--)
            {
                timer.text = "Reward in " + left + "s";
                yield return new WaitForSecondsRealtime(1f); // coroutines pause while the app is in the background
            }
            timer.text = "Reward unlocked";
            claim.Interactable = true;
        }

        void Finish(bool claimed)
        {
            if (claimed && !claim.Interactable) return;
            var cb = done;
            done = null;
            active = null;
            Destroy(gameObject);
            cb?.Invoke(claimed, !claimed && failed);
        }
    }
}
