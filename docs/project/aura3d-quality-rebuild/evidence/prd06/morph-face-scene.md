# PRD-06 T2.9 — `prd06-morph-face` lane scene (06)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## Scene

RobotExpressive (`fixtures/threejs-parity/assets/character/robot-expressive.glb`) held at a
fixed frame of named morph weights — `{ Angry: 0.4, Surprised: 0.6, Sad: 0 }` — rendered by
both engine adapters. The PRD's real target is a licensed ARKit-52 head; none is admitted
in-repo, so RobotExpressive's face morphs (3 targets: `Angry`, `Surprised`, `Sad` —
`mesh.extras.targetNames`) stand in per the PRD's own stand-in clause, and the spec carries
`admittedAsReference: false` until Q-05-2 admits a real head.

- `benchmarks/quality-rebuild/scenes/prd06/morph-face.ts` — spec (index 108): head-framed
  camera, `qrFlags: ["animation"]`, `morphFace.weights` extension record,
  `admittedAsReference: false`.
- `benchmarks/quality-rebuild/aura3d/scenes/prd06/morph-face.ts` — bespoke adapter: builds the
  scene through the public API, waits for the actor's first draw, then
  `handle.setMorphTargets(spec.morphFace.weights)` on the runtime node
  (`prd06-morph-face-head`) and steps `settleFrames` — identical capture cadence to the
  shared frozen-model path.
- `benchmarks/quality-rebuild/three/scenes/prd06/morph-face.ts` — bespoke adapter: same env /
  CSM / ground rig as the crossfade adapter; after GLB load it writes
  `mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = weight` for every morph
  mesh, then renders + settles. Missing target names land in `errors` (capture records it).
- `benchmarks/quality-rebuild/shared/assets.ts` — `robotExpressive` model asset registered
  (sha256 of the in-repo GLB, 14 named clips, world size [6.62, 4.60, 3.12]).
- All three prd06 `index.ts` registries updated — the lane matrix picks the scene up for
  both engines.

## Non-zero budget

2 of 3 targets non-zero — well under the ≤ 32 budget, so High tier drops nothing. A real
ARKit-52 head may use up to 52 targets; the test asserts the stand-in keeps ≤ 32 non-zero so
the scene's parity claim stays valid for the substitution.

## Verification

`tests/unit/prd06/morph-face-scene.test.ts` (3 tests green):

- spec weight names ⊆ the GLB's real morph target names (GLB parsed from the binary header);
  ≤ 32 non-zero; weights in `[0, 1]`; `morphFace.weights` is the same record the adapters apply.
- spec registers `owner: "prd06"`, `qrFlags: ["animation"]`, `admittedAsReference: false`,
  and appears in the lane's `scenes` index.
- `robotExpressive` resolves to the in-repo GLB with a sha256 entry and RobotExpressive
  provenance.

## Deferred

- First-capture pixel parity is a lane-matrix concern (chromium capture); the unit bar pins
  the weights/asset honesty deterministically.
- When Q-05-2 admits an ARKit-52 head: swap `asset` + `morphFace.weights` (named viseme
  targets), remove `admittedAsReference: false`, and update the camera to the head's frame.
