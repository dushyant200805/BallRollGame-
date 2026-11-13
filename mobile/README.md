# Ball Roll: native mobile app

This is the native Android/iOS version of the Ball Path web puzzle in the repository root,
built with **React Native + Expo + TypeScript**. Rendering uses **React Native Skia**,
animation uses **Reanimated**, touch input uses **Gesture Handler** and saves go to **AsyncStorage**.
It contains no WebView, works offline and needs no backend.

- [MIGRATION.md](MIGRATION.md): analysis of the web game, the migration plan, and what was
  preserved or added.
- [BUILDING.md](BUILDING.md): how to build the APK/AAB, run it on a device, and build for iOS.

## Features

- All 60 levels from the web game (20 each in Classic, Challenge and Time Trial), with
  identical rules, par, star scoring, move/time limits, plus the Daily Challenge (same daily
  puzzle as the web version).
- Screens:
  - animated splash
  - home with progress and sound/music toggles
  - level select with locked/unlocked/completed states and star totals
  - full-screen gameplay
  - pause, level-complete and "path broken" dialogs
  - settings
  - about and privacy policy
- Drag or tap tiles. Undo, restart, hint (instant on the optimal path) and Play.
- **Ball Collection** of 18 skins, the same as the web version. They unlock with stars.
  - Each ball has its own rolling sound, which fades in and out and follows the ball's speed.
  - Each ball has a ▶ preview button.
  - Settings has Master, Ball rolling, Sound effects and Music volume sliders.
  - The 18 rolling loops (`assets/audio/balls/*.wav`) are rendered from the web game's
    `js/audio/ball-sound-recipes.js`. Only the selected ball's loop is kept in memory.
- The original wooden look, drawn in code: maple and walnut tiles with grain, brass screws,
  glowing tubes, a rolling ball, confetti and sparkles.
- The original sounds and music, rendered from the web synth recipes.
- Haptics, the Android back button (opens/closes pause), and an automatic pause and save when
  the app goes to the background. The in-progress board is restored after the app is closed.
- Portrait layout for small phones up to tablets, safe areas and cutouts. The board is always
  a centred square.

## Project layout

```
mobile/
  index.ts                 entry
  app.json                 name, icons, splash, package ids, permissions, plugins
  src/
    App.tsx                fonts, storage, audio boot; splash hand-off; lifecycle
    navigation/            native stack (Splash, Home, Levels, Game, Settings, About)
    screens/               one file per screen
    components/            buttons, level tiles, dialogs, logo, toast, background
    game/
      core/                rules, board, pathfinding/BFS, generator, session (pure TS, tested)
      data/levels.ts       the 60 levels (generated from the web data)
      render/              Skia board renderer, ball, particles, pipe geometry
      engine.ts            game loop and state machine
      levelManager.ts      tiers, limits, daily puzzle
      useBoardGesture.ts   touch handling
    services/              storage (AsyncStorage), audio (expo-av), haptics
    hooks/  utils/  constants/
  assets/                  audio (WAV), images (icon, adaptive icon, splash)
  scripts/                 tests, level conversion, audio synth, icon renderer, Android build
  plugins/                 Expo config plugin for release signing
  android/                 generated native Android project
```
