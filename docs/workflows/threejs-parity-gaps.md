# PRD — three.js → Aura3D Parity

**Status:** v2 · re-verified against source on 2026-10-21 (`main` @ `94c85e8ad`)
**Supersedes:** the v1 "Parity Backlog" draft of the same date
**Companion:** [`crayon-game-reverse-engineering.md`](./crayon-game-reverse-engineering.md)
(the ten Crayon ports this PRD unblocks)

This document is three things in one file:

1. **Verified gap register** (§3): every v1 gap ID re-checked against current
   source, with a verdict and `file:line` evidence.
2. **PRD by filename** (§5): for each lane, the exact files to create or modify
   and what each one must contain.
3. **Task list and checklist** (§6–§8): ordered tasks with IDs and acceptance,
   plus a tick-box checklist that defines "done".

Path shorthands used throughout:

| Short | Full path |
| --- | --- |
| `E/` | `packages/engine/src/` |
| `AA/` | `packages/engine/src/agent-api/` |
| `R/` | `packages/rendering/src/` |
| `M/` | `packages/math/src/` |
| `S/` | `packages/scene/src/` |
| `AN/` | `packages/animation/src/` |
| `AS/` | `packages/assets/src/` |
| `AU/` | `packages/audio/src/` |
| `CLI/` | `packages/aura3d-cli/src/` |

---

## 0. What changed since v1 (read first)

The v1 draft was written against a baseline that no longer exists. These
corrections change the plan, not just the numbers.

| # | v1 said | Reality (verified) | Consequence |
| --- | --- | --- | --- |
| C1 | `packages/three-compat` holds 26 ledger rows and the `*Compat` classes | **Deleted.** Source removed in `ed68ec864` (WS-3.4) and `7787e614f` (QR-15 "honest packages"). Only an untracked, stale `packages/three-compat/dist/` (Sep 10) and `node_modules/` remain on disk. | Every "Aura3D today: `XCompat`" cell in v1 pointed at dead code. The adapter surface now is the `aura3d migrate three` codemod (`CLI/migrate-three/`) plus the engine's own public API. v1's §2.4 reproduce command imported the stale dist. |
| C2 | "Aura3D is WebGPU-first" | **`createAuraApp` mounts WebGL2** (`AA/app/createAuraApp.ts:374`: `backend = shouldUseProductionRenderer ? "webgl2" : …`). WebGPU runs only via `Renderer.create` with an explicit backend. `R/production-runtime/backends/WebGPURendererBackend.ts:1` is an `export {}` placeholder ("PRD 11 Phase 1 WebGPU freeze"). `A3D_QR_WEBGPU` is `"dev"` (`R/contracts/flags.state.ts:41`). | Custom shaders **must ship GLSL** to run on the live path. v1's "author in WGSL, not GLSL" would have produced APIs that do not execute in any app. New rule: **GLSL is required, WGSL is optional and runs only on WebGPU**, matching `PortableShaderMaterial`. |
| C3 | `PostProcessComposer` is the post path; there is no custom pass | `PostProcessComposer`/`EffectComposer` is a **CPU reference kernel** (`R/reference/EffectComposer.ts:91`). The live path is the v2 post graph, and it **already runs custom GLSL passes** via `app.addPostPass` (`AA/postBridge.ts:442`, executed in `R/post/v2Stages.ts:371-418`, `A3D_QR_POST` default-on). | SH-03 drops from "build an engine" to "expose it + add WGSL + ordering". |
| C4 | No public custom shader material | `PortableShaderMaterial` (`R/PortableShaderMaterial.ts:60`) compiles GLSL+WGSL pairs on real GPUs, with `compile`/`compileAsync`/`hotReload` (`:104-140`) and a browser test (`tests/browser/portable-custom-materials.spec.ts:23`). It is exported from `@aura3d/rendering` but **not** from `@aura3d/engine/renderer` or the `material.*` namespace. | SH-02 is an adapter gap, not an engine gap. |
| C5 | No public curves | `M/Curves.ts:8,37` exports `CatmullRomCurve3` (uniform only) and `CubicBezierCurve3`. Arc-length tables, centripetal CR and rotation-minimising frames exist in `AA/world/spline.ts:74-98` and `E/…/camera/Spline.ts`. | SM-02 is a consolidation job. |
| C6 | Math is Vector3/Quaternion/Matrix4/Color only | `@aura3d/math` (`M/index.ts:1-18`) exports Vector2/3/4, Matrix3/4, Quaternion, Euler, Color, Ray, Plane, Box3, Sphere, Frustum, Transform. They are thin: `Euler` accepts only `"XYZ"` (`M/Euler.ts:11`). | SM-01 is "deepen and add four types", not "build". |
| C7 | Fog not public | `effects.fog` / `depthFog` / `volumetricFog` are public (`AA/nodes/effects.ts:52,82,95`), as is `app.atmosphere.setFog`, with height/exp/exp2/linear modes. | SR-02 shrinks to a per-material opt-out. |
| C8 | No PMREM at runtime | `environments.capture/hdri/preset` (`AA/nodes/environments.ts:10,43,66`), `R/environment/GPUPMREMGenerator.ts:35`, `envMapIntensity` on the material spec (`AA/nodes/types.ts:200`). | SH-07 is closed. |
| C9 | WebXR, CSM, Reflector, RectAreaLight: none | `WebXRSessionController` (`packages/input/src/WebXRSessionController.ts:160`); `CascadedShadowMaps` (`R/CascadedShadowMaps.ts:93`); planar reflection (`R/PlanarReflection.ts:44,82,171`); `S/RectAreaLight.ts:8` with LTC tables (`R/probes/LtcLuts.ts`); SH9 irradiance (`R/environment/SphericalHarmonics.ts`). | SC-04, AD-12, AD-15 and AD-16 become "expose", not "build". |
| C10 | AU-02 "better than three" | No cone, no orientation, distance model hard-wired to `inverse` on the panner (`AU/SpatialAudio.ts:18-22`). Also a **suspected double attenuation**: `PositionalEmitter` multiplies software attenuation into gain (`AU/PositionalEmitter.ts:263-264`) while the panner applies inverse attenuation too. | AU-02 has a bug to fix before any facade lands on it. |
| C11 | `three/webgpu` exports 618 | **629** (three 0.185.1). Core 441, TSL 638, 29 post passes, 425 addon files in 36 dirs all confirmed. | Number fixed in §2. |
| C12 | Diagnostic-only compat rows: Shader, Loaders, InstancedBufferGeometry | The third was `TextureCompat`/`TextureLoaderCompat`/`CubeTextureLoaderCompat`. `InstancedBufferGeometryCompat` was `approximation`. | Historical only, since the package is deleted. |
| C13 | `pnpm check:release` stays green as an acceptance gate | `check:release` (`package.json:130`) chains 31 `pnpm` sub-scripts; **26 are undefined**, among them `check:public-api`, `check:agent-api`, `check:no-three-runtime`, `check:claim-lineage`, `check:bundle-size`, `check:tarballs`. It fails at the first missing script. | It cannot be used as an acceptance gate until fixed (task **B-03**). |
| C14 | Helpers: 7 in compat | Helpers (Axes/Grid/Box/Camera/DirectionalLight/Skeleton) were compat-only and went with the package. No `*Helper` class exists in `packages/`. | SC-03 is a real gap again (P2). |
| C15 | — | The legacy `migrateThreeToA3D` still rewrites `new THREE.WebGLRenderer` to `createThreeCompatRenderer` (`CLI/migrate-three/ThreeToA3DAdapter.ts:18`), and that function does not exist. | Live bug; fix in **B-04**. |
| C16 | `scene.raycast` absent | `raycastSceneTargets[All]` exists (`AA/SceneQueries.ts:93,101`) and is exported from the agent-api barrel (`AA/index.ts:340`) but not from `E/public/index.ts`. | SR-03 is an export-plus-options job. |

**Net:** of the 64 non-excluded v1 IDs (SR-06 is merged into SG-10, and 6 AD
rows are deliberate exclusions), **8 are closed**, **43 are partially closed**
(the engine path exists but is internal, thin, or missing three-shaped
semantics; "mostly closed" counts here), and **13 are still real gaps**. Several v1 P0 items are smaller than v1 claimed (SH-02,
SH-03, SM-01, SM-02); one P0 item is larger (SG-03); and the release gate the
plan leaned on is broken.

---

## 1. Problem, goals, non-goals

### 1.1 Problem

The ten Crayon games are three.js r186 WebGPU apps. A mechanical `THREE.*` port
fails because the code has nowhere to land: Aura3D renders most of what the
games need, but often only through internal `@aura3d/rendering` classes rather
than the curated `@aura3d/engine` surface (`material.*`, `primitives.*`,
`effects.*`, `instances.*`, `geometry.*`), or without the semantics a port
expects (arc-length curves, per-frame geometry updates, canvas textures).

### 1.2 Goals

- **G1.** Every P0 and P1 ID in §3 reaches "engine path public + fixture passes".
- **G2.** Strange Orbit, HEATSINK, Ninja Runner and Last Train can each be built
  with no imports from `@aura3d/rendering` internals and no `// TODO(a3d-migrate)`
  left in game code.
- **G3.** `aura3d migrate three` maps every class this PRD exposes, with an
  honest `exact | approximate | none` label.
- **G4.** `pnpm check:release` runs end to end and is green.

### 1.3 Non-goals

See §4 (exclusions). Also out of scope: a full TSL compiler, runtime GLSL→WGSL
translation, re-creating `packages/three-compat`, and promoting WebGPU to the
default app backend (that belongs to PRD 11 / `A3D_QR_WEBGPU`).

### 1.4 Binding rules

1. **WS-3.4 (honest surface).** No public API, codemod mapping or doc claim may
   exist unless a real GPU path runs behind it. The rationale survives in
   `packages/rendering/src/index.ts:419`, `CLI/migrate-three/ImportMap.ts:13-19`
   and commit `ed68ec864`. Facades land **after** the engine path, never before.
2. **GLSL-first shading (from C2).** Any user-authored shader API requires GLSL
   and accepts optional WGSL. WGSL alone must fail `validate` with a clear error
   while `createAuraApp` mounts WebGL2.
3. **Curated surface.** New root exports are added to
   `docs/architecture/root-export-dispositions.json` and generated with
   `tools/export-surface/scaffold.ts --write`. Never hand-edit
   `E/public/index.ts`. New subpaths go in root `package.json#exports` and
   `aura.exports.json`; curated `./renderer` names go in `E/public/renderer.ts`.
   Every new export is documented in `docs/api/public-api.md`.
4. **Parallel lanes, single writer.** Lanes run concurrently. Shared contract
   files are written **once** by the bootstrap lane B (§5.0); after that each file
   has exactly one owning lane (§5 ownership table).
5. **Remote execution.** Browser/GPU fixtures (Playwright) run remotely
   (`tools/remote-capture.sh`, serverless ACR Tasks / CodeBuild), never as a
   local Playwright suite. Unit tests (vitest) may run locally with
   `--maxWorkers=2`.

---

## 2. Measured baseline

### 2.1 three.js (0.185.1, root `node_modules`)

| Surface | Count |
| --- | --- |
| `three` core exports | 441 |
| `three/webgpu` exports | **629** |
| `three/tsl` exports | 638 |
| `examples/jsm` files / dirs | 425 / 36 |
| `postprocessing/*Pass.js` | 29 |

### 2.2 What the games run

Unchanged from v1: renderer `three.js r186 webgpu`; importmap three 0.184.0 +
Rapier 0.12.0; modules > 500 KB inline three, < 100 KB import it; HEATSINK
bundle shows `WebGPURenderer` ×12, `BatchedMesh` ×12, `InstancedMesh` ×10,
`SkinnedMesh` ×11, `PMREMGenerator` ×6, `NodeMaterial` ×4. **Symbol presence is
not usage.** None of the §9 runtime probes have been run; no answers exist in
`evidence/`, `artifacts/` or `docs/`.

### 2.3 Aura3D surface (verified)

| Area | Public today | Count / note |
| --- | --- | --- |
| App backend | `createAuraApp` → WebGL2 | WebGPU via `Renderer.create` only |
| Primitives | box, sphere, plane, cylinder, capsule, torus (`AA/nodes/primitives.ts:33-39`) | 6; cone exists internally (`R/Geometry.ts:11-22`) |
| Custom geometry | `geometry.define/custom` (`AA/nodes/geometry.ts:10-13`, spec `AA/RootGeometry.ts:6-14`) | static, number arrays, auto normals |
| Instancing | `instances.*` (`AA/nodes/instances.ts:20-39`) | 8 factories |
| Post effects | spread onto `effects.*` (`AA/nodes/effects.post.ts:24-156`; no `effects.post` key, `AA/nodes/effects.composite.ts:9`) | 9 named + `outline`, `fog`, `depthFog`, `volumetricFog`, `cinematicBloom` |
| Custom post | `app.addPostPass` (GLSL) | public type `AuraCustomPostPass` |
| Custom material | none on engine surface | `PortableShaderMaterial` in `@aura3d/rendering` |
| Math | `@aura3d/math` 15 types + `Curves` | thin |
| Tone mapping | none/linear/reinhard/aces/agx/neutral (`R/contracts/output.ts:9`) | Cineon missing |
| Fog | public, 4 modes | no per-material opt-out |
| Environment/PMREM | public | closed |
| Animation | `AnimationController`, mixer, crossfade, retarget | thin `PropertyBinding`, no `AnimationUtils` |
| Audio | `SpatialAudio`, `PositionalEmitter`, `AudioBus`, `AudioClip` | no analyser, no cone |
| Codemod | `aura3d migrate three` (`CLI/commands/prd15/index.ts:103-128`) | 27 mapping rows: 25 approximate, 2 none, 0 exact (`CLI/migrate-three/mappings.ts:21-49`) |

### 2.4 Reproduce

```bash
# three surface (root resolves three 0.185.1)
node --input-type=module -e 'import * as T from "three"; console.log(Object.keys(T).length)'
node --input-type=module -e 'import("three/webgpu").then(m=>console.log(Object.keys(m).length))'
node --input-type=module -e 'import("three/tsl").then(m=>console.log(Object.keys(m).length))'
ls node_modules/three/examples/jsm/postprocessing | grep -c 'Pass\.js$'

# codemod surface (replaces the deleted three-compat dist probe)
rg 'construct:' packages/aura3d-cli/src/migrate-three/mappings.ts | rg -o 'mapping: "(exact|approximate|none)"' -r '$1' | sort | uniq -c
rg -n 'three/(addons|examples)' packages/aura3d-cli/src/migrate-three/ImportMap.ts

# release gate health: lists check:release sub-scripts that are not defined
node -e 'const s=require("./package.json").scripts;const n=[...s["check:release"].matchAll(/pnpm (check:[\w:-]+)/g)].map(m=>m[1]);console.log(n.filter(x=>!s[x]))'
```

---

## 3. Verified gap register

Verdicts: **GAP** (no usable path), **PARTIAL** (an engine path exists but is
internal, thin or missing semantics), **CLOSED** (no work beyond an optional
codemod row). The "Remaining work" column is what §5 and §6 implement.

### 3.1 Shading, materials, renderer (SH)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SH-01 TSL subset | P1 (probe-gated) | GAP | `E/devtools/materials/NodeMaterial.ts:1` is `export {}` | Subset node graph that emits a GLSL(+WGSL) pair into `PortableShaderMaterial`. **Blocked on probe P-1** | L1 |
| SH-02 ShaderMaterial | **P0** | PARTIAL | `R/PortableShaderMaterial.ts:60`, `:104-140`; `R/index.ts:518`; `tests/browser/portable-custom-materials.spec.ts:23` | `material.custom({glsl, wgsl?, uniforms, defines, transparent, depthWrite, side, blending})` in `AA/nodes/material.ts`; compiler hook; runtime uniform setter; re-export via `E/public/renderer.ts` | L1 |
| SH-03 ShaderPass | **P0** | PARTIAL | `AA/postBridge.ts:442`; `R/post/v2Stages.ts:371-418` (runs `fragment.glsl` only, `:391`) | `effects.shaderPass({...})` agent node; named `order` slots; WGSL on WebGPU post (`R/webgpu/WebGPUPostProcess.ts`); route-health names the pass | L1 |
| SH-04 compute | P2 | GAP (public) | internal only: `R/effects/GPUParticleBackend.ts:369-389,790` | Public `compute.*` is WebGPU-only, so it waits for `A3D_QR_WEBGPU`. Document as WebGPU-only | L1 (P2) |
| SH-05 renderer facade | P1 | PARTIAL | `R/Renderer.ts`: `resize :617`, `resizeToDisplay :627`, `startAnimationLoop :700`, `render :731`, `getDiagnostics :1573`, `setOutput :586`; `clearColor` constructor-only `:97` | `setPixelRatio`, `setClearColor`, `info` getter on `Renderer` and on `app` | L7 |
| SH-06 render targets | P1 | PARTIAL | `R/RenderDevice.ts:65-82` (cube, 2d-array, MRT, depth, MSAA); `R/WebGL2Device.ts:1029-1042` | Public `RenderTarget` + `renderer.render({target})` (`RendererInput :260` has none); no 3D textures (P2) | L7 |
| SH-07 PMREM/env | P1 | **CLOSED** | `AA/nodes/environments.ts:10,43,66`; `R/environment/GPUPMREMGenerator.ts:35`; `AA/nodes/types.ts:200` | Codemod row `PMREMGenerator` → `environments.capture` (approximate) | L10 |
| SH-08 tone mapping | P1 | PARTIAL | `R/contracts/output.ts:9`, `E/contracts/output.ts:8-15`; GLSL map `R/output/ToneMappingOperators.glsl.ts:201-204` | Add `cineon` (GLSL + union); CPU reference already at `R/post/ToneOperators.ts:39` | L7 |
| SH-09 onBeforeCompile | P2 | GAP | none; invalidation only via `ShaderLibrary.replace` (`R/ShaderLibraryCore.ts:55-70`) | `material.custom({ patch })` chunk-replace hook + cache-key salt | L1 (P2) |
| SH-10 preprocessor/chunks | P1 | PARTIAL | `R/ShaderPreprocessor.ts:1-36`; `SHADER_CHUNKS` static (`R/index.ts:528,571`) | `registerShaderChunk(name, glsl, wgsl?)`; re-export from `E/public/renderer.ts` | L1 |

### 3.2 Scene graph and geometry (SG)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SG-01 InstancedMesh | P1 | **DONE (L5)** | `AA/nodes/instancedMesh.ts`; `AA/nodes/batched.ts` (`BatchedMeshState` dense store); `AA/nodes/game/instanceTransforms.ts:directBatchedSetInstanceTransforms` writes the retained `matrices`/`colors` flat arrays the renderer uploads verbatim (L5-01); `instances.mesh` handle: `setMatrixAt`/`getMatrixAt`/`setColorAt`/`count`/`needsUpdate`/`computeBoundingSphere` | none for the public API; primitive-node `instances` still use the spec path by design | L5 |
| SG-02 BatchedMesh | P1 (probe-gated) | **DONE (L5) — probe P-2 resolved** | `AA/nodes/batched.ts` (`batched.mesh` handle + real `batchedNodeHandler` under `A3D_PARITY_BATCHING`); `R/renderer/CullingBatching.ts` `BatchPlanCache.apply` routes `plan.multiDrawGroups` → `buildMultiDrawBatch` + `synthesizeMultiDrawItems`; `R/batching/*` pooled arenas, `DrawDataTexture` flags (visible bit + geometryId), stable texture object; `DrawSubmit` enqueues marker runs → `multiDrawElementsInstanced`; honest fallback = per-geometry instanced items with `fallbackReason` + `multiDrawMode:"unavailable"` in `renderer.batching` diagnostics | **Probe P-2 resolved**: `isBatchedMesh` live in 0 of 10 games (heap-class only via the shared playlabs bundle, §9) — stays unpromoted per-game; implementation shipped under `A3D_PARITY_BATCHING` regardless | L5 |
| SG-03 geometry breadth | **P0** | GAP | `AA/nodes/types.ts:442` (6 kinds); `R/geometry/Primitives.ts:20`; internal pieces `AA/world/spline.ts:215-302` | cone, circle, ring, tube, lathe, extrude, shape, torusKnot, polyhedron(tetra/octa/icosa/dodeca), roundedBox | L2 |
| SG-04 Edges/Wireframe | P1 | GAP | `R/Geometry.ts:93` line topology only | `geometry.edges(src, thresholdAngle)`, `geometry.wireframe(src)` | L2 |
| SG-05 geometry authoring | **P0** | PARTIAL | `AA/RootGeometry.ts:6-14,84`; `R/MeshConsolidation.ts:109,233` | Typed arrays, `colors`, `groups`, `drawRange`, per-frame `handle.setGeometry()` / `updateAttribute()`, `computeNormals/Bounds`, `applyMatrix4`, `merge` | L2 |
| SG-06 lines | P1 | PARTIAL (internal) | `R/ScreenSpaceLineMaterial.ts:6-31` (width, dashes); `R/Geometry.ts:120,162`; `R/VertexFormat.ts:23` | `lines.line/loop/segments/fat` agent node + `kind:"line"` | L6 |
| SG-07 points | P1 | PARTIAL (internal) | `R/Geometry.ts:195`; `R/UnlitMaterial.ts:7` (fixed size ≤128) | `points.*` node with sizeAttenuation, vertex colours, map, alphaTest | L6 |
| SG-08 sprites | P2 | PARTIAL (internal) | `R/SpriteFlipbook.ts:13-38`; `effects.flipbook` (`AA/nodes/effects.ts:198`) | `sprites.*` node with rotation + center | L6 |
| SG-09 Object3D | P1 | PARTIAL | `S/SceneNode.ts:25-29,43-53,81`; engine handle `AA/…/RuntimeNodeHandle.ts:180-201` (TRS + visible only) | Handle: `renderOrder`, `frustumCulled`, `layers`, `userData`, `traverse`, `getWorldPosition/Quaternion`, `attach` | L7 |
| SG-10 / SR-06 background | P1 | PARTIAL | `AA/nodes/scene.ts:65` (colour); env background (`R/contracts/environment.ts:15`) | `scene().background({ texture | cube })` without IBL; `overrideMaterial` (P2) | L7 |
| SG-11 LOD | P2 | MOSTLY CLOSED | `AA/nodes/groups.ts:38`; `AA/nodes/types.ts:415,680` | LOD levels that are arbitrary groups/models | L7 (P2) |

### 3.3 Math and curves (SM)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SM-01 math breadth | **P0** | PARTIAL | `M/index.ts:1-18`; `M/Euler.ts:11` XYZ only; `M/Sphere.ts` 18 lines | Add Line3, Triangle, Spherical, Cylindrical; all 6 Euler orders; finish Box3/Sphere/Plane/Ray/Frustum/Matrix3 to three's method set | L3 |
| SM-02 curves | **P0** | PARTIAL | `M/Curves.ts:8,37`; `AA/world/spline.ts:74-98` | Curve base with `getPoint/getPointAt/getTangent(At)/getLength/getLengths/getSpacedPoints/computeFrenetFrames`; centripetal/chordal CR; Quadratic, Line3, Path, Shape (+holes), Ellipse, Arc, CurvePath; make `world/spline.ts` consume it | L3 |
| SM-03 keyframe tracks | P1 | PARTIAL | `AN/AnimationTrack.ts:3`; `AN/Keyframe.ts:15` | Colour track; typed track constructors; `Interpolant` | L8 |
| SM-04 MathUtils/HSL/SH3 | P1 | PARTIAL | `M/Interpolation.ts`; `M/Color.ts:27`; HSL private in `AA/color.ts:120`; SH9 `R/environment/SphericalHarmonics.ts:21-157` | `MathUtils` (degToRad, damp, mapLinear, seededRandom, euclideanModulo, pingpong), `Color.setHSL/getHSL/offsetHSL/lerpHSL`, public `SphericalHarmonics3` | L3 |
| AD-14 collision math | P1/P2 | PARTIAL | `packages/physics/src/Shape.ts:43,61`; `MeshBVH.ts:73` | `OBB`, `Capsule`, 3D `ConvexHull` (quickhull), `Octree` in `M/` | L3 |

### 3.4 Textures and asset I/O (ST)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| ST-01 texture kinds | **P0** | GAP (public) | `R/Texture.ts:71` (2d/cube/2d-array, BC/ETC2/ASTC, depth24); not on `./renderer` (`E/public/renderer.ts:16`) | `texture.data/canvas/video/compressed/depth/cube/dataArray` namespace; WebGPU 2d-array upload all layers (`R/webgpu/WebGPUDevice.ts:1885,1914`) | L4 |
| ST-02 texture semantics | **P0** | PARTIAL | `AA/nodes/types.ts:82,195,241-255,277-278`; `R/Sampler.ts` | Handle exposes `colorSpace`, `flipY`, `wrapS/wrapT`, `repeat/offset/rotation/center`, `anisotropy`, `min/magFilter`, `generateMipmaps` | L4 |
| ST-03 runtime upload | P1 | GAP | WebGL2 honours `Texture.update()` (`R/webgl2/TextureUpload.ts:84`); WebGPU caches forever (`R/webgpu/WebGPUDevice.ts:1879,1930`); `copyExternalImageToTexture` declared, never called (`:135`) | Revision check + `copyExternalImageToTexture` on WebGPU; `needsUpdate` on the handle; per-frame video upload | L4 |
| ST-04 misc loaders | P2 | PARTIAL | `AS/MaterialLoader.ts:20`, `AS/ImageLoader.ts:27` | FileLoader, ImageBitmapLoader, DataTextureLoader; Object/BufferGeometry/Animation loaders only if a port needs them | L4 (P2) |
| ST-05 GLTF+DRACO+KTX2+Meshopt | P1 | **CLOSED** | `AS/GLTFLoader.ts:1069-1071,1321,1612,1950`; `AA/AssetDecoders.ts:45-90` | Parity fixture only (vertex counts vs three for 3 sample GLBs) | L4 |
| ST-06 LoadingManager | P2 | PARTIAL | `AS/AssetManager.ts:20,65`; `AS/AssetCache.ts:15` | `createAuraApp({ onAssetProgress, onAssetError })` | L4 (P2) |
| ST-07 TextureLoader | P1 | GAP | `AS/loaders/TextureLoader.ts:8-12` returns a diagnostic | `texture.load(url, opts): Promise<TextureHandle>` over native `AS/TextureLoader.ts:20`; `dispose()` | L4 |
| AD-03 EXR | P1 | PARTIAL | HDR real (`AS/loaders/HDRLoader.ts:40-46`); EXR rejected (`R/EnvironmentPlatform.ts:291-298`) | EXR decode (PIZ/ZIP/none, half/float) | L4 |

### 3.5 Animation and skinning (SA)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SA-01 mixer depth | P1 | MOSTLY CLOSED | `AN/AnimationAction.ts:4,69,77,99,143-147`; `AN/AnimationMixer.ts:113,134,250`; `AA/AnimationController.ts:373-393,589-591,1179` | `clampWhenFinished` toggle, negative `timeScale`, `repetitions`, low-level `finished` event | L8 |
| SA-02 AnimationObjectGroup | P2 | GAP | — | `AN/AnimationObjectGroup.ts` | L8 (P2) |
| SA-03 PropertyBinding | P1 | PARTIAL | `AN/SceneAnimationBridge.ts:26-43` (plain split) | Parser for `node.prop[index]`, `morphTargetInfluences[name]`, `material.prop`, nested names | L8 |
| SA-04 clone/retarget | P1 | PARTIAL | per-`model()` skeletons (`AS/GLTFAssetParseCache.ts`); `AN/pose/Retarget.ts:240`; `instances.model` has no skinning | Public `cloneSkinned(model, n)` / `characters.clone`; share textures across clones; 10× fixture | L8 |
| SA-05 morph targets | P1 | MOSTLY CLOSED | `AA/nodes/types/runtime.ts:156-160`; `AS/GLTFAnimationRuntime.ts:436` | `morphTargetDictionary` getter; allow weights outside 0–1 (opt-in) | L8 |
| SA-06 AnimationUtils | P2 | PARTIAL | `AN/pose/makeClipAdditive.ts:28` (internal) | `subclip`, `optimize`, `merge`, public `makeClipAdditive` | L8 |

### 3.6 Audio (AU)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| AU-01 Audio/Listener | P1 | PARTIAL | `AU/AudioBus.ts:20`, `AU/AudioSource.ts:26-127`; `AU/AudioListener.ts:7-16` never writes `ctx.listener` | Make `AudioListener` drive `ctx.listener`; `setFilters/getOutput` | L9 |
| AU-02 PositionalAudio | P1 | PARTIAL + **bug** | `AU/SpatialAudio.ts:18-30`; `AU/PositionalEmitter.ts:32-46,57,103,204,263-264` | **Fix double attenuation first**; then panner `distanceModel`, cone (`coneInner/Outer/OuterGain`), orientation | L9 |
| AU-03 AudioAnalyser | P2 | GAP | no `createAnalyser` anywhere (`AU/AudioContextManager.ts:3-15`) | `AU/AudioAnalyser.ts` (`getFrequencyData`, `getAverageFrequency`) | L9 |
| AU-04 AudioLoader | P1 | CLOSED (native) | `AS/AudioLoader.ts:13-40`; `AU/AudioClip.ts:6` | Codemod row only | L10 |

### 3.7 Cameras, controls, helpers (SC)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SC-01 Cube/Array/Stereo camera | P2 (CubeCamera P1) | GAP (public) | `CubeCameraReflectionCapture` (`R/index.ts:1189`); `createStereoCameraRig` `:808`; no viewport/scissor in `R/RenderDevice.ts` | `cameras.cube({resolution, near, far})` → cube render target via `Renderer.renderProbeFace` (`R/Renderer.ts:536`); viewport/scissor for Array/Stereo (P2) | L7 |
| SC-02 controls | P2 | **CLOSED** | `packages/controls/src/index.ts:1-14` (all 9 three controls + extras) | Codemod rows for the 8 unmapped controls | L10 |
| SC-03 helpers | P2 | GAP (deleted with compat) | no `*Helper` class in `packages/` | `helpers.axes/grid/box/camera/light/skeleton/arrow` over `lines.*` (after L6) | L6 (P2) |
| SC-04 WebXR | P2 | PARTIAL | `packages/input/src/WebXRSessionController.ts:160` | XR render target + enter-VR/AR button helper | — (post-D) |

### 3.8 Runtime systems (SR)

| ID | Pri | Verdict | Evidence | Remaining work | Lane |
| --- | --- | --- | --- | --- | --- |
| SR-01 Clock | P1 | PARTIAL | `AA/FrameLoop.ts:369`; `E/contracts/time.ts:8` | Thin `Clock` (`getDelta/getElapsedTime/start/stop`) over the frame loop | L7 |
| SR-02 Fog | P1 | MOSTLY CLOSED | `AA/nodes/effects.ts:52,82,95`; `E/contracts/atmosphere.ts:17` | Per-material `fog?: boolean` (`AA/nodes/types.ts:163`) + ForwardPass uniform | L7 |
| SR-03 Raycaster | P1 | PARTIAL | `AA/SceneQueries.ts:93,101`; `AA/index.ts:340`; `S/SceneQuery.ts:10` | Export from `E/public`; `firstHitOnly`, `recursive`, `layers`, `near/far`; screen-space `fromCamera` | L7 |
| SR-04 Layers | P2 | GAP | `S/Layers.ts:1` never instantiated; `layerMask` used only for light pairing (`R/LightUniforms.ts:73`) | Camera layer mask in `R/Renderer.ts` `collectRenderItems`; node `layers` field | L7 |
| SR-05 info | P1 | PARTIAL | `R/RenderDevice.ts:221-258`; `E/lanes/prd11.ts:149` | `app.info` / `renderer.info` getter (`render.calls/triangles`, `memory.geometries/textures`) | L7 |
| SR-07 loop/compile/size | P1 | PARTIAL | `app.precompile?` typed (`AA/nodes/types/runtime.ts:377`) but never assigned | Wire `app.precompile` / `compileAsync`; `setPixelRatio` | L7 |
| SR-08 disposal | P1 | CLOSED (capability); fixture missing | `R/RenderDevice.ts:221-237`; `R/contracts/device.ts:12`; `E/lanes/prd11.ts:43-53` | `parity-disposal` soak fixture (20 cycles, ≤5% drift) | L7 |
| SR-09 colour mgmt | P1 | CLOSED | `AA/app/colorManagement.ts:6-11`; `R/ForwardPass.ts:435` | none | — |

### 3.9 Addons (AD)

| ID | Decision | Verdict | Remaining work | Lane |
| --- | --- | --- | --- | --- |
| AD-01 postprocessing | Adapt existing + custom pass | PARTIAL | Codemod rows: `UnrealBloomPass`→`effects.bloom`, `SMAAPass`→`effects.antiAlias`, `BokehPass`→DOF, `OutputPass`→output; remove those 4 from the blocked list only once rows are honest | L10 |
| AD-03 loaders | Adapt | PARTIAL | EXR (L4) | L4 |
| AD-04 FBX/MMD/PLY/STL/USDZ/3MF/VOX | Exclude | — | warning text | L10 |
| AD-05 exporters | Exclude | — | warning text | L10 |
| AD-06 BufferGeometryUtils | Adapt | PARTIAL (`R/MeshConsolidation.ts:109,233`) | `geometry.merge`, `toNonIndexed` | L2 |
| AD-07 Convex/RoundedBox/Text | Adapt | PARTIAL (decals `R/index.ts:1181`, SDF text) | `primitives.roundedBox`; convex hull geometry (uses L3 hull) | L2 |
| AD-08 Line2 | Adapt | PARTIAL (internal) | via SG-06 `lines.fat` | L6 |
| AD-09 effects/* | Exclude | — | superseded by SH-03 | — |
| AD-10 modifiers | Exclude | — | bake offline | — |
| AD-11 GPUComputationRenderer | Exclude | — | wait for SH-04 | — |
| AD-12 CSM | Adapt | **CLOSED (internal)** `R/CascadedShadowMaps.ts:93` | codemod row + confirm it is reachable from the agent shadow config | L10 |
| AD-13 webxr/inspector/transpiler/libs/offscreen | Exclude | — | — | — |
| AD-14 math addons | Adapt | PARTIAL | L3 | L3 |
| AD-15 Reflector/Refractor/Lensflare | Adapt Reflector | PARTIAL (`R/PlanarReflection.ts`, `R/ReflectionSurfaces.ts:73`) | `surfaces.mirror({ plane, resolution })` agent node; Lensflare P2 | L7 |
| AD-16 RectAreaLight/LightProbe | Adapt | PARTIAL (`S/RectAreaLight.ts:8`, `R/probes/LtcLuts.ts`) | `lights.rectArea` agent node; `LightProbe` from SH9 | L7 (P2) |

---

## 4. Deliberate exclusions

| Excluded | Why |
| --- | --- |
| WebGL1 | Not a supported device class |
| Promoting WebGPU to the default app backend | Owned by PRD 11 / `A3D_QR_WEBGPU`; this PRD only requires that WGSL paths exist where `PortableShaderMaterial` already accepts them |
| `CSS2DRenderer` / `CSS3DRenderer` | DOM overlays are the app's job; `labels` covers 3D labels |
| FBX, MMD, Collada, USDZ, 3MF, VOX, PLY, STL loaders | No shortlisted game uses them; convert offline |
| `examples/jsm/effects` | Superseded by SH-03 |
| Full TSL compiler | Only the probe-gated subset (SH-01) |
| `WebGLRenderer` internals (`getContext`, extensions, programs) | Driver leakage breaks ports |
| Runtime GLSL→WGSL translation | A second compiler with its own failure modes |
| Re-creating `packages/three-compat` | WS-3.4: adapters live in the codemod and the engine surface, not in a shadow class tree |

---

## 5. PRD by filename

Each lane owns the files listed under it. Files marked **(B)** are written once
by the bootstrap lane and are then read-only for every other lane until the
integration checkpoint (§7.3).

### 5.0 Lane B — bootstrap: contracts, gates, flags (precedes all lanes; one PR)

| File | Action | Content |
| --- | --- | --- |
| `package.json` (scripts) | modify | Define or remove the 26 undefined `check:*` sub-scripts in `check:release` (C13). At minimum restore `check:public-api`, `check:agent-api`, `check:no-three-runtime`, `check:public-surface-diff`, `check:bundle-size`. Add `test:parity` = `vitest run tests/unit/parity`. |
| `packages/rendering/src/contracts/flags.state.ts` | modify | Add `A3D_PARITY_SHADING`, `A3D_PARITY_GEOMETRY`, `A3D_PARITY_TEXTURES`, `A3D_PARITY_BATCHING`, `A3D_PARITY_LINES`, `A3D_PARITY_RUNTIME` = `"dev"`. Math, animation and audio need no flag (pure additions). |
| `AA/nodes/types.ts` **(B)** | modify | Freeze every new type a lane needs, as unions and optional fields: widen `AuraBuiltinPrimitive` (`:442`) with `cone, circle, ring, tube, lathe, extrude, shape, torusKnot, polyhedron, roundedBox`; add `AuraCustomMaterialSpec`; add `fog?: boolean` to `AuraMaterialSpec` (`:163`); add `kind: "line" \| "points" \| "sprite" \| "batched"` to the node union (`:659-667`); add `AuraTextureRef` handle type; add `renderOrder?`, `frustumCulled?`, `layers?` to the base node. Each new kind compiles to a `validate` error "not yet implemented (A3D_PARITY_*)" until its lane lands. |
| `AA/nodes/types/runtime.ts` **(B)** | modify | Freeze handle members: `setGeometry`, `updateAttribute`, `setUniform`, `renderOrder`, `layers`, `getWorldPosition`, `traverse`; `app.info`; `app.precompile` (already typed at `:377`). |
| `E/contracts/post.ts` **(B)** | modify | Freeze `AuraCustomPostPass.order: "before-bloom" \| "after-bloom" \| "before-tonemap" \| "after-tonemap" \| number` and `wgsl?: string`. |
| `E/contracts/output.ts`, `R/contracts/output.ts` **(B)** | modify | Add `"cineon"` to the tone-mapping union. |
| `docs/architecture/root-export-dispositions.json` **(B)** | modify | Reserve every new root name (`curve`, `texture`, `lines`, `points`, `sprites`, `batched`, `helpers`, `surfaces`, `Clock`, `raycast`), disposition `planned`. |
| `aura.exports.json` **(B)** | modify | Reserve the subpaths if any (none planned; all land on `.` or `./renderer`). |
| `E/public/renderer.ts` **(B)** | modify | Reserve `PortableShaderMaterial`, `ShaderPreprocessor`, `registerShaderChunk`, `RenderTarget`, `Texture`, `Sampler` (as `export type` until lanes ship values). |
| `CLI/migrate-three/ThreeToA3DAdapter.ts` | modify | Fix `:18`: map `WebGLRenderer` → `createAuraApp` (C15). |
| `tests/unit/parity/README.md` | create | Fixture conventions (§8). |
| `docs/workflows/threejs-parity-gaps.md` | modify | This file: keep §3 verdicts current. |

### 5.1 Lane L1 — custom shading (SH-02, SH-03, SH-10, SH-09, SH-01, SH-04)

| File | Action | Content |
| --- | --- | --- |
| `AA/nodes/material.ts` | modify | `material.custom(spec: AuraCustomMaterialSpec)`. Spec: `glsl: { vertex?, fragment }` (required), `wgsl?: { vertex?, fragment }`, `uniforms: Record<string, "f32"\|"vec2"\|"vec3"\|"vec4"\|"color3"\|"mat4"\|"texture2d"\|{ type, value }>`, `defines`, `transparent`, `depthWrite`, `depthTest`, `side`, `blending`, `fog`, `patch?` (SH-09). Validation: WGSL-only → error (rule 1.4.2). |
| `AA/compiler/customMaterial.ts` | create | Spec → `PortableShaderMaterial` (`R/PortableShaderMaterial.ts:60`). Stable cache key = hash(glsl, wgsl, defines, patch). Binds the built-in uniforms `uTime`, `uResolution`, `modelMatrix`, `viewMatrix`, `projectionMatrix`, `cameraPosition` under three's names. |
| `AA/compiler/primitives.ts`, `AA/compiler/modelMaterials.ts` | modify | Route `material.kind === "custom"` to `customMaterial.ts`. Only the dispatch line; the rest of these files belongs to L2. |
| `AA/app/runtimeNodes.ts` | modify (L1-owned region: `setUniform`) | `handle.setUniform(name, value)` writes into the material's uniform block without recompiling. |
| `AA/nodes/effects.post.ts` | modify | `effects.shaderPass({ glsl, wgsl?, uniforms, order, enabled })` → `AuraCustomPostPass`. |
| `AA/postBridge.ts` | modify | Honour `order` slots; expose `setPassUniform(name, key, value)`. |
| `R/post/v2Stages.ts` | modify | `:371-418`: insert custom passes at their named slot. Today they run in registration order. |
| `R/webgpu/WebGPUPostProcess.ts` | modify | Execute `wgsl` custom passes when the backend is WebGPU; when it is missing, emit a diagnostic instead of skipping silently. |
| `R/ShaderLibraryCore.ts` | modify | `registerShaderChunk(name, glsl, wgsl?)`: mutable registry, revision bump (`:55-70`), duplicate-name error. |
| `R/ShaderPreprocessor.ts` | modify | Resolve `#include <name>` against the mutable registry. |
| `E/public/renderer.ts` | modify (value exports for names B reserved) | Export `PortableShaderMaterial`, `ShaderPreprocessor`, `registerShaderChunk`. |
| `R/nodes/` (SH-01, probe-gated) | create | `tsl.ts` subset: `positionLocal, normalLocal, uv, time, uniform, uniformArray, texture, mix, smoothstep, sin, cos, color, vec3, float, Fn, If, Loop` → GLSL (+WGSL) emitter. **Start only if probe P-1 answers "≥3 games author node materials".** |
| `R/compute/` (SH-04, P2) | create | WebGPU-only `compute.dispatch` over the `GPUParticleBackend` pipeline wrappers. Deferred. |
| `examples/custom-material-lab/main.ts` | modify | Fixture page: two frames at `uTime` 0/1, and a custom post pass at each order slot. |
| `tests/unit/parity/shader-material.test.ts` | create | Spec validation, cache key stability, WGSL-only rejection, chunk include. |
| `tests/unit/parity/shader-pass-order.test.ts` | create | Slot ordering in the v2 post graph. |
| `tests/browser/parity-shader.spec.ts` | create | GPU: pixel delta between uniform values on WebGL2 and WebGPU; context-loss recovery (`examples/context-recovery-lab`). |
| `tests/browser/parity-post.spec.ts` | create | Insert/reorder/remove a pass with no residue; route-health names the pass. |

### 5.2 Lane L2 — geometry (SG-03, SG-04, SG-05, AD-06, AD-07)

| File | Action | Content |
| --- | --- | --- |
| `R/geometry/Cone.ts`, `Circle.ts`, `Ring.ts`, `TorusKnot.ts`, `Polyhedron.ts`, `RoundedBox.ts` | create | Generators matching three's vertex order, index order and UV layout for identical params. `Polyhedron` covers tetra/octa/icosa/dodeca with `detail`. |
| `R/geometry/Tube.ts`, `Lathe.ts`, `Extrude.ts`, `Shape.ts` | create | Consume `@aura3d/math` `Curve`/`Shape` (L3). Until L3 merges, code against the frozen `Curve` interface in `M/Curves.ts` (B freezes the interface; see L3). `Extrude` supports `depth`, `steps`, `bevelEnabled/Thickness/Size/Segments`, `extrudePath`. |
| `R/geometry/Edges.ts`, `Wireframe.ts` | create | `EdgesGeometry` (thresholdAngle) and `WireframeGeometry` → line-segment topology (`R/Geometry.ts:93`). |
| `R/geometry/Primitives.ts` | modify | `:20` register the new kinds. |
| `R/Geometry.ts` | modify | `cone` uses the existing radiusTop/radiusBottom (`:11-22`). |
| `AA/nodes/primitives.ts` | modify | `primitives.cone/circle/ring/tube/lathe/extrude/shape/torusKnot/polyhedron/roundedBox`. |
| `AA/nodes/instances.ts` | modify | Instanced variants for the parametric kinds (cone, ring, polyhedron, roundedBox). |
| `AA/compiler/primitives.ts` | modify (except L1's dispatch line) | `:415-460` build the new kinds. |
| `AA/RootGeometry.ts` | modify | SG-05: accept `Float32Array`/`Uint16Array`/`Uint32Array`; `colors`, `groups`, `drawRange`, `morphTargets`; helpers `computeNormals`, `computeBounds`, `applyMatrix4`, `toNonIndexed`, `merge(geoms)` (over `R/MeshConsolidation.ts:109,233`). |
| `AA/nodes/geometry.ts` | modify | `geometry.dynamic(spec)`, `geometry.edges(src)`, `geometry.wireframe(src)`, `geometry.merge([...])`. |
| `AA/app/runtimeNodes.ts` | modify (L2-owned region: `setGeometry`, `updateAttribute`) | Per-frame partial upload; must not reallocate when the vertex count is unchanged. |
| `tests/unit/parity/geometry-counts.test.ts` | create | For each kind × 3 param sets: vertex count, index count and bounds equal three 0.185.1 (`three` is a devDependency at the root); positions within 1e-6. |
| `tests/unit/parity/geometry-dynamic.test.ts` | create | 10k-vertex ribbon: typed-array round trip, normals vs reference within 1e-5. |
| `tests/browser/parity-geometry.spec.ts` | create | Every new kind renders non-empty pixels in a kit scene; the dynamic ribbon updates in < 2 ms/frame. |

### 5.3 Lane L3 — math and curves (SM-01, SM-02, SM-04, AD-14)

| File | Action | Content |
| --- | --- | --- |
| `M/Curves.ts` | modify (interface frozen in B) | Abstract `Curve<V>`: `getPoint(t)`, `getPointAt(u)`, `getTangent`, `getTangentAt`, `getLength`, `getLengths(divisions)`, `getUtoTmapping`, `getSpacedPoints`, `computeFrenetFrames(segments, closed)`, `updateArcLengths`. Arc-length table is built once and cached (O(1) per lookup with a binary search on the cached table). |
| `M/curves/CatmullRomCurve3.ts` | create (move from `Curves.ts`) | `curveType: "centripetal" \| "chordal" \| "catmullrom"`, `tension`, `closed`. Port the math from `AA/world/spline.ts:74-98`. |
| `M/curves/QuadraticBezierCurve3.ts`, `CubicBezierCurve3.ts`, `LineCurve3.ts`, `LineCurve.ts`, `QuadraticBezierCurve.ts`, `CubicBezierCurve.ts`, `SplineCurve.ts`, `EllipseCurve.ts`, `ArcCurve.ts`, `CurvePath.ts`, `Path.ts`, `Shape.ts` | create | three-equivalent semantics; `Path` has `moveTo/lineTo/quadraticCurveTo/bezierCurveTo/splineThru/arc/absarc/ellipse/absellipse`; `Shape` has `holes`, `extractPoints`. |
| `M/ShapeUtils.ts` | create | `triangulateShape` (earcut), `isClockWise`, `area`. Needed by L2 Shape/Extrude. |
| `M/Line3.ts`, `M/Triangle.ts`, `M/Spherical.ts`, `M/Cylindrical.ts` | create | three method parity. |
| `M/Euler.ts` | modify | All six orders; `setFromRotationMatrix`, `setFromQuaternion`, `reorder`. |
| `M/Box3.ts`, `M/Sphere.ts`, `M/Plane.ts`, `M/Ray.ts`, `M/Frustum.ts`, `M/Matrix3.ts` | modify | Fill out three's method set: `expandByObject`-equivalent over a bounds provider, `intersectsBox/Sphere/Plane`, `distanceToPoint`, `applyMatrix4`, `Ray.intersectTriangle/Box/Sphere/Plane`, `Frustum.setFromProjectionMatrix/intersectsBox/containsPoint`, `Matrix3.getNormalMatrix`. |
| `M/MathUtils.ts` | create | `degToRad`, `radToDeg`, `clamp`, `lerp`, `damp`, `mapLinear`, `smoothstep`, `smootherstep`, `euclideanModulo`, `pingpong`, `seededRandom`, `randFloat(Spread)`, `generateUUID`, `isPowerOfTwo`. |
| `M/Color.ts` | modify | `setHSL/getHSL/offsetHSL/lerpHSL`; move the HSL parsing from `AA/color.ts:120` here and re-import it there. |
| `M/SphericalHarmonics3.ts` | create | Public SH3 matching three; `R/environment/SphericalHarmonics.ts` keeps its internals. |
| `M/OBB.ts`, `M/Capsule.ts`, `M/ConvexHull.ts`, `M/Octree.ts` | create | AD-14. Octree supports `fromGraphNode`-equivalent over triangles plus `capsuleIntersect` / `sphereIntersect` / `rayIntersect`. |
| `M/index.ts` | modify | Export all of the above. |
| `AA/world/spline.ts` | modify | Consume `M/curves` and delete the duplicated maths, keeping the presets. |
| `E/…/camera/Spline.ts` | modify | Same. |
| `tests/unit/parity/math.test.ts` | create | Property tests against three 0.185.1, 1000 seeded cases per method, tolerance 1e-9 (1e-6 for trig-heavy). |
| `tests/unit/parity/curves.test.ts` | create | CR `getPoint` within 1e-6; `getLength` within 0.1%; `getPointAt` is uniform in arc length; Frenet frames orthonormal. |

### 5.4 Lane L4 — textures and loaders (ST-01, ST-02, ST-03, ST-07, AD-03, ST-04/06/05)

| File | Action | Content |
| --- | --- | --- |
| `AA/nodes/texture.ts` | create | `texture.data({width,height,data,format,type,colorSpace})`, `.canvas({canvas,colorSpace,flipY})`, `.video({video})`, `.compressed({mipmaps,format})`, `.depth({width,height})`, `.cube(faces)`, `.dataArray({width,height,depth,data})`, `.load(url, opts)`. Returns `TextureHandle`: `wrapS`, `wrapT`, `repeat`, `offset`, `rotation`, `center`, `anisotropy`, `minFilter`, `magFilter`, `generateMipmaps`, `colorSpace`, `flipY`, `needsUpdate`, `dispose()`. |
| `AA/nodes/material.ts` | **not modified by L4** | Material slots already accept textures; L4 makes them accept `TextureHandle` via the `AuraTextureRef` type frozen in B. |
| `AA/compiler/textures.ts` | create | `TextureHandle` → `R/Texture.ts` + `AuraTextureSampling`/`AuraTextureTransform`. |
| `R/Texture.ts` | modify | `flipY` and colour space per user texture; `dynamic` + `source` allowed together for canvas/video (`:126`). |
| `R/webgpu/WebGPUDevice.ts` | modify | `:1879,1930` respect `revision`; replace draw-to-canvas readback (`:2402-2430`) with `copyExternalImageToTexture` (`:135`); upload every array layer (`:1885,1914`). |
| `R/webgl2/TextureUpload.ts` | modify | `:96` honour `flipY`; per-frame video upload. |
| `R/Sampler.ts`, `R/contracts/sampling.ts` | modify | Separate `wrapS/wrapT`; three's filter enum names mapped to sampler fields. |
| `AS/loaders/TextureLoader.ts` | modify | Replace the diagnostic body (`:8-12`) with a real async load over `AS/TextureLoader.ts:20`; keep three's callback signature for the codemod. |
| `AS/loaders/EXRLoader.ts` | create | Decode none/RLE/ZIPS/ZIP/PIZ, half and float; register in `R/EnvironmentPlatform.ts:291-298`. |
| `AS/loaders/FileLoader.ts`, `ImageBitmapLoader.ts`, `DataTextureLoader.ts` | create (P2) | Thin, three-signature. |
| `AA/app/createAuraApp.ts` | modify (L4-owned: options only) | `onAssetProgress`, `onAssetError` options over `AS/AssetManager.ts:65` (ST-06). |
| `examples/parity-texture-lab/main.ts` | create | Data gradient, canvas HUD updated every frame, video, cube. |
| `tests/unit/parity/texture.test.ts` | create | Handle → sampler mapping; `needsUpdate` bumps revision exactly once. |
| `tests/unit/parity/exr.test.ts` | create | Decode three's sample EXRs; pixels equal three's `EXRLoader` output. |
| `tests/unit/parity/gltf-decoders.test.ts` | create | ST-05: 3 GLBs (Draco, Meshopt, KTX2) have the same vertex/index counts as three's loaders. |
| `tests/browser/parity-texture.spec.ts` | create | Data texture equals the internal path (< 1/255); a canvas texture uploads only when `needsUpdate` (counted via `app.info`, so it depends on L7, which is fine at integration); WebGPU and WebGL2 match. |

### 5.5 Lane L5 — instancing and batching (SG-01, SG-02)

| File | Action | Content |
| --- | --- | --- |
| `AA/nodes/game/instanceTransforms.ts` | modify | Replace the matrix→spec stub (`:1-14,170`) with a direct `InstanceBufferLike` write (`R/contracts/geometry.ts:11-17`). |
| `AA/nodes/instancedMesh.ts` | create | `instances.mesh(geometry, material, count)` handle: `setMatrixAt`, `getMatrixAt`, `setColorAt`, `count`, `needsUpdate`, `computeBoundingSphere`. |
| `R/renderer/CullingBatching.ts` | modify | `:402` detect `WEBGL_multi_draw` / WebGPU indirect; enable `multiDrawAvailable`. |
| `R/batching/StaticMergePlanner.ts` | modify | `:97,324` implement the `multi-draw-generator-pending` path. |
| `R/batching/MultiDrawBatch.ts`, `BatchedGeometryPool.ts`, `DrawDataTexture.ts` | modify | Per-instance visibility bit, geometry id and colour; fallback to one draw per geometry when multi-draw is absent (reported in diagnostics). |
| `AA/nodes/batched.ts` | create | `batched.mesh({ maxInstances, maxVertices, maxIndices })` handle: `addGeometry`, `addInstance(geometryId)`, `setMatrixAt`, `setVisibleAt`, `setColorAt`, `deleteInstance`. |
| `tests/unit/parity/instancing.test.ts` | create | Matrix round trip; partial update range. |
| `tests/unit/rendering/batch-multidraw.test.ts` | create | Planner output with multi-draw on and off. |
| `tests/browser/parity-instancing.spec.ts` | create | 10k instances with per-instance colour, culling on/off; `batched` with 50 geometries is 1 draw (multi-draw) or ≤ 50 (fallback), and that is reported. |

### 5.6 Lane L6 — lines, points, sprites, helpers (SG-06, SG-07, SG-08, AD-08, SC-03)

| File | Action | Content |
| --- | --- | --- |
| `AA/nodes/lines.ts` | create | `lines.line/loop/segments({ points \| positions, colors?, material })`, `lines.fat({ width, worldUnits, dashed, dashSize, gapSize, dashOffset })`; `computeLineDistances` automatic when dashed. Built on `R/ScreenSpaceLineMaterial.ts` and `R/Geometry.ts:120,162`. |
| `AA/nodes/points.ts` | create | `points({ positions, colors?, size, sizeAttenuation, map?, alphaTest, transparent })`. |
| `R/UnlitMaterial.ts` | modify | `:7` point size attenuation + `map` + `alphaTest`. Lift the 128 cap where the device allows. |
| `AA/nodes/sprites.ts` | create | `sprite({ map, center, rotation, sizeAttenuation, color })` over `R/SpriteFlipbook.ts:13-38`. |
| `AA/nodes/helpers.ts` | create (P2) | `helpers.axes/grid/polarGrid/box/box3/arrow/camera/directionalLight/spotLight/pointLight/skeleton` on `lines.*`. |
| `AA/compiler/lines.ts` | create | `kind: "line" \| "points" \| "sprite"` → render items. |
| `tests/unit/parity/lines.test.ts` | create | Line distances match three's `computeLineDistances`. |
| `tests/browser/parity-lines.spec.ts` | create | Fat line pixel width is stable across DPR 1/2; dashes visible; points attenuate with distance. |

### 5.7 Lane L7 — scene, renderer and runtime (SH-05, SH-06, SH-08, SG-09, SG-10/SR-06, SR-01/02/03/04/05/07/08, SC-01, AD-15, AD-16)

| File | Action | Content |
| --- | --- | --- |
| `R/Renderer.ts` | modify | `setPixelRatio`, `setClearColor`, `info` getter; `render({ target })` overload (SH-06); camera layer mask in `collectRenderItems` (SR-04). |
| `R/RenderDevice.ts` | modify | Viewport/scissor (SC-01 Array/Stereo; P2). |
| `R/output/ToneMappingOperators.glsl.ts` | modify | `:201-204` add Cineon (match `R/post/ToneOperators.ts:39`). |
| `R/ForwardPass.ts` | modify | Per-material fog uniform (SR-02). |
| `AA/app/createAuraApp.ts` | modify (L7-owned: runtime members) | Wire `app.precompile` (SR-07), `app.info` (SR-05), `app.setPixelRatio`, `app.setClearColor`. |
| `AA/app/runtimeNodes.ts` | modify (L7-owned region: transform/graph members) | `renderOrder`, `frustumCulled`, `layers`, `userData`, `traverse`, `getWorldPosition/Quaternion/Scale`, `attach` (over `S/SceneNode.ts:43-53`). |
| `S/SceneNode.ts` | modify | `frustumCulled`, `onBeforeRender` (P2). |
| `S/Layers.ts` | modify | Instantiate from nodes; `enable/disable/test`. |
| `AA/nodes/scene.ts` | modify | `background({ texture \| cube \| color })` without IBL. |
| `AA/SceneQueries.ts` | modify | `raycast({ origin, direction } \| { camera, ndc }, { firstHitOnly, recursive, layers, near, far })`. |
| `AA/Clock.ts` | create | `Clock` over `AA/FrameLoop.ts`. |
| `AA/nodes/cameras.ts` | create | `cameras.cube({ resolution, near, far, updateEvery })` → cube render target via `Renderer.renderProbeFace` (`R/Renderer.ts:536`), consumable as `envMap` by `material.*`. |
| `AA/nodes/surfaces.ts` | create | `surfaces.mirror({ size, resolution, tint })` over `R/PlanarReflection.ts` / `R/ReflectionSurfaces.ts:73` (AD-15). |
| `AA/nodes/lights.ts` | modify (P2) | `lights.rectArea` over `S/RectAreaLight.ts` + LTC (AD-16). |
| `docs/architecture/root-export-dispositions.json` | **not modified by L7** | B already reserved the names; integration flips them to `public`. |
| `tests/unit/parity/runtime.test.ts` | create | Clock, info shape, layers mask, raycast options. |
| `tests/browser/parity-runtime.spec.ts` | create | Fog opt-out on one mesh; texture background; cube camera reflection changes when a coloured object moves; mirror renders. |
| `tests/browser/parity-disposal.spec.ts` | create | 20 load/unload cycles; `getDiagnostics()` `approximateGpuMemoryBytes`, `textures`, `buffers`, `renderTargets` within 5% of cycle 1. |

### 5.8 Lane L8 — animation (SA-01..06, SM-03)

| File | Action | Content |
| --- | --- | --- |
| `AN/AnimationAction.ts` | modify | `clampWhenFinished` (`:143-147`), negative `timeScale` (`:70`), `repetitions`, `finished`/`loop` events. |
| `AN/AnimationMixer.ts` | modify | Emit `finished` from the low-level mixer. |
| `AN/PropertyBinding.ts` | create | Parse `nodeName.property[index]`, `.morphTargetInfluences[name]`, `.material.prop`, uuid and escaped names; used by `AN/SceneAnimationBridge.ts:26-43`. |
| `AN/AnimationObjectGroup.ts` | create (P2) | Shared bindings across N roots. |
| `AN/AnimationUtils.ts` | create | `subclip`, `optimize`, `merge`, and a public `makeClipAdditive` (moved from `AN/lanes/prd06.ts:11`). |
| `AN/AnimationTrack.ts` | modify | `color` value type; typed track constructors (`NumberKeyframeTrack` etc. as factories). |
| `AN/index.ts` | modify | Exports. |
| `AA/characters/clone.ts` | create | `cloneSkinned(model, count)` / `characters.clone`: independent skeletons, shared parse cache **and shared GPU textures** (today textures are re-created per clone). |
| `AA/nodes/types/runtime.ts` | **not modified** (B froze the members) | — |
| `tests/unit/parity/animation.test.ts` | create | Loop modes, clamp, negative timeScale, `finished` fires once; PropertyBinding parse table. |
| `tests/browser/parity-animation.spec.ts` | create | 10 clones with independent mixers: bone transforms differ per clone in a rendered frame; texture bytes stay flat from 1 to 10 clones. |

### 5.9 Lane L9 — audio (AU-01..04)

| File | Action | Content |
| --- | --- | --- |
| `AU/PositionalEmitter.ts` | modify | **First:** remove the double attenuation (`:263-264`): either panner-only or software-only, chosen by `distanceModel`. Then cone gain. |
| `AU/SpatialAudio.ts` | modify | `distanceModel: "inverse"\|"linear"\|"exponential"` on the panner (`:18-22`); `coneInnerAngle`, `coneOuterAngle`, `coneOuterGain`, `orientation`. |
| `AU/AudioListener.ts` | modify | Write to `ctx.listener` (`:7-16`); keep `game-sound/listenerSync.ts` as the frame driver. |
| `AU/AudioAnalyser.ts` | create | `createAnalyser(source, fftSize)`: `getFrequencyData`, `getAverageFrequency`. |
| `AU/AudioContextManager.ts` | modify | Add `createAnalyser` to `AudioContextLike` (`:3-15`). |
| `AU/index.ts` | modify | Exports. |
| `tests/unit/audio/spatial-attenuation.test.ts` | create | Gain at distance d equals the Web Audio formula for each model, applied once (regression for C10). |
| `tests/unit/audio/analyser.test.ts` | create | A fake `AnalyserNode` round trip. |
| `tests/browser/parity-audio.spec.ts` | create | `OfflineAudioContext` render: cone attenuates behind the source; analyser average tracks an oscillator. |

### 5.10 Lane L10 — probes, codemod, docs (§9 probes, AD-01, AD-04/05, SC-02, AU-04, SH-07, AD-12)

| File | Action | Content |
| --- | --- | --- |
| `tools/crayon-probe/index.ts` | create | One CDP session per game; records P-1..P-4 (§9) as JSON under `evidence/crayon-probes/<game>.json`. Runs remotely. |
| `CLI/migrate-three/mappings.ts` | modify | One row per newly public API, labelled honestly; a row is added **only** when its lane's fixture is green (CI asserts every row's target symbol exists in `aura.exports.json`). |
| `CLI/migrate-three/ImportMap.ts` | modify | Unblock `UnrealBloomPass`/`ShaderPass` specifiers only once SH-03 rows exist; add exclusion warnings for AD-04/AD-05. |
| `CLI/migrate-three/CompatibilityWarnings.ts` | modify | Warnings for WebGPU-only APIs (SH-04, WGSL post) and exclusions. |
| `tests/unit/aura3d-cli/migrate-three.test.ts` | modify | Golden migrations for one small Crayon module (Strange Orbit, 19 KB). |
| `docs/api/public-api.md` | modify | Document each new export (each lane drafts its section in its PR description; L10 merges them). |
| `docs/workflows/crayon-game-reverse-engineering.md` | modify | §"parity gate" column: replace v1 IDs/claims with this PRD's verdicts. |

### 5.11 File ownership (single writer)

| Shared file | Owner | Others |
| --- | --- | --- |
| `AA/nodes/types.ts`, `AA/nodes/types/runtime.ts`, `E/contracts/*.ts`, `root-export-dispositions.json`, `aura.exports.json`, `E/public/renderer.ts` (type reservations) | **B** | read-only until §7.3 |
| `AA/app/runtimeNodes.ts` | split by region: L1 `setUniform`, L2 `setGeometry/updateAttribute`, L7 transform/graph | Region markers added by B (`// region parity:<lane>`) |
| `AA/app/createAuraApp.ts` | L7 runtime members; L4 asset options only | Region markers added by B |
| `AA/compiler/primitives.ts` | L2; L1 owns the single `custom` dispatch line | — |
| `AA/nodes/material.ts` | L1 | L4 does not touch it |
| `E/public/renderer.ts` (value exports) | L1 | L4 and L7 add theirs at integration |
| `CLI/migrate-three/*` | L10 | — |
| `R/Renderer.ts` | L7 | — |
| `R/webgpu/WebGPUDevice.ts` | L4 | — |

---

## 6. Task list

Each task has an ID, owner lane, size (S ≤ 1 day, M ≤ 3 days, L ≤ 2 weeks),
dependencies, and acceptance criteria. Lanes L1–L10 start together once B merges.
Within a lane the order is as listed. The only cross-lane dependencies are
marked; each one has a stub, so no lane waits.

### Lane B — bootstrap

| Task | Size | Description | Acceptance |
| --- | --- | --- | --- |
| B-01 | M | Freeze contracts in `types.ts`, `runtime.ts`, `post.ts`, `output.ts`, plus dispositions (§5.0) | `pnpm typecheck` green; every new kind returns a "not yet implemented" validate error |
| B-02 | S | Add the `A3D_PARITY_*` flags | flags appear in `flags.state.ts`; unit test reads them |
| B-03 | M | Repair `check:release`: define or remove the 26 missing sub-scripts | `pnpm check:release` runs to completion (green or with real failures, never "missing script") |
| B-04 | S | Fix `createThreeCompatRenderer` in `ThreeToA3DAdapter.ts:18` | migrate-three test asserts `createAuraApp` |
| B-05 | S | Region markers in `runtimeNodes.ts` and `createAuraApp.ts`; `tests/unit/parity/README.md` | markers present; README lists fixture rules |
| B-06 | S | Freeze the `Curve<V>` interface in `M/Curves.ts` so L2 can code against it | interface exported; existing tests green |

### Lane L1 — shading

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L1-01 | M | B-01 | `material.custom` spec, validation, WGSL-only rejection | `shader-material.test.ts` green |
| L1-02 | M | L1-01 | `compiler/customMaterial.ts` → `PortableShaderMaterial`, built-in uniforms | pixel delta between uniform values on WebGL2 in `parity-shader.spec.ts` |
| L1-03 | S | L1-02 | `handle.setUniform` with no recompile | program count unchanged across 100 updates (`app.info` once L7-03 lands; stub counter until then) |
| L1-04 | S | L1-02 | WGSL execution path on `Renderer.create({backend:"webgpu"})` | same spec renders on WebGPU |
| L1-05 | M | B-01 | `effects.shaderPass` + order slots in `v2Stages.ts` | `shader-pass-order.test.ts`; `parity-post.spec.ts` delta and removal with no residue |
| L1-06 | M | L1-05 | WGSL post on WebGPU (`WebGPUPostProcess.ts`) + diagnostic when absent | WebGPU post fixture green |
| L1-07 | S | — | `registerShaderChunk` + `#include` resolution | include test green; duplicate-name error |
| L1-08 | S | L1-02, L1-07 | Public exports in `E/public/renderer.ts` | `check:public-api` green |
| L1-09 | S | L1-02 | Context-loss survival | `context-recovery-lab` case green |
| L1-10 | M (P2) | L1-02 | `patch` hook (SH-09) | chunk-replaced material renders; cache key changes |
| L1-11 | L (gated) | P-1 | TSL subset emitter | starts only if P-1 says ≥3 games; else closed as "not needed" |
| L1-12 | L (P2) | `A3D_QR_WEBGPU` | Public compute | deferred |

### Lane L2 — geometry

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L2-01 | M | B-01 | cone, circle, ring, torusKnot, polyhedron ×4, roundedBox generators + `primitives.*` + `instances.*` | `geometry-counts.test.ts` equals three for 3 param sets each |
| L2-02 | L | B-06 (stub) / L3-02 (real) | tube, lathe, shape, extrude (with bevel and `extrudePath`) | counts equal three; renders in kit scene |
| L2-03 | M | B-01 | `geometry.dynamic` typed arrays, colours, groups, drawRange | round trip test |
| L2-04 | M | L2-03 | `setGeometry` / `updateAttribute` per-frame, no realloc | 10k-vertex ribbon < 2 ms/frame at 60 fps |
| L2-05 | S | L2-03 | `computeNormals/Bounds`, `applyMatrix4`, `toNonIndexed`, `merge` | within 1e-5 of three's `BufferGeometryUtils` |
| L2-06 | S | L2-01 | `geometry.edges`, `geometry.wireframe` | segment counts equal three |
| L2-07 | S | L3-07 | Convex hull geometry (AD-07) | hull of a 1k-point cloud equals three's face count |

### Lane L3 — math and curves

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L3-01 | M | B-06 | Curve base with arc-length cache + Frenet frames | `curves.test.ts` base cases |
| L3-02 | M | L3-01 | CR (3 types), Bezier 2D/3D, Line 2D/3D, Spline, Ellipse, Arc, CurvePath, Path, Shape, ShapeUtils | within 1e-6 of three; length within 0.1% |
| L3-03 | S | L3-02 | Port `world/spline.ts` and camera `Spline.ts` onto `M/curves` | existing world and camera tests unchanged |
| L3-04 | M | — | Line3, Triangle, Spherical, Cylindrical; Euler 6 orders | `math.test.ts` within 1e-9 |
| L3-05 | M | — | Box3/Sphere/Plane/Ray/Frustum/Matrix3 method parity | `math.test.ts` |
| L3-06 | S | — | MathUtils, Color HSL, SphericalHarmonics3 | `math.test.ts` |
| L3-07 | L | L3-05 | OBB, Capsule, ConvexHull, Octree | Octree capsule sweep equals three's on a fixture level |

### Lane L4 — textures and loaders

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L4-01 | M | B-01 | `texture.*` namespace + `TextureHandle` + compiler | `texture.test.ts` |
| L4-02 | M | L4-01 | WebGPU: revision check, `copyExternalImageToTexture`, all array layers | `parity-texture.spec.ts` WebGPU = WebGL2 |
| L4-03 | S | L4-01 | WebGL2: `flipY`, video per-frame upload | canvas texture updates only on `needsUpdate` |
| L4-04 | S | L4-01 | Separate `wrapS/wrapT` + filter enum mapping | unit test |
| L4-05 | S | L4-01 | Real `texture.load` / `TextureLoader` | async load test; `dispose()` frees (device texture count −1) |
| L4-06 | M | — | EXR decoder | `exr.test.ts` equals three |
| L4-07 | S | — | GLTF decoder parity fixture (ST-05) | `gltf-decoders.test.ts` |
| L4-08 | S (P2) | — | `onAssetProgress/onAssetError`; File/ImageBitmap/DataTexture loaders | unit tests |

### Lane L5 — instancing and batching

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L5-01 | M | B-01 | Direct GPU instance-buffer write in `instanceTransforms.ts` | 10k matrix update < 1 ms CPU |
| L5-02 | S | L5-01 | `instances.mesh` handle (setMatrixAt/ColorAt/count) | `instancing.test.ts` |
| L5-03 | L | — | Multi-draw detection + `StaticMergePlanner` generator path | `batch-multidraw.test.ts` |
| L5-04 | M | L5-03 | `batched.mesh` handle with visibility/colour/delete | `parity-instancing.spec.ts` draw count reported |
| L5-05 | — | P-2 | Promote SG-02 to ● for HEATSINK / Drift / Roadster only if P-2 shows `isBatchedMesh` at runtime | probe JSON cited in §7 |

### Lane L6 — lines, points, sprites, helpers

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L6-01 | M | B-01 | `lines.*` thin + fat + dashed | `lines.test.ts`; `parity-lines.spec.ts` |
| L6-02 | S | B-01 | `points` with attenuation/map/alphaTest | attenuation pixel test |
| L6-03 | S | B-01 | `sprite` with rotation/center | rotated sprite pixel test |
| L6-04 | M (P2) | L6-01 | `helpers.*` | each helper renders |

### Lane L7 — scene, renderer and runtime

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L7-01 | S | B-01 | `setPixelRatio`, `setClearColor` on Renderer and app | unit test |
| L7-02 | S | B-01 | Cineon tone mapping | matches CPU reference within 1/255 |
| L7-03 | S | B-01 | `app.info` / `renderer.info` | `runtime.test.ts` shape test |
| L7-04 | S | B-01 | Wire `app.precompile` | first-frame compile count = 0 after precompile |
| L7-05 | S | B-01 | Per-material fog opt-out | fog-off mesh pixel equals no-fog baseline |
| L7-06 | M | B-01 | Node handle graph members (renderOrder, layers, traverse, world getters, attach) | unit tests |
| L7-07 | M | L7-06 | Camera layer mask (SR-04) | masked node absent from frame |
| L7-08 | S | B-01 | Public `raycast` with options | `runtime.test.ts` |
| L7-09 | S | B-01 | `Clock` | unit test |
| L7-10 | S | B-01 | Texture/cube background without IBL | pixel test |
| L7-11 | M | B-01 | `render({target})` + public `RenderTarget` | render-to-texture used as a material map |
| L7-12 | M | L7-11 | `cameras.cube` | reflection changes when an object moves |
| L7-13 | S | B-01 | `surfaces.mirror` | mirror renders the reflected object |
| L7-14 | M | B-01 | `parity-disposal` soak | 20 cycles within 5% |
| L7-15 | M (P2) | — | Viewport/scissor, ArrayCamera, StereoCamera; `lights.rectArea`; mixed-child LOD; `overrideMaterial` | per-item tests |

### Lane L8 — animation

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L8-01 | S | — | clampWhenFinished, negative timeScale, repetitions, finished event | `animation.test.ts` |
| L8-02 | M | — | PropertyBinding parser | parse table equals three's `PropertyBinding.parseTrackName` |
| L8-03 | S | — | Colour tracks + typed track factories | unit |
| L8-04 | M | — | `cloneSkinned` with shared textures | `parity-animation.spec.ts` 10 clones |
| L8-05 | S | — | `morphTargetDictionary`; opt-in unclamped weights | unit |
| L8-06 | S (P2) | — | AnimationUtils, AnimationObjectGroup | unit |

### Lane L9 — audio

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L9-01 | S | — | **Fix double attenuation** | `spatial-attenuation.test.ts` |
| L9-02 | S | L9-01 | Panner distanceModel + cone + orientation | offline render test |
| L9-03 | S | — | `AudioListener` drives `ctx.listener` | unit |
| L9-04 | S (P2) | — | `AudioAnalyser` | `analyser.test.ts` |

### Lane L10 — probes, codemod, docs

| Task | Size | Depends | Description | Acceptance |
| --- | --- | --- | --- | --- |
| L10-01 | M | — | `tools/crayon-probe`: answer P-1..P-4 for all 10 games (remote) | 10 JSON files in `evidence/crayon-probes/`; §9 table filled |
| L10-02 | S | L10-01 | Re-rank SH-01 and SG-02 and update §7 | doc diff cites probe files |
| L10-03 | M | each lane's fixture | Codemod rows per newly public API | CI: every mapping target exists in `aura.exports.json` |
| L10-04 | S | L1-05 | Unblock post specifiers in `ImportMap.ts` | migrate-three golden |
| L10-05 | S | — | Exclusion warnings (AD-04/05, WebGPU-only) | warnings test |
| L10-06 | M | L10-03 | Strange Orbit golden migration with 0 `TODO(a3d-migrate)` in game logic | golden test |
| L10-07 | S | — | `docs/api/public-api.md` + crayon doc parity column | `check:public-api` green |

---

## 7. Per-game gate

### 7.1 Dependency matrix

`●` = blocking, `○` = useful, blank = not needed. Columns are the IDs still
open after verification. SH-07, SR-09 and ST-05 are closed and dropped. Every
cell is **inferred** until L10-01 records probe evidence.

| Game | SH-02 | SH-03 | SG-02 | SG-03 | SG-05 | SM-02 | ST-01/03 | SA-04 | AU-02 | SR-02 opt-out | First phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Strange Orbit | ○ | ○ | ○ | ● | ● | ● | ● |  | ○ | ○ | A |
| Splat Rush |  |  |  | ○ | ○ | ○ | ● |  | ○ |  | A |
| Saiyan Snake Way | ○ |  |  | ● | ● | ● | ○ |  | ○ | ○ | A |
| HEATSINK | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | B |
| Drift & Deliver | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | B |
| Roadster Hours | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | B |
| Ninja Runner | ● | ○ |  | ● | ● | ● | ● | ● | ● | ● | C |
| Where the Wind Wanders | ● | ○ | ○ | ● | ● | ● | ● |  | ● | ● | C |
| Silt & Signal | ● | ● | ○ | ● | ● | ● | ● | ● | ● | ● | D |
| Last Train to the Sea | ● | ● | ○ | ● | ● | ● | ● | ○ | ● | ● | D |

A game may start its Aura3D build when every `●` column is "engine path public +
fixture green", even if other lanes are still running.

### 7.2 Phase exits (gates, not sequencing; lanes do not wait for phases)

| Phase | Needs | Exit |
| --- | --- | --- |
| A | L2-01..05, L3-01..06, L4-01..05, L7-01/03/05/09 | Strange Orbit: a 7-lap race matches the reference capture on lap count, checkpoint order and finish time within tolerance |
| B | + L1-01..09, L5-01..04, L7-02/10/11/13 | HEATSINK rain/heat/neon frame judged "same game" in blind A/B; capture diff passes on state |
| C | + L8-01..05, L6-01..03, L9-01..03, L3-07 | Ninja Runner plays 60 s with clones, form change, combat; browser tests cover movement, restart, one win/fail |
| D | + L7-12/14, L1-11 if P-1 says so | Last Train: one town loop with day/night, passengers, tips; memory stable across 3 loops |

### 7.3 Integration checkpoint (non-blocking, weekly)

1. Rebase every lane on `main`.
2. Flip finished names in `root-export-dispositions.json` from `planned` to
   `public`; run `tools/export-surface/scaffold.ts --write`.
3. Flip the lane's `A3D_PARITY_*` flag to `default-on` only after its browser
   fixtures pass on the remote GPU runner **and** the L4-style LPIPS-vs-three
   gate shows 0 regressions.
4. Run `pnpm check:release` (requires B-03).

---

## 8. Acceptance fixtures

| Fixture | File | Proves | Runs |
| --- | --- | --- | --- |
| `parity-math` | `tests/unit/parity/math.test.ts`, `curves.test.ts` | Values equal three within 1e-9 / 1e-6; length within 0.1% | vitest, local |
| `parity-geometry` | `tests/unit/parity/geometry-counts.test.ts`, `geometry-dynamic.test.ts` | Counts/bounds equal three; dynamic update cost | vitest |
| `parity-texture` | `tests/unit/parity/texture.test.ts`, `tests/browser/parity-texture.spec.ts` | Identical pixels; upload only on `needsUpdate` | vitest + remote Playwright |
| `parity-shader` | `tests/browser/parity-shader.spec.ts` | Uniform change → pixel change; survives context loss | remote Playwright |
| `parity-post` | `tests/browser/parity-post.spec.ts` | Insert/reorder/remove, no residue; named in route-health | remote Playwright |
| `parity-instancing` | `tests/browser/parity-instancing.spec.ts` | 10k instances; batched draw count reported | remote Playwright |
| `parity-lines` | `tests/browser/parity-lines.spec.ts` | Width stable across DPR; dashes; point attenuation | remote Playwright |
| `parity-animation` | `tests/browser/parity-animation.spec.ts` | 10 clones, independent bones, flat texture memory | remote Playwright |
| `parity-audio` | `tests/unit/audio/*.test.ts`, `tests/browser/parity-audio.spec.ts` | Single attenuation; cone; analyser | vitest + remote |
| `parity-runtime` | `tests/browser/parity-runtime.spec.ts` | Fog opt-out, background, cube camera, mirror | remote Playwright |
| `parity-disposal` | `tests/browser/parity-disposal.spec.ts` | 20 cycles within 5% | remote Playwright |
| `crayon-capture` | REA shell capture + Prism in-frame HUD/control fixture + raw-CDP internals probe + `tools/webgpu-visual-parity/` | Declared scenario matches observable artifacts (HUD text, URL, storage, pixels) | remote |

Browser fixtures follow the `tests/browser/portable-custom-materials.spec.ts`
pattern: `startExampleDevServer()`, an `examples/<lab>/main.ts` page exposing
`window.__AURA_*__` hooks, `?backend=webgl2|webgpu`, screenshot hashes into
`tests/reports/<name>/`, and assertions on `diagnostics.drawCalls`.

`route-health` (`E/testing/routeHealth.ts`, `createAuraRouteHealthSnapshot`)
must name, for each port: renderer backend, fallback, primary assets, primitive
count, **parity IDs claimed**, custom passes, and known limits. Add a
`parityIds: string[]` field there (owner L10).

---

## 9. Runtime probes (L10-01)

None have been run. Record answers in this table, citing the evidence files.

These probes **cannot run through REA**, for two independent reasons:

1. REA's browser tools accept only HTTP(S) page targets. The game is an
   `about:srcdoc` iframe and is rejected with `target_unavailable` /
   `reason: target_not_allowed`.
2. REA is passive by contract — `inspect-web-page` explicitly does not evaluate
   JavaScript, and the scenario action set has no `evaluate`.

Prism's `browser_observe` can capture the HUD and `browser_press` can drive the
controls, but it also has no `Runtime.evaluate`, so it cannot inspect
`scene.traverse`, material nodes, or renderer internals.

Run each probe with raw CDP `Runtime.evaluate` on the iframe's own session
(`/json/list` → `webSocketDebuggerUrl` for the `iframe` target), after the scene
has booted. Store the returned JSON under `evidence/crayon-probes/<game>.json`.
The probe script is in
[`crayon-game-reverse-engineering.md`](./crayon-game-reverse-engineering.md)
Stage 2.

| Probe | Question | Method (CDP `Runtime.evaluate`, per game) | Changes |
| --- | --- | --- | --- |
| P-1 | Do games author node materials (TSL)? | `scene.traverse`: `material.constructor.name` ends in `NodeMaterial` **and** `fragmentNode`/`colorNode`/`positionNode` is non-null | If ≥ 3 games: start L1-11, promote SH-01 to ● for them |
| P-2 | Is `BatchedMesh` used? | `scene.traverse` for `isBatchedMesh` | Promote SG-02 to ● per game |
| P-3 | Is there an `EffectComposer` / post pipeline? | Search `window`, the renderer and closures for a composer; check for a `PostProcessing` node pipeline (r186) | If the node pipeline: SH-03 order slots must map to node-graph stages |
| P-4 | How much GLSL `ShaderMaterial`? | Count `isShaderMaterial` / `isRawShaderMaterial` | If > 0 in any game: L10 adds a GLSL-passthrough codemod row to `material.custom` (GLSL already runs on WebGL2) |

| Game | P-1 | P-2 | P-3 | P-4 | Evidence |
| --- | --- | --- | --- | --- | --- |
| Strange Orbit | yes* | yes* | yes* | yes (1 live ShaderMaterial) | `evidence/crayon-probes/strange-orbit.json` |
| Splat Rush | no | yes* | no | yes* | `evidence/crayon-probes/splat-rush.json` |
| Saiyan Snake Way | no | yes* | no | yes* | `evidence/crayon-probes/saiyan-snake-way.json` |
| HEATSINK | no | yes* | no | yes* | `evidence/crayon-probes/heatsink.json` |
| Drift & Deliver | no | yes* | no | yes* | `evidence/crayon-probes/drift-and-deliver.json` |
| Roadster Hours | no | yes* | no | yes* | `evidence/crayon-probes/roadster-hours.json` |
| Ninja Runner | no | yes* | no | yes* | `evidence/crayon-probes/ninja-runner.json` |
| Where the Wind Wanders | no | yes* | no | yes* | `evidence/crayon-probes/where-the-wind-wanders.json` |
| Silt & Signal | no | yes* | no | yes* | `evidence/crayon-probes/silt-and-signal.json` |
| Last Train to the Sea | no | yes* | no | yes* | `evidence/crayon-probes/last-train-to-the-sea.json` |

`*` = heap-class evidence only: the constructor is present in the shared
playlabs runtime bundle (all ten games load an identical importmap), but zero
live instances were found by traversal in the probed window. Strange Orbit is
the only game with live hits (1 ShaderMaterial); every other game's `yes*`
means "the shared bundle can do it", not "this game does it".

Probe-driven decisions (L10-02 re-rank):

- **P-1**: 0 games with live node materials (1 heap hit). The ≥3 trigger is
  not met — L1-11 stays unstarted and SH-01 is not promoted.
- **P-2**: `isBatchedMesh` was found **live** in 0 games; the class is heap-
  present in all ten via the shared bundle. SG-02 stays at its shipped-but-
  not-● level: implemented (`A3D_PARITY_BATCHING`), not promoted per-game.
- **P-3**: no live `EffectComposer`/`PostProcessing` anywhere (1 heap
  EffectComposer in Strange Orbit). SH-03 order slots need no node-graph
  mapping.
- **P-4**: ≥1 live `isShaderMaterial` (Strange Orbit) — the L10 GLSL-
  passthrough codemod row for `material.custom` is required.

---

## 10. Checklist

Tick only with evidence: a test path, a CI run ID, or a probe JSON.

### Bootstrap
- [ ] B-01 contracts frozen; `pnpm typecheck` green
- [ ] B-02 `A3D_PARITY_*` flags registered
- [ ] B-03 `check:release` has 0 undefined sub-scripts
- [ ] B-04 `createThreeCompatRenderer` bug fixed
- [ ] B-05 region markers + parity test README
- [ ] B-06 `Curve<V>` interface frozen

### P0 — blocks every port
- [ ] SH-02 `material.custom` renders on WebGL2 and WebGPU (`parity-shader`)
- [ ] SH-03 `effects.shaderPass` with order slots (`parity-post`)
- [ ] SG-03 all 10 new primitive kinds equal three counts (`geometry-counts`)
- [ ] SG-05 typed-array geometry + per-frame update < 2 ms (`geometry-dynamic`)
- [ ] SM-01 four new math types + Euler orders + method parity (`math`)
- [ ] SM-02 full curve family with arc length (`curves`)
- [ ] ST-01 `texture.*` namespace public (`parity-texture`)
- [ ] ST-02 texture handle semantics public (`texture.test.ts`)

### P1 — blocks at least one game
- [ ] SH-05 / SR-07 `setPixelRatio`, `setClearColor`, `precompile`
- [ ] SH-06 public `RenderTarget` + `render({target})`
- [ ] SH-08 Cineon
- [ ] SH-10 `registerShaderChunk`
- [x] SG-01 `instances.mesh` handle on a real GPU write path (parity-L5)
- [x] SG-02 `batched.mesh` implemented (parity-L5); promotion to ● still gated on probe P-2 (L5-05)
- [ ] SG-04 edges / wireframe
- [ ] SG-06 / AD-08 `lines.*` incl. fat + dashed
- [ ] SG-07 `points` attenuation/map/alphaTest
- [ ] SG-09 handle graph members
- [ ] SG-10 / SR-06 texture/cube background
- [ ] SM-03 colour tracks + typed factories
- [ ] SM-04 MathUtils, HSL, SH3
- [ ] ST-03 runtime canvas/video upload on both backends
- [ ] ST-07 real `texture.load`
- [ ] AD-03 EXR
- [ ] SA-01 clamp / negative timeScale / finished
- [ ] SA-03 PropertyBinding
- [ ] SA-04 `cloneSkinned` with shared textures
- [ ] SA-05 morph dictionary
- [ ] AU-01 listener writes `ctx.listener`
- [ ] AU-02 double attenuation fixed; cone + distanceModel
- [ ] SR-01 Clock
- [ ] SR-02 per-material fog opt-out
- [ ] SR-03 public raycast with options
- [ ] SR-05 `app.info`
- [ ] SR-08 disposal soak green
- [ ] SC-01 `cameras.cube`
- [ ] AD-14 OBB / Capsule / ConvexHull / Octree
- [ ] AD-15 `surfaces.mirror`

### P2 — completeness
- [ ] SH-01 TSL subset (or closed by P-1)
- [ ] SH-04 compute (after `A3D_QR_WEBGPU`)
- [ ] SH-09 material `patch`
- [ ] SG-08 sprites
- [ ] SG-11 mixed-child LOD
- [ ] SA-02, SA-06
- [ ] AU-03 analyser
- [ ] SR-04 layers
- [ ] SC-03 helpers
- [ ] SC-04 XR buttons + render target
- [ ] ST-04 / ST-06 loaders + progress
- [ ] AD-16 `lights.rectArea`, LightProbe

### Probes and migration
- [x] P-1..P-4 recorded for all 10 games (`evidence/crayon-probes/*.json`)
- [x] §7.1 matrix re-ranked from probe evidence (§9 decisions: no live BatchedMesh/TSL/composer usage found; only Strange Orbit has a live ShaderMaterial → GLSL-passthrough row required)
- [ ] Every newly public API has an honest codemod row
- [ ] Strange Orbit golden migration has 0 `TODO(a3d-migrate)` in game logic
- [ ] `docs/api/public-api.md` documents every new export
- [ ] route-health reports `parityIds`

### Phase exits
- [ ] A — Strange Orbit 7-lap capture matches
- [ ] B — HEATSINK blind A/B "same game"
- [ ] C — Ninja Runner 60 s with clones/combat
- [ ] D — Last Train town loop, memory stable ×3

---

## 11. What "done" means

An ID is done when **all** of these are true:

1. its fixture passes (unit locally, GPU on the remote runner);
2. a real port uses it without importing `@aura3d/rendering` internals;
3. `route-health` lists it in `parityIds`;
4. the capture diff passes for the port that claims it;
5. the codemod maps to it **only** because a GPU path exists (WS-3.4);
6. `pnpm check:release` is green.

Anything less is the WS-3.4 defect with a new name.
