# V8 Three.js Comparison

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Three.js is the competitor and reference baseline. It is not allowed as G3D runtime implementation code.

## Methodology

A valid V8 comparison must state:

- G3D route or harness path
- Three.js route or harness path
- asset identity
- environment identity
- camera setup
- backend
- material feature set
- frame timing
- screenshot paths
- metric deltas
- unsupported features

Same-scene comparison means the asset, camera intent, lighting environment, and material feature target are equivalent enough that deltas are meaningful. It does not mean fake pixel equality.

## Allowed Three.js Use

Allowed:

- isolated comparison harnesses
- benchmark scenes under clearly named Three.js paths
- competitor screenshots
- documentation references to Three.js behavior

Forbidden:

- importing `three` in G3D runtime packages
- using Three.js loaders, controls, materials, PMREM, animation mixer, postprocess, or renderer for G3D product output
- calling Three.js-rendered output a G3D screenshot

## Same-Scene Deltas

Reports must state exact deltas. Useful deltas include:

- load time
- first visible frame time
- draw calls
- frame count
- pixel metric differences
- unsupported material or animation features
- visual-review notes

Fake equality is not acceptable. If the G3D output is flatter, missing an extension, differently toned, or slower, the report must say so.

## Current Claim Boundary

Allowed now only when generated evidence exists:

- route-level parity progress for named examples
- same-scene comparison for named assets and environments
- specific material or animation feature support for named routes

Blocked until broader reports pass:

- full Three.js replacement
- full Three.js examples coverage
- broad ecosystem compatibility
- broad performance superiority
- full WebGPU parity

## Required Reports

The required V8 comparison report is `tests/reports/v8-threejs-parity.json`. It must be generated from code and must fail when comparison screenshots, assets, environments, or source-boundary checks are missing.
