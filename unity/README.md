# Ball Roll — Unity (C#) version

This is the native Unity rebuild of Ball Roll. The plan is in `../FEASIBILITY-UNITY.md`.

**Status:**
- Phase 1 is done:
  - Project set up, Android settings and the signed build pipeline.
  - A boot screen that runs the migrated C# core on the device.
- Phase 2 is done:
  - The game rules, levels, Daily puzzle and reward rules are ported to C#.
  - 15 EditMode tests cover them.

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
