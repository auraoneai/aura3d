# V4 Engine Readiness Decision Gates

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Passing old V4 parity reports is not a release gate during the engine readiness. The only current gates are local, repo-owned engine-readiness commands.

## Gate 0: Truthful Repo State

Required command:

```sh
pnpm engine-readiness:truth
```

Required evidence:

- `tests/reports/engine-readiness-truth.json`
- `docs/project/v4-engine-readiness-status.md`
- `examples/_quarantine/README.md`

Allowed claim:

> Failed previous flagship examples are quarantined and no longer presented as public product demos.

## Gate 1: Canonical Renderer Viability

Required command:

```sh
pnpm engine-readiness:root
```

Required evidence:

- `tests/reports/engine-readiness-canonical-scene/canonical.png`
- `tests/reports/engine-readiness-canonical-scene/material-variant.png`
- `tests/reports/engine-readiness-canonical-scene/shadow-toggle.png`
- `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png`
- `tests/reports/engine-readiness-canonical-scene/manifest.json`
- `tests/reports/engine-readiness-visual-quality.json`
- `tests/reports/engine-readiness-root-readiness.json`

Allowed claim:

> G3D has one repo-local canonical WebGL2 product-rendering path with PBR materials, textures, sane lighting, shadows, camera framing, HDR target usage, and postprocess.

## Gate 2: Asset-To-Render SDK

Required command:

```sh
pnpm engine-readiness:assets
```

Required evidence:

- `tests/reports/engine-readiness-asset-ergonomics.json`
- `tests/reports/engine-readiness-gltf-support.json`

Allowed claim:

> G3D exposes a small asset-to-render API for supported local workflows.

## Gate 3: Public Demo Set

Required command:

```sh
pnpm engine-readiness:examples
```

Required evidence:

- `tests/reports/legacy-product-viewer/product-viewer.png`
- `tests/reports/legacy-material-studio/material-studio.png`
- `tests/reports/legacy-asset-viewer/asset-viewer.png`
- `tests/reports/legacy-rendering-showcase/rendering-showcase.png`
- `tests/reports/engine-readiness-examples.json`

Allowed claim:

> G3D has a minimal V1 public demo set backed by local screenshot tests.

## Gate 4: Package Viability

Required command:

```sh
pnpm engine-readiness:package-smoke
```

Required evidence:

- `tests/reports/engine-readiness-package-smoke.json`
- `tests/reports/engine-readiness-package-smoke/screenshot.png`

Allowed claim:

> The current package tarball can be installed and imported from a clean temporary project for the engine-readiness SDK surface.

## Still Disallowed

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
