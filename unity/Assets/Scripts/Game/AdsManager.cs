// Ball Roll — Google Mobile Ads (AdMob) integration: consent (UMP), rewarded ads, interstitials at
// natural breaks with a frequency cap, and an adaptive banner on menu screens only.
//
// The unit IDs below are Google's official TEST units: they always serve test ads, are safe to tap,
// and never earn money. Replace them with your own AdMob units (and set BALLROLL_ADMOB_APP_ID for
// the build) once your AdMob account and app are set up.
using System;
using GoogleMobileAds.Api;
using GoogleMobileAds.Ump.Api;
using UnityEngine;

namespace BallRoll
{
    public static class AdsConfig
    {
        public const string Rewarded = "ca-app-pub-3940256099942544/5224354917";      // test rewarded
        public const string Interstitial = "ca-app-pub-3940256099942544/1033173712";  // test interstitial
        public const string Banner = "ca-app-pub-3940256099942544/9214589741";        // test adaptive banner
        public const int InterstitialEveryLevels = 3;   // at most one interstitial per 3 finished levels
        public const float InterstitialCooldown = 90f;  // seconds since the last full-screen ad
    }

    public static class AdsManager
    {
        static bool started, initialized;
        static RewardedAd rewarded;
        static InterstitialAd interstitial;
        static BannerView banner;
        static bool rewardedLoading, interstitialLoading, bannerWanted;
        static float lastFullScreen = -999f;
        static int levelsSinceInterstitial;

        public static bool Initialized => initialized;
        public static bool RewardedReady => rewarded != null && rewarded.CanShowAd();
        public static bool NoAds => SaveSystem.Data.noAds;
        public static float BannerHeightPx { get; private set; }
        public static event Action BannerChanged;
        public static bool PrivacyOptionsRequired =>
            initialized && ConsentInformation.PrivacyOptionsRequirementStatus == PrivacyOptionsRequirementStatus.Required;

        static void Log(string m) => Debug.Log("[Ads] " + m);

        /// <summary>Consent first (GDPR/UMP), then initialise the SDK and preload ads.</summary>
        public static void Start()
        {
            if (started) return;
            started = true;
            MobileAds.RaiseAdEventsOnUnityMainThread = true;
            ConsentInformation.Update(new ConsentRequestParameters(), err =>
            {
                if (err != null) { Log("consent info error: " + err.Message); Init(); return; }
                ConsentForm.LoadAndShowConsentFormIfRequired(formErr =>
                {
                    if (formErr != null) Log("consent form error: " + formErr.Message);
                    Init();
                });
            });
        }

        static void Init()
        {
            if (!ConsentInformation.CanRequestAds()) { Log("consent: cannot request ads yet"); return; }
            MobileAds.Initialize(_ =>
            {
                initialized = true;
                Log("SDK initialised");
                LoadRewarded();
                if (!NoAds) LoadInterstitial();
                if (bannerWanted) ShowBanner(true);
            });
        }

        public static void ShowPrivacyOptions(Action done) =>
            ConsentForm.ShowPrivacyOptionsForm(err => { if (err != null) Log("privacy form error: " + err.Message); done?.Invoke(); });

        // ---------- rewarded ----------
        public static void LoadRewarded(Action<bool> loaded = null)
        {
            if (!initialized) { loaded?.Invoke(false); return; }
            if (RewardedReady) { loaded?.Invoke(true); return; }
            if (rewardedLoading) return;
            rewardedLoading = true;
            RewardedAd.Load(AdsConfig.Rewarded, new AdRequest(), (ad, error) =>
            {
                rewardedLoading = false;
                if (error != null || ad == null) { Log("rewarded load failed: " + error?.GetMessage()); Analytics.AdFailed("rewarded", "load"); loaded?.Invoke(false); return; }
                rewarded = ad;
                Log("rewarded loaded");
                loaded?.Invoke(true);
            });
        }

        /// <summary>Shows the loaded rewarded ad; done(earnedReward) when it closes.</summary>
        public static void ShowRewarded(Action<bool> done)
        {
            if (!RewardedReady) { done(false); return; }
            var ad = rewarded;
            rewarded = null;
            bool earned = false, finished = false;
            void Finish()
            {
                if (finished) return;
                finished = true;
                lastFullScreen = Time.realtimeSinceStartup;
                ad.Destroy();
                LoadRewarded();
                Sfx.StartMusic();
                done(earned);
            }
            ad.OnAdFullScreenContentClosed += Finish;
            ad.OnAdFullScreenContentFailed += e => { Log("rewarded show failed: " + e.GetMessage()); Finish(); };
            Log("rewarded show");
            Analytics.AdShown("rewarded", "rewarded");
            ad.Show(reward => { earned = true; Analytics.AdReward("rewarded"); Log($"reward earned: {reward.Amount} {reward.Type}"); });
        }

        // ---------- interstitial ----------
        static void LoadInterstitial()
        {
            if (!initialized || NoAds || interstitialLoading || (interstitial != null && interstitial.CanShowAd())) return;
            interstitialLoading = true;
            InterstitialAd.Load(AdsConfig.Interstitial, new AdRequest(), (ad, error) =>
            {
                interstitialLoading = false;
                if (error != null || ad == null) { Log("interstitial load failed: " + error?.GetMessage()); return; }
                interstitial = ad;
                Log("interstitial loaded");
            });
        }

        /// <summary>Call at a natural break (after a level, before the next screen). Shows an
        /// interstitial only every few levels and never right after another full-screen ad;
        /// `then` always runs (after the ad closes, or straight away).</summary>
        public static void LevelBreak(Action then)
        {
            levelsSinceInterstitial++;
            bool due = levelsSinceInterstitial >= AdsConfig.InterstitialEveryLevels &&
                       Time.realtimeSinceStartup - lastFullScreen >= AdsConfig.InterstitialCooldown;
            if (NoAds || !due || interstitial == null || !interstitial.CanShowAd()) { then?.Invoke(); LoadInterstitial(); return; }
            var ad = interstitial;
            interstitial = null;
            bool finished = false;
            void Finish()
            {
                if (finished) return;
                finished = true;
                levelsSinceInterstitial = 0;
                lastFullScreen = Time.realtimeSinceStartup;
                ad.Destroy();
                LoadInterstitial();
                Sfx.StartMusic();
                then?.Invoke();
            }
            ad.OnAdFullScreenContentClosed += Finish;
            ad.OnAdFullScreenContentFailed += e => { Log("interstitial show failed: " + e.GetMessage()); Finish(); };
            Log("interstitial show");
            Analytics.AdShown("level_break", "interstitial");
            ad.Show();
        }

        // ---------- banner ----------
        /// <summary>Menu screens want a banner; gameplay never shows one.</summary>
        public static void ShowBanner(bool want)
        {
            bannerWanted = want && !NoAds;
            if (!initialized) return;
            if (!bannerWanted)
            {
                if (banner != null) { banner.Hide(); SetBannerHeight(0); }
                return;
            }
            if (banner == null)
            {
                var size = AdSize.GetCurrentOrientationAnchoredAdaptiveBannerAdSizeWithWidth(AdSize.FullWidth);
                banner = new BannerView(AdsConfig.Banner, size, AdPosition.Bottom);
                banner.OnBannerAdLoaded += () => { Log("banner loaded"); if (bannerWanted) SetBannerHeight(banner.GetHeightInPixels()); else banner.Hide(); };
                banner.OnBannerAdLoadFailed += e => { Log("banner load failed: " + e.GetMessage()); SetBannerHeight(0); };
                banner.LoadAd(new AdRequest());
            }
            else
            {
                banner.Show();
                SetBannerHeight(banner.GetHeightInPixels());
            }
        }

        static void SetBannerHeight(float px)
        {
            if (Mathf.Approximately(px, BannerHeightPx)) return;
            BannerHeightPx = px;
            BannerChanged?.Invoke();
        }

        /// <summary>Remove Ads purchased: drop banner and interstitials (rewarded ads stay optional).</summary>
        public static void DisableAds()
        {
            SaveSystem.Data.noAds = true;
            SaveSystem.Save();
            if (banner != null) { banner.Destroy(); banner = null; }
            SetBannerHeight(0);
            interstitial?.Destroy();
            interstitial = null;
        }
    }
}
