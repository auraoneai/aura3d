# 13. Package architecture and public API audit

Branch: `aura3d-quality-rebuild/audit`. Date: 2026-10-05.
Method: read package manifests, tsconfig/vite resolution maps, the dist finalizer, the barrels, and
the renderer entry points. Ran tiny local Node scripts that use the repo's TypeScript 5.9.3 checker
(`ts.createProgram` + `getExportsOfModule`) to count exported symbols per entry, and a
`ts.preProcessFile`/AST module graph to measure reachability, cycles, and cross-package edges.
I did not run any browser, dev server, Vite build, or test suite. Every number below comes from
source on disk, not from the evidence/report files.

---

## 0. Bottom line

The package structure is not what decides the visual quality on its own. What it does is make the
renderer that actually draws the games impossible to find, and it lets "feature exists" be
mistaken for "feature reaches pixels." The specific problems:

1. **Too many renderers, and the games use only one of them.** The workspace has **at least 11
   renderer front-ends**: `Renderer`, `ProductionWebGL2Renderer`, `ProductionWebGPURenderer`,
   `ProductionRuntimeRenderer`, `CurrentRoutesInteractiveRenderer`, `AdvancedRenderer`,
   `LeanProductionRenderer`, `LeanProductRenderer`, two different classes both named `A3DRenderer`,
   and an inline raw-WebGL2 renderer inside `agent-api/index.ts`. They sit on two device
   implementations, `WebGL2Device` and a ~92% copy-fork `LeanWebGL2Device`. All 27 showcase
   games import only `@aura3d/engine` and use only the declarative `scene()/material/lights/effects`
   builders. Those builders reach pixels through one bridge buried in an **18,733-line**
   `packages/engine/src/agent-api/index.ts`. If that bridge throws, it **silently falls back** to
   the inline single-light WebGL shader.
2. **Most of the rendering package never reaches pixels.** `@aura3d/rendering` exports **1,506
   symbols (632 runtime values)**. The engine layer the games use imports **57 of those values
   (9%)**. **227 of 285 rendering files (43.6k of 73.2k lines, 60%)** are outside the closure of the
   production renderer (`ProductionRuntimeRenderer → ProductionWebGL2Renderer → Renderer`). Shadow
   cascades, SSR, CSM hysteresis, planar reflection, the octree, and LOD are exported, tested, and
   listed in feature lists, but they are not in the games' render path.
3. **The recommended "lean" entry drops lighting to meet the bundle budget.** `@aura3d/lean`
   `lights.directional()` and `environments.studio()` are no-op "intent" objects
   (`packages/lean/src/base.ts:252-259`, with arguments named `_options`, `_x`, `_y`, `_z`). The
   lean render source passes no lights, no environment, and no shadows. `create-aura3d`'s default
   `product-viewer` template and the `mini-game` template use this entry. The 77,458 B gzip
   "measured win" in README and BUNDLE_SIZES is bought by removing what makes modern images look
   modern.
4. **What the repo tests is not what npm ships.** In-repo, `@aura3d/engine` resolves to
   `packages/engine/src/index.ts`, which has **1,803 exports**. Published, `@aura3d/engine` "."
   resolves to `dist/engine/agent-api/index.js`, which has **1,726 exports**. **77 symbols**
   (`Renderer`, `GLTFLoader`, `createA3DApp`, `createEnvironment`, `workflows`, `A3DRenderer`, ...)
   exist only in the repo's view. Four checked-in templates import them from the root and would
   fail against the published package.
5. **`@aura3d/three-compat` is a shell.** It has 1,586 lines and **imports nothing from
   `@aura3d/rendering`**, even though its manifest declares it as a dependency.
   `MeshStandardMaterialCompat` is a two-field property bag, and the ledger still marks it
   "faithful". `migrateThreeToA3D` rewrites `new THREE.WebGLRenderer` to
   `createThreeCompatRenderer`, a function that **does not exist anywhere in the repo**. The 8
   `templates/three-compat-*` apps are **2-line files** with a side-effect import that a bundler
   drops because `sideEffects:false`. The 8 `create-aura3d` "three-compat" templates do not use
   three-compat at all.
6. **Process weight is greater than engine weight.** There are 560 root scripts, 454 `tools/`
   directories (208 named readiness/parity/proof/evidence/claim), and **108,184 lines of tooling**,
   which is more than `packages/rendering` (72.9k) or `packages/engine` (64.6k). About 7.5% of the
   root API (130 of 1,726 names) is evidence, report, diagnostic, or audit types. The architecture
   verifier checks that directories and script names exist, not what they do.

Recommendation in one line: collapse to **one renderer, one device, one scene representation, and
one public builder API**. Make `@aura3d/rendering` an internal implementation package with a small
curated surface. Delete three-compat, the lean light stubs, and the parity/evidence exports from
the runtime packages.

---

## 1. Inventory

### 1.1 Packages (source `.ts` lines excluding tests and `.d.ts`)

| Package dir | npm name | ver | private | exports entries | src lines | src files | index exported symbols (values/types) |
|---|---|---|---|---:|---:|---:|---|
| rendering | @aura3d/rendering | 3.0.1 | no | 6 | 72,910 | 285 | 1,506 (632/874) |
| engine | **@aura3d/engine-runtime** | **2.0.4** | **yes** | 4 | 64,603 | 140 | 1,803 (618/1,185) |
| assets | @aura3d/assets | 3.0.1 | no | 3 | 17,544 | 63 | 331 (107/224) |
| aura3d-cli | @aura3d/cli | 3.0.1 | no | 1 | 9,709 | 39 | 143 |
| create-aura3d | create-aura3d | 3.0.1 | no | 1 | 8,976 | 25 | 35 |
| animation | @aura3d/animation | 3.0.1 | no | 1 | 8,109 | 44 | 266 |
| editor-runtime | @aura3d/editor-runtime | 3.0.1 | no | 1 | 7,663 | 46 | 231 |
| physics | @aura3d/physics | 3.0.1 | no | 3 | 7,332 | 27 | 214 |
| scripting | @aura3d/scripting | 3.0.1 | no | 1 | 4,123 | 22 | 164 |
| asset-index | @aura3d/asset-index | 3.0.1 | no | 1 | 3,482 | 20 | 69 |
| controls | @aura3d/controls | 3.0.1 | no | 1 | 3,139 | 18 | 89 |
| input | @aura3d/input | 3.0.1 | no | 1 | 2,839 | 27 | 111 |
| audio | @aura3d/audio | 3.0.1 | no | 1 | 2,304 | 19 | 97 |
| scene | @aura3d/scene | 3.0.1 | no | 2 | 1,728 | 22 | 85 |
| three-compat | @aura3d/three-compat | 3.0.1 | no | 3 | 1,586 | 22 | 122 |
| ecs | @aura3d/ecs | 3.0.1 | no | 1 | 1,480 | 30 | 47 |
| lean | @aura3d/lean | 3.0.1 | no | 3 | 1,243 | 5 | 38 |
| math | @aura3d/math | 3.0.1 | no | 1 | 1,220 | 19 | 29 |
| core | @aura3d/core | 3.0.1 | no | 1 | 1,186 | 15 | 56 |
| workflows | @aura3d/workflows | 3.0.1 | no | 1 | 1,174 | 20 | 46 |
| debug | @aura3d/debug | 3.0.1 | no | 1 | 1,133 | 16 | 63 |
| materials | @aura3d/materials | 3.0.1 | no | 2 | 742 | 11 | 31 |
| product-studio | @aura3d/product-studio | 3.0.1 | no | 1 | 740 | 13 | 39 |
| physics-rapier | @aura3d/physics-rapier | 3.0.1 | no | 1 | 705 | 2 | 22 |
| react | @aura3d/react | 3.0.1 | no | 1 | 540 | 1 | 38 |
| environments | @aura3d/environments | 3.0.1 | no | 2 | 464 | 9 | **9 (2 values, both diagnostics)** |
| navigation-recast | @aura3d/navigation-recast | 3.0.1 | no | 1 | 317 | 1 | 16 |
| apps | @aura3d/apps | 3.0.1 | no | 1 | 162 | 1 | 10 |
| editor | @aura3d/editor | 3.0.1 | no | 1 | **1** | 1 | 231 (`export * from "@aura3d/editor-runtime"`) |

That is 29 packages. 28 manifests say "public", but only four are actually released
(`tools/aura3d106-published-cli-proof/index.ts:28`: `@aura3d/engine`, `@aura3d/cli`,
`@aura3d/asset-index`, `create-aura3d`). Everything else ships inside the **root** package
`@aura3d/engine`, whose `files` list contains `dist/<every package>`. I did not check the npm
registry, so I cannot say whether `@aura3d/lean`, `@aura3d/react`, or `@aura3d/three-compat` are
published separately. README:684 tells users to "install separately" `@aura3d/three-compat`, but
that package is **not** in the root `files` or `exports`.

### 1.2 The root package is the real product

`/package.json`: `name: "@aura3d/engine"`, `version 3.0.1`, **47 export subpaths**, **560
scripts**, `sideEffects:false`, 3 runtime deps (`@dimforge/rapier3d-compat`, `@loaders.gl/core`,
`@loaders.gl/textures`).

Export subpaths with the exported symbol count of each target file:

| Subpath | Target | Symbols |
|---|---|---:|
| `.` | dist/engine/agent-api/index.js | **1,726** |
| `./engine`, `./engine-runtime` (alias pair) | dist/engine/index.js | 1,803 |
| `./rendering` | dist/rendering/index.js | 1,506 |
| `./assets` | dist/assets/index.js | 331 |
| `./animation`, `./animation/browser` | | 266 / 259 |
| `./editor-runtime`, `./editor` (identical) | | 231 / 231 |
| `./rendering/production-runtime` | | 235 |
| `./assets/browser` | | 222 |
| `./physics` (+ `/solverless` 35, `/world` 9) | | 214 |
| `./scripting` | | 164 |
| `./rendering/advanced-runtime` | | 128 |
| `./production-runtime` | dist/engine/production-runtime | 111 |
| `./input` | | 111 |
| `./audio` | | 97 |
| `./controls` | | 89 |
| `./scene` (+ `/math` 30) | | 85 |
| `./media-node` | | 81 |
| `./lean-game` (deprecated) | | 71 |
| `./debug` | | 63 |
| `./core` | | 56 |
| `./ecs` | | 47 |
| `./workflows` | | 46 |
| `./advanced-runtime` | dist/engine/advanced-runtime | 40 |
| `./product-studio` | | 39 |
| `./lean`, `./lean-product` (deprecated) | | 38 / 38 |
| `./rendering/webgpu` | | 36 |
| `./create-aura3d` | | 35 |
| `./workflows/production`, `./workflows/production-runtime` (alias pair) | | 32 |
| `./materials` | | 31 |
| `./math` | | 29 |
| `./assets/asset-corpus`, `./assets/production-runtime` (alias pair, same file) | | 22 |
| `./scene-kits/product-viewer`, `/particle-fountain`, `/humanoid-walk` | | 15/11/10 |
| `./assets/advanced-gallery` | | 14 |
| `./assets/gltf-runtime` | | 12 |
| `./apps` | | 10 |
| `./environments` | | 9 |

Observations:
- **Four pairs of subpaths point at the same file**: `engine`/`engine-runtime`,
  `workflows/production`/`workflows/production-runtime`,
  `assets/asset-corpus`/`assets/production-runtime`, and `editor`/`editor-runtime`. The last is
  separate files, but `editor` is a one-line `export *`.
- Name collision in the subpaths: `./production-runtime` and `./advanced-runtime` each export a
  **different class named `A3DRenderer`**
  (`packages/engine/src/production-runtime/index.ts:175`,
  `packages/engine/src/advanced-runtime/A3DRenderer.ts:41`). `./engine` re-exports the
  advanced-runtime one (`packages/engine/src/index.ts`, `export { A3DRenderer, A3DScene,
  A3DAppLifecycle } from "./advanced-runtime/index.js"`).
- `dist/index.js` is listed in `files` but **no export condition points to it**. It is an
  unreachable 28-way `export *` aggregate written by `tools/finalize-dist/index.ts:62`.
- `./three-compat`, `./react`, `./cli`, `./navigation-recast`, and `./physics-rapier` have no
  export subpath, yet `dist/react`, `dist/navigation-recast`, and `dist/physics-rapier` are in
  `files`. They ship as dead bytes, or are reachable only through internal relative rewrites.

### 1.3 Comparison with three.js r185 (`node_modules/three@0.185.1`)

| | three r185 | Aura3D 3.0.1 |
|---|---|---|
| Packages | 1 (`three`) | 29 workspace packages, 1 published umbrella |
| Export subpaths | 8 (`.`, `./addons`, `./addons/*`, `./examples/jsm/*`, `./src/*`, `./webgpu`, `./tsl`, `./examples/fonts/*`) | 47 |
| Runtime exports from main entry | **441** (`build/three.module.js`) | **574 values + 1,152 types = 1,726** (root) |
| Renderers | `WebGLRenderer` (3,703 lines) + `WebGPURenderer` | 11+ front-ends, 2 WebGL2 devices (4,769 + 4,537 lines) |
| Shader assembly | one ShaderChunk library (110 chunks) shared by all materials | `ShaderLibrary`, `ShaderLibraryCore`, inline GLSL in `agent-api/index.ts:16255-16975`, WebGPU WGSL |
| Scene representation | `Object3D` graph | `@aura3d/scene` Scene, `A3DScene extends Scene`, agent-api `AuraSceneSnapshot` nodes, `@aura3d/ecs` World + `createECSRenderSource`, lean `AuraLeanSceneBuilder`, three-compat `Object3DCompat` (renders nothing) |
| `sideEffects` | `['./src/nodes/**/*']` | `false` everywhere, including a side-effect-only template import |

In three.js, every feature an example uses, such as `PMREMGenerator`, `CSM`, `EffectComposer`,
and `MeshPhysicalMaterial`, plugs into the one renderer the user already holds. In Aura3D the user
holds `createAuraApp`. Whether a feature reaches pixels depends on whether someone wired it by hand
into the 18.7k-line bridge.

---

## 2. The renderer-ownership problem (the architecture finding that most directly affects pixels)

### 2.1 Renderer front-ends

| Class / function | File:line | Wraps | Who uses it |
|---|---|---|---|
| `Renderer` | rendering/src/Renderer.ts:426 (3,152 lines) | `WebGL2Device` / `WebGPUDevice` | base of most of the others |
| `ProductionWebGL2Renderer` | rendering/src/production-runtime/ProductionWebGL2Renderer.ts:29 | `Renderer.create({backend:"webgl2"})` (:34-38) | `ProductionRuntimeRenderer` |
| `ProductionWebGPURenderer` | …/ProductionWebGPURenderer.ts:32 | WebGPU device | dynamic import (ProductionRuntimeRenderer.ts:71) |
| `ProductionRuntimeRenderer` | …/ProductionRuntimeRenderer.ts:31 | the two above | agent-api bridge, engine `A3DRenderer` (production) |
| `CurrentRoutesInteractiveRenderer` | rendering/src/threejs-example-parity/index.ts:43 | `ProductionRuntimeRenderer` | engine threejs-example-parity, 2 apps by deep relative import |
| `AdvancedRenderer` | rendering/src/advanced-runtime/AdvancedRenderer.ts:19 (73 lines, pure delegation) | `Renderer` | `./rendering/advanced-runtime` |
| `A3DRenderer` (#1) | engine/src/advanced-runtime/A3DRenderer.ts:41 | `Renderer` | `./advanced-runtime`, `./engine`, 31 app imports |
| `A3DRenderer` (#2) | engine/src/production-runtime/index.ts:175 | `ProductionRuntimeRenderer` | `./production-runtime` |
| `LeanProductionRenderer` | rendering/src/lean/LeanProductionRenderer.ts:29 | **`LeanWebGL2Device`** + one `ForwardPass`, no lights | `@aura3d/lean` primitives |
| `LeanProductRenderer` | rendering/src/lean/LeanProductRenderer.ts:17 | `Renderer` | `@aura3d/lean/product` |
| `createWebGLSceneRenderer` | engine/src/agent-api/index.ts:15982-~17000 | **raw `canvas.getContext("webgl2")`** (:15989), own GLSL (:16713-16975), own GLB parser (`parseGlb` :17018) | silent fallback for `createAuraApp` |

### 2.2 Device fork

`rendering/src/LeanWebGL2Device.ts` (4,537 lines) against `WebGL2Device.ts` (4,769 lines): after
whitespace normalization, `diff` reports only **346 differing lines**, so the fork is about 92%
identical. It was added in `efe051c0` ("release: complete Aura3D 3.0.1 parity contract",
2026-09-08). It exists only so the lean bundle-size target can pass. Any fix to the device's state
handling, color space, or MSAA now has to be made twice, or it drifts.

### 2.3 What the games actually run

All 27 `apps/showcase-*` plus `aura-clash-showcase`/`world-war-x-showcase` import
`@aura3d/engine` (only `aura-clash` also uses `scene`/`rendering`/`production-runtime` subpaths).
Across all showcase sources there are **132 distinct root symbols** in use, out of 1,726 (7.6%).
The top ones are `material`(54 files) `primitives`(50) `lights`(47) `model`(44) `camera`(40)
`scene`(40) `game`(39) `createAuraApp`(33) `effects`(33).

Those builders live in `agent-api/index.ts` (`primitives` :2207, `shadows` :2366, `material`
:2414, `lights` :3063, `effects` :3441, `environments` :4123). Frames come from
`createProductionSceneRenderer` (:12523):

```ts
const rendererSelection = normalizeCreateAppRendererOptions(rendererOptions);
if (rendererSelection.mode !== "production") {
  return await createWebGLSceneRenderer(canvas, snapshot, rendererOptions, [], runtimeNodes);
}
...
try {
  return await createProductionRuntimeSceneRenderer(canvas, snapshot, rendererOptions, runtimeNodes);
} catch (error) {
  return await createWebGLSceneRenderer(canvas, snapshot, rendererOptions, [
    `Production bridge failed and safe-basic fallback rendered instead: ...`
  ], runtimeNodes);
}
```

The default profile is `safe-basic` (:4312), which sets `rendererMode: "production"` (:4253). So
the production path is the default, but **any exception in a 13k-line bridge silently swaps in a
different renderer**. That renderer has one `u_lightDirection` uniform, no shadow maps, no IBL, and
`gl.disable(gl.CULL_FACE)` (:16010). The failure appears only as a warning string. Architecturally,
this means a game's look can change depending on whether an unrelated bridge path throws, and there
is no single place to fix "the renderer."

### 2.4 Rendering features versus the render path

Module-graph reachability, counting value imports only:

| Entry | Files reached | Lines reached | rendering files / lines |
|---|---:|---:|---|
| `@aura3d/engine` "." (agent-api/index.ts) | 615 | 168,954 | 270 / 63,727 (barrel pull-in) |
| `ProductionRuntimeRenderer.ts` (the real draw path) | 114 | 33,781 | **58 / 29,591** |
| `@aura3d/lean` | 95 | 19,514 | 36 / 14,772 |
| `@aura3d/lean/game` ("lean") | 386 | 91,659 | 273 / 68,373 |
| `rendering/src/index.ts` | 324 | 67,831 | 268 / 63,641 |

- **227 rendering files (43,604 lines)** are outside the production renderer's static closure.
  Some of them are pulled in by the agent-api for specific builders (water, day/night sky, SDF
  text, weather). Most are reachable only through the barrel.
- The engine (all 140 files) imports **57 runtime values** from `@aura3d/rendering`, which is the
  whole list the games can reach. `CascadedShadowMaps`, `ScreenSpaceReflectionPass`,
  `PlanarReflection`, `EffectComposer`, `BloomPass`, `ReflectionProbe`, `SpecularPrefilter`, and
  `TerrainTiles` are **not** among them.
- **87 rendering files are imported only by the barrel**. For **31 of them (4,928 lines)**, no
  exported value name appears anywhere in any other package, app, example, or template:
  `RendererVisualPipelineReport.ts` (843), `PbrReference.ts` (842), `PrimitiveSubmissionAudit.ts`
  (460), `ReflectionSurfaces.ts` (358), `VegetationScatter.ts` (315), `VoxelWorld.ts` (275),
  `shadows/CascadeHysteresis.ts` (146), `ScreenSpaceReflectionPass.ts` (78),
  `performance/{LOD,Octree,FrustumCuller,RendererStats,ResourceBudget}.ts`, `UniformBinder.ts`,
  `webgpu/WebGPUPipelineCache.ts`, and others. The full list is reproducible with the method in §9.
- Examples of names that overstate what the code does:
  - `performance/Octree.ts`: `createFlatOctree(bounds, items) { return { bounds, items }; }`. It is
    not an octree.
  - `performance/FrustumCuller.ts`: a 10-line `items.filter(intersectsBox)` that nothing calls.
  - `ScreenSpaceReflectionPass.ts:41`: throws unless the device implements
    `executeReflectionSurfaceSsr`, and no caller exists.

**Grade: rendering-package features.** exists ✓ / technically works: partial / public API ✓ (1,506
symbols) / used by generated apps: **mostly no (9% of values)** / good defaults: n/a / composes:
**no single composition point** / agents know to use: no, because they are not reachable from the
builder API / examples demonstrate: examples import `@aura3d/rendering` directly (21 imports), but
games never do.

---

## 3. The "lean" entries: how the bundle-size win was achieved

The MIGRATION-2.0.md table recommends `@aura3d/lean`, `@aura3d/lean/product`, and
`@aura3d/lean/game` for new applications, and BUNDLE_SIZES.md reports the 77,458 B gzip pass.

`packages/lean/src/base.ts`:

```ts
export const lights = {
  directional: (_options: { readonly intensity?: number } = {}) => ({
    ...intent("light"),
    position: (_x: number, _y: number, _z: number): AuraLeanIntentSpec => intent("light")
  })
} as const;
export const environments = { studio: (): AuraLeanIntentSpec => intent("environment") } as const;
export const interactions = { orbit: (): AuraLeanIntentSpec => intent("interaction") } as const;
```

- `material.pbr(options)` returns `options` unchanged (:212). The spec has only
  color/roughness/metal/clearcoat.
- The frame source is `{ collectRenderItems: () => items, cameraPolicy: "require" }` (:396), with
  no `collectedLights`, no `environmentLighting`, and no shadows.
- Primitive path: `LeanProductionRenderer.renderInteractiveFrame` builds
  `new ForwardPass({ items, cameraViewProjectionMatrix, shaderLibrary })` with **no lights**
  (LeanProductionRenderer.ts:53-60). `ForwardPass` packs `this.options.lights ?? []`
  (ForwardPass.ts:358), so PBR primitives are shaded with zero direct lights.
- Product path: `LeanProductRenderer` calls `Renderer.render(source)`. `collectRenderLights`
  (Renderer.ts:3079-3081) then injects a fixed two-directional default rig with
  `castsShadow: false` (:3086-3110). The user's `environments.studio()` does nothing.
- Users: `create-aura3d/templates/product-viewer/src/main.ts` (the **default** template, since
  `options.template ?? "product-viewer"`) and `mini-game` use `@aura3d/lean/*`. The product-viewer
  template adds `environments.studio()` and a "carPaint" clearcoat plinth. In this entry the
  environment call is a no-op, and the in-file comment admits that transmission "lives in the full
  engine API."
- `@aura3d/lean/game` is not lean: it reaches 273 rendering files and 68k lines.

**Visual consequence:** a new user's first scene has no IBL, no shadows, and fixed default lights,
and every lighting call they write is silently ignored. That matches the "early-console" look the
owner describes. **Grade:** exists ✓ / works as a draw path ✓ / public API ✓ / used by default
templates ✓ / good defaults ✗ / composes ✗ (API accepts lights and drops them) / modern quality ✗.

---

## 4. Resolution maps: four sources of truth for one specifier

| Specifier | `tsconfig.base.json` paths | `vite.config.ts` alias | published `package.json` exports |
|---|---|---|---|
| `@aura3d/engine` | packages/engine/src/index.ts (1,803 exports) | packages/engine/src/index.ts (vite.config.ts:47) | dist/engine/**agent-api/index.js** (1,726) |
| `@aura3d/materials` | packages/materials/src/index.ts | packages/materials/src/**browser-index.ts** (:46) | root `./materials` → dist/materials/index.js |
| `@aura3d/engine/engine` | packages/engine/src/index.ts | same | dist/engine/index.js |

There is also a fifth layer. `tools/finalize-dist/index.ts` rewrites emitted specifiers with
regular expressions (:99-153), and it has a special case that redirects `@aura3d/animation`
imports under `dist/assets/` to `browser-index.js` (:148-150). There is a sixth layer too: a
separate `tsconfig.browser-301.json` repeats the whole paths map by hand.

**Consequence (verified):** 77 names exist in `packages/engine/src/index.ts` and not in the
published "." entry. Examples: `Renderer`, `Engine`, `GLTFLoader`, `createA3DApp`,
`createEnvironment`, `workflows`, `createDiagnosticsPanel`, `loadProductAsset`, `A3DRenderer`,
`createECSRenderSource`, `captureScreenshot`, `createResourceManager`. These templates import
them from `"@aura3d/engine"`:

- `templates/external-parity-asset-gallery/src/main.ts:1` (`createAssetDiagnostics,
  createDiagnosticsPanel, createEnvironment, createA3DApp, workflows`)
- `templates/external-parity-interactive-scene`, `templates/external-parity-material-studio`, and
  one more `external-parity-*` template.

Their `package.json` depends on `"@aura3d/engine": "3.0.1"`. `rg -c createA3DApp` against
`dist/engine/agent-api/index.d.ts` and `.js` returns 0. These templates type-check and run in the
monorepo through path aliases and would break when installed from npm. Repo tests cannot catch this
class of bug because they resolve the specifier differently from consumers.

---

## 5. Duplicate export ownership

README:209-210 admits: "`@aura3d/engine-runtime` still declares 322 exports duplicating other
packages; 51 exported symbol names have more than one owning package."

My measurement, using the TypeScript checker on each package's `src/index.ts`:
- **5,534** unique exported names across all package indexes.
- **397** names are exported by more than one package index.
- **53** names are exported by more than one package with **different declarations**:

| Name | Owners (declaration files) |
|---|---|
| `Vec3` | animation/Keyframe.ts, engine/agent-api/SceneGroundingUtils.ts, physics/Shape.ts, rendering/PbrReference.ts, scene/MathTypes.ts (**5 different types**) |
| `Quat` | animation/Keyframe.ts, physics/RigidBody.ts, scene/MathTypes.ts |
| `Mat4`, `identityMat4`, `composeMat4`, `multiplyMat4`, `normalizeQuat` | animation/Keyframe.ts vs scene/MathTypes.ts (**math reimplemented in animation**) |
| `vec3`, `addVec3`, `subVec3`, `scaleVec3`, `lengthVec3`, `normalizeVec3`, `EPSILON` | physics/Shape.ts vs scene/MathTypes.ts (again in physics), with `@aura3d/math` as a third owner of vector math |
| `OrbitControls`, `FirstPersonControls`, `PointerLockControls` | **controls/src/** and **input/src/controls/** (two implementations) |
| `AnimationController` | animation/AnimationController.ts vs engine/agent-api/AnimationController.ts (3,368 lines) |
| `createAuraApp`, `scene`, `model`, `material`, `lights`, `camera`, `primitives`, `environments`, `interactions`, `defineAuraAssets` | engine/agent-api/index.ts vs lean/base.ts (**same API names, different semantics**; see §3) |
| `Scene`, `Camera` | react/index.ts vs scene/ |
| `RaycastHit` | physics/Raycast.ts vs rendering/Raycaster.ts |
| `Bounds3` | rendering/Geometry.ts vs scene/Bounds.ts |
| `LoopMode` | animation/AnimationAction.ts vs core/EngineLoop.ts |
| `SystemPhase` | core/Scheduler.ts vs ecs/System.ts |
| `LightKind` | ecs/LightComponent.ts vs scene/Light.ts |
| `TextureMipLevel` | assets/TexturePipeline.ts vs rendering/Texture.ts |
| `inspectAsset`, `createCharacterAssemblyPlan` | aura3d-cli vs engine |

The unreachable `dist/index.js` does `export *` across all 28 public packages. By my count, **31
names would be ambiguous**, and ES modules silently drop ambiguous star exports. That includes
`Vec3`, `OrbitControls`, `Scene`, and `Camera`.

The `engine` package re-exports **25 animation, 24 rendering, 9 apps, 9 assets, 8 physics, 7
audio, 7 workflows, 4 input, and 3 scripting** symbols. The other 1,704 names are declared inside
`packages/engine/src` itself, almost all of them in `agent-api/` (107 files, 56,995 lines). The
engine is a second monolith, not a façade.

---

## 6. Scene representations and parallel subsystems

| Concern | Parallel implementations |
|---|---|
| Scene graph | `@aura3d/scene` `Scene`; `A3DScene extends Scene` (engine/advanced-runtime/A3DScene.ts:17); agent-api `AuraSceneSnapshot` nodes (what games author); `@aura3d/ecs` `World` + `engine/src/ecs` `createECSRenderSource`; lean `AuraLeanSceneBuilder`; three-compat `Object3DCompat`/`SceneCompat` (8 lines, renders nothing) |
| glTF/GLB parsing | assets/GLTFLoader.ts (GLB chunk :3375); agent-api `parseGlb`/`loadGltfForWebGL` (index.ts:17002-17030); assets/asset-corpus/ProductionAssetCorpus.ts; assets/AdvancedAssetCorpus.ts; create-aura3d showcase extractor; 4 more in animation-studio template scripts |
| Material presets | agent-api `material.*` (:2414); rendering/MaterialPresets.ts; rendering/cinematic/CinematicMaterialPresets.ts; rendering/ArchitecturalMaterialCatalog.ts; rendering/animation/AnimationMaterialStyle.ts; `@aura3d/materials` (GameReady + ThreeCompat PBR libraries, **used by no app, template, or engine file**) |
| Controls | `@aura3d/controls` and `@aura3d/input/controls`, with three-compat re-exporting the former |
| Math | `@aura3d/math` (Vector3/Box3 classes), `@aura3d/scene/math` (tuple functions), animation/Keyframe.ts, physics/Shape.ts |
| Shaders | rendering ShaderLibrary + ShaderLibraryCore (lean), WebGPU WGSL, inline GLSL in agent-api fallback |

`@aura3d/environments` is a public subpath. Its index exports two values,
`createThreeCompatPMREMDiagnostics` (which multiplies face size by mip count to estimate bytes)
and `createThreeCompatEnvironmentProbePreviews`. **It contains no environment.**
`@aura3d/materials` exports a `NodeMaterial` (via `node.ts`) that is a list of
`{id,type}` with `toShaderKey()` returning a string. It generates no shader and is not comparable
to three's TSL `NodeMaterial`.

---

## 7. `@aura3d/three-compat`: the compatibility layer audited

- `packages/three-compat/package.json` declares `@aura3d/rendering`, but the module graph shows
  **zero imports from rendering**. Its only workspace edges are animation (1), controls (1), and
  debug (1).
- `materials/index.ts`:
  `class MeshStandardMaterialCompat extends MaterialCompat { type = "MeshStandardMaterial"; roughness = 0.5; metalness = 0; }`.
  It holds no maps, no envMap, and no normalMap, and has no path to any renderer.
  `ApproximationLedger.ts` rates it **"faithful … maps onto the C1-promoted textured-PBR path"**.
  No code anywhere does that mapping.
- The ledger has 26 rows: 16 "faithful", 7 "approximation", 3 "diagnostic-only". "Faithful" is
  given to things that by their own description make "no rendering claim" (Object3DCompat,
  SceneCompat, CameraCompat, LightCompat).
- Geometries "generate NO vertex attributes" (ledger row). Loaders are "diagnostic-only" and return
  metadata. `WebGLRenderTargetCompat` "allocates NO GPU resource".
- `migration/ThreeToA3DAdapter.ts:18`:
  `code.replaceAll("new THREE.WebGLRenderer", "createThreeCompatRenderer")`. `rg` finds
  `createThreeCompatRenderer` only in this line and in a warning message. **The migration target
  does not exist.** The import map rewrites `three` → `@aura3d/three-compat`, which has no
  renderer, so migrated code cannot draw.
- Templates:
  - `templates/three-compat-*` (8 directories): each `src/main.ts` is 2 lines, for example
    `import "@aura3d/engine/rendering"; document.body.dataset.a3dTemplate = "…";`. With root
    `sideEffects:false`, a bundler is allowed to drop that import, so the page is blank. They have
    been stubs since they were created (`336dd1ca`, 2026-05-25).
  - `packages/create-aura3d/templates/three-compat-*` (8, 19-36 lines): plain `@aura3d/engine`
    `primitives/material/lights` scenes. They **never import three-compat**. "three-compat" is
    only a label.

**Grade: three-compat.** exists ✓ / technically works ✗ (no draw path) / public API ✓ / used by
generated apps ✗ / composes ✗ / modern quality ✗. This is a fake-parity surface.

---

## 8. Build, tsconfig, and committed artifacts

### 8.1 Build pipeline
`build:raw` = `tsc -p tsconfig.build.json && node tools/finalize-dist/index.ts`.
- `tsconfig.build.json` sets `rootDir "."`, `outDir "dist"`, and includes `packages/*/src`,
  `tests/**`, `tools/**`, and the vitest/playwright/eslint configs. **Tests and tools compile into
  the same dist as the shipped library.**
- `finalize-dist` copies `dist/packages/<p>/src` to both `dist/<p>` (root package) and
  `packages/<p>/dist` (per package). It rewrites specifiers with regular expressions and writes
  `dist/index.js` (unreachable, see §1.2).
- `tsconfig.base.json` sets `declaration`, `declarationMap`, and `sourceMap`, with **no `outDir`
  and no `noEmit`**. Any `tsc -p tsconfig.base.json` or ad-hoc `tsc file.ts` against it emits
  `.js/.d.ts/.map` next to the sources.
- 10 packages have their own `tsconfig.json` with independently drifting options (for example,
  rendering's sets `noEmit`, excludes `src/effects/**`, and maps only scene/math/core).

### 8.2 The `.js.map`/`.d.ts.map` files inside `src/`
- **1,194 orphan map files** sit in `packages/*/src`: rendering 490, engine 180, assets 120,
  animation 82, ecs 60, physics 50, scene 44, workflows 40, math 38, audio 32, core 30,
  product-studio 24, apps 2, physics-rapier 2.
- **None are tracked by git** (`git ls-files` = 0). They are ignored by `.gitignore:31-32`
  (`*.js.map`, `*.d.ts.map`).
- **There is no matching `.js` or `.d.ts` file** (0 found). Example:
  `packages/rendering/src/BRDFLut.js.map` has `"file":"BRDFLut.js","sources":["BRDFLut.ts"]`, and
  the `.js` is absent.
- **All 1,194 have mtime 2026-08-23 16:55**, a single event during the 2026-08-23/24 "complete
  game portfolio rebuilds" window (`54fd1101`).
- Most likely cause: an in-place emit (tsc against a config without `outDir`, which
  `tsconfig.base.json` allows), followed by `git clean -fd` without `-x`. That command deletes
  untracked, non-ignored `.js/.d.ts` files and leaves the gitignored `.map` files. The set of
  packages matches a single entry's import closure (it does not include editor-runtime, scripting,
  input, or navigation-recast). This is inference, not proof.
- Impact: no pixel impact, and not shipped. It is clutter that fools `ls`/`rg --no-ignore`, and
  `tools/verify-source-cleanliness` does not check `.map`. The fix is
  `git clean -fX packages/*/src` (dry-run first) plus `noEmit: true` in `tsconfig.base.json`.

### 8.3 Repo-root hygiene (context)
The root contains ad-hoc probe scripts (`rooftop-*.mts` ×10, `siege-*.ts` ×5,
`courier-diag*.tmp.mjs`, `vb-lane-probe.ts`, `scratch-site5.mts`), PNG debug shots, a file named
`[{"down":"Space"},…]`, and UUID-named `.txt` files. These signal agent sessions working by
trial-and-error probing at the repo root.

---

## 9. Dependencies, cycles, and boundaries

Cross-package value-import graph (number of import edges in parentheses):

- `engine` → rendering(27) scene(11) assets(9) physics(8) animation(5) apps(3) lean(3) + 10 more
- `create-aura3d` → **engine(45)** animation(4) lean(4) rendering(2) scene(1) asset-index(1)
- `rendering` → scene(12) math(4)
- `three-compat` → animation, controls, debug (**not rendering**)

Declared vs actual dependencies:

| Package | Imported but undeclared | Declared but unused |
|---|---|---|
| create-aura3d | engine, animation, rendering, scene, lean | - |
| engine (`@aura3d/engine-runtime`) | environments | - |
| debug | - | animation |
| editor-runtime | - | animation, scene |
| three-compat | - | **rendering** |

Cycles:
- Package level: **no 2-cycles**. The tier ordering in `docs/architecture/package-graph.dot`
  holds.
- File level, value imports: **4 SCCs**.
  - `engine/agent-api/Decals.ts ↔ agent-api/index.ts`: the 18.7k-line barrel is imported back by
    a leaf.
  - `rendering/ShaderReflection.ts ↔ RenderDevice.ts`.
  - `ecs/System ↔ SystemScheduler ↔ World`.
  - `aura3d-cli/index ↔ meshy/import ↔ pull-bridge ↔ asset-screening-effects`.

Boundary violations: `packages/engine/src/threejs-example-parity/{index,FlagshipFoundation}.ts`
contain **25 cross-package relative imports** (`../../../rendering/src/Geometry`,
`../../../assets/src/CarConceptMaterialStability`, …). `apps/flagship-viewer`, `apps/wow-common`,
and `apps/advanced-examples-gallery` import `../../../packages/engine/src/...` (6 imports). These
paths only work in the monorepo. `finalize-dist` rewrites only `/src/index.js`-shaped and
`@aura3d/*` specifiers, so these would break after relocation if they were ever exported.

Barrels: `rendering/src/index.ts` (1,194 lines, 43 `export *`), `engine/src/agent-api/index.ts`
(74 `export *` plus about 330 named export statements and 18k lines of implementation), and
`engine/src/index.ts` (9 `export *`). Combined with `sideEffects:false` this can still tree-shake,
but BUNDLE_SIZES.md reports that the root "." critical path is **2,147,423 B raw / 575,343 B gzip**
against an 80,000 B budget. That is 7.2× over, and the result is labeled "informational". The
"one cube" path is light only because of the lights-free lean entry (§3).

Reproduction scripts (written to `/tmp/a3dexp/`, not committed): TS-checker export counter over
every root subpath and package index, a module-graph builder (Tarjan SCC + reachability + barrel-only
detection), and a showcase import tally.

---

## 10. Legacy, migration, and naming layers

- **MIGRATION-2.0.md** (195 lines) recommends `@aura3d/lean*`, which is the lighting-free path
  (§3). It deprecates `@aura3d/engine/lean*`, but `agent-api/lean.ts` is just
  `/** @deprecated */ export * from "@aura3d/lean"`, so both specifiers resolve to identical code.
  Codemod: `pnpm migrate:2.0`, which only rewrites specifiers.
- Naming families coexist in the exports:
  - Root "." has `Aura*` 336, evidence/report/diagnostic/proof/audit/claim 130.
  - `rendering` has **`ExternalParity*` 83**, `Production*` 49, evidence/report 86, `A3D*` 5.
  - `engine/src/index` has `A3D*` 23 alongside `Aura*` 348.
  - Names like `CurrentRoutesInteractiveRenderer`, `summarizeProductionProductionProof`,
    `RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES`, and `createExternalParityEnvironmentPipeline` encode
    past PRD workstreams in the public API. An agent cannot tell from the name which of these is
    the real renderer.
- The version skew shows the history: packages/engine is `2.0.4` and private while every other
  package is `3.0.1`. The directory named `engine` is **not** the package named `@aura3d/engine`.

---

## 11. Evidence/process weight (bucket G)

- 560 root scripts. Every primary command is wrapped (`build` = `evidence:command --id build --out
  tests/reports/... -- pnpm build:raw`).
- `tools/`: 454 directories, **108,184 lines**, 208 named readiness/parity/proof/evidence/claim.
  `tests/`: 1,319 `.ts` files.
- `tools/verify-architecture/index.ts` (395 lines) checks that 29 package dirs, 13 tool dirs, and
  20 script names **exist**. It does not check export counts, duplicate ownership, renderer
  count, or dependency truthfulness. A green architecture gate therefore says nothing about the
  defects above.

---

## 12. Recommendations (consolidation, with evidence)

Ordered by expected impact on final pixels and agent success.

1. **One renderer, one device.** Keep `Renderer` + `WebGL2Device` (+ WebGPU device behind a
   dynamic import) as the only draw path.
   - Delete `AdvancedRenderer` (pure delegation), `CurrentRoutesInteractiveRenderer`, both
     `A3DRenderer`s, `LeanProductionRenderer`, `LeanWebGL2Device`, and the agent-api inline WebGL
     renderer and GLB parser (index.ts:15982-17040, about 1,050 lines).
   - Fold `ProductionWebGL2Renderer`/`ProductionRuntimeRenderer` into `Renderer` as backend
     selection.
   - A bridge failure should **throw** a visible error, not swap renderers.
2. **One public builder API with lights, IBL, and shadows always honored.** Make
   `@aura3d/lean*` thin re-exports of the same builders, or delete them. Never ship a `lights`
   function that drops its arguments. If bundle size matters, achieve it with code-splitting
   inside one API, not with a second API that has different semantics.
3. **Turn the agent-api monolith into modules.** Split `agent-api/index.ts` (18,733 lines) into a
   node-spec layer and a single `SceneSnapshot → RenderSource` compiler that lives next to the
   renderer. That compiler becomes the one place where a rendering feature, such as CSM, an
   environment, or post-processing, is wired to builders. The rule: no rendering feature is
   exported publicly until the compiler can emit it.
4. **Make the public surface small and real.**
   - Target fewer than about 400 runtime exports on "." (three is 441).
   - Move all `*Evidence`, `*Report`, `*Readiness`, `*Proof`, `ExternalParity*`, and
     `CurrentRoutes*` exports (130 on root, 169+ in rendering) to a dev-only `@aura3d/devtools`
     subpath, or delete them.
   - Make `@aura3d/rendering` internal, or curate it to the classes the compiler uses (about 60 values today).
5. **One resolution truth.** Generate the tsconfig `paths` and Vite aliases from the package
   `exports`. Make in-repo `@aura3d/engine` resolve to the same file the published package does
   (agent-api entry). Add a packed-tarball type-check of every template; this would have caught
   the four `external-parity-*` templates.
6. **Delete fake-parity packages and templates.**
   - Delete `@aura3d/three-compat` or rebuild it on the real renderer (with a working
     `WebGLRenderer` shim). Its current ledger "faithful" ratings are false.
   - Delete the 8 two-line `templates/three-compat-*` and rename the
     `create-aura3d/templates/three-compat-*` (they are plain engine scenes).
   - Delete `@aura3d/environments` (diagnostics only), the `@aura3d/materials` `NodeMaterial`, and
     the toy `Octree`/`FrustumCuller`/`LOD`, or implement them in the render path.
7. **Remove duplicate implementations.** Use one math module (delete the math in
   `animation/Keyframe.ts` and `physics/Shape.ts`, and the five `Vec3` types). Use one controls
   package (`controls` or `input/controls`). Use one glTF parser. Use one material preset registry
   feeding the builder API.
8. **Remove alias subpaths.** Remove `./engine-runtime`, `./workflows/production-runtime`,
   `./assets/production-runtime`, and `./editor` (alias of `./editor-runtime`). Remove
   `dist/index.js` and the dead `files` entries.
9. **Clean up the build.**
   - Add `noEmit:true` to `tsconfig.base.json`. Run `git clean -fX` on `packages/*/src` to remove
     the 1,194 orphan maps.
   - Stop compiling `tests/` and `tools/` into the shipped `dist`.
   - Fix undeclared dependencies (create-aura3d → engine/lean/rendering/scene/animation;
     engine → environments) and remove false ones (three-compat → rendering).
   - Break the `Decals.ts ↔ agent-api/index.ts` cycle.
10. **Replace existence gates with behavior gates.** The architecture verifier should fail on:
    - more than N root exports;
    - any name with two declaring packages;
    - any renderer class other than the canonical one;
    - any builder parameter that is accepted but not consumed (lint for `_`-prefixed public
      parameters in builder APIs).

---

## 13. What is sound and worth keeping

- The package tiering has **no package-level cycles**. The `math → core → scene → rendering →
  assets → engine` layering in `docs/architecture/package-graph.dot` is respected by actual
  imports.
- `Renderer` + `WebGL2Device` + `ForwardPass` + `ShaderLibrary`: one real draw core that the
  production path already uses (58 files, about 29.6k lines).
- The WebGPU backend is behind a dynamic import (ProductionRuntimeRenderer.ts:71). That is the
  right code-splitting pattern.
- The typed asset manifest flow (`defineAuraAssets` / `aura-assets.ts`, production-bridge
  eligibility based on manifest provenance, agent-api :4339) is good. The declarative builder
  vocabulary (`scene/model/material/lights/effects`) is a reasonable agent-facing API shape once
  it is backed by one compiler.
- `sideEffects:false` and ESM-only packaging are correct. The problem is what is exported, not
  how.
- `@aura3d/physics` + `@aura3d/physics-rapier` as the single physics owner, and
  `@aura3d/navigation-recast` as an optional lazy adapter. These are clean, small adapters.
