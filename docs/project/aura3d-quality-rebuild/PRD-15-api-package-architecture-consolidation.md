# PRD 15: API, Package and Architecture Consolidation

Status: draft for implementation. Branch base: `aura3d-quality-rebuild/audit` @ `3a51cba3`.
Owner question this PRD answers: *which structural properties of the codebase let rendering work
land in a path the games never run, let a builder call be silently dropped, and let a green gate
stand in for a good frame, and what single architecture removes them?*

Evidence base: research `13` (package architecture, primary), `02` (frame trace and render-path
inventory), `07` (GPU/perf), `14` (evidence and fake parity), `01` (history), `19` (claim
verification; corrected statements used throughout), `21`/`23` (authoritative vision judgments),
`22` (benchmark fairness and the instancing bug), `_sections/E-debt-delete-qualitybar.md`.
Counts marked "re-measured" were reproduced on 2026-10-05 for this PRD with the repo's TypeScript
5.9.3 checker (`ts.createProgram` + `getExportsOfModule`) and `rg`/`find`. No browser, build or suite
was run.

Review revision (2026-10-05, staff review against `3a51cba3`): line references re-read; corrected the
renderer fold-in (`Renderer.create`, `render`/`renderAsync`, `resizeToDisplay`, `startAnimationLoop` and
`captureFrame` already exist on `Renderer`), the pipeline-ownership claim (§2.8), the lean shim (the
lean surface is larger than the 10-name re-export and `ArcadeRuntime` is in use), the root
render-source bridge (a second `RenderSource` producer on the game canvas), the capture-source trap
(the capture workflow defaults to production URLs, which makes a pixel-neutral gate unable to fail), the
subpath target (≤ 18, Appendix B), semver handling of `strict` and `renderer.mode`, the instance-size
per-game impact, and added §9.1 per-game impact. Corrections are listed in §2.8.

Parallelization revision (2026-10-05, against `7992a0dd` and `CONTRACTS.md`): this PRD is lane **prd15** and
is executable fully in parallel with PRDs 01-14. It never waits on another lane. Changes:
- Every "after PRD X" / "depends on PRD X" / "PRD X owns" ordering became a contract ID consumed or provided (§12).
- Tasks that edited files owned by another lane per CONTRACTS §4.1 were converted to seams or moved to
  §12.4 requests. The agent-api carve-outs to other lanes' modules ship in PR 0b-1, which this lane executes (§13
  Phase 0).
- Acceptance is split into standalone (§16, gates merges) and integrated (§16A, checkpoints only, never blocks).
- New sections: "Parallel execution" (after §12).
- Line references re-checked at `7992a0dd` (§2.9).

PRD 15 is also the **contract custodian** (CONTRACTS §1.1, §2.1, §4.1). It owns every `contracts/` folder,
`src/lanes/index.ts`, the conformance suites, `.github/QR_OWNERSHIP.json`, `tools/qr-ownership/check.mjs`,
`flags.state.ts` transitions at checkpoints, CCR approval (§6.4) and the root-manifest daily batch (§4.4). It
therefore executes PR 0 itself (CONTRACTS §3.9).

Ground rule: a green architecture verifier, a passing test suite, a route that returns 200 and a
non-blank canvas are not quality. This PRD is an enabling PRD. Most of its work moves code and does not
change pixels on its own. It is judged two ways. (1) Refactor phases must be pixel-neutral on all 18
benchmark scenes and 18 games, checked by measurement and by vision review. (2) The structural
outcome must make the visual PRDs (01-08, 10, 11) land in the one path every game and template runs.
The program's final gate stays the same: does the shipped app look and feel competitive. Nothing in
this PRD may be cited as evidence that it does.

---

## 1. Problem statement

Aura3D has no single place where "the renderer" can be fixed, no single place where a builder
option becomes pixels, and no single answer to "what does `import { lights } from "@aura3d/engine"`
resolve to". Each of the visual defects the other PRDs fix exists in this shape:

1. **Twelve renderer front-ends, two WebGL2 devices, three lighting contracts.** Games run
   one path (`createAuraApp` → `ProductionRuntimeRenderer` → `ProductionWebGL2Renderer` → `Renderer`
   → `WebGL2Device`, research/02 §1). Starter templates run `@aura3d/lean`, which submits no lights,
   environment, shadows or post (research/19 C7). If the game path throws, a third renderer with one
   light, no shadows and no IBL is swapped in silently (`packages/engine/src/agent-api/index.ts:12545-12548`).
   Fixes land in one path and not the others (research/01 P10).
2. **The builder layer that games use is an 18,733-line file** (`packages/engine/src/agent-api/index.ts`).
   It holds builders, scene flattening, the production bridge, the fallback renderer with its own GLSL
   and GLB parser, prefab and game-kit geometry generators, prompt recipes and evidence helpers, with
   74 `export *` statements and a file-level import cycle (`Decals.ts:39,47` → `./index.js`). A
   rendering feature reaches games only if someone wires it by hand into the bridge. 227 of 285
   rendering files (43.6k of 73.2k lines) are outside the production renderer's import closure. The
   engine imports only 57 runtime values from `@aura3d/rendering` (research/13 §2.4). CSM, SSR, planar
   reflection, `EffectComposer` and `ReflectionProbe` are exported, tested and listed as features, but
   they are not in any game's render path.
3. **Builders accept arguments and drop them.** `@aura3d/lean` `lights.directional(_options)` and
   `environments.studio()` are inert intents (`packages/lean/src/base.ts:250-260`). The production
   bridge turns `lights.ambient()` into zero IBL (`index.ts:12693-12707`; 15 of 18 games per
   research/19 C1, with Aura Clash avoiding it through its own render source). `compilePromptPlan`
   reports camera, lighting and effects fields as applied while ignoring them (research/19 C17).
   `colorGrade.exposure` is ignored (research/19 C12). At least seven `catch` blocks in the bridge
   downgrade content and only append a warning string (§2.4).
4. **What the repo tests is not what npm ships.** In-repo, `@aura3d/engine` resolves to
   `packages/engine/src/index.ts` (1,803 exports). Published, "." resolves to
   `dist/engine/agent-api/index.js` (1,726 exports). 77 names exist only in the repo's view
   (re-measured, §2.3). Four checked-in templates import them and would fail when installed from npm.
5. **The public surface is not curated.** Root "." has 1,726 exports (574 runtime values, re-measured)
   against three r185's 441 runtime exports. About 130 are evidence, report, readiness, proof or audit
   names (research/13 §10). There are 47 export subpaths, four of them alias pairs. Two different
   classes are named `A3DRenderer`. 53 names are exported by more than one package with different
   declarations, including five different `Vec3` types (research/13 §5).
6. **Compatibility and package names claim things the code does not do.** `@aura3d/three-compat`
   imports nothing from rendering. Its ledger rates two-field property bags as "faithful". The
   migration target `createThreeCompatRenderer` does not exist. The 8 `templates/three-compat-*` are
   2-line files that a bundler can drop (research/13 §7). `@aura3d/environments` contains no
   environment. The `@aura3d/materials` `NodeMaterial` generates no shader. The "parity" suite that
   gates `three-compat:release` reports hard-coded constants and Canvas2D paintings (research/19 C18).
7. **Process weight exceeds engine weight.** There are 560 root scripts, 214 of them named for
   parity, proof, evidence, readiness, audit, superiority, head-to-head or three-compat (re-measured).
   There are 454 `tools/` entries with 108-127k lines of tooling (research/13 §11, research/14 §1).
   The architecture verifier checks that directories and script names exist, not what they do
   (`tools/verify-architecture/index.ts`, 395 lines). `tsconfig.base.json` emits next to sources,
   which left 1,194 orphan `.map` files in `packages/*/src` (re-measured).

Measured consequence (research/23, research/21): in the 18-scene same-input benchmark, Aura3D
scores about 1-4.5 against three r185's 6.5-8.5. Vision judges score the 18 shipped games 1.5-5.5
on visual categories. This PRD does not fix those pixels. It removes the reason fixes to them have
not reached the games (research/01 §0.3-0.4: every burst of renderer work was short and landed
beside the game path, not in it).

## 2. Evidence from current code (path:line)

### 2.1 Renderer front-ends and devices

| Front-end | Location | Wraps | Consumers (re-measured, `rg -l` in apps/examples/templates/benchmarks; tests) |
|---|---|---|---|
| `Renderer` | `packages/rendering/src/Renderer.ts:426` (3,152 lines) | `WebGL2Device` / `WebGPUDevice` | core; kept |
| `ProductionWebGL2Renderer` | `rendering/src/production-runtime/ProductionWebGL2Renderer.ts:29` (356 lines) | `Renderer.create({backend:"webgl2"})` (:34-38) | 2 / 16 |
| `ProductionWebGPURenderer` | `…/ProductionWebGPURenderer.ts:32` (590) | `WebGPUDevice` | dynamic import `ProductionRuntimeRenderer.ts:71` |
| `ProductionRuntimeRenderer` | `…/ProductionRuntimeRenderer.ts:31` (244) | the two above | bridge `agent-api/index.ts:13586`; 2 / 9 |
| `CurrentRoutesInteractiveRenderer` | `rendering/src/threejs-example-parity/index.ts:43` (205) | `ProductionRuntimeRenderer` | 0 / 0 |
| `AdvancedRenderer` | `rendering/src/advanced-runtime/AdvancedRenderer.ts:19` (73, pure delegation) | `Renderer` | 0 / 2 |
| `A3DRenderer` #1 | `engine/src/advanced-runtime/A3DRenderer.ts:41` (206) | `Renderer` | **33 files import `@aura3d/engine/advanced-runtime`: 32 `.ts` plus the inline module in `apps/public-scene/index.html`** (apps/loader-*, skinning-*, postprocessing-*, wow-common, create-aura3d animation-studio) / 10 |
| `A3DRenderer` #2 | `engine/src/production-runtime/index.ts:175` (file 1,968) | `ProductionRuntimeRenderer` | `./production-runtime` subpath |
| `LeanProductionRenderer` | `rendering/src/lean/LeanProductionRenderer.ts:29` | `LeanWebGL2Device` + one `ForwardPass`, no lights (:52-62) | core `@aura3d/lean` entry; 0 / 2 |
| `LeanProductRenderer` | `rendering/src/lean/LeanProductRenderer.ts:17` | `Renderer` (receives no lights/env from `base.ts:396`) | `@aura3d/lean/product`, `/game`; 0 / 1 |
| `createWebGLSceneRenderer` | `engine/src/agent-api/index.ts:15982` to about `:17286` | raw `getContext("webgl2")` (`:15989`), own GLSL (`createWebGLProgram` `:16681`, shader source from `:16713` to `:16975`), own `parseGlb` (`:17018`), own `loadGltfForWebGL` (`:17002`) | silent fallback `:12545-12548`; `renderer.mode !== "production"` at `:12530` |
| Canvas2D diagnostic preview | `renderDiagnosticPreviewToCanvas` `index.ts:18295` | `CanvasRenderingContext2D` | reached from `createAuraApp` for canvases whose scene has no renderable nodes (`backend: "canvas2d"`, `index.ts:11387-11393`); scenes with renderable nodes already throw instead (`:11387-11390`) |

Other GPU context and device owners outside the two devices (re-measured,
`rg 'getContext\("webgl2?"|requestAdapter\(' packages/*/src`):
- `index.ts:13610`: the production bridge calls `canvas.getContext("webgl2")` a second time only to read
  `MAX_TEXTURE_SIZE`. It returns the device's context, but it bypasses the device.
- `rendering/src/effects/ResidentGPUParticleRenderer.ts:116-118` and `effects/GPUParticleBackend.ts:283,359`
  request their own WebGPU adapter and device. `ProductionWebGPURenderer.ts:486` does too, separately from
  `WebGPUDevice.ts:499`. The WebGPU side therefore has up to three device owners.

Devices: `packages/rendering/src/WebGL2Device.ts` (4,769 lines) and `LeanWebGL2Device.ts` (4,537 lines).
After whitespace normalization they differ in 346 lines, so the fork is about 92% identical. It was
added in `efe051c0` (2026-09-08) to meet a lean bundle number (research/13 §2.2). Both carry the same
fake `agx()`/`neutral()` (`WebGL2Device.ts:3541-3550`, `LeanWebGL2Device.ts:3320-3338`) and the same
single blend function (`WebGL2Device.ts:4402-4405`, `LeanWebGL2Device.ts:4183`) (PRD 01 §2).

### 2.2 The bridge and its fallback

`packages/engine/src/agent-api/index.ts:12523-12549` (re-read):

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
    `Production bridge failed and safe-basic fallback rendered instead: ${productionRenderErrorMessage(error)}`
  ], runtimeNodes);
}
```

- `AuraRendererMode = "safe-basic" | "production"` and `AuraRendererFallbackMode = "safe-basic"` are
  public types (`index.ts:1762-1763`). `AuraCreateAppRendererOptions` exposes `mode` and `fallback`
  (`index.ts:1781-1791`). `normalizeCreateAppRendererOptions` defaults `fallback` to `"safe-basic"`
  (`index.ts:4315`, about `:4322`).
- The default profile `safe-basic` sets `rendererMode: "production"`, `pixelRatio: 1` and
  `preserveDrawingBuffer: true`, and lists `blockedInRoot: ["production PBR parity", "skinned
  animation mixer", "native WebGPU compute", "postprocess pass chain"]` (`index.ts:4249-4262`).
  Claim-boundary prose lives in runtime types.
- The bridge hard-codes `backend: "webgl2"` (`index.ts:13586-13597`, the `ProductionRuntimeRenderer.create`
  call; `backend` at `:13590`), so the WebGPU backend never runs for games (research/07 §0.1). The same
  call passes `antialias: true`, `preserveDrawingBuffer: true`, `errorCheckMode: "frame"` when a root
  render source is attached (`:13592`), and a `clearColor` pre-inverted through the ACES fit
  (`colorToAcesInputClearColor`, `:15400`). A pixel-neutral fold-in must keep all four.
- Code above the `try` at `:12534-12541` throws `AuraRuntimeError("backend-fallback")` when
  `analyzeProductionBridgeEligibility` (`:4339`) rejects the scene. `createAuraApp` throws the same code
  when a renderable scene has no WebGL2 (`:11387-11390`). The code name says "fallback" for two paths that
  do not fall back.
- `AuraRuntimeError` (`:10830-10840`) has the constructor `(code, message)`. It carries no `cause`, so
  §6.5 needs a constructor change before any rethrow can keep the original error.
- 68 files in apps/examples/templates/benchmarks/tests pass `renderer: { mode, fallback }` (re-measured,
  `rg -l 'fallback: "safe-basic"|mode: "(production|safe-basic)"'`). They include the benchmark harness
  itself (`benchmarks/quality-rebuild/aura3d/common.ts:291`) and two of the 18 games
  (`apps/showcase-mech-hangar/src/main.ts:705`, `apps/showcase-rooftop-buckets/src/main.ts:743`).
- Root render-source bridge: `attachRootRenderSource`/`getRootRenderSource`
  (`packages/engine/src/agent-api/RootRuntimeSupport.ts:92-97`) let an app inject its own
  `RenderSource` into the bridge frame (`index.ts:13796-13804`, `:13853`). Aura Clash
  (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:4-8`) and `showcase-smart-city-control`
  use it. This is how Aura Clash avoids ambient-kills-IBL. Any "one compiler" rule has to account for it.

### 2.3 Resolution maps disagree (re-measured)

| Specifier | `tsconfig.base.json` | `vite.config.ts` | published `package.json` exports |
|---|---|---|---|
| `@aura3d/engine` | `packages/engine/src/index.ts` (`tsconfig.base.json:59-61`) | `packages/engine/src/index.ts` (`vite.config.ts:47`) | `dist/engine/agent-api/index.js` |
| `@aura3d/materials` | `packages/materials/src/index.ts` (`:56-58`) | `packages/materials/src/browser-index.ts` (`vite.config.ts:46`) | `dist/materials/index.js` |

Other layers: `tsconfig.browser-301.json` repeats the paths map by hand. `tools/finalize-dist/index.ts`
(174 lines) rewrites emitted specifiers with regular expressions (research/13 §4: :99-153, with an
`@aura3d/animation` → `browser-index.js` special case at :148-150). It also writes an unreachable
28-way `export *` aggregate, `dist/index.js` (`:62-63`), which is listed in `files` but has no export
condition.

The 77 names present in `packages/engine/src/index.ts` and absent from published "." (re-measured,
1,803 vs 1,726):
`A3DApp A3DAppDiagnostics A3DAppLifecycle A3DAppLifecycleSnapshot A3DAppOptions A3DAppQualityPreset
A3DAppQualitySettings A3DAppWorkflowPreset A3DAssetDiagnostics A3DDiagnosticsPanel A3DDisposable
A3DEnvironment A3DEnvironmentOptions A3DMaterialVariantController A3DRenderDiagnostics A3DRenderer
A3DRendererOptions A3DScene A3DSceneMeshOptions A3DSceneRenderSourceOptions A3DScreenshotCapture
A3DWorkflowApi A3D_APP_WORKFLOW_PRESETS AuraAssetPanelRow AuraAssetPreloadResult AuraAssetPreloader
AuraDiagnosticsOverlay AuraPerformancePanelSnapshot AuraResourceDescriptor AuraResourceKind
AuraResourceManager AuraResourceManagerEvidence AuraResourceRecord AuraResourceStatus AuraRouteHealth
ECSRenderLibraries ECSRenderSourceOptions GLTFLoader Renderer assertAuraRouteReady
assertAuraScreenshotNotBlank captureAuraAppScreenshot captureScreenshot createA3DApp
createAnimationLabWorkflow createAssetCompatibilityReport createAssetDiagnostics createAssetPreloader
createAssetViewerWorkflow createAuraAssetPanelRows createAuraDiagnosticsOverlay
createAuraPerformancePanelSnapshot createAuraRouteHealth createComparisonWorkflow
createCompatibilityReport createDiagnosticsPanel createECSRenderSource createEnvironment
createExternalParityEnvironmentPipeline createInteractiveSceneWorkflow createMaterialStudioWorkflow
createMaterialVariantController createPostProcessComposerLazy createProductConfiguratorWorkflow
createRenderDiagnostics createResourceManager createSceneShowcaseWorkflow inspectAsset
inspectGLTFAsset listExternalParityEnvironmentTargets loadAsset loadProductAsset
loadProductAssetLazy loadRenderableAsset resolveA3DAppQualityPreset summarizeExternalParityGLTFCorpus
workflows`.

Consumers that break when installed from npm: `templates/external-parity-asset-gallery/src/main.ts:1`
(`createAssetDiagnostics, createDiagnosticsPanel, createEnvironment, createA3DApp, workflows`) and
`templates/external-parity-{interactive-scene,material-studio,product-viewer}/src/main.ts`.

### 2.4 Silent downgrades inside the bridge (re-read)

| Site | Behaviour on failure | Visible to the player/agent |
|---|---|---|
| `index.ts:12545-12548` | swaps in `createWebGLSceneRenderer` (one light, no shadows, no IBL, `gl.disable(gl.CULL_FACE)` at `:16009`) | warning string only |
| `index.ts:13875-13878` | pose apply throws → warning, frame continues with the previous pose | warning set |
| `index.ts:14174-14180` | textured primitive upgrade throws → `textureStatus = "fallback"`, scalar material kept | `warn()` |
| `index.ts:14571-14574` | SDF text sampler throws → extruded mesh kept | `warn()` |
| `index.ts:15121-15124` | clip apply throws → warning | warning set |
| `index.ts:15147-15150` | foot planting throws → warning | warning set |
| `index.ts:15178-15181` | morph apply throws → warning | warning set |
| `packages/lean/src/base.ts:250-260` | `lights.directional(_options)`, `.position(_x,_y,_z)`, `environments.studio()` are inert | none |
| `index.ts:12693-12707` | ambient light present, no env node → `environmentMapIntensity: 0`, `environmentMapSpecularIntensity: 0` | none (PRD 02 fixes the behaviour; this PRD forbids the pattern) |
| `index.ts:14747-14754` | `createProductionInstanceTransforms` builds `localNode` from `primitive` and the transform but omits `node.size`, so every instance renders at unit size | none; research/22 confirms the 16-instancing benchmark loss is this bug |
| `packages/lean/src/base.ts:262` | `interactions.orbit()` is an inert intent too | none |

### 2.5 Module structure of the monolith (re-read top-level symbols)

`agent-api/index.ts` ranges: types and asset definitions `1-2097` (`defineAuraAssets` `:1004`);
builders `2098-4841` (`model` `:2098`, `primitives` `:2207`, `instances` `:2222`, `text3D` `:2318`,
`groups` `:2361`, `shadows` `:2366`, `material` `:2414`, `lights` `:3063`, `camera` `:3215`, `effects`
`:3441`, `sky` `:3730`, `weather` `:3772`, `water` `:3870`, `interactions` `:3911`, `ui` `:3967`,
`environments` `:4123`, renderer profiles `:4249-4330`); scene builder `:4842`; `physics` `:5172`;
`prefabs` `:5819` (building window rows `:5504`, planet materials `:5793`, mini-golf `:6641`); game
kits `:6980-8198` (`game` `:8198`; racing road `:7198`, platformer ground `:7754`); `animation`
`:8309`; `particles` `:8361`; humanoid generators `:8565-8998`; `product` `:9360`; evidence helpers
`:9595-9780`; `sceneKits` `:9994`; `promptRecipes` `:10147`; `AuraRuntimeError` `:10830`;
`createAuraApp` `:11126`; `createGameApp` `:11818`; frame loop `:12241`; production bridge
`:12523-15981`; fallback renderer `:15982-17286`; engine primitive generators `:17287-17479`; model
matrix and transforms `:17637-18010`; canvas `:18105`; diagnostic preview `:18295`.

### 2.6 Root package and build

- `/package.json`: `name: "@aura3d/engine"`, `version 3.0.1`, **47 export subpaths**, **560 scripts**
  (re-measured). Top script prefixes: `verify` 77, `check` 53, `production-runtime` 29,
  `prompt-animation` 24, `audit` 23, `external-parity` 22, `three-compat` 20, `head-to-head` 20,
  `animation-studio` 19, `threejs-parity` 17, `game-runtime` 15, `superiority` 12. 214 names match
  `parity|proof|evidence|readiness|claim|superiority|audit|receipt|muse|external|head-to-head|three-compat`.
  `build` wraps `build:raw` in `evidence:command --id build --out tests/reports/aura3d104/build.json`.
  `typecheck` is wrapped the same way.
- `packages/engine/package.json:2-4`: `"name": "@aura3d/engine-runtime"`, `"private": true`, version
  2.0.4. The directory named `engine` is not the package named `@aura3d/engine`.
- `tsconfig.build.json` extends base, sets `rootDir "."` and `outDir "dist"`, and includes
  `tests/unit`, `tests/integration`, `tests/performance`, `tests/visual`, `tools/**` and three config
  files. Tests and tools compile into the shipped `dist`.
- `tsconfig.base.json:15-16` sets `declarationMap` and `sourceMap` with no `outDir` and no `noEmit`.
  1,194 `.js.map`/`.d.ts.map` files sit in `packages/*/src` with no sibling `.js`/`.d.ts`, are
  gitignored (`.gitignore:31-32`) and are untracked (research/13 §8.2; count re-measured).
- `BUNDLE_SIZES.md:10-11`: `@aura3d/lean core primitive critical path` 77,458 B gzip against an 80,000 B
  budget, "pass". `@aura3d/engine compatibility root` is 575,343 B gzip, "informational". The pass is
  bought by the lightless lean entry (research/13 §3).
- Reference (re-measured, `gzip -9` of `node_modules/three@0.185.1/build`): `three.module.min.js`
  86,569 B plus the `three.core.min.js` it imports, 100,978 B. A full three WebGL renderer is
  therefore about **187.5 KB gzip**. `three.webgpu.min.js` is 184,692 B.

### 2.7 Duplicate implementations (research/13 §5-6, `_sections/E` D5)

| Concern | Owners |
|---|---|
| `Vec3` | 5 different declarations: animation/Keyframe.ts, engine/agent-api/SceneGroundingUtils.ts, physics/Shape.ts, rendering/PbrReference.ts, scene/MathTypes.ts |
| `Mat4`, `Quat` math | animation/Keyframe.ts, scene/MathTypes.ts, physics/Shape.ts, `@aura3d/math` |
| Orbit/FirstPerson/PointerLock controls | `packages/controls/src/` and `packages/input/src/controls/` |
| `AnimationController` | `animation/AnimationController.ts` and `engine/agent-api/AnimationController.ts` (3,368 lines) |
| GLB parsing | `assets/GLTFLoader.ts`, agent-api `parseGlb`/`loadGltfForWebGL` (`:17002-17030`), `ProductionAssetCorpus.ts`, `AdvancedAssetCorpus.ts`, plus 4 template scripts |
| Material presets | agent-api `material.*`, `MaterialPresets.ts`, `CinematicMaterialPresets.ts`, `ArchitecturalMaterialCatalog.ts`, `AnimationMaterialStyle.ts`, `@aura3d/materials` (no app, template or engine consumer) |
| Scene representation | `@aura3d/scene` `Scene`, `A3DScene extends Scene`, `AuraSceneSnapshot`, ECS `World` + `createECSRenderSource`, lean builder, three-compat `Object3DCompat` |
| Builder API names | `createAuraApp`, `scene`, `model`, `material`, `lights`, `camera`, `primitives`, `environments`, `interactions`, `defineAuraAssets` in both agent-api and `lean/base.ts`, with different semantics |

### 2.8 Review findings that change the plan (re-read at `3a51cba3`)

1. **`Renderer` already has most of what the fold-in proposed to add.** `Renderer.create(options: RendererOptions)`
   exists (`rendering/src/Renderer.ts:472`; `RendererOptions` `:105-111` extends `RenderBackendOptions`).
   `resizeToDisplay` (`:501`), `startAnimationLoop` (`:525`), the `render` overloads (`:539-541`),
   `renderAsync` (`:708-710`), `captureFrame` (`:885`), `getShadowEvidence` (`:442`) and
   `resetTemporalHistory` (`:537`) are all on `Renderer`. `RendererInput` (`:293-296`) is already the
   per-frame input type. `AdvancedRenderer` (`advanced-runtime/AdvancedRenderer.ts:25-70`) only delegates.
   `ProductionWebGL2Renderer` adds four things: `requiredFeatures` at create (`:35-38`), device-loss
   forwarding (`:54-67`), the timing and feature wrapper around `render`/`renderAsync` (`:69-95`), and the
   evidence methods (`:102-197`).
2. **`PBRHDRPipeline`, `TransmissionBackdropCapture` and `ProductionEffectsPipeline` are not frame
   pipelines owned by the production renderer.** `ProductionWebGL2Renderer.ts` imports none of them.
   `PBRHDRPipeline.ts` exports HDR parsing and environment-lighting resource builders
   (`parseProductionRadianceHDR` `:108`, `createProductionPbrHdrPipelineFromRadiance` `:137`,
   `createProductionEnvironmentLightingResources` `:215`, `createDualProbeEnvironmentLightingResources`
   `:328`, `createProductionToneMappingPolicy` `:448`). The bridge (`agent-api/index.ts:66-68`),
   `engine/src/production-runtime/index.ts:1072-1085` and `apps/common/src/runtime.ts:195-203` call them.
   `TransmissionBackdropCapture` is used only by `ProductionWebGPURenderer.ts:18-22`.
   `ProductionEffectsPipeline` (`createProductionEffectsRenderSource` `:21`) has no consumer outside the
   `production-runtime` barrel and `threejs-example-parity/FlagshipFoundation.ts`. Making them "`Renderer`
   internals" would add new code to the frame path, which is not a pixel-neutral move.
3. **The bridge reads renderer evidence at runtime.** `index.ts:13599` stores
   `productionRenderer.getFeatures()` in app diagnostics. If `getFeatures` moves to `./devtools`, the
   bridge would import devtools, which the layering rule forbids.
4. **The lean surface is larger than the 10-name shim.** `lean/src/game.ts` exports `game`
   (`input`, `platformer` from `ArcadeRuntime.ts`; `cameraRig`, `gameFeel`, `debugDraw`,
   `performanceGovernor`, `text`, `:309-318`), `createLean*` factories and `Lean*`/`AuraLean*` types.
   `templates/mini-game/src/main.ts:1-11,54,66` uses `game.input`, `game.platformer`,
   `AuraLeanNodeBuilder` and `LeanPlatformerEvent`. The engine `game.platformer` is a different function
   (`createGamePlatformerKit`). `ArcadeRuntime` therefore has a consumer even though no external file names
   it. The 4 template `aura-assets.ts` files also import lean. `packages/aura3d-cli/src/asset-manifest.ts:112-125`
   generates a lean import whenever the project depends on `@aura3d/lean`. The lean model matrix uses
   position and scale only (`rendering/src/lean/LeanProductionRenderer.ts:52`), which confirms the rotation
   defect. `templates/product-viewer/src/main.ts` makes no `lights.*` call, so a key light needs an
   explicit node after the switch.
5. **`@aura3d/materials` has zero import consumers.** The two hits are comments
   (`packages/create-aura3d/templates/product-viewer/src/main.ts:13`, `racing-starter/src/main.ts:228`).
6. **Subpaths missing from the target list.** `./rendering` has 18 consumers, including Aura Clash
   (`Geometry`, `PBRMaterial`, `UnlitMaterial`, `InstancedUnlitMaterial`, `VertexBuffer`, `VertexFormat`,
   `RenderItem`). `./production-runtime` has 13 consumer locations, including Aura Clash's `createTypedGLBActor`,
   `TypedGLBActor`, `createSideViewGameRenderPreset` and `attachRootRenderSource`. These are game APIs, not
   renderer APIs. `./scene/math` is the canonical math owner (§6.10). `./physics/solverless` and
   `./physics/world` exist so a scene with no bodies does not download the solver (`vite.config.ts`
   comment after `:52`). All 47 subpaths now have a disposition in Appendix B.
7. **The capture workflow defaults to production URLs.** `.github/workflows/quality-rebuild-capture.yml:13-17`
   (`local_build_all`, default `false`) and `capture-games.mjs:878`: unless `local_build_all` is true, games
   load from the deployed `aura3d.auraone.ai`, not from the branch. A pixel-neutral gate run with the
   defaults compares production with production and cannot fail. Its `push` trigger covers only
   `aura3d-quality-rebuild/audit` and three paths (`:22-27`). Output files are `<run>__<shot>.png` and
   `contact-sheet.png` (`capture-games.mjs:20,531,786`).
8. **Scripts and configs the plan relied on do not exist.** No `tsconfig.check.json`, `pack:check`,
   `arch:check` or `resolution:check` script exists today. `typecheck:raw` is
   `tsc -p tsconfig.build.json --noEmit`, so tests and tools are type-checked through the build config.
9. **Instancing in the games.** 7 of the 18 games call `instances.*` (blockfall-reactor 23 calls,
   skyline-runner 7, turbo-drift-circuit 45, neon-swarm 7, courier-rush 18, rooftop-buckets 31, and
   aura-clash `instances.model` 1). None passes a non-unit `size`: courier-rush passes `size: [1, 1, 1]` on
   all 18 calls and the rest encode dimensions in per-instance `scale`. The T3.10 fix is therefore expected
   to be pixel-neutral on every game and to change only benchmark scene 16. (Earlier text said "2 apps".)
10. **README line references.** `README.md:211-212` holds the duplicate-export admission ("322 exports
    duplicating other packages; 51 exported symbol names have more than one owning package"), not
    `:209-210`. `:684` is the three-compat install line.
11. **`rewriteRelativeImportExtensions`** (TS ≥ 5.7; the repo has 5.9.3) rewrites only relative `.ts`
    specifiers. It does not rewrite bare `@aura3d/<pkg>` specifiers, and those are exactly what
    `tools/finalize-dist/index.ts:146-151` rewrites today. Dist specifier mapping stays necessary. It becomes
    a manifest-driven AST pass (§6.9), not "if needed".

### 2.9 Spot-check at `7992a0dd` (parallelization review)

Re-read with `sed -n`/`awk` against the working tree. All counts are unchanged since `3a51cba3`.

| Reference | Result |
|---|---|
| `agent-api/index.ts` length | 18,733 lines. Correct |
| `index.ts:12545-12548` fallback `catch` → `createWebGLSceneRenderer` | Correct, but the enclosing function is `createProductionSceneRenderer` (`:12523`), **not** `createAuraApp` (`:11126-11743`). The non-production branch is `:12530`. T4.2 was corrected; this function is not in any CONTRACTS §3.2 carve-out, so it stays with PRD 15 and moves to `app/mountRenderer.ts` |
| `index.ts:12693-12707` ambient detection | Correct (`ambientLights` filter at `:12693`). The region is inside `createProductionRuntimeEnvironment` (`:12628-12732`), which PR 0b-1 carves to `compiler/environment.ts` (owner 02) |
| `index.ts:13584-13597` bridge `Renderer` creation | Off by two. `ProductionRuntimeRenderer.create({` is at `:13586`, `preserveDrawingBuffer: true` at `:13593`. T2.4 now cites `:13586-13597` |
| `index.ts:13875`, `:14174`, `:14571`, `:15121`, `:15147`, `:15178` `catch` sites | All are `catch (error)`. Enclosing functions: `createProductionRuntimeRendererInput` (`:13842`, owner 15), `upgradeProductionPrimitiveTextures` (`:14150`, carved to `compiler/textures.ts`, owner 04), `createSdfTextPrimitiveResource` (`:14479`, SDF text sampler, `compiler/textures.ts`, owner 04), `applyProductionActorAnimation` (`:15070`, `compiler/animation.ts`, owner 06), `applyProductionActorFootPlanting` (`:15134`, not carved, owner 15), `applyProductionActorMorphTargets` (`:15167`, not carved, owner 15). T4.1 was split by owner |
| `index.ts:14747` `createProductionInstanceTransforms` | Correct. `localNode` omits `size` (`:14750`). R18 assigns the fix to PRD 15 in `compiler/primitives.ts` |
| `index.ts:15982` `createWebGLSceneRenderer` | Correct |
| `Decals.ts:39,47` import cycle | Correct (`from "./index.js"` on both lines). `Decals.ts` is owned by **07**, so the import change is a request (Q-07-1) |
| `packages/lean/src/base.ts:250-260` inert lights/environments | Correct |
| `ProductionRuntimeRenderer.ts:57` `static async create`, `ProductionWebGL2Renderer.ts:54-56` `onDeviceLost`, `:69` `renderInteractiveFrame`, `:102` `captureProof` | Correct. Files are 244 and 356 lines |
| `engine/src/production-runtime/index.ts:175` `A3DRenderer` #2 | Correct |
| `Renderer.ts:105` `RendererOptions`, `:472` `static async create` | Correct. The file is owned by **01**. Backend selection and lifecycle land in `renderer/RendererFactory.ts`/`DeviceLifecycle.ts` (owner 11, C-29), not in this lane |
| `tools/finalize-dist/index.ts:62-63` `dist/index.*` writers | Correct. File is 174 lines |
| `vite.config.ts:46-47`, `tsconfig.base.json:56-61` | Correct |
| `packages/aura3d-cli/src/asset-manifest.ts:112-125` lean import choice | Correct. The file is owned by **05** (CONTRACTS §4.1 "`asset-*`"), so the change is a request (Q-05-1) |
| `BUNDLE_SIZES.md:10,33-34` | Correct |
| `README.md:211-212` duplicate-export admission, `:684` three-compat line | Correct. T7.8's earlier `:209-210` was wrong and is fixed |
| Root `package.json` | 47 exports, 560 scripts; `ls tools` = 454. Correct |
| Orphan maps | 1,194 under `packages/*/src`; `git ls-files` lists **0** `.map` files. They are untracked debris, so D-14 crosses no ownership boundary |

## 3. Root cause

| Cause | Category | How it produces the visual ceiling |
|---|---|---|
| No renderer ownership: front-ends were added per workstream (production-runtime, advanced-runtime, threejs-example-parity, lean) instead of extending one class | F architecture | A fix to `Renderer`/`WebGL2Device` does not reach the lean templates. A fix in the bridge does not reach `A3DRenderer` apps. A bridge exception silently replaces all of it with a 2025-era shader |
| No compiler boundary: builders, scene compilation and render submission are interleaved in one file, and there is no exhaustive mapping from node kind or option to render output | F | "Feature exists" (exported from rendering) is mistaken for "feature reaches pixels". Options can be accepted and ignored with no type or test error (`_options`, ambient-zeroes-IBL, prompt-plan fields) |
| Failure handling defaults to "keep rendering something" | F / G | Degraded frames ship and evidence still passes. The fallback exists so "non-blank canvas" gates stay green |
| Bundle and parity numbers optimized as targets | G evidence | `LeanWebGL2Device` forked and lights stubbed to hit 80,000 B. three-compat ledger and suite fabricated to report "faithful"/"parity" |
| Several sources of truth for module resolution | F | Repo tests resolve differently from consumers, so a class of break is untestable |
| Public names encode past workstreams (`ExternalParity*` 83 in rendering, `CurrentRoutes*`, `Production*`, `A3D*` vs `Aura*`) | E agent authoring / F | Agents cannot tell which API is real. Skills steer them to the conservative proven subset (research/01 P5) |
| Process tooling grew without deletion (560 scripts, 454 tool dirs, gates that check existence) | G | Maintenance effort goes to evidence. The architecture gate is green while every defect above exists |

## 4. Affected packages

- Root `@aura3d/engine` (`/package.json`): exports map, `files`, scripts, `sideEffects`.
- `@aura3d/engine-runtime` (`packages/engine`): agent-api split, compiler, removal of `advanced-runtime`,
  `production-runtime` (engine side), `threejs-example-parity`, lean shims.
- `@aura3d/rendering` (`packages/rendering`): renderer fold-in, device dedupe, lean renderers, barrel
  curation, orphan-file deletion.
- `@aura3d/lean` (`packages/lean`): reduced to deprecated re-exports, then deleted.
- `@aura3d/three-compat` (`packages/three-compat`): runtime classes deleted. Migration moves to
  `@aura3d/cli`.
- `@aura3d/environments`, `@aura3d/materials`, `@aura3d/editor` (1-line `export *`): deleted or folded.
- `@aura3d/math`, `@aura3d/scene`, `@aura3d/animation`, `@aura3d/physics`, `@aura3d/controls`,
  `@aura3d/input`: duplicate math and controls removed.
- `@aura3d/assets`: the single glTF parser owner.
- `create-aura3d` (`packages/create-aura3d`): default template path, undeclared dependencies, template
  renames.
- `@aura3d/cli` (`packages/aura3d-cli`): new `aura3d migrate three` and `aura3d codemod` commands;
  `src/asset-manifest.ts:112-125` stops generating `@aura3d/lean` imports.
- `tools/`, `tests/`, `benchmarks/three-compat`, `.github/workflows/*`: script and tool pruning,
  generated resolution maps, packed-consumer check, architecture behaviour gates.

## 5. Affected files and directories

Ownership note: every path below is tagged by its CONTRACTS §4.1 owner. Paths owned by PRD 15 are edited by this
lane. Paths owned by another lane are listed only as `→ request Q-NN-k` (§12.4) or as a contract seam this lane
consumes. PR 0b-1 carve-outs, which this lane executes as custodian (CONTRACTS §3.2, §3.9), are the one exception:
they create other lanes' modules with byte-identical bodies, and after that merge only the owner edits them.

Modify (owner 15 unless tagged):
- `packages/engine/src/agent-api/index.ts`: PR 0b-1 carve-outs (CONTRACTS §3.2), then the remaining 15-owned regions are split per §6.3 until the file is a re-export file of at most 300 lines.
- `packages/engine/src/agent-api/Decals.ts:39,47` (owner **07**) → request Q-07-1: import from `./nodes/types.js` and `./nodes/builder.js`, which this lane creates (T3.1, T3.2).
- `packages/engine/src/index.ts` (289 lines): becomes the internal aggregate for `./renderer` and `./devtools` only. It no longer backs "." in any resolver.
- `packages/rendering/src/Renderer.ts` (owner **01**): not edited by this lane. The `backend` selection, `onDeviceLost`/`onDeviceRestored`/`isDeviceLost` and `renderFrame`/`renderFrameAsync` members are C-29 (provider 11). PR 0b-2 adds them as delegating stubs in `renderer/RendererFactory.ts` and `renderer/DeviceLifecycle.ts` (owner 11). This lane consumes them. Existing `render`, `renderAsync`, `resizeToDisplay`, `startAnimationLoop` and `captureFrame` are unchanged.
- `packages/rendering/src/index.ts` (1,193 lines, 43 `export *`): curated named exports only. It keeps `export * from "./lanes/index.js"` and `"./contracts/index.js"` (CONTRACTS §3.8).
- `packages/rendering/src/production-runtime/PBRHDRPipeline.ts` (owner **02**) → request Q-02-1: move to `packages/rendering/src/environment/hdrEnvironment.ts`. Until it lands, `./renderer` re-exports it from its current path. `TransmissionBackdropCapture.ts` (15) stays under `production-runtime/`. `ProductionEffectsPipeline.ts` (15) is deleted (D-27).
- `packages/engine/src/agent-api/RootRuntimeSupport.ts`: `attachRootRenderSource` stays public. Its source becomes a compiler input (§6.4).
- `packages/rendering/src/effects/{ResidentGPUParticleRenderer,GPUParticleBackend}.ts` (owner **07**) → request Q-07-2: take the `GPUDevice` from `Renderer`. This lane adds only the `single-device` gate rule with a dated allowlist (§6.2).
- `packages/lean/src/{index,product,game}.ts`: deprecated re-exports plus `leanCompat` adapters (§6.7).
- `packages/aura3d-cli/src/asset-manifest.ts:112-125` (owner **05**) → request Q-05-1: always emit `@aura3d/engine`.
- `benchmarks/quality-rebuild/aura3d/common.ts:291` (owner **12**) and the other 67 `renderer.mode`/`fallback` callers: this lane ships the `renderer-mode` codemod (C-39, §10). It applies the codemod to 15-owned files. Other owners run it (Q-12-1, Q-13-2, Q-14-1).
- `.github/workflows/quality-rebuild-capture.yml` (owner **12**) → request Q-12-2: a `strict` dispatch input that appends `aura-strict=1`. Meanwhile this lane's strict captures pass `qr_flags=strict`, which PR 0b-3 already routes (C-33 `--flags`; `A3D_QR_STRICT` resolves from the URL per CONTRACTS §5.2).
- `packages/create-aura3d/**`, root `templates/**` (owner **13**) → request Q-13-1: templates import `@aura3d/engine` (the `lean-imports` codemod). The default template stays `product-viewer`.
- Root `/package.json`: `exports`, `files`, `scripts` (15; root-manifest batch, CONTRACTS §4.4).
- `tsconfig.base.json`: add `"noEmit": true`. Generated `paths` block.
- `tsconfig.build.json`: `"noEmit": false`, include only `packages/*/src/**/*.ts`, exclude `**/*.test.ts`.
- `tsconfig.browser-301.json`: generated or deleted.
- `vite.config.ts:40-60`: the alias table is imported from a generated module. The generator keeps the existing "subpath before bare package" ordering (the comment at `:52`).
- `tools/finalize-dist/index.ts`: delete the regex rewriting at `:99-153` and the `dist/index.js` writer at `:62-63`. Driven by the export manifest.
- `tools/verify-architecture/index.ts`: replaced by behaviour gates (§6.12).
- `BUNDLE_SIZES.md`, `README.md:211-212,684`, `MIGRATION-2.0.md`: rewritten from measured output.

Create (all owner 15; the `agent-api/{nodes,compiler,app,devtools}/` files below are the 15-owned defaults, not
the lane-owned carve-out targets listed in CONTRACTS §3.2):
- PR 0 artifacts (CONTRACTS §3.9): every `contracts/` folder, `src/lanes/index.ts` plus 15 empty lane barrels per
  package, `tests/unit/contracts/C-NN-*.test.ts`, `tests/browser/contracts/*.spec.ts`, `.github/QR_OWNERSHIP.json`,
  `tools/qr-ownership/check.mjs`, `.github/workflows/qr-contracts.yml`, `eslint/qr/*.js` (except PRD 09's rule file).
- Lane files: `.github/workflows/qr-prd15-{arch-gates,pack-check,bundle-size,captures}.yml`, `tests/qr/prd15/`,
  `packages/aura3d-cli/src/commands/prd15/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd15/`.
- `tsconfig.check.json` (Phase 1, T1.0): `noEmit`, includes `packages/*/src`, `tests/**`, `tools/**` and the three root configs. It is the type-check config every later task uses.
- `packages/engine/src/agent-api/nodes/*.ts`, `compiler/*.ts`, `app/*.ts`, `devtools/*.ts` (§6.3).
- `packages/engine/src/public/index.ts` (the "." entry), `public/renderer.ts`, `public/devtools.ts`.
- `packages/engine/src/agent-api/app/degradation.ts`, `app/errorOverlay.ts`, `app/mountRenderer.ts`.
- `packages/engine/src/agent-api/leanCompat.ts`, `agent-api/leanArcade.ts` (moved `ArcadeRuntime.ts`; 15-owned `agent-api/lean*.ts`, not `nodes/game/`, which is 09's).
- `packages/rendering/src/diagnostics/featureReport.ts` (internal home of `getFeatures`, §6.2).
- `docs/architecture/lean-api-map.json`, `docs/architecture/subpath-dispositions.json` (Appendix B).
- `aura.exports.json` at the repo root (single export manifest, §6.9).
- `tools/generate-resolution-maps/index.ts` (`--write` and `--check`).
- `tools/packed-consumer-check/index.ts`.
- `tools/arch-gates/index.ts` with `rules/*.ts` (§6.12).
- `tools/script-prune/index.ts` (reference scanner, §6.11).
- `packages/aura3d-cli/src/migrate-three/` (codemod, §6.8).
- `docs/architecture/renderer-ownership.md` (one page that names the one renderer and the one compiler).

Delete: see Appendix A, which gives each item with its safety check.

## 6. Architecture proposal

### 6.1 Target topology

```
 npm: @aura3d/engine (umbrella)   @aura3d/cli   create-aura3d   @aura3d/asset-index
        │
        ├─ "."           builders + createAuraApp/createGameApp + game kits + sceneKits + prefabs
        │                (≤ 350 runtime values, 0 evidence/report names)
        ├─ "./renderer"  Renderer, RenderSource/RenderItem types, materials, geometry, passes the
        │                compiler emits (curated; replaces ./rendering, ./advanced-runtime, the renderer
        │                half of ./production-runtime, ./rendering/advanced-runtime,
        │                ./rendering/production-runtime, ./rendering/webgpu)
        ├─ "./assets" "./animation" "./physics" "./audio" "./input" "./controls" "./scene" "./math"
        │  "./scripting" "./editor-runtime" "./workflows" "./ecs"         (domain packages, unchanged role)
        ├─ "./scene/math" "./physics/solverless" "./physics/world"     (kept: canonical math owner;
        │                                                                 solver-free physics split)
        └─ "./devtools"  evidence, reports, route health, diagnostics panels, screenshot asserts
                         (never imported by "." or "./renderer"; enforced by arch gate)
   18 entries in total. The disposition of all 47 current subpaths is Appendix B.

 Internal call graph (one path for every entry point):
   builders (nodes/*) ──► AuraSceneSnapshot ──► compileScene() (compiler/*) ──► CompiledScene
        ▲                                                                       │ RenderSource
   lean shims, sceneKits, prefabs, game kits, prompt plans                       ▼
                                          Renderer (rendering/Renderer.ts) — sole frame owner
                                             ├─ WebGL2Device (sole GL device)
                                             └─ WebGPUDevice (dynamic import; PRD 11)
   Low-level users (./renderer): build RenderSource directly, call the same Renderer.
   App-supplied sources (attachRootRenderSource, Aura Clash): enter compileScene as an external
   source and are merged by the compiler. They never call a second renderer.
```

Rules:
1. One `Renderer` class and one `RenderDevice` implementation per backend. No other class may own a
   `WebGL2RenderingContext` or `GPUDevice`. GPU-particle code that needs a `GPUDevice` gets it from
   `Renderer`. Arch gate rule `single-renderer` (§6.12).
2. One compiler from `AuraSceneSnapshot` to `RenderSource`. Every builder node kind and every
   builder option field is consumed by exactly one compiler handler, or is listed in
   `compiler/DIAGNOSTIC_ONLY_FIELDS` with a reason that names the owning PRD. A rendering feature is
   not exported from "." until the compiler can emit it.
3. No silent visual fallback. Failures are thrown, or recorded as typed `AuraDegradation`s that are
   visible in dev (§6.5).
4. One export manifest generates every resolver: package `exports`, tsconfig `paths`, Vite aliases
   and the dist layout. In-repo `@aura3d/engine` resolves to the same entry file that npm ships.
5. Runtime packages contain no evidence, report, readiness, proof or claim exports. Those live in
   `./devtools`.

### 6.2 One renderer

Final owner: `packages/rendering/src/Renderer.ts` (CONTRACTS §4.1 owner **01**). The factory and lifecycle
surface is contract C-29 (provider **11**, files `renderer/RendererFactory.ts` and `renderer/DeviceLifecycle.ts`).
PRD 15 writes neither file. It consumes C-29, deletes the 15-owned wrapper classes, and owns the `./renderer`
subpath and the `single-renderer` gate.

Fold-in (§2.8 item 1: most of the surface already exists on `Renderer`, so this is mostly deletion):
- `ProductionRuntimeRenderer.create` backend selection (`ProductionRuntimeRenderer.ts:57-90`:
  `"webgl2" | "webgpu" | "auto"`, WebGPU behind dynamic import at `:71`) is carved verbatim in PR 0b-2 into
  `renderer/RendererFactory.ts` (owner 11). C-29 exposes it as `Renderer.create(options: RendererCreateOptions)`
  with the dynamic import kept. `ProductionWebGL2Renderer`'s `requiredFeatures` list and its "must be a real WebGL2
  device" check (`:35-43`) become the bridge's call arguments (15-owned `compiler/renderer.ts`), not `Renderer`
  defaults.
- Device-loss listeners (`ProductionRuntimeRenderer.ts:45-55`, `ProductionWebGL2Renderer.ts:54-67`)
  are the C-29 `RendererLifecycle` members. The PR 0b-2 stub attaches them to the existing context listeners
  (`WebGL2Device.ts:417-445`). They forward to the device, as today.
- `renderInteractiveFrame/renderFrame/renderFrameAsync(ProductionRendererInput)`
  (`ProductionWebGL2Renderer.ts:69-95`) wrap `Renderer.render`/`renderAsync` with a timing accumulator
  and a feature list. They become the C-29 members `Renderer.renderFrame(input: RendererInput)` and
  `renderFrameAsync` (PR 0b-2 delegating stubs; the stub wraps `render()` and returns FrameStats timing), which
  return `RendererFrameResult { backend, diagnostics, timing }`. They reuse the existing `RendererInput`
  (`Renderer.ts:293-296`); no new input type is added. `validateImportedAsset` stays in the bridge.
  `render`/`renderAsync` keep their current signatures.
- `captureProof`, `renderImportedAsset`, `getFeatures` and `getShadowEvidence`
  (`ProductionWebGL2Renderer.ts:102-197`) are evidence APIs. They become free functions over
  `Renderer.getDiagnostics()` in `packages/rendering/src/diagnostics/featureReport.ts` (internal), and
  `./devtools` re-exports them. They are not methods on the renderer. The bridge's runtime call
  (`index.ts:13599`, §2.8 item 3) calls the internal function until Phase 3, when
  `compiledFeatures` (§7.1) replaces it in app diagnostics. `getShadowEvidence` already exists on
  `Renderer` (`:442`) and stays there as an internal diagnostics hook, not an evidence API.
- `PBRHDRPipeline` (530) is a library of HDR-parse and environment-resource builders, not a frame
  pipeline (§2.8 item 2). The file is owned by **02** (CONTRACTS §4.2). Its move to
  `rendering/src/environment/hdrEnvironment.ts` is request Q-02-1. Until then `./renderer` re-exports it from
  `production-runtime/PBRHDRPipeline.ts`, and the re-export path changes in the same PR that lands the move.
  `TransmissionBackdropCapture` (175, owner 15 under `production-runtime/` default) stays where it is and is
  exported from `./renderer` for the WebGPU backend.
  `ProductionEffectsPipeline` (85) has no in-path consumer and is deleted (D-27). This PRD adds no new
  code to `Renderer`'s frame path.
- `CurrentRoutesInteractiveRenderer`, `AdvancedRenderer`, `LeanProductionRenderer` and
  `LeanProductRenderer` are deleted.
- `A3DRenderer` #2 (`engine/src/production-runtime/index.ts:175`) is deleted.
- `A3DRenderer` #1 (`engine/src/advanced-runtime/A3DRenderer.ts`) has 33 consumer files (32 `.ts` plus
  `apps/public-scene/index.html`). It becomes a deprecated alias, `export const A3DRenderer = Renderer`
  plus `export type A3DRenderer = Renderer`, in `./renderer` for one minor release. Its conveniences
  (`resizeToDisplay`, `startAnimationLoop`, the `render` overloads, `captureFrame`) already exist on
  `Renderer` (`:501`, `:525`, `:539-541`, `:885`), so nothing moves. Before aliasing, T2.9 diffs
  `A3DRenderer.ts:41-206` against `Renderer` and lists every member `A3DRenderer` has that `Renderer`
  lacks (for example `A3DScene` input handling). `Renderer.ts` is owned by 01, so each such member is either
  implemented as a free function in 15-owned `packages/engine/src/advanced-runtime/a3dCompat.ts` over the public
  `Renderer` API, filed as request Q-01-2, or recorded in the codemod as a rewrite. `A3DRenderer.evidence()` (`:129`) moves to `./devtools`. A codemod rewrites the
  33 imports, including the inline `<script type="module">` in the HTML file.
- Bridge-side context access: `index.ts:13610` (`canvas.getContext("webgl2")` to read `MAX_TEXTURE_SIZE`)
  is replaced with `renderer.device` capability data (`RenderDeviceCapabilities.maxTextureSize`, which is
  added if missing).
- WebGPU device owners outside `WebGPUDevice` (§2.1: `ResidentGPUParticleRenderer.ts:116-118`,
  `GPUParticleBackend.ts:283,359`, `ProductionWebGPURenderer.ts:486`): `single-renderer` lists them in an
  allowlist that expires at 4.0.0. Request Q-07-2 asks 07 to take `renderer.device`'s `GPUDevice` in the
  particle code; request Q-11-1 asks 11 to fold `ProductionWebGPURenderer` into `WebGPUDevice`. The gate runs
  in report mode for allowlisted entries, so neither request blocks this lane. Neither is pixel work for this
  PRD.
- `createWebGLSceneRenderer` and everything only it reaches (`index.ts:15982-17286`, the GLSL at
  `:16713-16975`, `parseGlb`/`loadGltfForWebGL` at `:17002-17030`, `createWebGLBackdrop` `:16215`,
  `createWebGLParticleModel` `:16548`, `compileShader` `:16977`) are deleted. The behavioural removal (throw
  `renderer-mount-failed` instead of falling back) is also this lane's: the call site is
  `createProductionSceneRenderer` (`index.ts:12523-12548`, owner 15) and the code is the C-36
  `AuraDegradationCode` `"renderer-mount-failed"`. It ships behind `A3D_QR_STRICT` (§6.5), so flag-off behaviour
  is unchanged until that flag is promoted.
- `LeanWebGL2Device.ts` (owner 15) is deleted. Any of its 346 differing lines that are a real fix (not a feature
  removal) must reach `WebGL2Device.ts` (owner 01) through request Q-01-1 (CONTRACTS §4.2: "15 Lean bug-fix
  port as request"). Phase 2 task T2.3 produces the line-level classification and attaches the patch and tests to
  the request. Deletion of `LeanWebGL2Device.ts` does not wait for the port: the lean entry no longer reaches it
  once `@aura3d/lean` re-exports engine builders (T4.6), and a classified-but-unported fix is listed in the
  checkpoint report.

### 6.3 The agent-api split

Target layout under `packages/engine/src/agent-api/` (each file ≤ 2,500 lines, arch gate
`max-file-lines`):

```
nodes/                 # builder vocabulary: pure, no GL, no rendering imports except types
  types.ts             # AuraNode union, AuraSceneSnapshot, AuraTransformSpec, AuraMaterialSpec … (from :1-2097)
  builder.ts           # AuraNodeBuilder base (fixes the Decals.ts cycle)
  assets.ts            # defineAuraAssets (:1004), asset refs
  model.ts primitives.ts instances.ts text3d.ts groups.ts shadows.ts
  material.ts lights.ts camera.ts effects.ts sky.ts weather.ts water.ts
  interactions.ts ui.ts environments.ts particles.ts
  scene.ts             # scene() builder (:4842)
  physics.ts           # physics (:5172)
  prefabs/             # one file per family: buildings.ts, planets.ts, minigolf.ts, humanoid.ts …
  game/                # racing.ts, platformer.ts, fallingBlocks.ts, fighting.ts, presentation.ts
  animation.ts product.ts sceneKits.ts
  prompt/              # promptRecipes.ts, promptPlan.ts (compilePromptPlan; PRD 13 fixes field use)
compiler/              # snapshot → RenderSource; the only place builders meet rendering
  compileScene.ts      # entry; exhaustive handler table
  sceneGraph.ts        # flatten + matrix hierarchy (PRD 01 §6.2 content)
  color.ts             # parseAuraColor (PRD 01)
  environment.ts       # createProductionRuntimeEnvironment (:12628) — PRD 02 rewrites the logic
  lights.ts shadows.ts fog.ts postprocess.ts
  primitives.ts        # entries (:14014), instance transforms (:14747), primitive geometry routing
  textures.ts          # primitive texture upgrade (:14127-14450)
  text.ts              # SDF text (:14450-14580)
  actors.ts            # TypedGLBActor binding, animation, morph, foot planting (:13552-13583, :15100-15480)
  renderInput.ts       # createProductionRuntimeRendererInput (:13842-14011) → updateCompiledScene
  externalSource.ts    # merges attachRootRenderSource sources (RootRuntimeSupport.ts:92-97; bridge :13796-13804, :13853)
  observations.ts      # createProductionTextObservation/TexturesObservation (:13034-13110), internal diagnostics
  handlers.ts          # NodeKindHandlers map, DIAGNOSTIC_ONLY_FIELDS
app/
  createAuraApp.ts createGameApp.ts frameLoop.ts (:12241-12520) canvas.ts (:18105)
  mountRenderer.ts     # createProductionSceneRenderer (:12523-12549) + createProductionRuntimeSceneRenderer (:13540-13841)
  errors.ts (AuraRuntimeError :10830, AuraMigrationError) degradation.ts errorOverlay.ts
  diagnostics.ts liveApps.ts (:11745) labels.ts (:12127)
devtools/              # every *Evidence/*Report/*Proof/*Readiness helper: collectGameRuntimeEvidence (:6980),
                       # auraLazySystemEvidence (:9595), createSceneKitLodEvidence (:9780),
                       # createRuntimeNodeImportedAssetEvidence (:10610), helperPerformanceBudgets (:11931),
                       # renderDiagnosticPreviewToCanvas (:18295), sceneKitPerformanceBudgets (:9681)
index.ts               # named re-exports only; ≤ 300 lines; no `export *`
```

Rules: `nodes/` may not import from `compiler/`, `app/` or `@aura3d/rendering` values (type-only
imports allowed). `compiler/` may not import `app/`. `devtools/` may import anything. Nothing imports
`devtools/` except `public/devtools.ts`. Arch gate `layering` enforces this with the module graph.

Ownership of the layout (CONTRACTS §3.2, §4.1). The layout above is the target topology. Not every file in it is
PRD 15's:
- **Created by PR 0b-1 verbatim and then owned by another lane:** `nodes/instances.ts`, `nodes/water.ts`,
  `nodes/environments.world.ts`, `nodes/prefabs/cityBlock.ts` (10); `nodes/shadows.ts`, `nodes/lights.ts`,
  `nodes/environments.ts`, `nodes/sceneKits.ts`, `nodes/effects.lighting.ts` (02); `nodes/material.ts` (04);
  `nodes/camera.ts`, `nodes/game/racingCamera.ts` (08); `nodes/effects.ts`, `nodes/sky.ts`, `nodes/weather.ts`,
  `nodes/particles.ts`, `vfx/gameEffects.ts` (07); `nodes/effects.post.ts` (03); `nodes/game/index.ts` and
  `nodes/game/` default, `app/createGameApp.ts` (09); `nodes/prompt/*`, `looks/structuralQA.ts`,
  `looks/generatedCodeWarnings.ts` (13); `compiler/environment.ts`, `compiler/lights.ts`, `compiler/shadows.ts`
  (02); `compiler/fog.ts` (07); `compiler/postprocess.ts` (03); `compiler/modelMaterials.ts`,
  `compiler/textures.ts` (04); `compiler/animation.ts`, `app/actorAnimationHandle.ts` (06);
  `compiler/sceneGraph.ts`, `compiler/color.ts`, `app/colorManagement.ts` (01); `app/rendererOptions.ts`,
  `devtools/sceneKitBudgets.ts` (11); `app/frameAlpha.ts`, `app/frameLoopDefaults.ts` (08).
- **Owned by PRD 15:** `nodes/` default (`types.ts`, `builder.ts`, `assets.ts`, `model.ts`, `primitives.ts`,
  `text3d.ts`, `groups.ts`, `interactions.ts`, `ui.ts`, `scene.ts`, `physics.ts`, `prefabs/` except cityBlock,
  `animation.ts`, `product.ts`); `compiler/` default (`compileScene.ts`, `handlers.ts`, `renderer.ts`,
  `renderInput.ts`, `primitives.ts`, `text.ts` outside the SDF sampler, `actors.ts` outside the animation
  carve-out, `externalSource.ts`, `observations.ts`, `safeBasic.ts`, `geometry.ts`, `optionCoverage.ts`); `app/` default (`createAuraApp.ts`, `runtimeNodes.ts`, `mountRenderer.ts`,
  `frameLoop.ts`, `canvas.ts`, `errors.ts`, `degradation.ts`, `errorOverlay.ts`, `diagnostics.ts`, `liveApps.ts`,
  `labels.ts`); `devtools/` default (`lazySystemEvidence.ts`, `rendererReports.ts`, `environmentDiagnostics.ts`).
- The `compiler/textures.ts` (04) and `compiler/text.ts` (15) split follows CONTRACTS §3.2: the SDF text sampler
  `:14529` and texture paths `:14040-14104, :14163, :14290-14460` are 04's; the rest of `:14453-14616` is 15's.
- After PR 0b-1, PRD 15 never edits a lane-owned file in this list. The `compileScene` handler table, the
  `SceneCompileContext`, `DIAGNOSTIC_ONLY_FIELDS` aggregation and `registerOptionCoverage` (C-36) are the seams the
  owners use from their own files.

Move discipline: every move is a pure move commit (code unchanged, import paths only), verified by
`tsc --noEmit` and the pixel-neutral capture (§16.1). Behaviour fixes are separate commits. The one
exception is `createProductionInstanceTransforms`: it ships with its fix (`size` included, §9) and a
regression test, because research/22 confirmed the bug and CONTRACTS R18 assigns the fix to this lane in
`compiler/primitives.ts`, declared as a correctness fix (CONTRACTS §6.1) with PRD 12 re-baselining scene 16.

Visual benefit: none directly. It gives every visual lane a single-writer module to land in.
GPU 0. CPU 0 at runtime. Memory 0. Bundle: −5 to −15 KB gzip from removing the `export *` fan-in
(estimate; measured in Phase 3). Mobile: parse cost drops with bundle. Fallback: n/a (refactor).

### 6.4 One scene compiler

The frozen signatures are CONTRACTS C-36 (`packages/engine/src/contracts/compiler.ts`) and C-37
(`contracts/runtimeNodes.ts`). This PRD provides both. The block below is the implementation view in
`compiler/compileScene.ts`; where it differs from C-36, C-36 wins (for example `SceneCompileContext.quality` is
`AuraQualityTierSettings & { tier }` from C-27, `degrade()` replaces `onDegradation`, and `flags: QrFlags` is
present). Handlers for lane-owned node kinds register through `registerNodeHandler` from the owner's own
`compiler/*.ts` file. The `nodeHandlers` table below holds only PRD 15's legacy-wrapping defaults.

```ts
// packages/engine/src/agent-api/compiler/compileScene.ts
export interface SceneCompileContext {
  readonly renderer: Renderer;                 // for capability queries and resource creation
  readonly assets: AuraAssetResolver;          // typed manifest resolution
  readonly quality: AuraResolvedQualityTier;   // PRD 11 tier semantics
  readonly strict: boolean;                    // §6.5
  readonly onDegradation: (d: AuraDegradation) => void;
}

export interface CompiledScene {
  readonly snapshotVersion: number;
  readonly source: RenderSource;               // items, lights, environment, shadows, fog, post, camera
  readonly actors: readonly CompiledActor[];   // typed GLB actors (animation, morph, IK)
  readonly features: ReadonlySet<AuraCompiledFeature>;
  readonly degradations: readonly AuraDegradation[];
  dispose(): void;
}

export function compileScene(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene>;
export function updateCompiledScene(
  compiled: CompiledScene, snapshot: AuraSceneSnapshot,
  runtime: AuraRuntimeNodeRegistry, timeSeconds: number
): RenderSource;                                // per-frame; allocation-free for unchanged nodes

// handlers.ts — exhaustive by construction
type NodeKind = AuraNode["kind"];
type NodeKindHandlers = { readonly [K in NodeKind]: NodeHandler<Extract<AuraNode, { kind: K }>> };
export const nodeHandlers: NodeKindHandlers;   // missing kind = compile error
export const DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>>;
```

Every declarative producer feeds this compiler: agent-api builders, `sceneKits.*`, `prefabs.*`,
`game.*` kits, `compilePromptPlan` output, and the lean shims. `A3DScene`, `@aura3d/scene` `Scene`
and `createECSRenderSource` stay low-level producers that build `RenderSource` directly for
`./renderer` users. They never run in parallel with the compiler on the same canvas.

**Option-sensitivity contract.** Every option field of every builder is listed in
`compiler/optionCoverage.ts` as `{ builder, field, probeValueA, probeValueB }`. A unit test compiles
a minimal scene with each value and asserts that the resulting `RenderSource` differs (deep
structural diff, ignoring ids), unless the field is in `DIAGNOSTIC_ONLY_FIELDS`. This is the test that
would have failed on `lights.directional(_options)`, `lights.ambient` zeroing IBL (the env block
would not differ between "ambient + no env" and "no ambient + no env"), `colorGrade.exposure` and the
missing `node.size` on instances.

Visual benefit: indirect but large. Builder calls that are dropped today (lean lights and environment;
exposure; instance size) reach pixels. It is the single wiring point (C-36) that the CSM/IBL handlers (02),
post handlers (03) and particle handlers (07) register into. GPU 0. CPU: `updateCompiledScene` must be ≤ the current
`createProductionRuntimeRendererInput` cost. Budget §17: ≤ 0.6 ms for 500 nodes on Medium, using
version counters to skip unchanged nodes. Memory: +1 cached `RenderSource` per app (< 1 MB for 2k
items). Bundle: neutral. Mobile: CPU win from skipping unchanged nodes. Fallback: none. A missing
handler is a compile-time error and an unknown runtime kind throws `AuraRuntimeError("unknown-node-kind")`.

### 6.5 Silent fallback removal

Contract view: `AuraDegradationCode`/`AuraDegradation` are frozen in C-36 (the C-36 version adds
`ownerPrd?`). `strict`/`onDegradation` on `AuraCreateAppOptions` are pre-declared by PR 0a (C-38). `strict`
defaults to true **only when `A3D_QR_STRICT` is on** (C-36 semantics, CONTRACTS §5). With the flag off, every
behaviour below is inert and the legacy fallback still runs, so no PR of this lane changes flag-off pixels
(CONTRACTS §6.1). The fallback code is deleted at `A3D_QR_STRICT` removal (§5.4), which depends only on this
lane's own flag reaching `default-on`. The per-code line comments below cite where each `catch` lives today and
which lane owns that module after PR 0b-1 (§2.9).

```ts
// app/degradation.ts
export type AuraDegradationCode =
  | "renderer-mount-failed"          // fatal under A3D_QR_STRICT: index.ts:12545 (createProductionSceneRenderer, owner 15)
  | "texture-upgrade-failed"         // index.ts:14174 (compiler/textures.ts, owner 04; Q-04-1)
  | "sdf-text-fallback"              // :14571 (compiler/textures.ts SDF sampler, owner 04; Q-04-1)
  | "pose-apply-failed" | "clip-apply-failed" | "morph-apply-failed" | "foot-planting-failed"
  //   :13875 (renderInput.ts, 15), :15121 (compiler/animation.ts, 06; Q-06-1), :15178 (actors.ts, 15), :15147 (actors.ts, 15)
  | "extension-lobe-pending"         // emitted by lane handlers (04 lobes) through ctx.degrade
  | "capability-degraded"            // explicit capability fallback; emitted by any lane through ctx.degrade
  | "option-ignored";                // a DIAGNOSTIC_ONLY field was set by the app
export interface AuraDegradation {
  readonly code: AuraDegradationCode;
  readonly nodeId?: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly frame: number;
}
export interface AuraCreateAppOptions {
  // ...existing...
  /** Default true. true: non-fatal degradations throw at the point of failure.
   *  false: render degraded, record, console.warn once per code+node, show the dev overlay badge. */
  readonly strict?: boolean;
  readonly onDegradation?: (degradation: AuraDegradation) => void;
}
export interface AuraAppDiagnostics { readonly degradations: readonly AuraDegradation[]; /* ... */ }
```

- With `A3D_QR_STRICT` on, `renderer-mount-failed` rejects `createAuraApp` and paints `app/errorOverlay.ts` (a
  DOM `role="alert"` element over the canvas with message and cause) in every build. The prior behaviour
  was a different renderer. The new behaviour is an obvious error.
- This lane's own captures and benchmark runs pass `qr_flags=all` or `qr_flags=strict` (C-33 `--flags`), so
  `strict` is on. A capture with any degradation fails this lane's gate. Making `strict` the default inside
  the PRD 12-owned harnesses is request Q-12-2.
- Shipped games may pass `strict: false`. The dev overlay badge ("N degradations") still shows when
  `location.search` contains `aura-debug` or the build is a dev build (`import.meta.env?.DEV`).
- The `fallback` option and the `AuraRendererMode`/`AuraRendererFallbackMode` types are removed at 4.0.0.
  In 3.1.0, with `A3D_QR_STRICT` on, passing them throws `AuraMigrationError`. This lane owns the message text
  and the calendar (§11). The types live in the 15-owned `index.ts:1-2097` types section, so the
  `@deprecated` tags go in through CCR-15-1.

Visual benefit: no frame silently renders with a one-light shader or with scalar materials in place
of textures. GPU/CPU/memory 0. Bundle −30 to −40 KB gzip (the fallback renderer, about 1.3k lines with
GLSL, plus its GLB parser). Mobile: a context-loss or OOM mount failure now shows an error instead of a
degraded frame. Tiered quality (C-27, owner 11) is the honest mobile answer. Fallback strategy: the
only allowed fallbacks are explicit capability fallbacks recorded as `capability-degraded`.

### 6.6 Public surface

Targets, enforced by arch gate `export-budget`:

| Entry | Today | Target | Content rule |
|---|---|---|---|
| `.` | 1,726 (574 values) | ≤ 350 values, ≤ 900 total | builders, app, game kits, sceneKits, prefabs, error types, public config types. Zero names matching the evidence regex `/(Evidence|Report|Readiness|Proof|Audit|Claim|Parity|Receipt|Superiority|Probe|CurrentRoutes|ExternalParity)/` |
| `./renderer` | n/a (split across 6 subpaths) | ≤ 150 values | `Renderer`, device types, `RenderSource`/`RenderItem`, material classes the compiler emits, `Geometry`, `Texture`, `EnvironmentMap`, pass option types |
| `./devtools` | n/a | unbounded, dev-only | evidence, reports, route health, `assertAuraScreenshotNotBlank`, `captureAuraAppScreenshot`, diagnostics panels, perf panels |
| Subpath count | 47 | ≤ 16 | §6.1 list |

How the 77 repo-only names are resolved (§2.3):
- To `./renderer`: `Renderer`, `A3DRenderer` (deprecated alias), `A3DRendererOptions`, `A3DScene`,
  `A3DSceneMeshOptions`, `A3DSceneRenderSourceOptions`, `createECSRenderSource`, `ECSRenderLibraries`,
  `ECSRenderSourceOptions`, `createPostProcessComposerLazy`.
- To `./assets`: `GLTFLoader`, `loadAsset`, `loadRenderableAsset`, `loadProductAsset`,
  `loadProductAssetLazy`, `createAssetPreloader`, `AuraAssetPreloader`, `AuraAssetPreloadResult`,
  `createResourceManager`, `AuraResource*` (5), `inspectAsset`, `inspectGLTFAsset`.
- To `./devtools`: `createDiagnosticsPanel`, `A3DDiagnosticsPanel`, `createAuraDiagnosticsOverlay`,
  `AuraDiagnosticsOverlay`, `createAuraPerformancePanelSnapshot`, `AuraPerformancePanelSnapshot`,
  `createAuraRouteHealth`, `AuraRouteHealth`, `assertAuraRouteReady`, `assertAuraScreenshotNotBlank`,
  `captureAuraAppScreenshot`, `captureScreenshot`, `A3DScreenshotCapture`, `createRenderDiagnostics`,
  `A3DRenderDiagnostics`, `createAssetDiagnostics`, `A3DAssetDiagnostics`,
  `createAssetCompatibilityReport`, `createCompatibilityReport`, `createAuraAssetPanelRows`,
  `AuraAssetPanelRow`, `AuraResourceManagerEvidence`.
- Deleted: `createA3DApp`, `A3DApp*` (8), `A3DDisposable`, `A3DEnvironment`, `A3DEnvironmentOptions`,
  `createEnvironment` (a second environment API beside `environments.*`), `workflows` and the 7
  `create*Workflow` functions, `A3DWorkflowApi`, `A3D_APP_WORKFLOW_PRESETS`,
  `resolveA3DAppQualityPreset`, `createMaterialVariantController`/`A3DMaterialVariantController`
  (moved to `./workflows` if a consumer exists, else deleted), `createExternalParityEnvironmentPipeline`,
  `listExternalParityEnvironmentTargets`, `summarizeExternalParityGLTFCorpus`. `createA3DApp` has 8
  consumers in apps/examples/templates (re-measured). Each is migrated to `createAuraApp` or to
  `Renderer` + `A3DScene` in Phase 5.
- The 4 `templates/external-parity-*` are deleted (not in root `files`, parity-named, superseded by
  `templates/production-*`). Root `templates/` is owned by 13, so this is request Q-13-6.

Parallel-safe sequencing of the resolution flip. Pointing in-repo "." at the published entry would break
typechecking in files other lanes own (apps, templates, benchmarks) the moment it merges, which would either turn
trunk red or force this lane to edit those files. Neither is allowed (CONTRACTS §6.1, §4). The flip is therefore
done as a **union first, then a trim**:
1. Phase 1 (day 0, standalone): `aura.exports.json` makes the published "." entry a superset. The 77 repo-only
   names are added to it as `@deprecated` re-exports. Each JSDoc points at its §6.6 destination (`./renderer`,
   `./assets`, `./devtools` or "deleted in 4.0.0"). In-repo and published views are then identical (1,803 names),
   so `resolution:check` and `pack:check` pass without touching any other lane's file. The 4 external-parity
   templates pass `pack:check` as a side effect.
2. Phase 5: the `engine-entry-imports` codemod (C-39) rewrites imports of the 77 names to their destination. This
   lane applies it to 15-owned files. Owners of other files run it themselves (Q-12-1, Q-13-2, Q-14-1).
   `export-budget` counts deprecated names separately and reports them.
3. Phase 8 (4.0.0): each deprecated re-export is removed only when `rg -lw <name>` finds no in-repo consumer
   outside 15-owned files, so trunk stays green. A name that still has a consumer in another lane's file stays
   deprecated in 4.0.0, is listed in the release notes and the checkpoint report with its open request, and is
   removed in the next minor after the owner migrates. This lane's release never waits for it.

### 6.7 `@aura3d/lean` decision

Decision: **delete the second builder API**. `@aura3d/lean`, `/product` and `/game` become
deprecated re-exports of "." for one minor release, then are removed. Bundle size is reached by
code-splitting inside the one API, not by a second API with different semantics.

- 3.1.0: `packages/lean/src/index.ts`, `product.ts` and `game.ts` each become
  `export { createAuraApp, scene, model, primitives, material, lights, camera, environments, interactions, defineAuraAssets } from "@aura3d/engine";`
  plus a one-time `console.warn` naming the replacement. `ArcadeRuntime.ts` is checked for consumers.
  If it has none it is deleted; otherwise it moves to `agent-api/leanArcade.ts` (15-owned `agent-api/lean*.ts`;
  `nodes/game/` is 09's, CONTRACTS §4.1). `base.ts` is deleted.
  Lights now render, environments now apply, rotation now works (research/19 C7).
- Templates `product-viewer` and `mini-game` (and the create-aura3d copies) import `@aura3d/engine`.
  `mini-game` gains a key light, an environment and shadow-receiving ground (its scene makes no light
  calls today, research/19 C7 skeptic 2). Templates are owned by 13 (R20): this lane ships the `lean-imports`
  codemod (C-39) and request Q-13-1 asks 13 to run it and add the mini-game key light. This lane's standalone
  proof uses its own copies of both scenes under `tests/qr/prd15/fixtures/lean-templates/` (§16.3).
- 4.0.0: `packages/lean` is deleted, along with `./lean`, `./lean-product` and `./lean-game`
  subpaths, `agent-api/{lean,lean-game,lean-product}.ts` and the `tsconfig.base.json` path entries.
- Code-splitting inside "." that replaces the lean budget: the glTF loader
  (`assets/GLTFLoader.ts`), the post chain (PRD 03), the WebGPU backend, SDF text, water, sky and
  weather modules, physics (Rapier) and audio decoders are reached only through `await import()` in
  the compiler, triggered by the node kinds present in the snapshot. Arch gate `lazy-chunks` asserts
  that the initial chunk of a primitives+lights+environment scene does not contain these modules
  (Vite `manifest.json` inspection).

Visual benefit: new users' first scene (`create-aura3d` default) gets lights, IBL and shadows instead
of an unlit `ForwardPass`. GPU: about +0.5-1.5 ms on Medium versus today's lightless lean (lit PBR
plus shadow map). This cost is carried in the C-27 tier budgets (owner 11) and the lighting budgets (02). CPU +0.1 ms. Memory
+environment map (C-09 `neutral(tier)`: ≤ 6 MB on Medium). Bundle: the starter grows from 77.5 KB to the §17 budget
(≤ 190 KB gzip initial for a lit scene). The 80,000 B budget is withdrawn as a lighting-free target.
Mobile: Low tier keeps one directional shadow and a 256-face PMREM (C-27 Low row). Fallback: none; the
lean API is gone.

### 6.8 three-compat honesty

Decision: **delete the runtime compatibility layer, and keep a migration codemod that makes no
drop-in claim**.

- Delete `packages/three-compat/src/{core,cameras,lights,materials,geometries,textures,render-targets,loaders,helpers,controls,animation,math}/`,
  `ApproximationLedger.ts`, `ThreeCompatibilityMatrix.ts` and `ThreeApiInventory.ts`. There is no
  draw path (research/13 §7) and the "faithful" ratings are false.
- `migration/ThreeToA3DAdapter.ts` (which rewrites to the nonexistent `createThreeCompatRenderer` at
  `:18`) is replaced by `packages/aura3d-cli/src/migrate-three/`. That code parses three.js source
  with the TypeScript compiler API and emits `@aura3d/engine` builder code. Each three construct it
  cannot map becomes a `// TODO(aura3d-migrate): <construct> has no Aura3D mapping` comment and a row
  in a JSON report `{ construct, line, mapping: "exact" | "approximate" | "none", note }`. The report
  is computed from the mapping table and never hand-labelled. It maps three Euler `"XYZ"` explicitly
  to `rotationOrder: "XYZ"` (C-06 rotation-order semantics).
- `templates/three-compat-*` (8 two-line stubs, owner 13) are deleted and the 8
  `packages/create-aura3d/templates/three-compat-*` (plain engine scenes, owner 13) are renamed to remove the
  label: `architecture-interior`, `asset-inspector`, `character-viewer`, `custom-scene`,
  `large-scene`, `material-authoring`, `postprocess-scene`, `premium-product-viewer`, with
  `create-aura3d --template three-compat-<x>` mapping to the new name with a warning for one minor. All of this
  is request Q-13-4 (R20).
- `tools/three-compat-*` (30 dirs) and `benchmarks/three-compat/` (owner 12) → request Q-12-3.
  `tests/browser/three-compat-threejs-{visual,runtime}-parity.spec.ts` (creator rule: first import is
  `@aura3d/three-compat`, so 15) and the 20 `three-compat:*` scripts (root, 15) are deleted here (research/19 C18,
  research/14 §6). README:684 ("install separately `@aura3d/three-compat`") is removed.
- Request Q-13-5: 13 updates the `aura3d-threejs-migration` skill to the CLI codemod and removes references to
  `ThreeCompatibilityMatrix` and `ApproximationLedger`, from facts F-15-* (C-40).

Visual benefit: none, and none is claimed. Removing a surface that reports "faithful" for code that
draws nothing is the point. GPU/CPU/memory 0. Bundle: three-compat is not in root `files`, so 0 for
npm. The CLI grows by about 15 KB. Mobile n/a. Fallback: none.

### 6.9 One resolution truth and a clean build

`aura.exports.json` (single source):

```jsonc
{
  "package": "@aura3d/engine",
  "entries": {
    ".":              { "source": "packages/engine/src/public/index.ts" },
    "./renderer":     { "source": "packages/engine/src/public/renderer.ts" },
    "./devtools":     { "source": "packages/engine/src/public/devtools.ts", "devOnly": true },
    "./assets":       { "source": "packages/assets/src/index.ts", "browser": "packages/assets/src/browser-index.ts" },
    "./animation":    { "source": "packages/animation/src/index.ts", "browser": "packages/animation/src/browser-index.ts" }
    // … ≤ 16 entries
  },
  "deprecated": {
    "./advanced-runtime": { "target": "./renderer", "removeIn": "4.0.0" },
    "./lean":             { "target": ".",          "removeIn": "4.0.0" }
  }
}
```

`tools/generate-resolution-maps/index.ts --write` generates from it:
1. `/package.json` `exports` (types/browser/import/default conditions to `dist/<mapped>.js`).
2. `tsconfig.paths.generated.json`, which `tsconfig.base.json` extends. The hand `paths` block is
   deleted. In-repo `@aura3d/engine` resolves to `packages/engine/src/public/index.ts`, the same
   file npm ships.
3. `vite.aliases.generated.ts`, imported by `vite.config.ts` and every app/benchmark Vite config that
   aliases today (`examples/neon-corridor-strike/vite.config.ts` and others found by `rg "alias"`).
   The `browser` condition decides `browser-index.ts`, so `@aura3d/materials`-style divergence can
   only happen when declared.
4. `tools/finalize-dist` input: a manifest of `source → dist` copies. Regex specifier rewriting is
   deleted. The emitted dist uses relative imports produced by `tsc` with `rewriteRelativeImportExtensions`
   or a single, tested AST pass if needed.

`--check` mode runs in CI and fails on any diff.

Build:
- `tsconfig.base.json`: `"noEmit": true`. Ad-hoc `tsc` can no longer emit next to sources.
- `tsconfig.build.json`: `"noEmit": false`, `"outDir": "dist"`, `"include": ["packages/*/src/**/*.ts"]`,
  `"exclude": ["**/*.test.ts", "**/__tests__/**"]`. Tests and tools stop compiling into dist.
  Type-checking tests and tools moves to `tsconfig.check.json` (`noEmit: true`).
- `/package.json` `files`: remove `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts`,
  `dist/index.d.ts.map`, and every `dist/<pkg>` not reachable from an export entry (generated).
- Orphan maps: delete the 1,194 files (Appendix A, item D-14). `tools/verify-source-cleanliness` gains a
  rule that fails on any `*.map`, `*.js` or `*.d.ts` under `packages/*/src`.
- Undeclared and false dependencies (research/13 §9): `create-aura3d` declares the engine packages it
  imports. `@aura3d/engine-runtime` declares `environments` until environments is deleted.
  `three-compat` loses `rendering`. `debug` loses `animation`. `editor-runtime` loses
  `animation, scene`. Arch gate `deps-truth` enforces this.

**Packed-consumer check** (`tools/packed-consumer-check/index.ts`): `pnpm pack` the root package, then
create a temp workspace per template (`templates/*` that ship in `files` plus every
`packages/create-aura3d/templates/*`), install the tarball, and run `tsc --noEmit` and `vite build`.
It runs on GitHub Actions (ubuntu for tsc, macos-14 for the browser smoke). It would have caught the
four `external-parity-*` templates.

### 6.10 Duplicate implementations

| Concern | Keep | Delete / redirect |
|---|---|---|
| Vector/matrix/quaternion math | `@aura3d/math` classes plus `@aura3d/scene/math` tuple functions (`MathTypes.ts`, owner 08). The scene tuple module is the canonical `Vec3`/`Quat`/`Mat4` type owner | `physics/src/Shape.ts` vector helpers (`vec3`, `addVec3`, …, `EPSILON`) and `Vec3` in `SceneGroundingUtils.ts` → import (15-owned, done here). `animation/src/Keyframe.ts` math (`Mat4`, `identityMat4`, `composeMat4`, `multiplyMat4`, `normalizeQuat`) → request Q-06-3 (owner 06), with the property test attached. `Vec3` in `PbrReference.ts` → request Q-01-3 (owner 01) |
| Controls | `@aura3d/controls` (unlisted package, owner 15) | `packages/input/src/controls/` (owner 15) → re-export from controls for one minor, then delete |
| `AnimationController` | `engine/agent-api/AnimationController.ts` (the one games bind; owner 06) | `animation/src/AnimationController.ts` (owner 06): rename to `AnimationLayerController` or delete. Request Q-06-2. Meanwhile `unique-ownership` lists the pair in its dated allowlist (report mode for that entry only) |
| GLB parsing | `assets/GLTFLoader.ts` (owner 05) | agent-api `parseGlb`/`loadGltfForWebGL` (deleted with the fallback, 15). `asset-corpus/ProductionAssetCorpus.ts`/`AdvancedAssetCorpus.ts` (15) call `GLTFLoader` through its public export. Template scripts importing `@aura3d/engine/assets` → request Q-13-3 |
| Material presets | one registry, `packages/rendering/src/MaterialPresets.ts` (15), exported by name from the `@aura3d/rendering` public entry (a public entry point, so no cross-lane import, CONTRACTS §6.2) | `rendering/src/{cinematic/CinematicMaterialPresets,ArchitecturalMaterialCatalog,animation/AnimationMaterialStyle}.ts` (all 15) merged into it as a pure value move. Switching `material.*` (`nodes/material.ts`, owner 04) to read it, and any value change (C-15 territory), is request Q-04-2; until then the registry is an unused-but-tested export reported by `unique-ownership`. `@aura3d/materials` deleted except `NodeMaterial.ts` (owner 11, request Q-11-2) |
| Environments | `environments.*` builders plus `rendering` PMREM/HDR (C-09, owner 02) | `@aura3d/environments` (default owner 15): 15-owned files deleted, two diagnostics values move to `./devtools`. `EnvironmentRegistry`/`HDRIEnvironment`/`PMREMPreset.ts` (02) and `BiomeEnvironmentRegistry.ts` (10) are relocated by their owners (Q-02-2, Q-10-1); the package directory is removed in the PR that follows the last relocation, and until then `deps-truth` reports it |
| Name collisions with different declarations (53) | one declaring package per name | arch gate `unique-ownership` fails on any name exported by two package indexes with different declarations |

### 6.11 Process weight: scripts and tools

Target: **≤ 80 root scripts** and **≤ 60 `tools/` directories**.

Kept scripts (canonical set; names fixed so CI and skills can rely on them): `dev`, `build`, `build:dist`,
`typecheck`, `typecheck:tests`, `lint`, `test`, `test:unit`, `test:integration`, `test:browser`,
`test:visual` (kept by name; its body is whatever the C-30/C-33 tooling of lane 12 invokes), `bench:quality` (benchmarks/quality-rebuild),
`capture:games` (tools/quality-rebuild-capture), `pack:check`, `resolution:check`, `resolution:write`,
`arch:check`, `bundle:size`, `templates:check`, `assets:*` that the CLI documents, `doctor`, `release:*`
that the release workflow calls, plus per-app `dev:<app>` scripts that a workflow or README
references. `build` and `typecheck` call `tsc` directly; the `evidence:command` wrapper is deleted.

`tools/script-prune/index.ts`:
1. Loads `/package.json` scripts and builds a reference graph from script bodies
   (`pnpm <name>`/`npm run <name>`), `.github/workflows/*.yml`, `packages/*/package.json`,
   `apps/*/package.json`, `skills/**`, `README.md`, `docs/**` (except `docs/project/**` history) and
   `AGENTS.md`/`CLAUDE.md` files.
2. Marks each script `keep` (canonical list or referenced by a kept workflow), `delete` (zero
   references, or referenced only by other deleted scripts, or its target file does not exist; 7 such
   per research/14 §4 #30), or `review`.
3. Writes `tools/script-prune/report.json` and, with `--apply`, rewrites `package.json` scripts.
4. For each deleted script it lists the `tools/<dir>` it invoked. A tool dir is deleted when no kept
   script, workflow or source file imports it (`rg -l "tools/<dir>"`).

Families deleted outright, subject to the reference check: `external-parity:*` (22), `three-compat:*`
(20), `head-to-head:*` (20), `threejs-parity:*` (17), `superiority:*` (12), `audit:*` (23), `aura3d10x:*`, `muse*`,
`premium-indie:*`, `final-competitive:*`, `remediation:*`, `foundation:*`, `engine-readiness:*`,
`current-routes:*` except route health. `verify:*` (77) and `check:*` (53) go to review: kept only if
they test behaviour §6.12 keeps or a C-30/C-33 tool invokes.

Ownership split. Root `package.json` scripts are 15's, so pruning **script entries** never waits. Many tool
**directories** the scripts point at are owned by 12 (`tools/{head-to-head,superiority,three-compat,muse3jsparity,
external-parity,threejs-parity}-*`, `tools/{_quarantine,compare-engines,visual-baseline,premium-indie-reference,
production-runtime-report-bridge,production-runtime-threejs-parity}/`, `benchmarks/three-compat/`) or 11
(`tools/production-runtime-{template,package-surface}-readiness/`). This lane deletes only 15-owned tool dirs
(`tools/` default). For each other-owned dir, `script-prune --report` writes the zero-reference evidence into
request Q-12-3 / Q-11-3; the owner deletes or keeps it (for example 12 decides whether the frozen r185
`head-to-head` inputs stay). The ≤ 60 target is therefore integrated (§16A); the 15-owned share is standalone.

Visual benefit: none. Agents and humans get a repo where `package.json` names what actually runs.
GPU/CPU/memory 0. Bundle 0. Fallback: deleted scripts are restorable by `git revert` of the single
prune commit.

### 6.12 Behaviour gates replace existence gates

`tools/arch-gates/index.ts` replaces `tools/verify-architecture/index.ts`. Each rule reads source or
build output, never a report JSON:

| Rule | Check | Fails on today's tree |
|---|---|---|
| `single-renderer` | AST: classes or functions that call `getContext("webgl2"|"webgl"|"webgpu")` or construct a `RenderDevice` outside `WebGL2Device.ts`, `WebGPUDevice.ts`, `RenderBackend.ts` | yes (`agent-api/index.ts:15989`, `LeanWebGL2Device`) |
| `export-budget` | TS checker export counts per entry against §6.6 | yes (1,726) |
| `no-evidence-in-runtime` | evidence regex on "." and "./renderer" export names | yes (about 130) |
| `unique-ownership` | names exported by more than one package index with different declarations | yes (53) |
| `layering` | module graph: nodes ↛ compiler/app, compiler ↛ app, nothing ↛ devtools except public/devtools | n/a until split |
| `no-cycles` | Tarjan SCC over value imports, size > 1 | yes (4 SCCs, research/13 §9) |
| `max-file-lines` | ≤ 2,500 lines per `.ts` in `packages/*/src` (allowlist with expiry for `WebGL2Device.ts`, `Renderer.ts`, `GLTFLoader.ts`, recorded in the rule) | yes (18,733) |
| `no-unused-public-params` | public builder functions (exported from `nodes/`) with `_`-prefixed parameters | yes (`lean/base.ts:252-259`) |
| `option-coverage` | every builder option field appears in `optionCoverage.ts` or `DIAGNOSTIC_ONLY_FIELDS` | n/a until split |
| `deps-truth` | imported vs declared workspace dependencies per package | yes (research/13 §9 table) |
| `resolution-single-truth` | `generate-resolution-maps --check` | yes |
| `no-cross-package-relative` | `../../../<pkg>/src` imports from packages or apps | yes (25 in `engine/src/threejs-example-parity`, 6 in apps) |
| `lazy-chunks` | Vite manifest: the initial chunk of `benchmarks/quality-rebuild` scene 01 excludes glTF, post, WebGPU, physics and SDF modules | to be measured |
| `src-clean` | no `*.map`/`*.js`/`*.d.ts` under `packages/*/src` | yes (1,194) |

Each rule has a fixture test with a known-bad input that must fail (research/14 §7.2,
"broken control must fail").

Scope rule for parallel lanes: every gate reads `.github/QR_OWNERSHIP.json`. In fail mode it fails only on
violations in 15-owned paths, or on a new violation introduced by the PR under test (diff-based). Pre-existing
violations in another lane's files are reported, carry a dated allowlist entry tied to a §12.4 request, and fail
only after their expiry date. So turning a gate to fail mode never blocks another lane's unrelated merge.
`qr-no-cross-lane-import` and `no-qr-flags` (CONTRACTS §6.2, §5.4) are program gates with their own schedule.

### 6.13 Recommendation cost summary

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gzip) | Mobile impact | Fallback strategy |
|---|---|---|---|---|---|---|---|---|
| R1 | One `Renderer`, one device per backend; delete 9 front-ends and `LeanWebGL2Device` | Every route and template renders through the path PRDs 01-03 fix; fixes stop drifting | 0 | 0 | −1 device copy in bundle; −VAO/program duplication when apps mixed paths | −35 to −50 KB (device fork plus wrappers; measured in Phase 4) | Smaller parse; identical GPU work | None; mount failure throws with overlay |
| R2 | Agent-api split into nodes/compiler/app/devtools | Precondition for every visual PRD to wire once | 0 | 0 | 0 | −5 to −15 KB (no `export *` fan-in) | Parse win | n/a (pure moves) |
| R3 | One compiler with an exhaustive handler table and option-sensitivity tests | Dropped calls reach pixels (lean lights/env, exposure, instance size) | 0 directly | ≤ 0.6 ms per 500 nodes update on Medium (dirty-skipping) | +≤ 1 MB cached source | 0 | CPU win from dirty-skipping | Unknown kind throws |
| R4 | Remove silent fallbacks; typed degradations; strict captures | No degraded frame ships unnoticed; captures stop passing on degraded output | 0 | 0 | 0 | −30 to −40 KB (fallback renderer) | Error overlay on mount failure | Explicit `capability-degraded` only |
| R5 | Root "." ≤ 350 values; `./devtools`; ≤ 16 subpaths | Agents find the real API; fewer wrong-path scenes (research/12) | 0 | 0 | 0 | −20 to −60 KB on routes that pulled evidence helpers through the barrel (measured) | Parse win | Deprecated aliases for one minor |
| R6 | Delete `@aura3d/lean` second API | Default `create-aura3d` scene lit, with IBL and shadows | +0.5-1.5 ms Medium versus lightless lean | +0.1 ms | +env map (C-09 neutral room) | Starter 77.5 → ≤ 190 KB initial | Low tier caps shadows/env (C-27) | None |
| R7 | three-compat → CLI codemod with computed report | None (honesty) | 0 | 0 | 0 | 0 npm; +15 KB CLI | n/a | None |
| R8 | Generated resolution maps plus packed-consumer check | Templates that render in-repo also render from npm | 0 | 0 | 0 | 0 | n/a | n/a |
| R9 | Build hygiene (`noEmit`, dist without tests/tools, orphan maps) | None | 0 | 0 | 0 | −dist size (tests/tools no longer shipped; measured) | n/a | n/a |
| R10 | Scripts ≤ 80, tools ≤ 60, behaviour gates | None directly; removes the gates that hid visual loss | 0 | 0 | 0 | 0 | n/a | Single revertable commit per family |

## 7. APIs to add, change, remove

### 7.1 `@aura3d/engine` "." (agent-facing)

Frozen-contract note: `strict`, `onDegradation`, the renderer option additions and the `AuraApp` extension members
are pre-declared by PR 0a (C-38). `AuraDegradation`/`AuraCompiledFeature` are C-36 (the C-36 union is
authoritative and also allows `` `${"world"|"vfx"|"look"}.${string}` ``). `diagnostics()` sections are C-31.
Nothing here changes a frozen signature; any addition beyond C-36/C-37/C-38 goes through a CCR (CONTRACTS §6.4).

```ts
// ---- App creation (change) ----
export interface AuraCreateAppOptions {
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  readonly renderer?: AuraCreateAppRendererOptions;   // C-38 pre-declared additions; semantics per field owner (C-05 01, C-27 11, C-13 03)
  readonly strict?: boolean;                          // C-36/C-38; default true iff A3D_QR_STRICT on (§6.5)
  readonly onDegradation?: (d: AuraDegradation) => void; // C-38
  // ...existing fields unchanged (assets, camera, input, audio, physics, ui)...
}
export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp;      // signature unchanged
export function createGameApp(target: AuraAppTarget, options: AuraCreateGameAppOptions): GameAppRuntime<AuraApp>; // unchanged

export interface AuraApp {
  // ...existing...
  diagnostics(): AuraAppDiagnostics;                  // gains `degradations`, `compiledFeatures`
}
export interface AuraAppDiagnostics {
  readonly degradations: readonly AuraDegradation[];   // NEW
  readonly compiledFeatures: readonly AuraCompiledFeature[]; // NEW: what the compiler actually emitted
  readonly renderer: AuraRendererDiagnosticReport;     // C-31 sections "output"/"resolution"/"programs" (01); no claim-boundary prose fields
}

export type AuraCompiledFeature =
  | "lights.directional" | "lights.point" | "lights.spot" | "lights.ambient" | "lights.hemisphere"
  | "environment.ibl" | "environment.background" | "shadows.directional" | "shadows.csm" | "shadows.spot" | "shadows.point"
  | "fog" | "post.bloom" | "post.ao" | "post.ssr" | "post.dof" | "post.taa" | "post.smaa" | "post.fxaa" | "post.colorGrade"
  | "instancing" | "skinning" | "morph" | "text.sdf" | "particles" | "water" | "sky.dayNight" | "weather";

// ---- Errors (add/change) ----
export class AuraRuntimeError extends Error {
  readonly code: AuraRuntimeErrorCode;                // "backend-fallback" REMOVED; "renderer-mount-failed", "unknown-node-kind" ADDED
}
export class AuraMigrationError extends Error {       // NEW
  readonly removedApi: string;                        // e.g. "renderer.mode", "@aura3d/lean"
  readonly replacement: string;                       // e.g. "renderer.quality", "@aura3d/engine"
  readonly prd: number;                               // owning lane of the removed API (15 for every removal in §11)
}
export type AuraDegradationCode = /* §6.5 */;
export interface AuraDegradation { /* §6.5 */ }

// ---- Removed from "." (types and values) ----
// AuraRendererMode, AuraRendererFallbackMode           → AuraMigrationError when passed with A3D_QR_STRICT on (§6.5); removed 4.0.0
// AuraRendererQualityProfile.{supportedInRoot, blockedInRoot, claimBoundary, requestedFeatures, maxRecommendedDrawCalls}
//   → @deprecated via CCR-15-1 in 3.1.0 (types section, 15); the profile values in app/rendererOptions.ts are 11's (Q-11-4); removed 4.0.0
// every name matching the evidence regex (§6.6) → "./devtools"
// sceneKitPerformanceBudgets, helperPerformanceBudgets  → "./devtools" (declarative constants, research/07 §0.8)
```

### 7.2 `@aura3d/engine/renderer` (new; replaces 6 subpaths)

The subpath is reserved in PR 0a (CONTRACTS §3.8) and its entry file `packages/engine/src/public/renderer.ts` is
PRD 15's. It is a **re-export surface**: PRD 15 defines no `Renderer` members. `create`, `backend`,
`renderFrame`/`renderFrameAsync` and the lifecycle trio are C-29 (provider 11; PR 0b-2 stubs). `capture` and
`setOutput` are C-05 (provider 01). `resetTemporalHistory` is C-14 (provider 03). The block below is the
consumer-facing shape this lane exports and type-tests (`tests/qr/prd15/renderer-surface.test-d.ts`); where it
differs from C-29, C-29 wins.

```ts
export type RendererBackend = "webgl2" | "webgpu" | "auto";
export type { RendererCreateOptions, RendererFrameResult, RendererLifecycle } from "@aura3d/rendering/contracts"; // C-29
// RendererCreateOptions (C-29): canvas, width?, height?, backend? ("auto" picks WebGPU only on ultra with
// A3D_QR_WEBGPU on), antialias?, powerPreference?, errorCheckMode?. No preserveDrawingBuffer: capture is C-05.
export class Renderer {
  static create(options: RendererCreateOptions): Promise<Renderer>;           // C-29
  readonly backend: "webgl2" | "webgpu";                                       // C-29
  renderFrame(frame: RendererInput): RendererFrameResult;                      // C-29
  renderFrameAsync(frame: RendererInput): Promise<RendererFrameResult>;        // C-29
  /** Existing members, unchanged (Renderer.ts:501, :525, :539-541, :885). */
  render(source: RenderSource | Iterable<RenderItem> | Scene | A3DScene, camera?: CameraLike): RenderDeviceDiagnostics;
  resize(width: number, height: number): void;
  resizeToDisplay(options?: ResizeToDisplayOptions): ResizeToDisplayResult;
  startAnimationLoop(callback: (timeMs: number, renderer: Renderer) => void): RendererAnimationLoop;
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>; // C-05
  onDeviceLost(listener: () => void): () => void;                              // C-29
  onDeviceRestored(listener: () => void): () => void;                          // C-29
  isDeviceLost(): boolean;                                                     // C-29
  resetTemporalHistory(reason?: string): void;                                 // C-14
  getDiagnostics(): RenderDeviceDiagnostics;
  dispose(): void;
}
/** @deprecated 3.1.0, removed 4.0.0. Alias of Renderer. */
export const A3DRenderer: typeof Renderer;
/** @deprecated */ export type A3DRenderer = Renderer;
/** @deprecated */ export type A3DRendererOptions = RendererCreateOptions;
export { A3DScene, Scene, createECSRenderSource };   // low-level RenderSource producers
export type { RenderSource, RenderItem, RenderDeviceDiagnostics, CameraLike };
// materials/geometry/texture/environment classes the compiler emits (curated list generated from compiler imports)
```

Removed from `@aura3d/rendering` public surface (internal package after 4.0.0):
`ProductionRuntimeRenderer`, `ProductionWebGL2Renderer`, `ProductionWebGPURenderer` (internal to
`Renderer.create({backend:"webgpu"})`), `CurrentRoutesInteractiveRenderer`, `AdvancedRenderer`,
`LeanProductionRenderer`, `LeanProductRenderer`, `LeanWebGL2Device`, `RuntimeParityFrameRenderResult`
(renamed `RendererFrameResult`), `ProductionRendererInput` (replaced by the existing `RendererInput`),
`CurrentRoutesRendererTimingDiagnostics` (renamed `RendererTimingDiagnostics`), all 83 `ExternalParity*`
names (deleted or moved to `./devtools`), and the 31 orphan barrel-only files (Appendix A, D-10).

### 7.3 `@aura3d/engine/devtools` (new)

```ts
export function collectGameRuntimeEvidence(app: AuraApp, options?: GameEvidenceOptions): GameRuntimeEvidence;
export function captureAuraAppScreenshot(app: AuraApp, options?: CaptureOptions): Promise<Blob>;   // wraps app.capture()
export function assertAuraScreenshotNotBlank(image: ImageBitmap | Blob): Promise<void>;           // liveness only; named so
export function createAuraRouteHealth(app: AuraApp): AuraRouteHealth;
export function createDiagnosticsPanel(app: AuraApp, host: HTMLElement): A3DDiagnosticsPanel;
export function rendererFeatureReport(renderer: Renderer): readonly RendererFeatureRow[];       // was ProductionWebGL2Renderer.getFeatures
export function rendererShadowReport(renderer: Renderer): Readonly<Record<string, unknown>> | null; // was getShadowEvidence
// ... every *Evidence/*Report/*Proof/*Readiness/*Audit export moved from "." and "@aura3d/rendering"
```

Constraint: `./devtools` is listed in `aura.exports.json` with `devOnly: true`. The arch gate fails
if any module reachable from "." or "./renderer" imports it.

### 7.4 `@aura3d/cli`

```ts
// aura3d migrate three <glob> [--out <dir>] [--report <file.json>]
export interface ThreeMigrationRow {
  readonly file: string; readonly line: number;
  readonly construct: string;                 // e.g. "new THREE.MeshPhysicalMaterial({transmission})"
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;                   // e.g. "material.glass({ transmission })"
  readonly note?: string;
}
export function migrateThreeSource(source: string, fileName: string): { readonly code: string; readonly rows: readonly ThreeMigrationRow[] };
```

The mapping table (`packages/aura3d-cli/src/migrate-three/mappings.ts`, owner 15) is data. A row's `mapping` is
`"exact"` only if a unit test renders both the three construct and the emitted Aura3D construct as a
`prd15-migrate-*` C-30 lane scene and the C-30/C-32 perceptual metric (`tools/quality-gate/metrics/`, owner 12)
passes. Until that metric is real, every row ships as `"approximate"` or `"none"`, so nothing waits on it. The
codemod makes no drop-in claim, and README text must say so.

CLI wiring: `aura3d migrate three`, and `aura3d codemod <name>` for `renderer-imports`, `lean-imports`,
`devtools-imports`, `renderer-mode`, `create-a3d-app` and `engine-entry-imports`, register through C-39
(`registerCliCommand`/`registerCodemod`) from `packages/aura3d-cli/src/commands/prd15/index.ts`. The codemod
bodies live in 15-owned `packages/aura3d-cli/src/{codemods,migrate-three}/`. `cli.ts` (owner 05) is not edited; the
PR 0b-3 fallthrough dispatches the verbs.

### 7.5 `@aura3d/lean` (deprecated → removed)

```ts
// 3.1.0: packages/lean/src/index.ts, product.ts, game.ts
/** @deprecated Use "@aura3d/engine". Removed in 4.0.0. */
export { createAuraApp, scene, model, primitives, material, lights, camera, environments, interactions, defineAuraAssets } from "@aura3d/engine";
// 4.0.0: package deleted; import throws module-not-found; create-aura3d templates no longer reference it.
```

## 8. Shader changes

This PRD writes no new shading math. Its shader changes are deletions in 15-owned files plus a gate, so that
the C-02 program generator (provider 01) is the only source of GLSL in the WebGL2 path. Shader files owned by
other lanes are touched only through requests:

1. **Delete the fallback renderer's GLSL** (`agent-api/index.ts:16681-16975`, owner 15): a single-light program
   with `u_lightDirection`, a backdrop program (`createWebGLBackdrop` `:16215`), a particle program
   (`:16548`) and `compileShader` (`:16977`). After deletion, `rg -n "#version 300 es" packages/engine/src`
   returns 0. The deletion lands at `A3D_QR_STRICT` removal (§6.5). Until then the code is unreachable with the
   flag on. Arch gate rule `glsl-location` asserts that GLSL template strings exist only under C-02 chunk
   locations (`packages/rendering/src/program/chunks/`, `shaders/**`, the lane chunk directories in CONTRACTS §4.1)
   and the post/output modules. The allowlist is data in `tools/arch-gates/rules/glsl-location.allow.json` (15),
   so a new lane chunk directory needs no edit to another lane's file.
2. **Delete `LeanWebGL2Device.ts`'s duplicated present/tone-map shaders** (the fake `agx()`/`neutral()`
   at `:3320-3338`, plus its copy of the present shader). The file is 15's, and it is deleted whole (D-02). The
   single tone-map shader is C-05 (01).
3. **One shader library.** `ShaderLibraryCore.ts` (904 lines, owner 01, frozen legacy per CONTRACTS §3.7) exists
   for the lean bundle (research/13 §1.3 table). After the lean renderers are deleted it has no lean consumer.
   Its deletion or fold-in is request Q-01-4, executed by 01 at `A3D_QR_CORE` removal. This lane's gate
   `single-shader-registry` reports any second registry of named programs (`registerShader(`/`ShaderLibrary`
   instances) outside `program/ProgramCache.ts`, with the frozen legacy files allowlisted until that removal.
4. **WGSL placeholders.** `production-runtime/shaders/wgsl/pbr.wgsl` (3 lines, outputs `abs(normal)`)
   and `skybox.wgsl` (2 lines, constant colour) are owned by 11 (`production-runtime/shaders/wgsl/`). Their deletion
   and the move of `postprocess.wgsl` (real TAA) under `rendering/src/webgpu/` are request Q-11-1 (research/07 §1).
5. **Program naming.** Generated program keys carry no workstream names (`external-parity-*`,
   `current-routes-*`, `production-*`). Keys are C-02 `ProgramKey`s (01). This lane adds only the gate rule
   `program-key-names` over `diagnostics().programs` (C-31 section, 01), in report mode until C-02 is real.

GPU effect: none. The game path already uses the core programs. Lean-template routes switch from
`LeanWebGL2Device` programs to the engine's programs, so they gain lighting (§6.7).

## 9. Rendering changes

Pixel-affecting changes this PRD makes (everything else is pixel-neutral by construction and verified
in §16.1):

| Change | Where | Expected pixel change | Verified by |
|---|---|---|---|
| Instance transforms include `node.size` | `compiler/primitives.ts` (from `index.ts:14747`): `const localNode = { kind: "primitive", primitive: node.primitive, size: node.size, ...transform }` and then `createModelMatrix(localNode, unitBounds, false, 0)` | `16-instancing`: field covers the full ground plane, pillars have their authored heights (research/23 16-instancing rows 1-2; research/22) | unit test `compiler/primitives.test.ts` comparing matrix `[0]`,`[5]`,`[10]` to `size ⊙ transform.scale`; benchmark scene 16 vision rerun |
| Lean entry renders through `Renderer` with lights, environment and rotation | `packages/lean/*` re-export | `templates/product-viewer` gets IBL and shadow; `mini-game` gets a key light once 13 applies Q-13-1 (this lane proves it on its own fixture copies, §16.3) | template captures §16.3 |
| Silent fallback removed (with `A3D_QR_STRICT` on) | `app/mountRenderer.ts` (from `createProductionSceneRenderer`, `index.ts:12523`) | No route can render with the one-light shader. Any route that did so today now shows an error overlay | strict capture of 18 games and 18 scenes: `degradations.length === 0` and no overlay |
| `A3DRenderer` #1 apps move to `Renderer` | 32 apps | none intended (same `Renderer` underneath) | pixel-neutral capture of 6 representative apps (§16.1) |
| `@aura3d/lean` primitive rotation | via engine builders | rotated primitives in lean-based templates now rotate | template capture |

Not changed here: tone mapping, IBL, shadows, post, materials, geometry tessellation, DPR. Those are
PRDs 01-04, 11.

## 10. Migration plan

Order is chosen so that each step is pixel-neutral or pixel-improving and individually revertable. "Order"
here is this lane's internal sequence only. No step waits on another lane: steps 1-2 and the 15-owned parts of
3-8 can start on day 0 in parallel branches; cross-lane effects go through contracts and §12.4 requests.

1. **Measure and freeze.** PR 0 plus IC-0 (2026-10-08) is the program baseline (CONTRACTS §7). This lane
   records export counts, bundle sizes (§17 method), script and tool counts. The IC-0 capture is the
   pixel-neutral baseline (run 37289688772 stays the noise reference).
2. **Generated resolution maps first** (Phase 1). In-repo and published "." are made identical by the union
   step in §6.6 (the 77 repo-only names become deprecated published re-exports), so no consumer in another lane's
   files breaks. Consumers move to `./renderer`, `./assets` or `./devtools` later through the
   `engine-entry-imports` codemod (Phase 5).
3. **Renderer fold-in** (Phase 2), with deprecated aliases. Then the codemod for the 32 `A3DRenderer`
   apps and the 8 `createA3DApp` consumers.
4. **Agent-api split** (Phase 3) as pure moves, then the compiler (handler table, option coverage).
5. **Silent fallback removal and lean collapse** (Phase 4). After this no second render path exists.
6. **Surface trim** (Phase 5): `./devtools`, export budgets, subpath removal with deprecation aliases.
7. **three-compat, environments, materials, duplicates** (Phase 6).
8. **Process pruning** (Phase 7): scripts, tools, orphan maps, build config.
9. **4.0.0 removal** (Phase 8): delete deprecated aliases and packages after one minor release and the
   window in §11.

Codemods (in `packages/aura3d-cli/src/codemods/`, registered through C-39 from `src/commands/prd15/index.ts`, run
via `aura3d codemod <name> <glob>`; this lane runs them on 15-owned files and other owners run them on theirs):
- `engine-entry-imports`: imports of the 77 repo-only names (§2.3) → their §6.6 destination subpath.
- `renderer-imports`: `@aura3d/engine/advanced-runtime` | `/production-runtime` |
  `/rendering/advanced-runtime` | `/rendering/production-runtime` → `@aura3d/engine/renderer`;
  `A3DRenderer` → `Renderer`.
- `lean-imports`: `@aura3d/lean` | `/product` | `/game` | `@aura3d/engine/lean*` → `@aura3d/engine`.
- `devtools-imports`: any import of a name that moved to `./devtools` is rewritten (the moved-name list
  is generated from the export manifest diff).
- `renderer-mode`: removes `renderer.mode`/`renderer.fallback` and maps `qualityProfile:"safe-basic"`
  to `quality:"low"` (C-27 tier mapping).
- `create-a3d-app`: `createA3DApp(...)` → `createAuraApp(...)` when the options map one-to-one, else it
  inserts a TODO with the unmapped fields.

Each codemod has unit tests on fixtures copied from real consumers (for example
`apps/loader-gltf-variants/src/main.ts`, `templates/external-parity-asset-gallery/src/main.ts`).

## 11. Backward compatibility

Versioning: the deprecations ship in **3.1.0**. Removals ship in **4.0.0**, no earlier than one minor
release **and** 4 weeks after 3.1.0 is published (the history shows one release every ~3.4 days,
research/01 P8; a 4-week floor stops that cadence from collapsing the window).

| API | 3.1.0 | 4.0.0 |
|---|---|---|
| `renderer.mode`, `renderer.fallback`, `AuraRendererMode`, `AuraRendererFallbackMode` | throw `AuraMigrationError` when `A3D_QR_STRICT` is on (no grace period, because the fallback is the defect); `@deprecated` otherwise | types removed |
| `@aura3d/engine/advanced-runtime`, `/production-runtime`, `/rendering/advanced-runtime`, `/rendering/production-runtime`, `/rendering/webgpu` | re-export `./renderer` plus one-time `console.warn` | removed |
| `A3DRenderer`, `A3DRendererOptions` | alias of `Renderer` | removed |
| `A3DRenderer` #2 (production-runtime) | alias of `Renderer` (the production-runtime subpath re-exports `./renderer`) | removed |
| `@aura3d/lean`, `/product`, `/game`, `@aura3d/engine/lean`, `/lean-product`, `/lean-game` | re-export "." builders plus warn | removed |
| `@aura3d/engine/engine`, `/engine-runtime` | re-export "." + `./renderer` + `./devtools` (the 1,803-name superset) plus warn | removed |
| Alias subpaths `./workflows/production-runtime`, `./assets/production-runtime`, `./editor` | re-export targets | removed |
| `./scene-kits/*`, `./media-node`, `./create-aura3d`, `./apps`, `./environments`, `./materials`, `./product-studio`, `./debug`, `./core`, `./assets/asset-corpus`, `./assets/advanced-gallery`, `./assets/gltf-runtime` | re-export, or `./devtools` for diagnostics | removed or folded |
| Evidence names on "." | still exported, `@deprecated` JSDoc pointing to `./devtools` | removed from "." |
| `createA3DApp`, `workflows`, `createEnvironment` | `@deprecated`, still exported from `./engine` alias | deleted |
| `@aura3d/three-compat` | not published under root `files` today; workspace package marked `private: true` and deprecated | deleted |
| `create-aura3d --template three-compat-*` | mapped to renamed templates plus warning | mapping removed |
| `packages/input/src/controls/*` | re-export `@aura3d/controls` | deleted |

Every deprecation is listed in `docs/MIGRATION-4.0.md` (generated from `aura.exports.json`
`deprecated` plus a hand table for behaviour changes). `MIGRATION-2.0.md` is deleted, because it
recommends the lighting-free lean path.

Behaviour changes that are not API removals: once `A3D_QR_STRICT` reaches `integrated-accepted` (default on for
new apps, CONTRACTS §5.3), `strict: true` is the default, so an app whose texture upgrade fails throws instead of
rendering scalar materials. It is called out in the migration doc with the one-line opt-out (`strict: false`).
Existing routes stay non-strict until they opt in or the flag reaches `default-on`.

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" list is replaced by contracts (CONTRACTS §1 rule 1). PRD 15 builds
against each consumed contract's PR 0 stub and never waits for a provider's real implementation. What a stub can
and cannot show decides whether a criterion is standalone (§16) or integrated (§16A).

### 12.1 Contracts provided

| ID | Name | Consumers | Stub that must keep working (PR 0) | Real (PRD 15) | Conformance |
|---|---|---|---|---|---|
| C-36 | SceneCompiler extension points: `registerNodeHandler`, `SceneCompileContext`, `CompiledScene`, `RenderSourceContributions`, `AuraDegradation`, `AuraCompiledFeature`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage`, `compileScene`, `updateCompiledScene` | 01, 02, 03, 04, 05, 06, 07, 10, 11, 13 | PR 0b-1: `compileScene`/`updateCompiledScene` wrap the moved `createProductionRuntimeSceneRenderer` (`index.ts:13540-13841`) and `createProductionRuntimeRendererInput` (`:13842-14012`). Handlers for new kinds run. Existing kinds keep the legacy path unless a handler for that kind is registered and its flag is on. Unknown kind → `option-ignored` (non-strict) | `compiler/compileScene.ts`, `compiler/handlers.ts`, `compiler/optionCoverage.ts`, per-node version counters, typed degradations, behind `A3D_QR_COMPILER` / `A3D_QR_STRICT` | `tests/unit/contracts/C-36-compiler.test.ts` (unknown kind; option coverage; strictness; flag-off byte-equal `RenderSource` on the 18 base snapshots), `tests/unit/agent-api/optionCoverage.test.ts` |
| C-37 | RuntimeNode `add`/`remove`/`version`, `registerNodeHandleExtension`, `AuraNodeHandleExtensionMap` | 06, 07, 08, 09, 10, 14 | PR 0b-1: `add`/`remove` append to the snapshot and call the existing `setScene` path (`index.ts:11480-11492`); diagnostic `RUNTIME_ADD_REMOUNT`; `version` real; `timeScale` field = 1; `teleport` = `setPosition` + `interpolate=false` one frame; `setInstanceTransforms` via the existing instanced-node update | Subtree add/remove on the compiler with per-node version counters (no remount) | `tests/unit/contracts/C-37-runtime-nodes.test.ts`, `tests/browser/contracts/C-37-add-remove.spec.ts` (no blank frame during add, real only) |
| C-38 | App surface extension registry: `registerAppExtension`, `AuraAppExtensionMap`, pre-declared `AuraCreateAppOptions`/renderer option additions, flattened `AuraApp` methods | every engine lane | Real in PR 0 (infrastructure). Stub factories for each member are registered under owner `prd15` with the provider lane's flag | Same; `app/createAuraApp.ts` calls the registry once per app | `tests/unit/contracts/C-38-app-extensions.test.ts` |
| C-39 | CLI command, codemod and doctor-rule registry | 01, 02, 03, 04, 05, 06, 08, 09, 10, 11, 13 | Real in PR 0 (`packages/aura3d-cli/src/commands/registry.ts`, fallthrough in PR 0b-3) | Same | `tests/unit/contracts/C-39-cli.test.ts` |

Registry entries PRD 15 provides into other contracts:
- C-31 sections `degradations`, `compiledFeatures` and `qrFlags` (CONTRACTS C-31 key list).
- C-39 commands `migrate three`, and codemods `renderer-imports`, `lean-imports`, `devtools-imports`,
  `renderer-mode`, `create-a3d-app` and `engine-entry-imports`.
- C-30 lane scenes `prd15-*`: `prd15-lean-product`, `prd15-lean-minigame`, `prd15-instancing-size`, and
  `prd15-migrate-*` rows when they exist.
- C-40 facts F-15-*: subpath list, deprecations, `strict` semantics, codemod names.

### 12.2 Custodian duties (not contracts, but provided by this lane)

| Duty | Artifact | Stub/real |
|---|---|---|
| Frozen contract files and stubs for C-01..C-39 | every `packages/*/src/contracts/` (CONTRACTS §2.1) | PR 0a creates them; afterwards edits only by CCR (§6.4), which this lane approves within one working day |
| Conformance harness and suites | `tests/unit/contracts/C-NN-*.test.ts`, `tests/browser/contracts/*.spec.ts` | Pass against stubs in PR 0; providers add `impl/prdNN-*` |
| Ownership enforcement | `.github/QR_OWNERSHIP.json`, `tools/qr-ownership/check.mjs`, `.github/workflows/qr-contracts.yml` | Real in PR 0a |
| Flag state | `packages/rendering/src/contracts/flags.state.ts` transitions at checkpoints | Real; changed only from checkpoint records (CONTRACTS §5.3) |
| Arch gates the program relies on | `qr-no-cross-lane-import` (warn in PR 0a, error at IC-1), `no-qr-flags` (release) | Real |
| Root manifest batch | root `package.json` daily batch PR of `root-manifest` requests (CONTRACTS §4.4) | Real |
| Lane barrels | `packages/{rendering,engine,assets,animation}/src/lanes/index.ts` | Real in PR 0a |

### 12.3 Contracts consumed

| ID | Name | Provider | What PRD 15 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-02 | ProgramFeatures / `ProgramKey` / ProgramCache | 01 | `program-key-names` and `single-shader-registry` gate inputs | Cache wraps `ShaderLibrary`; keys are legacy names | Gates run in report mode until C-02 is real; standalone acceptance does not include them in fail mode |
| C-05 | Output: `capture()` | 01 | Removing `preserveDrawingBuffer: true` from the bridge (`index.ts:13593`) | `capture()` = `canvas.toBlob` after a synchronous render, which works without a preserved buffer | Standalone (§16.1 identity on the 36 captures with the option removed) |
| C-06 | Scene graph transforms + color parsing | 01 | `compiler/primitives.ts` instance matrices (T3.10), the three-compat codemod's `rotationOrder` | `composeWorldMatrix` delegates to existing `eulerToQuat` (`index.ts:5345`) with ZYX | Standalone |
| C-14 | `resetTemporalHistory` | 03 | Re-exported on `./renderer` | Present; no-op until temporal history is real | Type-only standalone |
| C-17 | Asset manifest 1.1 | 05 | Lean shim typegen continues to read `aura.assets.json` | Reader accepts 1.1 and ignores unknown fields; writer emits 1.0 | Standalone |
| C-27 | QualityTier settings | 11 | `SceneCompileContext.quality`; §17 budgets per tier; `renderer-mode` codemod target `quality:"low"` | `QUALITY_TIERS` ships real (data); `"auto"` → high desktop / medium coarse pointer | Standalone |
| C-28 | Device counters, FrameStats | 11 | `compileScene` CPU budget, 0 compiles after ready, readback count in §17 | Counters partial (`drawCalls`, `bufferCreates`, `textureBytes`); FrameStats real; `gpuMs` null | CPU budgets standalone; GPU ms deltas integrated |
| C-29 | Renderer factory / backends / frame API / device lifecycle | 11 | `Renderer.create({backend})`, `renderFrame`, `onDeviceLost`; `single-renderer` gate; `./renderer` exports | PR 0b-2 delegating stubs: `create` keeps today's `Renderer.create` (`Renderer.ts:472`) and selection; `renderFrame` wraps `render()`; lifecycle attaches to `WebGL2Device.ts:417-445` listeners | Standalone for WebGL2. WebGPU through `Renderer.create` integrated (§16A) |
| C-30 | Benchmark scene registry, `ReadyPayloadV2.qrFlags` | 12 | Lane scenes `prd15-*`; the 18 base scenes for §16.1 | `REGISTRY` wraps the 18 scenes plus lane indices | Standalone |
| C-31 | Diagnostics schema + sections registry | 12 | `diagnostics()` assembly in `app/createAuraApp.ts`; this lane's sections | Keys present with null/empty; `qrFlags`, `degradations` real | Standalone |
| C-32 | VisualReview judgement schema | 12 | Pairwise neutrality review records (§16.1) | Schema real; screening only | Standalone screening; acceptance at G-PANEL is integrated |
| C-33 | Capture harness, `--flags`, step plugins | 12 | All captures with `qr_flags=none|strict|all` | Today's `capture-games.mjs`/`capture.mjs` plus `--flags` passthrough (PR 0b-3) | Standalone |
| C-40 | Facts handoff | each lane → 13 | Publishes F-15-* rows | n/a | — |

PRD 15 does not consume C-09, C-10, C-11, C-13, C-15, C-19, C-20 or C-21 as APIs. Their providers register
handlers and members **into** C-36/C-37/C-38. This lane's obligation is that the stub path keeps working and
the handler for a kind wins only when its flag is on.

Conflicts resolved by CONTRACTS §0 that changed this PRD: R14 (PRD 15 implements `add`/`remove`), R18 (PRD 15 fixes
the instance-size bug in `compiler/primitives.ts`, unflagged, declared correctness fix), R19 (PRD 11 owns the
backend factory and device lifecycle; PRD 15 consumes C-29), R7/R8 (scene kits are 02's, prompt plan and generated
code warnings are 13's), R20 (templates and skills are 13's), R21 (routes are 14's).

### 12.4 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5) with the exact patch or report attached. PRD 15 never
waits: each row says what this lane does meanwhile and which criterion moves to the next checkpoint after it lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | Port the `bugfix`-classified lines of `docs/architecture/lean-device-diff.md` (T2.3) into `WebGL2Device.ts`, one test per line range | §3.4, §4.2 | `LeanWebGL2Device.ts` is deleted anyway once lean re-exports engine (T4.8); unported fixes are listed per checkpoint |
| Q-01-2 | 01 | Any `A3DRenderer` member that `Renderer` lacks (T2.9 diff) and cannot be a free function | C-29 surface | Free function in `advanced-runtime/a3dCompat.ts` or codemod rewrite |
| Q-01-3 | 01 | `PbrReference.ts` (842 lines, barrel-only orphan): delete, or import `Vec3` from `@aura3d/scene/math` | — | `unique-ownership` allowlists that `Vec3` with a date |
| Q-01-4 | 01 | Fold or delete `ShaderLibraryCore.ts` at `A3D_QR_CORE` removal (no lean consumer remains after T4.8) | §3.7 | `single-shader-registry` allowlists the frozen legacy files |
| Q-01-5 | 01 | Merge the verbatim move of the model matrix and transforms (`index.ts:17637-18010`) into 01-owned `compiler/sceneGraph.ts`, if PR 0b-1 did not carve it (patch attached by T3.8) | C-06 | Range stays in `index.ts`; excluded from the T3.9 line target |
| Q-02-1 | 02 | Move `production-runtime/PBRHDRPipeline.ts` to `environment/hdrEnvironment.ts` | C-09 | `./renderer` re-exports the current path |
| Q-02-2 | 02 | Relocate `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts` into `packages/rendering/src/environment/` (or declare them kept, in which case `@aura3d/environments` stays as a 02-owned package); decide `shadows/CascadeHysteresis.ts` (keep and wire, not delete) | C-09 | PRD 15 deletes only its own files in the package; `deps-truth` reports the package |
| Q-04-1 | 04 | In `compiler/textures.ts`, replace the `catch` bodies of `upgradeProductionPrimitiveTextures` (from `index.ts:14174`) and `createSdfTextPrimitiveResource` (from `:14571`) with `ctx.degrade({ code: "texture-upgrade-failed" \| "sdf-text-fallback", … })` | C-36 | Those two codes keep the legacy warning string; §16.1 strict captures report them via the C-36 stub's warning scan |
| Q-04-2 | 04 | `nodes/material.ts` reads the unified `MaterialPresets.ts` registry; review merged values | C-15 | Registry exported and tested, unused by `material.*` |
| Q-05-1 | 05 | `packages/aura3d-cli/src/asset-manifest.ts:112-125` always emits `@aura3d/engine` | C-17 | `@aura3d/lean` re-exports engine, so generated lean imports still resolve |
| Q-05-2 | 05 | `performance/LOD.ts` (orphan, owner 05): delete or wire for C-17 LOD | — | Listed in D-10 report |
| Q-06-1 | 06 | In `compiler/animation.ts`, replace the `catch` in `applyProductionActorAnimation` (from `index.ts:15121`) with `ctx.degrade({ code: "clip-apply-failed" \| "pose-apply-failed" })` | C-36 | As Q-04-1 |
| Q-06-2 | 06 | Rename or delete `packages/animation/src/AnimationController.ts` export so one owner has the name | — | `unique-ownership` allowlists the pair with a date |
| Q-06-3 | 06 | `packages/animation/src/Keyframe.ts` math imports `@aura3d/scene/math`; property test attached (1,000 random TRS, 1e-6) | — | `unique-ownership` allowlists the duplicates with a date |
| Q-07-1 | 07 | `agent-api/Decals.ts:39,47` import `AuraNodeBuilder` and types from `./nodes/builder.js`/`./nodes/types.js` | — | `no-cycles` allowlists the `Decals.ts ↔ index.ts` SCC with a date |
| Q-07-2 | 07 | `effects/{ResidentGPUParticleRenderer,GPUParticleBackend}.ts` take the `GPUDevice` from `renderer.device` (`:116-118`, `:283,359`) | C-29 | `single-device` allowlist, expires at 4.0.0 |
| Q-09-1 | 09 | Update `tools/public-api-contract/` expectations when "." is trimmed (deprecated names counted separately) | — | Trim stays behind deprecation; public API test stays a superset until 4.0.0 |
| Q-09-2 | 09 | Move `collectGameRuntimeEvidence` (carved to `nodes/game/index.ts`) behind `./devtools` | C-31 | "." keeps a deprecated re-export |
| Q-10-1 | 10 | Relocate `packages/environments/src/BiomeEnvironmentRegistry.ts`; decide orphan `VegetationScatter.ts` | C-26 | As Q-02-2 |
| Q-11-1 | 11 | Delete `production-runtime/shaders/wgsl/{pbr,skybox}.wgsl`, the 2-line `production-runtime/backends/*` shells and `webgpu/WebGPUPipelineCache.ts` (D-09); move `postprocess.wgsl` under `webgpu/`; fold `ProductionWebGPURenderer` into `WebGPUDevice` | C-29 | `single-renderer` allowlists them |
| Q-11-2 | 11 | `packages/materials/src/NodeMaterial.ts`: delete or relocate | — | `@aura3d/materials` keeps only that file until it lands |
| Q-11-3 | 11 | Delete `tools/production-runtime-{template,package-surface}-readiness/` if `script-prune` marks them unreferenced | — | Counted in the integrated tools target |
| Q-11-4 | 11 | Remove claim-boundary values from the profiles in `app/rendererOptions.ts`; decide orphan `performance/FrustumCuller.ts` | C-27 | Fields deprecated by CCR-15-1 |
| Q-12-1 | 12 | Run `renderer-mode`, `engine-entry-imports`, `renderer-imports` and `devtools-imports` on `benchmarks/**` (for example `aura3d/common.ts:291`) | C-39 | Codemod reports attached |
| Q-12-2 | 12 | `quality-rebuild-capture.yml`: `strict` input (appends `aura-strict=1`), strict default for harness runs; workflows that call `verify:architecture` call `arch:check`; Firefox baselines | C-33 | This lane passes `qr_flags=strict`; `verify:architecture` remains as a thin alias script until the switch |
| Q-12-3 | 12 | Delete 12-owned tool dirs and `benchmarks/three-compat/` that `script-prune --report` marks unreferenced; decide whether the frozen r185 `head-to-head` inputs stay | — | Report committed; tools target integrated |
| Q-12-4 | 12 | Add packed `templates/product-viewer` and `templates/mini-game` capture targets to `tools/quality-rebuild-capture` | C-33 | This lane captures its fixtures in `qr-prd15-captures.yml` |
| Q-13-1 | 13 | Run `lean-imports` on `templates/{product-viewer,mini-game}` and the `packages/create-aura3d/templates` copies (16 files); add a key light, environment and shadow-receiving ground to `mini-game` | R20, C-39 | Standalone proof on lane fixtures (§16.3) |
| Q-13-2 | 13 | Run `renderer-imports`, `engine-entry-imports`, `devtools-imports`, `create-a3d-app` on `templates/`, `examples/`, `packages/create-aura3d/` | C-39 | Deprecated aliases keep them compiling |
| Q-13-3 | 13 | `packages/create-aura3d/templates/animation-studio/scripts/` import `@aura3d/engine/assets` instead of a local GLB parser | — | — |
| Q-13-4 | 13 | Delete `templates/three-compat-*` (8); rename `packages/create-aura3d/templates/three-compat-*` to the §6.8 names with a `templateAliases` warning map | R20 | Templates keep working against engine |
| Q-13-5 | 13 | Skills `aura3d-core`, `aura3d-threejs-migration`, `aura3d-performance` updated from verified F-15-* facts | C-40 | Facts published as `proposed` until tests cite them |
| Q-13-6 | 13 | Delete `templates/external-parity-*` (4) | — | Union step keeps them passing `pack:check` |
| Q-14-1 | 14 | Per route: run the codemods, opt into `A3D_QR_STRICT`, and do not add per-game workarounds against paths in Appendix A | R21 | Strict captures of routes use `qr_flags=strict` |
| Q-ALL-1 | owners of `apps/postprocessing-*` (03), `apps/{asset-lookdev,loader-ktx2}` (05), `apps/wow-webgpu-product-viewer` (04), `apps/{webgpu-lab,wow-webgpu-instancing}` (11), `apps/threejs-parity-lab` (12), `apps/common` (09), `apps/showcase-*` (14) | Run `renderer-imports` on their apps; fix declared dependencies in their own `package.json` per the `deps-truth` report | C-39 | Deprecated aliases keep them compiling; `deps-truth` per-package entries report-only until fixed |
| CCR-15-1 | 15 + one consumer | `@deprecated` JSDoc on `AuraRendererMode`, `AuraRendererFallbackMode`, `renderer.mode`/`fallback`, and the `AuraRendererQualityProfile` claim-boundary fields in the frozen types section | C-38 | — |
| CCR-15-2 | 15 + one consumer | Pure move of the frozen types section `index.ts:1-2097` to `agent-api/nodes/types.ts` with name-for-name re-exports (no signature change) | all `index.ts` types | If declined, the section stays and T3.9's line target becomes ≤ 2,400 |

## Parallel execution

### Day-0 start conditions

PRD 15 starts on 2026-10-05 and is the lane that **executes PR 0** (CONTRACTS §3.9). Its day-0 prerequisite is
only the PR 0a branch, which it pushes itself within hours. Nothing from any other lane's real implementation is
needed for any standalone criterion.
- Day 0 (2026-10-05): PR 0a (additive contracts, stubs, conformance suites, ownership map, lane barrels,
  subpath reservations, `packages/game` skeleton). In parallel, on branches cut from PR 0a: Phase 1 (resolution
  truth, all 15-owned files) and the arch-gates, script-prune and codemod tooling (all 15-owned, new files).
- Days 1-2 (2026-10-06..07): PR 0b-1 (agent-api carve-outs and C-36/C-37/C-38/C-31/C-34 seams), PR 0b-2
  (rendering hot-file seams, C-29 delegating stubs), PR 0b-3 (TypedGLBActor/GLTF seams, C-39 fallthrough,
  capture `--flags`). Each is independently mergeable. A carve-out that cannot stay verbatim is dropped from PR
  0b and its region stays with the hot-file owner (CONTRACTS §3.9 size budget).
- 2026-10-08: IC-0 identity run is this lane's pixel-neutral baseline.
- Work that edits a 15-owned region of `agent-api/index.ts` waits only for this lane's own PR 0b-1 merge.

### Owned files and directories (must match CONTRACTS §4.1 row 15 and the lane row)

All `contracts/` folders (`packages/{rendering,engine,assets,animation,audio,aura3d-cli}/src/contracts/`); all
`src/lanes/index.ts`; `packages/engine/src/agent-api/index.ts` and `agent-api/` default (including
`RuntimeNodeHandle.ts`, `RootRuntimeSupport.ts`, `lean*.ts`, `SceneGroundingUtils.ts`); the
`agent-api/{app,compiler,nodes,devtools}/` defaults (lane-owned carve-out files excluded, §6.3); `production-runtime/`
default in engine and rendering (`ProductionRuntimeRenderer.ts`, `ProductionWebGL2Renderer.ts`,
`ProductionEffectsPipeline.ts`, `framegraph/`, both `index.ts`); `production-runtime/actor/extensions.ts`;
`packages/engine/` default (`index.ts`, `public/`, `advanced-runtime/`, `threejs-example-parity/`, `package.json`);
`packages/rendering/src/{lean*,advanced-runtime,threejs-example-parity,diagnostics}`, `LeanWebGL2Device.ts`,
`performance/` default, `cinematic/CinematicMaterialPresets.ts`, `animation/AnimationMaterialStyle.ts`, the orphans
`{RendererVisualPipelineReport,PrimitiveSubmissionAudit,ReflectionSurfaces,VoxelWorld,ScreenSpaceReflectionPass,UniformBinder,MaterialPresets,ArchitecturalMaterialCatalog}.ts`,
`index.ts`, `package.json`; `packages/assets/src/{asset-corpus/ (default),AdvancedAssetCorpus.ts}`;
`packages/{lean,three-compat,editor,editor-runtime,environments (default),materials (default),math (default),scene (default),physics (default)}/`,
`packages/input/src/controls/`, and every unlisted package (including `packages/controls`); 
`packages/aura3d-cli/src/{migrate-three,codemods}/`, `src/commands/registry.ts`; `apps/` default (including
`apps/public-scene`); root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig*.json`,
`vite.config.ts`, `vite.aliases.generated.ts`, `aura.exports.json`, `eslint.config.js`, `eslint/qr/` default;
`README.md`, `BUNDLE_SIZES.md`, `MIGRATION-2.0.md`, `docs/` default (`docs/architecture/`,
`docs/project/migration.md`); `docs/project/aura3d-quality-rebuild/{CONTRACTS.md,AURA3D-QUALITY-MASTER-PLAN.md}`;
`scripts/` default; `public/` default; `fixtures/` default; `tools/` default (`arch-gates`,
`generate-resolution-maps`, `packed-consumer-check`, `script-prune`, `finalize-dist`, `verify-*`, `qr-ownership`,
`bundle-size/lit-scene.ts`); `.github/{QR_OWNERSHIP.json,workflows/qr-contracts.yml,workflows/ci.yml,workflows/test.yml}`.
Generated (CONTRACTS §4.3): `pnpm-lock.yaml`, `tsconfig.paths.generated.json`, `vite.aliases.generated.ts`,
`tools/finalize-dist/manifest.generated.json`.

Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd15,prd-15}/`,
`packages/*/src/lanes/prd15.ts`, `agent-api/compiler/diagnosticOnly.prd15.ts`, `packages/aura3d-cli/src/commands/prd15/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd15/`, `.github/workflows/qr-prd15-*.yml`,
`tests/qr/prd15/`, `tests/unit/contracts/impl/prd15-*`.

Not owned, even though earlier drafts edited them (moved to §12.4): `Renderer.ts`, `WebGL2Device.ts`,
`ShaderLibraryCore.ts`, `PbrReference.ts` (01); `PBRHDRPipeline.ts`, `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts` (02);
`compiler/textures.ts` (04); `asset-manifest.ts`, `cli.ts`, `performance/LOD.ts` (05);
`compiler/animation.ts`, `packages/animation/**` (06); `Decals.ts`, `effects/*` (07); `nodes/game/**` (09);
`BiomeEnvironmentRegistry.ts`, `VegetationScatter.ts` (10); `production-runtime/shaders/wgsl/`,
`production-runtime/backends/`, `webgpu/`, `NodeMaterial.ts`, `app/rendererOptions.ts`,
`renderer/{RendererFactory,DeviceLifecycle}.ts` (11); `quality-rebuild-capture.yml`, `tools/quality-rebuild-capture/`,
`benchmarks/**`, 12-owned `tools/*` and workflows (12); `templates/**`, `examples/**`, `packages/create-aura3d/**`,
skills, `llms.txt` (13); `apps/showcase-*` (14).

### Extension points used in files owned by others

| Host file (owner) | Seam | What PRD 15 does through it |
|---|---|---|
| `renderer/RendererFactory.ts`, `renderer/DeviceLifecycle.ts` (11) | C-29 | Calls `Renderer.create({ backend })`, `renderFrame`, lifecycle from `compiler/renderer.ts` and `app/mountRenderer.ts` |
| `packages/aura3d-cli/src/cli.ts` (05) | C-39 fallthrough (PR 0b-3) | Registers all PRD 15 commands and codemods from `commands/prd15/index.ts` |
| `tools/quality-rebuild-capture/*`, `benchmarks/quality-rebuild/capture.mjs` (12) | C-33 `--flags`, step plugins | Captures with `qr_flags=none|strict|all`; no harness edits |
| `benchmarks/quality-rebuild/shared/registry.ts` (12) | C-30 lane index | Adds `prd15-*` scenes in `scenes/prd15/index.ts` |
| Lane-owned `compiler/*.ts`, `nodes/*.ts` (01-13) | C-36 `registerNodeHandler`, `registerOptionCoverage`, `diagnosticOnly.prdNN.ts` | Hosts; aggregates every lane's `DIAGNOSTIC_ONLY_FIELDS` into the option-coverage gate without editing their files |
| Lane-owned app members (01-11) | C-38 `registerAppExtension` | Hosts; `createAuraApp` resolves stub vs real per flag |
| `quality-rebuild-capture.yml` (12) | `qr_flags` input (PR 0b-3) | Dispatches this lane's identity and strict captures |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_COMPILER` | bool | Real `compileScene`/`updateCompiledScene` (handler table, version-counter dirty skipping), real C-37 subtree `add`/`remove`. Off = the PR 0b-1 wrapper around the moved legacy bridge | — |
| `A3D_QR_STRICT` | bool | `strict` default true, typed degradations throw, `renderer-mount-failed` instead of the safe-basic fallback, `AuraMigrationError` on `renderer.mode`/`fallback` | `strict` option; capture `aura-strict=1` |

Not flagged (declared, CONTRACTS §6.1): the R18 instance-size fix (correctness; PRD 12 re-baselines scene 16), and
pure moves/deletions of unreachable code, which are pixel-neutral by construction and verified by §16.1. Surface
changes (subpaths, exports, packages) are gated by semver deprecation (§11), not by runtime flags.

### Stubs used

C-02 (legacy program keys), C-05 (`capture` via `toBlob` after synchronous render), C-06 (ZYX `eulerToQuat`), C-14
(no-op `resetTemporalHistory`), C-17 (1.1 reader), C-27 (real data), C-28 (partial counters, real FrameStats), C-29
(PR 0b-2 delegating stubs), C-30/C-31/C-32/C-33 (registry over 18 scenes, null sections, capture `--flags`). PRD
15's own contracts C-36 and C-37 keep their stubs as the flag-off path until §5.4 removal; C-38 and C-39 are real
from PR 0.

### Integration checkpoints

Integrated acceptance (§16A) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_COMPILER` and
`A3D_QR_STRICT` on inside `qr_flags=all`, and never blocks a PRD 15 merge:
- IC-0 (2026-10-08): PR 0 identity (`none` vs `85aafcd0`). This lane's standalone acceptance includes it.
- IC-1 (2026-10-15): `qr-no-cross-lane-import` becomes an error (this lane flips it). Screening only.
- IC-2 (2026-10-22), IC-3 (2026-10-29): screening; this lane checks that `all` runs show no `option-ignored`
  degradations on kinds whose owners have registered real handlers.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds. Only these can move `A3D_QR_COMPILER`
  and `A3D_QR_STRICT` to `integrated-accepted`. Leave-one-out (`all,-compiler`) attributes regressions.
- A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane. Open §12.4 requests are listed
  in every checkpoint report.

## 13. Implementation phases

Phases are this lane's internal order. None waits on another lane. Phases 1, 2 (15-owned parts), 6 and 7 tooling
can run on parallel branches from day 0; phase numbering only orders this lane's own merges where one phase's
files are another's inputs.

**Phase 0: PR 0 Contract Bootstrap and baseline (days 0-3, 2026-10-05..08).**
- PR 0a (day 0), PR 0b-1/0b-2/0b-3 (days 1-2), per CONTRACTS §3.9. IC-0 identity run on 2026-10-08.
- Record export counts, subpath count, bundle sizes, script count, tool dir count and `.map` count in
  `docs/project/aura3d-quality-rebuild/evidence/prd15/baselines/phase0.json`.
- Exit: each PR 0 part meets CONTRACTS §3.9 acceptance items 1-5 (typecheck, lint, unit and integration green;
  `public-api-contracts` superset; every conformance suite green on stubs; IC-0 ΔE2000 p99 ≤ the two-capture noise
  floor; `qr-ownership/check.mjs` passes and moved line counts equal source counts). `phase0.json` committed with
  the IC-0 run id.

**Phase 1: One resolution truth (starts day 0).**
- `aura.exports.json`, `generate-resolution-maps`, generated tsconfig/Vite maps. Published "." becomes the union
  (§6.6 sequencing), so in-repo and published "." are identical. `packed-consumer-check` and `arch-gates` (warn
  mode) in `qr-prd15-*` workflows.
- Exit: `resolution:check` green. `pack:check` green for every shipped and create-aura3d template.
  `tsc --noEmit -p tsconfig.check.json` green. §16.1 identity against IC-0 (flags `none`).

**Phase 2: One renderer (15-owned classes; starts day 0 for tooling, day 2 for code that calls C-29).**
- Bridge calls C-29 `Renderer.create`. Delete `ProductionRuntimeRenderer`/`ProductionWebGL2Renderer`,
  `AdvancedRenderer`, `CurrentRoutesInteractiveRenderer`, `A3DRenderer` #2. Alias `A3DRenderer` #1. Move evidence
  methods to devtools. Classify `LeanWebGL2Device` diffs and file Q-01-1. Ship `renderer-imports` and apply it to
  15-owned apps.
- Exit: `single-renderer` gate reports only allowlisted entries (`LeanWebGL2Device`, the safe-basic fallback,
  Q-07-2/Q-11-1 items). §16.1 identity on 18 scenes, 18 games and 6 representative `A3DRenderer` apps.

**Phase 3: Agent-api split and compiler (starts after this lane's PR 0b-1 merge, ≤ day 2).**
- Pure-move commits for the 15-owned regions (§6.3). Real C-36 handler table, `compileScene`/`updateCompiledScene`,
  `optionCoverage.ts` and the option-sensitivity test behind `A3D_QR_COMPILER`. Real C-37 `add`/`remove`. R18
  instance-size fix with its test.
- Exit: `agent-api/index.ts` ≤ 300 lines. `max-file-lines`, `layering` and `no-cycles` green for 15-owned files
  in `packages/engine` (the `Decals.ts` SCC allowlisted until Q-07-1). Option-sensitivity test lists every builder
  field; every unconsumed field is in a `diagnosticOnly.prdNN.ts` file naming its owner. C-36/C-37 conformance green
  for `stub` and `real`. §16.1 identity with `A3D_QR_COMPILER` off and on, except scene 16, which must improve
  (§16.2). CPU budget §17 met.

**Phase 4: No silent fallback, one builder API.**
- Typed degradations, `strict`, and the error overlay behind `A3D_QR_STRICT`. Collapse lean to re-exports. Delete
  `LeanWebGL2Device` and the lean renderers. Ship `lean-imports` and file Q-13-1. Delete
  `createWebGLSceneRenderer` and its helpers at `A3D_QR_STRICT` removal (§5.4 of CONTRACTS; own flag only).
- Exit: with `A3D_QR_STRICT` on, the 36 strict captures show zero degradations from 15-owned sites and no
  fallback-marker program. Lane fixtures `prd15-lean-product` and `prd15-lean-minigame` pass §16.3. Bundle measured
  and recorded against §17. `single-renderer` and `glsl-location` in fail mode for 15-owned files.

**Phase 5: Public surface.**
- `public/index.ts`, `public/renderer.ts`, `public/devtools.ts`. Move 15-owned evidence names. Collapse subpaths to
  ≤ 16 with deprecation aliases. Curate the `@aura3d/rendering` barrel (no `export *` except the two CONTRACTS §3.8
  lines). Delete the 15-owned orphan files. Rename leaking names. Ship `devtools-imports` and
  `engine-entry-imports`.
- Exit: `export-budget`, `no-evidence-in-runtime` and `unique-ownership` green with dated allowlists only for
  §12.4 items. `pack:check` green. 3.1.0 release candidate built.

**Phase 6: Honest packages and single implementations.**
- three-compat → CLI codemod. Delete `@aura3d/editor` (1-line alias), the 15-owned parts of
  `@aura3d/environments` and `@aura3d/materials`. Unify math in 15-owned packages, controls, glTF parsing in the
  15-owned corpus, and the preset registry. Fix 15-owned dependency declarations.
- Exit: `migrate three` codemod tests green. `deps-truth` and `unique-ownership` green except dated entries tied to
  open §12.4 requests. README and docs have no "faithful"/"parity" claims for three-compat.

**Phase 7: Process pruning and build hygiene.**
- `noEmit` base, build tsconfig without tests/tools, orphan map deletion, `src-clean`. `script-prune` apply
  (≤ 80 root scripts). Delete 15-owned unreferenced tool dirs; file Q-11-3/Q-12-3 for the rest. Unwrap
  `build`/`typecheck`. `arch-gates` in fail mode in `ci.yml` (15-owned).
- Exit: all arch gates green in fail mode on GitHub Actions. ≤ 80 root scripts. Every 15-owned tool dir is
  referenced. CI workflows reference only existing scripts (`script-prune --check`).

**Phase 8: 4.0.0 removal.**
- After the §11 window: delete aliases, `packages/lean`, deprecated subpaths and the `./engine` superset; remove each
  deprecated "." name that has no remaining in-repo consumer (§6.6 step 3).
- Exit: 4.0.0 packed-consumer check green. 36 strict captures identical to the Phase 7 captures (§16.1). Migration
  doc complete, listing every carried-over deprecated name with its open request.

## 14. Task checklist

Conventions: "pixel-neutral" means §16.1 passes. "Captures" means the `quality-rebuild-capture`
workflow on macos-14 (18 games) plus `benchmarks/quality-rebuild` (18 scenes). Every task lands as
its own commit unless grouped.

### Phase 0
- [ ] T0.A PR 0a (day 0): create every file in CONTRACTS §3.9 PR 0a items 1-7 exactly as listed, with each stub implementing only its catalog "Stub" paragraph. Run `pnpm typecheck:raw`, `pnpm lint`, `pnpm test:unit` on GH Actions (`qr-contracts.yml`). Push the branch before any other work so other lanes can branch from it.
- [ ] T0.B PR 0b-1: carve the `agent-api/index.ts` ranges of CONTRACTS §3.2 into the listed target modules, byte-identical bodies (only imports/`export` change), the original file re-exporting every moved public symbol. Add the C-36 (`compileScene` wrapper), C-37 (stub `add`/`remove`), C-38 (registry call in `createAuraApp`), C-31 (sections) and C-34 seams. Attach the moved-line-count script output to the PR description.
- [ ] T0.C PR 0b-2: rendering hot-file carve-outs (CONTRACTS §3.3-§3.5, §3.7) and the C-01, C-09, C-11, C-12, C-13, C-16, C-18, C-28 and C-29 seams, including the C-29 delegating stubs (`Renderer.create` with `backend`, `renderFrame`/`renderFrameAsync`, lifecycle) in `renderer/RendererFactory.ts` and `renderer/DeviceLifecycle.ts`. Those two files are 11's after merge.
- [ ] T0.D PR 0b-3: `production-runtime/actor/extensions.ts`, TypedGLBActor/GLTF carves (§3.6), the C-39 fallthrough in `cli.ts`, capture step plugins and `qr_flags` (as custodian; the capture files are 12's after merge).
- [ ] T0.E Dispatch the IC-0 identity run (`quality-rebuild-capture.yml` with `qr_flags=none`, 18 games and 18 scenes) plus one fresh re-run of `85aafcd0` as the noise baseline. Record both run ids in `evidence/prd15/baselines/phase0.json`.
- [ ] T0.1 Add `tools/arch-gates/baseline.ts`. It writes `evidence/prd15/baselines/phase0.json` with: export counts per `/package.json` subpath (TS checker), subpath count, `Object.keys(scripts).length`, `tools/` dir count, count of `*.map` under `packages/*/src`, and `agent-api/index.ts` line count. Unit test: run it on a fixture repo with 2 subpaths and 3 scripts and assert the JSON.
- [ ] T0.3 Add `tools/bundle-size/lit-scene.ts` (15-owned file inside 11's `tools/bundle-size/`). It builds `benchmarks/quality-rebuild` scene `01-simple-geometry` (Aura side) with Vite in production mode and reports initial-chunk gzip bytes plus each lazy chunk (gzip -9). It also reports the same for `apps/showcase-siege-golf` and `templates/product-viewer` (read-only builds). Run it from `.github/workflows/qr-prd15-bundle-size.yml` on GH Actions and write `evidence/prd15/bundle-baseline.json`.

### Phase 1: resolution truth
- [ ] T1.1 Create `/aura.exports.json` listing all 47 current subpaths with their `source` and `browser` files, so the generated output matches today byte for byte. Test: `generate-resolution-maps --check` against the current `/package.json` passes with no diff.
- [ ] T1.2 Implement `tools/generate-resolution-maps/index.ts` with `--write` and `--check`. It generates `/package.json#exports`, `/tsconfig.paths.generated.json`, `/vite.aliases.generated.ts` and `/tools/finalize-dist/manifest.generated.json`. Unit tests: (a) a `browser` field produces a `browser` condition and a Vite alias to the browser file; (b) a `deprecated` entry emits a re-export stub source.
- [ ] T1.3 Delete the hand `paths` block from `tsconfig.base.json`. Add `"extends": ["./tsconfig.paths.generated.json"]` (TS 5 array extends). Delete or regenerate `tsconfig.browser-301.json`. Update `vite.config.ts:40-60` to `import { aliases } from "./vite.aliases.generated.ts"`.
- [ ] T1.4 Make published "." the union (§6.6 sequencing): add the 77 repo-only names (§2.3) to `packages/engine/src/agent-api/index.ts` as named `@deprecated` re-exports (JSDoc names the destination subpath or "deleted in 4.0.0"), then point the `@aura3d/engine` source entry in `aura.exports.json` at `packages/engine/src/agent-api/index.ts` and regenerate. Assert with the TS checker that the in-repo and published "." export sets are equal (1,803 names). `tsc --noEmit -p tsconfig.check.json` passes with **no** edit outside 15-owned files.
- [ ] T1.5 File request Q-13-6 to delete the 4 `templates/external-parity-*` (root `templates/` is 13's), attaching `rg -l "external-parity-(asset-gallery|interactive-scene|material-studio|product-viewer)" --glob '!docs/project/**'` output. Remove the 15-owned hits (root scripts, 15-owned tests) in this lane.
- [ ] T1.6 Implement `tools/packed-consumer-check/index.ts`: `pnpm pack` → temp dir per template in root `files` and every `packages/create-aura3d/templates/*` (read-only copies), rewrite the copy's `@aura3d/engine` dependency to `file:<tarball>`, `pnpm install --offline=false`, then `tsc --noEmit` and `vite build`. Add `.github/workflows/qr-prd15-pack-check.yml` (macos-14). Fixture test: a fixture template importing a name that exists only in a repo path alias must fail.
- [ ] T1.7 Delete `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts` and `dist/index.d.ts.map` from `/package.json#files`. Delete the writer at `tools/finalize-dist/index.ts:62-63` and its `rootIndexLines`/`rootTypeLines` construction.
- [ ] T1.8 Add `tools/arch-gates/index.ts` with rules `resolution-single-truth`, `src-clean` and `no-cross-package-relative` in warn mode. Add the `arch:check` root script (15-owned root manifest). Run it in `.github/workflows/qr-prd15-arch-gates.yml` and upload the JSON as an artifact.

### Phase 2: one renderer
- [ ] T2.1 Consume C-29 (no `Renderer.ts` edit): add `tests/qr/prd15/renderer-factory-consumer.test.ts` with `MockRenderDevice` asserting that `Renderer.create({ backend: "webgl2" })` from the PR 0b-2 stub returns a renderer whose `backend === "webgl2"`, and that an `onDeviceLost` listener fires once per simulated loss. The test runs against `stub` and, when provided, `real` (CONTRACTS §6.3).
- [ ] T2.2 Add a golden-JSON equivalence test `tests/qr/prd15/render-frame-equivalence.test.ts`: a `RenderSource` with one lit cube produces identical `RenderDeviceDiagnostics.drawCalls` and program keys through `ProductionWebGL2Renderer.renderFrame` and the C-29 `Renderer.renderFrame`. Leave `PBRHDRPipeline` (02, Q-02-1) and `TransmissionBackdropCapture` (15) where they are; delete `ProductionEffectsPipeline.ts` (D-27) after `rg -lw ProductionEffectsPipeline` shows only its own file and tests.
- [ ] T2.3 Produce `docs/architecture/lean-device-diff.md`: whitespace-normalized `diff WebGL2Device.ts LeanWebGL2Device.ts`, each of the 346 differing lines classified as `feature-removal` (drop), `bugfix` (port) or `identical-after-rename`. For every `bugfix` line, write the patch and a unit or browser test named after the line range, and attach both to request Q-01-1. Do not edit `WebGL2Device.ts`.
- [ ] T2.4 In the bridge `createProductionRuntimeSceneRenderer` (now 15-owned `compiler/renderer.ts`; was `index.ts:13586-13597`), replace `ProductionRuntimeRenderer.create({...})` with C-29 `Renderer.create({ canvas, backend: options.renderer?.backend ?? "webgl2", ... })`. Remove `preserveDrawingBuffer: true` (`:13593`), because capture goes through the C-05 stub (`toBlob` after a synchronous render). Verify by the §16.1 identity run plus `tests/browser/contracts/` C-05 capture conformance.
- [ ] T2.5 Move `captureProof`, `renderImportedAsset`, `getFeatures` and `getShadowEvidence` (`ProductionWebGL2Renderer.ts:102-197`) to `packages/engine/src/agent-api/devtools/rendererReports.ts` as `rendererProofCapture(renderer, input)`, `rendererFeatureReport(renderer)` and `rendererShadowReport(renderer)`. Update their 16 test files.
- [ ] T2.6 Delete `ProductionWebGL2Renderer.ts` and `ProductionRuntimeRenderer.ts`. `production-runtime/index.ts` keeps `export { Renderer as ProductionRuntimeRenderer }` with `@deprecated` until Phase 8.
- [ ] T2.7 Delete `packages/rendering/src/advanced-runtime/AdvancedRenderer.ts` (73 lines). First assert with the TS checker that `resizeToDisplay`, `startAnimationLoop`, the `render(source, camera?)` overloads and `captureFrame` exist on `Renderer` with compatible signatures (`Renderer.ts:501`, `:525`, `:539-541`, `:885`); any mismatch goes to Q-01-2 and `AdvancedRenderer` stays until it lands. `advanced-runtime/index.ts` re-exports `Renderer as AdvancedRenderer` (deprecated).
- [ ] T2.8 Delete `packages/rendering/src/threejs-example-parity/index.ts` (`CurrentRoutesInteractiveRenderer`, 0 app/test consumers). Delete `packages/engine/src/threejs-example-parity/{index,FlagshipFoundation}.ts` after `rg -l "threejs-example-parity" apps examples templates packages tests` shows only the files themselves and their own tests. Delete those tests. This removes the 25 cross-package relative imports.
- [ ] T2.9 Replace `packages/engine/src/advanced-runtime/A3DRenderer.ts` with `export { Renderer as A3DRenderer } from "@aura3d/rendering"` and `export type A3DRendererOptions = RendererCreateOptions`. Move `A3DRenderer.evidence()` (`:129-144`) to `devtools/rendererReports.ts` as `a3dRendererEvidence(renderer, options)`.
- [ ] T2.10 Delete `A3DRenderer` #2 in `packages/engine/src/production-runtime/index.ts:175`. That subpath re-exports the alias from T2.9.
- [ ] T2.11 Implement the `renderer-imports` codemod in `packages/aura3d-cli/src/codemods/renderer-imports.ts` (TS AST) and register it via C-39 in `src/commands/prd15/index.ts`. Fixture tests: copies of `apps/loader-gltf-variants/src/main.ts` and `apps/wow-common/src/showcase.ts` before/after under `tests/qr/prd15/fixtures/`.
- [ ] T2.12 Run `renderer-imports` on the consumers in 15-owned `apps/` (default owner) found by `rg -l "@aura3d/engine/advanced-runtime" apps`, excluding paths owned by other lanes per `.github/QR_OWNERSHIP.json`. Attach the codemod report for the rest to Q-ALL-1 and Q-13-2. `tsc --noEmit` passes. Capture 6 apps (`postprocessing-bloom`, `shadowmap-viewer`, `skinning-blending`, `loader-gltf-variants`, `materials-transmission`, `texture-anisotropy`) before and after on macos-14 for §16.1. Capturing is read-only, so it needs no owner action; apps not yet migrated are captured on the deprecated alias, which is the same `Renderer`.

### Phase 3: agent-api split and compiler
Prerequisite for T3.1-T3.9: this lane's own PR 0b-1 (T0.B) has merged, so every region CONTRACTS §3.2 assigns to
another lane is already in that lane's module. T3.x tasks move only the regions §3.2 leaves with PRD 15.
- [ ] T3.1 Open CCR-15-2 (CONTRACTS §6.4: custodian plus one consumer, merged within one working day) for a pure move of the frozen types section `index.ts:1-2097` into `agent-api/nodes/types.ts`, with `index.ts` re-exporting every name. CONTRACTS §3.2 says the section "stays in place"; the CCR keeps every signature byte-identical, so no consumer changes. `tsc --noEmit` passes. No other diff. If the CCR is declined, the section stays in `index.ts` and the T3.9 line target becomes ≤ 2,400 lines (types plus re-exports).
- [ ] T3.2 Create `agent-api/nodes/builder.ts` with `AuraNodeBuilder` (re-exported from `index.ts`). File Q-07-1 asking 07 to change `Decals.ts:39,47` to import from `./nodes/builder.js` and `./nodes/types.js`. Until it lands, `no-cycles` lists the `Decals.ts ↔ index.ts` SCC in its dated allowlist; after it lands, the gate reports the SCC gone.
- [ ] T3.3 Pure-move each **15-owned** builder to its `nodes/*.ts` file, one commit each: `assets` (:1004), `model` (:2098), `primitives` (:2207-2221), `text3d` (:2318), `groups` (:2361-2365, :2387-2413), `interactions`/`ui` (:3911-4122), `scene` (:4842-5171), `physics` (:5172-5818), `prefabs/*` except cityBlock (:5819-5841, :5902-6979, split by family), `animation` (:8309-8343), humanoid prefabs (:8565-9359), `product` (:9360-9594). Not moved here, because PR 0b-1 already carved them to their owners (§6.3): `instances`, `shadows`, `material`, `lights`, `camera`, `effects`, `sky`, `weather`, `water`, `environments`, `cityBlock`, `game`, `particles`, `sceneKits`, `prompt/*`. Each commit: `tsc --noEmit` and the unit suite pass, and `qr-ownership/check.mjs` passes.
- [ ] T3.4 Removed. `index.ts:4225-4327` (renderer quality profiles, `normalizeCreateAppRendererOptions`) is carved to `app/rendererOptions.ts` (owner 11) by PR 0b-1. Claim-boundary field removal is Q-11-4 plus CCR-15-1.
- [ ] T3.5 Move the 15-owned evidence helpers to `devtools/`: `auraLazySystemEvidence` (:9595-9677 → `devtools/lazySystemEvidence.ts`, already the PR 0b-1 target), `createRuntimeNodeImportedAssetEvidence` (:10610), `helperPerformanceBudgets` (:11931), `renderDiagnosticPreviewToCanvas` (:18295). "." keeps deprecated re-exports until Phase 5. Not moved here: `collectGameRuntimeEvidence` (09, Q-09-2), `sceneKitPerformanceBudgets` and `createSceneKitLodEvidence` (:9681-9796, carved to 11's `devtools/sceneKitBudgets.ts`).
- [ ] T3.6 Move `AuraRuntimeError` (:10830) to `app/errors.ts`, `startProductionRender` (:12241-12520) to `app/frameLoop.ts`, `createProductionSceneRenderer` (:12523-12549) to `app/mountRenderer.ts`, `configureCanvas` (:18105) to `app/canvas.ts`, and `liveAuraApps` (:11745) to `app/liveApps.ts`. `createAuraApp` (:11126-11743) is already in `app/createAuraApp.ts` (PR 0b-1); `createGameApp` (:11818-11827) is 09's `app/createGameApp.ts`.
- [ ] T3.7 Move the remaining 15-owned bridge regions (`:12523-15981` minus the PR 0b-1 carves for 02, 03, 04, 06 and 07) to `compiler/*` per §6.3: `renderInput.ts` (:13842-14012, already the PR 0b-1 target), `primitives.ts` (:14013-14755 minus 04's texture lines, already the PR 0b-1 target), `text.ts` (15-owned remainder of :14453-14616), `actors.ts` (:13552-13583 and :15133-15628 minus 06's :15461-15490), `observations.ts` (:13034-13110), and camera resolution (:15629-15782) into `compiler/camera.ts`. Pure moves. §16.1 identity with flags `none`.
- [ ] T3.8 Move engine primitive generators (`:17287-17479`) into 15-owned `compiler/geometry.ts`. Model matrix and transforms (`:17637-18010`) go to `compiler/sceneGraph.ts`, which is **01's** (CONTRACTS §4.1). If PR 0b-1 did not carve that range, file request Q-01-5 with the verbatim-move patch attached and leave the range in `index.ts` until 01 merges it. The T3.9 target excludes it until then.
- [ ] T3.9 After T3.1-T3.8, `agent-api/index.ts` holds only named re-exports plus any range still waiting on Q-01-5. Assert ≤ 300 lines (excluding a pending Q-01-5 range, listed by line in the gate config) with arch gate `max-file-lines` in fail mode for 15-owned files in `packages/engine/src/agent-api/**`.
- [ ] T3.10 Fix `createProductionInstanceTransforms` (now 15-owned `compiler/primitives.ts`; was `index.ts:14747-14754`): include `size: node.size` in `localNode` (`:14750`). Declared correctness fix, unflagged (CONTRACTS R18, §6.1); the PR description names it so PRD 12 re-baselines scene 16. Unit test `tests/qr/prd15/compiler/primitives.test.ts`: a node with `size: [1, 4, 1]` and transforms `[{position:[2,0,0]}, {position:[-2,0,0], scale:[1,0.5,1]}]` yields matrix diagonals `[1,4,1]` and `[1,2,1]` and translations `±2` on x. Re-run benchmark scene 16 (§16.2).
- [ ] T3.11 Implement the real C-36 in `compiler/handlers.ts` (`NodeKindHandlers` mapped type over the C-36 `AuraNodeKindMap` keys, plus `registerNodeHandler` resolution: a registered lane handler wins when its flag is on) and `compiler/compileScene.ts` (`compileScene`, `updateCompiledScene`) wrapping the moved bridge functions, behind `A3D_QR_COMPILER`. Provide it with `slot.provide(real)` from `packages/engine/src/lanes/prd15.ts`. `compiler/renderer.ts` calls `compileScene` once at mount and `updateCompiledScene` per frame. Type test (`// @ts-expect-error`): removing one default handler key fails compilation. C-36 conformance green for `stub` and `real`.
- [ ] T3.12 Add per-node version counters to runtime node handles (`setPosition`/`setRotation`/`setScale`/`setVisible`/material setters increment `version`), and the real C-37 `add`/`remove` as subtree compile/dispose on the compiler (no remount), both behind `A3D_QR_COMPILER`. `updateCompiledScene` reuses the previous `RenderItem` when the node version and ancestor versions are unchanged. Unit test: 500 static nodes and one moving node → 499 identical item object references across two frames. C-37 unit and browser conformance green for `real`.
- [ ] T3.13 Create `compiler/optionCoverage.ts`, listing every option field of every builder in `nodes/*` (15-owned and lane-owned builder files are read, not edited), generated once by `tools/arch-gates/rules/option-coverage.ts --scaffold` from the TS types and then hand-filled with probe values. Fields found unconsumed that PR 0a did not already list go into 15-owned `compiler/diagnosticOnly.prd15.ts` with the responsible `ownerPrd` (for example `effects.particles.*` → 7, `lights.ambient` with no env → 2). An owner clears an entry without touching this lane's file by calling `registerOptionCoverage` for that field from its own module; the gate then treats the row as covered and lists the stale entry, which this lane deletes in a daily sweep. Create `compiler/optionCoverage.test.ts`: for each row, compile `scene().add(builder(probeA))` and `scene().add(builder(probeB))` and assert `deepDiff(sourceA, sourceB).length > 0`, unless the field is in the merged `DIAGNOSTIC_ONLY_FIELDS`.
- [ ] T3.14 Arch gate `layering` in fail mode for `packages/engine/src/agent-api/**`, with fixture tests: a `nodes/x.ts` importing `compiler/y.ts` fails.

### Phase 4: no silent fallback, one builder API
- [ ] T4.1 Add `app/degradation.ts` implementing the C-36 `degrade()` and wire `strict`/`onDegradation` (C-38 pre-declared) through `createAuraApp` → `SceneCompileContext`, with `strict` defaulting to `A3D_QR_STRICT`. Replace the `catch` bodies at the 15-owned sites: `createProductionRuntimeRendererInput` (from `index.ts:13875`, `pose-apply-failed`), `applyProductionActorFootPlanting` (`:15147`, `foot-planting-failed`) and `applyProductionActorMorphTargets` (`:15178`, `morph-apply-failed`) with `ctx.degrade({ code, nodeId, message, cause })`. The other three sites are lane-owned after PR 0b-1: `:14174` and `:14571` (04, Q-04-1) and `:15121` (06, Q-06-1). `degrade` throws when `strict`; otherwise it records, warns once per `(code,nodeId)`, and continues. Unit tests per 15-owned code: strict throws an `AuraRuntimeError` with `code` and `cause`; non-strict records exactly one entry after 100 frames. With `A3D_QR_STRICT` off, behaviour equals today's (warning string appended) and §16.1 identity holds.
- [ ] T4.2 In `app/mountRenderer.ts` (was `createProductionSceneRenderer`, `index.ts:12523-12549`), when `A3D_QR_STRICT` is on, replace the `catch` at `:12545-12548` with `throw new AuraRuntimeError("renderer-mount-failed", message, { cause: error })` and skip the `rendererSelection.mode !== "production"` branch (`:12530-12532`). With the flag off, both stay as today. Unit test: with the flag on, a C-29 `Renderer.create` test double that rejects → `createAuraApp` rejects with that code, and `errorOverlay` is attached to the canvas parent with `role="alert"`; with the flag off, the legacy fallback still runs.
- [ ] T4.3 Implement `app/errorOverlay.ts`: an absolutely positioned DOM element over the canvas showing `error.code`, `error.message` and the first 5 lines of `cause.stack`. It has `role="alert"` and `aria-live="assertive"`, 4.5:1 contrast text on a solid background, and a keyboard-focusable "Copy details" button. Browser test (macos-14): the overlay is visible and focusable, and axe-core reports no violations.
- [ ] T4.4 At `A3D_QR_STRICT` removal (after two consecutive `default-on` checkpoints, CONTRACTS §5.4; a transition of this lane's own flag only), delete `createWebGLSceneRenderer` and every function only it reaches (`index.ts:15982-17286`, and the 15-owned `compiler/safeBasic.ts` carve of `:15989`/~`:16000`), including `createWebGLBackdrop`, `createGltfPrimitiveModelMatrixResolver`, `createWebGLParticleModel`, `compileShader`, `createGltfRuntimeNodes`, `loadGltfForWebGL`, `parseGlb`. Safety: TS "find all references" (`tools/arch-gates/rules/unreferenced.ts`) on each deleted symbol returns only the deleted block. `rg -n "#version 300 es" packages/engine/src` → 0. Add `A3D_QR_STRICT` to `REMOVED_QR_FLAGS`.
- [ ] T4.5 With `A3D_QR_STRICT` on, a runtime check in `app/createAuraApp.ts` throws `AuraMigrationError({ removedApi: "renderer.mode", replacement: "renderer.quality", prd: 15 })` when a caller passes `renderer.mode`/`renderer.fallback`. Mark `AuraRendererMode`, `AuraRendererFallbackMode`, `mode` and `fallback` `@deprecated` through CCR-15-1; remove them in T8.1. Ship the `renderer-mode` codemod (C-39) with fixture tests; run it on 15-owned hits of `rg -l "mode: \"safe-basic\""` and attach the report for others to Q-12-1/Q-13-2/Q-14-1 (for example `apps/showcase-pulse-tunnel/art-review` is 14's).
- [ ] T4.6 Replace `packages/lean/src/index.ts`, `product.ts` and `game.ts` with the §7.5 re-exports plus a one-time `console.warn("[aura3d] @aura3d/lean is deprecated; import from @aura3d/engine. Removed in 4.0.0.")`. Delete `packages/lean/src/base.ts`. For `ArcadeRuntime.ts`: run `rg -l ArcadeRuntime apps templates packages examples`; if there are 0 external hits delete it, else move it to `packages/engine/src/agent-api/leanArcade.ts` (15-owned) and re-export it from `@aura3d/lean/game`.
- [ ] T4.7 Ship the `lean-imports` codemod (C-39) with fixture tests on copies of `templates/product-viewer/src/main.ts` and `templates/mini-game/src/main.ts` under `tests/qr/prd15/fixtures/lean-templates/`. Build those fixture copies as C-30 lane scenes `prd15-lean-product` and `prd15-lean-minigame` (the mini-game copy gains the key light, environment and shadow-receiving ground of §6.7) and capture them for §16.3. File Q-13-1 with the codemod report for the 16 template files. `pack:check` passes on the fixtures.
- [ ] T4.8 Delete `packages/rendering/src/lean/LeanProductionRenderer.ts`, `lean/LeanProductRenderer.ts`, `LeanWebGL2Device.ts`, `lean-runtime.ts` and `lean-core-runtime.ts` (all 15-owned) once T4.6 is merged and T2.3 has filed Q-01-1. Remove their `vite.config.ts`/`tsconfig` alias entries via `aura.exports.json`. Do not touch `ShaderLibraryCore.ts` (01, Q-01-4). Safety: `rg -l "LeanWebGL2Device|LeanProductionRenderer|LeanProductRenderer|lean-runtime|lean-core-runtime" packages apps templates tests` returns only deleted files and their 15-owned tests (delete those tests); any hit in another lane's file keeps a deprecated re-export stub at the old path until the owner migrates.
- [ ] T4.9 Arch gates `single-renderer` and `glsl-location` move to fail mode. Fixture tests: a file calling `canvas.getContext("webgl2")` outside the allowlist fails.
- [ ] T4.10 Re-run the bundle measurement (T0.3) and write `BUNDLE_SIZES.md` from its output only (the generated table and a link to the workflow run). Delete the "77,458 B pass" row and the "new-app budget applies to `@aura3d/lean`" text (`BUNDLE_SIZES.md:10,33-34`).

### Phase 5: public surface
- [ ] T5.1 Create `packages/engine/src/public/index.ts` with explicit named exports only. It is generated as a starting point by `tools/arch-gates/rules/export-budget.ts --scaffold` from the 132 root symbols games use (research/13 §2.3), the symbols templates and benchmarks use (`rg` import tally), every name exported by `packages/engine/src/contracts/index.ts` and `src/lanes/index.ts` (which is how lane additions reach "." without editing this file), and the 77 deprecated union names (§6.6). Every other current "." export goes to `./renderer`, `./devtools` or a domain subpath, or is deleted, with the disposition recorded in `docs/architecture/root-export-dispositions.json` (`{ name, from, to, reason }`).
- [ ] T5.2 Create `public/renderer.ts` (§7.2) and `public/devtools.ts` (§7.3), the entry files of the subpaths PR 0a reserved. Point `aura.exports.json` "." at `public/index.ts`. Regenerate.
- [ ] T5.3 Replace `packages/rendering/src/index.ts`'s 43 `export *` with named exports, keeping `export * from "./lanes/index.js"` and `"./contracts/index.js"` (CONTRACTS §3.8). Only names imported by `packages/engine/src/**`, `public/renderer.ts`, a remaining package, or a C-NN contract are kept. Each removed name gets an `rg` check across apps/examples/templates/tests; a hit in another lane's file keeps the name as `@deprecated` until that owner migrates.
- [ ] T5.4 Delete the 15-owned barrel-only orphan rendering files (Appendix A, D-10: `RendererVisualPipelineReport.ts`, `PrimitiveSubmissionAudit.ts`, `ReflectionSurfaces.ts`, `VoxelWorld.ts`, `ScreenSpaceReflectionPass.ts`, `UniformBinder.ts`, the `performance/` default files `Octree.ts`, `RendererStats.ts`, `ResourceBudget.ts`, and the rest of the D-10 list whose `QR_OWNERSHIP.json` owner is 15). Safety per file: `rg -lw "<each exported name>" --glob '!packages/rendering/src/index.ts' --glob '!<the file>'` returns only its own test. Orphans owned by other lanes are requests: `PbrReference.ts` (Q-01-3), `performance/LOD.ts` (Q-05-2), `performance/FrustumCuller.ts` (Q-11-4), `VegetationScatter.ts` (Q-10-1), `shadows/CascadeHysteresis.ts` (Q-02-2, keep).
- [ ] T5.5 Rename leaking names that survive in `./renderer`: `RuntimeParityFrameRenderResult` → `RendererFrameResult`, `CurrentRoutesRendererTimingDiagnostics` → `RendererTimingDiagnostics`. Every `ExternalParity*` name is either deleted or moved to `./devtools`. Deprecated aliases stay until 4.0.0.
- [ ] T5.6 Collapse subpaths to the §6.1 list. Put each removed subpath in `aura.exports.json#deprecated` with a target. Generate re-export stubs that `console.warn` once. `pack:check` passes for a fixture consumer importing each deprecated subpath.
- [ ] T5.7 Open CCR-15-1: `@deprecated` JSDoc on `AuraRendererQualityProfile.supportedInRoot/blockedInRoot/claimBoundary/requestedFeatures/maxRecommendedDrawCalls` (types section, 15) and on `AuraRendererMode`/`AuraRendererFallbackMode`. File Q-11-4 for the profile values in `app/rendererOptions.ts` (11). Removal happens in T8.1.
- [ ] T5.8 Arch gates `export-budget`, `no-evidence-in-runtime` and `unique-ownership` move to fail mode, with thresholds from §6.6. Entries tied to open §12.4 requests sit in a dated allowlist (`tools/arch-gates/allowlist.json`, 15) and do not fail the gate.
- [ ] T5.9 Implement the `devtools-imports` and `engine-entry-imports` codemods from the disposition JSON, register them via C-39, and run them on 15-owned files. Attach reports for apps, examples, templates, benchmarks and tools owned by other lanes to Q-12-1, Q-13-2, Q-14-1 and Q-ALL-1.

### Phase 6: honest packages, single implementations
- [ ] T6.1 Implement `packages/aura3d-cli/src/migrate-three/{parse,mappings,emit,report}.ts` and the `aura3d migrate three` command. The mapping table starts with: `Scene`, `PerspectiveCamera`, `Mesh` + `BoxGeometry`/`SphereGeometry`/`CylinderGeometry`/`PlaneGeometry`/`TorusGeometry`, `MeshStandardMaterial`, `MeshPhysicalMaterial` (clearcoat, transmission, sheen), `DirectionalLight`, `PointLight`, `SpotLight`, `AmbientLight`, `HemisphereLight`, `GLTFLoader.load`, `RGBELoader` + `PMREMGenerator`, `OrbitControls`, `InstancedMesh`, and `Euler` order. Everything else maps to `none`. Unit tests: one fixture per row and one fixture of an unmapped construct emitting a TODO and a `none` row.
- [ ] T6.2 Delete `packages/three-compat/src/*` except `migration/` (moved into the CLI). Delete `packages/three-compat` (`package.json`, tsconfig) and its `tsconfig.base.json`/`aura.exports.json` entries. Remove `README.md:684`.
- [ ] T6.3 File Q-13-4 (delete `templates/three-compat-*`; rename `packages/create-aura3d/templates/three-compat-*` to the §6.8 names; `templateAliases` warning map in `packages/create-aura3d/src/index.ts` with the unit test "`--template three-compat-large-scene` scaffolds `large-scene` and prints the warning"). Attach the rename table and the test file as a patch. This lane does not edit `packages/create-aura3d/**`.
- [ ] T6.4 Delete `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tests/browser/three-compat-threejs-runtime-parity.spec.ts` (15 by the creator rule) and the 20 `three-compat:*` root scripts. File Q-12-3 for `benchmarks/three-compat/` and `tools/three-compat-*` (30 dirs, owner 12) with the `script-prune --report` evidence that no kept workflow references them.
- [ ] T6.5 In `packages/environments`, delete the 15-owned files. Move `createThreeCompatPMREMDiagnostics` and `createThreeCompatEnvironmentProbePreviews` to `devtools/environmentDiagnostics.ts` if `rg` finds a consumer, else delete them. Remove the undeclared `environments` import from engine (research/13 §9). File Q-02-2 and Q-10-1 for the 02/10-owned files; delete the package directory and its `aura.exports.json` entry in the PR after the last of them is relocated.
- [ ] T6.6 Merge `cinematic/CinematicMaterialPresets.ts`, `ArchitecturalMaterialCatalog.ts` and `animation/AnimationMaterialStyle.ts` into `packages/rendering/src/MaterialPresets.ts` as a pure value move with a snapshot test of every preset value; file Q-04-2. In `packages/materials`, delete the 15-owned files and the `node.ts` re-export; file Q-11-2 for `NodeMaterial.ts`. Safety: the 2 app/template hits for `@aura3d/materials` (re-measured) get the codemod report in Q-ALL-1/Q-13-2, and the package keeps a deprecated re-export until they migrate.
- [ ] T6.7 Delete `packages/editor` (1-line `export *`). `./editor` becomes a deprecated alias of `./editor-runtime`.
- [ ] T6.8 Math unification in 15-owned files: replace `packages/physics/src/Shape.ts` helpers (`vec3`, `addVec3`, `subVec3`, `scaleVec3`, `lengthVec3`, `normalizeVec3`, `EPSILON`) and the `Vec3` declaration in `engine/agent-api/SceneGroundingUtils.ts` with imports from `@aura3d/scene/math`. The existing physics suite passes unchanged. For `packages/animation/src/Keyframe.ts` (06) write the property test (1,000 random TRS; `composeMat4` matches within 1e-6) and attach it with the patch to Q-06-3; for `PbrReference.ts` (01) file Q-01-3.
- [ ] T6.9 Controls: `packages/input/src/controls/*` (15) re-export from `@aura3d/controls` (15). Diff behaviour first: for each control, a unit test in `tests/qr/prd15/controls/` drives identical pointer sequences through both implementations and asserts the resulting camera matrices are equal. Any difference is resolved in favour of `@aura3d/controls`, with a note recorded in the commit.
- [ ] T6.10 glTF: `assets/asset-corpus/ProductionAssetCorpus.ts` and `assets/AdvancedAssetCorpus.ts` (15) parse via the public `GLTFLoader` export of `@aura3d/assets` (05). File Q-13-3 for `packages/create-aura3d/templates/animation-studio/scripts/`. Unit test: the same GLB fixture yields identical accessor counts and material counts through the corpus and through `GLTFLoader`.
- [ ] T6.11 Fix declared dependencies in 15-owned manifests per research/13 §9 (root and 15-owned `packages/*/package.json`). Arch gate `deps-truth` moves to fail mode for those manifests and reports the rest, which go to Q-ALL-1 with per-package diffs.

### Phase 7: process pruning and build hygiene
- [ ] T7.1 `tsconfig.base.json`: add `"noEmit": true`. `tsconfig.build.json`: add `"noEmit": false` and set `include` to `["packages/*/src/**/*.ts"]` plus `exclude` test globs. Create `tsconfig.check.json` (`noEmit`, includes tests/tools/configs). Switch the `typecheck` script to `tsc -p tsconfig.check.json --noEmit` and remove the `evidence:command` wrapper from `build` and `typecheck`.
- [ ] T7.2 Delete the 1,194 orphan maps (Appendix A, D-14) with the safety procedure given there. They are untracked (`git ls-files` lists 0 `.map` files), so this is a working-tree cleanup inside the CI job and crosses no ownership boundary; the durable fix is T7.1's `noEmit`. Add the rule `no-map-or-js-in-src` to `tools/verify-source-cleanliness` and to `arch-gates src-clean` in fail mode.
- [ ] T7.3 Implement `tools/script-prune/index.ts` (§6.11) with `--report`, `--apply` and `--check`. Unit tests on a fixture `package.json` with a chain `a → b`, an orphan `c`, a workflow-referenced `d` and a missing-target `e`: the result keeps `a, b, d` and deletes `c, e`.
- [ ] T7.4 Run `script-prune --report`. Keep every script that a C-30/C-33 tool or a 12-owned workflow invokes (read from the workflows, so no request is needed). Apply. Assert `Object.keys(scripts).length ≤ 80`. Commit the report as `docs/architecture/script-prune-report.json`.
- [ ] T7.5 Delete every 15-owned `tools/<dir>` that `script-prune` marks unreferenced (no kept script, workflow or source import), in commits grouped by prefix (`aura3d10x-*`, `animation-studio-*` readiness and the other `tools/` default entries). For unreferenced dirs owned by 12 (`external-parity-*`, `threejs-parity-*`, `head-to-head-*`, `superiority-*`, `three-compat-*`, `muse3jsparity-*`, and the named 12 dirs) and 11 (`production-runtime-*-readiness`), attach the report to Q-12-3 and Q-11-3. Standalone assert: every remaining 15-owned tool dir is referenced. `ls tools | wc -l ≤ 60` is integrated (§16A).
- [ ] T7.6 Delete the root scratch files listed in research/13 §8.3 (`rooftop-*.mts`, `siege-*.ts`, `courier-diag*.tmp.mjs`, `vb-lane-probe.ts`, `scratch-site5.mts`, `bs-debug-shot*.png`, `__probe-courier.ts`, the file named `[{"down":"Space"},…]`, UUID-named `.txt`). Safety: `git ls-files` for each, and `rg -l` for each basename, show no reference.
- [ ] T7.7 Replace `tools/verify-architecture/index.ts` with `arch-gates` in fail mode. Update `ci.yml` and `test.yml` (15). Keep a root script alias `verify:architecture` → `arch:check` and file Q-12-2 so 12-owned workflows switch; remove the alias in T8.1 if no workflow references it.
- [ ] T7.8 Delete `MIGRATION-2.0.md`. Generate `docs/MIGRATION-4.0.md` from `aura.exports.json#deprecated` and the §11 table. Rewrite `README.md:211-212` (duplicate-export admission) from the arch-gate output.

### Phase 8: 4.0.0
- [ ] T8.1 Remove every `aura.exports.json#deprecated` entry that has no remaining in-repo consumer outside 15-owned files (`rg -lw`), the `A3DRenderer`/`ProductionRuntimeRenderer`/`AdvancedRenderer` aliases, `packages/lean`, `packages/input/src/controls`, the CCR-15-1 deprecated types, and the deprecated "." evidence re-exports. Names still used in another lane's file stay deprecated and are listed in the release notes (§6.6 step 3). Regenerate.
- [ ] T8.2 Run `pack:check`, the 36 strict captures (§16.1 identity against Phase 7) and the full arch gates. Publish 4.0.0 only through the release workflow and the production runbook named in the program policy.

## 15. Test requirements

Everything runs remotely on GitHub Actions `macos-14`: contract suites in `.github/workflows/qr-contracts.yml`,
lane suites in `.github/workflows/qr-prd15-{arch-gates,pack-check,bundle-size,captures}.yml`. New lane tests live in
`tests/qr/prd15/` (lane-owned), conformance cases for this lane's real implementations in
`tests/unit/contracts/impl/prd15-*`.

Contract conformance (custodian, PR 0; must pass for `stub` and, once provided, `real`): every
`tests/unit/contracts/C-NN-*.test.ts` and `tests/browser/contracts/*.spec.ts`; specifically for this lane's
contracts, `C-36-compiler.test.ts` (including flag-off byte-equal `RenderSource` on the 18 base snapshots),
`C-37-runtime-nodes.test.ts`, `C-37-add-remove.spec.ts`, `C-38-app-extensions.test.ts` and `C-39-cli.test.ts`.
CI runs conformance with flags `none`, `all` and each single lane flag (CONTRACTS §5.4).

Unit tests (vitest):
- `generate-resolution-maps`: generation, `--check` diff detection, browser condition, deprecated stubs.
- `packed-consumer-check`: fixture that must fail (repo-only name) and fixture that must pass.
- `arch-gates`: one known-bad fixture per rule (§6.12) that must fail, and one clean fixture that must pass; dated
  allowlist entries expire (a past-date entry fails).
- C-29 consumer tests: `Renderer.create` backend selection, device-loss listeners, and `renderFrame` equivalence
  (T2.1-T2.2), run against the stub and the real provider.
- Codemods: before/after fixtures from real consumers (T2.11, T4.5, T4.7, T5.9).
- `compiler/primitives.test.ts` instance size (T3.10).
- `compiler/optionCoverage.test.ts`: option sensitivity over every builder field (T3.13).
- Handler exhaustiveness type test (T3.11). Dirty-skipping reference identity (T3.12).
- Degradations: strict/non-strict per code (T4.1). Mount failure → error and overlay (T4.2).
- `migrate three`: one fixture per mapping row and unmapped constructs (T6.1).
- Math property tests (T6.8), controls equivalence (T6.9), glTF parse equivalence (T6.10).
- `script-prune` fixture (T7.3).

Browser tests (Playwright, `tests/qr/prd15/browser/**`; remote only per policy, run on GitHub Actions
`macos-14` with ANGLE Metal, the same runner class as run 37289688772):
- `renderer-single-path.spec.ts`: for scene 01, a game (`showcase-siege-golf`, read-only) and the
  `prd15-lean-product` fixture, with `qr_flags=strict`, assert `app.diagnostics().renderer.backend === "webgl2"`,
  that `degradations` is empty, and that the WebGL program list has no program whose source contains
  `u_lightDirection` (the fallback marker).
- `renderer-mount-failure.spec.ts`: with `A3D_QR_STRICT` on, a forced C-29 `Renderer.create` rejection through a
  test hook shows the overlay. axe-core passes. No canvas pixels are drawn. With the flag off, the legacy path still
  mounts (flag-off identity).
- `lean-shim.spec.ts`: a page importing `@aura3d/lean/product` with `lights.directional({ intensity: 3 })`
  plus `environments.studio()` renders a sphere whose lit-side mean luma exceeds its shadow-side
  mean luma by ≥ 40/255. Today this is ≈ 0 difference, because the lights are inert.
- `pack-consumer-smoke.spec.ts`: one packed template (`product-viewer`, read-only copy) served from `vite preview`
  renders non-blank, with zero degradations and zero console errors. This is a liveness check and is
  not a quality claim.
- This lane's captures run the PRD 12-owned workflows unmodified with `qr_flags=strict` (C-33).

Not counted as tests: report-reading tools, source-substring tests (research/14 §1.2), and
non-blank-canvas checks presented as visual QA.

## 16. Standalone acceptance (gates this lane's merges)

Everything in this section is passable by PRD 15 alone, on the current renderer plus PR 0 stubs, with this lane's
flags. It gates PRD 15 merges and the `standalone-accepted` state of `A3D_QR_COMPILER` and `A3D_QR_STRICT`
(CONTRACTS §5.3). Nothing here depends on another lane's real implementation.

All captures run on GitHub Actions macos-14 (ANGLE Metal) through the PRD 12-owned
`.github/workflows/quality-rebuild-capture.yml` (games) and the `benchmarks/quality-rebuild` job (18 scenes, Aura3D
against `three@0.185.1` on identical inputs), dispatched unmodified with `qr_flags` (C-33). Lane fixture scenes
are captured by `.github/workflows/qr-prd15-captures.yml`. The reference for "neutral" is the IC-0 capture
(flags `none`). The reference for "quality" is the three r185 side of the benchmark, with vision judgments per
research/23 and research/21 rubrics. Each judged check needs both a vision-model review and a human reviewer.
Either can fail it.

### 16.1 Pixel-neutral gate (Phases 1, 2, 3, 5, 6, 7, 8)

- **Benchmark scenes 01-18** (deterministic, fixed camera, no animation except scenes 08, 14 and 15,
  which are captured at fixed `timeSeconds`): per-scene Aura3D frame against the IC-0 Aura3D frame, once with
  flags `none` and once with `compiler,strict`. Pass: mean ΔE2000 ≤ 1.0 and 99th-percentile ΔE2000 ≤ 5.0 on the
  tone-mapped 8-bit output (the IC-0 tolerance). When the C-30/C-32 FLIP metric is real it is reported alongside
  (≤ 0.02 mean); ΔE2000 stays the gate, so nothing waits on it. Scene 16 is exempt after T3.10 (§16.2).
- **18 games** (`<id>-contact.jpg`, `<id>-mid.jpg`): animation and frame pacing make pixel equality
  invalid. A vision model gets the IC-0 and phase-N contact sheets side by side, unlabelled and
  order-randomised, and answers per image "A better / same / B better" on lighting, materials,
  shadows, AA, post, geometry and HUD (C-32 schema). Pass: no category judged worse for the phase-N image on any
  game. A human reviewer signs off on the same pairs, and any "worse" from either reviewer fails.
- Plus, in the `compiler,strict` run: no degradation whose code is emitted by a 15-owned site
  (`renderer-mount-failed`, `pose-apply-failed`, `foot-planting-failed`, `morph-apply-failed`, `option-ignored`
  for unknown kinds) on any of the 36 captures, and the fallback-marker check (§15) passes. Degradations attributed
  (`ownerPrd`) to another lane are recorded and filed, but do not fail this gate.

### 16.2 Instancing fix (Phase 3, T3.10)

- Scene `16-instancing`: rerun the research/23 vision judgment. Pass: discrepancy rows 1 (field extent)
  and 2 (per-instance height) are classified `equivalent`. Aura3D's score is ≥ 4.0/10 (was 2.5;
  three r185 is 4.5, capped by scene content). Human confirmation is required. Also lane scene
  `prd15-instancing-size` (non-unit `size` with per-instance scale) matches the unit-test matrices in pixels.
- The 7 games that call `instances.*` (§2.8 item 9) pass no non-unit `size`, so the §16.1 pairwise review expects
  "same" for them; any "worse" fails.

### 16.3 Templates render through the one path (Phase 4)

- Lane fixtures `prd15-lean-product` and `prd15-lean-minigame` (copies of the two templates in
  `tests/qr/prd15/fixtures/lean-templates/`, importing `@aura3d/lean/*`, which now re-exports engine builders),
  built from the packed tarball (not path aliases) and captured by `qr-prd15-captures.yml` at 1920×1080 and
  390×844. The real templates are 13's (Q-13-1, Q-12-4) and are judged at checkpoints (§16A).
- Reference: benchmark scene `02-pbr-product` three r185 frame (studio-lit product) for the product fixture. The
  mini-game criterion is absolute.
- Judged criteria (vision and human): visible directional key light with a shading gradient, a
  visible contact or cast shadow under the main object, specular or IBL reflection visible on at least
  one glossy surface, and correct rotation of rotated primitives. Pass: all four present. Today's lean
  output fails all four by construction (research/19 C7).
- Pass threshold for the product fixture against the 02 reference: vision score gap ≤ 2.5 points. The
  content is simpler than the scene, so a full match is not required. A gap above 2.5 fails this criterion. If
  the cause is render quality (lighting/IBL/shadow, owned by 01/02) rather than the lean-to-engine path, it is
  recorded with attribution and the criterion moves to §16A; the import-path criteria (four features present)
  stay standalone.

### 16.4 No-fallback proof

- For every one of the 36 captures, `app.diagnostics().compiledFeatures` (C-31 section, this lane) is written
  next to the image. The reviewer packet shows it beside each frame. A frame whose scene authored an environment
  node but whose compiled features lack `environment.ibl` fails (this is the class of silent drop the compiler
  contract exists to catch).

### 16.5 Engineering gates (standalone)

- C-36, C-37, C-38 and C-39 conformance green for `stub` and `real`; all other C-NN suites green on stubs.
- `resolution:check`, `pack:check`, `arch:check` (15-owned files in fail mode, dated allowlists only for open
  §12.4 items), `qr-ownership/check.mjs` green.
- `agent-api/index.ts` ≤ 300 lines (or the T3.1/T3.8 fallback targets); option-coverage 100% of builder fields.
- §17 CPU, memory and bundle budgets for 15-owned surfaces measured and met.

This PRD makes no "competitive with three.js" claim. §16.2 and §16.3 measure specific defects
closing. Engineering gates and conformance tests are never quality evidence (CONTRACTS §7 honesty rule).

## 16A. Integrated acceptance (checkpoints only; never blocks)

Evaluated at CONTRACTS §7 checkpoints with `A3D_QR_COMPILER` and `A3D_QR_STRICT` on inside `qr_flags=all`. Only
G-PANEL rounds (IC-4, IC-8, IC-12, …) can accept. A miss becomes a `qr-ic-regression` issue against the attributed
lane and blocks no merge.

| ID | Criterion | Depends on (contracts / requests) |
|---|---|---|
| IA-1 | In `all`, every builder node kind whose owner has registered a real handler compiles through it: 0 `option-ignored` degradations for those kinds, and `compiledFeatures` matches the authored nodes for the 18 scenes and 18 games | C-36 handlers from 02, 03, 04, 06, 07, 10 |
| IA-2 | §16.1 neutrality holds between `all` and `all,-compiler` (leave-one-out): the real compiler adds no regression on top of the other lanes' real implementations | C-36 consumers |
| IA-3 | Real `templates/product-viewer` and `templates/mini-game` (13-owned) render through `@aura3d/engine` and pass the four §16.3 criteria; product-viewer gap to the 02 reference ≤ 2.5 | Q-13-1, Q-12-4, C-09/C-10/C-11 (02) |
| IA-4 | `single-renderer` passes with an **empty** allowlist: no WebGPU device owner outside `WebGPUDevice`, no `ProductionWebGPURenderer` | Q-07-2, Q-11-1, C-29 real |
| IA-5 | `renderer-single-path.spec.ts` with `backend: "webgpu"` on Chromium renders through `Renderer.create` when 11 marks WebGPU shippable | C-29 real, `A3D_QR_WEBGPU` |
| IA-6 | 36 strict captures (all lanes' flags on) with zero degradations of any owner | Q-04-1, Q-06-1, every handler owner |
| IA-7 | Process targets repo-wide: ≤ 60 `tools/` dirs, no workflow calling `verify:architecture`, `unique-ownership` and `deps-truth` with empty allowlists | Q-11-3, Q-12-2, Q-12-3, Q-06-2, Q-06-3, Q-01-3, Q-ALL-1 |
| IA-8 | `@aura3d/environments` and `@aura3d/materials` package directories gone | Q-02-2, Q-10-1, Q-11-2 |
| IA-9 | GPU-ms deltas of §17 (refactor phases 0.0 ±3%) confirmed per tier on the checkpoint runner with `gpuMs` from C-28 real | C-28 real |
| IA-10 | Skills and `llms.txt` describe the consolidated surface with no parity/faithful claims | Q-13-5, C-40 |

## 17. Performance budgets

Tiers are C-27 `QUALITY_TIERS` (owner 11; ships real in PR 0a). Reference hardware classes: Low = mid-range phone (iPhone 11 / Pixel 6a class),
Medium = integrated laptop GPU, High = Apple M-series or mid desktop dGPU, Ultra = high-end desktop
dGPU. The CI runner (macos-14 Apple Paravirtual GPU) gives relative numbers only (research/07). Budgets
are deltas this PRD may introduce plus absolute caps for the surfaces it owns. CPU, heap and bundle rows are
standalone (C-28 FrameStats and counters are real enough); GPU-ms rows are confirmed at checkpoints (§16A IA-9)
because C-28 `gpuMs` is null in the stub.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| GPU ms delta from consolidation (refactor phases) | 0.0 (±3% noise) | 0.0 | 0.0 | 0.0 |
| GPU ms added by lean → engine for starter templates | ≤ 1.5 | ≤ 1.2 | ≤ 0.8 | ≤ 0.6 |
| CPU ms `updateCompiledScene`, 500 nodes, 1 moving | ≤ 1.0 | ≤ 0.6 | ≤ 0.4 | ≤ 0.4 |
| CPU ms `compileScene` at mount, 500 nodes (excl. asset IO, shader compile) | ≤ 120 | ≤ 60 | ≤ 40 | ≤ 40 |
| JS heap for the compiled-scene cache, 2k items | ≤ 1 MB | ≤ 1 MB | ≤ 2 MB | ≤ 2 MB |
| GPU memory delta (one device; no duplicate programs/VAOs) | ≤ 0 | ≤ 0 | ≤ 0 | ≤ 0 |
| Initial chunk, lit primitive scene (scene 01), gzip | ≤ 190 KB | ≤ 190 KB | ≤ 190 KB | ≤ 190 KB |
| Initial + lazy chunks loaded for scene 01 at tier, gzip | ≤ 220 KB | ≤ 260 KB | ≤ 300 KB | ≤ 340 KB |
| Showcase game route JS (excl. Rapier wasm, assets), gzip; today's root is 575,343 B | ≤ 380 KB | ≤ 420 KB | ≤ 450 KB | ≤ 480 KB |
| Initial chunk parse+eval (Chrome trace) | ≤ 120 ms at 4× CPU throttle | ≤ 50 ms | ≤ 30 ms | ≤ 30 ms |

Notes:
- The 190 KB initial target is benchmarked against three r185's WebGL build at about 187.5 KB gzip
  (§2.6). It includes lights, IBL and shadows. The old 80,000 B budget was met by removing those and is
  withdrawn.
- Tier differences in chunk totals come from post, SSR/TAA and volumetric chunks (PRDs 03, 10) loading
  only at tiers that enable them.
- Measured by `tools/bundle-size/lit-scene.ts` (T0.3) in `qr-prd15-bundle-size.yml` on every PR touching
  `packages/**`. On PRD 15 PRs it fails when a cap is exceeded. On other lanes' PRs it is report-only and posts the
  delta with the owning lane, so it never blocks another lane; overruns are reviewed at the next checkpoint.
- Mobile: Low-tier caps are checked under Chrome's 4× CPU throttle on macos-14 as a proxy, plus a
  real-device spot check (§19).

## 18. Browser coverage

- Chromium (latest stable) on macos-14 via ANGLE Metal: all browser tests and captures.
- WebKit (Playwright WebKit on macos-14): `renderer-single-path`, `renderer-mount-failure`,
  `lean-shim`, `pack-consumer-smoke` and the §16.3 fixture captures.
- Firefox (Playwright Firefox on macos-14): the same four specs, pass/fail on their assertions. Firefox captures
  are recorded but not judged until a Firefox baseline exists in C-30 (Q-12-2); standalone acceptance does not
  depend on them.
- WebGPU path: standalone, the spec asserts that `backend: "webgpu"` resolves through C-29 `Renderer.create` (no
  second class) and is skipped for pixels. Pixel coverage on WebGPU is integrated (§16A IA-5).
- SwiftShader or software GL is never used for visual gates (research/14 §7.2).

## 19. Mobile coverage

- Playwright device emulation on macos-14 (iPhone 13 viewport 390×844 with DPR 3 in WebKit; Pixel 7
  412×915 with DPR 2.625 in Chromium) for `pack-consumer-smoke` and the §16.3 fixture captures.
- Bundle and parse budgets (§17 Low) are enforced in `qr-prd15-bundle-size.yml` with 4× CPU throttling.
- Real-device spot check, once per release candidate (3.1.0 and 4.0.0): the owner, or a remote device
  farm if one is provisioned through the shared cloud scripts, loads the `prd15-lean-product` fixture and
  `showcase-siege-golf` on an iPhone (Safari) and a mid Android (Chrome) and records `diagnostics()`
  output (backend, degradations, compiled features) plus a screenshot. If no device is available, the
  release notes record it as an open gap; it is not waived silently.
- The error overlay (T4.3) must be readable at 390 px width (no horizontal scroll, ≥ 16 px text).

## 20. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd15/` (lane-owned; images as JPEG ≤ 400 KB each;
raw PNGs stay in workflow artifacts with hashes):
- `baselines/phase0.json` and IC-0 contact sheets and benchmark side-by-sides (links to run ids).
- `phase-N/` contact sheets for every phase with a §16.1 gate, plus the pairwise judgment JSON in C-32 shape
  (`{ game, category, vision: "A|same|B", human: "A|same|B", reviewer, runId, qrFlags }`).
- `16-instancing-before-after.jpg` with the rerun research/23-style judgment text.
- `fixtures/prd15-lean-product-{before,after}-{desktop,mobile}.jpg`,
  `fixtures/prd15-lean-minigame-{before,after}-{desktop,mobile}.jpg`, and the §16.3 judgment.
- `error-overlay-{desktop,mobile}.png` from `renderer-mount-failure.spec.ts`.
- `arch-gates.json`, `bundle-sizes.json`, `script-prune-report.json`, `root-export-dispositions.json`
  and `lean-device-diff.md` at the end of each phase that changes them.
- `requests.json`: every §12.4 request with issue link and state, refreshed before each checkpoint.
- Integrated evidence (§16A) is not written here. It lives in the checkpoint records
  `benchmarks/quality-rebuild/history/rounds/IC-<k>.json` (owner 12); this directory only links them.
Every artifact records the commit SHA, workflow run id and `qrFlags`. Evidence describes what was measured. It
does not label anything "parity", "faithful" or "AAA".

## 21. Completion criteria

**Lane complete (standalone; all verified on GitHub Actions at the final PRD 15 commit):**
1. Exactly one renderer class (`Renderer`) reachable from 15-owned code, through C-29. `single-renderer` and
   `glsl-location` pass in fail mode with allowlist entries only for open §12.4 requests (Q-07-2, Q-11-1, Q-01-4).
2. `packages/engine/src/agent-api/index.ts` ≤ 300 lines (or the CCR-15-2 / Q-01-5 fallback targets). No 15-owned
   file in `packages/*/src` exceeds 2,500 lines outside the dated allowlist. `layering` and `no-cycles` pass.
3. With `A3D_QR_COMPILER` on, `compileScene` is the only producer of `RenderSource` for builder scenes. The default
   handler table is exhaustive. `optionCoverage.test.ts` covers 100% of builder option fields. Every merged
   `DIAGNOSTIC_ONLY_FIELDS` entry names an owner. C-36 and C-37 conformance green for stub and real.
4. With `A3D_QR_STRICT` on, no silent visual fallback: `renderer-mount-failed` throws and shows the overlay; 36
   strict captures show zero degradations from 15-owned sites. `createWebGLSceneRenderer` and its GLSL are deleted
   once the flag is removed (§5.4).
5. In-repo and published resolution are identical (`resolution:check`). `pack:check` passes for every shipped and
   create-aura3d template (read-only).
6. "." has ≤ 350 runtime values plus the counted deprecated union names, and 0 evidence-regex names outside
   deprecated re-exports. ≤ 16 subpaths. `unique-ownership` reports 0 names with different declarations apart from
   dated entries tied to open requests.
7. `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/editor` and `LeanWebGL2Device` are gone (4.0.0). The 15-owned
   parts of `@aura3d/environments` and `@aura3d/materials` are gone. Lane fixtures pass §16.3.
8. ≤ 80 root scripts; every 15-owned `tools/` dir referenced; 0 maps/js/d.ts under `packages/*/src`.
   `tsconfig.base.json` has `noEmit: true`. dist contains no tests or tools.
9. §16.1 passed for every phase. §16.2 instancing passed. §17 CPU, heap and bundle budgets met and recorded in a
   generated `BUNDLE_SIZES.md`.
10. README and MIGRATION-4.0 describe the consolidated surface without parity/faithful claims. F-15-* facts are
    `verified` in CONTRACTS Appendix B.
11. Custodian duties (§12.2) delivered: PR 0 merged and IC-0 passed; every flag state transition recorded from a
    checkpoint record; no CCR older than one working day.

**Program-level (integrated; reported at checkpoints, not required to close the lane):** §16A IA-1 to IA-10, which
include `@aura3d/environments`/`@aura3d/materials` directory removal, ≤ 60 `tools/` dirs, an empty
`single-renderer` allowlist, real templates passing §16.3, and skills updated by 13.

Not completion criteria: unit test count, number of green workflows, or route-health 200s.

## 22. Rollback considerations

- Each phase lands as a series of single-purpose commits on a PR branch. Pure-move commits are
  revertable independently of behaviour commits.
- Phases 1-7 keep deprecated aliases. Reverting a phase never breaks external consumers of 3.0.x
  APIs, because nothing is removed from npm until 4.0.0.
- Renderer fold-in (Phase 2): until T2.6 deletes the files, `ProductionRuntimeRenderer` stays
  alongside behind a temporary option `renderer.__legacyBridge: true`, used only by the capture
  harness to A/B. The option and the old files are deleted in the same commit once §16.1 passes. After
  deletion, rollback is `git revert` of that commit.
- Silent fallback removal (Phase 4) is the one change that can make a live route fail visibly where it
  "worked" before. It is behind `A3D_QR_STRICT`, so the first rollback is the flag: with the flag off the legacy
  fallback runs, and turning it off needs no code change. Before promoting the flag, run the 36 strict captures
  plus the 32 `A3DRenderer` apps' route health. Any route that throws `renderer-mount-failed` is a pre-existing
  hidden failure. It is filed against the owning lane, or that route's owner adds `strict: false` with a tracking
  issue. Once the flag is removed (T4.4), never restore the fallback.
- The real compiler (`A3D_QR_COMPILER`) rolls back the same way: flag off returns to the PR 0b-1 wrapper around the
  moved legacy bridge, which the C-36 conformance suite keeps byte-equal on the 18 base snapshots.
- PR 0 parts are independently revertable (0a additive; each 0b part is a verbatim move). Reverting a 0b part
  returns its regions to the hot-file owner, as CONTRACTS §3.9 allows for a carve-out that could not stay verbatim.
- Reverts that turn main green are exempt from the ownership check (CONTRACTS §6.1); this lane re-lands.
- Script and tool deletion (Phase 7): one commit per family. `script-prune-report.json` lists every
  deleted name, so a single `git revert` restores a family.
- Orphan map deletion is not tracked by git (the files are untracked; `git ls-files` lists 0 `.map` files), so it
  cannot be reverted with git. The files are build debris with no consumers. The procedure in Appendix A D-14
  includes a tarball backup in the workflow artifact.
- 4.0.0 is published only after the §11 window. If a regression is found after publish, ship 4.0.1 with
  a fix. Re-adding a removed API requires owner approval, recorded in the PR.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PR 0b carve-outs slip and other lanes cannot edit their regions | medium | high | 0b split into three independent PRs; a carve-out that cannot stay verbatim is dropped and its region stays with the hot-file owner (CONTRACTS §3.9); lanes write replacements in their own modules meanwhile |
| A non-verbatim change sneaks into a carve-out | medium | high | Moved-line-count script in each PR; C-36 flag-off byte-equal `RenderSource` on 18 snapshots; IC-0 identity |
| Custodian bottleneck (CCRs, root-manifest batch, flag transitions) delays other lanes | medium | medium | CCR SLA one working day; daily root batch; lanes use their own package manifests (CONTRACTS §4.4); flag transitions only at checkpoints, which no lane waits on |
| §12.4 requests go unanswered and allowlists become permanent | medium | medium | Every allowlist entry has an expiry date and a request id; past-date entries fail the gate; open requests listed in every checkpoint report |
| Resolution union keeps 77 deprecated names on "." longer than planned | medium | low | Counted separately by `export-budget`; removed per name as consumers migrate (§6.6 step 3) |
| `LeanWebGL2Device` holds real fixes not in `WebGL2Device` | medium | medium | T2.3 line-level classification with tests per line, attached to Q-01-1 |
| Strict default breaks shipped games that silently degrade today | medium | medium (visible error instead of degraded frame) | Flag-gated; strict captures before promotion; per-route `strict: false` only with a tracking issue |
| 190 KB initial bundle unattainable with IBL and shadows in the initial chunk | medium | low | Measured in Phase 4. If over, the PMREM generator and shadow programs move to a lazy chunk fetched in parallel with assets; the cap is re-set from measurement with the delta documented, never by dropping lighting |
| Export trimming breaks unknown external consumers | low (4 published packages, small user base) | medium | Deprecated aliases for one minor and 4 weeks; generated migration doc; codemods |
| Script/tool pruning deletes something a workflow or release step needs | medium | medium | Reference scanner includes workflows; `script-prune --check` in CI; per-family revert; other lanes' tool dirs only by request |
| Option-sensitivity test becomes a rubber stamp (probe values chosen to differ trivially) | medium | medium | Probe values must be the documented min/max or two named presets. Reviewers reject probes that only change ids or names; the diff ignores ids |
| Agents and skills keep using deleted paths | high | medium | F-15-* facts to 13 (Q-13-5); arch gate fails on imports of removed subpaths in 15-owned code and reports the rest |
| Release cadence collapses the deprecation window | medium | medium | 4-week floor in §11 |
| This PRD gets reported as quality progress | medium | high (repeats research/01 P1-P3) | §16 gates are neutrality or specific defect closure only; no competitiveness claim is allowed from this PRD |

## 24. Explicitly out of scope

- Any change to shading math, tone mapping, IBL, shadows, post kernels, materials, tessellation, DPR
  or quality tiers (contracts C-02..C-05, C-09..C-15, C-27; lanes 01-04, 11). This PRD only moves 15-owned code
  and hosts the seams.
- WebGPU backend correctness (C-29 real, lane 11). This PRD only consumes `Renderer.create`.
- Re-implementing a three.js drop-in compatibility layer. The CLI codemod is the full extent.
- Game content, HUD, audio and route-local evidence removal (lanes 09, 14). Template art direction and all edits
  to templates, examples and skills (lane 13, R20).
- New visual gates, golden images and capture-harness changes (C-30..C-33, lane 12). This PRD deletes its own
  fabricated gates and supplies the pixel-neutral check its own phases need.
- Editing any file another lane owns after PR 0 (CONTRACTS §4); those changes are §12.4 requests.
- Publishing additional npm packages. The workspace stays one umbrella package plus the CLI, `create-aura3d` and `asset-index`.
- `tests/reports` local purge (9.5 GB, research/14 §0.10): developer-machine hygiene, handled by CI artifact retention (lane 12).
- ECS (`@aura3d/ecs`) redesign. It stays a low-level `RenderSource` producer.

---

## Appendix A: Deletion list with safety checks

Common safety procedure for every item: (1) `rg -l` for each exported name and file path across
`packages apps examples templates benchmarks tests tools .github skills` (excluding `docs/project/**`
history and the item itself) → every hit is migrated or deleted in the same commit; (2)
`tsc --noEmit -p tsconfig.check.json`; (3) `pnpm pack:check`; (4) for render-path items, the §16.1
pixel-neutral captures; (5) one commit per item so it can be reverted.

| ID | Target | Size | Consumers (re-measured) | Extra safety check | Phase |
|---|---|---|---|---|---|
| D-01 | `agent-api/index.ts:15982-17286` (`createWebGLSceneRenderer`, GLSL, `parseGlb`, `loadGltfForWebGL`, backdrop, particle model, `compileShader`, `createGltfRuntimeNodes`) | ≈1,300 lines | only the fallback call sites `:12530`, `:12545` | TS reference check per symbol; `rg "#version 300 es" packages/engine/src` = 0; browser fallback-marker test | 4 |
| D-02 | `packages/rendering/src/LeanWebGL2Device.ts` | 4,537 | lean renderers only; 2 tests | T2.3 classification done and bugfixes ported | 4 |
| D-03 | `rendering/src/lean/LeanProductionRenderer.ts`, `lean/LeanProductRenderer.ts`, `lean-runtime.ts`, `lean-core-runtime.ts` | small | `@aura3d/lean` only | lean shim browser test green | 4 |
| D-04 | `rendering/src/advanced-runtime/AdvancedRenderer.ts` | 73 | 0 apps / 2 tests | methods present on `Renderer` | 2 |
| D-05 | `rendering/src/threejs-example-parity/index.ts`; `engine/src/threejs-example-parity/{index,FlagshipFoundation}.ts` | 205 + engine files | 0 / 0 for the rendering class | removes 25 cross-package relative imports; `no-cross-package-relative` green | 2 |
| D-06 | `production-runtime/ProductionWebGL2Renderer.ts`, `ProductionRuntimeRenderer.ts` | 356 + 244 | bridge plus 2 apps / 16+9 tests | `renderFrame` equivalence test; §16.1 | 2 |
| D-07 | `engine/src/production-runtime/index.ts:175` `A3DRenderer` #2 | class | `./production-runtime` subpath | alias in place | 2 |
| D-08 | `engine/src/advanced-runtime/A3DRenderer.ts` body | 206 | 32 apps | codemod run, 6-app §16.1 | 2 (alias), 8 (alias removal) |
| D-09 | `production-runtime/shaders/wgsl/pbr.wgsl`, `skybox.wgsl`, `production-runtime/backends/{webgl2,webgpu}/*` 2-line shells, `webgpu/WebGPUPipelineCache.ts` — all owner 11 | tiny | none rendering | request Q-11-1; `single-renderer` allowlists them meanwhile | 5 |
| D-10 | Barrel-only orphan rendering files (31 files, 4,928 lines). 15-owned and deleted here (T5.4): `RendererVisualPipelineReport.ts` (843), `PrimitiveSubmissionAudit.ts` (460), `ReflectionSurfaces.ts` (358), `VoxelWorld.ts` (275), `ScreenSpaceReflectionPass.ts` (78), `UniformBinder.ts`, `performance/{Octree,RendererStats,ResourceBudget}.ts` and the rest whose `QR_OWNERSHIP.json` owner is 15. Other owners, by request: `PbrReference.ts` (842, 01, Q-01-3), `VegetationScatter.ts` (315, 10, Q-10-1), `performance/LOD.ts` (05, Q-05-2), `performance/FrustumCuller.ts` (11, Q-11-4), `shadows/CascadeHysteresis.ts` (146, 02, Q-02-2: keep, CSM stable-fit math) | 4,928 | 0 outside barrel (research/13 §2.4) | per-file name check; any file `_sections/E` lists as "keep, currently unreachable" is not deleted | 5 |
| D-11 | `packages/three-compat/**` (except `migration/` → CLI) | 1,586 | 0 apps / 7 tests | CLI codemod tests green | 6 |
| D-12 | `templates/three-compat-*` (8), `templates/external-parity-*` (4) — owner 13 | 2-line stubs; 4 small apps | scripts/tests that list them | request Q-13-4 / Q-13-6; 15-owned script and test hits removed here | 6, 1 |
| D-13 | 2 three-compat parity specs and 20 `three-compat:*` scripts (15, deleted here); `benchmarks/three-compat/` and `tools/three-compat-*` (30) (12, Q-12-3) | — | `three-compat:release` chain | research/19 C18 confirms fabrication | 6 |
| D-14 | 1,194 orphan `*.js.map`/`*.d.ts.map` in `packages/*/src` | build debris | none (untracked, gitignored) | Procedure: `find packages -path '*/src/*' \( -name '*.js.map' -o -name '*.d.ts.map' \) -not -path '*/node_modules/*' > /tmp/maps.txt`; for each, assert the sibling `.js`/`.d.ts` does **not** exist and `git ls-files --error-unmatch` fails; tar the list as a workflow artifact; then delete only listed files. Do **not** use `git clean -fX` (it also removes other ignored files such as `.tsbuildinfo`, local env files) | 7 |
| D-15 | `packages/environments` (15-owned files; directory after Q-02-2/Q-10-1) | 464 | 0 apps / 1 test | diagnostics moved or deleted | 6 |
| D-16 | `packages/materials` (15-owned files; `NodeMaterial.ts` by Q-11-2) | 742 | 2 app/template / 1 test | preset values snapshot-tested; Q-04-2 review | 6 |
| D-17 | `packages/editor` (1-line alias) | 1 | `./editor` subpath | alias in place | 6 |
| D-18 | `packages/lean` | 1,243 | 16 template files (switched in T4.7) | 4.0.0 window elapsed | 8 |
| D-19 | `packages/input/src/controls/*` | — | input consumers | equivalence tests T6.9 | 8 |
| D-20 | Duplicate math in `physics/src/Shape.ts` and `SceneGroundingUtils.ts` `Vec3` (15); `animation/src/Keyframe.ts` (06, Q-06-3); `PbrReference.ts` `Vec3` (01, Q-01-3) | — | internal | property tests T6.8 | 6 |
| D-21 | `dist/index.*` aggregate and dead `files` entries | — | no export condition | `pack:check` | 1 |
| D-22 | Alias subpaths (`./engine-runtime`, `./workflows/production-runtime`, `./assets/production-runtime`, `./editor`) and the other §11 subpaths | — | fixture consumer | deprecated stub tested | 5 → 8 |
| D-23 | `MIGRATION-2.0.md`, `BUNDLE_SIZES.md` hand table | docs | README links | regenerated replacements exist | 4, 7 |
| D-24 | Root scratch files (research/13 §8.3) | ~25 files | none | `git ls-files` + `rg` per basename | 7 |
| D-25 | Root scripts beyond the ≤ 80 kept set (15); 15-owned unreferenced `tools/` dirs; 12/11-owned unreferenced dirs by Q-12-3/Q-11-3 | 480+ scripts; ~390 dirs | per `script-prune-report.json` | scripts invoked by C-30/C-33 tools or 12-owned workflows kept automatically; per-family commits | 7 |
| D-26 | `tools/verify-architecture` | 395 | CI | `arch-gates` in fail mode replaces it | 7 |

Do not delete (verified sound and in-path or awaiting wiring, research/13 §13 and `_sections/E` keep
list): `Renderer`, `WebGL2Device`, `ForwardPass`, `WebGL2StateCache.ts`, `RenderGraph.ts`,
`RendererTiming.ts`, `RenderItemSorting.ts`, `PBRHDRPipeline.ts` (moved), `CascadedShadowMaps.ts`
(PRD 02), `NativeBloomPyramid` planner (PRD 03), `EnvironmentBackgroundPass` (PRD 02),
`ResidentGPUParticleRenderer` and the GPU particle kernels (PRD 07), `TerrainHeightfield`,
`OceanSurface` (PRD 10), `GLTFAnimationRuntime`, the skinning chunks and IK (PRD 06), the typed asset
manifest flow (`defineAuraAssets`), `@aura3d/physics` + `physics-rapier`, and `navigation-recast`.
