---
name: aura3d-threejs-migration
description: Brings a three.js project into Aura3D, the complete engine around the renderer, by picking the matching migration template, rewriting to `@aura3d/engine` public APIs with the `aura3d migrate three` codemod, and recording each manual rewrite in the migration notes. Use when porting three.js or R3F code, reading `THREE.*` imports, running the `aura3d migrate three` codemod (`migrateThreeToA3D`), or scaffolding a migration template (formerly `three-compat-*`).
---

# Aura3D three.js migration

A three.js project moves into a stronger engine here. three.js gives you a
renderer; Aura3D gives you the engine around it: one `@aura3d/engine` import,
a declarative `scene` API, `createAuraApp` owning renderer, camera, resize,
loop and disposal, WebGPU and WebGL2 from the same code, looks, effects,
physics, animation, game kits and typed, provenance-checked assets. A port
deletes plumbing and gains those features; the result is a native Aura3D route,
usually with fewer lines (24 vs 49 for the benchmark PBR viewer,
`evidence/vs-threejs/RESULTS.md`).

The on-ramp: the `aura3d migrate three` codemod, the migration templates,
`aura3d import-three` for procedural content, and notes on each manual
rewrite. Ports land on the native API, not a compatibility shim. Shared rules
are in [../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

First stop: [threejs-to-aura3d.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/threejs-to-aura3d.md), the table of three.js
idioms and the Aura3D line for each (type-checked), then the mapping below.
A port that loaded no GLB can use a procedural recipe from
[recipes.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/recipes.md) (recipes 8 to 15) as its starting scene.

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

3. Run the CLI codemod to get the mechanical rewrite and the worklist:
   `aura3d migrate three "src/**/*.ts"` walks each file and prints
   the per-construct verdicts (`--report` is accepted and is the default);
   `--write` saves the annotated rewrite in place. Treat the rewrite as a
   head start and finish it by hand: on the benchmark PBR viewer it emitted
   `const scene = scene()` and left `renderer.*` and `THREE.*` references
   for the manual pass. The verified 40-API mapping, measured codemod
   output and a before and after are in
   [docs/migration/from-threejs.md](https://github.com/auraoneai/aura3d/blob/main/docs/migration/from-threejs.md). The
   underlying adapter `migrateThreeToA3D(source)` returns `code`,
   `rewrittenImports`, and `warnings`. Imports in `THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS`
   (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, and others) are left
   unchanged with a `postprocessing-unsupported` warning: rewrite those as
   `effects.*` scene nodes, which replace the whole composer chain.
   Procedural three.js content (a scene factory that builds meshes, clips or
   simple shaders) can be carried as an asset instead of ported by hand:
   `aura3d import-three recipes/windmill.mjs --params '{"height":4.8}'` admits
   the GLB as `assets.windmill`, writes a regenerated `windmill.bridge.ts` (stable
   node ids, clips, simple `ShaderMaterial`s as `material.custom`) and a native
   `windmill.scene.ts` that is never overwritten, so edits keyed by stable id
   (`model({ hiddenNodeNames, nodeTransforms })`, added lights) survive a
   regeneration. Its `.report.md` lists what was carried, approximated and
   left out.
   Guide: [three-bridge.md](https://github.com/auraoneai/aura3d/blob/main/docs/agents/three-bridge.md).
4. Triage coverage from the codemod's warning list, not a matrix: the
   import map `THREE_COMPAT_THREE_IMPORT_MAP` names every specifier the
   codemod rewrites; anything three-shaped it leaves alone shows up in
   `warnings` as `postprocessing-unsupported` or an unmapped import. Each
   warning is a work item: rewrite it to `effects.*` or `material.*`.
5. For every construct you rewrote by hand, record it in the migration
   notes: what the three.js API did, what the Aura3D replacement does, and
   the visible difference. For example, `MeshPhongMaterial`'s Blinn-Phong
   specular maps to a native physically based `material.*` preset with GGX;
   note the shift in highlight shape.
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

- A construct has no direct engine counterpart yet (custom render targets,
  hand-built `EffectComposer` chains, or an import the codemod leaves
  unmapped): rebuild the intent with `effects.*`, `material.custom` or
  `material.node`, or list it with its codemod warning in the report. Build
  it in the engine, never with CSS, a DOM overlay or a CPU pixel pass.
- A construct you kept renders approximately: rewrite it natively, or label
  that part `prototype` until it matches.
- A codemod warning you cannot resolve: report it rather than keeping the
  three.js shape.
- The old code loaded a GLB by URL and no typed asset replaces it: hand off
  to `aura3d-assets`. Never keep the URL or use `unsafeModelUrl`.
- Describe the result as a port to Aura3D ("ported from three.js to
  Aura3D"), naming the supported APIs and the tests that cover them. The two
  APIs differ by design, so "drop-in", "full parity" and "100% three.js
  compatible" are the wrong words.

## References

- [Verified mapping, codemod limits, measured before and after](https://github.com/auraoneai/aura3d/blob/main/docs/migration/from-threejs.md)
- [Aura3D and three.js compared](https://github.com/auraoneai/aura3d/blob/main/docs/aura3d-vs-threejs.md)
- [Migration guide and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/project/migration.md)
- [Migration codemod adapter](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/ThreeToA3DAdapter.ts)
- [Codemod import map](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/ImportMap.ts)
- [Codemod warnings](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/migrate-three/CompatibilityWarnings.ts)
- [Codemod CLI command (`aura3d migrate three`)](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/commands/prd15/index.ts)
- [Custom migration template](https://github.com/auraoneai/aura3d/blob/main/packages/create-aura3d/templates/custom-scene/src/main.ts)
- [three.js lighting stack → Aura3D look](references/look-mapping.md)
