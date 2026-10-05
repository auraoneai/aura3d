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

Modify:
- `packages/engine/src/agent-api/index.ts`: split per §6.3 until it is a re-export file of at most 300 lines.
- `packages/engine/src/agent-api/Decals.ts:39,47`: import from `./nodes/types.js` and `./nodes/builder.js`, not `./index.js`.
- `packages/engine/src/index.ts` (289 lines): becomes the internal aggregate for `./renderer` and `./devtools` only. It no longer backs "." in any resolver.
- `packages/rendering/src/Renderer.ts`: `RendererOptions`/`create` (`:105-111`, `:472`) gain `backend: "auto" | "webgpu"` selection (from `ProductionRuntimeRenderer.ts:57-90`); new `onDeviceLost`/`onDeviceRestored`/`isDeviceLost` (from `ProductionWebGL2Renderer.ts:54-67`) and `renderFrame`/`renderFrameAsync` result wrappers (from `:69-95`). Existing `render`, `renderAsync`, `resizeToDisplay`, `startAnimationLoop` and `captureFrame` are kept as they are.
- `packages/rendering/src/index.ts` (1,193 lines, 43 `export *`): curated named exports only.
- `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`: moved to `packages/rendering/src/environment/hdrEnvironment.ts` (HDR parse and environment-lighting resource builders, consumed by `compiler/environment.ts`; PRD 02 owns the contents). `TransmissionBackdropCapture.ts` stays with the WebGPU path (PRD 11). `ProductionEffectsPipeline.ts` is deleted (D-27).
- `packages/engine/src/agent-api/RootRuntimeSupport.ts`: `attachRootRenderSource` stays public. Its source becomes a compiler input (§6.4).
- `packages/rendering/src/effects/{ResidentGPUParticleRenderer,GPUParticleBackend}.ts`: take the `GPUDevice` from `Renderer` instead of requesting an adapter (PRD 07/11 implement; this PRD adds the gate and an allowlist with an expiry date).
- `packages/lean/src/{index,product,game}.ts`: deprecated re-exports plus `leanCompat` adapters (§6.7).
- `packages/aura3d-cli/src/asset-manifest.ts:112-125`: always emits `@aura3d/engine`.
- `benchmarks/quality-rebuild/aura3d/common.ts:291` and the other 67 `renderer.mode`/`fallback` callers: `renderer-mode` codemod (§10).
- `.github/workflows/quality-rebuild-capture.yml`: add a `strict` dispatch input that appends `aura-strict=1` to every captured URL. Document that `local_build_all: true` is required for any pre-merge gate.
- `packages/create-aura3d/src/index.ts:47`, `src/cli.ts:33`: default template stays `product-viewer`, but the template imports `@aura3d/engine`.
- `templates/product-viewer/src/{main,aura-assets}.ts`, `templates/mini-game/src/{main,aura-assets}.ts` and the `packages/create-aura3d/templates/{product-viewer,mini-game}` copies (16 files including `package.json` and `README.md`): import from `@aura3d/engine`.
- `/package.json`: `exports`, `files`, `scripts`.
- `tsconfig.base.json`: add `"noEmit": true`. Generated `paths` block.
- `tsconfig.build.json`: `"noEmit": false`, include only `packages/*/src/**/*.ts`, exclude `**/*.test.ts`.
- `tsconfig.browser-301.json`: generated or deleted.
- `vite.config.ts:40-60`: the alias table is imported from a generated module. The generator keeps the existing "subpath before bare package" ordering (the comment after `:52`).
- `tools/finalize-dist/index.ts`: delete the regex rewriting at `:99-153` and the `dist/index.js` writer at `:62-63`. Driven by the export manifest.
- `tools/verify-architecture/index.ts`: replaced by behaviour gates (§6.12).
- `BUNDLE_SIZES.md`, `README.md:211-212,684`, `MIGRATION-2.0.md`: rewritten from measured output.

Create:
- `tsconfig.check.json` (Phase 1, T1.0): `noEmit`, includes `packages/*/src`, `tests/**`, `tools/**` and the three root configs. It is the type-check config every later task uses.
- `packages/engine/src/agent-api/nodes/*.ts`, `compiler/*.ts`, `app/*.ts`, `devtools/*.ts` (§6.3).
- `packages/engine/src/public/index.ts` (the "." entry), `public/renderer.ts`, `public/devtools.ts`.
- `packages/engine/src/agent-api/app/degradation.ts`, `app/errorOverlay.ts`, `app/mountRenderer.ts`.
- `packages/engine/src/agent-api/nodes/game/leanCompat.ts`, `nodes/game/arcade.ts` (moved `ArcadeRuntime.ts`).
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

Final owner: `packages/rendering/src/Renderer.ts`.

Fold-in (§2.8 item 1: most of the surface already exists on `Renderer`, so this is mostly deletion):
- `ProductionRuntimeRenderer.create` backend selection (`ProductionRuntimeRenderer.ts:57-90`:
  `"webgl2" | "webgpu" | "auto"`, WebGPU behind dynamic import at `:71`) moves into the existing
  `Renderer.create` (`Renderer.ts:472`) as `RendererOptions.backend`, with the dynamic import kept.
  `ProductionWebGL2Renderer`'s `requiredFeatures` list and its "must be a real WebGL2 device" check
  (`:35-43`) become the bridge's call arguments, not `Renderer` defaults.
- Device-loss listeners (`ProductionRuntimeRenderer.ts:45-55`, `ProductionWebGL2Renderer.ts:54-67`)
  become `Renderer.onDeviceLost/onDeviceRestored/isDeviceLost`. They forward to the device, as today.
- `renderInteractiveFrame/renderFrame/renderFrameAsync(ProductionRendererInput)`
  (`ProductionWebGL2Renderer.ts:69-95`) wrap `Renderer.render`/`renderAsync` with a timing accumulator
  and a feature list. They become `Renderer.renderFrame(input: RendererInput)` and `renderFrameAsync`, which
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
  pipeline (§2.8 item 2). It moves to `rendering/src/environment/hdrEnvironment.ts`, is exported from
  `./renderer` for `compiler/environment.ts` and `apps/common`, and PRD 02 owns its contents.
  `TransmissionBackdropCapture` (175) stays with the WebGPU backend (PRD 11).
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
  lacks (for example `A3DScene` input handling). Each such member is ported onto `Renderer` or recorded in
  the codemod as a rewrite. `A3DRenderer.evidence()` (`:129`) moves to `./devtools`. A codemod rewrites the
  33 imports, including the inline `<script type="module">` in the HTML file.
- Bridge-side context access: `index.ts:13610` (`canvas.getContext("webgl2")` to read `MAX_TEXTURE_SIZE`)
  is replaced with `renderer.device` capability data (`RenderDeviceCapabilities.maxTextureSize`, which is
  added if missing).
- WebGPU device owners outside `WebGPUDevice` (§2.1: `ResidentGPUParticleRenderer.ts:116-118`,
  `GPUParticleBackend.ts:283,359`, `ProductionWebGPURenderer.ts:486`): `single-renderer` lists them in an
  allowlist that expires at 4.0.0. PRD 07 changes the particle code to take `renderer.device`'s
  `GPUDevice`. PRD 11 folds `ProductionWebGPURenderer` into `WebGPUDevice`. Neither is pixel work for this
  PRD.
- `createWebGLSceneRenderer` and everything only it reaches (`index.ts:15982-17286`, the GLSL at
  `:16713-16975`, `parseGlb`/`loadGltfForWebGL` at `:17002-17030`, `createWebGLBackdrop` `:16215`,
  `createWebGLParticleModel` `:16548`, `compileShader` `:16977`) are deleted. PRD 01 Phase 7 owns the
  behavioural removal (throw instead of fallback). This PRD owns the code deletion and the type
  surface.
- `LeanWebGL2Device.ts` is deleted. Any of its 346 differing lines that are a real fix (not a feature
  removal) are ported into `WebGL2Device.ts` first. Phase 2 task T2.3 produces the line-level
  classification.

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

Move discipline: every move is a pure move commit (code unchanged, import paths only), verified by
`tsc --noEmit` and the pixel-neutral capture (§16.1). Behaviour fixes are separate commits. The one
exception is `createProductionInstanceTransforms`: it ships with its fix (`size` included, §9) and a
regression test, because research/22 confirmed the bug and PRD 01 §5 already targets the function.

Visual benefit: none directly. It is the precondition for PRDs 01-08 to land in one place.
GPU 0. CPU 0 at runtime. Memory 0. Bundle: −5 to −15 KB gzip from removing the `export *` fan-in
(estimate; measured in Phase 3). Mobile: parse cost drops with bundle. Fallback: n/a (refactor).

### 6.4 One scene compiler

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
exposure; instance size) reach pixels. It is the single wiring point for PRD 02 CSM/IBL, PRD 03 post
and PRD 07 particles. GPU 0. CPU: `updateCompiledScene` must be ≤ the current
`createProductionRuntimeRendererInput` cost. Budget §17: ≤ 0.6 ms for 500 nodes on Medium, using
version counters to skip unchanged nodes. Memory: +1 cached `RenderSource` per app (< 1 MB for 2k
items). Bundle: neutral. Mobile: CPU win from skipping unchanged nodes. Fallback: none. A missing
handler is a compile-time error and an unknown runtime kind throws `AuraRuntimeError("unknown-node-kind")`.

### 6.5 Silent fallback removal

```ts
// app/degradation.ts
export type AuraDegradationCode =
  | "renderer-mount-failed"          // fatal: always throws
  | "texture-upgrade-failed"         // index.ts:14174
  | "sdf-text-fallback"              // :14571
  | "pose-apply-failed" | "clip-apply-failed" | "morph-apply-failed" | "foot-planting-failed"  // :13875, :15121, :15178, :15147
  | "extension-lobe-pending"         // PRD 01 §6.6
  | "capability-degraded"            // explicit capability fallback (PRD 01 §6.1 rule 5)
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

- `renderer-mount-failed` always rejects `createAuraApp` and paints `app/errorOverlay.ts` (a DOM
  `role="alert"` element over the canvas with message and cause) in every build. The prior behaviour
  was a different renderer. The new behaviour is an obvious error.
- Capture and benchmark harnesses (`tools/quality-rebuild-capture`, `benchmarks/quality-rebuild/aura3d/*`)
  run with `strict: true`. A capture with any degradation fails.
- Shipped games may pass `strict: false`. The dev overlay badge ("N degradations") still shows when
  `location.search` contains `aura-debug` or the build is a dev build (`import.meta.env?.DEV`).
- The `fallback` option and the `AuraRendererMode`/`AuraRendererFallbackMode` types are removed.
  Passing them throws `AuraMigrationError` (PRD 01 §7.1 defines the message. This PRD sets the
  calendar, §11).

Visual benefit: no frame silently renders with a one-light shader or with scalar materials in place
of textures. GPU/CPU/memory 0. Bundle −30 to −40 KB gzip (the fallback renderer, about 1.3k lines with
GLSL, plus its GLB parser). Mobile: a context-loss or OOM mount failure now shows an error instead of a
degraded frame. PRD 11 owns tiered quality, which is the honest mobile answer. Fallback strategy: the
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
  `templates/production-*`).

### 6.7 `@aura3d/lean` decision

Decision: **delete the second builder API**. `@aura3d/lean`, `/product` and `/game` become
deprecated re-exports of "." for one minor release, then are removed. Bundle size is reached by
code-splitting inside the one API, not by a second API with different semantics.

- 3.1.0: `packages/lean/src/index.ts`, `product.ts` and `game.ts` each become
  `export { createAuraApp, scene, model, primitives, material, lights, camera, environments, interactions, defineAuraAssets } from "@aura3d/engine";`
  plus a one-time `console.warn` naming the replacement. `ArcadeRuntime.ts` is checked for consumers.
  If it has none it is deleted; otherwise it moves to `nodes/game/arcade.ts`. `base.ts` is deleted.
  Lights now render, environments now apply, rotation now works (research/19 C7).
- Templates `product-viewer` and `mini-game` (and the create-aura3d copies) import `@aura3d/engine`.
  `mini-game` gains a key light, an environment and shadow-receiving ground (its scene makes no light
  calls today, research/19 C7 skeptic 2). PRD 13 owns template art defaults. This PRD owns the import
  switch.
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
plus shadow map). This is the cost of looking modern and is in PRD 01/02 budgets. CPU +0.1 ms. Memory
+environment map (PRD 02: ≤ 6 MB on Medium). Bundle: the starter grows from 77.5 KB to the §17 budget
(≤ 190 KB gzip initial for a lit scene). The 80,000 B budget is withdrawn as a lighting-free target.
Mobile: Low tier keeps one directional shadow and a 256-face PMREM (PRD 02/11). Fallback: none; the
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
  to `rotationOrder: "XYZ"` (PRD 01 §6.2).
- `templates/three-compat-*` (8 two-line stubs) are deleted. The 8
  `packages/create-aura3d/templates/three-compat-*` (plain engine scenes) are renamed to remove the
  label: `architecture-interior`, `asset-inspector`, `character-viewer`, `custom-scene`,
  `large-scene`, `material-authoring`, `postprocess-scene`, `premium-product-viewer`.
  `create-aura3d --template three-compat-<x>` maps to the new name with a warning for one minor.
- `benchmarks/three-compat/`, `tests/browser/three-compat-threejs-{visual,runtime}-parity.spec.ts`,
  `tools/three-compat-*` (30 dirs) and the 20 `three-compat:*` scripts are deleted (research/19 C18,
  research/14 §6). README:684 ("install separately `@aura3d/three-compat`") is removed.
- PRD 13 updates the `aura3d-threejs-migration` skill to the CLI codemod and removes references to
  `ThreeCompatibilityMatrix` and `ApproximationLedger`.

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
| Vector/matrix/quaternion math | `@aura3d/math` classes plus `@aura3d/scene/math` tuple functions (`MathTypes.ts`). The scene tuple module is the canonical `Vec3`/`Quat`/`Mat4` type owner | `animation/src/Keyframe.ts` math (`Mat4`, `identityMat4`, `composeMat4`, `multiplyMat4`, `normalizeQuat`) → import from scene/math. `physics/src/Shape.ts` vector helpers (`vec3`, `addVec3`, …, `EPSILON`) → import. `Vec3` in `SceneGroundingUtils.ts` and `PbrReference.ts` → import |
| Controls | `@aura3d/controls` | `packages/input/src/controls/` → re-export from controls for one minor, then delete |
| `AnimationController` | `engine/agent-api/AnimationController.ts` (the one games bind; PRD 06 owns its fixes) | `animation/src/AnimationController.ts` export renamed `AnimationLayerController` if it has distinct semantics, else deleted. PRD 06 decides; this PRD enforces "one owner per name" |
| GLB parsing | `assets/GLTFLoader.ts` | agent-api `parseGlb`/`loadGltfForWebGL` (deleted with the fallback). `ProductionAssetCorpus.ts`/`AdvancedAssetCorpus.ts` call `GLTFLoader`. Template scripts import `@aura3d/engine/assets` |
| Material presets | one registry `compiler/materialPresets.ts` feeding `material.*` | `rendering/src/{MaterialPresets,cinematic/CinematicMaterialPresets,ArchitecturalMaterialCatalog,animation/AnimationMaterialStyle}.ts` merged into it (PRD 04 owns values). `@aura3d/materials` deleted |
| Environments | `environments.*` builders plus `rendering` PMREM/HDR (PRD 02) | `@aura3d/environments` deleted. Its two diagnostics values move to `./devtools` |
| Name collisions with different declarations (53) | one declaring package per name | arch gate `unique-ownership` fails on any name exported by two package indexes with different declarations |

### 6.11 Process weight: scripts and tools

Target: **≤ 80 root scripts** and **≤ 60 `tools/` directories**.

Kept scripts (canonical set; names fixed so CI and skills can rely on them): `dev`, `build`, `build:dist`,
`typecheck`, `typecheck:tests`, `lint`, `test`, `test:unit`, `test:integration`, `test:browser`,
`test:visual` (PRD 12 redefines it as golden-image regression), `bench:quality` (benchmarks/quality-rebuild),
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
(20), `head-to-head:*` (20; the frozen r185 inputs move to PRD 12 if it keeps them),
`threejs-parity:*` (17), `superiority:*` (12), `audit:*` (23), `aura3d10x:*`, `muse*`,
`premium-indie:*`, `final-competitive:*`, `remediation:*`, `foundation:*`, `engine-readiness:*`,
`current-routes:*` except route health. `verify:*` (77) and `check:*` (53) go to review: kept only if
they test behaviour PRD 12 or §6.12 keeps.

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

### 6.13 Recommendation cost summary

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gzip) | Mobile impact | Fallback strategy |
|---|---|---|---|---|---|---|---|---|
| R1 | One `Renderer`, one device per backend; delete 9 front-ends and `LeanWebGL2Device` | Every route and template renders through the path PRDs 01-03 fix; fixes stop drifting | 0 | 0 | −1 device copy in bundle; −VAO/program duplication when apps mixed paths | −35 to −50 KB (device fork plus wrappers; measured in Phase 4) | Smaller parse; identical GPU work | None; mount failure throws with overlay |
| R2 | Agent-api split into nodes/compiler/app/devtools | Precondition for every visual PRD to wire once | 0 | 0 | 0 | −5 to −15 KB (no `export *` fan-in) | Parse win | n/a (pure moves) |
| R3 | One compiler with an exhaustive handler table and option-sensitivity tests | Dropped calls reach pixels (lean lights/env, exposure, instance size) | 0 directly | ≤ 0.6 ms per 500 nodes update on Medium (dirty-skipping) | +≤ 1 MB cached source | 0 | CPU win from dirty-skipping | Unknown kind throws |
| R4 | Remove silent fallbacks; typed degradations; strict captures | No degraded frame ships unnoticed; captures stop passing on degraded output | 0 | 0 | 0 | −30 to −40 KB (fallback renderer) | Error overlay on mount failure | Explicit `capability-degraded` only |
| R5 | Root "." ≤ 350 values; `./devtools`; ≤ 16 subpaths | Agents find the real API; fewer wrong-path scenes (research/12) | 0 | 0 | 0 | −20 to −60 KB on routes that pulled evidence helpers through the barrel (measured) | Parse win | Deprecated aliases for one minor |
| R6 | Delete `@aura3d/lean` second API | Default `create-aura3d` scene lit, with IBL and shadows | +0.5-1.5 ms Medium versus lightless lean | +0.1 ms | +env map (PRD 02) | Starter 77.5 → ≤ 190 KB initial | Low tier caps shadows/env (PRD 11) | None |
| R7 | three-compat → CLI codemod with computed report | None (honesty) | 0 | 0 | 0 | 0 npm; +15 KB CLI | n/a | None |
| R8 | Generated resolution maps plus packed-consumer check | Templates that render in-repo also render from npm | 0 | 0 | 0 | 0 | n/a | n/a |
| R9 | Build hygiene (`noEmit`, dist without tests/tools, orphan maps) | None | 0 | 0 | 0 | −dist size (tests/tools no longer shipped; measured) | n/a | n/a |
| R10 | Scripts ≤ 80, tools ≤ 60, behaviour gates | None directly; removes the gates that hid visual loss | 0 | 0 | 0 | 0 | n/a | Single revertable commit per family |

## 7. APIs to add, change, remove

### 7.1 `@aura3d/engine` "." (agent-facing)

```ts
// ---- App creation (change) ----
export interface AuraCreateAppOptions {
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  readonly renderer?: AuraCreateAppRendererOptions;   // shape owned by PRD 01 §7.1 (quality/output/resolution/msaa/compile)
  readonly strict?: boolean;                          // NEW, default true (§6.5)
  readonly onDegradation?: (d: AuraDegradation) => void; // NEW
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
  readonly renderer: AuraRendererDiagnosticReport;     // PRD 01 shape; no claim-boundary prose fields
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
  readonly prd: number;                               // 15 or 01
}
export type AuraDegradationCode = /* §6.5 */;
export interface AuraDegradation { /* §6.5 */ }

// ---- Removed from "." (types and values) ----
// AuraRendererMode, AuraRendererFallbackMode           → AuraMigrationError when passed (PRD 01 §7.1)
// AuraRendererQualityProfile.{supportedInRoot, blockedInRoot, claimBoundary, requestedFeatures, maxRecommendedDrawCalls}
// every name matching the evidence regex (§6.6) → "./devtools"
// sceneKitPerformanceBudgets, helperPerformanceBudgets  → "./devtools" (declarative constants, research/07 §0.8)
```

### 7.2 `@aura3d/engine/renderer` (new; replaces 6 subpaths)

```ts
export type RendererBackend = "webgl2" | "webgpu" | "auto";
export interface RendererCreateOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width?: number;
  readonly height?: number;
  readonly backend?: RendererBackend;                  // default "webgl2"; "webgpu" dynamic-imports WebGPUDevice (PRD 11)
  readonly antialias?: false;                         // context MSAA is always off; scene MSAA via PRD 01 tier
  readonly powerPreference?: "high-performance" | "low-power" | "default";
  readonly errorCheckMode?: "off" | "frame" | "draw";
  // no preserveDrawingBuffer: capture uses Renderer.capture() (PRD 01 §6.9)
}
export interface RendererFrameInput {
  readonly source: RenderSource;
  readonly camera: CameraLike | { readonly viewMatrix: Float32Array; readonly projectionMatrix: Float32Array; readonly position: readonly [number, number, number]; readonly near: number; readonly far: number };
  readonly timeSeconds: number;
}
export class Renderer {
  static create(options: RendererCreateOptions): Promise<Renderer>;
  readonly backend: "webgl2" | "webgpu";
  renderFrame(frame: RendererFrameInput): RenderDeviceDiagnostics;
  renderFrameAsync(frame: RendererFrameInput): Promise<RenderDeviceDiagnostics>;
  /** Convenience overloads kept from AdvancedRenderer/A3DRenderer #1. */
  render(source: RenderSource | Iterable<RenderItem> | Scene | A3DScene, camera?: CameraLike): RenderDeviceDiagnostics;
  resize(width: number, height: number): void;
  resizeToDisplay(options?: ResizeToDisplayOptions): ResizeToDisplayResult;
  startAnimationLoop(callback: (timeMs: number, renderer: Renderer) => void): RendererAnimationLoop;
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>; // PRD 01
  onDeviceLost(listener: () => void): () => void;
  onDeviceRestored(listener: () => void): () => void;
  isDeviceLost(): boolean;
  resetTemporalHistory(reason?: string): void;
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
(renamed `RendererFrameResult`), `ProductionRendererInput` (replaced by `RendererFrameInput`),
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

The mapping table (`packages/aura3d-cli/src/migrate-three/mappings.ts`) is data. A row's `mapping` is
`"exact"` only if a unit test renders both the three construct and the emitted Aura3D construct in
`benchmarks/quality-rebuild` style and the PRD 12 perceptual metric passes. Otherwise it is
`"approximate"`. The codemod makes no drop-in claim, and README text must say so.

### 7.5 `@aura3d/lean` (deprecated → removed)

```ts
// 3.1.0: packages/lean/src/index.ts, product.ts, game.ts
/** @deprecated Use "@aura3d/engine". Removed in 4.0.0. */
export { createAuraApp, scene, model, primitives, material, lights, camera, environments, interactions, defineAuraAssets } from "@aura3d/engine";
// 4.0.0: package deleted; import throws module-not-found; create-aura3d templates no longer reference it.
```

## 8. Shader changes

This PRD writes no new shading math. Its shader changes are deletions and consolidation so that one
generator (PRD 01 §6.4) is the only source of GLSL in the WebGL2 path:

1. **Delete the fallback renderer's GLSL** (`agent-api/index.ts:16681-16975`): a single-light program
   with `u_lightDirection`, a backdrop program (`createWebGLBackdrop` `:16215`), a particle program
   (`:16548`) and `compileShader` (`:16977`). After deletion, `rg -n "#version 300 es" packages/engine/src`
   returns 0. Arch gate rule `glsl-location` asserts that GLSL template strings exist only under
   `packages/rendering/src/program/chunks/` (PRD 01) and `packages/rendering/src/` post/output modules
   (PRD 03).
2. **Delete `LeanWebGL2Device.ts`'s duplicated present/tone-map shaders** (the fake `agx()`/`neutral()`
   at `:3320-3338`, plus its copy of the present shader). These are already slated for replacement by
   `OutputPass` (PRD 01 §6.5). This PRD guarantees no second copy survives.
3. **One shader library.** `ShaderLibraryCore.ts` exists for the lean bundle (research/13 §1.3 table).
   After the lean renderers are deleted, its exports are folded into the PRD 01 chunk set or deleted.
   The arch gate fails on any second registry of named programs (`registerShader(`/`ShaderLibrary`
   instances) outside `program/ProgramCache.ts`.
4. **WGSL placeholders.** `production-runtime/shaders/wgsl/pbr.wgsl` (3 lines, outputs `abs(normal)`)
   and `skybox.wgsl` (2 lines, constant colour) are deleted (PRD 01 §5 lists them; research/07 §1).
   `postprocess.wgsl` (real TAA) moves under `rendering/src/webgpu/` for PRD 11.
5. **Program naming.** Generated program keys carry no workstream names (`external-parity-*`,
   `current-routes-*`, `production-*`). Diagnostics expose the feature key (PRD 01 `ProgramKey`).

GPU effect: none. The game path already uses the core programs. Lean-template routes switch from
`LeanWebGL2Device` programs to the generator programs, so they gain lighting (§6.7).

## 9. Rendering changes

Pixel-affecting changes this PRD makes (everything else is pixel-neutral by construction and verified
in §16.1):

| Change | Where | Expected pixel change | Verified by |
|---|---|---|---|
| Instance transforms include `node.size` | `compiler/primitives.ts` (from `index.ts:14747`): `const localNode = { kind: "primitive", primitive: node.primitive, size: node.size, ...transform }` and then `createModelMatrix(localNode, unitBounds, false, 0)` | `16-instancing`: field covers the full ground plane, pillars have their authored heights (research/23 16-instancing rows 1-2; research/22) | unit test `compiler/primitives.test.ts` comparing matrix `[0]`,`[5]`,`[10]` to `size ⊙ transform.scale`; benchmark scene 16 vision rerun |
| Lean entry renders through `Renderer` with lights, environment and rotation | `packages/lean/*` re-export | `templates/product-viewer` gets IBL and shadow; `mini-game` gets a key light (after PRD 13 adds it) | template captures §16.3 |
| Silent fallback removed | `app/createAuraApp.ts` | No route can render with the one-light shader. Any route that did so today now shows an error overlay | strict capture of 18 games and 18 scenes: `degradations.length === 0` and no overlay |
| `A3DRenderer` #1 apps move to `Renderer` | 32 apps | none intended (same `Renderer` underneath) | pixel-neutral capture of 6 representative apps (§16.1) |
| `@aura3d/lean` primitive rotation | via engine builders | rotated primitives in lean-based templates now rotate | template capture |

Not changed here: tone mapping, IBL, shadows, post, materials, geometry tessellation, DPR. Those are
PRDs 01-04, 11.

## 10. Migration plan

Order is chosen so that each step is pixel-neutral or pixel-improving and individually revertable:

1. **Measure and freeze.** Record baselines: export counts per entry, bundle sizes (§17 method),
   18-scene benchmark and 18-game captures (GH Actions run 37289688772 is the current reference; a
   fresh run on the Phase 0 commit becomes the pixel-neutral baseline), script and tool counts.
2. **Generated resolution maps first** (Phase 1). Switching in-repo `@aura3d/engine` to the published
   entry surfaces the 77-name breakages inside the repo. Each is fixed by moving the consumer to
   `./renderer`, `./assets` or `./devtools`, or by deleting the parity template.
3. **Renderer fold-in** (Phase 2), with deprecated aliases. Then the codemod for the 32 `A3DRenderer`
   apps and the 8 `createA3DApp` consumers.
4. **Agent-api split** (Phase 3) as pure moves, then the compiler (handler table, option coverage).
5. **Silent fallback removal and lean collapse** (Phase 4). After this no second render path exists.
6. **Surface trim** (Phase 5): `./devtools`, export budgets, subpath removal with deprecation aliases.
7. **three-compat, environments, materials, duplicates** (Phase 6).
8. **Process pruning** (Phase 7): scripts, tools, orphan maps, build config.
9. **4.0.0 removal** (Phase 8): delete deprecated aliases and packages after one minor release and the
   window in §11.

Codemods (in `packages/aura3d-cli/src/codemods/`, run via `aura3d codemod <name> <glob>`):
- `renderer-imports`: `@aura3d/engine/advanced-runtime` | `/production-runtime` |
  `/rendering/advanced-runtime` | `/rendering/production-runtime` → `@aura3d/engine/renderer`;
  `A3DRenderer` → `Renderer`.
- `lean-imports`: `@aura3d/lean` | `/product` | `/game` | `@aura3d/engine/lean*` → `@aura3d/engine`.
- `devtools-imports`: any import of a name that moved to `./devtools` is rewritten (the moved-name list
  is generated from the export manifest diff).
- `renderer-mode`: removes `renderer.mode`/`renderer.fallback` and maps `qualityProfile:"safe-basic"`
  to `quality:"low"` (PRD 01 mapping).
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
| `renderer.mode`, `renderer.fallback`, `AuraRendererMode`, `AuraRendererFallbackMode` | throw `AuraMigrationError` (PRD 01 decided no grace period, because the fallback is the defect) | types removed |
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

Behaviour changes that are not API removals: `strict: true` by default means an app whose texture
upgrade fails now throws instead of rendering scalar materials. It is called out in the migration
doc with the one-line opt-out (`strict: false`).

## 12. Dependencies on other PRDs

- **PRD 01 (Rendering core):** co-owns renderer unification. PRD 01 owns the internals (`Renderer` as
  sole frame owner, program generator, OutputPass, `capture()`, removal of fallback *behaviour*,
  `renderer` option shape). PRD 15 owns class and package deletion, the `./renderer` surface, the
  deprecation calendar, and bundle budget renegotiation (PRD 01 §6.1 rule 1, §7.1 "PRD 15 owns the deprecation calendar", §12 PRD 15 bullet). Ordering:
  PRD 15 Phase 2 (fold-in) can land before the PRD 01 generator. PRD 15 Phase 4 (delete fallback code)
  lands after PRD 01's `renderer-mount-failed` rethrow. The `LeanWebGL2Device` deletion is shared;
  whichever lands first does the T2.3 line classification.
- **PRD 02 (Lighting/IBL/Shadows):** implements its features as compiler handlers
  (`compiler/environment.ts`, `lights.ts`, `shadows.ts`). Its ambient-kills-IBL fix lands in the
  extracted `compiler/environment.ts`. Hard dependency: PRD 15 Phase 3 extraction must finish (or be
  frozen) before PRD 02 edits `createProductionRuntimeEnvironment`, or both PRDs will conflict in
  `index.ts:12628-12722`.
- **PRD 03 (Post):** post kernels register through `compiler/postprocess.ts` and load as a lazy chunk
  (`lazy-chunks` gate).
- **PRD 04 (Materials):** owns preset values in the single `compiler/materialPresets.ts` (§6.10).
- **PRD 05 (Asset pipeline):** single glTF parser (`assets/GLTFLoader.ts`). Template scripts stop
  carrying their own parsers.
- **PRD 06 (Animation):** decides the `AnimationController` name ownership (§6.10). Actor handlers live
  in `compiler/actors.ts`.
- **PRD 07 (VFX):** particles become a compiler handler. `effects.particles` currently draws zero
  pixels (research/19 C8). PRD 07 adds the handler; `option-coverage` stops listing particles as
  diagnostic-only when it lands.
- **PRD 08 (Camera/controls):** single controls package.
- **PRD 09 (Shared game runtime):** game kits move to `nodes/game/`. PRD 09's capture-mode rules use
  `strict` captures and `./devtools` evidence instead of route-local evidence publishers.
- **PRD 10 (World building):** water, sky and weather modules are lazy compiler handlers.
- **PRD 11 (WebGPU/perf tiers):** `Renderer.create({backend})` is the single entry for WebGPU. Tier
  semantics feed `SceneCompileContext.quality`. Bundle and perf budgets in §17 use PRD 11 tiers.
- **PRD 12 (Visual benchmark/regression):** owns the replacement gates for deleted parity tools
  (golden images, perceptual metrics). PRD 15 deletes; PRD 12 replaces. PRD 15 Phase 7 deletion of
  `head-to-head-*` inputs waits for PRD 12's decision on keeping the frozen r185 inputs.
- **PRD 13 (Agent authoring/skills/templates):** updates skills (`aura3d-core`,
  `aura3d-threejs-migration`, `aura3d-performance`) to the consolidated surface and owns template art
  defaults. It depends on Phase 5 (surface) and Phase 6 (three-compat).
- **PRD 14 (18-game rebuild):** games are migrated by the codemods. Strict captures of all 18 are the
  pixel-neutral gate. PRD 14 must not start per-game renderer workarounds against paths that this PRD
  deletes.

## 13. Implementation phases

**Phase 0: Baseline and freeze (1-2 days).**
- Capture fresh `benchmarks/quality-rebuild` (18 scenes) and `tools/quality-rebuild-capture`
  (18 games) on macos-14 at the phase-0 commit. Store the run id in
  `docs/project/aura3d-quality-rebuild/evidence/baselines/prd15-phase0.json`.
- Record export counts, subpath count, bundle sizes, script count, tool dir count, `.map` count.
- Exit: baseline JSON committed, with all 36 captures present and a workflow run id recorded.
  Repo-wide freeze: no new `tools/*`, root scripts or exported evidence names (enforced by the
  Phase 1 arch gate in warn mode).

**Phase 1: One resolution truth.**
- `aura.exports.json`, `generate-resolution-maps`, generated tsconfig/Vite maps, and in-repo
  `@aura3d/engine` pointed at the published entry. Fix the 77-name breakages. Delete the 4
  `external-parity-*` templates. `packed-consumer-check` in CI. `arch-gates` in warn mode.
- Exit: `resolution:check` green. `pack:check` green for every shipped and create-aura3d template.
  `tsc --noEmit` green with the generated paths. Phase-0 captures pixel-neutral (§16.1).

**Phase 2: One renderer.**
- Fold `ProductionRuntimeRenderer`/`ProductionWebGL2Renderer` into `Renderer`. Delete
  `AdvancedRenderer`, `CurrentRoutesInteractiveRenderer`, `A3DRenderer` #2. Alias `A3DRenderer` #1.
  Move evidence methods to devtools. Classify and port `LeanWebGL2Device` diffs. Codemod the 32 apps.
- Exit: `single-renderer` gate reports only `LeanWebGL2Device` and the fallback (removed in
  Phase 4). 18 games and 18 scenes pixel-neutral. 6 representative `A3DRenderer` apps pixel-neutral.

**Phase 3: Agent-api split and compiler.**
- Pure-move commits per §6.3. Then the handler table, `compileScene`/`updateCompiledScene`,
  `optionCoverage.ts` and the option-sensitivity test. Instance-size fix with its test. Fix the
  `Decals.ts` cycle.
- Exit: `agent-api/index.ts` ≤ 300 lines. `max-file-lines`, `layering` and `no-cycles` green for
  `packages/engine`. Option-sensitivity test lists every builder field. Every field not yet consumed
  appears in `DIAGNOSTIC_ONLY_FIELDS` with an owner PRD. Captures pixel-neutral except scene 16, which
  must improve (§16.2). CPU budget §17 met.

**Phase 4: No silent fallback, one builder API.**
- Delete `createWebGLSceneRenderer` and its helpers. Add typed degradations, `strict`, and the error
  overlay. Collapse lean to re-exports. Switch templates to `@aura3d/engine`. Delete `LeanWebGL2Device`,
  the lean renderers and `ShaderLibraryCore` duplication.
- Exit: `single-renderer` and `glsl-location` green. 36 strict captures with zero degradations.
  Template captures show lights and IBL (§16.3). Bundle measured and recorded against §17.

**Phase 5: Public surface.**
- `public/index.ts`, `public/renderer.ts`, `public/devtools.ts`. Move evidence names. Collapse
  subpaths to ≤ 16 with deprecation aliases. Curate the `@aura3d/rendering` barrel (no `export *`).
  Delete the 31 orphan files. Rename leaking names.
- Exit: `export-budget`, `no-evidence-in-runtime` and `unique-ownership` green. `pack:check` green.
  3.1.0 release candidate built.

**Phase 6: Honest packages and single implementations.**
- three-compat → CLI codemod. Delete `@aura3d/environments`, `@aura3d/materials`, `@aura3d/editor`
  (1-line alias). Unify math, controls, glTF parsing and the preset registry. Fix dependency truth.
- Exit: `deps-truth` and `unique-ownership` (0 multi-owner names with different declarations) green.
  `migrate three` codemod tests green. README and docs have no "faithful"/"parity" claims for
  three-compat.

**Phase 7: Process pruning and build hygiene.**
- `noEmit` base, build tsconfig without tests/tools, orphan map deletion, `src-clean`. `script-prune`
  apply (≤ 80). Tool dir deletion (≤ 60). Unwrap `build`/`typecheck`. Replace
  `verify-architecture` with `arch-gates` in fail mode in CI.
- Exit: all arch gates green in fail mode on GitHub Actions. Script and tool counts met. CI workflows
  reference only existing scripts (`script-prune --check`).

**Phase 8: 4.0.0 removal.**
- After the §11 window: delete aliases, `packages/lean`, deprecated subpaths and the `./engine`
  superset.
- Exit: 4.0.0 packed-consumer check green. 36 strict captures pixel-neutral against the Phase 7
  captures. Migration doc complete.

## 14. Task checklist

Conventions: "pixel-neutral" means §16.1 passes. "Captures" means the `quality-rebuild-capture`
workflow on macos-14 (18 games) plus `benchmarks/quality-rebuild` (18 scenes). Every task lands as
its own commit unless grouped.

### Phase 0
- [ ] T0.1 Add `tools/arch-gates/baseline.ts`. It writes `docs/project/aura3d-quality-rebuild/evidence/baselines/prd15-phase0.json` with: export counts per `/package.json` subpath (TS checker), subpath count, `Object.keys(scripts).length`, `tools/` dir count, count of `*.map` under `packages/*/src`, and `agent-api/index.ts` line count. Unit test: run it on a fixture repo with 2 subpaths and 3 scripts and assert the JSON.
- [ ] T0.2 Dispatch `.github/workflows/quality-rebuild-capture.yml` and the benchmark job on the phase-0 commit. Record both run ids in `prd15-phase0.json` under `captureRuns`.
- [ ] T0.3 Add `tools/bundle-size/lit-scene.ts`. It builds `benchmarks/quality-rebuild` scene `01-simple-geometry` (Aura side) with Vite in production mode and reports initial-chunk gzip bytes plus each lazy chunk (gzip -9). It also reports the same for `apps/showcase-siege-golf` (a game with an environment node) and `templates/product-viewer`. It runs on GH Actions ubuntu and writes `bundle-baseline.json`.

### Phase 1: resolution truth
- [ ] T1.1 Create `/aura.exports.json` listing all 47 current subpaths with their `source` and `browser` files, so the generated output matches today byte for byte. Test: `generate-resolution-maps --check` against the current `/package.json` passes with no diff.
- [ ] T1.2 Implement `tools/generate-resolution-maps/index.ts` with `--write` and `--check`. It generates `/package.json#exports`, `/tsconfig.paths.generated.json`, `/vite.aliases.generated.ts` and `/tools/finalize-dist/manifest.generated.json`. Unit tests: (a) a `browser` field produces a `browser` condition and a Vite alias to the browser file; (b) a `deprecated` entry emits a re-export stub source.
- [ ] T1.3 Delete the hand `paths` block from `tsconfig.base.json`. Add `"extends": ["./tsconfig.paths.generated.json"]` (TS 5 array extends). Delete or regenerate `tsconfig.browser-301.json`. Update `vite.config.ts:40-60` to `import { aliases } from "./vite.aliases.generated.ts"`.
- [ ] T1.4 Change the `@aura3d/engine` source entry in `aura.exports.json` to `packages/engine/src/agent-api/index.ts` (the published "." entry), and regenerate. Run `tsc --noEmit -p tsconfig.check.json`. For each error caused by one of the 77 names (§2.3), apply the §6.6 disposition: rewrite the consumer import to `@aura3d/engine/advanced-runtime` (temporary, until `./renderer` exists), `@aura3d/engine/assets` or `@aura3d/engine/engine` (temporary). Log every rewritten file in the commit message.
- [ ] T1.5 Delete `templates/external-parity-asset-gallery`, `templates/external-parity-interactive-scene`, `templates/external-parity-material-studio` and `templates/external-parity-product-viewer`. Safety: `rg -l "external-parity-(asset-gallery|interactive-scene|material-studio|product-viewer)" --glob '!docs/project/**'` → update or delete each hit (scripts, tests, workflows).
- [ ] T1.6 Implement `tools/packed-consumer-check/index.ts`: `pnpm pack` → temp dir per template in root `files` and every `packages/create-aura3d/templates/*`, rewrite the template's `@aura3d/engine` dependency to `file:<tarball>`, `pnpm install --offline=false`, then `tsc --noEmit` and `vite build`. Add a workflow job `pack-check` on ubuntu-latest. Fixture test: a template importing `createA3DApp` from "." must fail.
- [ ] T1.7 Delete `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts` and `dist/index.d.ts.map` from `/package.json#files`. Delete the writer at `tools/finalize-dist/index.ts:62-63` and its `rootIndexLines`/`rootTypeLines` construction.
- [ ] T1.8 Add `tools/arch-gates/index.ts` with rules `resolution-single-truth`, `src-clean` and `no-cross-package-relative` in warn mode. Add the `arch:check` script. Run it in CI and upload the JSON as an artifact.

### Phase 2: one renderer
- [ ] T2.1 In `packages/rendering/src/Renderer.ts`, add `static create(options: RendererCreateOptions)` backend selection (`"webgl2" | "webgpu" | "auto"`) ported from `ProductionRuntimeRenderer.ts:57-90`, keeping the WebGPU `await import()`. Add `onDeviceLost`, `onDeviceRestored` and `isDeviceLost` from `ProductionWebGL2Renderer.ts:54-67`. Unit test with `MockRenderDevice`: the listener fires once per simulated loss.
- [ ] T2.2 Add `Renderer.renderFrame(frame: RendererFrameInput)` and `renderFrameAsync`. They absorb `ProductionWebGL2Renderer.renderInteractiveFrame/renderFrame/renderFrameAsync` (`:69-95`) and own `PBRHDRPipeline`, `TransmissionBackdropCapture` and `ProductionEffectsPipeline` (moved to `rendering/src/pipeline/`). Unit test: a `RenderSource` with one lit cube produces identical `RenderDeviceDiagnostics.drawCalls` and program keys through the old and new entry (golden JSON).
- [ ] T2.3 Produce `docs/architecture/lean-device-diff.md`: whitespace-normalized `diff WebGL2Device.ts LeanWebGL2Device.ts`, each of the 346 differing lines classified as `feature-removal` (drop), `bugfix` (port to WebGL2Device), or `identical-after-rename`. Port every `bugfix` line, each with a unit or browser test named after the line range.
- [ ] T2.4 Repoint the bridge `createProductionRuntimeSceneRenderer` (`agent-api/index.ts:13584-13597`) to `Renderer.create({ canvas, backend: options.renderer?.backend ?? "webgl2", ... })`. Remove `preserveDrawingBuffer: true` only if PRD 01 `capture()` has landed; otherwise keep it with a `TODO(PRD-01)`.
- [ ] T2.5 Move `captureProof`, `renderImportedAsset`, `getFeatures` and `getShadowEvidence` (`ProductionWebGL2Renderer.ts:102-197`) to `packages/engine/src/agent-api/devtools/rendererReports.ts` as `rendererProofCapture(renderer, input)`, `rendererFeatureReport(renderer)` and `rendererShadowReport(renderer)`. Update their 16 test files.
- [ ] T2.6 Delete `ProductionWebGL2Renderer.ts` and `ProductionRuntimeRenderer.ts`. `production-runtime/index.ts` keeps `export { Renderer as ProductionRuntimeRenderer }` with `@deprecated` until Phase 8.
- [ ] T2.7 Delete `packages/rendering/src/advanced-runtime/AdvancedRenderer.ts`. Move `resizeToDisplay`, `startAnimationLoop`, the `render(source, camera?)` overloads and `captureFrame` (`AdvancedRenderer.ts:30-66`) onto `Renderer` if they are missing. `advanced-runtime/index.ts` re-exports `Renderer as AdvancedRenderer` (deprecated).
- [ ] T2.8 Delete `packages/rendering/src/threejs-example-parity/index.ts` (`CurrentRoutesInteractiveRenderer`, 0 app/test consumers). Delete `packages/engine/src/threejs-example-parity/{index,FlagshipFoundation}.ts` after `rg -l "threejs-example-parity" apps examples templates packages tests` shows only the files themselves and their own tests. Delete those tests. This removes the 25 cross-package relative imports.
- [ ] T2.9 Replace `packages/engine/src/advanced-runtime/A3DRenderer.ts` with `export { Renderer as A3DRenderer } from "@aura3d/rendering"` and `export type A3DRendererOptions = RendererCreateOptions`. Move `A3DRenderer.evidence()` (`:129-144`) to `devtools/rendererReports.ts` as `a3dRendererEvidence(renderer, options)`.
- [ ] T2.10 Delete `A3DRenderer` #2 in `packages/engine/src/production-runtime/index.ts:175`. That subpath re-exports the alias from T2.9.
- [ ] T2.11 Implement the `renderer-imports` codemod in `packages/aura3d-cli/src/codemods/renderer-imports.ts` (TS AST). Fixture tests: `apps/loader-gltf-variants/src/main.ts` and `apps/wow-common/src/showcase.ts` before/after.
- [ ] T2.12 Run `renderer-imports` on all 32 consumers (`rg -l "@aura3d/engine/advanced-runtime" apps examples packages/create-aura3d/templates`). `tsc --noEmit` passes. Capture 6 of them (`postprocessing-bloom`, `shadowmap-viewer`, `skinning-blending`, `loader-gltf-variants`, `materials-transmission`, `texture-anisotropy`) before and after on macos-14 for §16.1.

### Phase 3: agent-api split and compiler
- [ ] T3.1 Create `agent-api/nodes/types.ts`. Move all exported node, spec and option types from `index.ts:1-2097` into it (pure move). `index.ts` re-exports by name. `tsc --noEmit` passes. No other diff.
- [ ] T3.2 Create `agent-api/nodes/builder.ts` with `AuraNodeBuilder`. Change `Decals.ts:39,47` to import from `./nodes/builder.js` and `./nodes/types.js`. Arch gate `no-cycles` reports the `Decals.ts ↔ index.ts` SCC gone.
- [ ] T3.3 Pure-move each builder to its `nodes/*.ts` file in this order, one commit each: `assets` (:1004), `model` (:2098), `primitives`/`instances` (:2207-2317), `text3d` (:2318), `groups`/`shadows` (:2361-2413), `material` (:2414-3062), `lights` (:3063-3214), `camera` (:3215-3440), `effects` (:3441-3729), `sky`/`weather`/`water` (:3730-3910), `interactions`/`ui` (:3911-4122), `environments` (:4123-4248), `scene` (:4842-5171), `physics` (:5172-5818), `prefabs/*` (:5819-6979, split by family), `game/*` (:6980-8308), `animation` (:8309-8360), `particles` (:8361-8564), humanoid prefabs (:8565-9359), `product` (:9360-9594), `sceneKits` (:9994-10146), `prompt/*` (:10147-10829). Each commit: `tsc --noEmit` passes and the unit suite passes.
- [ ] T3.4 Move renderer quality profiles (`index.ts:4249-4330`) to `app/rendererOptions.ts` (pure move). PRD 01 then rewrites them.
- [ ] T3.5 Move evidence helpers to `devtools/`: `collectGameRuntimeEvidence` (:6980), `auraLazySystemEvidence` (:9595), `createSceneKitLodEvidence` (:9780), `createRuntimeNodeImportedAssetEvidence` (:10610), `sceneKitPerformanceBudgets` (:9681), `helperPerformanceBudgets` (:11931), `renderDiagnosticPreviewToCanvas` (:18295). "." keeps deprecated re-exports until Phase 5.
- [ ] T3.6 Move `AuraRuntimeError` (:10830) to `app/errors.ts`, `createAuraApp` (:11126) to `app/createAuraApp.ts`, `createGameApp` (:11818) to `app/createGameApp.ts`, `startProductionRender` (:12241-12520) to `app/frameLoop.ts`, `configureCanvas` (:18105) to `app/canvas.ts`, and `liveAuraApps` (:11745) to `app/liveApps.ts`.
- [ ] T3.7 Move the production bridge (`:12523-15981`) to `compiler/*` per §6.3: `environment.ts` (:12628-12732), `fog.ts` (:12733-12941), `shadows.ts` (:12942-13110), `postprocess.ts` (:12797-12935, :13111-13298), `lights.ts` (:13299-13541), `renderInput.ts` (:13842-14013), `primitives.ts` (:14014-14126, :14747-14836, :14837-14997), `textures.ts` (:14127-14452), `text.ts` (:14453-14616), `actors.ts` (:13552-13583, :15100-15628), plus camera resolution (:15629-15782) into `compiler/camera.ts`. Pure moves. Captures pixel-neutral.
- [ ] T3.8 Move engine primitive generators (`:17287-17479`), model matrix and transforms (`:17637-18010`) into `compiler/geometry.ts` and `compiler/sceneGraph.ts` (pure move). PRD 01 then replaces their bodies (§6.2-6.3 of PRD 01).
- [ ] T3.9 After T3.1-T3.8, `agent-api/index.ts` holds only named re-exports. Assert ≤ 300 lines with arch gate `max-file-lines` in fail mode for `packages/engine/src/agent-api/**`.
- [ ] T3.10 Fix `createProductionInstanceTransforms` (now `compiler/primitives.ts`): include `size: node.size` in `localNode`. Unit test `compiler/primitives.test.ts`: a node with `size: [1, 4, 1]` and transforms `[{position:[2,0,0]}, {position:[-2,0,0], scale:[1,0.5,1]}]` yields matrix diagonals `[1,4,1]` and `[1,2,1]` and translations `±2` on x. Re-run benchmark scene 16 (§16.2).
- [ ] T3.11 Implement `compiler/handlers.ts` (`NodeKindHandlers` mapped type over `AuraNode["kind"]`) and `compiler/compileScene.ts` (`compileScene`, `updateCompiledScene`) wrapping the moved bridge functions. `createProductionRuntimeSceneRenderer` calls `compileScene` once at mount and `updateCompiledScene` per frame. Type test (`tsd`-style `// @ts-expect-error`): removing one handler key fails compilation.
- [ ] T3.12 Add per-node version counters to runtime node handles (`setPosition`/`setRotation`/`setScale`/`setVisible`/material setters increment `version`). `updateCompiledScene` reuses the previous `RenderItem` when the node version and ancestor versions are unchanged. Unit test: 500 static nodes and one moving node → 499 identical item object references across two frames.
- [ ] T3.13 Create `compiler/optionCoverage.ts`, listing every option field of every builder in `nodes/*`, generated once by `tools/arch-gates/rules/option-coverage.ts --scaffold` from the TS types and then hand-filled with probe values. Create `compiler/optionCoverage.test.ts`: for each row, compile `scene().add(builder(probeA))` and `scene().add(builder(probeB))` and assert `deepDiff(sourceA, sourceB).length > 0`, unless the field is in `DIAGNOSTIC_ONLY_FIELDS`. Each `DIAGNOSTIC_ONLY_FIELDS` entry names an owner PRD (for example `effects.particles.*` → 07, `lights.ambient` with no env → 02 until its fix).
- [ ] T3.14 Arch gate `layering` in fail mode for `packages/engine/src/agent-api/**`, with fixture tests: a `nodes/x.ts` importing `compiler/y.ts` fails.

### Phase 4: no silent fallback, one builder API
- [ ] T4.1 Add `app/degradation.ts` (types per §6.5) and wire `strict`/`onDegradation` through `createAuraApp` → `SceneCompileContext`. Replace the `catch` bodies at the moved equivalents of `index.ts:13875`, `:14174`, `:14571`, `:15121`, `:15147` and `:15178` with `ctx.degrade({ code, nodeId, message, cause })`. `degrade` throws when `strict`; otherwise it records, warns once per `(code,nodeId)`, and continues. Unit tests per code: strict throws an `AuraRuntimeError` with `code` and `cause`; non-strict records exactly one entry after 100 frames.
- [ ] T4.2 Replace the `catch` at `index.ts:12545-12548` (now `app/createAuraApp.ts`) with `throw new AuraRuntimeError("renderer-mount-failed", message, { cause: error })`, after PRD 01 Phase 7 if it is not already done. Delete the `rendererSelection.mode !== "production"` branch (`:12530-12532`). Unit test: a `Renderer.create` stub that rejects → `createAuraApp` rejects with that code, and `errorOverlay` is attached to the canvas parent with `role="alert"`.
- [ ] T4.3 Implement `app/errorOverlay.ts`: an absolutely positioned DOM element over the canvas showing `error.code`, `error.message` and the first 5 lines of `cause.stack`. It has `role="alert"` and `aria-live="assertive"`, 4.5:1 contrast text on a solid background, and a keyboard-focusable "Copy details" button. Browser test (macos-14): the overlay is visible and focusable, and axe-core reports no violations.
- [ ] T4.4 Delete `createWebGLSceneRenderer` and every function only it reaches (`index.ts:15982-17286`, including `createWebGLBackdrop`, `createGltfPrimitiveModelMatrixResolver`, `createWebGLParticleModel`, `compileShader`, `createGltfRuntimeNodes`, `loadGltfForWebGL`, `parseGlb`). Safety: TS "find all references" (`tools/arch-gates/rules/unreferenced.ts`) on each deleted symbol returns only the deleted block. `rg -n "#version 300 es" packages/engine/src` → 0.
- [ ] T4.5 Remove `AuraRendererMode`, `AuraRendererFallbackMode`, `mode` and `fallback` from `AuraCreateAppRendererOptions`. A runtime check throws `AuraMigrationError({ removedApi: "renderer.mode", replacement: "renderer.quality", prd: 1 })` when an untyped caller passes them. Run the `renderer-mode` codemod on `apps/showcase-pulse-tunnel/art-review` and any other `rg -l "mode: \"safe-basic\""` hits.
- [ ] T4.6 Replace `packages/lean/src/index.ts`, `product.ts` and `game.ts` with the §7.5 re-exports plus a one-time `console.warn("[aura3d] @aura3d/lean is deprecated; import from @aura3d/engine. Removed in 4.0.0.")`. Delete `packages/lean/src/base.ts`. For `ArcadeRuntime.ts`: run `rg -l ArcadeRuntime apps templates packages examples`; if there are 0 external hits delete it, else move it to `nodes/game/arcade.ts`.
- [ ] T4.7 Switch `templates/product-viewer/src/main.ts`, `templates/mini-game/src/main.ts`, `packages/create-aura3d/templates/{product-viewer,mini-game}/src/main.ts` and their `package.json`/`README.md` from `@aura3d/lean/*` to `@aura3d/engine` (the `lean-imports` codemod). Remove `@aura3d/lean` from their dependencies. `pack:check` passes.
- [ ] T4.8 Delete `packages/rendering/src/lean/LeanProductionRenderer.ts`, `lean/LeanProductRenderer.ts`, `LeanWebGL2Device.ts`, `lean-runtime.ts` and `lean-core-runtime.ts` after T2.3 ports. Fold or delete `ShaderLibraryCore.ts`. Safety: `rg -l "LeanWebGL2Device|LeanProductionRenderer|LeanProductRenderer|lean-runtime|lean-core-runtime|ShaderLibraryCore" packages apps templates tests` returns only deleted files and their tests (delete those tests).
- [ ] T4.9 Arch gates `single-renderer` and `glsl-location` move to fail mode. Fixture tests: a file calling `canvas.getContext("webgl2")` outside the allowlist fails.
- [ ] T4.10 Re-run the bundle measurement (T0.3) and write `BUNDLE_SIZES.md` from its output only (the generated table and a link to the workflow run). Delete the "77,458 B pass" row and the "new-app budget applies to `@aura3d/lean`" text (`BUNDLE_SIZES.md:10,33-34`).

### Phase 5: public surface
- [ ] T5.1 Create `packages/engine/src/public/index.ts` with explicit named exports only. It is generated as a starting point by `tools/arch-gates/rules/export-budget.ts --scaffold` from the 132 root symbols games use (research/13 §2.3), the symbols templates and benchmarks use (`rg` import tally), and the PRD 01-11 additions. Every other current "." export goes to `./renderer`, `./devtools` or a domain subpath, or is deleted, with the disposition recorded in `docs/architecture/root-export-dispositions.json` (`{ name, from, to, reason }`).
- [ ] T5.2 Create `public/renderer.ts` (§7.2) and `public/devtools.ts` (§7.3). Point `aura.exports.json` "." at `public/index.ts` and add `./renderer` and `./devtools`. Regenerate.
- [ ] T5.3 Replace `packages/rendering/src/index.ts`'s 43 `export *` with named exports. Only names imported by `packages/engine/src/**`, `public/renderer.ts` or a remaining package are kept. Each removed name gets an `rg` check across apps/examples/templates/tests.
- [ ] T5.4 Delete the 31 barrel-only orphan rendering files (Appendix A, D-10). Safety per file: `rg -lw "<each exported name>" --glob '!packages/rendering/src/index.ts' --glob '!<the file>'` returns only its own test.
- [ ] T5.5 Rename leaking names that survive in `./renderer`: `RuntimeParityFrameRenderResult` → `RendererFrameResult`, `CurrentRoutesRendererTimingDiagnostics` → `RendererTimingDiagnostics`. Every `ExternalParity*` name is either deleted or moved to `./devtools`. Deprecated aliases stay until 4.0.0.
- [ ] T5.6 Collapse subpaths to the §6.1 list. Put each removed subpath in `aura.exports.json#deprecated` with a target. Generate re-export stubs that `console.warn` once. `pack:check` passes for a fixture consumer importing each deprecated subpath.
- [ ] T5.7 Remove the claim-boundary fields from runtime types (`AuraRendererQualityProfile.supportedInRoot/blockedInRoot/claimBoundary/requestedFeatures/maxRecommendedDrawCalls`, `index.ts:4249-4330` equivalents), coordinated with PRD 01 §7.1.
- [ ] T5.8 Arch gates `export-budget`, `no-evidence-in-runtime` and `unique-ownership` move to fail mode, with thresholds from §6.6.
- [ ] T5.9 Implement the `devtools-imports` codemod from the disposition JSON and run it on apps, examples, templates, benchmarks and tools.

### Phase 6: honest packages, single implementations
- [ ] T6.1 Implement `packages/aura3d-cli/src/migrate-three/{parse,mappings,emit,report}.ts` and the `aura3d migrate three` command. The mapping table starts with: `Scene`, `PerspectiveCamera`, `Mesh` + `BoxGeometry`/`SphereGeometry`/`CylinderGeometry`/`PlaneGeometry`/`TorusGeometry`, `MeshStandardMaterial`, `MeshPhysicalMaterial` (clearcoat, transmission, sheen), `DirectionalLight`, `PointLight`, `SpotLight`, `AmbientLight`, `HemisphereLight`, `GLTFLoader.load`, `RGBELoader` + `PMREMGenerator`, `OrbitControls`, `InstancedMesh`, and `Euler` order. Everything else maps to `none`. Unit tests: one fixture per row and one fixture of an unmapped construct emitting a TODO and a `none` row.
- [ ] T6.2 Delete `packages/three-compat/src/*` except `migration/` (moved into the CLI). Delete `packages/three-compat` (`package.json`, tsconfig) and its `tsconfig.base.json`/`aura.exports.json` entries. Remove `README.md:684`.
- [ ] T6.3 Delete `templates/three-compat-*` (8). Rename `packages/create-aura3d/templates/three-compat-*` to the §6.8 names. Add a `templateAliases` map in `packages/create-aura3d/src/index.ts` with a warning. Unit test: `--template three-compat-large-scene` scaffolds `large-scene` and prints the warning.
- [ ] T6.4 Delete `benchmarks/three-compat/`, `tests/browser/three-compat-threejs-visual-parity.spec.ts`, `tests/browser/three-compat-threejs-runtime-parity.spec.ts`, `tools/three-compat-*` (30 dirs) and the `three-compat:*` scripts (20). Safety: `script-prune` reports no kept workflow referencing them.
- [ ] T6.5 Delete `packages/environments`. Move `createThreeCompatPMREMDiagnostics` and `createThreeCompatEnvironmentProbePreviews` to `devtools/environmentDiagnostics.ts` if `rg` finds a consumer, else delete them. Remove the undeclared `environments` import from engine (research/13 §9).
- [ ] T6.6 Delete `packages/materials` after moving any preset value that `material.*` lacks into `compiler/materialPresets.ts` (PRD 04 reviews values). Delete the `NodeMaterial` export (`node.ts`, `NodeMaterial.ts`). Safety: 2 app/template hits for `@aura3d/materials` (re-measured) are migrated first.
- [ ] T6.7 Delete `packages/editor` (1-line `export *`). `./editor` becomes a deprecated alias of `./editor-runtime`.
- [ ] T6.8 Math unification: replace the math in `packages/animation/src/Keyframe.ts` (`Mat4`, `Quat`, `identityMat4`, `composeMat4`, `multiplyMat4`, `normalizeQuat`) and `packages/physics/src/Shape.ts` (`vec3`, `addVec3`, `subVec3`, `scaleVec3`, `lengthVec3`, `normalizeVec3`, `EPSILON`) with imports from `@aura3d/scene/math`. Replace the `Vec3` declarations in `engine/agent-api/SceneGroundingUtils.ts` and `rendering/PbrReference.ts` (or delete `PbrReference.ts` per D-10). Unit tests: the existing animation and physics suites pass unchanged, plus a property test (1,000 random TRS) showing `composeMat4` matches the old implementation within 1e-6.
- [ ] T6.9 Controls: `packages/input/src/controls/*` re-export from `@aura3d/controls`. Diff behaviour first: for each control, a unit test drives identical pointer sequences through both implementations and asserts the resulting camera matrices are equal. Any difference is resolved in favour of `@aura3d/controls`, with a note recorded in the commit.
- [ ] T6.10 glTF: `assets/asset-corpus/ProductionAssetCorpus.ts` and `assets/AdvancedAssetCorpus.ts` parse via `GLTFLoader`. Template scripts under `packages/create-aura3d/templates/animation-studio/scripts/` import `@aura3d/engine/assets`. Unit test: the same GLB fixture yields identical accessor counts and material counts through the corpus and through `GLTFLoader`.
- [ ] T6.11 Fix declared dependencies per research/13 §9. Arch gate `deps-truth` moves to fail mode.

### Phase 7: process pruning and build hygiene
- [ ] T7.1 `tsconfig.base.json`: add `"noEmit": true`. `tsconfig.build.json`: add `"noEmit": false` and set `include` to `["packages/*/src/**/*.ts"]` plus `exclude` test globs. Create `tsconfig.check.json` (`noEmit`, includes tests/tools/configs). Switch the `typecheck` script to `tsc -p tsconfig.check.json --noEmit` and remove the `evidence:command` wrapper from `build` and `typecheck`.
- [ ] T7.2 Delete the 1,194 orphan maps (Appendix A, D-14) with the safety procedure given there. Add the rule `no-map-or-js-in-src` to `tools/verify-source-cleanliness` and to `arch-gates src-clean` in fail mode.
- [ ] T7.3 Implement `tools/script-prune/index.ts` (§6.11) with `--report`, `--apply` and `--check`. Unit tests on a fixture `package.json` with a chain `a → b`, an orphan `c`, a workflow-referenced `d` and a missing-target `e`: the result keeps `a, b, d` and deletes `c, e`.
- [ ] T7.4 Run `script-prune --report`. Review the `review` bucket against PRD 12's kept-gate list. Apply. Assert `Object.keys(scripts).length ≤ 80`. Commit the report as `docs/architecture/script-prune-report.json`.
- [ ] T7.5 Delete every `tools/<dir>` that `script-prune` marks unreferenced (no kept script, workflow or source import), in commits grouped by prefix (`external-parity-*`, `production-runtime-*`, `threejs-parity-*`, `head-to-head-*` after the PRD 12 decision, `superiority-*`, `animation-studio-*` readiness, `aura3d10x-*`, `muse*`). Assert `ls tools | wc -l ≤ 60`.
- [ ] T7.6 Delete the root scratch files listed in research/13 §8.3 (`rooftop-*.mts`, `siege-*.ts`, `courier-diag*.tmp.mjs`, `vb-lane-probe.ts`, `scratch-site5.mts`, `bs-debug-shot*.png`, `__probe-courier.ts`, the file named `[{"down":"Space"},…]`, UUID-named `.txt`). Safety: `git ls-files` for each, and `rg -l` for each basename, show no reference.
- [ ] T7.7 Replace `tools/verify-architecture/index.ts` with `arch-gates` in fail mode, and update every workflow that ran `verify:architecture`.
- [ ] T7.8 Delete `MIGRATION-2.0.md`. Generate `docs/MIGRATION-4.0.md` from `aura.exports.json#deprecated` and the §11 table. Rewrite `README.md:209-210` (duplicate-export admission) from the arch-gate output.

### Phase 8: 4.0.0
- [ ] T8.1 Remove every `aura.exports.json#deprecated` entry, the `A3DRenderer`/`ProductionRuntimeRenderer`/`AdvancedRenderer` aliases, `packages/lean`, `packages/input/src/controls`, the template aliases and the deprecated "." evidence re-exports. Regenerate.
- [ ] T8.2 Run `pack:check`, the 36 strict captures (pixel-neutral against Phase 7) and the full arch gates. Publish 4.0.0 only through the release workflow and the production runbook named in the program policy.

## 15. Test requirements

Unit tests (vitest, `tests/unit/**`, GH Actions ubuntu-latest; they are light enough to run locally
as well):
- `generate-resolution-maps`: generation, `--check` diff detection, browser condition, deprecated stubs.
- `packed-consumer-check`: fixture that must fail (repo-only name) and fixture that must pass.
- `arch-gates`: one known-bad fixture per rule (§6.12) that must fail, and one clean fixture that must pass.
- `Renderer.create` backend selection, device-loss listeners, and `renderFrame` equivalence (T2.1-T2.2).
- Codemods: before/after fixtures from real consumers (T2.11, T4.5, T4.7, T5.9).
- `compiler/primitives.test.ts` instance size (T3.10).
- `compiler/optionCoverage.test.ts`: option sensitivity over every builder field (T3.13).
- Handler exhaustiveness type test (T3.11). Dirty-skipping reference identity (T3.12).
- Degradations: strict/non-strict per code (T4.1). Mount failure → error and overlay (T4.2).
- `migrate three`: one fixture per mapping row and unmapped constructs (T6.1).
- Math property tests (T6.8), controls equivalence (T6.9), glTF parse equivalence (T6.10).
- `script-prune` fixture (T7.3).

Browser tests (Playwright, `tests/browser/**`; remote only per policy, run on GitHub Actions
`macos-14` with ANGLE Metal, the same runner class as run 37289688772):
- `renderer-single-path.spec.ts`: for scene 01, a game (`showcase-siege-golf`) and the
  `product-viewer` template, assert `app.diagnostics().renderer.backend === "webgl2"`, that
  `degradations` is empty, and that the WebGL program list has no program whose source contains
  `u_lightDirection` (the fallback marker).
- `renderer-mount-failure.spec.ts`: a forced `Renderer.create` rejection through a test hook shows the
  overlay. axe-core passes. No canvas pixels are drawn.
- `lean-shim.spec.ts`: a page importing `@aura3d/lean/product` with `lights.directional({ intensity: 3 })`
  plus `environments.studio()` renders a sphere whose lit-side mean luma exceeds its shadow-side
  mean luma by ≥ 40/255. Today this is ≈ 0 difference, because the lights are inert.
- `pack-consumer-smoke.spec.ts`: one packed template (`product-viewer`) served from `vite preview`
  renders non-blank, with zero degradations and zero console errors. This is a liveness check and is
  not a quality claim.
- The existing benchmark and capture workflows (§16) run with `strict: true`.

Not counted as tests: report-reading tools, source-substring tests (research/14 §1.2), and
non-blank-canvas checks presented as visual QA.

## 16. Visual acceptance tests

All captures run on GitHub Actions macos-14 (ANGLE Metal) through
`.github/workflows/quality-rebuild-capture.yml` (games, `tools/quality-rebuild-capture`) and the
`benchmarks/quality-rebuild` job (18 scenes, Aura3D against `three@0.185.1` on identical inputs).
The reference for "neutral" is the Phase 0 capture of the same harness. The reference for "quality"
is the three r185 side of the benchmark, with vision judgments per research/23 and research/21
rubrics. Each judged check needs both a vision-model review and a human reviewer. Either can fail it.

### 16.1 Pixel-neutral gate (Phases 1, 2, 3, 5, 6, 7, 8)

- **Benchmark scenes 01-18** (deterministic, fixed camera, no animation except scenes 08, 14 and 15,
  which are captured at fixed `timeSeconds`): per-scene Aura3D frame against the Phase 0 Aura3D frame.
  Pass: mean ΔE2000 ≤ 1.0 and 99th-percentile ΔE2000 ≤ 5.0 on the tone-mapped 8-bit output, or the PRD
  12 FLIP metric ≤ 0.02 mean once PRD 12 lands. Scene 16 is exempt after T3.10 (§16.2).
- **18 games** (`<id>-contact.jpg`, `<id>-mid.jpg`): animation and frame pacing make pixel equality
  invalid. A vision model gets the Phase 0 and phase-N contact sheets side by side, unlabelled and
  order-randomised, and answers per image "A better / same / B better" on lighting, materials,
  shadows, AA, post, geometry and HUD. Pass: no category judged worse for the phase-N image on any
  game. A human reviewer signs off on the same pairs, and any "worse" from either reviewer fails.
- Plus: `degradations` must be empty for all 36 captures (strict mode), and the fallback marker
  check (§15) must pass.

### 16.2 Instancing fix (Phase 3, T3.10)

- Scene `16-instancing`: rerun the research/23 vision judgment. Pass: discrepancy rows 1 (field extent)
  and 2 (per-instance height) are classified `equivalent`. Aura3D's score is ≥ 4.0/10 (was 2.5;
  three r185 is 4.5, capped by scene content). Human confirmation is required.
- Games that use `instances.*` (research/01 P5: 2 apps): include them in the §16.1 pairwise review,
  where "better" is the expected answer.

### 16.3 Templates render through the one path (Phase 4)

- New capture targets added to `tools/quality-rebuild-capture`: `templates/product-viewer` and
  `templates/mini-game`, built from the packed tarball (not path aliases), at 1920×1080 and 390×844.
- Reference: benchmark scene `02-pbr-product` three r185 frame (studio-lit product) for
  product-viewer. For mini-game, the PRD 13 template reference frame when it exists. Until then the
  criterion is absolute.
- Judged criteria (vision and human): visible directional key light with a shading gradient, a
  visible contact or cast shadow under the main object, specular or IBL reflection visible on at least
  one glossy surface, and correct rotation of rotated primitives. Pass: all four present. Today's lean
  output fails all four by construction (research/19 C7).
- Pass threshold for product-viewer against the 02 reference: vision score gap ≤ 2.5 points. The
  template content is simpler than the scene, so a full match is not required. A gap above 2.5 fails
  and is logged against PRD 13 (art) or PRDs 01/02 (render), not waived.

### 16.4 No-fallback proof

- For every one of the 36 captures, `app.diagnostics().compiledFeatures` is written next to the image.
  The reviewer packet shows it beside each frame. A frame whose scene authored an environment node but
  whose compiled features lack `environment.ibl` fails (this is the class of silent drop the compiler
  contract exists to catch).

This PRD makes no "competitive with three.js" claim. §16.2 and §16.3 measure specific defects
closing. The program-level competitiveness gate belongs to PRDs 12 and 14.

## 17. Performance budgets

Tiers follow PRD 11. Reference hardware classes: Low = mid-range phone (iPhone 11 / Pixel 6a class),
Medium = integrated laptop GPU, High = Apple M-series or mid desktop dGPU, Ultra = high-end desktop
dGPU. The CI runner (macos-14 Apple Paravirtual GPU) gives relative numbers only (PRD 01 §2). Budgets
are deltas this PRD may introduce plus absolute caps for the surfaces it owns.

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
- Measured by `tools/bundle-size/lit-scene.ts` (T0.3) on every PR touching `packages/**`. A PR that
  exceeds a cap fails unless the PR description names the cap, the delta and the PRD that owns it.
- Mobile: Low-tier caps are checked under Chrome's 4× CPU throttle on macos-14 as a proxy, plus a
  real-device spot check (§19).

## 18. Browser coverage

- Chromium (latest stable) on macos-14 via ANGLE Metal: all browser tests and captures.
- WebKit (Playwright WebKit on macos-14): `renderer-single-path`, `renderer-mount-failure`,
  `lean-shim`, `pack-consumer-smoke` and the §16.3 template captures.
- Firefox (Playwright Firefox on macos-14): the same four specs. Captures are informational until PRD
  12 defines Firefox baselines.
- WebGPU path: `renderer-single-path` runs once with `backend: "webgpu"` on Chromium when PRD 11
  marks the backend shippable. Until then the spec asserts that `backend: "webgpu"` resolves through
  `Renderer.create` (no second class) and is skipped for pixels.
- SwiftShader or software GL is never used for visual gates (research/14 §7.2).

## 19. Mobile coverage

- Playwright device emulation on macos-14 (iPhone 13 viewport 390×844 with DPR 3 in WebKit; Pixel 7
  412×915 with DPR 2.625 in Chromium) for `pack-consumer-smoke` and the §16.3 template captures.
- Bundle and parse budgets (§17 Low) are enforced in CI with 4× CPU throttling.
- Real-device spot check, once per release candidate (3.1.0 and 4.0.0): the owner, or a remote device
  farm if one is provisioned through the shared cloud scripts, loads `product-viewer` and
  `showcase-siege-golf` on an iPhone (Safari) and a mid Android (Chrome) and records `diagnostics()`
  output (backend, degradations, compiled features) plus a screenshot. If no device is available, the
  release notes record it as an open gap; it is not waived silently.
- The error overlay (T4.3) must be readable at 390 px width (no horizontal scroll, ≥ 16 px text).

## 20. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd15/` (images as JPEG ≤ 400 KB each;
raw PNGs stay in workflow artifacts with hashes):
- `phase0/` baseline contact sheets and benchmark side-by-sides (links to run ids).
- `phase-N/` contact sheets for every phase with a §16.1 gate, plus the pairwise judgment JSON
  (`{ game, category, vision: "A|same|B", human: "A|same|B", reviewer, runId }`).
- `16-instancing-before-after.jpg` with the rerun research/23-style judgment text.
- `templates/product-viewer-{before,after}-{desktop,mobile}.jpg`,
  `templates/mini-game-{before,after}-{desktop,mobile}.jpg`, and the §16.3 judgment.
- `error-overlay-{desktop,mobile}.png` from `renderer-mount-failure.spec.ts`.
- `arch-gates.json`, `bundle-sizes.json`, `script-prune-report.json`, `root-export-dispositions.json`
  and `lean-device-diff.md` at the end of each phase that changes them.
Every artifact records the commit SHA and workflow run id. Evidence describes what was measured. It
does not label anything "parity", "faithful" or "AAA".

## 21. Completion criteria

All of the following, verified on GitHub Actions at the final commit:
1. Exactly one renderer class (`Renderer`) and one device per backend. `single-renderer` and
   `glsl-location` pass in fail mode. `rg -n "getContext\(\"webgl2\"\)" packages` hits only `WebGL2Device.ts`/`RenderBackend.ts`.
2. `packages/engine/src/agent-api/index.ts` ≤ 300 lines. No file in `packages/*/src` exceeds 2,500
   lines outside the dated allowlist. `layering` and `no-cycles` pass.
3. `compileScene` is the only producer of `RenderSource` for builder scenes. The handler table is
   exhaustive. `optionCoverage.test.ts` covers 100% of builder option fields. `DIAGNOSTIC_ONLY_FIELDS`
   entries each name an owner PRD, and entries owned by completed PRDs are gone.
4. No silent visual fallback. `createWebGLSceneRenderer` and its GLSL are deleted. 36 strict captures
   show zero degradations.
5. In-repo and published resolution are identical (`resolution:check`). `pack:check` passes for every
   shipped and create-aura3d template.
6. "." has ≤ 350 runtime values and 0 evidence-regex names. There are ≤ 16 subpaths. `unique-ownership`
   reports 0 names with different declarations across packages.
7. `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/environments`, `@aura3d/materials`,
   `@aura3d/editor` and `LeanWebGL2Device` are gone (4.0.0). Templates render through `@aura3d/engine`
   and pass §16.3.
8. ≤ 80 root scripts, ≤ 60 `tools/` dirs, 0 maps/js/d.ts under `packages/*/src`. `tsconfig.base.json`
   has `noEmit: true`. dist contains no tests or tools.
9. Every pixel-neutral gate passed. §16.2 instancing passed. Bundle and CPU budgets in §17 are met and
   recorded in a generated `BUNDLE_SIZES.md`.
10. README, MIGRATION-4.0 and skills (PRD 13) describe the consolidated surface without
    parity/faithful claims.

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
  "worked" before. Before merging, run the 36 strict captures plus the 32 `A3DRenderer` apps' route
  health. Any route that throws `renderer-mount-failed` is a pre-existing hidden failure. Fix the
  cause (owner PRD) or explicitly add `strict: false` to that route with a tracking issue. Never
  restore the fallback.
- Script and tool deletion (Phase 7): one commit per family. `script-prune-report.json` lists every
  deleted name, so a single `git revert` restores a family.
- Orphan map deletion is not tracked by git (the files are gitignored), so it cannot be reverted with
  git. The files are build debris with no consumers. The procedure in Appendix A D-14 includes a
  tarball backup in the workflow artifact.
- 4.0.0 is published only after the §11 window. If a regression is found after publish, ship 4.0.1 with
  a fix. Re-adding a removed API requires owner approval, recorded in the PR.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Merge conflicts between the agent-api split (Phase 3) and PRDs 01/02/03/07 editing the same ranges | high | high | Phase 3 pure moves run first and fast (move-only commits, no review of logic). Other PRDs rebase onto `compiler/*` paths. A short announced freeze on `agent-api/index.ts` edits during T3.1-T3.9 |
| `LeanWebGL2Device` holds real fixes not in `WebGL2Device` | medium | medium | T2.3 line-level classification with tests per ported line |
| Strict default breaks shipped games that silently degrade today | medium | medium (visible error instead of degraded frame) | Strict captures before merge; per-route `strict: false` only with a tracking issue |
| 190 KB initial bundle unattainable with IBL and shadows in the initial chunk | medium | low | Measured in Phase 4. If over, the PMREM generator and shadow programs move to a lazy chunk fetched in parallel with assets; the cap is re-set from measurement with the delta documented, never by dropping lighting |
| Export trimming breaks unknown external consumers | low (4 published packages, small user base) | medium | Deprecated aliases for one minor and 4 weeks; generated migration doc; codemods |
| Script/tool pruning deletes something a workflow or release step needs | medium | medium | Reference scanner includes workflows; `script-prune --check` in CI; per-family revert |
| Option-sensitivity test becomes a rubber stamp (probe values chosen to differ trivially) | medium | medium | Probe values must be the documented min/max or two named presets. Reviewers reject probes that only change ids or names; the diff ignores ids |
| Agents and skills keep using deleted paths | high | medium | PRD 13 skill updates in the same release; arch gate fails on imports of removed subpaths in repo code |
| Release cadence collapses the deprecation window | medium | medium | 4-week floor in §11 |
| This PRD gets reported as quality progress | medium | high (repeats research/01 P1-P3) | §16 gates are neutrality or specific defect closure only; no competitiveness claim is allowed from this PRD |

## 24. Explicitly out of scope

- Any change to shading math, tone mapping, IBL, shadows, post kernels, materials, tessellation, DPR
  or quality tiers (PRDs 01-04, 11). This PRD only moves code that implements them.
- WebGPU backend correctness (PRD 11). This PRD only routes it through `Renderer.create`.
- Re-implementing a three.js drop-in compatibility layer. The CLI codemod is the full extent.
- Game content, HUD, audio and route-local evidence removal (PRDs 09, 14). Template art direction
  (PRD 13).
- New visual gates and golden images (PRD 12). This PRD deletes the fabricated ones and supplies the
  pixel-neutral check its own phases need.
- Publishing additional npm packages. The workspace stays one umbrella package plus the CLI, `create-aura3d` and `asset-index`.
- `tests/reports` local purge (9.5 GB, research/14 §0.10): developer-machine hygiene, done with PRD 12's CI artifact retention.
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
| D-09 | `production-runtime/shaders/wgsl/pbr.wgsl`, `skybox.wgsl`, `production-runtime/backends/{webgl2,webgpu}/*` 2-line shells, `webgpu/WebGPUPipelineCache.ts` | tiny | none rendering | `rg` per file name | 5 |
| D-10 | 31 barrel-only orphan rendering files (4,928 lines), including `RendererVisualPipelineReport.ts` (843), `PbrReference.ts` (842), `PrimitiveSubmissionAudit.ts` (460), `ReflectionSurfaces.ts` (358), `VegetationScatter.ts` (315), `VoxelWorld.ts` (275), `shadows/CascadeHysteresis.ts` (146), `ScreenSpaceReflectionPass.ts` (78), `performance/{LOD,Octree,FrustumCuller,RendererStats,ResourceBudget}.ts`, `UniformBinder.ts` | 4,928 | 0 outside barrel (research/13 §2.4) | per-file name check. **Exception:** `CascadeHysteresis.ts` and any file `_sections/E` lists as "keep, currently unreachable" (CSM stable-fit math) is moved to PRD 02's ownership instead of deleted | 5 |
| D-11 | `packages/three-compat/**` (except `migration/` → CLI) | 1,586 | 0 apps / 7 tests | CLI codemod tests green | 6 |
| D-12 | `templates/three-compat-*` (8), `templates/external-parity-*` (4) | 2-line stubs; 4 small apps | scripts/tests that list them | `script-prune` clean | 6, 1 |
| D-13 | `benchmarks/three-compat/`, 2 three-compat parity specs, `tools/three-compat-*` (30), 20 `three-compat:*` scripts | — | `three-compat:release` chain | research/19 C18 confirms fabrication | 6 |
| D-14 | 1,194 orphan `*.js.map`/`*.d.ts.map` in `packages/*/src` | build debris | none (untracked, gitignored) | Procedure: `find packages -path '*/src/*' \( -name '*.js.map' -o -name '*.d.ts.map' \) -not -path '*/node_modules/*' > /tmp/maps.txt`; for each, assert the sibling `.js`/`.d.ts` does **not** exist and `git ls-files --error-unmatch` fails; tar the list as a workflow artifact; then delete only listed files. Do **not** use `git clean -fX` (it also removes other ignored files such as `.tsbuildinfo`, local env files) | 7 |
| D-15 | `packages/environments` | 464 | 0 apps / 1 test | diagnostics moved or deleted | 6 |
| D-16 | `packages/materials` (incl. `NodeMaterial`) | 742 | 2 app/template / 1 test | preset values reviewed by PRD 04 | 6 |
| D-17 | `packages/editor` (1-line alias) | 1 | `./editor` subpath | alias in place | 6 |
| D-18 | `packages/lean` | 1,243 | 16 template files (switched in T4.7) | 4.0.0 window elapsed | 8 |
| D-19 | `packages/input/src/controls/*` | — | input consumers | equivalence tests T6.9 | 8 |
| D-20 | Duplicate math in `animation/src/Keyframe.ts`, `physics/src/Shape.ts`; extra `Vec3` declarations | — | internal | property tests T6.8 | 6 |
| D-21 | `dist/index.*` aggregate and dead `files` entries | — | no export condition | `pack:check` | 1 |
| D-22 | Alias subpaths (`./engine-runtime`, `./workflows/production-runtime`, `./assets/production-runtime`, `./editor`) and the other §11 subpaths | — | fixture consumer | deprecated stub tested | 5 → 8 |
| D-23 | `MIGRATION-2.0.md`, `BUNDLE_SIZES.md` hand table | docs | README links | regenerated replacements exist | 4, 7 |
| D-24 | Root scratch files (research/13 §8.3) | ~25 files | none | `git ls-files` + `rg` per basename | 7 |
| D-25 | Root scripts beyond the ≤ 80 kept set; `tools/` dirs beyond ≤ 60 | 480+ scripts; ~390 dirs | per `script-prune-report.json` | PRD 12 kept-gate list reviewed; per-family commits | 7 |
| D-26 | `tools/verify-architecture` | 395 | CI | `arch-gates` in fail mode replaces it | 7 |

Do not delete (verified sound and in-path or awaiting wiring, research/13 §13 and `_sections/E` keep
list): `Renderer`, `WebGL2Device`, `ForwardPass`, `WebGL2StateCache.ts`, `RenderGraph.ts`,
`RendererTiming.ts`, `RenderItemSorting.ts`, `PBRHDRPipeline.ts` (moved), `CascadedShadowMaps.ts`
(PRD 02), `NativeBloomPyramid` planner (PRD 03), `EnvironmentBackgroundPass` (PRD 02),
`ResidentGPUParticleRenderer` and the GPU particle kernels (PRD 07), `TerrainHeightfield`,
`OceanSurface` (PRD 10), `GLTFAnimationRuntime`, the skinning chunks and IK (PRD 06), the typed asset
manifest flow (`defineAuraAssets`), `@aura3d/physics` + `physics-rapier`, and `navigation-recast`.
