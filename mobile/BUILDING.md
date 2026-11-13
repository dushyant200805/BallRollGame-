# Building and running Ball Roll (native app)

The app is a React Native + Expo (SDK 52, React Native 0.76, New Architecture) project written
in TypeScript. It renders with React Native Skia, animates with Reanimated, takes touch input
through Gesture Handler and saves to AsyncStorage. It is **not** a WebView or a PWA.

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 or newer (tested with 22) | |
| JDK | 17 | This PC: `%LOCALAPPDATA%\Programs\jdk17` (Microsoft Build of OpenJDK) |
| Android SDK | Platform 35, Build-Tools 35.0.0, NDK 26.1.10909125, CMake 3.22.1 | This PC: `%LOCALAPPDATA%\Android\Sdk` |
| Xcode (iOS only) | 15.4+ on a Mac | |

`JAVA_HOME` and `ANDROID_HOME` are set for the current Windows user. Open a new terminal after
installing the tools so they are picked up.

## Install

```bash
cd mobile
npm install
```

## Checks

```bash
npm test
```

```bash
npm run typecheck
```

`npm test` runs the game-core tests (all 60 levels, hints, rules, session and the daily
puzzle). `npm run typecheck` runs strict TypeScript.

## Build the Android APK and AAB (release, signed)

```bash
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

The outputs are written to `mobile/build-output/`:

- `BallRoll-1.0.0.apk`: install directly on a phone for testing.
- `BallRoll-1.0.0.aab`: upload to Google Play Console.

The first build downloads Gradle and the Android dependencies (several hundred MB) and compiles
the native modules. This takes 15–40 minutes; later builds are much faster.

### Install the APK on a phone

1. Copy the APK to the phone (USB, Drive, etc.). Open it and allow "Install unknown apps" for
   the app you opened it with.
2. Or, with USB debugging enabled:

```bash
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb" install -r build-output\BallRoll-1.0.0.apk
```

### Signing key: back it up

Release builds are signed with the upload key `mobile/ballroll-upload.keystore`. Its passwords
are in `mobile/keystore.properties`. Both files are **git-ignored on purpose**: copy them
somewhere safe. Google Play needs the same upload key for every future update. If either file
is missing, release builds fall back to the debug key, which is fine for testing but cannot be
uploaded to Play.

When you publish an update, raise `expo.version` and `expo.android.versionCode` in `app.json`.

## Testing on the emulator

An Android 14 emulator (`BallRollPhone`, Pixel 6) is set up on this PC:

```bash
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator" -avd BallRollPhone
```

Then install the APK with the `adb install` command above. These checks were run on it with the
release build:

- launch and splash
- home navigation
- a level 1 swipe completes the path
- Play rolls the ball into the goal, and the win dialog shows 3 stars
- Next level
- Hint highlights the right tile
- Undo
- Back opens/closes pause
- the app pauses and saves when sent to the background
- force-close with network off, then relaunch: progress, stars and the in-progress board
  (with undo history) are restored
- "path broken" dialog
- Levels and Challenge tabs
- Daily puzzle generated offline
- Settings, About

No crashes or JS errors were logged.

## Development (live reload on a device or emulator)

```bash
npx expo run:android
```

This builds a debug app, installs it on the connected device or emulator and starts Metro.
Because the app uses native modules (Skia, Reanimated), it does not run in Expo Go; use this
development build instead.

## iOS

The iOS configuration is ready in `app.json` (bundle id `com.ballroll.game`, icons, splash,
portrait, iPad support, no tracking/encryption declarations). On a Mac:

```bash
cd mobile
npm install
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx expo run:ios --configuration Release
```

To ship it, open `ios/BallRoll.xcworkspace` in Xcode, choose your team under *Signing &
Capabilities*, then use *Product → Archive* to upload to App Store Connect. Alternatively, use
Expo's cloud build (`npx eas build -p ios`), which needs an Apple Developer account.

## Regenerating assets

These scripts produce files that are already committed. Run them only after changing their source:

| Command | What it does |
|---|---|
| `npm run convert-levels` | Copies the web levels and ball skins → `src/game/data/levels.ts`, `ballSkins.ts` |
| `npm run synth-audio` | Renders the web synth sounds, music and 18 ball rolling loops → `assets/audio/` |
| `npm run make-icons` | Draws the logo → app icon, adaptive icon, monochrome icon, splash |
| `npm run prebuild` | Regenerates `android/` from `app.json` (the signing plugin re-applies itself) |

## Package and permissions

- Android package and iOS bundle id: `com.ballroll.game`. Change it in `app.json` before the
  first Play/App Store upload if you want your own (for example `com.yourname.ballroll`), then
  run `npm run prebuild`.
- Android permissions: `VIBRATE` (haptics). `INTERNET` comes from the React Native template.
  It is a normal permission with no prompt, and the game never uses the network.
  Microphone, storage and overlay permissions are explicitly removed.
