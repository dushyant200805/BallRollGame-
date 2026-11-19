// Ball Roll — Android build pipeline (menu + command line).
//   Unity -batchmode -quit -projectPath unity -executeMethod BallRoll.Editor.BuildAndroid.Apk
//   Unity -batchmode -quit -projectPath unity -executeMethod BallRoll.Editor.BuildAndroid.Aab
// Optional args: -emulator (adds x86_64 for the PC emulator; Unity 6000.0 LTS only), -outPath <file>.
// Signing: reads ../mobile/keystore.properties (git-ignored) so the Unity app is signed with the
// same upload key as the existing Ball Roll app and can update the same Play listing.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BallRoll.Editor
{
    public static class BuildAndroid
    {
        const string ScenePath = "Assets/Scenes/Main.unity";
        const string PackageId = "com.ballroll.game";

        [MenuItem("Ball Roll/Build APK")] public static void Apk() => Build(false);
        [MenuItem("Ball Roll/Build AAB")] public static void Aab() => Build(true);

        static void Build(bool aab)
        {
            var args = Environment.GetCommandLineArgs();
            bool emulator = args.Contains("-emulator");
            string outPath = ArgValue(args, "-outPath") ?? Path.GetFullPath(Path.Combine("Build", aab ? "BallRoll.aab" : "BallRoll.apk"));

            EnsureScene();
            ConfigureExternalTools();
            ConfigurePlayer(emulator);
            ConfigureSigning();

            EditorUserBuildSettings.buildAppBundle = aab;
            Directory.CreateDirectory(Path.GetDirectoryName(outPath));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outPath,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            });
            ClearSigning(); // never leave the keystore path/alias in ProjectSettings (it is committed)
            var s = report.summary;
            Debug.Log($"[BallRoll] Build {s.result}: {outPath} ({s.totalSize / (1024 * 1024)} MB, {s.totalErrors} errors, {s.totalTime})");
            if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
        }

        static string ArgValue(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        /// <summary>Creates the boot scene (camera + Bootstrap) if it doesn't exist yet.</summary>
        static void EnsureScene()
        {
            if (File.Exists(ScenePath)) return;
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)) { tag = "MainCamera" };
            cam.GetComponent<Camera>().orthographic = true;
            new GameObject("Game", typeof(Bootstrap));
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        /// <summary>Use the JDK / SDK / NDK already on this PC when Unity's bundled ones are missing.</summary>
        static void ConfigureExternalTools()
        {
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "";
            // Unity's own OpenJDK build (same file the Hub installs), unpacked outside Program Files
            string jdk = Environment.GetEnvironmentVariable("BALLROLL_JDK") ?? @"D:\unity-tools\OpenJDK";
            string sdk = Environment.GetEnvironmentVariable("BALLROLL_SDK") ?? Path.Combine(local, "Android", "Sdk");
            string ndk = Environment.GetEnvironmentVariable("BALLROLL_NDK") ?? Path.Combine(sdk, "ndk", "27.2.12479018");
            var t = Type.GetType("UnityEditor.Android.AndroidExternalToolsSettings, UnityEditor.Android.Extensions");
            if (t == null) { Debug.LogWarning("[BallRoll] Android module not loaded; using Unity defaults"); return; }
            void Set(string prop, string path, string bundledSub)
            {
                string bundled = Path.Combine(EditorApplication.applicationContentsPath, "PlaybackEngines", "AndroidPlayer", bundledSub);
                string use = Directory.Exists(bundled) ? bundled : path;
                if (!Directory.Exists(use)) { Debug.LogWarning($"[BallRoll] {prop}: {use} not found"); return; }
                t.GetProperty(prop)?.SetValue(null, use);
                Debug.Log($"[BallRoll] {prop} = {use}");
            }
            Set("jdkRootPath", jdk, "OpenJDK");
            Set("sdkRootPath", sdk, "SDK");
            Set("ndkRootPath", ndk, "NDK");
        }

        static void ConfigurePlayer(bool emulator)
        {
            PlayerSettings.companyName = "Ball Roll";
            PlayerSettings.productName = "Ball Roll";
            PlayerSettings.bundleVersion = "2.0.0";
            PlayerSettings.Android.bundleVersionCode = 2; // the React Native app shipped versionCode 1
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, PackageId);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
#if UNITY_6000_5_OR_NEWER
            // Unity 6.5+ removed x86_64: builds run on ARM phones only.
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
            if (emulator) Debug.LogWarning("[BallRoll] -emulator ignored: this Unity version has no x86_64 Android support");
#else
            // Store builds: ARM only. -emulator adds x86_64 so the build also runs on the PC emulator.
            // The emulator's Vulkan driver hangs Unity, so emulator builds use OpenGL ES 3 only;
            // store builds keep Unity's default (Vulkan with GLES3 fallback).
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, !emulator);
            if (emulator) PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.Android.targetArchitectures = emulator
                ? AndroidArchitecture.ARM64 | AndroidArchitecture.X86_64
                : AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
#endif
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;
            PlayerSettings.Android.renderOutsideSafeArea = true;
            PlayerSettings.Android.startInFullscreen = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            PlayerSettings.Android.androidIsGame = true;
        }

        static void ClearSigning()
        {
            PlayerSettings.Android.useCustomKeystore = false;
            PlayerSettings.Android.keystoreName = "";
            PlayerSettings.Android.keyaliasName = "";
            PlayerSettings.Android.keystorePass = "";
            PlayerSettings.Android.keyaliasPass = "";
            AssetDatabase.SaveAssets();
        }

        /// <summary>Signs with ../mobile/keystore.properties when present (never committed).</summary>
        static void ConfigureSigning()
        {
            string props = Path.GetFullPath(Path.Combine("..", "mobile", "keystore.properties"));
            if (!File.Exists(props))
            {
                PlayerSettings.Android.useCustomKeystore = false;
                Debug.LogWarning("[BallRoll] No keystore.properties: building with the debug key");
                return;
            }
            var kv = new Dictionary<string, string>();
            foreach (var line in File.ReadAllLines(props))
            {
                int eq = line.IndexOf('=');
                if (eq > 0) kv[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
            string store = kv.TryGetValue("storeFile", out var f) ? f : "";
            if (!Path.IsPathRooted(store)) store = Path.GetFullPath(Path.Combine("..", "mobile", store));
            if (!File.Exists(store)) store = Path.GetFullPath(Path.Combine("..", "mobile", Path.GetFileName(store)));
            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = store;
            PlayerSettings.Android.keystorePass = kv.GetValueOrDefault("storePassword", "");
            PlayerSettings.Android.keyaliasName = kv.GetValueOrDefault("keyAlias", "");
            PlayerSettings.Android.keyaliasPass = kv.GetValueOrDefault("keyPassword", "");
            Debug.Log("[BallRoll] Signing with the Ball Roll upload key");
        }
    }
}
