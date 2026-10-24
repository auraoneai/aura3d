# Aura Links 3D: golfer rework (lane rework-links, section 3.4)

Software WebGL2 (SwiftShader) frames only: not real-GPU evidence. Commit range on `game-rework`: `77befe305` .. `c3d5b6c64`.

## What was wrong

The golfer's legs are children of the `Hips` bone, and the swing solve rotated `Hips` forward by 0.30 rad for the hip hinge. The legs inherited that rotation, so at address the thighs leaned 17 degrees and both ankles sat 0.23 m away from the bind stance, on top of 36.7 degrees of trunk flex (0.64 rad). The whole body read as one slanted line (`posture-before.json`).

## What changed

- `swingMath.ts`: two-bone leg IK plants both ankles at the bind stance and bends the knees toward the ball; the hip hinge is cancelled in the leg bones' local rotations; hips sit 3 cm behind the ankle line; trunk flex split retuned to 0.30/0.19/0.12 rad; `solveSwing` now returns posture read-outs (`spineTiltDeg`, `sideBendDeg`, `thighTiltDeg`, `kneeFlexDeg`, `headOverBallM`, `ankleDriftM`).
- `game/contact.ts` (new, pure): swept club-head vs ball contact. `main.ts` fires the strike when the head's path meets the ball (ball radius + 4 cm head reach) and keeps a 60 ms timed fallback so a missed contact cannot soft-lock a hole. Contact speed, path yaw and offset are published in the evidence (`swing.contact`). The shot itself is still decided by the meter (power, accuracy), so scores and replays are unchanged.
- `rig.ts`: the club is attached with the library `attachToBone` (known skeleton passed, so no early socket probe). An unavailable bone attach now warns once with the reason and uses the solved placement.

## Measured (offline solve, `posture-after.txt`) against the section 3.4 acceptance

| Check | Required | Before | After |
|---|---|---|---|
| Address spine tilt (hips to head) | 25 to 35 deg | not comparable (legs slanted too) | 27.9 deg |
| Knee flexion at address | 20 to 35 deg | straight, legs rotated with the hips | 32.3 deg |
| Ankle drift from the stance, whole swing | planted | 0.231 m at address | under 0.003 m in every phase (0.000 sampled) |
| Head over the ball at address | over the ball | not measured | 0.265 m horizontal |
| Side bend at address | upright | n/a | 1.3 deg |
| Club head to ball at address and at impact | within 3 cm | 0.003 m | 0.001 m and 0.000 m |
| Max arm reach / arm max | within reach | 0.547 / 0.559 | 0.541 / 0.559 |
| Max wrist error | about 0 | 0.047 rad | 0.002 rad |

Unit tests: `tests/unit/aura-links-3d/golfer-posture-and-contact.test.ts` (14 tests) cover all of the above plus swept contact at 120, 60, 30 and 15 fps and a miss case.

## Measured in the browser (remote run `rwlnk-3`, spec `tests/browser/rework-links.spec.ts`, 960x540, software GL)

- 0 console errors, 0 warnings; club bone attach active (`clubAttached: true`).
- The strike fired from the swept path, not the fallback: head speed 10.3 m/s, centre offset about 0 m, path yaw -14.3 degrees from the shot line, impact distance 1.4 mm.
- Frames in `frames/`: `01-address`, `02-backswing`, `03-top`, `04-follow`, `05-impact`, `06-settle`. Frames are grabbed live while the sim runs, so each lands a little after its phase and `05-impact` and `06-settle` are already on the ball-flight camera. A per-frame stepped capture (`?still=N`) was tried and did not finish on software GL, so it was removed.

## Not done or not verified

- Real-GPU look on the owner's Mac. The golfer texture shows silver speckle in these frames: that is the existing Meshy texture, untouched here.
- The address frame is a little off the stance cam (the golfer's feet are near the bottom edge at 960x540).
- No rename and no screenshot retake in this lane (separate lanes).
