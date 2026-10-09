# T4.3 — `characterHero` reference module (Q-13-3 input)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


`benchmarks/quality-rebuild/aura3d/scenes/prd06/characterHero.ts` — the
`characterAnimation(controller, hero, spec)` wiring that replaces the
character-controller template's `.animate({ clip: "Take 001" })` and its
HUD-only `createLocomotionKit` weights (`binding.snapshot().weights` is the
HUD source).

## Contents

- `characterHeroValidatorProfile` — `"template-hero"` (T4.6), the profile the
  template's hero GLB must pass under Q-13-3 + Q-05-2 admission.
- `characterHeroClips` — §6.9 canonical actions → the lane hero's embedded
  clip names (`auraClashPlayerRig.3318d671.glb`, 65 joints / 12 clips:
  `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Jump_Loop`, `Crouch_Idle_Loop`,
  `Sword_Attack`, `Hit_Head`, `Sword_Block`, `Death01`). `turn-l`/`turn-r`/
  `interact` have no source clip on this rig and are omitted — they land with
  the C-17-admitted template hero.
- `characterHeroAnimationSpec()` — §7.1 spec tuned to the template's
  `defaultCharacterControllerTuning` (walk 1.6 m/s, run 4.4 m/s):
  locomotion `param: "speed"` in sync group `locomotion` with 0.2 s
  smoothing; airborne jump-start/fall → `Jump_Loop`, land →
  `Crouch_Idle_Loop` (0.15 s blend); masked upper-body actions
  (`attack`/`hit-react`/`block`) + unmasked `death`. `footIk`/`lookAt` stay
  caller-specified (the T4.4 lane scene wires the rig's real chains).
- `bindCharacterHero(controller, hero, spec?)` — thin `characterAnimation`
  wrapper; accepts the template's bare `{ speed }` controller state.

## Binding changes supporting it

`GameCharacterAnimation.ts`: the controller read is structural
(`snapshot()` → `.state` bag → the controller as its own state bag — the
template's `{ speed }`), and `node.animation` resolves structurally first
then falls back to `createPrd06ActorAnimationApi(node)` — the real
C-37 `prd06.animation` api (`ik`, `resolveAnimationClips`) when `node` is an
`AuraRuntimeNodeHandle` (whose `.animation` field is an `AuraAnimationSpec`,
not the api).

## Gates

`tests/qr/prd06/unit/character-controller-binding.test.ts` — 3/3:
- `characterHeroValidatorProfile === "template-hero"`;
- every clip the spec + map references exists on the real
  `auraClashPlayerRig.3318d671.glb` (inspected via `inspectAnimationClips`);
- mid-ramp (≈3.3 m/s) `animationState().activeActions.length ≥ 2`
  (Walk_Loop + Sprint_Loop blending through the published `clipSamples`),
  read through `createPrd06ActorAnimationApi`.

`tests/qr/prd06/unit/character-animation.test.ts` still 7/7;
tsc + eslint clean. Q-13-3 issue body appended to
`qr-requests-prd06.md`.
