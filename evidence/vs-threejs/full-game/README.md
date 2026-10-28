# Complete game, written twice: Aura3D 4.3.6 against three.js 0.185.1

Internal evidence file. Results are stated as measured, including where three.js is shorter or where the Aura3D kits did not work as documented. Method, layout and scripts: `tools/bench-vs-threejs/full-game/README.md`. Sources: `tools/bench-vs-threejs/full-game/{aura,three}/`. Spec: `tests/browser/fullgame-compare.spec.ts`. Raw numbers: `results.json` here.

## Question

`RESULTS.md` section 11 marks the game kit "not trialled", and no earlier measurement compared a COMPLETE game (HUD, touch, audio, replay) line for line. This builds the same small game twice and counts every line the author writes.

* Game: "coin dash" (collect 8 coins in 30 s). The rules are `tools/bench-vs-threejs/shared/coin-sim.ts`, used unchanged by both builds (sha256 `7921bc75...a57bc`, identical in the repo and as staged). **The rules file is not counted for either side.**
* Both builds implement the same seven-item checklist: lit scene with shadows; fixed 60 Hz step from the render loop; keyboard and on-screen touch controls; DOM HUD, pause (P and a button), results (win and time up), restart (R and a button); synthesised Web Audio cues for pickup, win and lose with the autoplay unlock; seeded scripted replay with a state hash and a window QA hook; resize, DPR, teardown and remount.
* Aura3D build: `@aura3d/engine` 4.3.6 public API only: `createGame` from `@aura3d/engine/game`, `createFixedStepLoop`, `createCountedRng`, `readQaParams`, `installQaHooks`, `createCueBank` from `@aura3d/engine/audio`, `looks.preset("outdoor-day")`. No `three` import, no `unsafeModelUrl`. It is a benchmark game: primitives for the ground, player and coins (allowed for a prototype benchmark by `docs/agents/claims-and-boundaries.md`).
* three.js build: plain `three@0.185.1` and vanilla TypeScript, DOM and Web Audio, no other library. This is conservative: real three.js projects often add libraries (a state or UI helper, a sound library, a touch-joystick package), which would shorten the three.js side.

## Result: authored lines

Counting rule of `harness/static-metrics.mjs` (non-blank lines that are not only a comment), applied to every `src/*.ts` and `src/*.css` file the author wrote; `count.mjs` asserts its per-line total equals the harness rule for every file. Tokens: `gpt-tokenizer` o200k_base on the comment-stripped source (an OpenAI tokenizer used as a proxy; Claude's is not public).

| Concern | Aura3D lines | three.js lines | Aura3D tokens | three.js tokens |
| --- | ---: | ---: | ---: | ---: |
| scene (ground, player, coins, camera, light, shadows) | 22 | 33 | 357 | 507 |
| loop (fixed step, cue triggers, draw) | 35 | 49 | 388 | 437 |
| input and touch | 47 | 74 | 389 | 686 |
| HUD and screens | **76** | **64** | 606 | 524 |
| audio | 19 | 42 | 229 | 480 |
| replay and QA | 31 | 43 | 289 | 405 |
| resize and teardown | 27 | 51 | 156 | 298 |
| imports and wiring (glue) | 14 | 17 | 208 | 192 |
| **Total** | **271** | **373** | **2,622** | **3,529** |

Aura3D is 102 lines shorter (271 against 373, 0.73 times, 27% fewer) and 907 tokens shorter (0.74 times). **three.js is shorter in HUD and screens (64 against 76) and in glue tokens (192 against 208).** The saving is concentrated in audio (the cue bank), input and touch (the touch preset), resize and teardown, and replay and QA. It is not "a fraction of the code" in any strong sense; "about a quarter fewer lines" is what was measured.

Per file (lines): Aura3D `game.ts` 122, `style.css` 74, `screens.ts` 31, `audio.ts` 20, `scene.ts` 19, `main.ts` 5 (total 271). three.js `game.ts` 133, `style.css` 78, `scene.ts` 60, `audio.ts` 42, `touch.ts` 28, `ui.ts` 27, `main.ts` 5 (total 373). Listed separately and not counted: `index.html` 12 lines and `tsconfig.json` 14 lines in each build, the shared rules file (49 lines), and the staged HDRI for the Aura3D look preset (1.09 MB binary, copied from `public/hdri` as the create-aura3d scaffold does). There is no `vite.config` in either build and no generated file.

How lines were assigned: a `@concern` comment marker starts each region (comments are not counted), so a region boundary inside a file is a judgement. Moving a boundary by a few lines does not change the totals.

## Result: verification (remote, software WebGL2)

Final run `fullgame-3` (ACR build ch38s, run ch38t): headless Chromium from Playwright 1.59.1 on SwiftShader, npm-installed published packages (`@aura3d/engine` 4.3.6, `three` 0.185.1, Vite 7.3.2, TypeScript 5.9.3), stock `vite build` of each app with no config and no plugin. Both builds type-check and build. **Both builds pass all 16 scripted checks:**

| Check | Aura3D | three.js |
| --- | :-: | :-: |
| non-black frame (canvas mean luma 148 / 72, std 56 / 35) | pass | pass |
| four touch buttons visible | pass | pass |
| real touch (CDP `Input.dispatchTouchEvent`) on each button moves the player that way | pass (4/4) | pass (4/4) |
| P key stops the clock (state frame and time constant for 1.5 s) and resume continues | pass | pass |
| pause button does the same, with the "Paused" label shown | pass | pass |
| results screen on win ("YOU WIN - score 80") | pass | pass |
| results screen on time up ("TIME UP - score 0") | pass | pass |
| restart by R key resets; restart by the results and header buttons resets | pass | pass |
| AudioContext spy: pickup (triangle), win (sine), lose (sawtooth) oscillators from real events; none during replay; context running after one key press | pass | pass |
| seeded replay of 600 and 1800 steps: same hash twice, and equal to a hash computed in Node from the shared rules | pass | pass |
| the replay hash is identical across the two builds (`playing:30:600:321a662f`, `lost:60:1800:9b693d58`) | pass | pass |
| resize to 1000x500, 390x844, 800x600 (canvas matches the viewport, non-black); DPR 2 gives a 2x backing store | pass | pass |
| teardown and four remounts: listeners on window/document/body, element count and canvas count unchanged, replay hash still correct, still plays | pass | pass |

Bundle bytes (context only, JS): Aura3D 3,596,528 raw / 1,129,133 gzip / 959,736 brotli in 39 files; three.js 516,898 / 131,094 / 108,220 in 1 file. The Aura3D app is about 7 times larger raw and 8.6 times larger gzipped. The stock Aura3D build warns (`node:fs`/`node:path` externalized by `@gltf-transform/core`, `basis_transcoder.js` not found at build time, chunks over 500 kB) but succeeds; the 4.1.2 stock-build failure recorded in `tools/bench-vs-threejs/README.md` did not reproduce on 4.3.6.

Frames (`*.jpg`, decoded with sharp, not viewed): `aura-play` (mean luma 148), `three-play` (72), `aura-results` (51), `three-results` (27), `aura-mobile` and `three-mobile` (390x844 with touch controls; 58 and 31). The two builds do not share a look: Aura3D uses `looks.preset("outdoor-day")`, three.js uses a hand-placed hemisphere and sun light, so the luma difference is not a quality comparison.

## What did not work first time (recorded, then fixed)

Run 1 (ch38f) and run 2 (ch38r) had failures. The three.js build needed no code change after its first remote run; the Aura3D build needed three.

1. **Aura3D, pause key.** The kit's session lifecycle already toggles pause on P, Escape and tab hide. My own `pause` input action toggled it a second time, so the two cancelled. Fix: delete the action and listen to `game.session.on("state")` for the label (4 fewer lines in total). Found only by the remote check; the docs do not say P is bound.
2. **Aura3D, teardown.** `game.dispose()` removes the HUD and touch layers but leaves the canvas the app appended to the target: after 4 remounts the page held 5 canvases and 79 elements (75 before). Fix: one line removing `#app canvas` after `dispose()`.
3. **Aura3D, 404s.** `looks.preset("outdoor-day")` requests `/hdri/autumn_field_puresky_1k.hdr`; in a stock Vite app that file does not exist, so run 1 logged 10 failed requests, `ENV_FETCH_FAILED` and rendered with the neutral floor. Fix: stage the file in `public/hdri/`, as the scaffold does. The final run has 0 failed requests and 0 console errors for Aura3D (4 benign Chromium `GPU stall due to ReadPixels` warnings from the test's screenshots).
4. **three.js, renders check (spec bug, not app bug).** In run 1 the three.js first frame took about 55 s on software GL (`bootMs` 55,236) and my check read the sim frame before it. The check now waits for the first simulated step. Run 3 did not reproduce the stall (three.js boot 0.55 s, first step 0.76 s) and run 2 showed 290 simulated steps within 2.5 s; treat the 55 s as a one-off software-GL outlier.

## Kit gaps found while writing the Aura3D build (public API of 4.3.6)

These explain Aura3D lines that exist and choices that differ from the docs' idea of the kit:

* **Touch controls respond to touch events only.** The kit binds `touchstart`/`touchend`. A mouse press (or pen) on a touch button moved the player 0 units in the Aura3D build and 9 units in the three.js build (pointer events). The brief's "visible buttons that work with pointer events" holds for three.js and not for the kit's buttons; the real-touch check passes for both.
* **Touch layer has no stylesheet.** No rule for `.a3g-touch` or `.a3g-tc` exists in the package; without CSS the controls have no position or size. The Aura3D build carries 31 lines of CSS for them (position, size and the arrow glyphs via `::after` content on `[data-control]`); the three.js d-pad CSS is 30 lines. The preset's buttons are 102x38 CSS px at 800x600.
* **Touch controls start hidden** (shown after the first `touchstart`); `createGame` does not forward the `show` option, so the build calls `game.touch.setVisible(true)` to match the always-visible three.js buttons.
* **`twin-stick` could not be used.** Its stick only reaches the input actions through `touch.update()`, which is not on the public `TouchControls` type (`visible`, `setVisible`, `dispose`) and which `createGame` does not call (source read: `packages/game/src/touch/TouchControls.ts`; not exercised in a browser). The build uses the `dpad-2btn` preset with its four buttons bound to left, right, up (`jump`) and down (`attack`). The layout is the platformer one (left and right on the left, up and down on the right).
* **The timer widget's `mode` is not on the public `HudWidgetSpec` type**, so the clock is an `objective` text widget (as in `docs/agents/build-a-game.md`). `Game.input` is typed possibly undefined.
* **The shell's pause menu and results screen are not DOM yet** (`shell.showResults` only changes the session state). The pause label, the Pause and Restart buttons and the results overlay are hand-written DOM in `aura/src/screens.ts` (31 lines plus CSS), the same job the three.js `ui.ts` does. This is why HUD and screens is not shorter for Aura3D: the kit's HUD widgets replace only the score and time text.
* **Three WebGL contexts per Aura3D mount** against one for three.js (getContext spy): 3 at boot, 15 after four remounts, against 1 and 5. Neither build calls `forceContextLoss`, so contexts wait for garbage collection in both.

## Differences that make the two outputs not identical

* Aura3D gets, without extra lines: themed HUD widgets, pause on Escape and tab hide, an `M` mute key, and the look preset (sky, fog, grade; its environment HDRI only loads when the file is staged). The three.js build has a plain-text HUD and none of those.
* Touch layouts differ (Aura3D platformer preset with 102x38 buttons, three.js a cross of 56x56 buttons).
* Both play audio only for live events; replay is silent in both (checked).
* On software GL the Aura3D build is slower: first simulated step 10.5 s after navigation (6.5 s after boot) against 0.76 s, whole spec 397 s against 43 s. These are not GPU numbers and say nothing about a real device.

## Caveats

One author, who knows three.js better than the Aura3D kits (the first Aura3D version failed three of its own checks, the three.js version none). One small game, so concern sizes would shift on another game. The rules are shared and not counted. No extra libraries on the three.js side. Software WebGL2 only. Aura3D 4.3.6, three.js 0.185.1, Vite 7.3.2, Playwright 1.59.1 Chromium. Token counts use an OpenAI tokenizer. The lines count what is written, not time to write it: the Aura3D build cost more remote iterations (3 runs) than the three.js build.

## What this supports for public wording

"The same complete game took 271 lines on Aura3D 4.3.6 and 373 on plain three.js 0.185.1 (about a quarter fewer; one author, one small game, software GL)." It does not support "a fraction of the code", "less HUD code", or any claim about touch controls working with pointer events.

## Remote runs

| Run id | ACR build | ACR run | Outcome |
| --- | --- | --- | --- |
| fullgame-1 | ch38c | ch38f | 3 failures (items 1, 2, 4 above), 404s (item 3) |
| fullgame-2 | ch38q | ch38r | 1 failure (item 1) |
| fullgame-3 | ch38s | ch38t | 16/16 on both builds; the numbers above |

Logs: `tests/reports/remote-acr/fullgame-{1,2,3}/acr-run.log` (not committed). Reassemble with `node tools/bench-vs-threejs/full-game/extract.mjs <out.json> <framesDir> <acr-run.log>`.
