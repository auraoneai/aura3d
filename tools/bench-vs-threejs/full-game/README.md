# Complete-game comparison: the same game on Aura3D and on plain three.js

Method for `evidence/vs-threejs/full-game/README.md` (the results live there). The question: how many lines does a developer write to ship a COMPLETE small game (scene, fixed-step loop, keyboard and touch controls, HUD, pause, results, restart, synthesised audio, seeded replay and QA hook, resize/DPR, teardown) with `@aura3d/engine` 4.3.6 and its kits, against plain `three@0.185.1` + vanilla TypeScript/DOM/Web Audio with no other library?

## The game

"Coin dash": move a box around a lit arena, collect eight coins within 30 seconds. The rules are the engine-neutral module `tools/bench-vs-threejs/shared/coin-sim.ts`, used unchanged by both builds (the build log records its sha256 as staged and in the repo). The rules file is NOT counted for either side. Everything around it is counted.

Both builds implement the same checklist:

1. A lit 3D scene: ground, player, coins, camera, lighting with shadows.
2. A fixed 60 Hz simulation step driven from the render loop (accumulator).
3. Keyboard controls and on-screen touch controls.
4. A DOM HUD (score, time left), pause (P key and a button), a results screen (win and time up), restart (R key and a button).
5. Audio cues for pickup, win and lose, synthesised with Web Audio (no audio files), with the autoplay-unlock gesture handled.
6. A deterministic seeded replay (scripted input, N steps, state hash) and a window hook exposing state for QA.
7. Resize and device-pixel-ratio handling, and teardown/restart without leaking.

It is a benchmark game: the Aura3D build uses primitives for the player, coins and ground (`docs/agents/claims-and-boundaries.md` allows that for a prototype benchmark), not typed GLB assets.

## Layout

| Path | What |
| --- | --- |
| `aura/` | `@aura3d/engine` build: `createGame` (`@aura3d/engine/game`), `createFixedStepLoop`, `createCountedRng`, `installQaHooks`, `readQaParams`, `createCueBank` (`@aura3d/engine/audio`), `looks.preset`. Public API only, no `three` import, no `unsafeModelUrl`. |
| `three/` | `three` build: `WebGLRenderer`, own accumulator loop, own DOM HUD and d-pad, own Web Audio helper, own mulberry32 and QA hook. No extra libraries (conservative: real projects often add some). |
| `build.mjs` | Stages both apps, `npm install`s the PUBLISHED packages, type-checks, runs a stock `vite build` (no `vite.config`, no plugin) and records bundle bytes, then runs `count.mjs`. |
| `count.mjs` | Counts authored lines per file and per concern, and o200k tokens with `gpt-tokenizer` when installable. |
| `extract.mjs` | Reassembles the base64 results and frames printed in a remote run log. |
| `../../../tests/browser/fullgame-compare.spec.ts` | The one Playwright spec that builds and checks both apps. |

## Counting

* Rule: the one in `harness/static-metrics.mjs` (non-blank lines that are not only a comment). `count.mjs` applies it per line and asserts that its total equals the harness rule's total for every file.
* Counted: every `src/*.ts` and `src/*.css` file of each app (CSS is authored source; both builds need it).
* Listed separately, not counted: `index.html`, `tsconfig.json`, `../shared/coin-sim.ts`, the staged HDRI (`aura/public/hdri`, copied from `public/hdri` as the create-aura3d scaffold does), generated files (none exist).
* Concerns: a `// @concern <name>` (TS) or CSS block comment `@concern <name>` marks the start of a region; every counted line after it, until the next marker, belongs to that concern. Lines before the first marker of a file belong to `glue` (imports, the function signature). Markers are comments, so they add no counted lines. The concern names are `scene`, `loop`, `input-touch`, `hud-screens`, `audio`, `replay-qa`, `resize-teardown`, `glue`.
* Tokens: `gpt-tokenizer` `o200k_base` of the comment-stripped source (a proxy; Claude's tokenizer is not public).

## Running it

Remote only (no Docker, no local browser on the Mac):

```bash
SPECS="tests/browser/fullgame-compare.spec.ts" RUN_ID=fullgame-N tools/remote-acr/run.sh
node tools/bench-vs-threejs/full-game/extract.mjs evidence/vs-threejs/full-game/results.json /tmp/fullgame-frames tests/reports/remote-acr/fullgame-N/acr-run.log
```

The spec installs `@aura3d/engine` 4.3.6, `three` 0.185.1 and Vite 7.3.2 with npm inside the container, builds both apps, serves each `dist` statically and drives it in headless Chromium on software WebGL2 (SwiftShader). Timings are not GPU timings. `count.mjs` also runs on the Mac (pure Node): `node count.mjs . out.json <dir containing node_modules/gpt-tokenizer>`.

## What the spec checks, identically on both builds

Stock build and type-check; non-black frame; four touch buttons visible and a real touch (CDP `Input.dispatchTouchEvent`) on each moves the player in that direction; P key and pause button stop the clock (state frame and time stay constant for 1.5 s) and resume continues; results screen at win and at time up; R key and the restart/again buttons reset; an `AudioContext` spy records oscillator waveform types (triangle = pickup, sine = win, sawtooth = lose) and verifies replay makes no sound; the seeded replay of 600 and 1800 steps gives the same hash twice and equals a hash computed in Node from the shared rules; resize to three viewports and DPR 2; teardown and four remounts leave the listener count on `window`/`document`/`body`, the element count and the canvas count unchanged.

## Caveats

One author, who knows three.js better than the Aura3D kits; one small game; the rules are shared; no extra libraries on the three.js side; software GL; Aura3D 4.3.6 and three.js 0.185.1. Different decisions would change the numbers; see the evidence README.
