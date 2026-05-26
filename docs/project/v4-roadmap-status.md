# V4 Status

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Historical status: superseded by V9.

V4 was the visual-quality and productization reset. It exists as historical context because V3 proved workflow/package wiring but did not produce a developer-usable, high-quality product that is visually competitive with serious Three.js work. Current claim boundaries and parity status are tracked in `docs/project/v9-roadmap-claim-boundary.md` and `docs/project/v9-roadmap-status.md`.

V4 is not complete until:

- `pnpm v4:release` exists and passes.
- A packed `@aura3d/engine` package can be installed into a fresh external app.
- A developer can scaffold a V4 app through the create-aura3d path or repo-local equivalent.
- The external app can build for production, serve static output, render a flagship V4 scene, and capture a screenshot.
- Product, material, interior, asset, character, and interactive flagship scenes are visually credible.
- Same-scene Three.js comparisons exist for the flagship scenes.
- The screenshot gallery is human-inspectable.
- Known gaps and blocked claims remain explicit.

## Current Failure Being Addressed

The current V3 screenshots prove wiring and renderer execution, but they still read as simple procedural/test scenes. They are not enough to claim high-end PBR, HDR, IBL, complex glTF, production postprocess, or real Three.js-quality product depth.

## Blocked Claims

V4 does not currently prove:

- Broad Three.js replacement.
- Full Three.js API replacement.
- Unity replacement.
- Unreal replacement.
- Full game engine replacement.
- Full glTF ecosystem parity.
- Full WebGPU parity.
- Broad performance superiority.
- Full commercial DCC pipeline parity.
