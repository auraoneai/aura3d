# Animation, Retargeting, IK, And Lifecycle

Status: Aura3D 2.0 bounded animation receipt.

Aura3D has browser-visible root animation proof and broader package-level
animation behavior. The two surfaces are deliberately described separately so
package tests do not become unsupported root claims.

## Proven root safe API

A route importing only public `@aura3d/engine` APIs proves all of the following
through the production runtime:

- a typed GLB with a skin and named clip visibly changes pose;
- the camera remains stable while 108,019 subject-region pixels change, with a
  7.267 mean delta and an updated skinning palette;
- named play, pause, loop, seek, and crossfade state reaches the runtime;
- clip motion changes 163,626 subject-region pixels, while a paused sample
  changes zero;
- a named morph target changes 27,906 subject-region pixels both when enabled
  and when returned to neutral.

These are rendering claims, not metadata claims. Static typed GLBs remain valid
content, but a static pose cannot satisfy an animation row.

## Proven package behavior

Focused `@aura3d/animation` and `@aura3d/assets` tests prove additive layers,
weighted blending, crossfade, root-motion extraction, deterministic clip
events, clip/action state, explicit humanoid pose retargeting, and imported
two-bone IK. Retargeting reconciles different rest orientations, translation
scale, and facing axes through an explicit humanoid map.

This does not mean automatic arbitrary-rig retargeting. The IK receipt covers a
two-bone imported-skeleton chain, not full-body IK.

## Current Three.js comparison

The canonical gate resolves the current reference baseline before it runs. The
recorded baseline is actual `three@0.185.1` / r185. Aura3D and Three.js then load
the same Robot Expressive asset and execute selected browser workloads with
their real loaders, animation systems, and renderers:

| Workload | Required Three.js path | Structural similarity proxy |
| --- | --- | ---: |
| Additive animation | `AnimationMixer` plus additive blend mode | 0.934 |
| Weighted clip blending | `AnimationMixer` | 0.941 |
| Imported-skeleton two-bone IK | actual bone transforms | 0.974 |
| Morph targets | actual morph-target influences | 0.968 |

These values establish bounded parity for the selected asset and workloads.
They do not establish blanket parity for arbitrary rigs, clips, masks,
transition graphs, morph combinations, or animation authoring tools.

## Lifecycle

The browser lifecycle proof performs three complete real WebGL2 cycles:
load the GLB, create a mixer, play and apply 18 tracks with skinning, render,
stop, dispose the mixer, dispose the asset pipeline, and dispose the renderer.
Every cycle ends with zero active clips, zero mixer actions, and zero tracked
buffers, shaders, textures, render targets, buffer bytes, texture bytes, and
approximate GPU bytes. Mixer disposal is idempotent; subsequent mutation,
lookup, or update calls reject use of the disposed binding.

This is a tracked renderer/mixer resource guarantee. It is not a claim that a
browser heap measurement can prove every JavaScript object was immediately
garbage-collected.

## Certified hero rigs (selected roster, not arbitrary rigs)

No hero rig is certified yet. The E1 roster (humanoid ×2, creature,
vehicle-driver, face) is covered by `tests/browser/certified-hero-rigs.spec.ts`
+ harness, each rig with clip-playback pixel proof from the root public API.
Until per-rig pixel proof lands green, retargeting stays "selected-roster":
`analyzeHumanoidRig` / `createHumanoidRetargetingMap` validate explicit maps,
and per-rig correction profiles (`HumanoidRetargetingProfile`,
`HUMANOID_RETARGETING_PROFILES` registry) ship as mechanism with an empty
registry. Do not claim arbitrary-rig support.

Roster asset findings (GLB-verified, constrain what can be certified):

- Humanoids: `showcaseWalkAnimatedGirl` ("Take 001", 78 joints, sampler range
  t=31.8–32.9) and `showcaseAnimatedRunnerHero` ("OffensiveIdle", 136 joints —
  over the 96-joint uniform cap, so it exercises the data-texture palette path).
- Creature: `showcaseRunnerRobot` ("WALK", 34 joints, sampler range t=2.48–3.24).
  Captures taken before a clip's first keyframe render identical frames — a
  false proof the harness avoids with per-rig in-range capture times.
- Vehicle-driver: `showcaseKenneyOobiPlatformerHero` (6 joints). Its "drive"
  clip is a static 2-keyframe pose (zero channel motion, GLB-verified), so the
  rig certifies with "walk" (0.667 s, real rotation motion) instead.
- Face: `showcaseAnimatedRunnerHero` ("FacialExpressions" — drives dozens of
  head/face bones, GLB-verified). `showcaseMorphExpression` is a
  single-triangle morph unit card, not a face, and cannot serve as the face rig.
  The wrinkle-map hook (`WrinkleMapHook` / `resolveWrinkleMapStrength`) is
  unit-proven; renderer-side wrinkle wiring needs the engine bridge.

Blocker (2026-09-03): final browser confirmation is blocked-with-cause — a
Certified 2026-09-03 (`tests/browser/certified-hero-rigs.spec.ts` 6/6, production-runtime
backend, stable camera, per-rig evidence in `tests/reports/certified-hero-rigs/`):

Certified rigs:

- humanoid-a: `showcaseWalkAnimatedGirl` / "Take 001" — 78 joints, 24,274 changed px.
- humanoid-b: `showcaseAnimatedRunnerHero` / "OffensiveIdle" — 136 joints, 55,150 changed px.
- creature: `showcaseRunnerRobot` / "WALK" — 34 joints, 64,530 changed px.
- vehicle-driver: `showcaseKenneyOobiPlatformerHero` / "walk" — 6 joints, 95,949 changed px.
- face: `showcaseAnimatedRunnerHero` / "FacialExpressions" — 136 joints, 10,640 changed px.

Only these rigs may be claimed as certified. The earlier module-load collision
was resolved (both assets barrels export `ensureCompressedTextureSupport`) and
the proof ran green after the fix; no proof was faked.

## Reproduce the receipt

```bash
pnpm renderer:animation
```

The command verifies the online Three.js baseline, builds the workspace, runs
49 focused unit tests, runs 11 browser tests, and writes a 13/13 aggregate gate
to `tests/reports/animation-complete/report.json`. Its underlying receipts are:

- `tests/reports/animation-complete/root-skinned-pose.json`
- `tests/reports/animation-complete/root-clip-controls.json`
- `tests/reports/animation-complete/root-morph-targets.json`
- `tests/reports/animation-complete/resource-lifecycle.json`
- `tests/reports/threejs-parity/skinning-additive-parity.json`
- `tests/reports/threejs-parity/skinning-blending-parity.json`
- `tests/reports/threejs-parity/skinning-ik-parity.json`
- `tests/reports/threejs-parity/morphtargets-parity.json`

## Superiority (K1 · 2026-09-04)

- WIN: animation-pointer runtime + scene-state-JSON variant round-trip live
  re-proven in-run (library-parity K1 "live re-verification", green
  2026-09-04); the skinning/morph parity receipts above stand unchanged.
- LOSS: no K1 wall-clock claim on animation paths — the 1.1–1.3 ms
  directional numbers cover bloom/instancing/lights/particles only
  (`tests/reports/muse3jsparity/perf.json`).
