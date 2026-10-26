# Game leftovers: local copies of things the library now provides

Date: 2026-10-24. Scope: the 15 index games (`apps/showcase-<slug>`), the 11 `examples/*-port`, `apps/showcase-port-shared`, and the four starter templates. Method: semantic scan (`rg` by behaviour, not by the word "workaround") plus reading each hit. Chase cameras, objective markers and the toon pass are excluded: `promote-cameras`, `promote-marker` and the toon promotion own them.

Verified clean across all 26 games: no GLTFLoader or hand-rolled hash tables, no own black-frame guard implementation, no own diagnostics panel, no vendored engine bundles. The shared `blackframe.ts` and `diag.ts` wrappers are thin passes over `@aura3d/debug`.

## Fixed in this pass

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | Cross Hop replaced `window.__AURA3D_GAME__` with a sanitizing setter because the library beacon embedded the live `app` (circular via `app.post`), which broke JSON serialization in remote capture | `apps/showcase-cross-hop/src/main.ts` (20 lines) | Library fix: `packages/game/src/evidence/beacon.ts` now publishes `app`, `scene` and `session` as non-enumerable properties, so the beacon serializes and the handles stay reachable for audit lanes. Setter deleted. New test `tests/unit/game/beacon-serializable.test.ts`. Verified remotely: `tests/browser/leftovers-crosshop.spec.ts` passed on software WebGL2 (beacon JSON valid, `app` and `scene` reachable, guard never navigated, rung 0, 0 console errors) |
| 2 | Shared black-frame wrapper (used by 12 index games) imported the library by relative source path | `apps/showcase-port-shared/blackframe.ts` | Imports from `@aura3d/debug` (same names, same behaviour) |
| 3 | Drift and Deliver black-frame wrapper imported the library by relative source path | `examples/drift-and-deliver-port/blackframe.ts` | Imports from `@aura3d/debug`; 101 port tests pass |
| 4 | Cross Hop HUD used `system-ui` and did not load the licensed face | `apps/showcase-cross-hop/src/styles.css`, `index.html` | `"Graphik Web", sans-serif` with `/fonts/local.css` |
| 5 | HEATSINK loading screen used Chakra Petch (not in the licensed library; never loaded) | `apps/showcase-heatsink/index.html:856` | `var(--font-display)` (DIN Pro) |
| 6 | Starter templates' HUD panels used Inter at weight 600 (not licensed, not loaded, and Semibold is for the page title only) | `templates/{mini-game,racing-starter,falling-blocks-starter,character-controller}/src/main.ts`, `index.html`, plus `public/fonts/graphik/` (Regular, Medium) | `500 13px Graphik`, `@font-face` in `index.html`, same pattern as `templates/game-slice` |
| 7 | Same HUD text in the published templates | `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter,character-controller}` | Font name and weight changed to match; **font binaries not copied**: see follow-up F1 |

## Port migration, group A (strange-orbit, splat-rush, saiyan-snake-way, where-the-wind-wanders)

| Port | QA hook | Fixed step | Audio | Notes |
|---|---|---|---|---|
| Splat Rush | already `installQaHooks` | already `createFixedStepLoop` | already `createCueBank` | nothing left to migrate |
| Strange Orbit | `installQaHooks` (all keys kept; `stepFrames` still returns the run status) | `createFixedStepLoop` (0.08 s clamp maps exactly) | not migrated | speed-driven hum, wind and boost beds updated every frame, a dynamics limiter, a decoded ambient file, and noise bursts up to 0.9 s that the 0.4 s shared buffer would cut short |
| Serpentine Sky Run (saiyan-snake-way) | `installQaHooks` (`ready` stays a boolean getter; `reset` and `stepFrames` keep returning snapshots) | `createFixedStepLoop` (0.1 s clamp, no effective catch-up cap) | `createCueBank`; `sfx-kit.test.ts` replays the original synth and the kit against a fake context: identical automation for all 11 cue cases | parameter-level proof only, nobody listened; tones stop 10 ms later and noise loops the shared buffer instead of the old 1 s buffer; muting is smoothed instead of instant |
| Where the Wind Wanders | `installQaHooks` for `ready`, `state`, `routeHealth`; `frame`, `pixels`, `stepFrames`, the live getters and the capture hooks stay as extras (they draw the canvas directly or return different shapes) | `createFixedStepLoop` at 16.7 ms | not migrated | every tone is stereo-panned, the beds are LFO-modulated noise through a compressor, the noise buffer and bird timers use `Math.random` |

Kit additions that made this possible: `installQaHooks` preserves getter extras (they were frozen by an object spread), and `NoiseLayer` gained `attack` and `loop` (defaults keep the old behaviour). Live-loop caveat: the original loops and the kit loop agree to float rounding, but Wind accumulated milliseconds and the kit accumulates seconds, so a frame landing exactly on a step boundary can differ by one step; replays go through `advance`/manual stepping and are unaffected.

## Follow-ups (not fixed: behaviour-sensitive or needs a library addition)

| # | Finding | Files | Size | Why not now |
|---|---|---|---|---|
| F1 | Licence question: the published `create-aura3d` templates cannot bundle Graphik without confirming the licence allows redistribution to third parties. Until decided, those templates name a font they do not ship and fall back to `sans-serif`. Same for the other published templates still naming Inter (`character-viewer`, `asset-inspector`, `custom-scene`, `large-scene`, `animation-channel`) | `packages/create-aura3d/templates/**` | S, needs an owner decision | Owner call on redistribution |
| F2 | 10 of the 11 ports hand-roll their `window.__AURA_<GAME>__` hook instead of `installQaHooks`: drift, heatsink, kid-goku, last-train, ninja, roadster-hours, saiyan, silt (inside `createAuraApp` options), strange-orbit, wind. Only Splat Rush uses the kit | `examples/*-port/main.ts` | M: about 9 files, 40 to 80 lines each | Replay specs call the hook members by name; migrate with a shim that keeps the member names, then re-run each port's replay |
| F3 | 7 ports run their own `accumulator` fixed-step loop instead of `createFixedStepLoop`: drift, heatsink, kid-goku, ninja, roadster-hours, saiyan, silt (strange-orbit and wind not checked) | `examples/*-port/main.ts` | M | Replay hashes depend on exact step boundaries; needs a golden step-count test per port first |
| F4 | 10 ports have hand-written audio files (`audio.ts`, `sfx.ts`, 1,792 lines in total); most re-implement the gesture unlock (`ctx.resume()`); `createCueBank` has it built in. Only Splat Rush uses the cue bank | `examples/*-port/audio.ts` | L | Audible parity cannot be judged automatically; needs per-port A/B listening or waveform diff |
| F5 | 10 of the 15 index games assign `window.__AURA3D_GAME__ = evidence` by hand (diamond, fc, hoops, links, dot-dash, heatsink, red-zone, roadster-rush, slingshot, teleoperator); the kit's frozen beacon and lazy evidence channel are not used | `apps/showcase-*/src/main.ts` | M | Each game's evidence object has its own shape that specs read; needs a per-game mapping |
| F6 | 19 inline copies of the 1664525/1013904223 LCG (not mulberry32, so `createCountedRng` cannot replace them without changing replay): aura-diamond, aura-fc (3), aura-hoops, aura-links, red-zone (2), roadster-rush audio, drift audio, kid-goku (3), last-train audio, ninja audio, roadster-hours audio, silt terrain, strange-orbit audio, blockfall-reactor | listed | S to add, M to migrate | Needs a library `createLcgRng(seed)` (same constants) plus golden stream tests |
| F7 | Cross Hop `themes.ts` keeps its own `mulberry32` because it is documented as importable without engine code | `apps/showcase-cross-hop/src/game/themes.ts` | S | Needs the bit-identical test; the stream is the same as `createCountedRng` |
| F8 | Aura Links keeps its own `scatterInDisc` | `apps/showcase-aura-links-3d/src/main.ts:282` | S | Library `scatterInArea` samples differently; replay would change |
| F9 | Remaining fonts outside the licensed set or with system fallbacks: `Segoe UI`/`system-ui` after Avenir Next in dot-dash `styles.css:22`; `-apple-system, BlinkMacSystemFont` fallbacks in hoops, diamond, fc, links, teleoperator, iron-crown; `Arial Black` in fc `hud.ts`/`modes.ts`; `Trebuchet MS` in the Splat Rush port page; `ui-sans-serif, system-ui` in the Kid Goku port page; `system-ui` fallbacks in Pips, Wind | listed | S | Mechanical, but each needs a screenshot check; also audit weights (many use 600 to 800, the dense preset allows 400/500 plus one Semibold title) |
| F10 | `apps/showcase-aura-diamond-3d`, `aura-hoops-3d`, `roadster-rush` and `teleoperator` use `(window as any)` for the evidence objects (typing leftover) | listed | S | Folds into F5 |
| F11 | The Hoops, Diamond and Links athlete GLBs have the same stretched bridging triangles and rest-pose flaps as the FC kit (hoops 18x/21x, golfer 51x over the clips those games play). Only the FC striker/goalkeeper shorts were repaired (`tools/aura-fc/bridge-cut.mjs`); on the single-mesh GLBs a triangle cut punches shoulder holes and thigh tears, which needs a weights repair (re-skin the bridging region) | `public/aura-assets/hoopsAthlete*Clean.*.glb`, `diamondAthleteClean.*.glb`, `linksGolferAthleteClean.*.glb` | M | Needs a re-skin, then a game filmstrip for each game to confirm (the FC thigh skin also still carries 5x bridges the shorts hide) |

## Group B migration (Silt & Signal, Ninja Runner, Last Train, Roadster Hours)

Done: F2 (QA hook) and F3 (fixed-step loop) for these four ports; F4 (audio) deliberately not done.

- **F2:** each port now installs its hook through `installQaHooks`; every existing member is kept as `extras` (specs and evidence scripts read them by name). The kit now preserves getters in `extras` (`get ready()`, `get state()` stay live), which the ports' specs rely on (`__AURA_SILT__.ready === true`). The first-error global goes through `reportError`.
- **F3:** each live loop is `createFixedStepLoop` with the port's own step, clamp and catch-up cap. `tests/unit/port-kit-migration/fixed-step-equivalence.test.ts` compares steps per frame against the old accumulator on 20,000 seeded frames per configuration (whole-millisecond frames, so the doubles are identical): all equal. `stepFrames`, `replay` and the other manual paths still call the sim directly, so replay traces are untouched. Restart calls `loop.resetAccumulator()`.
- **Small live-loop differences (not covered by replay):** the clock drains in non-play screens instead of freezing (steps are skipped there), so resuming never bursts; Ninja and Roadster run countdown, audio and render after the steps in a frame instead of before; Last Train no longer takes a 0.1 s burst on its first frame; Silt's `renderTime` starts at ready instead of at load.
- **F4 not done, per port:** the audio files mix one-shot cues with continuous, per-frame driven voices (Silt pad, hum and wind; Ninja wind and music bus; Last Train wind, rumble, hiss, squeal, pad; Roadster engine pair, wind, music). `createCueBank` covers the one-shots only. Silt's chimes use a linear attack ramp (the bank is exponential); Ninja's and Roadster's noise hits start at a `Math.random()` buffer offset (the bank uses a fixed LCG buffer). Moving only the one-shots would split mute, unlock and master gain across two audio graphs. Needs a library driven-voice API (named loops with per-frame targets) plus an offline automation-recording comparison before any port moves; audible parity cannot be judged here.

## Notes

- Other apps outside the 26 (`aurora-lander`, `bank-shot`, `blockfall-reactor`, `vault-breakers`, the `-v2` apps) also assign the beacon by hand; out of scope here.
- `apps/showcase-vault-breakers` still carries a documented workaround for a vendored Rapier flipper-joint sign bug; not one of the 26.
- Scan script: re-run with the commands in this file's history (`/tmp/leftover-scan.sh` was ephemeral); the patterns are `readPixels|isBlackFrame`, `accumulator|fixedStep`, `window.__AURA`, `new AudioContext|\.resume\(\)`, `GLTFLoader|createHash`, `mulberry32|1664525`, `touchstart`, `mergeGeometries|scatter`, and the font names above.

## Migration status, group C (drift-and-deliver, heatsink, kid-goku)

| Port | F2 QA hook (`installQaHooks`) | F3 fixed-step loop (`createFixedStepLoop`) | F4 audio (`createCueBank`) |
|---|---|---|---|
| drift-and-deliver | migrated (every hook key kept; `reset` now returns nothing, the specs ignore it) | migrated (accumulator, 1/24 s frame clamp and step order unchanged) | partial: pickup chimes and the traffic thud are on the bank; the engine, squeal and rush beds stay hand-built because they ramp live parameters. Cue parameters and the noise samples are compared with the old code in `tests/unit/drift-and-deliver-port/audio-cues.test.ts`. Only difference: voices stop 10 ms later, after the envelope reached silence |
| heatsink | migrated (all keys kept, including `replay`, `replayStart`, `replayTo`, `applyInput`, `frames`, `hud`) | migrated | n/a (the port has no audio) |
| kid-goku-beyond-the-clouds | migrated, with the port's own `ready` getter, `stepFrames` (returns events), `replay` (segments), `frame` (base64), `pixels`, `capture`, `place`, `settle`, `stats` and `errors` kept as extras; `reset`, `begin`, `routeHealth`, `info`, `diagnostics` and the new `state` come from the kit | migrated | partial: 17 oscillator-only events (jump, orb, dragonball, checkpoint, perfect, jan, ken, rock-paper-scissors, dodge, fall-start, respawn, nimbus-ready/end/empty, finish, dead, screech) are on the bank, compared with the old code in `tests/unit/kid-goku-beyond-the-clouds-port/audio-cues.test.ts`. The noise-bearing events stay (the bank's one-shot noise has no 10 ms attack and a different buffer), as does `ui` (it fires in the same tick as the unlock, and the bank drops cues until its context is running) |

Audio equivalence is parameter-level only: frequencies, glides, envelopes, delays, gains and (Drift thud) the noise samples. Nobody listened to it. `createFixedStepLoop` gained `resetAccumulator()` for the restart paths.

## Gridlock Courier render (2026-10-24)

- Fixed: the first frame drew 47 of 113 calls because programs compile asynchronously and a draw whose program is pending is skipped (`warmPrograms`, `evidence/drift-and-deliver-port/rework/render-fix/`). Other games render straight after `app.ready()` and share the exposure: adopt `warmPrograms(app)` per game.
- Open: after a long jump the road still flips in and out of consecutive frames on a loaded software-GL runner; cause not found (see the evidence README for the next step).
- Open: the hypercar still reads as translucent; texture smoothing and paint overrides had no measurable effect; needs a regenerated model or an engine check of model material overrides.

