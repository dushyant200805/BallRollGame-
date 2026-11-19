# Feasibility report: moving the game to a native Unity (C#) Android app

Date: 19 Nov 2026. This report comes before any migration work, as requested.

## 1. What exists today

| | Web game "Ball Path" | Android app "Ball Roll" (`mobile/`) |
|---|---|---|
| Technology | Plain JavaScript + Canvas 2D + Web Audio. **No Phaser.js** is used anywhere in the project. | React Native 0.76 + Expo + Skia (GPU drawing) + expo-av audio |
| Runs in a browser / WebView? | Yes, it is a website | **No.** Native Android views and Skia drawing, with no WebView. The game logic is TypeScript running on the Hermes JS engine. |
| Code size | about 4,400 lines | about 7,300 lines of TypeScript |
| Levels | 60: Classic, Challenge and Time Trial, 20 each, plus a generated Daily puzzle | the same 60 + Daily |
| Assets | ball skins (data), reward art (9 SVG files) | 12 sound effects + music, 18 ball rolling loops (WAV), app icon and splash, Fredoka font |

Both games share one set of rules. These rules are tested with 85 web tests and 75 mobile tests:
- board, sliding, path tracing, BFS solver and hints, level generator
- session (moves, timer, win and lose)
- rewards (coins, extra moves, milestone and daily gifts, shop, themes, sounds)

> **Important:** the current Android app is already a standalone install with no website and no WebView. It does not meet the "no JavaScript" rule, because its logic runs in TypeScript. A Unity rewrite is needed only if **C# / Unity is a firm requirement**.

## 2. How each part moves to Unity

| Part | How it transfers | Effort |
|---|---|---|
| **60 levels + level tiers + limits** | Already pure data, made by `tools/generate-levels.js`. Export to JSON, then import as ScriptableObjects (`LevelSet`, `LevelData`). The level difficulty stays exactly the same. | Low |
| **Daily puzzle** | Port the seeded RNG and generator to C#. A test can check that each date gives the same puzzle as the current game. | Medium |
| **Game rules** (board, path tracing, BFS solver, session) | About 1,500 lines of plain logic. Port line by line to C#. Unity Test Framework tests can be written from the existing JS tests. | Medium |
| **Reward rules** (gifts, no duplicates, coin costs, day reset, shop, ad limits) | Port `js/core/rewards.js` to C#. `rewards-config.js` becomes a `RewardsConfig` ScriptableObject. | Low–Medium |
| **Board graphics** (wood tiles with grain, brass screws, glowing pipes, ball skins, particles) | Today these are drawn by code. In Unity, draw them once into sprites, or recreate them with a shader / SpriteShape. The look stays the same. | **High** |
| **18 ball skins** | Their data moves as-is. The look is redone as sprites plus a small "rolling" shader, since the bands and dots move as the ball rolls. | Medium |
| **Sounds** | The 30 WAV files import directly into Unity (AudioClip + AudioMixer for master / roll / SFX / music). The rolling loop with speed-based pitch and volume maps to AudioSource. | Low |
| **Reward art** (posters, gift box, coins…) | Convert SVG to PNG sprites. Unity has no built-in SVG importer. The art is still placeholder and can be replaced later. | Low |
| **Screens**: Home, Levels, Game, Pause, Win, Fail, Settings, Ball Collection + shop, Gifts, reward reveal, ad | Rebuild all of them in uGUI, using Canvas Scaler and a safe-area panel. | **High** |
| **Saved progress** | Write the same data structure as JSON to `Application.persistentDataPath`. Existing Ball Roll players can't bring progress across, because the app's internal storage format is different. | Low |

## 3. New features in your list that don't exist yet

| Feature | Unity solution | What it needs from you |
|---|---|---|
| Rewarded ads (extra moves, daily gift, coins) | Google Mobile Ads Unity plugin (official) | An AdMob account and app ID. Google **test** IDs work until then. |
| Interstitial ads (with frequency cap and cooldown) | Same plugin | Where and how often to show them |
| Adaptive banner | Same plugin | Which screens show it (it must never cover the board) |
| Consent (GDPR / UMP) | The UMP SDK bundled with the ads plugin | A privacy message set up in AdMob |
| Remove Ads purchase + restore | Unity IAP (Google Play Billing) | **A Play Console account** and the product created there. Billing can only be tested through a Play testing track. |
| Analytics | Firebase Analytics or Unity Analytics | Your choice. Firebase needs a `google-services.json` from your Firebase project. |
| Achievements | Local achievements, or Google Play Games | Your choice |
| Privacy settings screen | uGUI screen (consent, privacy policy link) | Your privacy policy URL |

## 4. Blockers: things I can't do on my own

1. **Unity is not installed on this PC.** I checked; no Unity Hub or Editor was found.
   - **What's needed:** Unity Hub + **Unity 6 LTS** + the **Android Build Support** module (with the bundled OpenJDK, SDK and NDK). This is about 15–20 GB; the D: drive has 210 GB free.
   - **Sign-in:** Unity needs a **Unity account sign-in** to activate the free Personal licence. Only you can do that.
2. **AdMob account:** needed for real ad units. Everything can be built and tested with Google test ads before that.
3. **Google Play Console account:** needed for the Remove Ads product, purchase testing, and uploading the AAB.
4. **Signing key:** the existing upload key (`ballroll-upload.keystore`) can be reused if the Unity app keeps the package id `com.ballroll.game`. It would then update the same Play listing.

## 5. Plan once Unity is installed

| Phase | Work | Proof it works |
|---|---|---|
| 1 | Unity project and Android settings: package id, signing, IL2CPP, ARM64, portrait | An empty build installs on the emulator |
| 2 | Port the rules and levels to C# + ScriptableObjects | Unity Test Framework: every one of the 60 levels is solvable, par matches, and the Daily puzzle matches the current game |
| 3 | Gameplay scene: board, drag controls, ball rolling, sounds, HUD, pause/win/fail | Play levels by touch on the emulator, with screenshots |
| 4 | All other screens (menus, collection, gifts, settings) + saved progress | A UI check at phone and tablet sizes; data survives restarts |
| 5 | Rewards, shop, gifts, extra moves | The reward tests, ported, pass |
| 6 | AdMob (test ads), UMP consent, interstitial and banner rules | Real Google test ads tested on the emulator |
| 7 | IAP Remove Ads + restore | Blocked until a Play Console account exists; then tested on an internal testing track |
| 8 | Analytics, achievements, privacy screen | Events seen in the debug view |
| 9 | QA pass + signed AAB and APK + build docs | A QA report like `QA-REPORT.md` |

**Size of the job:** this is a full rewrite, comparable to building the game again, roughly the size of the current mobile app plus the new ads, billing and analytics work. It spans many working sessions; it is not one sitting. Each phase ends with a working build so progress can be checked along the way.

## 6. Recommendation

- **If C# / Unity is a must:** it is feasible. Every level, rule and sound transfers; the graphics and screens have to be rebuilt.
  - **Start:** install Unity 6 LTS with Android Build Support and sign in once. I'll then work through the phases above, using Unity's command line (batch mode) for builds and tests.
- **If the real goal is "a native Android app with ads and purchases":** the existing Ball Roll app already runs without a website or WebView.
  - Adding AdMob (`react-native-google-mobile-ads`) and Play Billing (`react-native-iap`) to it would take a small part of the time.
  - It also keeps all current players' progress.
