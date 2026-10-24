# Aura Diamond 3D: bat in hand, swing and contact (rework lane `rework-diamond`)

Measured on software WebGL2 (SwiftShader) through `tools/remote-acr/run.sh` (`tests/browser/rwdia-bat.spec.ts`, runs `rwdia-4` before, `rwdia-8` and `rwdia-9` after). Not real-GPU evidence: the owner should confirm on the M4 Max.

## What was wrong

1. **The arms never moved.** The game drives the batter's arms with a two-bone IK overlay (`setAnimationPose`), but passed bones as arrays (`[x, y, z, w]`) cast to the engine's `{ x, y, z, w }` object type. The engine read `undefined` for every component, so the skin stayed in the idle clip pose (arms at the sides) while the bat, attached to the forearm through the attachment path, floated where a posed forearm would be. `poseApplied` and `socketStage` both read healthy. That is the screenshot: a batter with empty hands and a bat in the air beside him.
2. **Failures were silent.** The bat attach used optional chaining and an empty `catch`; with the animation lane off the route-side fallback put the bat on the ground at the batter's feet (reproduced with `a3d-qr=-animation`).
3. **Contact ignored the bat.** Direction came from timing alone; the bat's face and swing never decided where the ball went.
4. **The bat stopped dead at contact.** Every keyframe segment used `smoothstep`, which has zero speed at both ends, so the swing had zero speed at the contact key.
5. **Only the catcher had a glove.**

## What changed

- `poseBonesForEngine` converts the pose to the engine's object format (`src/main.ts`).
- The bat, probe and glove attaches use the library `attachToBone` (throws `ATTACH_BONE_NOT_FOUND`); a failure sets `socketStage: "failed"` with `socketError` in the evidence and a `console.error`. The route-side fallback is deleted. The game now asks for `qualityRebuild.flags: ["game", "animation"]` instead of relying on a default.
- `src/contact.ts` (`batContact`, `boundedBlend`, 7 tests in `tests/unit/aura-diamond/contact.test.ts`): the pitch reflects about the swinging bat's face (face normal from the bat axis and the sweet-spot velocity); the result is blended 50% into the timing model's spray and launch angle and bounded to 14 and 9 degrees from it, so a noisy swing cannot turn a perfect hit into a roller.
- Swing easing accelerates into the contact key and decelerates out of it.
- The pitcher and the seven fielders wear gloves attached to their left forearms (`GLOVE_OWNERS`).
- New evidence under `bat`: `socketError`, `poseApplied`, `poseError`, `knobWorld`, `knobToHand`; under `swing`: `palmWorld`, `sweetVelocity`, `lastContact`.

## Numbers

| Check | Before | After |
|---|---|---|
| Arms pose at stance vs mid-swing (frames) | identical, arms at sides | raised and following the bat (`compare-before-after.jpg`) |
| Bat knob to the solved palm, idle and early load | not measurable (arms did not move) | 3.3 cm idle, 4.9 and 6.1 cm during load (`metrics.json`, run 9) |
| Bat knob to palm at fast swing (peak 28 m/s) | n/a | 9 to 15 cm, and 0.44 m at the contact sample |
| Sweet-spot speed at contact | 0 by construction | 11.2 m/s (peak 28 m/s just after) |
| Bat-derived direction at contact (run 9) | none | face normal (-0.25, -0.61, -0.76); bat-only spray -52.6 and launch -4 (clamped), blended spray -11, launch 23.4 |
| Fielder gloves | none (catcher only) | pitcher and 7 fielders (`after-wide-gloves.jpg`) |

The swing-phase grip distances are not a visual error. The evidence compares the engine-written bat position (updated once per rendered frame) with the IK palm (updated every sim step); on SwiftShader the game runs several sim steps per rendered frame, so the two differ by up to a frame of travel (11 m/s x 0.04 s = 0.44 m). The frames show the bat in the hands in stance, load and swing. The 5 cm bound holds at rest only; a clean in-motion number needs a real-GPU run at 60 fps.

## Limits

- One auto-batting contact per run (software GL is slow), so the contact numbers are a single sample, not a distribution.
- The bat-only spray of -52.6 at a PERFECT hit shows the keyframed bat path puts the face well off straight; the bound keeps play fair, and re-authoring the contact keys is future work.
- The skin and gloves were checked only in the batting camera; Dunk Lab and the other parks were not captured.
- Audio, replay hashes and the other modes were not touched; the game has no replay reference to compare against.
