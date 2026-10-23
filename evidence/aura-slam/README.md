# Aura Slam 3D parity baseline

First-party baseline of the live game (`apps/showcase-top-tennis`, https://aura3d.auraone.ai/apps/showcase-top-tennis/) captured **before** any conversion to the Aura3D library. A converted build must reproduce `reference.json` (simulation) and stay within the metrics in `frames-reference.json` (rendering). Captured on the remote runner (ACR, software WebGL2 / SwiftShader), never on the Mac.

Files:

| File | What |
| --- | --- |
| `reference.json` | schema `a3d-crayon-capture/1`: six scripted scenarios x 2 independent sessions: setup, input script, per-scenario outcome, engine event log, score timeline, sampled state rows, FNV digest over every step, session variance and tolerance |
| `trace-manual-human-policy.json` | full per-step trace (6,001 rows) of the scripted-input scenario, for tolerance-based replay |
| `frames-reference.json` | per-frame metrics (luma/RGB histograms, edge density, mean luma/RGB, image size, render time, engine graphics debug) for every reference frame |
| `frames-reference/*.jpg` | 27 reference frames: 8 game states at 1280x720 and 640x360, 6 venues at 1280x720, 3 mobile (390x844 @2x) |
| `../../tools/aura-slam/extract.mjs`, `build-reference.mjs` | decode a remote run log into the files above |
| `../../tests/browser/aura-slam-capture.spec.ts` | the capture spec (state + frames); `aura-slam-probe.spec.ts` is the discovery probe |

## Determinism method

The page already ships the hooks needed:

* `window.advanceTime(ms)`: switches the game into **manual stepping** and runs `update(1/60)` once per 1000/60 ms, then `render()`.
* `window.render_game_to_text()`, `window.__TOP_TENNIS_CONTROL__.getState()/getEngine()`, `window.TennisMenu.launch()`, `window.TennisLocal.selectVenue()`.
* The match engine (`public/toptennis/match-engine.js`) is seeded from game time / serve counters only (`seeded(...)`, no `Date.now`/`performance.now`/`Math.random` in `match-engine.js`, `physics.js`, `strokes.js`, `player-pose.js`). `Math.random` is only used by audio and tournament code and never feeds sim state.

Procedure (one synchronous `page.evaluate`, so the real-time rAF loop can never interleave):

1. Open the page **without** `?autoplay`, wait for `body[data-aura3d-ready=true]`, then wait until `TennisMenu.debug().introRemaining` is 0.
2. Configure through the page's own controls: `[data-difficulty=<level>]` click, venue toolbar button `[data-aura-venue=<id>]` click, Auto toggle `#aura-btn-auto`; call `TennisMenu.launch()`; verify `state.venue`, `state.difficulty`, `state.mode==='playing'` and the Auto state (the run retries on a fresh page if not applied).
3. Per step: optionally dispatch scripted `KeyboardEvent`s on `document.body`, call `advanceTime(1000/60)`, record the snapshot, feed it to an FNV-1a digest, append engine events (captured by wrapping `window.TennisEngine.create(opts)` so `opts.onEvent` is tee'd with the engine time and step index).
4. Stop at game over or at the step cap. Sessions use a 320x180 viewport (render cost is irrelevant to the sim).

Gotchas the port must preserve (they are game logic that lives in the Aura3D adapter, not in the sim):

* `stepTopTennisPlayerControl` (called from `renderer.render`, once per render) implements **autoplay** (player movement toward the incoming ball, serve after 0.45 s, deep return swings), **serve-phase movement** (WASD/arrows move the server along the baseline at 1.35 x / 1.05 y per second, clamped x +-0.95, y 0.72..1.12) and the **toss-apex assist swing** (`phase==='serveToss'`, ball z >= 0.8, vz <= 0.55). Any extra `render()` (window resize, venue change) advances this logic; the port must keep **exactly one render per `advanceTime`** and must reproduce this controller.
* Keyboard shot keys `J/K/L` are handled in the adapter (`J` short, `K` deep + power, `L` lob), in addition to the game's own bindings.

## Observable behaviours the port must preserve

**Match flow.** Menu (Quick Match, Smash Lab practice, Modes & Tour: tournament + online, Auto toggle, venue buttons) -> `TennisMenu.launch()` -> serve -> rally -> point -> game -> match. Result screen with match stats at game over. Pause with `P`/`Escape`, fullscreen `F`, sound toggle.

**Scoring.** Points 0/15/30/40 with deuce/advantage (win a game at >= 4 points and a 2-point lead). A match is won at >= 3 games with a 2-game lead (so 3-0, 3-1, 4-2, ...); at 3-3 a **tiebreak** starts (first to 7, win by 2; server alternates every 2 points after the first). Server alternates each game from `firstServer`. Status strings: `YOUR SERVE`, `FIRST TO 3 GAMES · WIN BY 2`, `TIEBREAK · FIRST TO 7, WIN BY 2`, `GAME — YOU` / `GAME — RIVAL`.

**Serve rules.** Two serves per point; `phase`: `serve` -> `serveToss` (ball toss; press at the circle) -> `rally`; faults show `FAULT — LONG + WIDE  •  SECOND SERVE`; second fault is a double fault; lets replay the serve; serve stats (attempts, first/second in, faults, double faults, lets, aces, speeds) accumulate; toss/serve timing quality text (`LATE SERVE · 120 KM/H`, `SERVE IN`, `PERFECT`, `CLEAN`).

**Shots.** Presets `neutral`, `short`, `deep`, `lob` (keys `Q` short, `E` deep, `R` lob, `C` placement, `Space` hit, `Shift` power); power costs 38 of 100 energy (recovery 6/s after 1 s delay); `SHOT.aimWindow 0.18 s`, `contactOpens 0.16 s`, `doubleTapWindow 0.22 s`. Stroke names (forehand/backhand/volley/smash...) and speeds in km/h are reported in `message` and the speedometer.

**Controls.** Keyboard defaults: left/right/up/down = arrows or A/D/W/S; hit = Space; power = Shift; short = Q; deep = E; lob = R; placement = C (rebindable, with gamepad profile: hit 0, power 7, short 2, deep 1, lob 3). Touch: virtual joystick, HIT, LOB, POWER HIT buttons, tap-to-hit and optional swipe-control style on mobile.

**Opponent levels.** `beginner`, `club`, `pro`, `legend` (`SERVE_CPU` and the level tables in `match-engine.js`: runSpeed, reaction, error, bias, pace, power, margins per level; pro/legend are "strategic" difficulties with extra HUD hints and aim control).

**Venues.** `hard` (New York night), `grass` (London), `clay` (Paris), plus destination arenas `desert` (Dubai), `beach` (Tropical Beach), `moon` (The Moon): destination venues keep regulation hard-court physics and the same sim (the scripted beginner scenario produces an identical digest on `hard` and `moon`); venue changes palettes, scenery, spectators (hidden on the moon), outfits (apollo suits on the moon) and the label under the court (`NEW YORK / HARD COURT`...).

**HUD.** Scoreboard (names from the roster: `Valcera` vs `Nangong` by default, games, points, serve dot, status line), power bar, ball speed gauge with last shot, bottom hint bar (`MOVE & AIM: WASD / ARROWS · SERVE & HIT: SPACE / J / K / L · DROP SHOT: Q · LOB: E · POWER: R · PAUSE: P`), venue label, pause and fullscreen buttons, sound toggle, quick toolbar (`AURA3D ENGINE`, Quick Match, Smash Lab, Auto, Modes & Tour, six venue pills).

**Rendering facts of the current adapter** (what `frames-reference/` shows): camera eye (0, 25.5, 37.1), target (0, 0, 0.7), fov 15 deg; court scale COURT_X 5.5, COURT_Z 8, COURT_Y 2.177; PBR materials from `VENUE_PALETTES`; athletes assembled from boxes/cylinders with hand IK (`racketSports` kit helpers); ball trail, ball shadow, court marks, spectators, umpire, net-fault lights; `qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] }` (post/compiler/volumetric fog flags pinned off) and bloom/vignette/colour grade effects.

## Measured results (remote runs `slam-ref-all2-20261023T220313Z` and repeat `slam-ref-repeat-20261023T221350Z`)

State sessions (2 independent page loads per scenario; 320x180; ~0.15-0.25 ms per step incl. render):

| Scenario | Setup | Steps | Outcome | Digest (FNV, 1e-6 rounded) | 2 sessions |
| --- | --- | --- | --- | --- | --- |
| `auto-beginner-hard` | Auto, beginner, NY hard | 12,579 | game over, player wins 3-0, 14 points | `d8a8a4f0e16c8959` | identical |
| `auto-beginner-moon` | Auto, beginner, Moon | 12,579 | same as hard (venue does not affect the sim) | `d8a8a4f0e16c8959` | identical |
| `auto-club-grass` | Auto, club, London grass | 32,491 | game over, player wins 4-3 (7-5 pts), 39 points | `3ed28bdef109674d` | identical |
| `auto-pro-clay` | Auto, pro, Paris clay | 79,658 | game over, player wins 3-0 | `3a1244d17a57dc27` | identical |
| `auto-legend-hard` | Auto, legend, NY hard | 90,000 (cap) | still playing at 3-2 games: autoplay long rallies never finish the match in 25 min of game time | `904dcacf541b39be` | identical |
| `manual-human-policy` | scripted keys (286 key events recorded in `script.inputs`), beginner, hard | 6,000 | playing, 0-0 games, 2-2 points, 4 points played, serves/faults/aces recorded | `c6040f21f8d17454` | identical |

* **Variance: zero.** Every scenario reproduced with an identical digest, step count and event log in both sessions; the repeat run (separate ACR run, two of the scenarios) reproduced `d8a8a4f0e16c8959` and `c6040f21f8d17454` exactly. Sampled-row max absolute difference between sessions: 0. Tolerance for the port: **exact digest** if the sim code is reused unchanged; if the sim is re-implemented, replay `trace-manual-human-policy.json` / `sampled` rows within **1e-6 absolute** and events at **0 steps** difference.
* Engine events captured per scenario (`serve`, `hit`, `bounce`, `point`, `pointSound`, `tone`, `selection`, `complete`) with engine time and step index; point/game/match boundaries in `timeline`; capture steps for the frames in `captureSteps`.
* A first run with an earlier harness version produced different digests (`d91da0f17f6c80ea`...) and one inconsistent session: the page was driven before `TennisMenu` finished its intro and venue/difficulty were not verified. That harness was discarded; the current one waits for `introRemaining == 0`, applies settings through the toolbar buttons and verifies them after launch.

Frames (`frames-reference/`, metrics in `frames-reference.json`; software WebGL2, page screenshot incl. DOM HUD):

* States: `menu`, `serve-ready` (step 1), `serve-toss` (34), `serve-fault` (122), `ball-at-bounce` (291), `rally-near-net` (316), `point-won` (1,076), `game-won` (5,415), `match-over` (12,579 in this run's scenario ids; step recorded per frame in the JSON) at 1280x720 and 640x360; six venues at serve-ready (1280x720); three mobile 390x844 @2x frames. Each frame = replay the pure scenario to the listed step at 320x180, resize the viewport (one extra render), one more `advanceTime`, screenshot.
* Mean luma 43-97 (1280x720), edge density 0.077-0.089 at 1280x720, 0.107-0.139 at 640x360. Two frame sets taken a few hours apart (the first with the earlier harness) differ by at most 0.23 mean luma and 0.0014 edge density, so metric thresholds for parity should be about 1-2 luma and 0.005 edge density.
* Cost proxy on the CPU rasteriser: median wall time from the render step to the end of a screenshot is about 86 s at 1280x720, 25 s at 640x360, 29 s at 390x844@2x (it includes the engine's own continuous render loop and two screenshots; not a GPU number). JS heap at first frame about 76.6 MB.
* **Not measurable here:** engine `diagnostics().drawCalls` reports 0 on this route (the adapter renders through the production runtime; `app.info`: 25 geometries, 16 textures, 11 programs, `app.diagnostics().programs` 9, `maxRecommendedDrawCalls` 260); the `?diag=1` panel of the port wrappers is the reliable draw-call source and is not mounted on this page.

## Reproduce

```bash
# state + frames (≈ 45 min on the loaded runner); SLAM_* knobs ride in tests/browser/aura-slam-mode.txt (state | frames | all)
RUN_ID=slam-ref-<n> SPECS="tests/browser/aura-slam-capture.spec.ts" tools/remote-acr/run.sh > /tmp/slam.log
node tools/aura-slam/extract.mjs /tmp/slam.log --out /tmp/slam-out
node tools/aura-slam/build-reference.mjs /tmp/slam-out/raw --out evidence/aura-slam --commit <sha>
cp /tmp/slam-out/frames-reference/*.jpg evidence/aura-slam/frames-reference/
```

`SLAM_BASE` (env) or editing `BASE` retargets the spec at another deployment (e.g. the converted build) so the same spec produces a comparable `reference.json` for diffing; compare `digest`, `timeline`, `events` and `sampled` rows.
