// Ball Roll — sets the AdMob app ID in the Google Mobile Ads settings before every build.
// Until your AdMob account is ready this is Google's official TEST app ID; set the environment
// variable BALLROLL_ADMOB_APP_ID (ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy) for real builds.
using System;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace BallRoll.Editor
{
    public static class AdsSetup
    {
        public const string TestAndroidAppId = "ca-app-pub-3940256099942544~3347511713"; // Google sample app

        [MenuItem("Ball Roll/Configure AdMob")]
        public static void Configure()
        {
            string appId = Environment.GetEnvironmentVariable("BALLROLL_ADMOB_APP_ID");
            if (string.IsNullOrEmpty(appId)) appId = TestAndroidAppId;
            // GoogleMobileAdsSettings is internal to the plugin's editor assembly: reach it by reflection.
            var type = Type.GetType("GoogleMobileAds.Editor.GoogleMobileAdsSettings, GoogleMobileAds.Editor");
            if (type == null) { Debug.LogWarning("[BallRoll] Google Mobile Ads settings type not found"); return; }
            var settings = type.GetMethod("LoadInstance", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)?.Invoke(null, null) as ScriptableObject;
            if (settings == null) { Debug.LogWarning("[BallRoll] Google Mobile Ads settings not loaded"); return; }
            type.GetProperty("GoogleMobileAdsAndroidAppId")?.SetValue(settings, appId);
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();
            Debug.Log("[BallRoll] AdMob Android app id = " + (appId == TestAndroidAppId ? "Google TEST app id" : appId));
        }
    }
}
