# Aura3D Library Gap Roadmap

> **Status note — superseded for remaining work (2026-07-29).**
> This document is retained as a historical record. The authoritative list of
> still-open work is `docs/project/plans/final-remaining-work-prd.md`, whose FS IDs
> supersede any checkbox, status line, or completion claim here. A checked item in
> this file does not override a failing or stale current artifact; where the two
> disagree, the current generated report wins.


Date: 2026-07-27
Status: durable roadmap with evidence-bounded progress notes

This roadmap names the library work required before Aura3D can ask agents to
build "Three.js quality" games and polished showcases through the public safe
API.

Items below are targets, not shipped claims. A target may have bounded package
or named-route proof without being complete for arbitrary root
`createAuraApp` scenes.

## P0: Root Production Renderer Bridge

Owner areas: `packages/engine`, `packages/rendering`

Primary files to inspect or change:

- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/production-runtime/TypedGLBActor.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/index.ts`

Current bounded progress and remaining work:

- a production bridge exists for eligible typed-GLB sources, with named root
  bridge tests; broaden the supported descriptor/feature matrix before treating
  it as root-default renderer parity;
- decide default production runtime versus explicit `renderer: "production"`;
- preserve typed asset safety and reject raw string asset IDs;
- keep typed GLB actor exposure and route evidence asset-specific;
- document fallback behavior;
- add root-only browser tests for each renderer feature being claimed.

Acceptance:

- typed GLB renders through the production bridge;
- screenshot tests do not import renderer internals;
- public quality profiles are documented;
- examples do not import internals for production visuals.

## P0/P1: Animation, Skinning, And Morphs

Owner areas: `packages/animation`, `packages/engine`, `packages/rendering`

Primary files/docs to inspect or change:

- `packages/animation/src/index.ts`
- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/production-runtime/TypedGLBActor.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `docs/animation/runtime-support.md`
- `docs/rendering/skinning-and-morphs.md`

Current bounded progress and remaining work:

- named root-only browser routes now prove skinned pose deltas and morph
  deformation for their tested assets; they do not establish arbitrary-rig
  support;
- retain the public typed animation and morph controls used by those fixtures;
- clip playback controls: play, pause, loop, crossfade, speed, seek;
- locomotion state helpers;
- broaden rig, skin, clip, and morph fixtures only where public claims need it;
- keep screenshot tests proving pose/morph changes in the model region.

Acceptance for broad closure:

- more than one representative root `createAuraApp` fixture visibly animates a
  real skinned GLB and exercises the advertised controls;
- screenshots at two times differ meaningfully on each tested character;
- docs distinguish public, experimental, internal, and planned support.

## P0/P1: Asset CLI Provenance And Quality Gates

Owner areas: CLI, asset pipeline, generated typed assets

Primary files/docs to inspect or change:

- `packages/cli`
- `packages/assets/src/AssetInspection.ts`
- `packages/assets/src/ProductionAssetCorpus.ts`
- `packages/asset-index/src/adapters/aura-index.ts`
- `aura.assets.json`
- `src/aura-assets.ts`
- `docs/api/assets.md`
- `docs/agents/asset-workflow.md`

Required work:

- `assets validate --source` for unsafe model strings, raw URLs, `unsafeModelUrl`,
  `GLTFLoader`, `three`, and renderer hacks;
- `assets validate --release` that turns warnings into blockers;
- durable source page, download URL, license name, license URL, author, and
  acquisition timestamp;
- duplicate hash rejection or allowlist;
- placeholder-like primary asset rejection;
- loader-backed inspection for bounds, nodes, materials, textures, animations,
  skins, morphs, and hierarchy;
- release thumbnails/probes;
- reviewable generated `src/aura-assets.ts`.

Acceptance:

- public showcase build fails on raw string asset IDs;
- primitive-only primary subjects fail;
- every primary asset reports exact source/license evidence.

## P0/P1: Game Runtime Kits

Owner areas: `packages/engine`, game runtime, templates, physics

Primary files/docs/apps to inspect or change:

- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/game`
- `packages/physics`
- `templates/mini-game`
- `docs/api/game-runtime.md`
- `docs/guides/build-a-browser-game.md`
- `docs/project/game-runtime-release.md`
- `apps/showcase-blockfall-reactor/src/main.ts`
- `apps/showcase-skyline-runner/src/main.ts`
- `apps/showcase-turbo-drift-circuit/src/main.ts`

Current bounded progress and remaining work:

- generic collision/sensor world;
- platformer, racing, and falling-block helpers exist as bounded deterministic
  presentation/runtime surfaces; they are not generic game engines;
- generic HUD/event/evidence bindings;
- keep the `mini-game` scaffold aligned with exports and its declared scope;
- docs that reference only real exports.

Acceptance:

- platformer starter passes keyboard movement/jump/checkpoint tests;
- racing starter passes steering/throttle/checkpoint/lap tests;
- falling-block starter passes movement/rotation/hold/line-clear tests;
- routes do not need ad hoc collision engines for basic behavior.

## P0/P1: Materials, Lighting, Effects, And WebGPU Truth

Owner areas: rendering, engine, examples, docs

Primary files/docs/apps to inspect or change:

- `packages/rendering/src`
- `packages/engine/src/agent-api/index.ts`
- `docs/rendering/material-matrix.md`
- `docs/rendering/postprocess.md`
- `docs/concepts/rendering.md`
- `docs/project/status/known-limits.md`
- `apps/showcase-webgpu-particle-lab/src/main.ts`
- `apps/showcase-data-galaxy/src/main.ts`

Required work:

- public quality profiles (`renderer.qualityProfiles()` and
  `createAuraApp({ renderer })` diagnostics are implemented; a production
  bridge exists for eligible typed-GLB scenes, while root feature-parity proof
  remains pending);
- material capability diagnostics (`material.capabilityDiagnostics(...)` is
  implemented for root claim boundaries; rendering-internal RGBE/PMREM and
  bounded transmission proof does not establish root material parity);
- exact material support matrix;
- environment lighting and shadows only when pixel-backed;
- postprocess only when screenshot-backed;
- WebGPU route demotion or proof;
- Aura3D particles rather than CSS/DOM stand-ins.

Acceptance:

- WebGPU claim fails without adapter/backend/dispatch/render proof;
- particle controls visibly change pixels and telemetry;
- material examples use real material inputs from asset metadata.

## P0/P1: Diagnostics And Browser Quality Gates

Owner areas: tests, diagnostics, CI

Primary files/docs to inspect or change:

- `tests/browser/showcase-library.spec.ts`
- `tests/browser`
- `packages/engine/src/agent-api/index.ts`
- `docs/project/verification-evidence.md`
- `docs/project/release/release-checklist.md`

Required work:

- screenshot difference checks after keyboard input;
- hero/world/UI readability checks;
- primitive budgets;
- typed primary asset checks;
- desktop/mobile screenshot crop checks;
- animation pixel-delta checks;
- per-route route-health JSON;
- claim-vs-capability failure.

Acceptance:

- no route passes only because a screenshot is large or nonblank;
- no game passes without visible input impact;
- no showcase passes if the main subject is tiny, hidden, clipped, or
  primitive-only.

Current gate note: the retained racing route-primary screenshot and dependent
composition hashes were regenerated through the canonical producers. The
six-check racing visual-QA unit gate now passes, as do the complete 336-file
unit suite and starter-example screenshot checks. Comparative performance
promotion remains separately blocked on six missing reports.
