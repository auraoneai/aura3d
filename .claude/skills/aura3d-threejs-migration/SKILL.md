---
name: aura3d-threejs-migration
description: Ports three.js code to Aura3D by picking the matching migration template, rewriting to `@aura3d/engine` public APIs, and recording every approximation in the migration notes without drop-in claims. Use when porting three.js or R3F code, reading `THREE.*` imports, running the `aura3d migrate three` codemod (`migrateThreeToA3D`), or scaffolding a migration template (formerly `three-compat-*`).
---

# Aura3D three.js migration

Aura3D is not a three.js drop-in. The target of a migration is a route written
against `@aura3d/engine` public APIs. There is no installed compat shim
package — `@aura3d/three-compat` was deleted in 4.0.0 — so the migration
codemod plus an honest written record of what could not be reproduced is the
on-ramp. Shared rules (claim labels, forbidden patterns, typed assets) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Look target

The migration replaces a hand-tuned renderer stack with a look preset: the
target genre's recipe row maps `toneMapping`, `scene.environment`, exposure and
fog into `looks.preset(<id>)` + `looks.appOptions(<id>)`. Keep the original
lighting intent visible in the migration notes rather than porting raw
toneMapping constants.

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
   | Hand-rolled starter: renderer, ground, lit primitives | `custom-scene` |
   | Product on a studio stage | `premium-product-viewer` |
   | Room or interior built from boxes | `architecture-interior` |
   | Single asset on an inspection stage | `asset-inspector` |
   | Character on a pedestal | `character-viewer` |
   | Material swatch row | `material-authoring` |
   | Bloom or emissive post pass | `postprocess-scene` |
   | Many repeated meshes | `large-scene` |

   The former `three-compat-*` names scaffold the same templates through a
   deprecation alias (removed next minor). All eight templates import only
   `@aura3d/engine`. Keep it that way.
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

3. When the port must stay three-shaped for a while, run the CLI codemod
   and keep its output as a report, not as proof:
   `aura3d migrate three "src/**/*.ts" --report` walks each file and prints
   the per-construct verdicts; `--write` applies the rewrite in place. The
   underlying adapter `migrateThreeToA3D(source)` returns `code`,
   `rewrittenImports`, and `warnings`. Imports in `THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS`
   (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, and others) are left
   unchanged with a `postprocessing-unsupported` warning. Treat that as a
   manual rewrite to `effects.*`, never as a pass.
4. Triage coverage from the codemod's warning list, not a matrix: the
   import map `THREE_COMPAT_THREE_IMPORT_MAP` names every specifier the
   codemod rewrites; anything three-shaped it leaves alone shows up in
   `warnings` as `postprocessing-unsupported` or an unmapped import. Each
   warning is the work item — a manual rewrite to `effects.*` or
   `material.*`, never a pass.
5. There is no approximation ledger or compatibility matrix anymore — the
   `@aura3d/three-compat` package was deleted in 4.0.0. For every construct
   the codemod could not rewrite, record the approximation yourself in the
   migration notes: what the three.js API did, what the Aura3D replacement
   does, and the honest delta. For example, `MeshPhongMaterial`'s
   Blinn-Phong specular maps to a native `material.*` preset with GGX —
   write that delta down, do not imply equivalence.
6. Keep `three` out of the engine route. The shipped route must pass
   `aura3d check-deploy --dist dist --source`; a `three` import anywhere in
   the shipped tree fails the deploy check.
7. Write the migration notes: each supported API by name with the test that
   covers it, each codemod warning and how it was resolved, and each dropped
   or manually rewritten construct.
8. Build and verify: `npm run build`, then `npm run test` (the template's
   route-health and screenshot specs; run on CI or a remote worker), then
   `aura3d assets validate --source`. Hand claim wording to
   `aura3d-evidence-review`.

## Stop and report

- The source depends on something with no engine equivalent (custom
  `ShaderMaterial` passes, render targets, `EffectComposer` chains, or an
  import the codemod leaves unmapped): stop and list each construct with the
  codemod warning that flagged it. Do not fake it with CSS, a DOM overlay,
  or a CPU pixel pass.
- A kept construct renders only approximately: it is not parity. Label that
  part `prototype` or rewrite it natively.
- A codemod warning you cannot resolve: report it; do not silently keep the
  three.js shape.
- The old code loaded a GLB by URL and no typed asset replaces it: stop and
  hand off to `aura3d-assets`. Never keep the URL or use `unsafeModelUrl`.
- Never write "drop-in", "full parity", or "100% three.js compatible". Name
  the specific supported API and the test that proves it.

## References

- [Migration guide and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/project/migration.md)
- [Migration codemod adapter](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/ThreeToA3DAdapter.ts)
- [Codemod import map](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/ImportMap.ts)
- [Codemod warnings](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/CompatibilityWarnings.ts)
- [Codemod CLI command (`aura3d migrate three`)](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/commands/prd15/index.ts)
- [Custom migration template](https://github.com/auraoneai/aura3d/blob/main/packages/create-aura3d/templates/custom-scene/src/main.ts)
- [three.js lighting stack → Aura3D look](references/look-mapping.md)
