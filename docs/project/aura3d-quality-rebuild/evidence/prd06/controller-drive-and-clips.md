# PRD-06 T0.4–T0.9a evidence — controller clip-drive, clip resolve, inspect-clips, fighting clipmap

PR: qr/prd06-controller-drive (stacked on #153 / qr/prd06-palette-resources).
Flag: `A3D_QR_ANIMATION` — every behavior below is flag-gated; flag-off paths are
byte-identical (asserted by dedicated flag-off tests).

## T0.4 — controller clip-drive (no setAnimationPose from embedded registries)

`AnimationController` bindings driven from the embedded GLB animation-name
registry (`metadata.source === "embedded-glb-clip-registry"`, flag on) push clip
samples directly and make **zero** `setAnimationPose` calls. Flag-off keeps the
legacy verbatim `play({clip})` + pose apply. Covered by
`tests/unit/animation/animation-controller.test.ts` describe
"PRD-06 clip drive + resolveAnimationClips (T0.4–T0.6, T0.8)" — pose-call
counters on both flag states.

## T0.5 — bind-pose suppression

Under the flag, skeleton registries emitting identity bind poses are suppressed
at bind time; flag-off path keeps the identity pose (verified by flag-off test
asserting the bind call still lands).

## T0.6 — resolveAnimationClips + in-flight duration patch

`lanes/prd06.ts` registers the `prd06.animation` node-handle extension
(member `animation`, `appliesTo: ["model"]`). `createPrd06ActorAnimationApi`
(in `app/actorAnimationHandle.ts`) resolves clip infos from the actor clip-info
registry (`registerActorClipInfoSource`, flushed on resolve; waiters park while
the actor is pending) and returns `[]` for non-model nodes.

Found-and-fixed while testing: playback states snapshotted `duration` at
`play()` time, so a clip whose real GLB duration resolved after play kept
wrapping at the stale 1.0s. `applyResolvedClipDurations` now also patches
matching in-flight states (`duration` + `normalizedTime = localTime/duration`).
Unit: duration 1.0 → 2.367 after resolve, nothing pushed while pending,
loop wraps at 2.367 (`vi.waitFor`).

## T0.7 — inspectAnimationClips + `aura3d animation inspect-clips` (C-39)

`packages/aura3d-cli/src/commands/prd06/inspectAnimationClips.ts` — pure
`inspectAnimationClips(json: GltfJson, bin?: Uint8Array)`:

- `duration` = max over samplers of input accessor `max[0]`; when `max` is
  absent the accessor data is read (stride-aware `readFloatAccessor`, WeakMap
  cache).
- `hasRootMotionCandidate` = a `/hips|root|pelvis/i` translation channel with
  net XZ displacement > 0.05 between first and last keyframe.
- `frameRate?` = inverse median of all sampler input-time deltas.

`readGlbDocument` parses GLB magic/JSON/BIN chunks. Registered as
`aura3d animation inspect-clips <glb>` via a `cliCommandFor` fallthrough inside
`runAnimationCommand` (cli.ts is owner-05; the fallthrough is the minimal seam
— command body lives in lane-owned `commands/prd06/`).

Parity: `tests/unit/aura3d-cli/asset-inspection-animation.test.ts` runs the
extractor on `fixtures/threejs-parity/assets/character/soldier.glb` and compares
against three r185 `GLTFLoader` `AnimationClip.duration` — all four clips
(Idle 1.9667, Run 0.7, TPose 0.0333, Walk 1.0333) within 1e-3.

## T0.8 — object-form clips never `durationSource: "defaulted"`

Guard test: `animationClips` given as objects keep their real durations and the
inspection metadata never reports `durationSource: "defaulted"`.

## T0.9a — fighting clipmap fixture + validateClipMap

`tests/qr/prd06/fixtures/fighting-clipmap/fighterClipMap.ts`:
`Record<FighterAssetKey, Record<FighterClip, {clip, standIn?: true}>>`
modelled on `apps/aura-clash-showcase/.../auraClashClipMaps.ts`. Encoded
against the real template GLBs (verified by parsing their animation tables):

- `showcaseWalkAnimatedGirl` — every state → `"Take 001"` (32.900s/206ch),
  `standIn: true` on all but `walk`.
- `showcaseRunnerRobot` — idle→`IDLE` (2.36s), walk→`WALK` (3.24s),
  dash→`RUN` (0.48s); remaining states → `IDLE` with `standIn: true`.

`validateClipMap` ships in
`packages/engine/src/agent-api/GameCharacterAnimation.ts` (exported via
`lanes/prd06.ts`): absent mapped clips throw `AuraClipMapMissingError`
(`FIGHTER_CLIP_MISSING` + `.missing[]` list); each stand-in emits exactly one
`FIGHTER_CLIP_STAND_IN` warning and a report entry.

`tests/qr/prd06/unit/fighting-clipmap.test.ts` (4 tests): every state resolves
to a GLB clip with duration > 0 by re-parsing the real template binaries;
stand-in warning count equals declared count; unmapped `hitstun` →
`FIGHTER_CLIP_MISSING`; absent clip `FIREBALL` → `missing[0].clip === "FIREBALL"`.

## Gates

- Lane battery `pnpm vitest run` (updated workflow spec list): 10 files,
  57 tests, all green.
- `pnpm typecheck:raw`: exit 0.
- eslint: clean (workflow yml reports the standard "file ignored" notice only).
- `.gitignore` gained `!tests/qr/prd06/fixtures/` — the bare `fixtures/` rule
  would otherwise silently drop spec-mandated fixture files.
- `vitest.config.ts` include gains `tests/qr/**/*.test.ts` — the declaration-
  gated include silently skipped lane unit specs outside tests/unit|integration.

## Cross-lane requests filed (see qr-requests-prd06.md)

- Q-05-1: populate `inspectGltfAnimations` from `inspectAnimationClips`.
- Q-13-1: adopt `validateClipMap` + fixture shape in fighters.ts template.
