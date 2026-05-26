# A3D Documentation Index

This index is the current entry point for project documentation. It replaces the old build-era rebuild PRD folder as the summary layer for what the repository is, what is implemented, what is still scoped, and which docs should be treated as current.

## Current Repo Shape

A3D is a production TypeScript-first browser 3D engine and workflow SDK. The repository contains first-party package code, route evidence, benchmarks, and V10 verification reports for a renderer stack that matches or exceeds Three.js in the measured graphics, animation, asset, physics, performance, and developer-workflow categories.

Current package areas include:

| Area | Current package or folder |
|---|---|
| Root SDK | `@aura3d/engine` |
| Runtime helpers | `@aura3d/engine-runtime` |
| Rendering | `@aura3d/rendering` |
| Assets and loaders | `@aura3d/assets` |
| Animation and skinning | `@aura3d/animation` |
| Scene graph | `@aura3d/scene` |
| Controls | `@aura3d/controls` |
| Materials and environments | `@aura3d/materials`, `@aura3d/environments` |
| Product workflows | `@aura3d/product-studio`, `@aura3d/workflows` |
| Editor/runtime systems | `@aura3d/editor-runtime`, `@aura3d/apps` |
| Supporting systems | `@aura3d/core`, `@aura3d/math`, `@aura3d/physics`, `@aura3d/input`, `@aura3d/audio`, `@aura3d/scripting`, `@aura3d/debug`, `@aura3d/three-compat` |

## Current Use Cases

The strongest current use cases are:

- Product visualization and configurators with opinionated scene setup.
- Asset viewers and glTF/GLB diagnostics.
- PBR, HDR, IBL, material, lighting, and environment preview workflows.
- Character preview, animation mixer workflows, skinning, morph targets, and IK diagnostics.
- Interactive browser scenes with picking, controls, decals, shadows, postprocessing, and route-level visual evidence.
- Migration and comparison work for teams evaluating how much custom Three.js code can move behind a A3D workflow API.

## Current Claim Position

A3D's public claim is evidence-scoped: it matches or exceeds Three.js in the categories measured by the V10 superiority audit. Broad statements outside the measured feature, visual, animation, physics, asset, performance, workflow, stability, and documentation categories must be backed by new reports before they are used.

Approved claim:

> A3D is a production TypeScript-first browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the A3D superiority audit.

## Current High-Signal Docs

| Purpose | Doc |
|---|---|
| Current repo entry point | `README.md` |
| Project doc map | `docs/project/documentation-index.md` |
| V10 superiority status | `docs/project/v10-superiority-status.md` |
| Current state | `docs/project/current-state.md` |
| Competitive positioning | `docs/project/competitive-positioning.md` |
| Go-to-market strategy | `docs/project/go-to-market-strategy.md` |
| Current implementation plan | `docs/project/implementation-plan.md` |
| Current audit | `docs/project/completion-audit.md` |
| Current verification summary | `docs/project/verification-evidence.md` |
| Trace summary | `docs/project/requirements-trace.md` |
| Historical progress summary | `docs/project/rebuild-progress.md` |

## Benchmark And Parity Evidence

Current evidence is report-driven. A route or report proves the category and behavior named by that report; new claims should extend the report suite before entering public copy.

Important report locations:

- `tests/reports/v10/superiority-audit.json`
- `tests/reports/v10/feature-parity.json`
- `tests/reports/v10/visual-quality.json`
- `tests/reports/v10/performance.json`
- `tests/reports/v10/animation-fidelity.json`
- `tests/reports/v10/physics-fidelity.json`
- `tests/reports/v10/memory-lifecycle.json`
- `tests/reports/v10/developer-workflow.json`
- `tests/reports/v10/claim-defense.json`
- `tests/reports/v9/threejs-inventory.json`

## Go-To-Market Direction

The GTM wedge is measured superiority for product teams that need production web 3D without assembling every renderer, asset, animation, physics, and diagnostics layer by hand:

1. Product viewer and configurator teams that want batteries-included rendering, lighting, camera, and asset defaults.
2. Teams with existing Three.js stacks that need diagnostics, repeatable screenshots, material review, glTF validation, and migration scaffolding.
3. Internal tools and commerce teams that care more about workflow reliability than raw graphics sandbox freedom.
4. Developer teams that want a TypeScript-first SDK with public package boundaries and route-backed evidence.

The buyer-facing message emphasizes faster workflow assembly, stronger diagnostics, safer asset/material defaults, and published parity/exceeds reports. The developer-facing message emphasizes first-party package surfaces, benchmark reports, migration compatibility, and clear claim-to-evidence links.

## Build-Era Docs Collapse

The old `docs/build/*.md` folder contained 26 generated rebuild PRDs and execution prompts:

- Rebuild overview, failure analysis, architecture principles, and target repository structure.
- Core, renderer, scene graph, ECS, physics, animation, materials, assets, input, camera, lighting, particles, audio, scripting, editor, debugging, examples, testing, and packaging PRDs.
- Implementation roadmap, file-by-file rebuild checklist, and six-agent execution prompt.

Those files were useful as initial scaffolding, but they are now historical compared with the package code, V9/V10 route evidence, and current project docs. Their useful summary is preserved here as historical context, and the detailed current state now lives in the V10 status docs and package/test/report evidence.

## Maintenance Rules

- Keep filenames lowercase kebab-case.
- Keep current docs under `docs/project/` unless a topic clearly belongs to a domain folder such as `docs/rendering/`, `docs/assets/`, `docs/benchmarks/`, or `docs/comparisons/`.
- Prefer fewer high-signal docs over generated document piles.
- Do not use generated reports as marketing copy.
- Keep public claims tied to `tests/reports/v10/claim-defense.json`.
