# Where the Wind Wanders: leg motion rework (section 3.9)

Software WebGL2 (SwiftShader) on the remote runner, stepped QA path (`?manual=1`), 640x360. Not real-GPU evidence: the owner still has to check the live feel on the Mac.

## What was wrong

The hero GLB is fine: it carries Walk, Run and Idle clips with real leg-joint rotation on a 24-joint rig. The animator drove it badly:

- `play(clip, { loop: true, captureTime, crossFade: 0.15 })` was re-issued on every frame. A looped clip with a `captureTime` also runs on the engine's own clock, so the clip phase advanced at (own rate + 1x wall clock).
- In the stepped QA path `runtime.update` runs twice per sim step (once from `advance`, once from `render`), so the phase advanced about twice as fast again.
- Playback rate was a fixed guess (`0.9 + 0.5 * walkAmt`), not derived from the rig.

Result, derived from the recorded animation commands plus forward kinematics of `hero.glb` (not read from the GPU skin): the clip phase ran **3.8x** real time while the correct stride-synced rate at 3.2 u/s is 1.382x, and the planted foot slid at **5.499 u/s** against a ground speed of 3.2 u/s (ratio 1.718). The legs do alternate in the frames (see `before-walk-strip.jpg`), so I could not reproduce "legs do not move" in the stepped capture; what the player sees is feet scurrying at 2.4x to 3.8x the pace of the ground, under a long cloak, which reads as sliding. The live real-time loop (one update per frame, no stepping) was not measured.

## What changed

- `locomotion.ts` (new, pure): planted-foot speed per clip from forward kinematics of the rig at the placed height (Walk 2.315 u/s, Run 5.586 u/s at rate 1), gait choice with hysteresis, playback rate and analytic foot slide.
- `models.ts`: `createHeroAnimator` advances a pinned clip phase by distance travelled over planted-foot speed (`loop: false`, `captureTime`), so a planted foot moves at ground speed whatever the frame rate or how often `update` runs; `play` only crossfades on a gait change; idle follows the sim clock; Walk and Run keep their normalised phase on a switch.
- `world.ts`: passes position and sim time; `reset`/`snap` re-prime the animator.
- `main.ts`: QA extra `heroRig()` (animation command and render clock) for the motion spec.

## Measured (90 walking steps, 3.2 u/s)

| | before | after |
|---|---|---|
| clip phase rate | 3.8x | 1.382x (target 1.382x) |
| planted-foot slide, median | 5.499 u/s | 0.146 u/s |
| slide / ground speed | 1.718 | 0.046 |
| stance samples | 103 | 104 |

Threshold from `docs/workflows/game-rework-prompt.md` section 2: planted-foot drift under 0.15 u/s. After: 0.146, a pass by a small margin; the remainder is the stance-sample threshold, not a rate error (the phase rate is exact).

Frames: `before-walk-strip.jpg` and `after-walk-strip.jpg` (every 6th sim step of one walk, hero crop upscaled 4x), `before-frame.jpg` and `after-frame.jpg` (full frames). Raw per-step rows: `before-rows.txt`, `after-rows.txt`. Analysis: `analyze-foot-slide.mjs <log> <hero.glb>`; spec: `tests/browser/where-the-wind-wanders-port-motion.spec.ts`.

## Limits

- The sim has one walking speed (3.2 u/s); the Run clip only plays during the hop, where there is no ground contact, so there is no separate running-speed slide to measure.
- Foot slide here is derived from the recorded animation commands and the rig's forward kinematics (the default animation path exposes no bone sockets), assuming the engine adds the render clock to a looped `captureTime` as `resolveAnimationSeconds` does. The frame strips are the direct visual check.
- Robe geometry still hides most of the legs; the boots and stride are visible, the knees are not.
