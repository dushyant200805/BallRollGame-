# Ball Path — Sliding Puzzle Game

Slide the wooden pipe tiles into the empty slots, connect a continuous track from the
green start tile to the gold goal, then press **Play** and watch the ball roll home.

Pure HTML5 + CSS3 + vanilla JavaScript (ES6+) on Canvas, with no build step.

- **Graphics:** all drawn in code (Canvas and inline SVG), so there are no image files.
- **Icons:** [Bootstrap Icons](https://icons.getbootstrap.com/) 1.11.3, loaded from the
  jsDelivr CDN.
- **Audio:** all sounds and music are synthesized live with the Web Audio API, so there
  are no audio files. That includes a unique rolling sound for each of the 18 balls.

## Ball Collection

There are 18 ball skins in three collections:
- **Basic:** Ruby Red, Classic Black, Pearl White, Ocean Blue, Emerald Green, Golden
- **Premium:** Diamond, Neon Purple, Fire, Ice, Rainbow, Galaxy
- **Special:** Football, Basketball, Crystal, Wooden, Metallic, Glow

Each ball unlocks with stars earned in any mode, from 0 to 150 stars.

Every ball has its own look and its own rolling sound: marble, ceramic, water, glass, stone,
metal, crystal ringing, an electronic hum, fire crackle, ice, sparkles, a cosmic hum, rubber
bounces, glass resonance, wood, steel and an energy hum.

- **Rolling sound:** it fades in when the ball starts and gets louder and slightly higher as
  the ball speeds up. It fades out the moment the ball stops, and two rolling sounds never
  overlap.
- **Preview:** the ▶ button on each ball plays a short sample, including for locked balls.
  Only one preview plays at a time.
- **Volume:** Settings has Master, Ball rolling, Sound effects and Music volume sliders, plus
  sound, music and vibration switches. All of them are saved.

The ball data lives in `js/data/ball-skins.js` and the sound recipes in
`js/audio/ball-sound-recipes.js`. The sounds are original synthesis, with no third-party
audio. The browser renders each sound on demand (about 20 ms) and keeps only the selected and
previewed balls in memory.

> **Native mobile app:** [`mobile/`](mobile/) contains **Ball Roll**, the installable
> Android/iOS version, built with React Native + Expo + Skia. It has the same levels and
> rules. See [mobile/README.md](mobile/README.md) and [mobile/BUILDING.md](mobile/BUILDING.md).

## Run it

Any static file server works. From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly from disk also works
(scripts are classic, not ES modules).

**Deploy:** upload the folder as-is to any static host (Netlify, Vercel, GitHub Pages,
S3, nginx). The `tools/` folder is development-only and can be left out.

## How to play

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Slide a tile | Drag it toward an adjacent empty slot (or tap it if only one side is free) | — |
| Roll the ball | **Play** | Space / Enter |
| Undo | **Undo** | U or Ctrl+Z |
| Restart | **Restart** | R |
| Hint | **Hint** (highlights the next optimal slide) | H |
| Pause | ⏸ | Esc |

Tiles: light maple = movable · dark walnut with brass screws = bolted (fixed) ·
grey stone = fixed block · green = start · gold with flag = goal.
Connected pipes glow teal; a complete path turns gold and the Play button pulses.

**Stars:** 3★ at par (the proven minimum number of moves), 2★ within par + 50% (at least
+2), otherwise 1★. In Time Trial, stars depend on the time remaining.

## Game modes

Classic, Challenge and Time Trial each have **their own 20 levels** with a different
puzzle style and a steeper difficulty curve:

- **Classic**: a teaching ramp from 1-move puzzles up to 7×7 boards with bolted tiles
  (par 1 → 16). Finishing a level unlocks the next.
- **Challenge**: sliding-puzzle style with only **one** empty slot, plus bolted tiles and
  stone blocks (par 6 → 22+). The move limit shrinks from par + 50% on level 1 to
  par + 10% on level 20. Running out of moves with a broken path loses the level.
- **Time Trial**: big 7×7 boards with three empty slots and lots of decoy pipes (par 4 → 13).
  The time allowed per move drops from 8 s to 4 s as you progress. The clock pauses
  while the game is paused.
- **Daily Challenge**: one puzzle per calendar day, generated from the date as a seed, so everyone gets the same puzzle. Tracks a streak.

Each mode keeps its own unlocks, stars and best scores.

## Project structure

```
index.html              screens, overlays, icon sprite
css/style.css           mobile-first responsive styles
js/core/                DOM-free game logic (also runs in Node for tests)
  constants.js          directions & tile types
  tiles.js              Tile manager: tile factories + level token format
  rng.js                seeded RNG (reproducible levels)
  board.js              Board manager: grid, move validation, state keys
  pathfinding.js        path tracing + BFS solver (hints, par, solvability)
  generator.js          level generator (scramble-by-legal-moves = always solvable)
  session.js            one level attempt: moves, undo, timer, win/lose rules
js/data/levels.js       level data (generated; kept separate from logic)
js/data/ball-skins.js   18 ball skins: look, unlock cost (shared with the mobile app)
js/audio/ball-sound-recipes.js  per-ball rolling sounds, synthesized (shared with mobile)
js/game/
  level-manager.js      tiers, mode rules, daily puzzle
  save-manager.js       LocalStorage persistence
  audio-manager.js      Web Audio SFX + generative music
  geometry.js           pipe geometry shared by renderer and ball
  renderer.js           canvas board/tile/pipe drawing
  ball-controller.js    ball rolling, spin, sink/drop animations
  input-controller.js   pointer (mouse/touch/pen) drag & tap
  fx.js                 particles (confetti, sparkles)
  ball-painter.js       draws a ball skin (board and collection)
  engine.js             game engine: ties everything together, frame loop
js/ui/ui-manager.js     screens, HUD, level grid, settings, dialogs
js/main.js              bootstrap
tools/                  level generator + tests (Node)
```

## Levels

Levels are produced by `tools/generate-levels.js`. Each one starts from a solved board
built around a random pipe path, gets scrambled using only legal slides (so it is always
solvable), and is then measured by BFS to get its exact par. Generation is seeded, so
re-running the script produces the same levels.

```bash
node tools/generate-levels.js              # regenerate all modes (20 levels each)
node tools/generate-levels.js challenge    # regenerate one mode, keep the others
node tools/test-core.js                    # rules, pathfinding, session, every level, daily
```

The tests check every level of every mode independently: it must not start solved, BFS
must find a solution of exactly `par` moves, and the stored solution must win.

Each mode's difficulty plan lives in `PLANS` in `tools/generate-levels.js`, and its tier
names (Beginner → Master) live in `js/game/level-manager.js`.

## Saved data (LocalStorage key `ballpath.save.v1`)

Unlocked levels, completed levels, stars, best moves and times per mode, daily results
and streak, sound/music/vibration/animation settings, and the in-progress board (close
the tab mid-level and **Play → Continue** resumes it, undo history included).
