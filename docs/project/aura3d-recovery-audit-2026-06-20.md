# Aura3D Recovery Audit - 2026-06-20

Status: active recovery audit  
Scope: public root API, renderer proof, asset quality, grounding/camera,
particles, game runtime, docs claims, and current showcase evidence.

This audit exists to stop the failed loop of patching showcase examples before
the engine, assets, diagnostics, and docs prove that the public Aura3D API can
support them.

## Inputs

- First-read policy: `llms.txt` and `AGENTS.md`.
- Current prompt: `prompt.md`.
- Current remediation PRD: `Fixed-Needed-PRD.md`.
- Baseline evidence capture:
  `tests/reports/aura3d-recovery-baseline/summary.json`.
- Baseline screenshots:
  `tests/reports/aura3d-recovery-baseline/*.png`.
- Six focused audits:
  renderer/PBR, asset pipeline, grounding/camera, particles/effects,
  game runtime, and docs/claims.

## Executive Finding

Aura3D should not be killed, but the current examples cannot be treated as proof
that the library is ready. The main failure is a proof and boundary failure:
docs and PRD checkboxes claimed completed public-root behavior while the code and
screenshots only prove partial internals, metadata, route-local workarounds, or
prototype behavior.

The recovery order is:

1. Fix false documentation and PRD completion state.
2. Add root-only proof tests and diagnostics for the missing public API behavior.
3. Fix library/API/tooling gaps until those proof tests pass.
4. Rebuild examples only after the library gates pass.

## Current Baseline

Baseline capture succeeded on 2026-06-20:

- Report: `tests/reports/aura3d-recovery-baseline/summary.json`
- Route count: 11
- Origin: `http://127.0.0.1:5174`
- Captured route screenshots:
  `tests/reports/aura3d-recovery-baseline/showcase-*-first-load.png`
  and `showcase-*-after-2700ms.png`
- Game input screenshots:
  `showcase-blockfall-reactor-after-input.png`,
  `showcase-skyline-runner-after-input.png`,
  and `showcase-turbo-drift-circuit-after-input.png`

The capture is evidence of the current state, not a pass. The inspected images
still show unacceptable issues:

- `showcase-skyline-runner-after-input.png`: player is cropped, route is still
  not a credible playable side-scroller proof, and the public claim remains
  `review`.
- `showcase-turbo-drift-circuit-after-input.png`: track and car render, but game
  proof is still weak, camera/playability remain unacceptable, and route evidence
  still calls it an internal candidate rather than production motorsport physics.

## Renderer And PBR Audit

Findings:

- Root `createAuraApp` defaults to a safe/basic path unless production is
  explicitly requested.
- Existing strong renderer tests import rendering internals or `Renderer.create`
  directly. They do not prove the public root `@aura3d/engine` API.
- PBR/HDR/postprocess claims are too broad when based on metadata or renderer
  internals.
- Public-root proof is missing for material texture parity, environment lighting,
  shadows, postprocess, and WebGPU.

Required fixes:

- Add browser tests that import only `@aura3d/engine` plus generated typed assets.
- Separate diagnostics into requested, accepted, active, and pixel-proven
  capabilities.
- Keep renderer-internal claims scoped to `packages/rendering` until root proof
  exists.
- Do not mark PBR/HDR/WebGPU/postprocess public-root support complete until
  screenshots and pixel checks prove it through `createAuraApp`.

## Asset Pipeline Audit

Findings:

- The typed asset workflow exists, but asset quality validation is not yet strong
  enough for showcase release gating.
- Several assets still have temp or incomplete provenance in current evidence.
- Quality grade, role suitability, orientation, groundedness, rendered thumbnail,
  texture completeness, and duplicate-hash enforcement are incomplete or partial.
- `src/aura-assets.ts` is generated with very long lines, making review and
  source audit difficult.
- `assets validate` is not yet sufficient to reject primitive-dominant routes
  that also happen to use a typed asset.

Required fixes:

- Make release validation block temp provenance, missing durable source/license
  fields, ungraded primary assets, duplicate hashes without allowlists, and
  primitive-primary substitutions.
- Add rendered asset probes or thumbnails as release evidence.
- Store role-aware asset quality grades such as hero-ready, gameplay-ready,
  background-ready, material-test-ready, debug-only, and reject.
- Regenerate `src/aura-assets.ts` in reviewable formatting.

## Grounding, Scaling, And Camera Audit

Findings:

- At the start of this recovery audit, `targetHeight`, `targetMaxDimension`, and
  `targetLength` were exposed on public model options but model matrix
  generation ignored them.
- At the start of this audit, `camera.frameAsset(...)` did not have public-root
  proof. It is now implemented as a public API and has typed-GLB framing proof
  through root `@aura3d/engine`; see Progress below.
- `.grounding(...)` and `model(..., { grounding })` do not exist as public APIs.
- Current route placement works only when routes bypass inert options and apply
  explicit scale from helper math.
- Grounding uses metadata AABB bottom, not semantic contact points such as tires,
  feet, or road surface.
- Root placement recenters X/Z, which can misalign GLB-authored coordinates with
  route paths/checkpoints unless diagnostics expose the transform.
- Route-health and browser tests are stale for current Turbo/Skyline assets.

Progress:

- `targetHeight`, `targetMaxDimension`, and `targetLength` are now applied by
  `createModelMatrix(...)` for public `model(assets.x, { ... })` calls and are
  proven by a root-only browser contract test. Evidence:
  `tests/reports/createAuraApp-model-sizing/model-sizing.json`,
  `tests/reports/createAuraApp-model-sizing/model-sizing.png`, and command
  `pnpm exec playwright test tests/browser/createAuraApp-model-sizing.spec.ts --reporter=line`.
- `camera.frameAsset(assets.x, ...)` now frames a typed GLB through root
  `@aura3d/engine` and `createAuraApp` production runtime without clipping.
  Evidence:
  `tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.json`,
  `tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.png`, and
  command
  `pnpm exec playwright test tests/browser/createAuraApp-camera-frame-asset.spec.ts --reporter=line`.
- This is partial Phase 4 proof only. Semantic grounding API, per-model
  diagnostics, route screenshots, and car/humanoid/product/world readability
  remain open.

Required fixes:

- Keep `targetHeight`, `targetMaxDimension`, and `targetLength` covered by
  root-only browser tests so future renderer changes cannot regress them.
- Keep `camera.frameAsset(assets.x, ...)` covered by root-only browser tests so
  future renderer/camera changes cannot regress first-load framing.
- Add a real grounding contract or document exactly that `position.y` means the
  normalized asset bottom.
- Add per-model diagnostics: raw bounds, normalized bounds, requested target,
  applied target, final world AABB, bottomY, floorY, screen rect, clipped
  percentage, and camera visibility.
- Regenerate route-health from mounted runtime diagnostics, not stale source
  snapshots.

## Particles And Effects Audit

Findings:

- Current audited routes use Aura3D particle/effects APIs rather than CSS or DOM
  fake particle systems.
- The particle lab currently proves WebGL2 fallback particle rendering, not
  native WebGPU compute rendering.
- Particle controls affect pixels, but route naming and evidence must consistently
  say Aura3D Particle Lab or WebGL fallback unless native WebGPU dispatch and
  rendering are proven.

Required fixes:

- Add root safe API particle pixel tests.
- Add a source guard that rejects CSS/DOM/canvas particle stand-ins in public
  examples claiming Aura3D particles.
- Rename or consistently demote the legacy `showcase-webgpu-particle-lab` route
  unless adapter, backend, dispatches, and rendered pixels prove native WebGPU.

## Game Runtime Audit

Findings:

- Public game kits exist, but current examples prove prototype mechanics rather
  than production-quality reusable game kits.
- Blockfall uses the falling-block kit, but a local duplicate rules file remains
  and proof is still short.
- Skyline does not currently prove a 60-second meaningful route or reliable
  completion. A live probe showed it did not finish in the expected proof window.
- Turbo is still a short route proof with fragile checkpoint evidence, not a real
  racing game.
- Starter/template content is also too short.
- Route-health and README asset metadata are stale relative to source.

Required fixes:

- Add deterministic route-level replay proofs for platformer, racing, and
  falling-block progression.
- Require fail/retry/reset, scoring/timing, and at least 60 seconds of meaningful
  playable content before calling a game route ready.
- Update stale route-health and README evidence from actual mounted runtime
  diagnostics.
- Keep game-kit claims scoped as prototype until public tests prove real reusable
  behavior.

## Docs And Claim Audit

Findings:

- `Fixed-Needed-PRD.md` marks many root rendering, game, asset, and showcase
  gates complete even though current docs and screenshots contradict them.
- README, route-health, launch evidence, and app source disagree on route names,
  renderer mode, asset keys, and status.
- Aura Clash wording in README is stronger than the bounded status in
  `llms.txt` and `docs/project/aura-clash-showcase.md`.
- Release/version docs mix older release artifact metadata with newer README
  positioning.
- Prompt Phase 7 references docs that must either be created or replaced with
  existing canonical docs.

Required fixes:

- Reopen false-complete PRD sections and mark them as current recovery tasks.
- Keep root, production-runtime, rendering-internals, CLI, template, and prototype
  claims separate.
- Regenerate or demote stale launch evidence.
- Make every public claim cite exact evidence paths.

## Authoritative Reopened P0 Tasks

These tasks supersede earlier broad checkmarks until they have current proof:

- [ ] Root-only production rendering proof: browser tests import only
  `@aura3d/engine`, mount typed assets, and prove materials, textures, lighting,
  shadows, and postprocess in pixels.
- [ ] Public model sizing proof: `targetHeight`, `targetMaxDimension`, and
  `targetLength` either affect rendered output or are removed from public docs.
- [ ] Public camera/grounding proof: camera framing and grounding APIs exist or
  docs stop referencing them as available behavior.
- [ ] Asset release proof: every primary route asset has durable provenance,
  quality grade, role suitability, texture/material/bounds/orientation evidence,
  and no temp-source release evidence.
- [ ] Particle proof: fallback particles are visibly active, controls change
  pixels, and WebGPU claims are absent unless native compute/render proof exists.
- [ ] Game proof: game routes prove input, fail/retry, scoring/timing,
  progression, and at least 60 seconds of meaningful content before public-ready
  claims return.
- [ ] Showcase proof: all ten showcase routes pass current screenshot, route
  diagnostics, source audit, route-health, and manual visual inspection gates.
- [ ] Docs proof: README, llms, AGENTS, route-health, launch evidence, app
  READMEs, docs/project, docs/api, docs/guides, docs/rendering, and docs/templates
  agree with the actual proof state.

## Do Not Do Next

- Do not keep patching individual examples until the root library proof gates are
  in place.
- Do not call a route fixed because it loads or produces a large screenshot.
- Do not claim PBR, HDR, WebGPU, production game runtime, skinned animation,
  morph support, or flagship quality without route-specific browser evidence.
- Do not use primitives as primary subjects for character, vehicle, game world,
  product, or real environment examples.
