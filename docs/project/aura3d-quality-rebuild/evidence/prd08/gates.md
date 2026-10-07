# X-7 replacement gates — pre-change failure record

Each replacement reads the **presented** channel (controller `presented()` pose,
`evidence().layers` energy on submitted frames, `onTick` alpha) instead of
rig/evidence inputs ("fired"/"adopted"). Recorded expectations of failure on
pre-change code:

| Gate | File | Pre-change failure |
|---|---|---|
| presented chase pose tracks subject | `tests/unit/engine/game-camera-rigs.test.ts` → "X-7 presented gates" | `presented()` stayed at default pose; rig numbers only reached evidence objects → `pose.position[2]` never moves off initial |
| shake reaches presented pose + layer energy | same file | trauma energy existed in layer list but `presented().position` never received the offset → `moved === 0` fails |
| one tick per real frame with accumulator alpha | `tests/unit/engine/fixed-step-determinism.test.ts` → "X-7 presented gates" | pre-change `GameAppRuntime` dropped `alpha` and rendered once **per substep** (T3): `onTick` emit didn't exist / alpha absent |

Retired-by-request (not lane-08 files): `tests/browser/gamefeel-camera-rigs.spec.ts`,
`tests/browser/route-gamefeel-adoption.spec.ts`,
`tests/unit/game-runtime/game-runtime-source-gates.test.ts` → Q-15-6;
`tests/unit/apps/skyline-player-feel.test.ts` → Q-14-3.
