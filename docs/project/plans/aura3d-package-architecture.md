# Aura3D package architecture and responsibility model

**Derived from:** `tests/reports/aura3d-product-inventory.json`
**Regenerate:** `node tools/product-remediation/build-product-inventory.mjs`

## Current state, measured

27 workspace packages, 113 apps, 36 examples. The problems are visible in the numbers.

### Overlapping ownership

**51 exported symbol names are owned by more than one package.** Not aliases: distinct
declarations of the same name in different packages, which means a consumer's behaviour
depends on which one it imported.

| Symbol | Owners | Reading |
| --- | --- | --- |
| `addVec3`, `EPSILON` | `@aura3d/physics`, `@aura3d/scene` | Two copies of vector maths that should live in `@aura3d/math` |
| `composeMat4` | `@aura3d/animation`, `@aura3d/scene` | As above |
| `Engine` | `@aura3d/core`, `@aura3d/engine-runtime` | Two things called the engine |
| `createA3DApp`, `A3D_APP_WORKFLOW_PRESETS` | `@aura3d/apps`, `@aura3d/engine-runtime` | `engine-runtime` re-declares rather than re-exports |
| `GLTFLoader` | `@aura3d/assets`, `@aura3d/engine-runtime` | As above |
| 8 `create*Workflow` factories | `@aura3d/engine-runtime`, `@aura3d/workflows` | Whole subsystem duplicated |
| `DragControls`, `FlyControls`, `FirstPersonControls` | `@aura3d/controls`, `@aura3d/input`, `@aura3d/three-compat` | Three homes for camera controls |

The dominant cause is `@aura3d/engine-runtime`: **322 exports, 50,358 lines, 0 test
files, 0 consumers.** It appears to be a superset barrel that re-declares much of the
rest of the workspace. It is the single largest source of duplicated ownership.

### Packages with no consumers

| Package | Exports | Lines | Tests | Reading |
| --- | --- | --- | --- | --- |
| `@aura3d/engine-runtime` | 322 | 50,358 | 0 | Duplicate surface; primary consolidation target |
| `@aura3d/three-compat` | 108 | 1,232 | 0 | Migration aid; consumed by `three-compat-*` fixture apps, not by product routes |
| `@aura3d/cli` | 44 | 8,787 | 0 | Consumed as a binary, not imported; the zero is an artefact of import-graph measurement |
| `create-aura3d` | 17 | 8,461 | 0 | As above |
| `@aura3d/environments` | 12 | 477 | 0 | Superseded by `environments` in the agent API |
| `@aura3d/materials` | 12 | 369 | 0 | Superseded by `material` in the agent API |
| `@aura3d/react` | 14 | 174 | 0 | Adapter with no example |
| `@aura3d/editor` | 0 | 2 | 0 | Empty |

### Test coverage by package

Only 8 of 27 packages have any package-level test files. `@aura3d/rendering` (493
exports, 55,752 lines) and `@aura3d/physics` (251 exports, 10,393 lines) have none. Their
behaviour is covered indirectly through `tests/unit` and browser suites, which is real
coverage but leaves no package-local contract.

### The agent API

`packages/engine/src/agent-api` is 74 files and 42,159 lines, with `index.ts` alone at
over 14,000. It is the public surface and the most-consumed code in the product, and it
mixes scene authoring, game kits, animation direction, video export, asset evidence and
two renderer implementations in one module.

## Proposed responsibility model

One owner per capability. The layering below is what the assignment names, mapped onto
the packages that exist.

| Layer | Owner | Currently |
| --- | --- | --- |
| **Foundation** — math, core types, lifecycle, events, scheduling, diagnostics | `@aura3d/math`, `@aura3d/core` | Vector/matrix maths duplicated into `physics`, `scene`, `animation`. `Engine` declared twice. |
| **Rendering** — renderer, geometry, materials, lighting, postprocess, GPU lifecycle | `@aura3d/rendering` | Correct owner. Also owns tone mapping, LOD and shader library, none of which reach the public API. |
| **Scene** — scene graph, transforms, cameras, serialisation | `@aura3d/scene` | Correct owner, but re-declares `addVec3`/`EPSILON`/`composeMat4`. |
| **Assets** — discovery, pull, cache, load, decode, normalise, provenance, admission | `@aura3d/assets`, `@aura3d/asset-index`, `@aura3d/aura3d-cli` | Coherent. `GLTFLoader` also declared in `engine-runtime`. |
| **Interaction** — picking, hover, selection, focus, drag, gizmos, labels, camera targeting | **`packages/engine/src/agent-api` (FocusSelection, WorldLabelRenderer)** and `@aura3d/controls` | Newly coherent for focus and labels. Camera controls still split three ways. |
| **Spatial layout** — asset-relative anchoring, semantic regions, distribution, invariants | **`packages/engine/src/agent-api/SpatialAnchoring.ts`** | New; sole owner. |
| **Simulation** — fixed timestep, physics, collision, constraints, character, vehicles, determinism | `@aura3d/physics` + **`VehicleChassis`, `VehicleDriverAi`** | Physics package is large and largely unconsumed by routes; the new vehicle systems live in the agent API because that is the surface routes use. This is a boundary to resolve, not a settled answer. |
| **Animation** — clips, state machines, blending, root motion, events, sync | `@aura3d/animation` | Correct owner; 19 consumers. Duplicates `composeMat4`. |
| **Game systems** — input, camera rigs, session lifecycle, objectives, AI, combat, racing, platforming | `agent-api/GameRuntime.ts`, `GameGenreKits.ts`, **`PlatformerMotion`, `CombatFrameData`** | Coherent but very large; `GameRuntime.ts` is 4,256 lines. |
| **Application kits** — configurator, digital twin, architecture, smart city, cinematic, product studio | `@aura3d/workflows`, `@aura3d/product-studio`, `@aura3d/apps` | Duplicated wholesale into `engine-runtime`. Routes do not consume these kits; they hand-build equivalents. **Open.** |
| **Developer tooling** — CLI, generation, inspectors, perf, probes, evidence, parity, docs | `@aura3d/aura3d-cli`, `create-aura3d`, `@aura3d/debug`, `tools/` | Coherent. |

## Recommended consolidations

Ordered by ratio of duplication removed to risk taken. None of these are performed in
this pass; they are breaking changes that need their own migration.

1. **Retire `@aura3d/engine-runtime` as a declaring package.** Convert it to a pure
   re-export barrel or delete it. Removes the large majority of the 51 duplicated
   symbols in one change. Zero consumers, so the blast radius is the published export
   map rather than any code in this tree.
2. **Move shared maths into `@aura3d/math`.** `addVec3`, `EPSILON`, `composeMat4` and
   friends have three homes. `math` has 9 consumers and 29 exports; it is the natural
   owner.
3. **Single owner for camera controls.** `@aura3d/controls` should own `DragControls`,
   `FlyControls` and `FirstPersonControls`; `@aura3d/input` should own input devices only;
   `@aura3d/three-compat` should re-export for migration rather than re-declare.
4. **Resolve one `Engine`.** `@aura3d/core` owns lifecycle; `engine-runtime`'s copy goes
   with item 1.
5. **Fold `@aura3d/environments` and `@aura3d/materials` into the agent API's
   `environments` and `material` namespaces,** which already supersede them and are what
   routes use, or delete them.
6. **Split the agent API by layer.** `index.ts` above 14,000 lines is the reason two
   renderer paths could disagree about whether labels render at all. The natural seams are
   already visible in the new modules: scene authoring, interaction, spatial layout,
   simulation, game kits, media export.
7. **Give `@aura3d/rendering` and `@aura3d/physics` package-local tests.** Between them
   they are 744 exports and 66,000 lines with no package-level contract.
8. **Delete or complete `@aura3d/editor`** (0 exports, 2 lines) and give `@aura3d/react` a
   public example or mark it experimental.

## Public export classification

Applying the assignment's classification to the surfaces this pass touched:

| Export | Implemented | Tested | Documented | Used | Stable | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `focusObject`, `focusSemanticRegion`, `focusCameraIntent`, `clearFocus` | yes | 26 unit cases | yes | 2 routes | yes | stable |
| `AURA_PRIMITIVE_AXES` | yes | yes | yes | documentation | yes | stable |
| `createWorldLabelLayer`, `projectWorldLabels`, `resolveLabelCollisions` | yes | 13 unit cases | yes | runtime-internal + 1 route | yes | stable |
| `placedBoundsFromAsset`, `resolveBoundsAnchor`, `resolveSemanticRegion`, `distributeInRegion`, `checkSpatialInvariants` | yes | 20 unit cases | yes | 2 routes | yes | stable |
| `createVehicleChassis`, `vehicleChassisSpecFromBounds` | yes | 15 unit cases | yes | 1 route | yes | stable |
| `createVehicleDriverAi` | yes | 16 unit cases | yes | 1 route | yes | stable |
| `solvePlatformerMotion`, `validatePlatformerMotion` | yes | 17 unit cases | yes | 1 route + level builder | yes | stable |
| `solveCombatFrameData`, `validateCombatFrameData`, `createCombatAi` | yes | 18 unit cases | yes | 1 route | yes | stable |
| `labels.callout` | **was misleading** | now yes | yes | 4 routes | yes | fixed — it declared a capability the production renderer did not have |
| `@aura3d/engine-runtime` (322 exports) | yes | no | no | no | unknown | **misleading**: duplicates other packages' surface |
| `@aura3d/editor` (0 exports) | no | no | no | no | n/a | **remove** |

## Dead code found

Recorded rather than removed, because removal is out of this pass's scope:

- `apps/aura-clash-showcase/src/fighters/HitboxSystem.ts` and
  `state/HitRegistry.ts`: a complete hit-resolution system with damage values and
  guard scaling that **nothing calls**. Combat runs through
  `playable/AuraClashArenaApp.ts` instead. Two hit models in one route, one of them
  unreachable, is how a route's real behaviour becomes hard to locate.
