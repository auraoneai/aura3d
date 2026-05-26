# PBR Rendering Comparison Evidence

Version: 0.1.0-alpha.0

This report records the bounded PBR evidence currently present in the repo. It should be read with the newer V6 and V9 visual parity reports, not as a standalone production PBR parity claim.

## Evidence

| Evidence | Local path | Meaning |
|---|---|---|
| Original PBR visual slice | `tests/reports/pbr-rendering-comparison.json` | One perspective-camera WebGL2 PBR scene rendered against a same-page Three.js reference. |
| Retained PBR PNGs | `tests/reports/pbr-material-lab-aura3d.png`, `tests/reports/pbr-material-lab-threejs.png`, `tests/reports/pbr-material-lab-diff.png` | Screenshot artifacts for the bounded PBR scene. |
| V6 material/product parity | `tests/reports/production-runtime-threejs-parity-readiness.json`, `tests/reports/production-runtime-threejs-parity/**` | Bounded same-scene material/product/asset comparisons against Three.js. |
| V9 material extension parity | `tests/reports/v9/loader-material-extensions-parity.json`, `tests/reports/v9/material-grid-parity.json`, `tests/reports/v9/physical-lights-parity.json` | Same-scene or same-generated-asset parity slices for material grids, material extensions, and physical light behavior. |
| V9 flagship viewer | `tests/reports/current-routes-threejs-parity.json`, `apps/flagship-viewer/**`, `tools/current-routes-threejs-parity/index.ts` | Product-viewer comparison with HDR environment, PMREM-style environment path, shadows, and actual Three.js baseline. |

## Claim Boundary

Allowed wording:

- A3D has bounded PBR and material-rendering evidence against same-page or actual Three.js references.
- A3D can render selected PBR/product/material comparison scenes with retained screenshots and metrics.

Blocked wording:

- full PBR parity;
- broad image-based-lighting parity;
- physically exact HDR environment parity;
- superior material quality;
- complete Three.js MeshPhysicalMaterial replacement;
- broad glTF material extension compatibility.

The current evidence still contains visible differences in several V9 parity slices. Those differences are useful QA data, not proof of visual equivalence.

## Regeneration

Original PBR slice:

```sh
pnpm exec playwright test tests/visual/pbr-environment-pixels.spec.ts
```

Broader visual suite:

```sh
pnpm test:visual
```

V9 parity gates are exposed through package scripts such as:

```sh
pnpm run v9:official-example-parity
pnpm run v9:visual-review
```
