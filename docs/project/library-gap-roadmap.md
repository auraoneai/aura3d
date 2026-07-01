# Library Gap Roadmap

Date: 2026-06-18
Status: durable roadmap for PRD library work

This roadmap names the library work required before Aura3D can ask agents to
build "Three.js quality" games and polished showcases through the public safe
API.

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

Required work:

- adapt `createAuraApp` scene descriptors into production-runtime render sources;
- decide default production runtime versus explicit `renderer: "production"`;
- preserve typed asset safety and reject raw string asset IDs;
- expose typed GLB actors as public route objects;
- document fallback behavior;
- add browser tests that import only `@aura3d/engine`.

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

Required work:

- public typed animation API for `model(assets.character)`;
- skinned glTF rendering in the public bridge;
- clip playback controls: play, pause, loop, crossfade, speed, seek;
- locomotion state helpers;
- morph target support where advertised;
- screenshot tests proving pose/morph changes in the model region.

Acceptance:

- root `createAuraApp` route visibly animates a real skinned GLB;
- screenshots at two times differ meaningfully on the character;
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

Required work:

- generic collision/sensor world;
- platformer kit;
- racing kit;
- falling-block kit;
- generic HUD/event/evidence bindings;
- playable `mini-game` replacement;
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
- `docs/project/known-limits.md`
- `apps/showcase-webgpu-particle-lab/src/main.ts`
- `apps/showcase-data-galaxy/src/main.ts`

Required work:

- public quality profiles (`renderer.qualityProfiles()` and `createAuraApp({ renderer })` diagnostics implemented; production bridge exists for eligible typed-GLB scenes, while renderer feature parity proof remains pending);
- material capability diagnostics (`material.capabilityDiagnostics(...)` implemented for root createAuraApp claim boundaries; production-runtime material integration still pending);
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
- `docs/project/release-checklist.md`

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
