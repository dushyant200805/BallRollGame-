# Ball Path — Sliding Puzzle Game

Slide the wooden pipe tiles into the empty slots, connect a continuous track from the
green start tile to the gold goal, then press **Play** and watch the ball roll home.

Pure HTML5 + CSS3 + vanilla JavaScript (ES6+) on Canvas, with no build step.

- **Graphics:** all drawn in code (Canvas and inline SVG), so there are no image files.
- **Icons:** [Bootstrap Icons](https://icons.getbootstrap.com/) 1.11.3, loaded from the
  jsDelivr CDN.
- **Audio:** all sounds and music are synthesized live with the Web Audio API, so there
  are no audio files.

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

- **Classic**: levels in order; finishing a level unlocks the next.
- **Challenge**: strict move limit (par + 60%, at least +3). Running out of moves with a broken path loses the level.
- **Time Trial**: countdown clock per level; the clock pauses while the game is paused.
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
js/game/
  level-manager.js      tiers, mode rules, daily puzzle
  save-manager.js       LocalStorage persistence
  audio-manager.js      Web Audio SFX + generative music
  geometry.js           pipe geometry shared by renderer and ball
  renderer.js           canvas board/tile/pipe drawing
  ball-controller.js    ball rolling, spin, sink/drop animations
  input-controller.js   pointer (mouse/touch/pen) drag & tap
  fx.js                 particles (confetti, sparkles)
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
node tools/generate-levels.js 10    # regenerate js/data/levels.js with N levels
node tools/test-core.js             # 27 tests: rules, pathfinding, session, every level, daily
```

The tests check every level independently: it must not start solved, BFS must find a
solution of exactly `par` moves, and the stored solution must win.

Difficulty tiers: Beginner 1–10, Easy 11–30, Medium 31–60, Hard 61–100, Expert 101+.
This MVP ships the 10 Beginner levels; the generator already has a scaling plan for
higher levels (bigger boards, more bolted tiles, deeper scrambles).

## Saved data (LocalStorage key `ballpath.save.v1`)

Unlocked levels, completed levels, stars, best moves and times per mode, daily results
and streak, sound/music/vibration/animation settings, and the in-progress board (close
the tab mid-level and **Play → Continue** resumes it, undo history included).
