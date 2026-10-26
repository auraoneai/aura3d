# Aura Diamond 3D: batter grip, athlete height and swing geometry (lane `diamond-bat`)

Software WebGL2 (SwiftShader) through `tools/remote-acr/run.sh` with `tests/browser/diamond-bat-fix.spec.ts`: run `diamondbat-before2` on `origin/main` plus the QA hooks (old GLB), run `diamondbat-final1` on this branch with the repaired athlete GLB (`diamondAthleteClean.4e206d50.glb`, commit 5b40c1921). The swing clock is frozen at exact t (`holdSwingAt`). Not real-GPU evidence.

## What was wrong (five separate defects)

1. **Every athlete hovered 0.94 m above the ground.** `scaleMode: "fit"` grounds a model's lowest vertex on its node position, but the route placed athletes at `y + 0.94` (a "centred GLB" assumption). The owner's screenshot (`before/owner-stance.jpg`, same camera) shows the batter's feet about a metre above the dirt and the bat floating over his head. It also broke the contact geometry: the ball was converted into actor space with that 0.95 m shift baked in, so the swing was built to hit a ball a metre too low. Fix: nodes sit at ground y; the actor-to-world mapping adds the fit's grounding shift (`FIT_GROUND_N`).
2. **The top hand never touched the bat.** The left arm was solved with the right arm's bind directions, so the left hand missed its target by 23 cm before any pose was blended. Fix: mirrored left bind directions, a mirrored left grip roll, and the left target on the bat's real axis.
3. **The engine's bone attachment lagged the hands** (bat 14 to 76 cm from the palm in fast segments). The bat is now placed from the same solve that poses the arms.
4. **The grip point was a stale estimate, then the wrong frame of reference.** `RIG.palmR/L` is now where the hand's skinned vertices really centre in pose (CPU skin of the solved poses, mean over stance, swing and follow-through): about 5 cm nearer the elbow than the bind-pose centroid, because the hand weights blend with neighbouring joints.
5. **The bat node was rotated in the wrong Euler order.** Route nodes take Euler in the engine's default ZYX order; the bat used XYZ values and drew tilted the wrong way (hands on one line, bat on another). `qToEulerZYX` fixes it.

Also: the stance is a real ready position (hands a fist in front of the rear shoulder at shoulder height, bat leaning back; the old stance folded the rear elbow to 144 degrees against the shoulder). The solver, keys and contact search moved to `src/batter-pose.ts` (pure functions) so unit tests can sweep every phase.

## Numbers

`before` is bone-level (bone matrix times the old grip point) on `origin/main`; the drawn-hand metric did not exist then. `after` is the CPU-skinned hand-vertex centroid against the bat axis in the engine (remote run, owner camera holds). The bone-level `after` number is 0.1 cm in every phase and is not the claim: the drawn hand is.

| swing t | phase | before: knob to right palm (bone) | before: top palm to bat axis (bone) | after: drawn right hand to bat axis | after: drawn top hand to bat axis |
|---|---|---|---|---|---|
| stance | stance | 2.4 cm | 17.6 cm | 0.4 cm | 1.2 cm |
| 0.12 | load | 2.8 cm | 16.2 cm | 1.0 cm | 1.5 cm |
| 0.26 | stride | 3.9 cm | 14.7 cm | 2.1 cm | 2.2 cm |
| 0.4 | contact | 1.2 cm | 31.0 cm | 1.8 cm | 0.6 cm |
| 0.476 | contact | 17.3 cm | 44.2 cm | 3.0 cm | 3.5 cm |
| 0.55 | contact | 6.8 cm | 30.6 cm | 0.6 cm | 3.1 cm |
| 0.7 | follow-through | 1.1 cm | 26.4 cm | 1.2 cm | 3.4 cm |
| 0.87 | follow-through | 14.1 cm | 31.2 cm | 2.5 cm | 3.0 cm |
| 1 | follow-through | 14.1 cm | 31.2 cm | 2.5 cm | 3.0 cm |

Unit sweeps (no browser, same formulas): `drawn-grip.json` (the repository GLB skinned on the CPU over stance sway, load, stride, contact across 9 strike-zone positions, follow-through, recovery): worst drawn palm to bat axis stance 1.3 cm, load 2.2, stride 1.8, contact 4.7, follow-through 4.1, recovery 3.1 (limit 6 cm, 8 cm in the tail; enforced by `tests/unit/aura-diamond/drawn-grip.test.ts`). `kinematic-grip.json`: bone-level sweep over 30 ball positions (both palms on their targets, hands 9.0 cm apart, elbows 23 to 149 degrees in contact). The sweet spot lands on the ball within 5 cm for every pitch the batter can physically reach (x from -0.2 to 0.3 m, y from 0.8 m); pitches off the plate's far edge or in the dirt get the closest pose.

## Frames (`after/`, owner camera behind and above the batter, 640x360, plus hand-height close-ups)

`default-stance.jpg` (the game's own camera and HUD at 1280x720: the owner's screenshot state, batter in the box, bat up behind the shoulder), `owner-walk`, `owner-stance`, `owner-0120` (load), `owner-0260` (stride), `owner-0400` to `owner-0550` (contact), `owner-0700` to `owner-1000` (follow-through), `owner-run` (bat put down by design), `hands-*` (close-ups), `side-*`, `front-*`. Read: both hands are on the handle in every batting frame; `before/owner-stance.jpg` is the owner's complaint (hovering batter, bat over his head, open left hand).

## Limits

- One batter, one nominal ball per hold; the sweet-spot/contact result for other pitches is covered by the unit sweep, not by frames. No audio, replay or other-mode changes.
- The shoulder seams of the shirt show texture tears in the close-ups (mesh issue in the athlete GLB, owned by the athlete-rig lane, unrelated to the grip).
- The glove and mitt offsets are unchanged (`GLOVE_ATTACH_POS`).
- `before/` frames are from the old GLB and the hovering batter; they are not directly comparable pixel for pixel.

## Files

`before/`, `after/`: frames and raw probe rows (`probe-final1.jsonl` include bone and drawn-hand numbers per hold). `drawn-grip.json`, `kinematic-grip.json`: unit sweeps.
