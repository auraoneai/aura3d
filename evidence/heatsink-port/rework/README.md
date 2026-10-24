# HEATSINK strike layer: rework evidence (2026-10-24)

Software WebGL2 (SwiftShader) on the remote CPU runner, 480x270, `quality=low`. Not real-GPU evidence. Nothing here was judged by a person.

## Problem
The ported Time Trial had no goal beyond the clock: nothing to hit, nothing to score (owner playtest: "literally nothing to do"). See `examples/heatsink-port/PORTING-NOTES.md`, "Strike layer", for the design.

## What was verified

| Check | Result | Where |
|---|---|---|
| Original movement replay (6000 steps, tolerance 1e-6) | unchanged and passing | `tests/unit/heatsink-port/reference-replay.test.ts` |
| Gun held down does not change any player state across the same 6000 steps | identical at every sampled step | `strike.test.ts` "never changes the recorded movement" |
| Strike replay (reference movement, trigger held) | score 2950, 6 kills, 4 barrels, 872 shots, 33 hits, best chain 3, hash `e1d8bccd`; identical twice and identical in the live browser build | `strike.test.ts`, `tests/browser/heatsink-strike.spec.ts` (run `rwhs-4`, 1 passed, 4.2 min) |
| Kill needs 3 bolts (sentry) or 6 (heavy), pays 100 or 250; multiplier 1 to 5 within a 3 s chain window; crash resets the chain; clean lap pays 500 and revives targets; barrel shot pays 150 and blasts targets within 14 m; overheat lockout; medals only on a finished race | pass | `strike.test.ts` (17 tests) |
| Objective, SCORE, MULTIPLIER and TARGETS HUD present from the countdown | pass (`0`, `x1`, `0/48`, objective text) and end-of-replay values `2950`, `6/48`, "NEXT TARGET 99 m · BRONZE AT 16 KILLS" | spec log lines `HEATSINK_STRIKE_HUD` |
| Console and engine errors, draw calls | 0 errors, 52 draw calls | `HEATSINK_STRIKE_DIAG` |

Frames (`fire-200`, `hit-232`, `kill-323`, `kill-2-901`, `barrel-1148`, `kill-3-2136`, `barrels-chain-4902`) are canvas captures at pinned replay steps; the DOM HUD is not in them. `before-size/` holds the first capture set, before target cores and bursts were enlarged.

## Calibration
Reference movement with the trigger held and no aiming scores 6 kills in 1.55 laps (about 12 over three of 48 available), so bronze (16 kills) needs real aiming. Thresholds are in `STRIKE.medals` (`operation.ts`).

## Not verified
- Live play. The full game never finishes automated checks on software GL, so the feel of aiming, the camera shake and the synthesised sounds were not judged by a person. The owner's M4 Max check is needed.
- Targets read as small red and orange rings at distance in the captured frames; no close-up of a target in the same frame as a bolt was captured, so bolt tracers were not seen in any frame.
- Audio: cues are parameter-defined (`audio.ts`) and were not listened to.
- Touch: fire is `F`, `J` or click only; there is no touch fire button.
- The index game Thermal Drift (`apps/showcase-heatsink`) is a separate game with its own rivals, missiles and takedowns and was not changed.
