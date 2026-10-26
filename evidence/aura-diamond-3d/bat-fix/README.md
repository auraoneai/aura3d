# Aura Diamond 3D: batter grip, athlete height and swing geometry (lane `diamond-bat`)

Software WebGL2 (SwiftShader) through `tools/remote-acr/run.sh` with `tests/browser/diamond-bat-fix.spec.ts` (runs `diamondbat-before2` on `origin/main` plus the QA hooks, `diamondbat-after4` on this branch). The swing clock is frozen at exact t (`holdSwingAt`). Not real-GPU evidence.

## What was wrong (three separate defects)

1. **Every athlete hovered 0.94 m above the ground.** `scaleMode: "fit"` grounds a model's lowest vertex on its node position, but the route placed athletes at `y + 0.94` (a "centred GLB" assumption). The batter's feet were about a metre above the dirt (`before/owner-stance.jpg`, `before/side-0550.jpg`). It also made the contact geometry nonsense: the ball was converted into actor space with that 0.95 m offset baked into the socket calibration, so the swing was built to hit a ball a metre too low (arms fully straight at contact, bat in the dirt). Fix: nodes sit at ground y; the actor-to-world mapping adds the fit's grounding shift (`FIT_GROUND_N`, the GLB Root offset 0.952).
2. **The top hand never touched the bat.** The left arm was solved with the right arm's bind directions (`bindDirUA`/`bindDirFA` carry the sign of x), so the left hand missed its target by 23 cm before any pose was blended. Fix: mirrored left bind directions, a left grip roll that mirrors the right one, and the left target taken from the bat's real axis.
3. **The engine's bone attachment lagged the hands.** The solved palms match the engine bone matrices to 1 mm at every swing time (checked in `analyze-probe.js`), but the bat attached to the right forearm bone sat 14 to 76 cm away from the right palm in fast segments. The bat is now placed from the same solve that poses the arms (knob at the right palm).

Also: the grip point (`RIG.palmR`) was a stale estimate; it is now the centroid of the hand's vertices in `diamondAthleteClean.glb` (distance from the elbow above 0.34 m, about 0.39 m along the forearm, not 0.30 m). Stance: hands a fist in front of the rear shoulder at shoulder height, bat leaning back (the old stance folded the rear elbow to 144 degrees against the shoulder). The solver, keys and contact search moved to `src/batter-pose.ts` (pure functions) so a unit test can sweep every phase.

## Numbers (bone matrices x measured grip point vs the bat, metres converted to cm)

Rows are the owner-camera hold frames; `before` is `origin/main` (bat bone-attached, athletes hovering, frame offset of +0.94 m in the bat reading removed), `after` is this branch.

| swing t | phase | before: knob to right palm | before: top palm to bat axis | after: knob to right palm | after: top palm to bat axis |
|---|---|---|---|---|---|
| stance | stance | 2.4 cm | 17.6 cm | 0.1 cm | 0.1 cm |
| 0.12 | load | 2.8 cm | 16.2 cm | 0.1 cm | 0.1 cm |
| 0.26 | stride | 3.9 cm | 14.7 cm | 0.1 cm | 0.1 cm |
| 0.4 | contact | 1.2 cm | 31.0 cm | 0.0 cm | 0.0 cm |
| 0.476 | contact | 17.3 cm | 44.2 cm | 0.1 cm | 0.2 cm |
| 0.55 | contact | 6.8 cm | 30.6 cm | 0.1 cm | 0.1 cm |
| 0.7 | follow-through | 1.1 cm | 26.4 cm | 0.1 cm | 0.1 cm |
| 0.87 | follow-through | 14.1 cm | 31.2 cm | 0.1 cm | 0.0 cm |
| 1 | follow-through | 14.1 cm | 31.2 cm | 0.1 cm | 0.0 cm |

Unit sweep (`tests/unit/aura-diamond/batter-grip.test.ts`, 30 ball positions over the strike zone, stance sway, load, stride, contact, follow-through, recovery, 4,000+ samples): top palm to bat axis 0.0 cm, both palms on their targets, hands 9.0 cm apart, elbows 23 to 155 degrees in contact, 61 to 128 elsewhere. Raw table: `kinematic-grip.json`. The sweet spot lands on the ball within 5 cm for every pitch the batter can physically reach (x from -0.2 to 0.3 m, y from 0.8 m); pitches off the plate's far edge or in the dirt get the closest pose.

## Limits (read before relying on this)

- **The bone-level numbers are exact (0.1 cm) but the rendered hand is not guaranteed to be where the bone says.** The frames in `after/` (`front-stance.jpg`, `side-stance.jpg`) still show the open palms in front of the chest while the bat rises behind the head. The p2-rigs-athletes lane reports the Diamond athlete is a Meshy mesh bound mid-stride to a straight skeleton (skin stretch 30.8x, vertices 10 to 20 cm off the joint axes), so a skeleton-solved palm cannot match the drawn hand. The grip will be re-measured against skinned vertices once the rebuilt GLB lands.
- The hover and contact fixes are independent of that and are visible in the frames: the batter stands in the box (`after/owner-stance.jpg`).
- One batter, one ball position per hold; the sweep is probe-only. No audio, replay or other-mode changes. The glove and mitt offsets are unchanged (they ride `GLOVE_ATTACH_POS`).

## Files

`before/` and `after/`: frames and raw probe rows. `analyze-probe.js`: reproduces the table (`OFF=0.94 node analyze-probe.js before2` for the old frame). `kinematic-grip.json`: unit sweep.
