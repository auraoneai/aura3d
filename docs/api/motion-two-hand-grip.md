# createTwoHandGrip: both hands really on the handle

`import { createTwoHandGrip, solveTwoHandGrip, calibrateGripSocket, measureGrip, handCentroid, twoHandGripBonesForEngine, mirrorTwoHandGripBodyRig } from "@aura3d/engine/game"`

For a held object that needs two hands: bat, golf club, racket, staff, sword, axe, tool. A bottom hand sits at the object's grip point, a top hand a fixed `gripSpread` up its axis. Two-bone IK puts both **drawn** palms on the handle, the elbow swings round its circle of solutions until the forearm sits at the grip's own angle to the wanted object direction, and a forearm twist rolls the object onto that direction. The Aura Diamond batter was the first user: in stance the bat floated over his head with his hands at his sides because the bat followed a bone that was never posed to hold it.

```ts
// 1. Describe the body once (bind skeleton measurements, actor-local frame, +Y up) and calibrate the socket from a stance.
const body: TwoHandGripBodyRig = { chestBind, shoulderR, shoulderL, palmR, palmL, bindDirUA, bindDirFA, bindDirUAL, bindDirFAL, upperArm, foreHand, hipsBind, poleL };
const stance = { K: [-0.08, 0.58, 0.4], D: unit([0.2, 0.5, -0.84]), phi: 0.2, pole: [-0.3, -1, -0.3] };
const rig: TwoHandGripRig = { ...body, ...calibrateGripSocket(body, stance), gripSpread: 0.09, objectLength: 1.02, sweetSpot: 0.73 };

// 2. Each fixed step: the grip point K, the object direction D, chest yaw phi, hip shift, elbow hint.
const grip = createTwoHandGrip(rig);
const pose = grip.step({ K, D, phi, hip, pole }, /* release 0..1 */ 0);

actor.setAnimationPose({ bones: twoHandGripBonesForEngine(pose.bones), mode: "overlay" });
object.setPosition(...pose.palm).setRotation(...gripQToEulerZYX(pose.objectRot)); // the engine's node order is ZYX
```

- **Calibrate the grip point against the drawn hand.** `palmR`/`palmL` are points in forearm bone space. Measure them from the CPU-skinned hand vertices (`handCentroid`), not from the bind-pose centroid: on a Meshy-bound athlete the posed hand sat about 5 cm nearer the elbow than the bind centroid because the hand weights blend with neighbouring joints.
- **Rotation order.** Route nodes use ZYX. Applying XYZ angles tilts the object the wrong way (the first Diamond calibration did). `gripQToEulerZYX` and `gripQToEulerXYZ` are both exported.
- **Reach.** Targets past the arm's reach are clamped by `solveGripTwoBone`; aim the grip point inside it or the palm misses the handle (`flexR`/`flexL` report elbow flexion: keep it between about 20 and 160 degrees).
- **Hand-off.** `step(target, release)` with `release` 0 to 1 lets the top hand go and relax toward `relaxedTopHand` (a one-handed finish, a golf follow-through); the bottom hand does not move.
- **Left-handed.** `mirrorTwoHandGripBodyRig(body)` flips x and swaps the arm roles and bone names; calibrate it with the mirrored stance.
- **Determinism.** Pure maths, fixed step, no clock. `grip.state()` returns the carried elbow and twist continuity for QA hooks; `reset()` before a new swing.

## Prove it: `measureGrip`

```ts
const report = measureGrip(samples); // { phase, knob, axis, bottomPalm, topPalm } per frame; phases such as "stance", "swing", "follow-through"
// report.ok, report.failures, report.phases[] (max and p95 of knob-to-bottom-palm and top-palm-to-axis, top palm along the handle)
```

Default limits (`DEFAULT_GRIP_LIMITS`): bottom palm within 0.06 m of the grip point, top palm within 0.06 m of the object axis, 0.08 m for the `follow-through` phase. Feed it the palms from the solver for a kinematic check and the `handCentroid` of the CPU-skinned hand vertices for the check against what the screen shows; run a full plate appearance, round or point, human and AI.

Where it fits: any object held with two hands. Not a fit: a single-hand grip (`attachToBone`), a ball in a hand (`createHandBounce`), or a bow (an off-hand draw).

Source of truth for the numbers and lessons: Aura Diamond, `docs/agents/lessons-learned.md` M16, `evidence/aura-diamond-3d/bat-fix/`.
