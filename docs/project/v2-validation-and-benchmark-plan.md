# Validation And Benchmark Plan

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Purpose

Internal tests prove bounded behavior. External claims require reproducible evidence across real browsers, real devices, real assets, and comparable engines.

## Baseline Gates

These gates must be stable before any external claim:

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
pnpm test:visual
pnpm verify:performance
pnpm verify:demos
pnpm verify:trace
pnpm verify:release
```

Minimum policy:

- Run `pnpm verify:release` at least three times on a clean checkout before tagging a release candidate.
- Store all reports under `tests/reports`.
- Fail release if any report was generated from a previous run or contradicts another report.
- Fail release if docs say `GO` while known limitation sections still contain unqualified "incomplete" language.
- Fail release if public docs contain stronger claims than `docs/project/v2-claim-registry.md` allows.
- Fail release if benchmark or visual evidence was generated before the code, example, asset, or docs changes it is supposed to prove.

## Browser And Hardware Matrix

| Surface | Required matrix |
|---|---|
| WebGL2 | Chrome, Edge, Firefox, Safari; integrated GPU and discrete GPU; high-DPI and low-power modes. |
| WebGPU | Chrome stable/canary, Edge, Safari technology state where available; multiple adapters; unavailable/denied adapter behavior. |
| Input | Desktop keyboard/mouse, touch, pointer lock, gamepad mocks plus real controller smoke. |
| Audio | Chrome, Safari, Firefox autoplay/unlock behavior; suspended/resumed states; mobile browser policy. |
| Performance | Low-end laptop, mainstream laptop, high-end desktop, mobile-class browser where supported. |

## Asset Corpus

Create `tests/assets/corpus` or an external reproducible asset fixture repository with:

| Corpus | Required coverage |
|---|---|
| Khronos glTF sample models | Materials, skins, animations, morphs, cameras, lights, variants, texture transforms. |
| Blender exports | Common real-world exporter output, including packed textures and animation clips. |
| Compressed assets | Draco, Meshopt, KTX2/Basis, WebP where supported. |
| Broken assets | Invalid accessors, missing textures, malformed extensions, wrong MIME/data URI cases. |
| Large assets | Many nodes, many materials, many textures, large vertex/index buffers. |

Each corpus asset needs:

- Load result.
- Expected warnings/errors.
- Screenshot or pixel reference when visually meaningful.
- Memory and load-time metrics.
- Comparison against Three.js or Babylon.js for compatibility where relevant.

## Comparative Benchmarks

Build equivalent scenes in Aura3D, Three.js, and Babylon.js. Add Unity WebGL only where the comparison is meaningful.

Fairness requirements:

- Pin engine versions, browser versions, OS, hardware, GPU, DPR, resolution, and driver/device information.
- Use the same asset files, texture sizes, camera paths, lighting intent, animation clips, measurement windows, and warmup policy.
- Store raw samples, summarized statistics, screenshots, bundle artifacts, and failure logs.
- State where a scene is not equivalent and exclude that result from "better than" claims.
- Separate developer-experience comparisons from renderer-performance comparisons.

| Benchmark | Metrics |
|---|---|
| Startup and blank-to-first-frame | JS bundle size, parse time, init time, first rendered frame. |
| glTF asset load | Download size, decode time, upload time, total ready time, warnings/errors. |
| 1,000 static meshes | Frame time, draw calls, memory, CPU time. |
| 10,000 instances | Frame time, draw calls, instance throughput, GPU/CPU cost. |
| Animated skinned characters | Character count at 30/60 FPS, CPU skinning/GPU skinning cost, memory. |
| Particles | 10k/50k CPU and GPU particles, sorting cost, upload cost, visual correctness. |
| Physics stress | 500/1,000 bodies, constraints, raycasts, contact stability, frame budget. |
| Editor workflow | Time and steps to import asset, place it, edit material, save scene, run app. |

Reports should be JSON plus human-readable markdown:

- `tests/reports/comparison-threejs.json`
- `tests/reports/comparison-babylon.json`
- `tests/reports/browser-hardware-matrix.json`
- `docs/benchmarks/*.md`

## Visual Validation Requirements

Current visual tests are useful but mostly bounded pixel checks. Add these layers:

| Layer | Requirement |
|---|---|
| Smoke | Canvas is nonblank and correctly sized. |
| Semantic pixels | Expected regions contain expected colors/luminance/material response. |
| Screenshot diff | Stable scenes compare against approved screenshots with platform-aware tolerance. |
| Motion validation | Animation/particles/physics change over time and remain bounded. |
| Camera framing | Objects remain visible under desktop/mobile viewports and resizing. |
| Real app snapshots | Product configurator, editor, physics sandbox, game slice, asset viewer. |

Screenshot artifacts should be stored or uploaded with enough metadata to reproduce the exact scene, viewport, browser, and commit.

## Performance Policy

Performance budgets must be:

- Measured with warmup and multiple attempts.
- Reported with min, median, max, and outlier information.
- Given headroom, not passing by a few milliseconds.
- Split by environment class where necessary.
- Not updated upward without a written justification and comparison data.

Budget-change policy:

| Situation | Required action |
|---|---|
| A baseline fails locally or in CI | Optimize the implementation, reduce unnecessary work, or document a justified budget change with hardware context and comparison data. |
| A budget passes by a narrow margin | Treat it as unstable until median and max have headroom across repeated clean runs. |
| A benchmark is used for a public claim | Include raw samples, environment data, compared versions, and the exact claim it supports. |

## Trace Verification Improvements

The trace gate should reject rows that use weak evidence such as:

- "docs/project/rebuild-progress.md passed" as the only product evidence.
- "final release report passed" without concrete source and test references.
- Generated audit artifacts proving themselves.
- Stale report text containing prior NO-GO status.
- Broad "implemented and verified" rows with no implementation path.

Add stricter checks:

| Check | Rule |
|---|---|
| Source file evidence | Product rows must cite at least one source file or package path when implementation is required. |
| Test evidence | Product rows must cite a unit, integration, browser, visual, or performance test. |
| Report freshness | Report timestamps must come from the current release run. |
| Contradiction scan | `GO` docs cannot contain unqualified "remains incomplete" for required production features. |
| External claim rows | Three.js/Unity/Unreal claims must require comparison reports, not internal trace completion. |
