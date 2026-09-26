---
name: aura3d-threejs-migration
description: Ports three.js code to Aura3D by picking the matching `three-compat-*` template, rewriting to `@aura3d/engine` public APIs, and recording every approximation from the `@aura3d/three-compat` ledger without drop-in claims. Use when porting three.js or R3F code, reading `THREE.*` imports, using `migrateThreeToA3D`, `ThreeCompatibilityMatrix`, or `ApproximationLedger`, or scaffolding any `three-compat-*` template.
---

# Aura3D three.js migration

Aura3D is not a three.js drop-in. The target of a migration is a route written
against `@aura3d/engine` public APIs; `@aura3d/three-compat` is an optional,
separately installed on-ramp with an honest record of what each shim does not
reproduce. Shared rules (claim labels, forbidden patterns, typed assets) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help`, and check the installed
   `@aura3d/engine` version. Name only exports you can see in its types.
2. Inventory the source: list every `three`, `three/examples/jsm/*`, and
   `three/addons/*` import, plus any `WebGLRenderer`, render loop, loader, and
   `EffectComposer` use. That list is the migration scope.
3. Read `src/aura-assets.ts`. Every GLB the old code loaded by URL must become
   a typed asset (load `aura3d-assets`).
4. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

1. Pick the closest template and scaffold it with
   `npx create-aura3d@latest <dir> --template <name>`:

   | Source code looks like | Template |
   | --- | --- |
   | Hand-rolled starter: renderer, ground, lit primitives | `three-compat-custom-threejs-migration` |
   | Product on a studio stage | `three-compat-premium-product-viewer` |
   | Room or interior built from boxes | `three-compat-architecture-interior` |
   | Single asset on an inspection stage | `three-compat-asset-inspector` |
   | Character on a pedestal | `three-compat-character-viewer` |
   | Material swatch row | `three-compat-material-authoring` |
   | Bloom or emissive post pass | `three-compat-postprocess-scene` |
   | Many repeated meshes | `three-compat-large-scene` |

   All eight templates import only `@aura3d/engine`. Keep it that way.
2. Map each construct to the engine API. `createAuraApp` owns the renderer,
   scene graph, camera, and frame loop, so delete them rather than port them.

   | three.js | Aura3D |
   | --- | --- |
   | `WebGLRenderer` plus a render loop | `createAuraApp("#app", { scene })` |
   | `new Scene()` | `scene()` |
   | `PerspectiveCamera` | `camera.perspective(...)` or `camera.orbit(...)` |
   | `OrbitControls` | `interactions.orbit(...)` |
   | Lights | `lights.*` |
   | `MeshStandardMaterial` and friends | `material.*` |
   | Mesh plus a glTF loader | `model(assets.x)` |
   | Box, sphere, plane geometry (set dressing) | `primitives.*` |
   | `EffectComposer` bloom | `effects.bloom(...)` |

3. When the port must stay three-shaped for a while, run the codemod in a
   Node script and keep its output as a report, not as proof:
   `migrateThreeToA3D(source)` returns `code`, `rewrittenImports`, and
   `warnings`. Imports in `THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS`
   (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, and others) are left
   unchanged with a `postprocessing-unsupported` warning. Treat that as a
   manual rewrite to `effects.*`, never as a pass.
4. Look up coverage in two places and trust the stricter one.
   `buildInitialCompatibilityMatrix(buildThreeApiInventory(version, names))`
   gives a coarse status per export (`supported`, `partial`, `planned`,
   `blocked`, `out-of-scope`). `WebGLRenderer` is `blocked`. The matrix can
   say `partial` where the import map says unsupported, so it is a triage
   list, not evidence.
5. For every compat shim you keep, read its ledger row with
   `getApproximationLedgerRow(shim)`: `fidelity` (`faithful`,
   `approximation`, `diagnostic-only`), `behavior`, `deltaVsR185`, and
   `upgradePath`. Copy each kept shim's row into the migration notes.
   `listApproximationShims()` lists every shim with a row.
6. Prefer the ledger's `upgradePath` over keeping the shim. For example,
   `MeshPhongMaterialCompat` renders GGX specular, not Blinn-Phong; its
   upgrade path is a native `material.*` preset.
7. Keep `three` out of the engine route. Only a separate compat entry point
   may depend on `@aura3d/three-compat` and `three`. The shipped route must
   pass `aura3d check-deploy --dist dist --source`.
8. Write the migration notes: each supported API by name with the test that
   covers it, each approximation with its ledger row, and each dropped or
   manually rewritten construct.
9. Build and verify: `npm run build`, then `npm run test` (the template's
   route-health and screenshot specs; run on CI or a remote worker), then
   `aura3d assets validate --source`. Hand claim wording to
   `aura3d-evidence-review`.

## Stop and report

- The source depends on something with no engine equivalent (custom
  `ShaderMaterial` passes, render targets, `EffectComposer` chains, or a
  `blocked` matrix entry): stop and list each construct with its matrix
  status and ledger row. Do not fake it with CSS, a DOM overlay, or a CPU
  pixel pass, and do not route it through a compat shim that only records
  intent.
- A compat shim is `diagnostic-only`: it is not a rendering path. Label that
  part `prototype` or rewrite it natively.
- A kept shim has no ledger row: that is a ledger bug. Report it.
- The old code loaded a GLB by URL and no typed asset replaces it: stop and
  hand off to `aura3d-assets`. Never keep the URL or use `unsafeModelUrl`.
- Never write "drop-in", "full parity", or "100% three.js compatible". Name
  the specific supported API and the test that proves it.

## References

- [Migration guide and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/project/migration.md)
- [Approximation ledger source](https://github.com/auraoneai/aura3d/blob/main/packages/three-compat/src/ApproximationLedger.ts)
- [Compatibility matrix source](https://github.com/auraoneai/aura3d/blob/main/packages/three-compat/src/ThreeCompatibilityMatrix.ts)
- [Migration codemod and import map](https://github.com/auraoneai/aura3d/blob/main/packages/three-compat/src/migration/ImportMap.ts)
- [Ledger coverage test](https://github.com/auraoneai/aura3d/blob/main/tests/unit/three-compat/approximation-ledger-p1.test.ts)
- [Migration browser test](https://github.com/auraoneai/aura3d/blob/main/tests/browser/three-compat-threejs-migration.spec.ts)
- [Custom migration template](https://github.com/auraoneai/aura3d/blob/main/packages/create-aura3d/templates/three-compat-custom-threejs-migration/src/main.ts)
