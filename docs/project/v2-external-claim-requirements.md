# External Claim Requirements

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Claim Tiers

Aura3D needs different proof depending on the claim being made.

| Claim | Current credibility | Required proof |
|---|---|---|
| "Aura3D is a production TypeScript-first browser 3D engine and workflow SDK." | Credible | V10 feature, visual, performance, animation, physics, memory, workflow, and claim-defense reports. |
| "Aura3D is a usable internal engine prototype." | Partly credible | Stable `pnpm verify:release`, richer public examples, known-limits docs, and app-scale smoke demos. |
| "Aura3D is production-ready." | Credible with V10 evidence | Stable releases, real app adoption, device/browser matrix, asset corpus, regression history, docs, support process. |
| "Aura3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run." | Credible only with exact wording | `tests/reports/comparison-threejs.json`, `docs/benchmarks/threejs-comparison.md`, and `docs/comparisons/threejs.md`; must include exclusions for runtime, release bundle size, visual parity, loader parity, ecosystem maturity, and broad superiority. |
| "Aura3D matches or exceeds Three.js in measured categories." | Not credible yet | A feature-by-feature comparison plus benchmarks and developer-experience proof in domains where Aura3D is intentionally higher level. |
| "Aura3D is competitive with Unity/Unreal for the web." | Not credible yet | A browser editor, authoring workflows, asset pipeline UX, profiling/debugging tools, build pipeline, sample projects, and production proof. |

Every claim above must also be registered in `docs/project/v2-claim-registry.md` before it appears in public docs, README text, release notes, package descriptions, or marketing copy.

## What "Better Than Three.js" Could Mean

Three.js is a mature rendering toolkit and ecosystem. Aura3D should not try to beat it on every axis. A realistic claim is narrower:

> Aura3D is a higher-level, TypeScript-native web 3D engine for structured applications, with built-in ECS, physics, animation, assets, editor runtime, diagnostics, and validation.

To support that claim, Aura3D needs evidence in these areas:

| Dimension | Three.js baseline expectation | Aura3D proof required |
|---|---|---|
| Renderer features | Mature WebGL renderer, broad materials, examples, postprocessing ecosystem, WebGPU work in progress. | WebGL2/WebGPU feature matrix, advanced materials, real hardware tests, postprocess stack, large-scene performance, documented gaps. |
| Scene workflow | Cameras, object transforms, controls, loaders, examples, and renderer integration are ordinary expectations. | Camera-driven scene rendering, per-node transforms, view/projection/model/normal matrices, culling, picking, resize, and screenshot proof in real examples. |
| Asset loading | Mature glTF loader and ecosystem knowledge. | Khronos sample model corpus, Blender/exporter corpus, broader Draco/Meshopt/KTX2/Basis corpus workflows, visual comparisons. |
| Developer ergonomics | Simple scene setup, huge examples base, community patterns. | Less boilerplate for app-level systems, clear lifecycle, diagnostics, templates, tutorials, cookbook examples. |
| Ecosystem | Massive community, docs, integrations, examples. | Public docs site, starter templates, integrations, plugin model, examples beyond validation demos. |
| Performance | Known behavior across browsers and devices. | Comparative benchmarks for startup, memory, draw calls, frame time, asset load time, and bundle size. |
| Stability | Years of production usage. | Release history, regression suite, public issue tracking, compatibility matrix, known-limits documentation. |

## What "Unity/Unreal For The Web" Could Mean

Unity and Unreal are not just renderers. They are authoring ecosystems. A realistic web claim is:

> Aura3D provides a lightweight, browser-native engine and editor workflow for web-first 3D applications where TypeScript integration, deployment size, and direct web platform access matter more than AAA authoring depth.

To support that, Aura3D needs:

| Capability | Current evidence | Required external proof |
|---|---|---|
| Visual editor | Editor runtime APIs and browser workflow tests. | Real editor app with hierarchy, viewport, inspector, gizmos, asset browser, save/load, play mode, import settings, and profiling panels. |
| Scene authoring | Scene graph and serialization exist. | Authoring UI, prefab or composition model, scene templates, drag/drop objects, undoable edits, versioned scene format. |
| Asset import | glTF/texture/material loaders and import pipeline exist. | Import UI, import settings, decoder integration, previewer, error UX, asset database, cache management, reimport workflows. |
| Animation tooling | Runtime animation system exists. | Timeline, state machine graph UI, clip preview, retargeting workflows, rig/humanoid tools if claimed. |
| Physics tooling | Runtime physics exists. | Collider authoring, joint tools, debug overlays, stress scenes, constraint UX, comparison against established physics engines. |
| Build pipeline | Package build exists. | Project build/export flow, environment configs, static hosting examples, framework templates, asset bundling, CI templates. |
| Profiling/debugging | Debug package exists. | Interactive frame profiler, resource inspector, shader/material debug panels, GPU timings where supported. |
| Extensibility | Public packages exist. | Plugin API, extension examples, versioning, compatibility guarantees, package registry strategy. |

## Required Competitive Demos

The external claims should be blocked until these demos exist and are verified in browser:

| Demo | Required systems | Success criteria |
|---|---|---|
| Product configurator | glTF, PBR materials, texture variants, UI integration, camera controls, asset loading | Loads real product assets, changes material variants live, records frame time and load time, documents bundle size. |
| Architectural scene | large scene, lighting, shadows, camera navigation, picking, measurements | Handles a heavy glTF scene, stable camera controls, visible shadows, selection/measurement, performance report. |
| Game slice | physics, animation, input, particles, audio, scene/ECS, renderer | Playable loop with collision, animated actors, effects, sound, stable frame time, no hidden validation shortcuts. |
| Editor app | editor runtime, scene graph, assets, renderer, inspector, hierarchy, gizmos | Browser editor can import asset, place object, edit transform/material, save/load scene, enter play mode. |
| Benchmark suite | Aura3D, Three.js, Babylon.js, optionally Unity WebGL | Apples-to-apples scenes for startup, load time, memory, frame time, draw calls, asset compatibility, bundle size. |

## Claim Blockers

Do not make the external claims while any of these remain true:

- `pnpm verify:release` is not reproducibly green from a clean checkout.
- Contradictory GO/incomplete status language reappears in the docs after future edits; the latest `tests/reports/doc-contradictions.json` is green.
- Performance budgets become flaky or fail locally; the latest `tests/reports/final-performance.json` is green, including `physics-500-bodies-120-steps`.
- Examples remain primarily validation artifacts rather than learning/product demos.
- Renderer examples do not prove real camera, transform, material, lighting, resize, and interaction workflows.
- PBR demos lack environment lighting, color management, reference comparisons, or known material limitations.
- WebGPU evidence is mostly injected or synthetic rather than real hardware matrix evidence.
- The asset pipeline is not validated against a broad external model corpus.
- A browser editor application exists, but it is still a bounded browser-first workflow proof, not a broad native-editor replacement.
- Comparative benchmark reports and a public known-limits page exist, but the reports remain scaffold/microbenchmark evidence and do not enable stronger public claims.
- Claim-registry enforcement exists and blocks overbroad public wording.
- A checked-in editor-authored app can be exported and run as a static web project, but the workflow still needs broader independent/user evidence before any Unity/Unreal-style claim is credible.
