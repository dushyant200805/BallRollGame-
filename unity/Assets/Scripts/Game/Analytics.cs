// Ball Roll — analytics. A single facade the whole game logs through, backed by swappable providers.
//
// Today it ships a DebugAnalyticsProvider that writes every event to logcat ("[Analytics]") and to a
// rolling local file (analytics-events.log in persistentDataPath) so the event stream can be verified
// on the emulator and on a device without any cloud account. When your Firebase or Unity Analytics
// account is ready, implement IAnalyticsProvider with that SDK and register it in Analytics.Init --
// the event names and parameters below are the contract and don't change.
//
// Respecting consent: events are only sent once consent allows it (see Analytics.SetEnabled, driven
// by the UMP consent flow in AdsManager). Nothing is sent before the player has been counted in, and
// turning analytics off in Settings stops collection.
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace BallRoll
{
    /// <summary>A sink for analytics events. Add a Firebase/Unity implementation later.</summary>
    public interface IAnalyticsProvider
    {
        void LogEvent(string name, IReadOnlyDictionary<string, object> parameters);
        void SetUserProperty(string key, string value);
        void Flush();
    }

    public static class Analytics
    {
        static IAnalyticsProvider provider;
        static bool enabled = true;      // consent / settings gate
        static bool started;
        static float sessionStart;
        static readonly Dictionary<string, object> scratch = new Dictionary<string, object>();

        /// <summary>Called once at start-up. Registers the debug provider (and later a real one).</summary>
        public static void Init()
        {
            if (started) return;
            started = true;
            sessionStart = Time.realtimeSinceStartup;
            provider ??= new DebugAnalyticsProvider();
            SetUserProperty("ball", SaveSystem.Data.ball);
            SetUserProperty("theme", SaveSystem.Theme().id);
            Log("session_start", "levels_done", SaveSystem.CompletedLevels(), "stars", SaveSystem.AllStars(), "coins", SaveSystem.Data.rewards.coins);
        }

        /// <summary>Swap in a real provider (Firebase / Unity Analytics) once credentials exist.</summary>
        public static void UseProvider(IAnalyticsProvider p) => provider = p;

        /// <summary>Consent / Settings gate. When false, nothing is collected or sent.</summary>
        public static void SetEnabled(bool on)
        {
            if (enabled == on) return;
            enabled = on;
            Log("analytics_consent", "enabled", on);
        }

        public static void SetUserProperty(string key, string value)
        {
            if (!enabled || provider == null) return;
            provider.SetUserProperty(key, value);
        }

        /// <summary>Log an event with alternating key, value, key, value ... parameters.</summary>
        public static void Log(string name, params object[] kv)
        {
            if (!enabled || provider == null) return;
            scratch.Clear();
            for (int i = 0; i + 1 < kv.Length; i += 2) scratch[kv[i].ToString()] = kv[i + 1];
            provider.LogEvent(name, scratch);
        }

        public static void SessionEnd()
        {
            if (!enabled || provider == null) return;
            Log("session_end", "seconds", Mathf.RoundToInt(Time.realtimeSinceStartup - sessionStart));
            provider.Flush();
        }

        // ---- typed helpers for the game's key moments (one place defines the taxonomy) ----
        public static void LevelStart(string mode, int number, bool resumed) =>
            Log("level_start", "mode", mode, "level", number, "resumed", resumed);

        public static void LevelComplete(string mode, int number, int stars, int moves, int par, int timeSec, int hints) =>
            Log("level_complete", "mode", mode, "level", number, "stars", stars, "moves", moves, "par", par, "time", timeSec, "hints", hints);

        public static void LevelFail(string mode, int number, string reason, int moves) =>
            Log("level_fail", "mode", mode, "level", number, "reason", reason, "moves", moves);

        public static void HintUsed(string mode, int number) => Log("hint_used", "mode", mode, "level", number);

        public static void AdRequest(string placement) => Log("ad_request", "placement", placement);
        public static void AdShown(string placement, string format) => Log("ad_shown", "placement", placement, "format", format);
        public static void AdReward(string placement) => Log("ad_reward", "placement", placement);
        public static void AdFailed(string placement, string why) => Log("ad_failed", "placement", placement, "reason", why);

        public static void GiftOpened(string source, string type, string item, int amount) =>
            Log("gift_opened", "source", source, "type", type, "item", item ?? "", "amount", amount);

        public static void CoinsEarned(int amount, string source, int balance) =>
            Log("coins_earned", "amount", amount, "source", source, "balance", balance);
        public static void CoinsSpent(int amount, string reason, int balance) =>
            Log("coins_spent", "amount", amount, "reason", reason, "balance", balance);

        public static void BallSelected(string id) { SetUserProperty("ball", id); Log("ball_selected", "id", id); }
        public static void BallUnlocked(string id, string via, int price) => Log("ball_unlocked", "id", id, "via", via, "price", price);
        public static void ThemeSelected(string id) { SetUserProperty("theme", id); Log("theme_selected", "id", id); }
        public static void ScreenView(string screen) => Log("screen_view", "screen", screen);
        public static void RemoveAdsPurchased() => Log("remove_ads_purchased");

        static void Log(string name, string k, object v) => Log(name, new object[] { k, v });
    }

    /// <summary>Writes events to logcat and to a rolling local file. For development / QA.</summary>
    public sealed class DebugAnalyticsProvider : IAnalyticsProvider
    {
        readonly string path;
        readonly StringBuilder pending = new StringBuilder();
        int count;

        public DebugAnalyticsProvider()
        {
            path = System.IO.Path.Combine(Application.persistentDataPath, "analytics-events.log");
            try { if (System.IO.File.Exists(path) && new System.IO.FileInfo(path).Length > 256 * 1024) System.IO.File.Delete(path); }
            catch { /* ignore */ }
        }

        public void LogEvent(string name, IReadOnlyDictionary<string, object> parameters)
        {
            var sb = new StringBuilder(name);
            if (parameters != null)
                foreach (var kv in parameters) sb.Append(' ').Append(kv.Key).Append('=').Append(kv.Value);
            string line = sb.ToString();
            Debug.Log("[Analytics] " + line);
            pending.Append(System.DateTime.Now.ToString("HH:mm:ss")).Append("  ").Append(line).Append('\n');
            if (++count % 10 == 0) Flush();
        }

        public void SetUserProperty(string key, string value) => Debug.Log($"[Analytics] userprop {key}={value}");

        public void Flush()
        {
            if (pending.Length == 0) return;
            try { System.IO.File.AppendAllText(path, pending.ToString()); pending.Clear(); }
            catch (System.Exception e) { Debug.LogWarning("[Analytics] file write failed: " + e.Message); }
        }
    }
}
