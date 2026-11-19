# Ball Path / Ball Roll — QA Report

Date: 19 Nov 2026.

**Builds tested:**
- Web game, served locally at `http://localhost:8080`.
- Android app, x86_64 release build, on the `BallRollPhone` emulator.

**How it was tested:**
- **Web:** browser automation drove the real game UI and engine. This included real mouse drags on the board, button clicks, and reading back the screen and saved data. Layout was checked at 360×600, 375×667, 375×812, 768×1024 and 920×760.
- **Android:** `adb` touch input (taps and swipes on the board) plus screenshots.
- **Unit tests:** web core, 85 tests, `node tools/test-core.js`. Mobile core, 75 tests, `npm test` in `mobile/`. The mobile tests check the TypeScript rules against the web rules.

**Ads:** no ad network is integrated. Every rewarded ad is the built-in **simulated (mock) ad**, labelled "Test ad (simulated)" on screen. The mock covers loading, playing, closing early, failing to load and being offline. Google test ads were not used because AdMob is not in the project.

---

## A. Overall quality

| | |
|---|---|
| Sections | 3 (Classic, Challenge, Time Trial) + Daily |
| Levels | 60 (20 per section) |
| Levels actually played to completion (web) | **60 / 60** |
| Levels passed | **60** (all 3 stars, solved with the stored solution, win dialog shown) |
| Levels failed | 0 |
| Levels blocked / not tested | 0 on web. On Android, levels were played by touch only for spot checks; all 60 levels are covered by the mobile unit tests (solvable, par matches, hints follow the solution). |

**Checked on every level:**
- The level loads, and the board starts unsolved.
- All moves are legal.
- The pipe connects and the Play button turns ready.
- The ball reaches the goal and the win dialog opens.
- Stars and the HUD move counter are correct.
- First-clear coins are paid (+5).
- "Next" is hidden on the last level of a section.

**Also checked by hand:**
- Real drag on the board, on web (mouse) and Android (swipe).
- Undo, Hint, Pause (the clock stops) and Resume.
- Restart, Next level, and "Path broken" → Keep trying.
- "Out of moves" on a Challenge level.

## B. Monetization audit

| Area | Status | Notes |
|---|---|---|
| Daily gift ad | **PASS** | Closing early gives no gift ("Watch the whole ad…"). Watching to the end gives one gift, even when Claim is double-tapped. |
| Coin ad (Ball Collection) | **PASS** | +25 coins, 2 a day, then "No more ads today". A failed ad pays nothing and doesn't use up a daily ad. |
| Extra-moves ad | **PASS (new)** | The out-of-moves dialog explains the offer and shows the amount (+3). Moves are added only after the full ad, once. The player keeps the same board. Offered once per level. Declining is possible: close the ad, Restart or Levels. |
| Ad loading state | **PASS (new)** | "Loading ad…" spinner before the ad plays. |
| Ad fails to load / no internet | **PASS (new)** | An error screen with a message and a Try again button. No reward. QA switch: `?ad=fail` or `?ad=offline` (web), `ad.simulate` (config). |
| App sent to background during ad | **PASS (new)** | The countdown pauses while the game is hidden, so no reward is given while the ad isn't on screen. |
| Duplicate reward protection | **PASS** | Covered for double taps, repeat callbacks and stale prices. |
| Interstitial ads | **NOT TESTED** | Not implemented in the game, so there is nothing configured to test. |
| Banner ads | **NOT TESTED** | Not implemented in the game. |
| Ad-free / premium | **NOT TESTED** | Not implemented. |
| Real ad network (AdMob test ads) | **BLOCKED** | No SDK is integrated. It has to be added before the real ad lifecycle can be verified. |

## C. Reward system audit

| Area | Status | Notes |
|---|---|---|
| Milestone gifts | **PASS** | They appear at 10, 20, 30, 40, 50 and 60 levels. Six were earned and six claimed, none skipped or doubled, each with exactly one reward. The win dialog shows "Milestone gift ready!". |
| Daily gifts | **PASS** | First gift by ad, then 25 → 50 → 100 → 200 → 400 coins. Cancel charges nothing. Too few coins blocks the purchase and says how many more are needed. Coins are charged once. |
| Day reset | **PASS** | The next calendar day resets the gift count and the coin-ad count. The count survives restarts and "Reset progress". |
| Device clock moved back | **PASS (fixed)** | It used to reset the daily counters (an exploit). They now reset only when the date moves forward. Moving the clock forward still works, as there is no server time. |
| Reward probabilities / no duplicates | **PASS** | Weighted pick. A cosmetic type with nothing left drops out. 400 seeded gifts gave no duplicates, and every ball and theme was eventually unlocked. |
| Balls | **PASS** | Unlocked by stars, a gift, or buying with coins. Equipping works and survives a reload. |
| Sounds | **PASS** | Gifted sounds can be used with any ball. The chosen sound plays while rolling and survives a reload. |
| Themes | **PASS** | Unlock and equip work. Background and board tray change on every screen, and the choice survives a reload. |
| Coins | **PASS** | Earned and spent correctly. The balance can't go negative and survives a reload. |
| Inventory persistence | **PASS** | All of these were identical after a page reload: coins, extra moves, theme, ball, sound, history, the day's count and milestones claimed. |

## D. UI/UX audit

**Screens inspected:**
- Home and Levels
- Game: HUD, board, controls
- Pause, Win, Path broken, Out of moves
- Settings
- Ball Collection, with the shop
- Gifts: daily, milestone, themes, sounds, history
- Reward reveal
- Ad: loading, playing, error
- Confirm dialogs

**Checks:**
- No horizontal scrolling, clipped text or off-screen elements at 375 px.
- No broken images.
- The home screen fits on one screen at every tested size.
- The Extra Moves counter is visible in three places:
  - the **+N** badge on *Moves left*
  - the Gifts screen wallet
  - the out-of-moves dialog button ("Use +3 Extra Moves (N left)")

**UI issues found and fixed:**
- The Android test ad's "INSTALL" label was missing, because Skia's SVG renderer skips text. It is now drawn as native text.
- After extra moves were added, the ball stayed at the failed spot with the red ✕ marker. The ball now goes back to the start and the marker is cleared, on web and Android.

## E. Bug report

| ID | Severity | Feature | Steps | Expected | Actual (before) | Root cause | Fix | Retest |
|---|---|---|---|---|---|---|---|---|
| QA-01 | High | Milestone gift | Double-tap "Open milestone gift" | One gift, shown in the popup | Two gifts opened; the first was never shown | The button stayed clickable before the reveal opened | Ignore taps while a reveal is open (web + mobile) | PASS: one gift per tap |
| QA-02 | High | Daily gift / coin ads | Set the device clock back a day | No new free gift | Counters reset, so free gifts and coins could be farmed | Reset when the date changed in either direction | Reset only when the date moves forward | PASS + unit tests |
| QA-03 | Medium | Extra moves | Double-tap "Use +3 Extra Moves" | 3 moves used | 6 used | A second tap landed after the dialog closed | 600 ms tap guard in both engines | PASS: 3 used |
| QA-04 | High | Monetization | Run out of moves | Option to watch an ad for moves | No such option | Feature missing | "Watch ad: +3 moves" (configurable, once per level) | PASS on web and Android |
| QA-05 | Medium | Ads | Ad can't load / offline | Message + retry, no reward | Not handled (the mock always played) | No loading or error states | Loading, error and retry states; pause in background | PASS |
| QA-06 | Low | Extra moves | Revive after out of moves | Ball back on start | Ball and ✕ stuck at the failed spot | Ball not reset on revive | Reset the ball and clear the marker | PASS on web and Android |
| QA-07 | Low | Android ad | Open the test ad | Full creative visible | "INSTALL" text missing | Skia SVG skips `<text>` | Native text overlay | PASS |

**Remaining (not fixed, need a product decision):**
- **Medium – offline web:** the web build loads its font (Google Fonts) and icons (Bootstrap Icons) from a CDN.
  - Offline, the icons disappear and the font falls back.
  - Fix: bundle these files locally. The Android app is not affected: it is fully offline.
- **Info – interstitial and banner ads:** not built. Add them only if they are part of the plan, with frequency caps.
- **Info – real ads:** AdMob, or another network, is still to be integrated. The mock flows define the behaviour it needs.
- **Info – moving the clock forward:** this still gives the next day early. A real fix needs server time.

## F. Release readiness

| Area | Status |
|---|---|
| Core gameplay (60 levels, controls) | PASS |
| Rewards: milestones, daily gifts, coins, shop | PASS |
| Persistence | PASS |
| Rewarded ads (simulated) | PASS |
| Real ad network | BLOCKED |
| Interstitial / banner ads | NOT TESTED (not implemented) |
| UI/UX at phone, tablet and desktop sizes | PASS |
| Offline web assets | FAIL (CDN fonts and icons) |

**Recommendation: ready for internal testing.**

It is not ready for production. The ads are simulated, a real ad SDK and its policy checks still have to be done, and the reward art is still placeholder.
