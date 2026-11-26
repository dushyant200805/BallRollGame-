# Ball Roll — Unity (C#) version

This is the native Unity rebuild of Ball Roll. The plan is in `../FEASIBILITY-UNITY.md`.

**Status:** the migration is complete except for Play Billing, which is intentionally skipped.

| Phase | What | State |
|---|---|---|
| 1 | Project, Android settings, signed APK/AAB build pipeline | Done |
| 2 | Rules, 60 levels, Daily puzzle, reward rules in C# (15 EditMode tests) | Done |
| 3 | Gameplay: board drawn in code, touch drag, ball roll, HUD, dialogs | Done |
| 4 | Home / Level select / Settings menus, JSON save, pause, back button | Done |
| 5 | Coins, extra moves, milestone + daily gifts, ball shop, themes, sounds | Done |
| 6 | Google Mobile Ads (AdMob): consent, rewarded, interstitial, banner | Done — Google TEST ad IDs |
| 8 | Analytics event layer (debug provider; Firebase/Unity seam) | Done |
| 7 | Play Billing "Remove Ads" + restore | **Skipped** |

Notes on what a store release still needs (none of these are code gaps):
- **Phase 7 skipped:** there is a `noAds` save flag and `AdsManager.DisableAds()` already, so a Play
  Billing purchase can be wired to it later without reworking the ad code.
- **Real ads:** AdMob uses Google's TEST ad unit IDs. Set `BALLROLL_ADMOB_APP_ID` and replace the
  unit IDs in `AdsManager.cs` with your own once your AdMob account is ready. Real ads need a
  physical device to verify (the x86_64 emulator can't serve them).
- **Analytics backend:** the debug provider logs to logcat + a local file. Implement
  `IAnalyticsProvider` with Firebase or Unity Analytics and register it in `Analytics.Init` when you
  have the credentials; the event names stay the same.
- **Signing:** builds use the same upload key as the React Native app (`../mobile/keystore.properties`),
  package id `com.ballroll.game`, version 2.0.0 (versionCode 2).

**Unity version:** **6000.0.85f2 LTS**, with the Android Build Support module. It is installed at `D:\Unity\6000.0.85f2`.
- Unity 6.5+ removed x86_64 Android builds, so the PC emulator can't run builds from newer versions.
- 6000.0 LTS still supports x86_64.

## Layout

```
Assets/
  Scripts/Core/     pure C# rules (no UnityEngine): tiles, board, pathfinding/BFS, generator,
                    game session, level rules, rewards   (port of ../js/core/*.js)
  Scripts/Game/     GameData (loads Resources/Data/*.json), Bootstrap (boot screen)
  Resources/Data/   levels, ball skins, rewards config, Daily reference puzzles
                    (generated: node ../tools/export-unity.js)
  Editor/           BuildAndroid.cs: APK/AAB build + Android settings + signing
  Tests/EditMode/   Unity Test Framework tests
```

## Commands (from the repo root)

Use this Unity executable:

```bash
"D:/Unity/6000.0.85f2/Editor/Unity.exe"
```

**Re-export the game data** after changing levels, skins or rewards in the web game:

```bash
node tools/export-unity.js
```

**Run the tests:**

```bash
"D:/Unity/6000.0.85f2/Editor/Unity.exe" -batchmode -nographics -projectPath unity -runTests -testPlatform EditMode -testResults unity/Build/editmode-results.xml
```

**Emulator APK** (adds x86_64 and uses OpenGL ES 3 only, because the emulator's Vulkan driver hangs Unity):

```bash
"D:/Unity/6000.0.85f2/Editor/Unity.exe" -batchmode -nographics -projectPath unity -buildTarget Android -executeMethod BallRoll.Editor.BuildAndroid.Apk -emulator
```

**Store bundle** (ARM64 + ARMv7, Vulkan with a GLES3 fallback):

```bash
"D:/Unity/6000.0.85f2/Editor/Unity.exe" -batchmode -nographics -projectPath unity -buildTarget Android -executeMethod BallRoll.Editor.BuildAndroid.Aab
```

The output goes to `unity/Build/`.

## Build details

- **Signing:** `../mobile/keystore.properties` (git-ignored) is used, so the app has the same upload key and package id (`com.ballroll.game`) as the React Native app. The version code is 2.
- **Tools:**
  - JDK: Unity's OpenJDK in `D:\unity-tools\OpenJDK`.
  - Android SDK: `%LOCALAPPDATA%\Android\Sdk`.
  - NDK: r27c (27.2.12479018).
  - You can override them with the `BALLROLL_JDK`, `BALLROLL_SDK` and `BALLROLL_NDK` environment variables.
