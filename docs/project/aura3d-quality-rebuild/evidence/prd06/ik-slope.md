# T3.9 — `prd06-ik-slope` lane scene (PRD-06:1249-1277)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


Scene `prd06-ik-slope` in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/`.
Soldier `Idle` stands straddling a shared terrain seam: a 20° ramp (`z < 0`) and four
18 cm stairs (`z ≥ 0`) from `benchmarks/quality-rebuild/shared/terrain.ts`
(`rampStairsHeightAt` — piecewise flat/ramp/stair/plateau with per-section normals). The
soldier is rotated +90° yaw at `x = 0.95, z = 0` so the left leg plants on the stair tread
(0.36 m) and the right on the ramp (~0.346 m), exercising per-leg solves and pelvis drop.

## Wiring

- Spec: `ModelAnimationSpec.footIk` (new shared field) carries
  `{ legs: [{ side, hip, knee, ankle, ankleHeight }], pelvis }` — the same data both
  adapters consume. `SceneSpec.terrain` carries the serializable `RampStairsTerrainSpec`.
  `ankleHeight: 0.115` is the Soldier GLB ankle-world offset above the sole (cm-scale
  node translations under the `Character` root's 0.01 scale).
- Aura side (`aura3d/common.ts`): after the draw-wait loop, each model object with
  `animation.footIk` resolves its node handle, materializes the C-37
  `animation` node-handle extension via `nodeHandleExtensionFor("animation").create(handle, app)`,
  and calls `ik.add({ kind: "foot-ik", legs, ground, pelvis })`. The solver raycasts in
  the actor's model space, so the world-space heightAt is wrapped by
  `modelSpaceHeightAt(heightAt, object)` (shared/terrain.ts): it maps the query point
  through the mount transform, samples world heights, and maps height + normal back
  through the inverse (exact for yaw-only/flat mounts like this one).
  Capability row `footIk:<name>` logs supported/missing
  (also catches `PRD06_CONSTRAINT_RUNTIME_UNAVAILABLE`-style throws).
- Three side (`three/common.ts`): `CCDIKSolver` (three r185 examples) per leg —
  `links: [knee, hip]`, `effector: ankle`, `iteration: 8`; an explicit
  `__ik_target_<side>` bone is appended to the skinned mesh's skeleton bone list and
  pinned each frame at the ground target (`ground.height + ankleHeight`) in model-local
  space before `solver.update()`.
- `admittedAsReference: false` on all three registrations — the two sides run different
  IK algorithms by design; acceptance is the §17.0 engine-reported metric, not parity.

## Metric (`extra.footIk`)

Both engines publish `extra.footIk = { configured, feet: [{ side, worldPosition,
contactError, locked }], maxContactError }`:
- aura — `api.socket(leg.ankle).worldMatrix()` translation mapped to world by
  `transformSpecMatrix(object)` (the socket matrix is actor-local — inside
  `pipeline.resources.scene` — so the mount transform is applied by the metric)
  vs `rampStairsHeightAt(x, z)` (socket API from T3.6; `valid:false` rows lock=false).
- three — `bone.getWorldPosition` on the ankle vs the same terrain query.
`locked` = `contactError ≤ spec.ikSlope.maxContactError` (0.03). The browser spec
(`tests/qr/prd06/browser/ik-slope.spec.ts`, auto-matched by the animation-matrix
playwright config) asserts `configured`, both feet `locked`, and `contactError ≤ 0.05`
tolerance on both engines.

Measured on the aura adapter (SwiftShader lane): left foot contactError 3.1e-8 m on the
stair tread (0.36 + 0.115 ankle offset), right foot 0.0069 m on the ramp, both `locked`,
`maxContactError` 0.0069 — well under the 0.03 spec bound. In the live app the foot-ik
constraint evaluates every frame (~76 analytic raycasts per 38-frame window), pelvis
drops the full −6.8 cm (hips 1.061 → 0.993 m world), and the left ankle lands on its
pass-2 target to 3e-8 m.

## Terrain/visual cohesion

The spec's render objects (ramp box, four stair boxes, plateau) are generated from the
same constants as `rampStairsHeightAt`; the unit test asserts each stair box's top face
equals the quantized stair height so the visual surface and the ground query can never
drift apart.

## Engine fix landed with this task (T3.2 hardening)

`solveFootIkConstraint`'s pelvis drop wrote `pose.positions[pelvis*3+1] += drop` — a
pose-space Y correction injected into the pelvis node's raw local-Y. That is only right
when the pelvis' parent is axis-aligned and unit-scaled. On rigs like the Soldier
(`Character` root with scale 0.01 and −90° X rotation) the up axis is the pelvis' local
+Z and the units are cm, so the drop landed as a sub-millimetre lateral nudge — the
pass-2 leg solve then ran against an unreachable target and the feet stayed at clip
pose. The drop is now transformed into the parent frame (inverse rotation, then
inverse scale) before being added to the local translation; the Y-up/identity-parent
case is unchanged. Regression test added in
`tests/unit/animation/foot-ik-constraint.test.ts` (scaled/rotated parent: pelvis drops
~6.5 cm on local Z, X/Y untouched).

## Gates

- `tests/qr/prd06/unit/ik-slope-terrain.test.ts` — 6/6 green (terrain math: flat/ramp/
  plateau heights, stair quantization, ramp normal; spec wiring; non-reference
  registration on all three indexes; stair-top vs heightfield agreement).
- `tests/unit/animation/foot-ik-constraint.test.ts` — 5/5 green incl. the new
  parent-frame pelvis-drop regression case; foot-ik suite 16/16.
- Full `tests/qr/prd06/unit/` battery — 52/52 green.
- `pnpm exec tsc -p tsconfig.check.json --noEmit` — clean for all lane files (also fixed
  pre-existing reds in `morph-face` aura/three adapters + `skinned-character-posed`).
- `pnpm exec eslint` — clean on all touched files.
- Browser spec executes in lane CI (`qr-prd06-animation-browser.yml`, chromium/webkit/
  firefox matrix); the aura run passes `qrFlags: ["animation"]` through the runner
  (URL `?a3d-qr` params do not reach `createAuraApp` — flags come from
  `options.qualityRebuild.flags`).
