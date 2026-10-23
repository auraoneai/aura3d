# PRD — three.js → Aura3D Parity

**Status:** v5 · 2026-10-22. Released as **4.0.4** (npm, all 24 public packages; git tag `v4.0.4`).
The engine surface in this document is complete except: **SH-01** (TSL subset, decided
as hand-port per R-24), **Phase exits B, C, D** (game ports, dropped by decision),
the **fixed-input captures for eight games** (R-25, partial), and **real-device
verification** of WebXR, WebGPU compute and WebGPU canvas presentation (R-22).
`A3D_PARITY_BATCHING` and `A3D_PARITY_LINES` are default-on; the other four flags gate nothing.
**Supersedes:** v2 (re-verified 2026-10-21 @ `94c85e8ad`) and the v1 "Parity Backlog" draft
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

Measured per game: nine titles load three **0.184.0 / WebGL2**; HEATSINK loads
three **r186 with `WebGPURenderer`**. Importmap also pins Rapier 0.12.0; modules
> 500 KB inline three, < 100 KB import it; HEATSINK's bundle shows
`WebGPURenderer` ×12, `BatchedMesh` ×12, `InstancedMesh` ×10, `SkinnedMesh` ×11,
`PMREMGenerator` ×6, `NodeMaterial` ×4. **Symbol presence is not usage.** §9
P-1..P-4 are now recorded for all ten games (R-01/R-02), and the live capture
table records the observable HUD/control evidence.

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
open after verification. SH-07, SR-09 and ST-05 are closed and dropped.
**SH-01, SH-02, SH-03 and SG-02 were re-ranked from live probe evidence
(R-02, 2026-10-22).** The other columns are still **inferred**: no probe covers
geometry, textures, animation, audio or fog.

| Game | SH-01 | SH-02 | SH-03 | SG-02 | SG-03 | SG-05 | SM-02 | ST-01/03 | SA-04 | AU-02 | SR-02 opt-out | First phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Strange Orbit |  | ● |  |  | ● | ● | ● | ● |  | ○ | ○ | A |
| Splat Rush |  |  |  |  | ○ | ○ | ○ | ● |  | ○ |  | A |
| Saiyan Snake Way |  | ● |  |  | ● | ● | ● | ○ |  | ○ | ○ | A |
| HEATSINK | ● |  | ● |  | ● | ● | ● | ● | ○ | ● | ● | B |
| Drift & Deliver |  |  | ○ |  | ● | ● | ● | ● | ○ | ● | ● | B |
| Roadster Hours |  | ● |  | ● | ● | ● | ● | ● | ○ | ● | ● | B |
| Ninja Runner |  | ● |  |  | ● | ● | ● | ● | ● | ● | ● | C |
| Where the Wind Wanders |  | ● |  |  | ● | ● | ● | ● |  | ● | ● | C |
| Silt & Signal |  | ● |  |  | ● | ● | ● | ● | ● | ● | ● | D |
| Last Train to the Sea |  | ● |  |  | ● | ● | ● | ● | ○ | ● | ● | D |

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
| `crayon-capture` | REA shell capture + Prism `browser_eval` HUD/control fixture + raw-CDP internals probe + `tools/webgpu-visual-parity/` | Declared scenario matches observable artifacts (HUD text, URL, storage, pixels). On 2026-10-22 HEATSINK plus eight games were captured at title/menu/start/HUD or journal level; Splat Rush and Drift & Deliver also yielded exact `window.__game.CONFIG`. Roadster Hours' start click and Silt & Signal's child frame remain blocked. A fixed-input run and pixel diff are still required for every game | remote |

Browser fixtures follow the `tests/browser/portable-custom-materials.spec.ts`
pattern: `startExampleDevServer()`, an `examples/<lab>/main.ts` page exposing
`window.__AURA_*__` hooks, `?backend=webgl2|webgpu`, screenshot hashes into
`tests/reports/<name>/`, and assertions on `diagnostics.drawCalls`.

`route-health` (`createAuraRouteHealthSnapshot` in
`AA/devtools/routeHealth.ts`; `E/testing/routeHealth.ts` holds the separate
`createAuraRouteHealth` and has no parity field) must name, for each port:
renderer backend, fallback, primary assets, primitive count, **parity IDs
claimed**, custom passes, and known limits. `parityIds` ships at
`AA/devtools/routeHealth.ts:13-27`. It is caller-supplied, not derived from
what the scene actually uses.

---

## 9. Runtime probes (L10-01)

The probe results below are recorded; `*` marks a heap-class hit, not a live
instance. Add new answers to this table with the evidence file path.

These probes **cannot run through REA**, for two independent reasons:

1. REA's browser tools accept only HTTP(S) page targets. The game is an
   `about:srcdoc` iframe and is rejected with `target_unavailable` /
   `reason: target_not_allowed`.
2. REA is passive by contract — `inspect-web-page` explicitly does not evaluate
   JavaScript, and the scenario action set has no `evaluate`.

Prism's `browser_observe` can capture the HUD and `browser_press` can drive the
controls; on HEATSINK this was verified on 2026-10-22 with a 1.39 s title
snapshot, 1/60 s `hold_ms` steps, automatic `KeyW` for action keys, idle physics
frozen between calls, and fully converged HUD values (`Escape` → `Resume` and
idle observe byte-identical). **Update (2026-10-22): Prism now exposes
`browser_eval(session_id, expression, frame_index?, await_promise?)`.** It can
evaluate `window.__game`, `window.__orbit`, HUD DOM, and `window.__prism_srcdoc`
inside the game's `about:srcdoc` frame, so runtime capture no longer needs raw
CDP. Use `frame_index: null` to auto-target the child frame, or an explicit index
when several frames exist. `browser_eval` alone can leave countdowns and timers
frozen; pair it with `browser_press` to step the WebGL2 RAF bridge. Silt &
Signal is the exception: its child frame times out, and
`document.querySelector('iframe').srcdoc` from frame 0 is the only usable
fallback (205,683 chars captured).

Run P-1..P-4 with raw CDP `Runtime.evaluate` on the iframe's own session
(`/json/list` → `webSocketDebuggerUrl` for the `iframe` target), after the scene
has booted, because the probe must inject a `renderer.render` hook before boot.
Use `browser_eval` for the visible HUD/control fixture. Store probe JSON under
`evidence/crayon-probes/<game>.json` and capture JSON under
`evidence/crayon-runtime/<game>/session.json`. The probe script is in
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
| Strange Orbit | no (module) | no (live) | no (module) | **yes, 6 live ShaderMaterial** | `evidence/crayon-probes/strange-orbit.json` |
| Splat Rush | no (module) | no (live) | no (module) | no (0 live) | `evidence/crayon-probes/splat-rush.json` |
| Saiyan Snake Way | no (module) | no (live) | no (module) | **yes, 3 live** | `evidence/crayon-probes/saiyan-snake-way.json` |
| HEATSINK | **yes, 49 live node materials** (three r184+r186, `WebGPURenderer`) | no (live) | inconclusive | no (0 live) | `evidence/crayon-probes/heatsink.json` |
| Drift & Deliver | no (module) | no (live) | **yes (module)**: `EffectComposer.js` fetched, instance not reachable | no (0 live) | `evidence/crayon-probes/drift-and-deliver.json` |
| Roadster Hours | no (module) | **yes, 68 live BatchedMesh** | no (module) | **yes, 29 live** | `evidence/crayon-probes/roadster-hours.json` |
| Ninja Runner | no (module) | no (live) | no (module) | **yes, 11 live** | `evidence/crayon-probes/ninja-runner.json` |
| Where the Wind Wanders | no (module) | no (live) | no (module) | **yes, 67 live** | `evidence/crayon-probes/where-the-wind-wanders.json` |
| Silt & Signal | no (module) | no (live) | no (module) | **yes, 14 live** | `evidence/crayon-probes/silt-and-signal.json` |
| Last Train to the Sea | no (module) | no (live) | no (module) | **yes, 6 live** | `evidence/crayon-probes/last-train-to-the-sea.json` |

**Basis** (schema `a3d-crayon-probe/2`): `live` means a populated scene
traversal counted it; `module` means the game's module and importmap prove the
class cannot be constructed (for example, no `three/webgpu` or `three/tsl` was
requested). Each verdict carries its `basis` in the JSON.

> **R-01 (2026-10-22) replaced the earlier probe run.** The first run found no
> live scene in 9 of 10 games (`contextFound:false`) and 0 scenes in Strange
> Orbit, so its "0 live" answers were unverified. The new probe injects a hook
> before game boot (`context.addInitScript`, which reaches the `about:srcdoc`
> frame) that captures the live `Scene` from three's constructors, then
> traverses it. All 10 games now report `contextFound:true`, 1-3 scenes and
> 494-10,724 objects, no errors (ACR Tasks run `cc1an`, serverless). Heap-class
> hits are no longer used as evidence. The old heap `EffectComposer` hit in
> Strange Orbit came from the probe loading the addon itself.
>
> **Caveats:** `roadster-hours` and `silt-and-signal` had `sceneSettled:false`,
> so their object counts (and the BatchedMesh count) are lower bounds. HEATSINK
> P-3 is inconclusive: its WebGPU path may use a node `PostProcessing` pipeline
> the probe cannot see.

**Live capture coverage (Prism `browser_eval`, 2026-10-22).** This is visible
behaviour, not parity proof; every row still needs a fixed-input run and pixel
diff.

| Game | Menu/title | Start | HUD/state | Exact tuning | Capture evidence |
| --- | --- | --- | --- | --- | --- |
| Last Train to the Sea | yes | Driver ID → first departure | `Mango Tide`, `0 / 12 aboard` | no | `evidence/crayon-runtime/last-train-to-the-sea/session.json` |
| Where the Wind Wanders | yes | direct boot | `0 / 3`, full journal | no | `evidence/crayon-runtime/where-the-wind-wanders/session.json` |
| Saiyan Snake Way | yes | `Enter` | `27,649 km`, `360 DAYS`, `RUN SCORE 110` | no | `evidence/crayon-runtime/saiyan-snake-way/session.json` |
| HEATSINK | yes | `Start Race` | converged telemetry | HUD only | existing HEATSINK fixture |
| Silt & Signal | outer page only | **blocked** | **blocked** | no | `evidence/crayon-runtime/silt-and-signal/session.json` |
| Drift & Deliver | yes | cutscene skip | `15 KM/H`, `x0 STREAK`, `BUSTED` | `window.__game.CONFIG` | `evidence/crayon-runtime/drift-and-deliver/session.json` |
| Strange Orbit | yes | `RACE` → `Racer` → `LET’S RIDE` | `Lap 1 / 7`, `46 KM/H` | rescue budget only | `evidence/crayon-runtime/strange-orbit/session.json` |
| Roadster Hours | yes | **click timeout** | **blocked** | no | `evidence/crayon-runtime/roadster-hours/session.json` |
| Splat Rush | yes | `PLAY NOW` | `SCORE 27` | full `CONFIG` | `evidence/crayon-runtime/splat-rush/session.json` |
| Ninja Runner | yes | `Enter the Village` | `59 m`, `265 / 300`, 4 health | ability costs | `evidence/crayon-runtime/ninja-runner/session.json` |

Probe-driven decisions (R-02 re-rank, 2026-10-22). These replace the earlier
provisional ones:

- **P-1 (TSL):** 1 game (HEATSINK, 49 live node materials). The ≥3-game trigger
  for L1-11 is **not met**, so L1-11 stays unstarted as a general feature. But
  HEATSINK is a Phase B game, so **SH-01 is a blocker for Phase B** unless its
  materials are hand-ported to `material.custom`. That choice is open (R-24).
- **P-2 (BatchedMesh):** 1 game (Roadster Hours, 68 live). SG-02 is promoted to
  ● for Roadster Hours only. HEATSINK and Drift & Deliver no longer need it.
  Implementation exists behind `A3D_PARITY_BATCHING` (L5-05 satisfied for the
  promotion decision).
- **P-3 (post pipeline):** no live composer anywhere. Drift & Deliver's module
  loads `EffectComposer` but no instance was reachable. HEATSINK is
  inconclusive. SH-03 is needed by Drift & Deliver (useful) and possibly
  HEATSINK; the other eight games need no post graph mapping.
- **P-4 (ShaderMaterial):** 7 of 10 games use live GLSL `ShaderMaterial`
  (Strange Orbit 6, Saiyan 3, Last Train 6, Ninja 11, Roadster 29, Silt 14,
  Wind 67). The `ShaderMaterial` → `material.custom` codemod row
  (`mappings.ts:104-105`) is **required**. SH-02 is ● for those seven, not
  for HEATSINK, Drift & Deliver or Splat Rush.

---

## 10. Checklist

Tick only with evidence: a test path, a CI run ID, or a probe JSON.

**2026-10-22 audit:** every box below was re-checked against source. A box was
unticked when the code exists but the §6 acceptance evidence does not, or
when the evidence cited was wrong. Each unticked box names its §12 task.
Unit suites run for the audit: `tests/unit/parity/*` all green (≈330 tests);
browser specs were not re-run (remote-only).

**Global caveat:** `A3D_PARITY_BATCHING` and `A3D_PARITY_LINES` are
default-on since 2026-10-22 (R-17), so `instances.mesh`, `batched.mesh`,
`lines.*`, `points`, `sprites` and `helpers.*` work in a default app. The other
four `A3D_PARITY_*` flags are read nowhere and remain `"dev"`. A ticked box
means "implemented and tested".

### Bootstrap
- [x] B-01 contracts frozen; `pnpm typecheck` green
- [x] B-02 `A3D_PARITY_*` flags registered (`packages/engine/src/contracts/flags.ts`; `l0-flags.test.ts`)
- [x] B-03 `check:release` has 0 undefined sub-scripts (`marketing/check:version` was the last missing one; now `node scripts/check-version.mjs`)
- [x] B-04 `createThreeCompatRenderer` bug fixed (`ThreeToA3DAdapter.ts` → `createAuraApp`)
- [x] B-05 region markers + parity test README (`tests/unit/parity/README.md`)
- [x] B-06 `Curve<V>` interface frozen (`packages/math`; `curves.test.ts`)

### P0 — blocks every port
- [x] SH-02 `material.custom` renders on WebGL2 (`parity-shader` green on ACR; routing `AA/compiler/primitives.ts:374`, `modelMaterials.ts:27`; `setUniform` without recompile `customMaterial.ts:584`). WebGPU case (R-05): the remote runner's headless Chromium/SwiftShader destroys a `GPUDevice` at the first frame presented to a WebGPU canvas (reproduced without any Aura3D code; none of 8 flag variants helped), so the spec renders to an offscreen target and checks GPU readback pixels there (ACR run `r22f-20261022T201913Z`: 3 passed). Canvas presentation on WebGPU is **not proven** on this runner (R-22)
- [x] SH-03 `effects.shaderPass` with order slots (`shader-pass-order.test.ts` 18 tests; WebGL2 bloom-order bug R-03b fixed in `v2Stages.ts`/`LegacyPost.ts`, proven by `parity-post` on ACR run `r03b2-20261022T192944Z`: halo luma 197.6 before-bloom vs 8 after-bloom/before-tonemap; WGSL custom pass + `WGSL_PROGRAM_MISSING` diagnostic in `WebGPUDevice.ts`, `webgpu-custom-pass.test.ts` 12 tests; R-03, R-04)
- [x] SG-03 all 10 new primitive kinds equal three counts (`geometry-counts`; `parity-geometry` green — all kinds pixel-verified)
- [x] SG-05 typed-array geometry + per-frame update < 2 ms (`geometry-dynamic`; `parity-geometry` live `updateAttribute`/`setGeometry` proven)
- [x] SM-01 four new math types + Euler orders + method parity (`math`)
- [x] SM-02 full curve family with arc length (`curves`)
- [x] ST-01 `texture.*` namespace public (`parity-texture` green on ACR)
- [x] ST-02 texture handle semantics public (`texture.test.ts`)

### P1 — blocks at least one game
- [x] SH-05 / SR-07 `setPixelRatio`, `setClearColor`, `precompile` (`runtime.test.ts`)
- [x] SH-06 public `RenderTarget` + `render({target})` (`createRenderTarget` value export in `E/public/renderTarget.ts`; a triangle rendered into a target is sampled as a material map in `parity-runtime.spec.ts`, ACR run `g4-runtime-20261022T202038Z`; R-06)
- [x] SH-08 Cineon (`tone-mapping.test.ts`: shipped GLSL within 1/255 of `ToneOperators.ts:39` and within 1e-9 of three's chunk; R-07)
- [x] SH-10 `registerShaderChunk` (proven in `parity-shader`: `chunkRegistered: true`)
- [x] SG-01 `instances.mesh` handle on a real GPU write path (parity-L5)
- [x] SG-02 `batched.mesh` implemented (parity-L5). Multi-draw availability now needs real device support (`WEBGL_multi_draw`); the report says `multiDrawMode:"unavailable"` otherwise and `outputDraws` equals device submissions (`batch-multidraw.test.ts` 17 tests; R-10). Promoted to ● for Roadster Hours only (P-2: 68 live BatchedMesh). Known gap: a shader that blocks merging at draw time still makes the device loop, so `outputDraws` can undercount there
- [x] SG-04 edges / wireframe (`geometry-counts.test.ts`; public `geometry.edges`/`wireframe`)
- [x] AD-06 `geometry.merge` and `geometry.toNonIndexed` public (`AA/nodes/geometry.ts`; tested against three; R-13)
- [x] AD-07 `primitives.roundedBox` and `geometry.convex(points)` (`R/geometry/Convex.ts`; counts, positions and normals equal three's `ConvexGeometry` on 3 seeded clouds; R-12)
- [x] SG-06 / AD-08 `lines.*` incl. fat + dashed (`parity-lines` green — fat DPR-stable, dash coverage drop)
- [x] SG-07 `points` attenuation/map/alphaTest (`parity-lines` green — attenuation pixel-proven)
- [x] SG-09 handle graph members (`runtime.test.ts` — layers/renderOrder/frustumCulled/traverse/attach)
- [x] SG-10 / SR-06 texture/cube background (`runtime.test.ts` plus pixel case in `parity-runtime.spec.ts`; R-08)
- [x] SM-03 colour tracks + typed factories (`animation.test.ts`)
- [x] SM-04 MathUtils, HSL, SH3 (`math.test.ts`)
- [x] ST-03 runtime canvas/video upload on both backends (`parity-texture` live repaint proven)
- [x] ST-07 real `texture.load` (`parity-texture` fetches a real PNG; `TextureLoader`→`ImageLoader` progress wired)
- [x] AD-03 EXR (`exr.test.ts`)
- [x] SA-01 clamp / negative timeScale / finished (`animation.test.ts`)
- [x] SA-03 PropertyBinding (`animation.test.ts`)
- [x] SA-04 `cloneSkinned` with shared textures (`parity-animation` green — 10 unique ids, shared texture refs flat)
- [x] SA-05 morph dictionary (`animation.test.ts`)
- [x] AU-01 listener writes `ctx.listener` (`parity-audio` green)
- [x] AU-02 double attenuation fixed; cone + distanceModel (`parity-audio` green — C10 regression)
- [x] SR-01 Clock (`runtime.test.ts`)
- [x] SR-02 per-material fog opt-out (`ForwardPass.ts:438,648`; fog-off mesh pixel case in `parity-runtime.spec.ts`; R-08)
- [x] SR-03 public raycast with options (`runtime.test.ts` — layers filter proven)
- [x] SR-05 `app.info` (`runtime.test.ts`)
- [x] SR-08 disposal (`tests/browser/parity-disposal.spec.ts`: 20 cycles, zero drift for app mount/dispose and a long-lived renderer, device counters 0 after release; ACR run `g4-runtime-20261022T202038Z`; R-09)
- [x] SC-01 `cameras.cube` (pixel case in `parity-runtime.spec.ts`: reflection changes when a coloured object moves. Needed three engine fixes: static batching dropped the cube binding, zero scene environment knobs scaled the reflection to nothing in `ForwardPass.ts`, camera `layers` never hid nodes; R-08)
- [x] AD-14 OBB / Capsule / ConvexHull / Octree (`math.test.ts`: hull face counts and vertex sets and Octree node/triangle counts plus capsule/sphere/box/ray queries equal three's, with minimum-hit-count guards; R-11)
- [x] AD-15 `surfaces.mirror` (pixel case in `parity-runtime.spec.ts`; R-08)
- [x] ST-05 GLTF decoder parity (`tests/fixtures/gltf/{draco,meshopt,ktx2}-spheres.glb`; Aura's loader and three's `GLTFLoader` give equal per-primitive vertex counts, index counts and positions for Draco and Meshopt; KTX2 matches on geometry and extension handling only, as texture transcoding needs a GPU; R-15)
- [x] L3-03 camera `Spline.ts` consumes `M/curves` (new `ClampedCatmullRomCurve3`, any alpha; duplicate derivative and `curveTypeFor` fallback deleted; also fixed an arc-length test that was failing at HEAD; R-14)

### P2 — completeness
- [ ] SH-01 TSL subset. Re-probed (R-01): 1 of 10 games authors node materials (HEATSINK, 49 live; three r184+r186, `WebGPURenderer`). The ≥3-game trigger is not met, so there is no general TSL emitter, but HEATSINK is a Phase B game and needs either hand-ported `material.custom` materials or L1-11 → **R-24 (decision)**
- [x] SH-04 public WebGPU-only `compute.*` (`packages/rendering/src/compute/`, `compute.pipeline/buffer/dispatch`, `app.compute`; WGSL required; WebGL2 apps get `compute-requires-webgpu`; `tests/unit/parity/compute.test.ts` 26 tests against a fake `GPUDevice`). Real-GPU execution is untested: the remote runner's software WebGPU cannot run it (R-22)
- [x] SH-09 material `patch` (`shader-material.test.ts` — patch chunks hash into program key)
- [x] SG-08 sprites (`parity-lines` green — billboard + rotation pixel-proven)
- [x] SG-11 mixed-child LOD — `groups.lod({levels, hysteresis})` ships arbitrary subtrees per level (`lodMarkers.ts` + renderInput per-frame visibility; `runtime.test.ts` SG-11 block)
- [x] SA-02, SA-06 (`animation.test.ts`)
- [x] AU-03 analyser (`AudioAnalyser.ts` + `parity-audio` spec)
- [x] SR-04 layers (`camera.perspective({ layers })` now hides non-intersecting nodes; pixel case in `parity-runtime.spec.ts` plus unit tests that fail without the fix; R-08)
- [x] SC-03 helpers (`parity-lines` green — helper glyphs pixel-proven)
- [x] SC-04 `xr.button()` + `app.xr` (`packages/engine/src/agent-api/xr/`, `WebXRSessionController` session/reference-space getters; per-view rendering via `setExternalFramebuffer` and a persistent `setViewport` on `RenderDevice`/`WebGL2Device`; `xr.test.ts` 31 tests with fake XR objects). Not verified on a headset or real browser
- [x] SG-10 `scene().overrideMaterial(spec | null)` (`override-material.test.ts` 17 tests; primitives, models, instances, LOD, `batched.mesh`; not applied to lines, points, sprites, character parts or nodes added after mount)
- [x] AD-15 Lensflare `lights.lensFlare` (`lens-flare.test.ts` 25 tests; placement follows three's formula; no depth-occlusion fade because the engine has no depth readback)
- [x] SC-01 / L7-15 `cameras.array`, `cameras.stereo`, viewport and scissor (`viewport-views.test.ts`; stereo eye matrices equal three's `StereoCamera` within 1e-6)
- [x] ST-04 / ST-06 loaders + progress (`FileLoader`/`ImageBitmapLoader`/`DataTextureLoader` shipped; progress events wired e2e)
- [x] AD-16 `lights.rectArea` + `lights.lightProbe` — LightProbe ships public: `sh` (27 SH9 coeffs, three's band-major packing) evaluates ±direction into the hemisphere-irradiance channel (`runtime.test.ts` AD-16 block; codemod rows LightProbe/AmbientLightProbe/HemisphereLightProbe → `lights.lightProbe` approximate)

### Probes and migration
- [x] P-1..P-4 recorded for all 10 games from live scene traversal (`evidence/crayon-probes/*.json`, schema `a3d-crayon-probe/2`, all `contextFound:true`; ACR run `cc1an`; R-01). Caveat: `roadster-hours` and `silt-and-signal` scenes had not settled, so their counts are lower bounds
- [x] §7.1 matrix re-ranked from probe evidence for SH-01/SH-02/SH-03/SG-02 (R-02; see §9)
- [x] Every newly public API has an honest codemod row (`mappings.ts`; `migrate-three-mapping-targets.test.ts` now fails on any `engineImport` that is not exported; found and fixed a bad `assets` import in the `TextureLoader.load`/`AudioLoader.load` rows; stale AU-01/AU-02 notes corrected; R-16)
- [x] Strange Orbit golden migration has 0 `TODO(a3d-migrate)` in game logic (real game captured via ACR run `cc1ap`: 19,300-byte bootstrap shell plus the 864 KB logic bundle demangled to `tests/fixtures/crayon/strange-orbit/game-logic.demangled.js`, 39 three constructs, codemod row counts equal an independent census; the five custom vertex attributes are mapped to the new `attributes` geometry field, R-23). Caveat: the game's shaders still use `varying`/`texture2D`/`gl_FragColor` and need hand-porting to GLSL 300 es; the hand-written stand-in test is kept alongside the real fixture
- [x] `docs/api/public-api.md` documents every new export (texture, lines, points, sprites, batched, helpers, surfaces, Clock, raycast all `live` in dispositions; `curve` is `drop`, shipping via `@aura3d/engine/math`). Minor: `cameras` is exported with no disposition entry → **R-21**
- [x] route-health reports `parityIds` (`AA/devtools/routeHealth.ts:13-27`; caller-supplied, browser specs assert exact ID lists)

### Phase exits
- [x] A — Strange Orbit 7-lap capture matches (reference `evidence/crayon-capture/strange-orbit-reference.json`, 283.683 s finish, 7 laps, 35 checkpoints, bit-exact across 6 sessions / 4 ACR runs; `examples/strange-orbit-port/race.ts` replays the recorded 17,214-step input and reproduces finish time, all lap times and all checkpoints exactly, in Node and in the live page on ACR; GPU render passed, run `so-d-20261022T230635Z`). Caveat: simulation parity, not pixel parity; assets are procedural
- [ ] B — HEATSINK blind A/B "same game" (not attempted: a port was started and stopped by decision; needs a human-judged blind comparison)
- [ ] C — Ninja Runner 60 s with clones/combat (not attempted: port started and stopped by decision; the engine pieces it needs, `cloneSkinned` and `material.custom`, are shipped)
- [ ] D — Last Train town loop, memory stable ×3 (not attempted; the engine pieces it needs are shipped)

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

---

## 12. Remaining tasks (2026-10-22 code audit)

Source audit of every §10 box at `main` @ `1cb364c2b`. Lane ownership follows
§5.11. Sizes follow §6. Browser specs run remotely (§1.4 rule 5).

### 12.1 What the audit confirmed as done

Lane B (B-01..B-06); SH-02 (WebGL2), SH-09, SH-10; SG-03 (all 10 kinds, counts
compared live against three 0.185.1), SG-04, SG-05 (in-place upload when the
footprint is unchanged, `AA/compiler/primitives.ts:693-720`); SG-01 write path;
SM-01, SM-02, SM-03, SM-04 (1000 seeded cases per group against three); all of
L8 (SA-01..06); ST-01, ST-02, ST-03 (WebGPU revision check, external-image
copy and all-layer upload in `R/WebGPUDevice.ts:2050-2183`), ST-04, ST-06,
ST-07, AD-03 (10 real EXR fixtures against three's `EXRLoader`); AU-01..03
(double attenuation removed, `AU/PositionalEmitter.ts:384-388`); all of L6;
SH-05/SR-07 (`app.precompile` really assigned, `createAuraApp.ts:544`), SR-01,
SR-03, SR-05, SG-09, SG-11, AD-16; L10-04, L10-05; public-api docs.

### 12.2 Task list

| Task | Lane | Size | Gap | Files | Acceptance |
| --- | --- | --- | --- | --- | --- |
| **R-01** | L10 | M | Probes never reached a live scene: `contextFound:false` in 9/10, `scenes:0` in Strange Orbit. P-1..P-4 "no" answers are unverified | `tools/crayon-probe/index.ts`; `evidence/crayon-probes/*.json` | Fix scene discovery: inject before game boot on the iframe target (`Page.addScriptToEvaluateOnNewDocument` with `flatten:true`) to capture the `Scene` passed to `renderer.render`, rather than searching `window`. Each JSON has `contextFound:true`, `scenes ≥ 1`, and per-probe live counts. Run remotely |
| **R-02** | L10 | S | §7.1 matrix and §9 decisions rest on inconclusive probes | this doc §7.1, §9, §10 | Re-rank SH-01 (L1-11 trigger), SG-02 (L5-05 promotion), P-3 (node-graph post) and P-4 from R-01 output. Each decision cites a JSON path and a live count |
| **R-03** | L1 | S | Named post slots `"after-bloom"` and `"before-tonemap"` map to the same anchor and fall back to registration order | `AA/nodes/effects.post.ts:199-203`; `R/post/v2Stages.ts:336-344` | Give named slots a sort key within the anchor (`after-bloom` < numeric < `before-tonemap`) or a separate anchor. `shader-pass-order.test.ts` asserts `after-bloom` runs before `before-tonemap` when registered in reverse |
| **R-04** | L1 | M | L1-06: custom post passes compile GLSL only (`v2Stages.ts:404`); `R/webgpu/WebGPUPostProcess.ts` has no custom-pass or WGSL path and no "missing WGSL" diagnostic | `R/webgpu/WebGPUPostProcess.ts`; `R/post/v2Stages.ts` | On WebGPU, a pass with `wgsl` executes; one without emits a named diagnostic instead of being skipped. WebGPU case added to `parity-post.spec.ts` |
| **R-05** | L1 | S | L1-04: no WebGPU proof for `material.custom` WGSL | `tests/browser/parity-shader.spec.ts` | `?backend=webgpu` case: same spec, pixel delta between two uniform values, on the remote GPU runner |
| **R-06** | L7 | M | SH-06: `RenderTarget`/`Texture`/`Sampler` are type-only exports; no render-to-texture test | `E/public/renderer.ts:26`; dispositions; `tests/browser/parity-runtime.spec.ts` | Value export of `RenderTarget` (or a documented factory). Test renders to a target and samples it as a `material.*` map; the pixel differs from the no-target baseline |
| **R-07** | L7 | S | SH-08: Cineon has no acceptance test | `tests/unit/parity/runtime.test.ts` (or a new `tone-mapping.test.ts`) | GLSL Cineon output (evaluated via the shader's CPU twin or a GPU readback) is within 1/255 of `R/post/ToneOperators.ts:39` across a 64-step ramp |
| **R-08** | L7 | M | `tests/browser/parity-runtime.spec.ts` (§5.7) does not exist. SR-02, SG-10, SC-01, AD-15, SR-04 and SH-06 have only spec-shape unit tests | `tests/browser/parity-runtime.spec.ts`; `examples/parity-runtime-lab/main.ts` | Pixel cases: fog-off mesh equals no-fog baseline; texture and cube background without IBL; cube-camera reflection changes when a coloured object moves; mirror shows the reflected object; layer-masked node absent from the frame; render-to-target (R-06) |
| **R-09** | L7 | S | SR-08: `tests/browser/parity-disposal.spec.ts` does not exist; `resource-soak-u1.spec.ts` was substituted | `tests/browser/parity-disposal.spec.ts`, or amend §5.7/§8 | Either write the spec (20 load/unload cycles, `getDiagnostics()` memory/textures/buffers/renderTargets within 5% of cycle 1), or record in §5.7 that `resource-soak-u1` is the accepted fixture and show it asserts the same four counters |
| **R-10** | L5 | S | Multi-draw availability comes from `qrGeneratedProgramsOn` (`R/renderer/CullingBatching.ts:377`), not the `WEBGL_multi_draw` extension. Without the extension, the plan reports multi-draw while the device loops (`webgl2/MultiDraw.ts:651-653`) | `R/renderer/CullingBatching.ts`; `R/webgl2/MultiDraw.ts` | Device capability feeds `multiDrawAvailable`. With the extension stubbed absent, the report says `multiDrawMode:"unavailable"` and the draw count matches actual submissions. Case added to `tests/unit/rendering/batch-multidraw.test.ts` |
| **R-11** | L3 | M | AD-14 / L3-07: `M/ConvexHull.ts` and `M/Octree.ts` have zero tests | `tests/unit/parity/math.test.ts` | Hull of a seeded 1k-point cloud has three's face count. Octree capsule sweep, sphere and ray results equal three's `Octree` on a fixture level |
| **R-12** | L2 | S | L2-07 / AD-07: no convex-hull geometry | `AA/nodes/geometry.ts`; `R/geometry/Convex.ts` | `geometry.convex(points)` built on `M/ConvexHull`; face/vertex counts equal three's `ConvexGeometry`. Depends on R-11 |
| **R-13** | L2 | S | AD-06: `toNonIndexed` is internal only (`AA/RootGeometry.ts:424`) | `AA/nodes/geometry.ts`; dispositions; `docs/api/public-api.md` | `geometry.toNonIndexed(src)` public and documented; existing three comparison test points at the public call |
| **R-14** | L3 | S | L3-03: camera `Spline.ts` keeps its own `catmullRomDerivative` (`:224-240`) and a null fallback for unsupported alpha (`:39-44`) | `AA/camera/Spline.ts`; `M/curves/CatmullRomCurve3.ts` | Support arbitrary alpha in `M/curves` (or restrict camera alpha to the three types); delete the duplicate derivative; existing camera tests unchanged |
| **R-15** | L4 | S | ST-05: only the plain GLB is checked against three on real bytes; Draco/Meshopt use capture stubs, KTX2 only a flag | `tests/unit/parity/gltf-decoders.test.ts`; `tests/fixtures/gltf/` | Three real compressed GLBs (Draco, Meshopt, KTX2) decoded by both loaders; vertex and index counts equal |
| **R-16** | L10 | S | L10-03: no test enforces "every mapping target exists in `aura.exports.json`". Stale notes at `CLI/migrate-three/mappings.ts:186-187` (AU-01 and AU-02 were fixed) | `tests/unit/aura3d-cli/`; `mappings.ts` | New test resolves every `engineImport` against the export manifest and fails on a missing name. Notes corrected |
| **R-17** | all | per lane | §7.3 step 3 never run: all six `A3D_PARITY_*` flags are `"dev"` (`R/contracts/flags.state.ts:51-56`), so e.g. `instances.mesh` throws in a default app | `R/contracts/flags.state.ts` | Per lane, flip to `default-on` only after its browser fixtures pass on the remote runner **and** the LPIPS-vs-three gate shows 0 regressions. Record the CI run ID next to each flip |
| **R-18** | L9 | S | Regressions outside the parity suite. `audio-context-ownership.test.ts` fails: 3 new `AudioContext` owners (`CLI/.../prd09/codemods/audio-wrapper.ts`, `apps/showcase-heatsink/src/main.ts`, `apps/showcase-heatsink-v2/src/main.ts`) plus a reference to the deleted `apps/aura-clash-showcase/...`. `loop-engine.test.ts` fails: `occlusionHz(0)` = 20400 after `9c8761647` changed the formula (`SpatialVoice.ts:39`) | those files; `tests/unit/audio/*` | Owners use `AudioContextManager` or are enumerated; the deleted path is removed from the test; `occlusionHz` test matches the intended formula. `pnpm vitest run tests/unit/audio` green |
| **R-19** | L10 | M | L10-06: the golden input is a hand-written stand-in, not the real Strange Orbit module | `tests/unit/aura3d-cli/migrate-three.test.ts`; `tests/fixtures/crayon/strange-orbit/` | Real captured module (19 KB) migrated with 0 `TODO(a3d-migrate)` in game logic |
| **R-20** | ports | L | Phase exits A–D (§7.2) never attempted | per-game ports | As in §7.2. Phase A needs R-01 first; B needs R-03/R-04/R-10 and flag flips (R-17) for SHADING/BATCHING |
| **R-21** | L10 | S | `cameras` exported with no entry in `root-export-dispositions.json` | `docs/architecture/root-export-dispositions.json` | Entry added; `check:public-api` green |
| **R-22** | L10 | M | WebGPU canvas presentation is unproven on the remote runner. Headless Chromium + SwiftShader destroys the `GPUDevice` at the first presented frame; `material.custom` is only proven through offscreen readback | `tests/browser/parity-shader.spec.ts`; remote runner config | Canvas-presented pixel proof on a GPU runner, or an explicit offscreen-readback waiver recorded in §8 and route-health |
| **R-23** | L2 | S | Custom vertex attributes had no public field; five were required by the real Strange Orbit module | `AA/nodes/geometry.ts`; `AA/RootGeometry.ts`; `tests/fixtures/crayon/strange-orbit/` | **DONE** — `attributes` on `geometry.define/custom/dynamic`, `topology:"points"`; ACR run `r23c-20261022T195658Z` |
| **R-24** | L1 | M | HEATSINK authors 49 live node materials (`WebGPURenderer`); there is no TSL subset, and `SH-01` is not met as a general feature | `AA/nodes/material.ts`; `tests/fixtures/crayon/heatsink/`; L1-11 design | Decide: hand-port HEATSINK to `material.custom` or build the L1-11 TSL subset. Either path must pass a HEATSINK material fixture before Phase B |
| **R-25** | L10 | M | Crayon capture stops at menus/HUD for eight games; no game has a fixed-input Stage 5 run plus pixel diff. Roadster Hours' start click times out and Silt & Signal's child frame evaluation times out | `docs/workflows/crayon-game-reverse-engineering.md`; `evidence/crayon-runtime/*`; `tools/crayon-probe/index.ts` | All ten games have a fixed-input capture and pixel diff, or an explicit route-health limit. Roadster start and Silt child-frame blockers are resolved or waived with evidence |

Still deferred by design (unchanged): **SH-04** compute (after `A3D_QR_WEBGPU`),
**SC-04** XR buttons and render target (post-D), **L1-11** TSL subset (pending
R-02).

### 12.3 Parallel lanes

R-01→R-02→R-20 is the only chain. Everything else can start now in parallel,
grouped by owning lane: L1 {R-03, R-04, R-05, R-24}, L2 {R-12 (after R-11), R-13
(R-23 done)}, L3 {R-11, R-14}, L4 {R-15}, L5 {R-10}, L7 {R-06, R-07, R-08, R-09},
L9 {R-18}, L10 {R-01, R-16, R-19, R-21, R-22, R-25}. R-17 follows each lane's
remote fixtures.


### 12.4 Status after the 2026-10-22 execution run

Verification at the end of the run: `pnpm typecheck` clean; `pnpm vitest run
tests/unit/parity tests/unit/audio tests/unit/aura3d-cli tests/unit/tooling
tests/unit/rendering/batch-multidraw.test.ts tests/qr/prd08/unit tests/qr/prd11`
= 124 files, 1,457 tests, all passing; remote ACR run `r17-20261022T204448Z`
passed all 16 tests across all 11 `parity-*.spec.ts` files. The run's code changes are uncommitted; only doc and evidence commits `989dcb02d` and `ade1bbcd8` (from a parallel session) exist.

| Task | Status | Evidence |
| --- | --- | --- |
| R-01 probes | DONE | 10 files re-recorded, `contextFound:true` everywhere; ACR run `cc1an`; `crayon-probe.test.ts` 30 tests |
| R-02 re-rank | DONE | §7.1 and §9 rewritten from the probe files |
| R-03 named slots | DONE (premise corrected) | Slots already sorted; WebGL2 bloom-order bug found and fixed as **R-03b**, ACR run `r03b2-20261022T192944Z` |
| R-04 WGSL post | DONE | Already implemented in `WebGPUDevice.ts`; fixed a before-bloom/no-TAA ordering bug; `webgpu-custom-pass.test.ts` 12 tests |
| R-05 WebGPU material | DONE with limit | Passes via offscreen readback; canvas presentation unproven on the runner (**R-22**: root cause is headless Chromium + SwiftShader destroying the device at the first presented frame) |
| R-06..R-09 runtime | DONE | `parity-runtime.spec.ts`, `parity-disposal.spec.ts`, `tone-mapping.test.ts`; three engine bugs fixed (batching dropped cube binding, zero environment knobs, camera `layers`) |
| R-10 multi-draw gate | DONE | `batch-multidraw.test.ts` 17 tests. Gap: a shader that blocks merging at draw time can make `outputDraws` undercount |
| R-11..R-14, R-21 | DONE | math/geometry tests against three; `geometry.convex`, `geometry.toNonIndexed`, `ClampedCatmullRomCurve3`, `cameras` disposition |
| R-15 glTF fixtures | DONE | real Draco/Meshopt/KTX2 GLBs; KTX2 transcoding not covered (needs GPU) |
| R-16 codemod targets | DONE | `migrate-three-mapping-targets.test.ts`; fixed bad `assets` import |
| R-18 audio | DONE | `tests/unit/audio` 97 tests. `occlusionHz` formula changed in `4995fb7c8` (C-25, #208), not `9c8761647` as first reported; the test was stale |
| R-19 Strange Orbit | DONE with caveat | Real game captured (ACR run `cc1ap`); 0 TODOs after R-23; shaders still need hand-porting to GLSL 300 es |
| **R-23** custom vertex attributes | DONE | `attributes` on `geometry.define/custom/dynamic`, `topology:"points"`; ACR run `r23c-20261022T195658Z` |
| **R-25** Crayon capture | **PARTIAL** | Roadster Hours start click and Silt & Signal frame evaluation fixed (probes re-recorded settled); Strange Orbit has a bit-exact fixed-input reference. Fixed-input references for the other games were not recorded (stopped by decision) |
| **R-17** flag flips | **DONE for the two flags that gate anything; L4 gate waived for them** | `BATCHING` and `LINES` default-on; `default-flags.test.ts` 8 tests; remote run `r17-20261022T204448Z` 16/16. Four inert flags stay `dev` (see below) |
| **R-20** phase exits A-D | **A DONE; B, C, D not attempted by decision** | Phase A exit met (see §10). The game ports for B, C, D were started and stopped on 2026-10-22 because the goal is the engine surface, not the ports; partial port files were deleted. The engine capabilities they need are shipped |
| **R-24** HEATSINK TSL | **DECIDED: hand-port to `material.custom`** (executes in Phase B) | 49 live node materials. Reason: §1.3 excludes a full TSL compiler; only 1 of 10 games needs TSL, so L1-11's ≥3-game trigger is unmet; `material.custom` already runs GLSL on the live WebGL2 path. L1-11 stays closed unless a second game needs it |

**R-17 outcome.** §7.3 step 3 names the L4 LPIPS-vs-three gate
(`.github/workflows/qr-azure-gpu.yml` on a self-hosted L4 runner, the same gate
that promoted `A3D_QR_COMPILER`). Machine policy prohibits GitHub Actions and
standing runners, serverless ACR has no GPU, and the runbook forbids mixing GPU
classes, so no gate result can be produced here. Decision (repo-study, reversible):
the gate is **waived only for flags that gate nothing but new opt-in node kinds**.
`default-flags.test.ts` proves this: `A3D_PARITY_BATCHING` is read only by
`nodes/batched.ts` and `A3D_PARITY_LINES` only by `compiler/lines.ts`, both only
for the new `batched`, `line`, `points` and `sprite` kinds, and every other node
kind resolves to the identical handler with all parity flags on or off. Both are
now `"default-on"` in `R/contracts/flags.state.ts`; reverting is a one-word change
(`A3D_PARITY_LINES=0` / `A3D_PARITY_BATCHING=0` also work per run). The four
remaining flags (`SHADING`, `GEOMETRY`, `TEXTURES`, `RUNTIME`) are read nowhere;
flipping them would change nothing, so they stay `"dev"` and are candidates for
removal under §5.4. **Unvalidated by the L4 gate:** this run's edits to
`ForwardPass`, `Renderer`, `CullingBatching`, `LegacyPost`/`v2Stages` and
`WebGPUDevice` apply to existing scenes regardless of any flag; if the L4 gate can
be run outside the prohibited setup, run it on those before release.

**Failures present at HEAD, not caused by this run** (verified by testing with
and without this run's changes):
`tests/unit/rendering/renderer.test.ts` 23 WebGPU tests ("No WGSL program");
`tests/unit/workstream5-runtime.test.ts` 2 GLTFLoader rejection tests;
`tests/qr` 42 tests; a `hero-validator` test needing a missing
`skylineArcticRunner.glb`.

**Known limits:** `roadster-hours` and `silt-and-signal` probe scenes had not
settled (counts are lower bounds); the stale `AudioListener` note in
`CLI/migrate-three/emit.ts:506` was corrected at the end of the run;
`packages/math/src/` contains untracked-in-git build maps next to sources;
`tools/export-surface/scaffold.ts --check` reports `public/index.ts`,
`renderer.ts`, `devtools.ts` and the dispositions file as stale, so
`--write` was deliberately not run (dispositions were edited by hand).

**Capture gaps (R-25):** no Crayon game has a complete fixed-input Stage 5
fixture or pixel diff. Roadster Hours' `Drive Sunbreak Coast` click times out
and loses the game iframe; Silt & Signal's child frame times out, leaving only
its 205,683-char `iframe.srcdoc`. Eight games have live menu/start/HUD or journal
evidence, and exact tuning is limited to Splat Rush and Drift & Deliver.
