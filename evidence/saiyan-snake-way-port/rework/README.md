# Serpentine Sky Run: shake and bounce rework

Lane `rework-serpentine` of `docs/workflows/game-rework-prompt.md` (section 3.6). Date 2026-10-24.

## Cause

The simulation steps at a fixed 60 Hz (`STEP = 1/60`) but the screen refreshes at 60, 120 or 144 Hz (the owner's M4 Max display is 120 Hz). The renderer drew whatever step had run last, so on a 120 Hz display every second frame had no new step:

- the runner and the chase camera advanced on one frame and stood still on the next (coefficient of variation of per-frame speed about 1.0),
- `moving = ds > 1e-5` was false on those frames, so the rigged runner switched between its run and idle clips, about 1,200 times in 10 seconds,
- the run-cycle phase advanced by `ds * 0.62` on step frames and by `dt * 2.5` on the others, so the legs and the procedural pelvis bob hitched,
- the sky time and the camera shake were also tied to the step clock.

On a 60 Hz display with a little frame-time jitter the same thing happens when a frame runs zero or two steps (speed variation 0.26, 37 clip flips in 10 seconds).

The ground contact, gravity tick and the clip root motion are not the cause: the per-step travel of the simulation is steady apart from its own speed wobble (idle input: speed 25.6 to 32.2 in the original's rules, per-step distance variation 0.063), which is gameplay and unchanged.

## Fix

- `examples/saiyan-snake-way-port/presentation.ts` (new, pure): `blendSamples` (snaps on phase changes, restarts and jumps), `withSample`, `advanceRunPhase` (the old formula, now fed the blended distance), `stepChaseRig` (the old exponential follow, extracted so it is measured).
- `main.ts`: pushes a sample after every step into the game kit's `createRenderInterpolator`, and on each live frame draws the sample `loop.accumulator / STEP` of the way between the last two steps. Captures, manual stepping, pause and results draw the exact state (alpha 1), so frames, replays and `__AURA_SAIYAN_SNAKE_WAY__` hooks are unchanged.
- `world.ts`: draws the blended runner state; the sky time advances with the blend.
- `hero.ts`: the procedural fallback runner's pelvis bob amplitude 0.07 to 0.04 (the run cycle still shows). The rigged runner's bob comes from the `Run_Loop` clip and is untouched.

## Numbers (`metrics.json`, produced by `measure.mts`)

Real simulation, real `createFixedStepLoop`, real road, camera rig and pose code; the display is simulated at four refresh patterns. `before` reproduces the old presentation (draw the last step); `after` is the shipped path. Pure maths, no GPU. Speed CV is the coefficient of variation of per-frame speed (0 is perfectly even); camera accel is the RMS second difference of the eye position in metres per frame squared.

| Display | Runner speed CV | Camera accel | Run/idle clip flips per 10 s |
|---|---|---|---|
| 60 Hz | 0.082 to 0.054 | 0.044 to 0.0006 | 2.5 to 0 |
| 60 Hz, 1.5 ms jitter | 0.258 to 0.054 | 0.199 to 0.035 | 37.5 to 0 |
| 120 Hz | 1.003 to 0.054 | 0.480 to 0.0004 | 1,196 to 0 |
| 144 Hz | 1.185 to 0.054 | 0.438 to 0.0004 | 1,200 to 0 |

The 0.054 left over is the simulation's own speed wobble. The jittered 60 Hz camera figure stays above zero because that metric is per frame and the frame times themselves are uneven; the displayed positions are a smooth function of time.

Pelvis height (procedural runner) second difference: 120 Hz 0.027 before to 0.0025 after (this includes the lower bob amplitude, so it is not a pure interpolation figure; the table above is).

## Tests

- `tests/unit/saiyan-snake-way-port/presentation.test.ts`: blend and snap rules, phase and rig helpers, and a regression that raw drawing has more than 100 standing frames at 120 and 144 Hz while the blended path has none and a speed CV under 0.1.
- The port's other unit tests (69 in total) and `reference-replay.test.ts` pass: the simulation and its replay are untouched.
- Remote (software WebGL2, `tools/remote-acr/run.sh`, run `rwser-1`): the existing spec and the new `tests/browser/saiyan-snake-way-live.spec.ts`, which drives the real rAF path (no `manual=1`). See the results below.

## Limits

- No frame-by-frame video of the shake was captured: a headless software-GL runner does not reproduce a 120 Hz display, so the shake is measured on the simulation and loop, not seen. Please check the live game on the M4 Max.
- Moving enemies (sweepers, oni) still advance per step; at 5.5 m/s or less that is under 0.1 m per step.
- The rigged runner's own clip bob is unchanged.

## Remote results (run `rwser-1`, software WebGL2, 2 of 2 passed, 5.1 min)

- `saiyan-snake-way-port.spec.ts` (manual path, exact draw): passed, so the boot, the pixels and the replay of the original's recorded run are unchanged.
- `saiyan-snake-way-live.spec.ts` (live rAF path through the blended draw): passed. The run advanced from s = -40.65 to -33.06 in 6 s of wall time (software GL renders few frames per second, so this proves the live path runs, not its smoothness), 55 draw calls, 0 diagnostic errors, 0 console or page errors.
