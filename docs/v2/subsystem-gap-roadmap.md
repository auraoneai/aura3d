# Subsystem Gap Roadmap

## Goal

This roadmap turns the broad PRD set into concrete work needed for external credibility. It does not replace the existing requirements trace. It adds market-facing proof that the current trace does not provide by itself.

## Priority 0: Stabilize Truth And Release Gates

| Work | Why it matters | Done when |
|---|---|---|
| Make `pnpm verify:release` reproducibly green | No external claim is credible while the top-level gate fails locally. | A fresh run passes from a clean checkout multiple times, with no stale green JSON dependency. |
| Keep performance budgets reproducibly green | The latest `tests/reports/final-performance.json` is green and `physics-500-bodies-120-steps` is within budget, but the release still needs repeated clean-checkout proof. | Physics and broader performance baselines stay below budget with headroom or any budget change is justified and documented. |
| Keep contradictory doc status language out | The latest `tests/reports/doc-contradictions.json` is green, but status wording must stay aligned after every audit/report refresh. | Audit, plan, trace, and evidence docs agree on status and known limits. |
| Make trace evidence stricter | Trace rows can become green from broad report references. | Product rows require concrete files, tests, commands, and behavior evidence, not just generated report text. |
| Establish clean workspace baseline | Worktree has over a thousand dirty/deleted/untracked entries. | A branch or commit clearly separates intentional rebuild state from accidental deletions/generated artifacts. |

## Priority 1: Real Showcase Applications

| Application | Current state | Required next work |
|---|---|---|
| Showcase world | `examples/11-showcase-world` now exercises a renderer-backed WebGL2/PBR slice with geometry, lights, particles, and metrics. | Treat it as a validation showcase, not a product demo. Next work is camera-driven scene rendering, real external assets, IBL/environment lighting, shadows/contact shadows, interaction, resize/mobile framing, and production-demo polish. |
| Product configurator | `examples/product-configurator` is now a renderer-backed local product demo slice with material variant interaction and browser/visual/performance evidence. | Replace procedural/demo assets with commercial-grade glTF assets, thumbnails, lighting presets, texture-compression path, hosted public URL evidence, and stricter app-scale performance stats. |
| Asset viewer | `examples/asset-viewer` exists and browser tests load a pinned public Khronos Box GLB URL through the viewer. | Add drag/drop, model tree, material/texture inspection, animation playback, validation diagnostics, screenshots, and broader real external model coverage. |
| Editor app | `apps/editor` exists with viewport, panels, hierarchy, inspector, gizmos, save/load, play mode, export, profiling/debug panels, and plugin/extensibility evidence. | Harden production authoring UX, broaden asset import workflows, add richer timeline/material tooling, and prove externally authored projects beyond the checked-in sample. |
| Physics sandbox | `examples/physics-sandbox` is a renderer-backed interactive sandbox with debug layers and browser evidence. | Broaden stress scenes, constraints, sensors, raycasts, stability metrics, and production-level debug tooling. |

## Priority 2: Rendering And GPU

| Feature | Current evidence | Gap to close |
|---|---|---|
| WebGL2 renderer | Strong browser pixel harnesses for bounded paths. | Large-scene batching/culling, real material/texture diversity, memory pressure, device matrix, app-scale frame stability. |
| WebGPU backend | Contracts and injected/browser evidence. | Real adapter/device tests on multiple GPUs and browsers, feature fallback matrix, shader diagnostics, compute/render parity, benchmark comparisons. |
| Scene camera/render integration | Renderer accepts real scene cameras, applies per-node world transforms, emits model/normal/model-view-projection matrices, and has unit evidence for transformed/instanced picking plus camera-frustum culling. The basic scene, shadows, glTF asset, and editor-runtime roadmap examples now render through the WebGL2 harness with scene cameras, lights, transforms, render resources, and renderables. | Stable framed visual output across desktop/mobile for camera movement, app-scale culling stress, raw frame samples, and screenshots. |
| PBR/materials | PBR, textured, normal-mapped, emissive, advanced extension factors, procedural environment-map uniforms, sampled equirectangular RGBA8 environment-map texture input with roughness-dependent mip sampling, bounded CPU-generated RGBA8 environment mip helpers, and bounded BRDF LUT modulation for the default PBR shader. | HDR image-based lighting, irradiance convolution, physically calibrated specular prefiltering, production-calibrated split-sum BRDF integration, reflection probes, clear material limitations, visual parity against reference renderers, material authoring UX. |
| Shadows | Shadow pass, projected evidence, cascaded ownership, transparent-caster filtering, and unit-level moving-camera cascade split stress. | Point/spot shadow maps if claimed, production filtering, bias controls, debug UI, browser visual stress for long moving-camera paths, and real visual comparisons. |
| Postprocess | Tone mapping, bloom, FXAA. | HDR pipeline, composable postprocess graph, depth-aware effects if claimed, performance controls, visual documentation. |
| Skinning/morph/instancing | Bounded support and browser evidence. | Stress tests with many animated/skinned/instanced entities, glTF corpus coverage, GPU memory/performance metrics. |

## Priority 3: Assets And Content Pipeline

| Feature | Current evidence | Gap to close |
|---|---|---|
| glTF/GLB import | Broad loader and validation coverage, many extensions, render resources, browser texture/instancing pixels. | External corpus validation, real decoder integration, material/animation/skin/morph parity scenes, import diagnostics UX, documented unsupported cases. |
| Compression | Draco/Meshopt hooks, Basis/KTX2 metadata paths. | Real WASM/JS decoder packages wired, failure modes tested, browser performance measured, import settings exposed. |
| Texture pipeline | Texture loader, mip generation, color-space validation, bounded KTX2/Basis runtime transcoding into compressed mip levels with RGBA8 fallback levels. | Capability-driven compressed format selection, broad KTX2/Basis corpus validation, texture compression authoring docs, streaming textures, cache eviction, memory budgets. |
| Asset manager | Handles, cache, dependency graph, release tests. | Large project asset database, reimport, versioning, dependency visualization, failed-load recovery UX. |
| Scene serialization | Scene and asset serialization paths exist. | Versioned project format, migration tests, round-trip fidelity across editor/app workflows. |

## Priority 4: Runtime Systems

| System | Current evidence | Gap to close |
|---|---|---|
| Physics | Deterministic rigidbody features, contacts, ray/shape casts, constraints, bridges, debug draw. | Continuous collision detection if claimed, broad constraints, robustness/stability under stress, comparison with Rapier/Ammo/Cannon, editor tooling. |
| Animation | Clips, mixer, blend trees, state machines, skeleton data, skinning contract. | Real glTF animated character corpus, retargeting, timeline UI, animation graph UI, crowd stress tests, authoring docs. |
| Particles | CPU and WebGPU-contract particles, modules, render graph path. | Real GPU hardware proof, authoring presets/tools, blending/sorting stress, lighting/material integration, CPU/GPU parity. |
| Input/controls | Keyboard/pointer/gamepad/actions/picking/controls. | Mobile/touch matrix, pointer lock UX, configurable bindings UI, accessibility docs, complete gameplay/editor examples. |
| Audio | Context, source, mixer, buses, spatial, scene bridge. | Streaming, mobile policy matrix, mixer UI, spatial debug views, asset pipeline integration at app scale. |
| Scripting | Behavior runtime and visual graph primitives. | Script authoring docs, hot reload, debugger, editor integration, visual graph editor, example behaviors. |

## Priority 5: Editor And Tooling

| Area | Current evidence | Gap to close |
|---|---|---|
| Editor runtime | Selection, commands, history, inspector, hierarchy, gizmo, picking, play-mode guards. | Full editor application with UI and persisted project format. |
| Asset authoring | Loader/runtime support. | Asset browser, import settings, previews, reimport, validation panels. |
| Scene authoring | Scene graph and serializer. | Drag/drop hierarchy, prefab/composition model, undoable scene edits, save/load. |
| Material authoring | Material classes and loaders. | Material inspector, texture slots, shader variant UI, validation hints. |
| Profiling/debugging | Debug package APIs. | Interactive profiler and devtools panels. |

## Priority 6: Documentation And Ecosystem

| Area | Gap to close |
|---|---|
| User docs | Getting started, concepts, API reference, tutorials, troubleshooting, known limits. |
| Examples | Replace validation-only examples with learning examples and production-style demos. |
| Releases | Publishable package process, semver, changelog, migration guides. |
| Integrations | React/Vue/Svelte/vanilla examples, bundler templates, static hosting examples. |
| Community | Contribution guide, issue templates, roadmap, support policy, plugin examples. |
