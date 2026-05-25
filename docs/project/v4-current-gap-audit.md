# V4 Current Gap Audit

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Status date: 2026-05-14.

The engine readiness blocks all broad parity and replacement claims until repo-local evidence proves them. The current product target is a TypeScript/WebGL rendering SDK for controlled product, material, asset-viewer, and clean scene-rendering workflows.

## Current Evidence

- Root renderer gate: `pnpm engine-readiness:root`
- Canonical scene screenshots: `tests/reports/engine-readiness-canonical-scene/`
- Visual quality report: `tests/reports/engine-readiness-visual-quality.json`
- Root readiness report: `tests/reports/engine-readiness-root-readiness.json`
- Public example screenshots: `tests/reports/legacy-product-viewer/`, `tests/reports/legacy-material-studio/`, `tests/reports/legacy-asset-viewer/`, `tests/reports/legacy-rendering-showcase/`

## Blocked Claims

- Unity replacement
- Unreal replacement
- broad Three.js replacement
- Babylon.js replacement
- production game engine
- full WebGPU engine
- full glTF implementation
- full PBR renderer
- full HDR renderer
- full shadow renderer
- full postprocess suite

## Remaining Gaps

- The canonical scene is bounded product-rendering evidence, not broad engine parity.
- The glTF support matrix is scoped and generated under `tests/reports/engine-readiness-gltf-support.json`; partial rows remain blocked in public claims.
- The package smoke uses a fresh tarball install/import/build check and attaches the current canonical screenshot as package-smoke visual evidence. A future improvement should run the screenshot from inside the temporary package app.
- The V1 public examples are intentionally minimal and must not revive old parity language.

## Current Public Examples

Only these rebuilt examples are public during the engine readiness:

- `examples/legacy-product-viewer/`
- `examples/legacy-material-studio/`
- `examples/legacy-asset-viewer/`
- `examples/legacy-rendering-showcase/`

All previous flagship examples remain under `examples/_quarantine/`.
