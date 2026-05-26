# Aura3D and Unity/Unreal Web Workflows

This comparison is limited to browser-first TypeScript workflows. It is not a native editor, console, desktop, mobile, or AAA production comparison.

## Evidence

- Editor workflow caveats: `docs/editor/browser-first-workflow.md`
- Known limits: `docs/project/known-limits.md`
- Claim registry: `docs/project/v2-claim-registry.md`
- Current benchmark scaffolds: `docs/benchmarks/threejs-comparison.md`, `docs/benchmarks/babylon-comparison.md`

## Current Result

| Area | Current classification | Notes |
|---|---|---|
| Browser-first TypeScript integration | Aura3D has a scoped prototype advantage only | Aura3D is authored as TypeScript packages with Vite examples and local validation reports. This is useful for web-app integration, but it is not a full authoring-product claim. |
| Runtime/editor-runtime slices | Partial Aura3D prototype coverage | The repo has editor-runtime docs and tests, but not a complete visual editor product. |
| Visual scene authoring | Unity and Unreal stronger | Aura3D lacks a production scene editor, inspectors, import UI, prefab workflow, timeline authoring, terrain tooling, and mature asset management UI. |
| Asset pipeline | Unity and Unreal stronger | Aura3D does not yet have comparable import settings, platform build targets, content pipeline UI, asset database behavior, or large third-party asset workflows. |
| Profiling/debugging/tooling | Unity and Unreal stronger | Aura3D has diagnostics and validation reports, not mature engine profilers, visual debugging tools, or editor-integrated optimization workflows. |
| Platform breadth | Unity and Unreal stronger | This slice is web-focused. Unity and Unreal cover many native platforms and deployment targets outside this comparison scope. |
| Web runtime proof | Unsupported for broad replacement language | Current reports do not include full browser benchmark matrices, screenshot artifacts, exported app soak runs, or production project migrations. |

## Claim Boundary

The current evidence supports only this wording: Aura3D is an experimental TypeScript web 3D engine prototype with bounded browser-first examples and validation slices. It does not support describing Aura3D as Unity/Unreal for the web or as a replacement for either engine.

Any future claim must stay inside a named browser-first TypeScript workflow, cite the exact examples and browser/device evidence, and explicitly exclude native editor parity, platform breadth, asset-store scale, and mature production tooling.
