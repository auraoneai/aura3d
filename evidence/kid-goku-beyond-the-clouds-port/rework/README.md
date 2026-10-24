# Kid Goku (Cloud Runner): leg motion rework

Lane `rework-cloud`, section 3.10 of `docs/workflows/game-rework-prompt.md`. Software WebGL2 on the remote CPU runner (not GPU), 960x540, quality switches `post=0 shadow=0 aa=0` only to keep software frames affordable. Runs: `rwcld-b` (before, branch head `8d7cc8843`) and `rwcld-2` (after, the stride commit). Spec: `tests/browser/kid-goku-rework.spec.ts`; both passed with 0 console errors.

## Diagnosis

- The hero GLB has a proper skeleton and a 0.667 s `run` clip, so the rig was not the problem.
- Forward kinematics of the clip (`/tmp/kg-fk.mjs` method, constants in `locomotion.ts`) gives a planted-foot ground speed of about 3.3 m/s at playback rate 1 for the 1.5 m hero.
- The sim runs the kid at about 14.5 m/s and the old code played the clip at `0.95 + speed/30` = 1.43x: the legs cycled at sprint cadence with a short stride, so the feet delivered about 4.7 m/s against 14.5 m/s of travel (about 68% of the ground speed slid). That reads as sliding.

## Fix

- Cadence and phase come from the library `createLocomotion` (`@aura3d/engine/game`), clamped to 1.8x.
- A leg-bone overlay pose (`legOverlayPose`, new `locomotion.ts`, data generated from the GLB by `tools/kid-goku/gen-legcycle.mjs`) widens the swing of the four leg bones about their cycle mean by up to 1.8x. The library has no stride-gain concept yet; this is the part to promote.
- Footstep dust is emitted on real foot touchdowns (clip contact phases 0.375 and 0.828) instead of on a timer.
- The QA hook now exposes `gait()`.

## Measured (analytic from the clip constants, not read from rendered bones)

| | before | after |
|---|---|---|
| cadence (clip rate) | 1.43x | 1.8x (cap) |
| stride gain | 1.0 | 1.8 (cap) |
| planted-foot speed | about 4.7 m/s | 10.7 m/s |
| ground speed (sim) | about 14.0 m/s | about 14.0 m/s |
| share of ground speed the feet still slide | about 66% | 23.5% (`after/gait.json`) |

The feet are planted exactly (0% slide) up to 10.7 m/s of ground speed. At the sim's 14.5 m/s the caps still leave about 23%, so the 0.15 m/s planted-foot threshold in the prompt is NOT met at full sprint. Closing the rest needs either a higher cap (visible strobing and over-wide legs) or a lower on-screen speed, which would change the sim and its replay. That is an owner decision.

## Frames

- `run-strip-before-after.png`: six run-cycle frames at varied phases, fixed crop on the runner, 4x. After: wide reach, tucked rear leg, alternating sides. Before: narrow, nearly identical leg positions. The trailing log hides the feet in some frames.
- Raw 960x540 frames and gait rows are in `before/` and `after/`.
- Jump and landing frames are in the raw folders only; this change did not touch those clips and I did not verify them visually (the crop missed the airborne runner).

## Not verified

- No rendered-bone foot-slide measurement: the hero is a declarative `model()` node without bone sockets, so the library `createFootSlideMeter` cannot read its feet here.
- Audio footsteps were not added.
- Real-GPU appearance (owner's Mac).
