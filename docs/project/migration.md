# Migration From Three.js

Version: 1.0.0

## Current Migration Surface

Migration support lives primarily in:

- `packages/three-compat/src/index.ts`
- `packages/three-compat/src/migration/`
- `packages/create-aura3d/templates/three-compat-custom-threejs-migration/`
- `packages/create-aura3d/templates/three-compat-asset-inspector/`
- `tests/unit/three-compat/`
- `tests/browser/three-compat-*.spec.ts`

## Supported Migration Shape

A3D can help migrate selected workflows:

- scene/object/material compatibility helpers;
- controls and loader-facing adapters;
- material/geometry compatibility tests;
- migration lab routes;
- current Three.js parity inventory/report generators.

## Not A Full Drop-In Replacement

The compatibility package does not make A3D a full runtime drop-in for every Three.js API, example, addon, shader chunk, loader, or renderer path. Migration docs should name the specific API or workflow that is supported and point to code/tests.

## Useful Commands

```sh
pnpm three-compat:migration
pnpm threejs-parity:migration-audit
pnpm threejs-parity:inventory
```

Migration wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
