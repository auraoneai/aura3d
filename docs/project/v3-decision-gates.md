# v3 Code-Only Decision Gates

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Purpose

These gates define when the codebase can claim higher capability. They are stricter than v2 because they focus on the broad target: exceeding Three.js in a defined technical niche and delivering a browser-first Unity/Unreal-like authoring workflow.

## Gate 0: Honest Current State

Required:

- [x] All examples use names that match actual visuals and behavior.
- [x] Portfolio screenshots are generated from real pages.
- [x] Claims are blocked by source checks unless gates pass.
- [x] `tests/reports/foundation-current-capability.json` exists and lists blocked claims.
- [x] `pnpm verify:foundation-code` exists and passes.

Allowed claim after this gate:

> Galileo3D has internally verified proof slices for multiple web 3D engine subsystems.

## Gate 1: Credible Renderer Examples

Required:

- [x] Product configurator uses real model assets and real materials.
- [x] Architecture viewer uses a real building/room model.
- [x] Game slice uses real model/level assets.
- [x] Asset viewer renders real glTF assets with real texture decoding.
- [x] Material showroom demonstrates supported PBR features honestly.
- [x] Shadow and postprocess examples visibly affect real scenes. Evidence: `tests/browser/rendering-foundation-labs.spec.ts` validates shadow-lab and postprocess-lab browser pixels, and `pnpm verify:v3` passes.
- [x] Browser screenshots and tests pass for all examples.

Allowed claim after this gate:

> Galileo3D can render and interact with real local web 3D scenes through its own renderer.

Still disallowed:

- "better than Three.js"
- "Unity/Unreal for the web"
- "production renderer"

## Gate 2: Asset Pipeline Credibility

Required:

- [x] v3 asset corpus exists.
- [x] Asset viewer loads and renders corpus assets.
- [x] glTF materials, textures, animations, skins, morphs, variants, and unsupported extensions are reported accurately.
- [x] Draco/Meshopt/KTX2/Basis paths pass if claimed.
- [x] `tests/reports/v3-asset-corpus.json` passes.

Allowed claim after this gate:

> Galileo3D has a local glTF asset pipeline with explicit supported and unsupported feature reporting.

Still disallowed:

- "complete glTF support"
- "loader parity with Three.js"
- "production asset pipeline"

## Gate 3: Browser Editor Authoring

Required:

- [x] Browser editor can create, import, place, inspect, transform, save, reload, play, and export a scene.
- [x] Editor-authored exported app renders without editor code.
- [x] Gizmos, hierarchy, inspector, asset browser, material editor, play mode, and profiler/debug panels exist.
- [x] `tests/reports/foundation-editor-authoring.json` passes.

Allowed claim after this gate:

> Galileo3D has a browser-first editor workflow for authoring and exporting local TypeScript/WebGL apps.

Still disallowed:

- "Unity replacement"
- "Unreal replacement"
- "Unity/Unreal for the web"

## Gate 4: Same-Scene Engine Comparisons

Required:

- [x] Same-scene Galileo3D/Three.js/Babylon.js benchmarks exist.
- [x] Product, asset, PBR, large-scene, instancing, and skinned-character scenes are compared where supported.
- [x] Reports include startup, load, frame, resource, bundle, screenshot, and unsupported-feature data.
- [x] Reports state where Galileo3D loses.
- [x] `tests/reports/v3-engine-comparison.json` passes.

Allowed claim after this gate:

> Galileo3D is competitive in the measured local scenes listed in the v3 comparison report.

Still disallowed:

- broad "better than Three.js"
- visual superiority
- ecosystem superiority

## Gate 5: Defined Three.js Advantage

Required:

- [x] Gate 4 passes.
- [x] At least one exact niche shows measurable advantage.
- [x] Advantage is not only from disabled/missing features.
- [x] Benchmark report lists versions, commit, browser, viewport, scene, hardware class, and raw data.
- [x] Known weaker areas remain listed.

Allowed claim after this gate:

> In the specific v3 benchmarked niche named in the report, Galileo3D outperforms or simplifies the workflow versus Three.js under the recorded conditions.

Still disallowed:

- "Galileo3D matches or exceeds Three.js in measured categories" without niche, date, scene, and metric.

## Gate 6: Browser-First Unity/Unreal-Style Workflow

Required:

- [x] Gate 3 passes.
- [x] A real app is authored through the browser editor and exported.
- [x] The editor workflow includes assets, materials, lighting, physics or scripting, play mode, profiling/debugging, and export.
- [x] The resulting app is visually credible and interactive.
- [x] Comparison doc/report lists where Unity/Unreal remain stronger.

Allowed claim after this gate:

> Galileo3D provides a browser-first authoring workflow for local web 3D apps.

Still disallowed:

- "Unity replacement"
- "Unreal replacement"
- "Unity/Unreal for the web" unless the phrase is immediately narrowed and backed by the gate report.

## Gate 7: v3 Code Complete

Required:

- [x] `pnpm verify:v3` passes. Evidence: `pnpm verify:v3` exited 0 on 2026-05-08 with `failedCommands: []`.
- [x] All v3 reports are fresh for the current commit. Evidence: `pnpm verify:v3` exited 0 on 2026-05-08 with `foundation-report-freshness` reporting `issues: 0`.
- [x] All v3 examples have screenshots.
- [x] All v3 benchmark reports are generated.
- [x] All disallowed broad claims remain blocked.

Allowed claim after this gate:

> Galileo3D v3 has code-complete local evidence for its specifically defined renderer, asset, editor, runtime, and benchmark claims.

Still disallowed unless future non-code gates are added:

- public production readiness
- hosted-demo availability
- support guarantees
- registry/package adoption
- ecosystem maturity
