# Galileo3D V4 Engine Readiness

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 is now governed by `docs/project/v4-engine-readiness-plan.md`.

The current product definition is:

> A TypeScript/WebGL rendering SDK for loading assets and producing clean, browser-based product/material/scene renders with sane defaults.

## Current Allowed Positioning

- TypeScript/WebGL rendering SDK.
- Asset-to-render pipeline.
- Product/material/scene rendering toolkit.
- Browser rendering foundation.
- Experimental editor/runtime foundation.
- Aspiring Three.js alternative for controlled product/material/asset-viewer workflows.

## Blocked Claims

- Unity replacement.
- Unreal replacement.
- Broad Three.js replacement.
- Babylon.js replacement.
- Production game engine.
- Full WebGPU engine.
- Full glTF implementation.
- Full PBR renderer.
- Full HDR renderer.
- Full shadow renderer.
- Full postprocess suite.

## Active Engine Readiness Documents

- `engine-readiness-status.md`
- `current-gap-audit.md`
- `master-code-checklist.md`
- `renderer-visual-quality-plan.md`
- `remaining-code-to-write.md`
- `decision-gates.md`
- `execute.md`

Other V4 documents may contain historical planning context, but they are not allowed to override the engine-readiness gates.

## Active Commands

```sh
pnpm engine-readiness:truth
pnpm engine-readiness:root
pnpm engine-readiness:assets
pnpm engine-readiness:examples
pnpm engine-readiness:package-smoke
```

## Evidence

- `tests/reports/engine-readiness-truth.json`
- `tests/reports/engine-readiness-canonical-scene/manifest.json`
- `tests/reports/engine-readiness-visual-quality.json`
- `tests/reports/engine-readiness-root-readiness.json`
- `tests/reports/engine-readiness-gltf-support.json`
- `tests/reports/engine-readiness-examples.json`
- `tests/reports/engine-readiness-package-smoke.json`
