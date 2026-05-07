# v3 Code-Only Decision Gates

## Purpose

These gates define when the codebase can claim higher capability. They are stricter than v2 because they focus on the broad target: exceeding Three.js in a defined technical niche and delivering a browser-first Unity/Unreal-like authoring workflow.

## Gate 0: Honest Current State

Required:

- [ ] All examples use names that match actual visuals and behavior.
- [ ] Portfolio screenshots are generated from real pages.
- [ ] Claims are blocked by source checks unless gates pass.
- [ ] `tests/reports/v3-current-capability.json` exists and lists blocked claims.
- [ ] `pnpm verify:v3-code` exists and passes.

Allowed claim after this gate:

> Galileo3D has internally verified proof slices for multiple web 3D engine subsystems.

## Gate 1: Credible Renderer Examples

Required:

- [ ] Product configurator uses real model assets and real materials.
- [ ] Architecture viewer uses a real building/room model.
- [ ] Game slice uses real model/level assets.
- [ ] Asset viewer renders real glTF assets with real texture decoding.
- [ ] Material showroom demonstrates supported PBR features honestly.
- [ ] Shadow and postprocess examples visibly affect real scenes.
- [ ] Browser screenshots and tests pass for all examples.

Allowed claim after this gate:

> Galileo3D can render and interact with real local web 3D scenes through its own renderer.

Still disallowed:

- "better than Three.js"
- "Unity/Unreal for the web"
- "production renderer"

## Gate 2: Asset Pipeline Credibility

Required:

- [ ] v3 asset corpus exists.
- [ ] Asset viewer loads and renders corpus assets.
- [ ] glTF materials, textures, animations, skins, morphs, variants, and unsupported extensions are reported accurately.
- [ ] Draco/Meshopt/KTX2/Basis paths pass if claimed.
- [ ] `tests/reports/v3-asset-corpus.json` passes.

Allowed claim after this gate:

> Galileo3D has a local glTF asset pipeline with explicit supported and unsupported feature reporting.

Still disallowed:

- "complete glTF support"
- "loader parity with Three.js"
- "production asset pipeline"

## Gate 3: Browser Editor Authoring

Required:

- [ ] Browser editor can create, import, place, inspect, transform, save, reload, play, and export a scene.
- [ ] Editor-authored exported app renders without editor code.
- [ ] Gizmos, hierarchy, inspector, asset browser, material editor, play mode, and profiler/debug panels exist.
- [ ] `tests/reports/v3-editor-authoring.json` passes.

Allowed claim after this gate:

> Galileo3D has a browser-first editor workflow for authoring and exporting local TypeScript/WebGL apps.

Still disallowed:

- "Unity replacement"
- "Unreal replacement"
- "Unity/Unreal for the web"

## Gate 4: Same-Scene Engine Comparisons

Required:

- [ ] Same-scene Galileo3D/Three.js/Babylon.js benchmarks exist.
- [ ] Product, asset, PBR, large-scene, instancing, and skinned-character scenes are compared where supported.
- [ ] Reports include startup, load, frame, resource, bundle, screenshot, and unsupported-feature data.
- [ ] Reports state where Galileo3D loses.
- [ ] `tests/reports/v3-engine-comparison.json` passes.

Allowed claim after this gate:

> Galileo3D is competitive in the measured local scenes listed in the v3 comparison report.

Still disallowed:

- broad "better than Three.js"
- visual superiority
- ecosystem superiority

## Gate 5: Defined Three.js Advantage

Required:

- [ ] Gate 4 passes.
- [ ] At least one exact niche shows measurable advantage.
- [ ] Advantage is not only from disabled/missing features.
- [ ] Benchmark report lists versions, commit, browser, viewport, scene, hardware class, and raw data.
- [ ] Known weaker areas remain listed.

Allowed claim after this gate:

> In the specific v3 benchmarked niche named in the report, Galileo3D outperforms or simplifies the workflow versus Three.js under the recorded conditions.

Still disallowed:

- "Galileo3D is better than Three.js" without niche, date, scene, and metric.

## Gate 6: Browser-First Unity/Unreal-Style Workflow

Required:

- [ ] Gate 3 passes.
- [ ] A real app is authored through the browser editor and exported.
- [ ] The editor workflow includes assets, materials, lighting, physics or scripting, play mode, profiling/debugging, and export.
- [ ] The resulting app is visually credible and interactive.
- [ ] Comparison doc/report lists where Unity/Unreal remain stronger.

Allowed claim after this gate:

> Galileo3D provides a browser-first authoring workflow for local web 3D apps.

Still disallowed:

- "Unity replacement"
- "Unreal replacement"
- "Unity/Unreal for the web" unless the phrase is immediately narrowed and backed by the gate report.

## Gate 7: v3 Code Complete

Required:

- [ ] `pnpm verify:v3` passes.
- [ ] All v3 reports are fresh for the current commit.
- [ ] All v3 examples have screenshots.
- [ ] All v3 benchmark reports are generated.
- [ ] All disallowed broad claims remain blocked.

Allowed claim after this gate:

> Galileo3D v3 has code-complete local evidence for its specifically defined renderer, asset, editor, runtime, and benchmark claims.

Still disallowed unless future non-code gates are added:

- public production readiness
- hosted-demo availability
- support guarantees
- registry/package adoption
- ecosystem maturity

