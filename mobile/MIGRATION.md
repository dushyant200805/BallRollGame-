# Ball Roll: web → native migration

This folder holds the native mobile version of the game (Android and iOS), built with
React Native and Expo. The web version in the repository root is unchanged and keeps
working.

## 1. What the web project is (analysis)

| Area | Web implementation |
|---|---|
| Language | Vanilla JavaScript (ES2017+) as classic scripts sharing a global `BP` namespace; no framework, no build step |
| Rendering | One HTML5 Canvas 2D board (`js/game/renderer.js`), everything drawn in code: wood tiles, grain, screws, glowing tubes, ball, particles |
| UI | HTML/CSS screens (home, levels, game) plus overlays (pause, win, fail, settings, confirm, loading); Bootstrap Icons from a CDN; Fredoka font from Google Fonts |
| Input | Pointer Events: drag a tile toward an adjacent empty slot, or tap a tile that has only one free side |
| Audio | Web Audio API. Every sound effect and the background music is synthesized live; there are no audio files |
| Storage | `localStorage` key `ballpath.save.v1` |
| Assets | None. There are no image, audio or font files in the project |
| Dependencies | None at runtime (CDN font and icons only); Node is used for tools/tests |

### Game mechanics (preserved exactly)

- An N×N board of tiles. Movable pipe tiles slide one cell into an adjacent **empty slot**.
  Bolted tiles (`*`), stone blocks, the start and the goal never move.
- Pipes are bitmasks of openings (N=1, E=2, S=4, W=8): straights `- |` and curves `L J 7 F`.
- `trace()` follows the pipe from the start tile. The path is complete when it enters the
  goal from its open side.
- The player presses **Play**: the ball rolls along the traced path (it accelerates, spins,
  sinks into the goal, or drops/bumps at the break).
- **Undo**, **Restart** and **Hint**. A hint is the first move of a BFS-optimal solution.
- **Stars**: 3★ when moves ≤ par, 2★ when moves ≤ par + max(2, ⌈par×0.5⌉), otherwise 1★.
  In Time Trial, stars come from the fraction of time left (≥50% → 3★, ≥25% → 2★).
- **Modes**: Classic, Challenge (move limit shrinking from par+50% to par+10%), Time Trial
  (seconds per par move shrinking from 8 to 4), and Daily (puzzle generated from the date).
- **Levels**: 20 per mode, 60 in total (`js/data/levels.js`), each with a BFS-proven par and
  a stored solution.

> The migration brief mentions "obstacles" and "collectible stars". In this game, the
> obstacles are bolted tiles and stone blocks. Stars are a 1–3 rating earned on completing
> a level; there are no stars to pick up on the board. The native app keeps those rules
> rather than inventing new mechanics.

## 2. Migration plan

| Web module | Native module | Approach |
|---|---|---|
| `js/core/*` (constants, tiles, rng, board, pathfinding, generator, session) | `src/game/core/*.ts` | Line-by-line TypeScript port. The logic is unchanged and it is still DOM-free and unit-tested |
| `js/data/levels.js` | `src/game/data/levels.ts` | The same 60 levels, converted by `scripts/convert-levels.js` (no hand edits) |
| `level-manager.js` | `src/game/levelManager.ts` | Same tiers, limits and daily config |
| `save-manager.js` (localStorage) | `src/services/storage.ts` (AsyncStorage) | Same schema, including the per-level results, in-progress board and settings |
| `geometry.js`, `renderer.js`, `ball-controller.js`, `fx.js` | `src/game/render/*` | Ported to the React Native Skia imperative canvas API. Each frame is recorded into an `SkPicture` that is shown through a Reanimated shared value, so drawing never re-renders React. Static tile art is cached per tile |
| `input-controller.js` (Pointer Events) | `src/game/useBoardGesture.ts` | Pan gesture from React Native Gesture Handler: same drag projection, 35% commit threshold and tap-to-slide rule |
| `engine.js` | `src/game/engine.ts` | Same state machine and frame loop (`requestAnimationFrame`), with events sent to React for the HUD and overlays |
| `audio-manager.js` (Web Audio synthesis) | `scripts/synth-audio.js` → `assets/audio/*.wav` + `src/services/audio.ts` (expo-av) | The *same* synth recipes render WAV files offline, and the app plays them natively. The sounds are identical, with no network needed |
| HTML screens and overlays | `src/screens/*`, `src/components/*` | Native Stack navigation: Splash → Home → Levels → Game; Settings; About. Pause/Win/Fail are native modals |
| Bootstrap Icons (CDN) | `@expo/vector-icons` (bundled) | Matching native icons, available offline |
| Fredoka (Google Fonts CDN) | `@expo-google-fonts/fredoka` | Bundled into the app, available offline |
| Favicon / logo SVG | `scripts/make-icons.js` → `assets/images/*.png` | The same logo design (wood tile, pipe, red ball) rasterized for the app icon, adaptive icon and splash screen |

### Native-only additions

- Android hardware back button: in the game it opens or closes Pause. On other screens it
  does normal back navigation.
- App lifecycle: the game pauses and saves when the app goes to the background, and music stops. The board is
  restored when the app comes back (and after a full restart, via the saved in-progress state).
- Haptics for slides, path complete, win and fail (respects the Vibration setting).
- Safe areas / display cutouts, an edge-to-edge light status bar and a portrait lock. The board
  is always a centered square that fits the space left by the HUD.
- Hints are instant when the board is still on the stored solution path (lookup instead of
  BFS), with BFS only as a fallback. This matters on phones, where a 200k-node search is slower
  than on desktop, and it gives the same answer the BFS would.
- Privacy/About screen. The app collects no data and requests no dangerous permissions.

## 3. Verification

- `npm test`: the core port is run against all 60 levels (each one unsolved at start, BFS par
  matches, stored solution wins) plus rules, session and daily tests.
- `npm run typecheck`: strict TypeScript.
- `npx expo export --platform android`: the full JS bundle compiles.
- A Gradle release build produces the APK and AAB (see `BUILDING.md`).
