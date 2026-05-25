# V3 Product Positioning

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


G3D is being built as a high-end TypeScript web 3D engine and workflow SDK for product-grade browser 3D surfaces.

The correct V3 positioning is:

> G3D competes with Three.js for supported product workflows where higher-level workflow APIs, renderer diagnostics, and app-ready scene construction matter more than raw low-level API breadth.

The supported workflows are asset viewing, product configuration, material review, scene showcase, and small interactive viewport slices. This is narrower than "G3D replaces Three.js" and much narrower than "G3D replaces Unity or Unreal."

## What Exists

- Workflow SDK: `packages/workflows`.
- Asset Lab: `apps/asset-lab`.
- Material Lab: `apps/material-lab`.
- Scene Lab: `apps/scene-lab`.
- Game Lab: `apps/game-lab`.
- Product Studio: `apps/product-studio`.
- V3 examples under `examples/*-v3`.
- External package consumer proof in `tests/reports/foundation-external-consumer.json`.
- Same-scene Three.js comparison in `tests/reports/foundation-threejs-comparison.json`.

## How To Talk About It

Allowed:

- "G3D is a Three.js competitor for the supported workflow surfaces verified by V3."
- "G3D provides higher-level workflow APIs for asset viewing, product configuration, material review, scene showcase, and interactive viewport slices."
- "The same-scene comparison shows lower setup-line counts for the tested workflows."

Not allowed:

- "G3D replaces Three.js."
- "G3D is broadly better than Three.js."
- "G3D replaces Unity or Unreal."
- "G3D has full glTF, WebGPU, PBR, or game-engine parity."

## Current Proof

The strongest proof is the chain of commands that builds source, runs browser apps, validates examples, installs the packed package into a temp app, and compares G3D with Three.js:

```sh
pnpm v3:apps
pnpm v3:examples
pnpm v3:package
pnpm v3:compare-threejs
```
