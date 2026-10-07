# T4.4 — `prd06-character-hero` lane scene + §17.2 browser spec (evidence)

PRD-06 §1297–1301: the §17.2 hero bar scene — lane hero (`auraClashPlayerRig`,
65 joints / 12 clips / **0 morph targets**) driven through the scripted 8 s
sequence (idle → walk → run → stop → jump → land → idle) by the T4.2
`characterAnimation` binding + the T4.3 `characterHero` spec/clips map.

## Files

- `benchmarks/quality-rebuild/scenes/prd06/character-hero.ts` — shared
  `CharacterHeroSpec` (sequence table, leg chains, look-at chain, spring
  chain, follow-camera params). `admittedAsReference: false`.
- `benchmarks/quality-rebuild/aura3d/scenes/prd06/character-hero.ts` — bespoke
  runner (needs a live driver + probe, like `morph-face`): builds
  `camera.follow` (C-22), HDRI + sun/fill, receive-shadow ground, emissive
  look-target node; binds `bindCharacterHero(controller.state, handle, spec)`
  with `footIk` (flat analytic ground, `pelvis` drop) and `lookAt`
  (spine_03/neck_01/Head → scripted target node name, resolved per frame by
  `prd06ConstraintTargetPosition`); `springBones.add` on `ball_l → ball_leaf_l`;
  publishes `window.__PRD06_CHARACTER_HERO__` probe (60 Hz
  `motionFrame`/`animationState()` samples + pre-binding `rest` pose).
- `benchmarks/quality-rebuild/three/scenes/prd06/character-hero.ts` — matched
  three.js r185 reference: same GLB/HDRI/lights/ground, `AnimationMixer`
  crossfades on the same phase table, `CCDIKSolver` legs at flat ground,
  distributed head look-at, scripted follow camera, same probe shape on
  `__PRD06_CHARACTER_HERO_THREE__`.
- `benchmarks/quality-rebuild/shared/assets.ts` — `auraClashPlayerRig` entry
  (sha256 `3318d671…`, worldSize [1.669, 1.802, 0.377], 12 clips enumerated).
- `tests/qr/prd06/browser/character-hero-harness.{html,ts}` +
  `character-hero.spec.ts` — §17.2 gates against the probe frames plus a
  30-frame burst capture (33 ms cadence) attached for review.
- `.github/workflows/qr-prd06-animation-browser.yml` — added
  `benchmarks/quality-rebuild/**` to lane trigger paths (adapters/specs).

## Per-PRD wiring decisions

- **Follow camera** — `camera.follow({ targetNode: runtimeId, offset })` real
  C-22 rig (offset keeps the eye trailing the node; `position` would pin it).
- **Look target** — a scene primitive named `hero look target`; the
  `ik.add({kind:"look-at", target})` spec resolves the node *name* per frame
  via `prd06ConstraintTargetPosition` (string targets traverse the runtime
  scene), so the target can be scripted to move.
- **Spring chain** — `ball_l → ball_leaf_l` (toe leaf). The rig ships no
  accessory bones; using the spine→head chain would fight the look-at
  constraint for the same joints. The toe leaf rides the foot-IK'd legs,
  giving a measurable settle signal for the <1°/0.6 s gate.
- **Morph visemes** — N/A on this rig (0 morph targets); the §6.9
  `VisemeController` clause applies only when the hero has morphs (the T4.5
  `defaultVisemeExample` stands ready for the template hero swap, Q-05-2).
- **Kinematic travel** — locomotion clips are in-place (probe: all 12 clips
  `rootMotion:false` except Death01's marker); the scripted controller's
  `speed` advances the node along `travelAxis` with a parabolic jump arc —
  exactly the controller-vs-clip contract §7.1 defines.

## §17.2 automated gates (character-hero.spec.ts)

foot slide ≤ 2 cm walk / ≤ 3 cm run · continuity C ≤ 1.5 at all five
boundaries · pelvis XZ → 0 within 0.4 s of stop + ≥ 2 cm hips settle ·
landing dip ≥ 3 cm within 0.15 s · spring tip < 1° excursion in the last
0.15 s of the 0.6 s post-stop window · look-at error ≤ 5° vs head +z ·
no frame ≥ 90 % bones at rest (pre-binding `rest` capture) · every frame
carries ≥ 1 active action. Plus 30 burst frames attached mid-run.

## Real bug fixed while wiring

`readControllerSnapshot` read `controller.state ?? controller` — a state-bag
controller carrying the **label** `state: "walk"` (a string, not a bag)
resolved `raw = "walk"`, zeroing speed/grounded for every controller that
exposes its label on itself (the exact shape §7.1 advertises). Now `.state`
counts as a bag only when it is an object; `AuraCharacterControllerLike.state`
is `Record | string`. Covered by a new unit test (8/8 green).

## Gates run

- `vitest run tests/qr/prd06/unit/character-animation.test.ts
  character-controller-binding.test.ts burst-step.test.ts` — 14/14 green
  (incl. the new state-label regression test).
- `tsc -p tsconfig.check.json --noEmit` — 0 new errors (baseline ~492
  pre-existing `agent-api` errors on this branch).
- `eslint` on all touched files — clean.
- `pnpm arch:check` — 36 findings, all pre-existing on main; none on the new
  files (adapter imports go through `@aura3d/engine/lanes` /
  `@aura3d/animation/lanes`, no cross-package relatives).
- Browser spec execution: see the chromium run attached to the PR (the
  playwright matrix job runs chromium/webkit/firefox on macos-14).
