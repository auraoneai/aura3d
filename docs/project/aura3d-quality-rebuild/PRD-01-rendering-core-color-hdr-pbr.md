# PRD 01: Rendering Core, Scene Graph, Color, HDR, PBR

Program: Aura3D visual-quality autopsy and rebuild. Branch of record: `aura3d-quality-rebuild/audit` (audit commit `c08d8acb`).
Status: Draft, implementation-ready, parallelized against `CONTRACTS.md` (contracts C-01..C-40, PR 0 §3.9, ownership §4). Owner: lane 01 (rendering core). Flag: `A3D_QR_CORE` (`off` | `v2`), sub-flags `A3D_QR_CORE_OUTPUT`, `A3D_QR_CORE_GENERATOR` (CONTRACTS §5.1).
Parallel execution: this lane starts on day 0 (2026-10-05) from the PR 0a branch and never waits on another lane. Every cross-lane edge is a contract it provides (C-01, C-02, C-04, C-05, C-06, C-07, C-08; stubs keep working for consumers) or consumes (built against the PR 0a stub), a non-blocking request (§13.4), or an integrated criterion evaluated only at checkpoints (§17.2). See §13 "Contracts consumed / provided" and §13A "Parallel execution".
Final gate: the shipped games and the `benchmarks/quality-rebuild` scenes look competitive with three.js r185 under human and vision-model review. That gate is integrated (§17.2, CONTRACTS §7-§8): it needs lanes 02, 03, 04 and 14 and is never claimed from this lane alone. Passing tests, 200 routes, non-blank screenshots and green parity matrices do not count as meeting it. Standalone acceptance (§17.1) gates this lane's merges and the `standalone-accepted` flag state.

Evidence base: research reports `research/02`, `03`, `05`, `06`, `07`, `13`, `19` (corrected claims), `22` (code metrics and skeptic review), `23` (authoritative vision benchmark), `21` (authoritative vision judgment of the games), plus game captures in `evidence/games/` (GitHub Actions run 37289688772, macos-14, ANGLE Metal, Apple Paravirtual GPU). Where this document cites a line it was read in this checkout; where it relies on a research report it says which one.

---

## 1. Problem statement

Aura3D renders every shipped game through a WebGL2 core whose BRDF math is basically sound (GGX, height-correlated Smith, split-sum IBL with multiscatter; research/02 §3.5, research/03 §2). The pixels around that core cap the image below modern three.js work:

1. Several renderers exist, and the one a route gets depends on the entry point and on whether an exception was thrown. A failed production mount silently swaps in a raw-GL Blinn-Phong renderer with double gamma.
2. The scene graph composes group transforms by adding positions and Euler angles. Parent scale and rotation never reach child offsets.
3. Built-in primitives are low-poly. The capsule is a sphere. Cylinder caps are wound backwards and use side normals, so the top cap is back-face culled. The benchmark shows this as a missing cylinder cap (01) and a missing plinth top (02).
4. Color and HDR policy is inconsistent. There are three tone curves (fitted ACES in post, Narkowicz ACES in the forward shader, Reinhard plus `pow(1/2.2)` in safe-basic). Exposure is fixed at 1. "AgX" and "Neutral" are per-channel stand-ins. Everything after tone mapping runs on 8-bit display-referred buffers. There is no output dither.
5. Shading carries non-physical fudges: ambient is π× three.js, sampled specular is scaled by `mix(1.1, 0.65, roughness)`, anisotropy multiplies all shading by `mix(1, 0.18, a)`, and `a3dApplyAdvancedPbrLobes` darkens the base color. Dielectric F0 ignores IOR. There is no specular AA and no direct-light multiscatter.
6. Shader programs are hand-copied uber-shaders that branch on float uniforms. Variants are 10 hand-named define sets. Features drift between copies (research/02 §3.4).
7. Per-draw CPU work allocates: a new uniform `Map`, a new `RenderPipeline`, per-frame instance VBOs that leak VAOs, and per-frame CPU morph geometry. The engine API also composes instanced primitives wrongly: instance positions are multiplied by the node `size`, so benchmark 16 renders as a blob covering 8.7% of the frame where three.js covers 71% (research/22 §16).
8. Only one blend function exists (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), so additive light, glow and premultiplied compositing are impossible.
9. Defaults lower resolution and throughput: `pixelRatio` 1 on HiDPI, and `preserveDrawingBuffer: true` everywhere.

Measured consequence: in the authoritative vision benchmark (research/23) Aura3D scores 1 to 4.5 out of 10 across 18 same-input scenes, against 4 to 7 for three.js r185 (scored on the same modern-browser scale; research/22's blind pass gave three 6.5 to 8.5). The game judgments (research/21) classify every shipped game as "not competitive with a well-built modern three.js browser game". Lane 01 does not fix lighting content, IBL or shadows (lane 02, via C-09/C-10/C-11), post kernels (lane 03, via C-13/C-14), or extension lobes (lane 04, via C-03). It provides the core contracts those lanes plug into (C-01, C-02, C-04, C-05, C-08) and fixes the defects that are wholly in the core. Those lanes build against the PR 0a stubs of these contracts in parallel; nothing here is sequenced before them.

## 2. Evidence from current code (path:line)

All engine paths are under `packages/engine/src/agent-api/index.ts` (18,733 lines) unless stated. Line numbers were read at audit commit `c08d8acb` and re-checked at `85aafcd0` (the PR 0 base). After PR 0b-1 many of these ranges move verbatim into carve-out modules (CONTRACTS §3.2); the owning module is named where it matters for ownership. A spot-check of 30 references against the code on 2026-10-05 found three wrong; they are corrected below (`WebGL2Device.ts` neutral at `:3547`, the DFG LUT uniform and axis at `ShaderLibraryCore.ts:648`, and `BRDFLut.ts` wrapping a 64×64 RGBA8 generator from `EnvironmentMapResources.ts`).

### 2.1 Renderer paths and silent fallback
- `createProductionSceneRenderer` (`index.ts:12523-12550`) calls `createWebGLSceneRenderer` when `mode !== "production"` (`:12530-12531`) and also from the `catch` around `createProductionRuntimeSceneRenderer` (`:12543-12548`). The only trace is a warning string.
- `createWebGLSceneRenderer` (`index.ts:15982`) opens its own `canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true })` (`:15989`), uses a constant view vector `normalize(vec3(0.0, 0.34, 1.0))`, treats sRGB bytes as linear, and outputs `color/(color+1)` then `pow(color, 1/2.2)` (research/05 §4.4, `index.ts:16820-16924`).
- Renderer front-ends: 11 or more (research/13 §2.1). `LeanWebGL2Device.ts` (4,537 lines) is a roughly 92% copy of `WebGL2Device.ts` (4,769 lines) (research/13 §2.2). `@aura3d/lean` light and environment builders are inert (`packages/lean/src/base.ts:250-260`), and its model matrix has no rotation (`base.ts:521-523`) (research/19 C7, corrected: mini-game uses `LeanProductRenderer`, which receives no lights).
- Root bridge hard-codes `backend: "webgl2"`, `antialias: true`, `preserveDrawingBuffer: true` (`index.ts:13586-13597`, literal at `:13593`). Both `rendererQualityPresets` entries (`:4232`, `:4242`) and all four `rendererQualityProfiles` (`:4257`, `:4272`, `:4287`, `:4302`) also set `preserveDrawingBuffer: true`.
- Before the `try`, `createProductionSceneRenderer` already throws `AuraRuntimeError("backend-fallback", ...)` for ineligible scenes (`:12534-12541`). Only the `catch` path is silent.
- `createAuraApp` returns `AuraApp` synchronously (`index.ts:11126`). Mount is asynchronous, and `AuraApp.ready(): Promise<void>` (`:10706-10727`) is documented to resolve, not reject, on mount failure because the failure is reported through `diagnostics().errors`. Any "no silent fallback" design has to work within that contract (§6.1 rule 4).

### 2.2 Scene graph
- `flattenSceneNodes` (`index.ts:17960-17971`), `applyAuraParentTransform` (`:17973-17980`) and `composeAuraTransform` (`:17982-18006`): `position = parent + child` (`:17992`), `rotation = parentEuler + childEuler` (`:17997`), `scale = parent ⊙ child` (`:18002`), `lookAt = child ?? parent` (`:18004`).
- Live breakage (research/19 C6, corrected): Courier Rush wraps the city kit in `group(...).scale([6,6,6])` (`apps/showcase-courier-rush/src/city.ts:769`). Every primitive becomes 6× larger but keeps its unscaled offset, so the city collapses into overlaps. Material Asset Inspector scales swatch groups by 0.5 and 0.26 (`apps/showcase-material-asset-inspector/src/main.ts:280-291`). No shipped game uses a rotated group today. The defect blocks rotated sub-assemblies and is why agents lay everything out on world axes.
- Node matrix: `createModelMatrix` (`index.ts:17766-17789`) = `T · Rxyz(euler) · S(nodeScale ⊙ size ⊙ fit) · normalizeOffset`. There is no quaternion and no pivot. It allocates about 11 `Float32Array(16)` per call: three `multiply4` results (`:17859`), two `translation` or `identity4` (`:17873`, `:17882`), one `scaling` (`:17891`), and five inside `rotationXYZ` (three axis matrices plus two products, `:17900-17909`).
- `@aura3d/math` has `Matrix4`, `Quaternion` and `Euler` (`packages/math/src/`), but `Euler` throws for any order other than `"XYZ"` (`Euler.ts:11`), and `packages/engine/package.json` does not depend on `@aura3d/math`. `@aura3d/scene` exposes `TransformNode` (`packages/scene/src/TransformNode.ts:14`), not a class named `Transform`.
- Callers of the flatten path: renderer snapshot (`:11128`, `:11483`), physics (`:5183`, `:5192`), diagnostics (`:4369`), performance evidence (`:11843`, `:11952`) (research/19 C6).

### 2.3 Primitives
- Sphere 12 rows × 16 columns (`index.ts:17360-17362`).
- Cylinder 24 segments, no UVs or tangents (`:17405-17438`). Top cap indices `(topCenter, base+1, base+3)` (`:17429`) wind clockwise when viewed from +Y: the cross product of rim vectors at angles a and b has y = sin(a−b) < 0. The cap therefore faces −Y and is culled under `cullMode: "back"` (`:14933`). The bottom cap `(bottomCenter, base+2, base)` (`:17430`) faces +Y, so it is also inverted. Rim vertices are shared with the side wall and carry horizontal normals (`:17414-17415`), so a cap that does survive is shaded edge-on. This matches benchmark 01 ("cylinder top cap missing", research/23) and benchmark 02 (plinth top "starts 25-40 px lower", ground showing through; research/22 skeptic). The plinth is a `primitive("plinth", "cylinder", ...)` (`benchmarks/quality-rebuild/shared/scenes.ts:128`), not a GLB.
- Torus 48 × 10, no UVs or tangents (`:17440-17475`).
- Capsule is the sphere: `createCapsuleApproxGeometry() { return createSphereGeometry(); }` (`:17477-17479`). Engine rigs build arms and legs from `primitives.capsule` (`:6562-6572`, `:8648-8661`), so those limbs are scaled spheres.
- Plane is a single quad with 0..1 UVs (`:17287-17315`).
- `@aura3d/rendering` already has correct generators the engine bypasses: `Geometry.uvSphere` (48×24), `Geometry.cylinder` (48 segments, separate cap vertices, correct cap winding) and a real `Geometry.capsule` (`packages/rendering/src/Geometry.ts:264`, `:307`, `:369`). This is a duplicate-implementation failure, not a missing capability.
- The primitive API has no segment options (benchmark capability log entry `primitive-tessellation: missing`, `evidence/benchmark/report.json`). Benchmark 13 "faceted spheres" (research/23) are these 16×12 primitives: the chrome, gold and plastic spheres at `scenes.ts:275-277`. The 12 spheres of benchmark 06 (`scenes.ts:73-74`) are the same generator. The vision judge assumed a GLB; it is the primitive generator.
- Physics derives a different capsule than rendering: `PhysicsShapeFactory.capsule(max(size.x·s.x, size.z·s.z) · 0.25, ...)` (`index.ts:5380`). Rendering draws a unit sphere scaled by `size`.

### 2.4 Instancing bug (confirmed)
- `createProductionInstanceTransforms` (`index.ts:14747-14754`) builds `localNode = { kind, primitive, ...transform }` and omits `node.size`. The item `modelMatrix` is `createModelMatrix(currentState.node, ...)` (`:13976`), which includes `S(size)`. The instanced vertex shader computes `u_modelViewProjection * instanceMatrix * pos` (`ShaderLibraryCore.ts:258-261`), so `S(size)` is applied outside the instance translation. Every instance position is multiplied by `size` (research/22 §16, skeptic confirmed). With non-uniform size, rotated instances also shear.
- Both arrays are rebuilt every frame (`:13976`, `:13980`).

### 2.5 Color, tone mapping, exposure, output
- Root postprocess is always submitted: `targetFormat: "rgba16f"` (`index.ts:12864`), `toneMapping: { exposure: 1, whitePoint: 1, operator: "aces", inputColorSpace: "linear", outputColorSpace: "srgb" }` (`:12898-12904`). `colorGrade` forwards only contrast and saturation (`:12905-12910`). The exposure drop is announced only as a diagnostics warning (`:4547`). `sceneExposurePresets` (`:4204-4214`) feed only diagnostics (`:4481`, `:4587`) and the overlay text (`:18657`).
- Fake operators: `agx()` (`packages/rendering/src/WebGL2Device.ts:3541`) and `neutral()` (`:3547`) are per-channel curves, duplicated in `LeanWebGL2Device.ts:3320` / `:3326` and in CPU form in `PostProcessPass.ts:2558` / `:2565`.
- Forward shader has its own Narkowicz curve without the 0.6 prescale: `a3dPbrEncodeOutput` (`packages/rendering/src/ShaderLibraryCore.ts:588-593`). It is used whenever `u_outputColorSpace` = 1 (lean path, no-post path).
- Aura Clash uses `createSideViewGameRenderPreset` with `targetFormat: "rgba8"` (`packages/engine/src/production-runtime/GameRenderPreset.ts:373`) and no tone-map key, so the device default operator `"reinhard"` applies (`WebGL2Device.ts:1906`) (research/19 C15).
- Clear color is pre-inverted through ACES (`colorToAcesInputClearColor`, `index.ts:15400-15418`).
- Post after tone map is 8-bit: ping-pong is RGBA8 unless bloom is on with an HDR source (`WebGL2Device.ts:946-948`). DOF, motion blur, SSAO, SSR, TAA and outline run on those buffers (research/05 §1.4, research/02 §4).
- No dither anywhere in the present shader (research/05 §7).
- The color parser accepts only `#rrggbb`. Everything else becomes `[0.02, 0.025, 0.035, 1]` with no warning (`colorToClearColor`, `index.ts:15383-15389`).
- Compressed textures upload only UNORM formats with no sRGB variant (`WebGL2Device.ts:4117-4134`). This region is carved to `webgl2/TextureFormats.ts` (lane 05, C-16); noted here because it is a color-pipeline contract.

### 2.6 PBR core
- Dielectric F0 is `vec3(0.04) * specularFactor * specularColorFactor` (`packages/rendering/src/ShaderChunks.ts:93-96`). IOR does not reach F0 (research/03 §2).
- Direct BRDF is single-scatter (`ShaderChunks.ts:98-126`). Diffuse uses Burley with an extra `energyFactor` (`:85-90`).
- Split-sum IBL with Fdez-Agüera multiscatter (`ShaderChunks.ts:217-245`). Keep.
- Ambient: `environmentHemi = mix(0.35, 1.0, N.y*0.5+0.5)`, `ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi` (`ShaderLibraryCore.ts:622-623`), then `diffuse = kd * albedo * diffuseIrradiance` (`ShaderChunks.ts:241`). There is no `1/π`, so ambient is π× three.js `AmbientLight` (research/04 §1 item 2; research/22 §01 shows the lifted shadow sides as RGB 95,2,7 vs 54,1,2).
- Fudges in the base PBR shader:
  - `sampledSpecular *= ... * mix(1.1, 0.65, roughness)` (`ShaderLibraryCore.ts:650`); clearcoat variant `mix(1.1, 0.85, ...)` (`:654`).
  - Procedural specular `reflectionBand = pow(..., mix(18, 2, r))`, `roughEnvironmentFloor = mix(0.04, 0.38, r)` (`:641-644`).
  - Env shading multiplied by `mix(1.0, 0.18, anisotropy)` (`:667`); direct light multiplied by the same (`:756`).
  - `a3dApplyAdvancedPbrLobes(...)` returns only a darkened base (`ShaderChunks.ts:253-327`; called at `ShaderLibraryCore.ts:598`, `ShaderLibrary.ts:932`, `:1462`, `:3035`).
  - Textured shader: `mix(0.012, 0.16, r)` floor plus stripes (`ShaderLibrary.ts:2655-2675`); the same `mix(1.1, 0.65, r)` (`:2678`); aniso `×0.18` (`:3081`, `:3208`); "source paint" red gate (`:2905-2955`); AO on direct light gated by red (`:3061-3064`) (research/03 §3.1).
  - `a3dPbrClampSampledSpecularEdgeEnergy` is `max(radiance, 0)` (`ShaderLibraryCore.ts:473-475`), a named function with no effect.
- The IBL combination (`a3dPbrEnvironmentLightSplitSum`, `ShaderChunks.ts:217-245`) runs one multiscatter evaluation on the metal-blended F0 and sets `kd = (1 − scattering)(1 − metallic)`. three r185 `RE_IndirectSpecular_Physical` (`lights_physical_pars_fragment.glsl.js:579`) evaluates multiscatter separately for the dielectric and metallic F0, mixes them by metalness, and weights diffuse by `1 − (dielectric single + multi)`. The results differ for partially metallic materials and for colored metals.
- The DFG LUT is approximate and optional. `BRDFLut.ts` `createExternalParityBrdfLut(size = 64)` wraps `generateApproximateBrdfLutPixels` from `EnvironmentMapResources.ts` (RGBA8). Materials bind it only through the optional `environmentBrdfLutTexture` (`TexturedPBRMaterial.ts:61`); the base shader samples `texture(u_environmentBrdfLutTexture, vec2(nDotV, roughness))` (`ShaderLibraryCore.ts:648`) and falls back to `vec2(1, 0)` when it is unbound (`:661`). three r185 ships a precomputed 16×16 RG16F LUT (4,096 samples per texel), sampled as `texture(dfgLUT, vec2(roughness, dotNV))` (`node_modules/three/src/renderers/shaders/DFGLUTData.js`). It is used for both IBL and direct-light multiscatter (`BRDF_GGX_Multiscatter`).
- No specular AA: no derivative-based roughness widening. The only `dFdx` in the shader library is for UV gradients (`ShaderLibrary.ts:2846`).
- `a3dPbrEnvironmentSampleRaw` always samples both the equirect and the cube map and mixes them (`ShaderLibraryCore.ts:476-480`).

### 2.7 Shader program architecture
- The cache key is `shaderKey[:variant]` (`packages/rendering/src/ForwardPass.ts:681-683`). There is no material-feature hash.
- Ten hand-named textured-PBR variants (`ShaderLibrary.ts:2065-2075`). All of them define `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` and `A3D_PBR_DISABLE_CLUSTERED_LIGHTING`.
- Separate hand-written programs: base PBR (`ShaderLibraryCore.ts:291-782`), instanced PBR (`ShaderLibrary.ts:101`), skinned-lit 4 and 8 influences (`:565`, `:1091`), normal-mapped PBR (`:1643`), textured PBR (`:2063`). Drift example: the rough floor is `mix(0.04, 0.38, r)` in base and `mix(0.012, 0.16, r)` plus stripes in textured (research/02 §3.4).
- Runtime-uniform branching: `step(0.5, u_...)`, `u_clusteredLightEnabled > 0.5` inside the light loop (`ShaderLibraryCore.ts:705-715`).
- `ShaderModule` compiles lazily at first draw (`packages/rendering/src/ShaderModule.ts:22-33`). `WebGL2Device.createShaderProgram` queries `COMPILE_STATUS` and `LINK_STATUS` immediately, with no `KHR_parallel_shader_compile` (research/07 §3.2).
- Unused but load-bearing-looking files: `production-runtime/shaders/chunks/*.glsl`, `production-runtime/shaders/wgsl/pbr.wgsl` (outputs `abs(normal)`), `production-runtime/materials/MaterialCompiler.ts` (research/03 §1, research/07 §1). They are not referenced from any render path, but `packages/rendering/src/production-runtime/index.ts` re-exports `MaterialCompiler`, `GLTFMaterialAdapter`, `PBRShaderFeatures` and `ShaderProgramLibrary`, and `GLTFPBRMaterialAdapter.ts` imports `GLTFMaterialAdapter`. Deleting them is therefore a public-surface removal. Ownership after PR 0: `production-runtime/shaders/chunks/` is lane 01's, `production-runtime/materials/` is lane 04's, `production-runtime/shaders/wgsl/` is lane 11's and `production-runtime/index.ts` is lane 15's (CONTRACTS §4.1), so lane 01 deletes only the chunk directory and requests the rest (§13.4).

### 2.8 Per-draw cost and resource lifetime
- `ForwardPass.drawItem` builds `new Map(binding.uniforms)` plus about 10 `apply*Uniforms` helpers (`ForwardPass.ts:293-311`) and calls `new RenderPipeline({...})` per item (`:319`).
- Uniform upload has no last-value cache, and there are no UBOs (`rg UNIFORM_BUFFER packages/` is empty; research/07 §3.1).
- `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`). Above 64, or with colors or attributes, `device.createBuffer("vertex", ...)` runs every frame (`:1755`, `:1803`) and is disposed at `:346`. VAO cache keys include `buffer.id` (`WebGL2Device.ts:4225-4236`) and are evicted only in `dispose()` (`:1459-1462`): one leaked VAO per such draw per frame (research/07 §3.3, code-confirmed, not browser-measured).
- GPU morph is limited to 64 vertices and 4 targets (`ForwardPass.ts:119-120`, `:1885`). Beyond that, CPU `applyMorphTargets` allocates, uploads and disposes a new `Geometry` per draw per frame (`:313-314`, `:347-349`).
- A texture-mode morph planner already exists but is not wired to `ForwardPass`: `MorphTargetPlan.ts` (`planMorphTargets`, modes `"uniform" | "texture" | "cpu"`). Its texture layout is one row per target attribute with `x = vertex`, so `textureWidth = vertexCount`. Any mesh with more vertices than `maxTextureSize` (default 4,096, `MorphTargetPlan.ts:26`) falls back to CPU, which includes the 5,000-vertex face in scene 24. Under CONTRACTS R5 all deformation resources (`MorphTargetPlan.ts`, `resources/MorphTargetTexture.ts`, `forward/Deform.ts`, the skinning palette) belong to lane 06 and are reached through C-18; lane 01's generator only includes the `prd06.deform` feature at hook `vertex:deform`.
- Two resolution-scaling mechanisms already exist. `AuraPerformanceQuality.resolutionScale` (`packages/engine/src/agent-api/RootRuntimeSupport.ts:66`) is applied by `app.setPerformanceQuality()` and resizes the whole canvas backing store (`index.ts:12301-12302`, `:12455-12465`). `createPerformanceGovernor` (`packages/engine/src/production-runtime/GameRenderPreset.ts:158`, steps `[1, 0.85, 0.7, 0.5]` at `:130`) is used by `GameAppRuntime.ts:127-139` and by two templates. Any new governor must replace or drive these rather than add a third.
- Static batching regroups into chunks of 64 every frame (`Renderer.ts:2361-2385`) from fresh per-frame model matrices (`index.ts:13976`).

### 2.9 Blending
- `blend: boolean` and `depthCompare: "always" | "less-equal"` appear in both the material `RenderState` (`packages/rendering/src/Material.ts:32-42`) and the device `RenderCommandState` (`packages/rendering/src/RenderDevice.ts:135-161`, fields at `:139-140`). The engine sets `blend: opacity < 0.999` for primitives (`index.ts:14930-14934`).
- The only blend function is `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` (`WebGL2Device.ts:4402-4405`, same at `LeanWebGL2Device.ts:4183`). `SpriteFlipbook.createBeamDescriptor` returns `additive: true` (`SpriteFlipbook.ts:119`, `:153`), and particles default to `materialMode "additive-glow"` (`index.ts:3707`). Both are metadata only (research/19 C8).

### 2.10 Resolution
- Profiles hard-code `pixelRatio`: safe-basic 1 (`index.ts:4256`), production 1.5 (`:4271`), cinematic 1.5 (`:4286`), experimental-webgpu 1. `configureCanvas(canvas, options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe(), ...)` (`:11133`, and `:12280` in the production path) makes `devicePixelRatioSafe()` (`:18699`) unreachable (research/19 C2, confirmed by both skeptics).
- Even when reached, `devicePixelRatioSafe()` clamps to [1, 2] (`index.ts:18699-18700`), so the Ultra tier cap of 3 (§6.9) needs that clamp removed.
- About 13-14 of the 18 games render at 1× on HiDPI. Skyline Runner forces 0.7 (`apps/showcase-skyline-runner/src/main.ts:1879`). Turbo Drift sets `pixelRatio: 1` only when `visualCaptureCamera` is on (`apps/showcase-turbo-drift-circuit/src/main.ts:2987-2988`). Its comment says public gameplay keeps the renderer-selected DPR, but the renderer selects the profile's fixed 1 (`:4256`/`:4271`), not the device DPR. Other app-level caps: Rooftop Buckets `min(dpr, 1.75)` (capture: ≤ 1) (`showcase-rooftop-buckets/src/main.ts:738`), Aura Clash probe-conditional (`AuraClashArenaApp.ts:1522`), and the non-game apps listed by `git grep -n "pixelRatio:" -- 'apps/*/src/*.ts'`.
- The benchmark harness passes `pixelRatio: spec.resolution.devicePixelRatio` explicitly (`benchmarks/quality-rebuild/aura3d/common.ts:292`), so benchmark scenes 01-18 do not measure the DPR default. Only the game captures and `dpr.spec.ts` (§16.2) do.
- DPR is captured once at mount; resize reuses it (`index.ts:12294-12310`).
- `packages/rendering/src/Renderer.ts:508` does read `devicePixelRatio`, but the root bridge sizes the canvas itself and bypasses it.

### 2.10a Canvas readback consumers (affected by `preserveDrawingBuffer: false`)
- `git grep -l "toDataURL\|readPixels\|toBlob(" -- tools tests apps templates 'packages/*/src'` returns 226 files at audit commit `c08d8acb`. They include the shipped template specs `templates/{mini-game,product-viewer,cinematic-scene}/tests/screenshot.spec.ts`, many `tests/browser/*` harnesses, and app proof code (for example `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`).
- The quality-rebuild capture tools do not use canvas readback. `tools/quality-rebuild-capture/capture-games.mjs:534` and `:786` use Playwright `page.screenshot`, which reads the composited page and works with `preserveDrawingBuffer: false`. `benchmarks/quality-rebuild/capture.mjs` composes PNGs that were already captured (`:173`, `:251-281`).

### 2.11 Shipped-game observations tied to core defects (research/21, evidence/games)
- Runner frame rates (Apple Paravirtual GPU via ANGLE Metal; relative, not absolute, budgets): most games run at 5-15 fps at 1920×1080 (Gravity Post 6.4, Courier Rush 7.1, Siege Golf 7.1, Rooftop Buckets 7.6). Deep Recovery runs at 0.5-1.1 fps (CPU readback post chain, research/05 §1.3). Orbital Defense and Vault Breakers run at about 60 (`evidence/games/report.slim.json`). The core cannot honestly raise DPR without also removing per-draw CPU cost.
- Vision verdicts attribute "flat, washed-out, floating, primitive, faceted" looks across games to shadows and IBL (lane 02), assets (lane 05), and core issues: low DPR, faceted primitives, ambient wash, and missing additive glow (research/21 §§3-4 per game). Only the core issues are lane 01's.

## 3. Root cause

| Root cause | Bucket (research/06 §7 taxonomy) | Defects it produces |
|---|---|---|
| No single renderer contract. Each entry point (root bridge, safe-basic, lean, lean product, game presets) builds its own target format, tone curve and light submission | F architecture | Silent safe-basic fallback; Reinhard on Aura Clash; Narkowicz in lean; inert lean lights |
| The scene description is a flat list of TRS records produced by componentwise "composition" instead of a matrix hierarchy | F / A | Group scale and rotation broken; instancing size bug (same pattern of building matrices from partial node records) |
| Primitive generators written as MVP placeholders and never revisited; no geometry tests | A | Missing caps, capsule = sphere, faceting, untexturable cylinder and torus |
| Color policy split across forward shader, device present shader, engine clear-color hack and CPU passes; exposure modeled as diagnostics | A / F | Fixed exposure, fake AgX/Neutral, 8-bit post, no dither, background pre-inversion |
| The shader "system" is copy-pasted GLSL strings with float-uniform branching, so every fix is five edits and fudges accumulated to match screenshots | A | IOR-less F0, no specular AA, π× ambient, `mix(1.1,0.65,r)`, aniso darkening, asset-specific gates |
| Immediate-mode submit with per-draw object construction and transient GPU buffers | A | 5-15 fps on the runner; VAO leak; agents told `maxRecommendedDrawCalls: 180` (`index.ts:4258`) |
| `RenderState.blend` modeled as boolean | A | No additive or premultiplied compositing engine-wide |
| Defaults chosen for CI determinism (DPR 1, `preserveDrawingBuffer` for screenshot readback) rather than for the image | B defaults / G evidence | Quarter-resolution frames; lost tile-discard on Apple and mobile GPUs |

## 4. Affected packages

- `@aura3d/rendering` (`packages/rendering`): device, renderer, forward pass, frame graph, program generator, primitives, blend state, color and output pass. Lane 01 is the default owner of this package (CONTRACTS §4.1) except the paths listed for other lanes.
- `@aura3d/engine` (root package `package.json` name `@aura3d/engine`; source in `packages/engine`, whose own package name is `@aura3d/engine-runtime`): lane 01 owns only `agent-api/{sceneGraph,color}.ts`, `agent-api/app/colorManagement.ts`, `agent-api/compiler/{sceneGraph,color}.ts` and its lane files. Everything else it needs there (bridge wiring, canvas sizing, renderer options, primitive builders, physics) is reached through C-36/C-37/C-38 seams or requested from the owner (§13.4).
- `@aura3d/lean` (`packages/lean`, lane 15): routing lean through `Renderer` + OutputPass is a request to lane 15 (CONTRACTS §3.8), not a lane 01 edit.
- `@aura3d/scene` and `@aura3d/math`: not changed. The engine does not depend on `@aura3d/math`, and `Euler` there supports only `"XYZ"`. Scene-graph math lives in lane 01's `packages/engine/src/agent-api/sceneGraph.ts` (C-06), so no new package edge is added.
- `@aura3d/assets` (`packages/assets/src/GLTFRenderResources.ts`, lane 04): glTF `alphaMode` → `BlendMode` mapping is a request to lane 04 consuming C-04.
- `benchmarks/quality-rebuild` (lane 12): lane 01 adds only its own scene directories `{scenes,aura3d/scenes,three/scenes}/prd01/` (C-30). Metrics in `capture.mjs` are lane 12's (C-33 plugins).
- `apps/showcase-*`, `apps/aura-clash-showcase` (lane 14): lane 01 ships the `core-v2` codemod (C-39) and its report; lane 14 applies it per route (CONTRACTS R21).

## 5. Affected files and directories

Every path below is classified against CONTRACTS §4.1 (single-writer rule, longest-prefix match in `.github/QR_OWNERSHIP.json`). Lane 01 commits only to §5.1/§5.2 paths; §5.3 paths are reached through an extension point or a §13.4 request.

### 5.1 Modify (owned by lane 01)
- `packages/rendering/src/Material.ts` (`RenderState` 32-42, `DEFAULT_RENDER_STATE` 63-73, `validateRenderState`): add `blendMode?`, `depthCompareV2?` mirroring the C-04 `RenderCommandState` additions, and the C-03 `ProgramFeatureSource` default (`programFeatures()` derived from `shaderKey`/`shaderVariant` and public fields, §6.4).
- `packages/rendering/src/WebGL2Device.ts`: render state 4380-4410 (C-04 real), VAO cache 4193-4236 and buffer registry 498 (eviction), uniform upload 3695-3740 (last-value cache), present shader `ensureLdrPostprocessProgram` 3440-3640 and its uniform upload 1893-1910 (C-05; the fake `agx` :3541 / `neutral` :3547 are deleted at flag removal), render-target creation incl. 663-676 (the PR 0a `RenderTargetDescriptor` fields `dimension`, `layers`, `depthOnly`, `depthCompare`, `colorAttachments`; CONTRACTS §3.4). Carved regions (`TextureFormats.ts` 05, `TextureUpload.ts` 06, `Samplers.ts` 02, `LegacyPost.ts` 03, `ContextLifecycle/Counters/Probe/MultiDraw.ts` 11) are not touched.
- `packages/rendering/src/WebGL2StateCache.ts` (`blendFuncSeparate`, `blendEquationSeparate` dedupe, keyed by C-04 `renderStateKey`).
- `packages/rendering/src/ForwardPass.ts`: `drawItem` core (packet pool, pipeline cache), `shaderCacheKey` 681-683, instancing 1711-1803, `MAX_GPU_*` 119-121, the C-01 opaque/transparent split. Carved `forward/Lighting.ts` (02), `forward/Deform.ts` (06), `forward/DrawSubmit.ts` (11), `forward/Velocity.ts` (03), `forward/Transmission.ts` (04) are not touched.
- `packages/rendering/src/Renderer.ts`: frame order, HDR scene target, OutputPass invocation, render scale; and `renderer/FrameGraph.ts` (C-01 real). Carved `ShadowOrchestration.ts`/`Background.ts` (02), `PostprocessExecution.ts` (03, includes the CPU readback chain `Renderer.ts:977-1099`, `:1245-1282`), `CullingBatching.ts` (11, includes `applyRendererOwnedStaticBatching` :2361), `SkinnedBounds.ts` (06), `RendererFactory.ts`/`DeviceLifecycle.ts` (11) are not touched.
- `packages/rendering/src/{ShaderChunks,ShaderLibraryCore,ShaderLibrary}.ts`: frozen legacy (CONTRACTS §3.7). Edited only for accepted legacy-patch requests (§13.5) and deleted at `A3D_QR_CORE` removal.
- `packages/rendering/src/{ShaderModule,SceneOptimization,BRDFLut,Geometry,MeshConsolidation,PbrReference,ToneMapping,ColorManagement,Exposure}.ts`, and the unlit materials `{Unlit,TexturedUnlit,InstancedUnlit,MorphUnlit,SkinnedUnlit}Material.ts` (lane 01 by package default).
- `packages/engine/src/agent-api/app/colorManagement.ts` (PR 0b-1 carve of `index.ts:4192-4214`): delete `sceneExposurePresets` / `defaultExposure` lies (C-05).
- `packages/engine/src/agent-api/compiler/sceneGraph.ts` (verbatim move of `index.ts:17637-18010` by PR 0b-1 or by lane 15 T3.8 / request Q-01-5 from lane 15): matrix composition (C-06).
- `packages/engine/src/agent-api/compiler/color.ts`: color helper bodies (`index.ts:15378-15443`, `:17911`) delegating to `agent-api/color.ts`.

### 5.2 Create (owned by lane 01)
- `packages/rendering/src/program/{ProgramFeatures,ProgramKey,ProgramGenerator,ProgramCache,ProgramWarmup,MaterialFeatures}.ts` and `program/chunks/*.glsl.ts` (C-02 real). `program/UniformLayout.ts`, `program/chunks/*.wgsl.ts` and `program/chunks/manifest.ts` are lane 11's.
- `packages/rendering/src/output/{OutputPass.ts,ToneMappingOperators.glsl.ts,HdrTarget.ts}` (C-05 real).
- `packages/rendering/src/resources/{InstanceBuffer,UniformBlock}.ts` (C-07, C-08 real). `resources/MorphTargetTexture.ts` is lane 06's (R5).
- `packages/rendering/src/{BlendModes,ResolutionGovernor}.ts`, `packages/rendering/src/renderer/PixelRatio.ts` (`resolveCanvasPixelRatio`, §6.9), `packages/rendering/src/geometry/Primitives.ts` (`createPrimitiveGeometry(primitive, params, tier)` over the `Geometry.*` generators, C-07).
- `packages/engine/src/agent-api/sceneGraph.ts` and `agent-api/color.ts` (C-06 real).
- Lane files: `packages/{rendering,engine}/src/lanes/prd01.ts` (`slot.provide`, C-31 sections, C-38 `output` factory), `agent-api/compiler/diagnosticOnly.prd01.ts`, `packages/aura3d-cli/src/commands/prd01/index.ts`, `tools/quality-rebuild-codemods/core-v2.ts`, `tools/shader-lint/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/`, `tests/qr/prd01/`, `tests/unit/contracts/impl/prd01-*`, `.github/workflows/qr-prd01-*.yml`, `docs/project/aura3d-quality-rebuild/evidence/prd01/`.

### 5.3 Not edited by lane 01 (extension point or request)
| Path (owner) | Lane 01 need | Route |
|---|---|---|
| `agent-api/index.ts` remaining core (15): `createProductionSceneRenderer` 12523-12550, `configureCanvas` 18105, `devicePixelRatioSafe` 18699, resize 12294-12310, `setPerformanceQuality` 12455-12465, physics 5183/5192/5380, primitive material 14837-14984 | silent-fallback removal, DPR, render-scale ceiling, physics on world TRS, `blend` reaching render state | C-05 `onRendererError`, C-36 degradation `renderer-mount-failed`; requests Q-15-1..Q-15-6 |
| `agent-api/compiler/{primitives,geometry,renderInput,renderer}.ts` (15) | primitive generators via C-07, instance composition (R18), canvas context attributes | requests Q-15-2, Q-15-3, Q-15-7 |
| `agent-api/compiler/postprocess.ts` (03), `RendererPostprocessPlan.ts`, `renderer/PostprocessExecution.ts`, `webgl2/LegacyPost.ts`, `PostProcessPass.ts` (03) | exposure into OutputPass, linear-HDR post rule, CPU readback removal, 8-bit ping-pong | C-05/C-13 semantics; requests Q-03-1..Q-03-3 |
| `agent-api/app/rendererOptions.ts` (11), `production-runtime/GameRenderPreset.ts` (11), `RenderDevice.ts` (11), `WebGPUDevice.ts` (11), `RendererTiming.ts` (11) | profile `pixelRatio`/`preserveDrawingBuffer`, `rgba8` presets, WebGPU blend mapping, GPU timing | C-04 pre-declared fields, C-27, C-28; requests Q-11-1..Q-11-4 |
| `PBRMaterial`, `TexturedPBRMaterial`, `InstancedPBRMaterial`, `NormalMappedPBRMaterial`, `SkinnedLitMaterial` (04); `GLTFRenderResources.ts` (04) | per-class `programFeatures()` overrides; glTF `alphaMode` → `BlendMode` | C-03 `ProgramFeatureSource` default in `Material.ts`; requests Q-04-1, Q-04-2 |
| `MorphTargetPlan.ts`, `resources/MorphTargetTexture.ts`, `forward/Deform.ts` (06) | morph texture and skinning palette | C-18 (consumed) |
| `agent-api/GameAppRuntime.ts` (09) | governor wiring | request Q-09-1 |
| `LayeredSceneComposition.ts:648` (10), `WaterSurface.ts:188` (10), `AtmosphereWetness.ts:119` (07), `SpriteFlipbook.ts:119/:153` (07), particles `materialMode` (07) | one color parser; additive blend | C-06 `parseAuraColor`, C-04; requests Q-10-1, Q-07-1 |
| `packages/lean/**`, `LeanWebGL2Device.ts`, `production-runtime/index.ts` (15) | lean on core, deletions | requests Q-15-4, Q-15-5 |
| `benchmarks/quality-rebuild/shared/*`, `capture.mjs`, `tools/quality-rebuild-capture/*`, `.github/workflows/quality-rebuild-capture.yml` (12) | region metrics, diagnostics assertions | C-30 lane scenes, C-33 plugins; request Q-12-1 |
| templates (13), `apps/showcase-*` (14) | screenshot specs on `app.capture()`, app overrides | C-39 codemod `core-v2`, C-40 facts; requests Q-13-1, Q-14-1 |

### 5.4 Delete (at `A3D_QR_CORE` removal, CONTRACTS §5.4)
- Lane 01 deletes: the frozen legacy lit programs and fudges in `ShaderLibraryCore.ts:291-782`, `ShaderLibrary.ts` lit programs, `ShaderChunks.ts` fudge chunks; `production-runtime/shaders/chunks/*.glsl`; hand-written program registrations for `aura3d/pbr`, `aura3d/instanced-pbr`, `aura3d/pbr-textured` (all 10 variants), `aura3d/skinned-lit`, `aura3d/skinned-lit-8` and `aura3d/pbr-normal-map` (kept one minor as aliases mapping to features); `sceneExposurePresets` and `rendererColorManagementPreset.defaultExposure` in `app/colorManagement.ts`.
- Requested from their owners (non-blocking; lane 01 completion criteria cite them as integrated): `createWebGLSceneRenderer` and helpers (`index.ts:15982`-~`17286`, lane 15 T4.4 at `A3D_QR_STRICT` removal); `LeanWebGL2Device.ts`, `lean/LeanProductionRenderer.ts` (15); `production-runtime/materials/{MaterialCompiler,GLTFMaterialAdapter,GLTFPBRMaterialAdapter,PBRShaderFeatures}.ts` (04); `production-runtime/shaders/wgsl/{pbr,skybox}.wgsl` (11); their re-exports in `production-runtime/index.ts` (15); `renderer.qualityPresets()` / `screenshotQuality()` (`index.ts:4225-4246`, carved to `app/rendererOptions.ts`, 11; tier semantics are C-27).

## 6. Architecture proposal

### 6.1 One renderer, one contract

```
createAuraApp / createGameApp / @aura3d/lean / A3DRenderer / product viewer
            │  (all build a RenderSource; none owns GL state)
            ▼
   Renderer (packages/rendering/src/Renderer.ts)  ← the only frame owner
     ├─ FrameGraph (C-01): collect → shadows → background → opaque → after-opaque → transmission → transparent → post-hdr → output
     ├─ FrameUniforms (UBO 0 AuraFrame: camera, exposure, time; C-08)  ─┐
     ├─ LightUniforms (UBO 1 AuraLights: layout by lane 02 inside the C-08 name) ├─ uploaded once per frame/view
     ├─ ProgramCache(feature key → program, async compile; C-02)        ┘
     ├─ Opaque/transmissive/transparent queues (blend mode in the sort key; C-04)
     ├─ HDR scene target: RGBA16F (fallback R11F_G11F_B10F, then RGBA8 "degraded"), MSAA per C-27 tier
     ├─ "post-hdr" phase (C-13 passes registered by lane 03; contract: linear, scene-referred)
     └─ OutputPass (C-05): exposure → tone map → sRGB OETF → dither → overlay → canvas
            ▼
   WebGL2Device (only GL device). The WebGPU device (lane 11, C-29) conforms to the same C-04 state and C-02 program contract
```

Rules:
1. There is exactly one `RenderDevice` implementation per backend. Lane 01 makes `WebGL2Device` the single GL device; deleting `LeanWebGL2Device` (lane 15) and renegotiating bundle targets (lane 15, `BUNDLE_SIZES.md`) are requests (§13.4), and the single-renderer arch gate is lane 15's (C-29 consumer).
2. With `A3D_QR_CORE=v2`, the forward pass always writes linear scene-referred radiance. No generated program contains a tone curve or an sRGB encode. The `u_outputColorSpace` uniform and `a3dPbrEncodeOutput` exist only in the frozen legacy programs (flag-off path) and are deleted with them.
3. With `A3D_QR_CORE_OUTPUT` on (default on under `v2`), tone mapping and encode happen once, in `OutputPass`, for every route that renders through `Renderer`, including the no-effects path. Routes still on the lean device get it when lane 15 routes lean through `Renderer` (request Q-15-4).
4. No silent fallback renderer. Removing the `catch` fallback at `index.ts:12545-12548` is lane 15's change (T4.2, `app/mountRenderer.ts`, behind `A3D_QR_STRICT`). Lane 01 provides the reporting surface through C-05 `AuraOutputSurface.onRendererError` and the C-36 degradation code `renderer-mount-failed`; `createAuraApp` stays synchronous and `app.ready()` keeps its documented resolve-not-reject contract (`index.ts:10723-10726`) unless strict mode is on. When the core mount fails under strict:
   - nothing is drawn by any other renderer;
   - `diagnostics().errors` gains `{ code: "renderer-mount-failed", message, cause }`;
   - `app.onRendererError(listener)` (C-05, same shape as the existing `onDeviceLost`, `index.ts:10748`) and `console.error` (once) receive the same object;
   - lane 15's `app/errorOverlay.ts` paints `[data-aura3d-error="renderer-mount-failed"]` with `role="alert"`;
   - `app.step()` and `app.render()` become no-ops that push one warning.

   `renderer.strictMount: true` (pre-declared in PR 0a, C-38) is lane 01's alias for `A3D_QR_STRICT` scoped to mount: `ready()` rejects with `AuraRuntimeError("renderer-mount-failed")`. Tests and lane 01's capture runs set it. Removing `renderer.mode: "safe-basic"` from the type is lane 15's (`AuraMigrationError` under `A3D_QR_STRICT`).
5. A capability fallback is allowed only when it is explicit and reported: for example, when no float color-renderable format exists the target becomes RGBA8 with tone mapping folded into a final forward subpass. `diagnostics().output.degraded = "rgba8-no-float-target"` (C-05 `AuraOutputDiagnostics`, C-31 section `output`), a `capability-degraded` C-36 degradation and a one-time console warning record it.

### 6.2 Scene graph: matrix hierarchy

- Groups compose a 4×4 world matrix: `world(child) = world(parent) · local(child)`, with `local = T · R(q) · S`. Euler input is converted to a quaternion with an explicit order. The current `rotationXYZ` (`index.ts:17900-17909`) builds `Rz·Ry·Rx` for column vectors. That is the matrix three.js produces for Euler order `"ZYX"`, not `"XYZ"`. The default stays this order (named `"ZYX"` in the new API, with `rotationOrder` exposed; C-06) so every existing single-node rotation renders identically. The three-compat migration codemod (lane 15) maps three's default `"XYZ"` explicitly through C-06 `rotationOrder`.
- Where it runs: the real implementation is `agent-api/sceneGraph.ts` (C-06 `composeWorldMatrix`, `decomposeMatrix`, `eulerToQuaternion`). The flatten/compose/model-matrix code (`index.ts:17637-18010`) moves verbatim into lane 01's `agent-api/compiler/sceneGraph.ts` (PR 0b-1, or lane 15 T3.8 with request Q-01-5 to lane 01); lane 01 then rewrites the bodies there behind `A3D_QR_CORE=v2`. With the flag off the moved bodies run unchanged, so flag-off output stays bit-identical.
- `flattenSceneNodes` returns nodes with `worldMatrix: Float32Array` (column-major) and a decomposed `world: { position, quaternion, scale }` for consumers that need TRS (physics, diagnostics). If decomposition detects shear (non-uniform parent scale followed by a rotated child), the node carries `worldMatrix` only, and physics receives the nearest TRS plus a diagnostics warning `SCENE_GRAPH_SHEAR` naming the node.
- `createModelMatrix` becomes `worldMatrix · S(size ⊙ fit) · normalizeOffset`. `size` and model fit are geometry-space scales applied innermost and are never inherited by children.
- `lookAt` resolves in world space after composition: the node's world position is used, and the resulting world rotation is converted back to local rotation relative to the parent.
- Matrices are cached per node and recomputed only when a node's local transform, its animation sample, or an ancestor changes. Each node gets a dirty flag and a version counter. Runtime node handles (`setPosition`, `setRotation`, `setScale`) bump the version.

### 6.3 Primitive geometry module

`@aura3d/rendering` already has correct generators that the engine bridge does not use. `Geometry.uvSphere(radius, segments = 48, rings = 24, { textured })` is at `packages/rendering/src/Geometry.ts:264`. `Geometry.cylinder({ segments = 48, capped = true, textured })` is at `:307`; it has separate cap vertices with ±Y normals and cap winding that faces outward (top cap `(center, s+1, s)` gives +Y, bottom `(center, s, s+1)` gives −Y). `Geometry.capsule({ radius, height, segments = 48, rings = 12 })` is at `:369`. The engine instead builds its own placeholder meshes (`index.ts:17287-17479`, moved by lane 15 T3.8 into lane 15's `compiler/geometry.ts`). The fix is a lane 01 function `createPrimitiveGeometry(primitive, params, tier)` in `packages/rendering/src/geometry/Primitives.ts` over the extended rendering generators (C-07). Lane 15 routes `createProductionPrimitiveMesh` (`index.ts:14977`) to it when `A3D_QR_CORE=v2` (request Q-15-2); until that lands, lane 01's standalone scenes call it through the `@aura3d/rendering` public entry. Extensions: All generators emit position, normal, uv0, tangent (xyzw), bounds, and `Uint32Array` indices when the vertex count exceeds 65,535:

| Primitive | Generator | Parameters (default) | Change needed |
|---|---|---|---|
| sphere | `Geometry.uvSphere` | `widthSegments 64`, `heightSegments 32` | Rename parameters; default `textured: true` |
| cylinder | `Geometry.cylinder` | `radialSegments 48`, `heightSegments 1`, `openEnded false`, `radiusTop/Bottom 0.5` | Add `heightSegments`, top and bottom radii, `openEnded` (= `!capped`) |
| capsule | `Geometry.capsule` | `capSegments 8`, `radialSegments 32` | Shape comes from effective dimensions (see below) |
| torus | new `Geometry.torus` | `radius 0.43`, `tube 0.045`, `radialSegments 64`, `tubularSegments 16` | New. Keeps the current engine proportions; adds UVs and tangents |
| plane | `Geometry.litPlane` extended | `widthSegments 1`, `heightSegments 1` | Add segments; keep the CCW-from-+Y winding the engine already fixed (`index.ts:17303-17309`) |
| box | engine `createBoxGeometry` moved to `Geometry.box` | `width/height/depthSegments 1` | Move; UVs and tangents already correct |

Capsule shape: a capsule cannot be a unit mesh scaled non-uniformly, because that produces ellipsoidal caps (the engine rigs scale capsules by values like `[0.1, 0.36, 0.1]`, `index.ts:6562`). For capsules only, the effective local dimensions `D = size ⊙ localScale` are folded into generation: `radius = 0.5 · min(D.x, D.z)`, `height = max(D.y, 2 · radius)`, x/z ellipticity applied as a horizontal-only scale. The node's render matrix then uses unit local scale. Geometry is cached by `(D.y / min(D.x, D.z))` quantized to 0.01.

Tier override: when the C-27 tier has `primitiveSegments: "half"` (Low), sphere, cylinder, capsule and torus segment counts are halved at mount (the cache key includes segment counts). Geometry is shared per `(primitive, params)` across nodes; today every node builds its own.

### 6.4 Feature-keyed program generator

Replaces the hand-copied shaders.

- **Inputs:** a C-02 `ProgramFeatures` record derived from material (C-03 `ProgramFeatureSource.programFeatures()`), geometry, item and frame state (§7.2). Every field that changes generated code is in the record, including registered feature bits (`features: Record<id, value>`) from other lanes' `ShaderFeature.select()`. Fields that only change values (base color, roughness factor) are never in it. `Material.ts` supplies a default `programFeatures()` derived from `shaderKey`/`shaderVariant` and the public uniform set (`program/MaterialFeatures.ts`), so every existing material class (including lane 04's PBR classes) is generator-ready on day 0 without editing their files; lane 04 may override per class (request Q-04-1).
- **Key:** C-02 `computeProgramKey` (`program/ProgramKey.ts`): stable, order-independent, including registered feature ids and values. The key and the generated source are covered by a unit test so key collisions show up as test failures.
- **Assembly:** `#version 300 es`, precision, `#define` block from features, then lane 01 chunks (`common`, `colorspace`, `brdf`, `normal`, `instancing`, `alpha`, `lights_legacy`, `depth`) with registered chunks spliced at the C-02 hook points (`vertex:pars`, `vertex:deform`, `vertex:world`, `vertex:end`, `fragment:pars`, `fragment:alpha`, `fragment:normal`, `fragment:material`, `fragment:lights`, `fragment:indirect`, `fragment:emissive`, `fragment:fog`, `fragment:end`) in `(feature.order, feature.id)` order. Registered contributors include lane 02 shadow/IBL/lighting chunks (C-09/C-10/C-11), lane 04 lobes (C-03), lane 06 `prd06.deform` (C-18), lane 07 fog/wetness (C-21), lane 05 LOD dither, lane 08 camera fade, lane 10 wind/terrain. Chunks are TypeScript template strings so they tree-shake and type-check. A runtime `#include` resolver is not used.
- **Default bodies at each hook:** when no lane has registered a feature for a hook, lane 01's default runs, so the generator is complete with every other lane's stub: `fragment:lights` uses `lights_legacy` (reads today's `u_lightData` packing through `brdf` `a3dDirectLight`); `fragment:indirect` uses the ambient-only `irradiance · BRDF_Lambert` term plus today's single equirect env sample; `vertex:deform` is the C-18 passthrough; `fragment:fog` is the legacy linear/exp2 fog. Registered features replace the default for that hook.
- **Light loop:** a compile-time `NUM_DIR_LIGHTS`, `NUM_POINT_LIGHTS`, `NUM_SPOT_LIGHTS`, `NUM_RECT_LIGHTS` (each 0..N, unrolled) when the total is ≤ 8. Above that, `LIGHTS_CLUSTERED` with the existing cluster textures. The light count is part of the key; three.js does the same. To bound program count, light counts are bucketed to {0, 1, 2, 4, 8} with unused slots zero-intensity.
- **Uniforms:** per-frame and per-view data in UBO `AuraFrame` (binding 0, C-08 frozen order) and `AuraLights` (binding 1, layout owned by lane 02 inside the C-08 name). Per-material scalars are plain uniforms with a per-program last-value cache. Samplers are declared only when their feature is on.
- **Variants that become features rather than programs:** skinned and morph (C-18 `prd06.deform` bits: 4 or 8 influences, uniform or texture palette, morph bucket), instanced (attribute matrices, optional instance color and emissive), textured slots (one flag per map, each with its own `uvSet` and `textureTransform`), double-sided, alpha mode (opaque, mask, blend), vertex colors, fog type (C-21), shadow receive type (C-11 `ShadowReceiveFeature`), env map type (C-09), output space is always linear.
- **Depth and shadow programs:** the same generator with `pass: "depth" | "distance"`, sharing the vertex stage features (deform, instancing, alpha-test). Lane 02's `DepthPass.ts` composes C-11 `registerDepthVariantFeature` entries on top; lane 01 provides the pass, not the shadow system (research/19 C4).
- **Compile:** `ProgramCache.acquire()` returns a ready program or a pending handle. Draws whose program is pending are skipped that frame only if `renderer.compile.mode === "async-skip"`. The default mode is `"warm-then-block"`: `app.ready()` resolves after `ProgramWarmup.precompile(scene)` has compiled every key the first frame needs (current tier and C-27 `nextLowerTier`), using `KHR_parallel_shader_compile` with `COMPLETION_STATUS_KHR` polling when C-28 `probe.parallelShaderCompile` is true. Link status is checked only after completion. `app.precompile` is the C-38 flattened method.
- **WebGPU:** the feature record and chunk set are backend-neutral data. WGSL emission is lane 11's (C-02 `ShaderChunk.wgsl` twins, `program/chunks/*.wgsl.ts`). `generateProgram({ target: "wgsl" })` returns lane 11's emitter when provided; otherwise it throws `WGSL_PROGRAM_MISSING` and the C-29 factory keeps WebGL2.

### 6.5 Color and HDR pipeline contract

| Stage | Space | Format | Owner (contract) |
|---|---|---|---|
| Authored colors (hex, CSS, numbers) | sRGB → linear at parse | float | lane 01 (`color.ts`, C-06) |
| Color textures | sRGB, hardware decode (`SRGB8_ALPHA8`; compressed sRGB formats) | — | lane 05 (C-16), lane 04 (C-12) |
| Forward shading | linear scene-referred radiance, unbounded | RGBA16F MSAA | lane 01 (C-02, C-05) |
| Environment and IBL inputs | linear HDR (no Reinhard pre-encode) | RGBA16F | lane 02 (C-09) |
| Background | linear; tone-mapped with the scene by default; `toneMapped: false` opt-out | — | lane 01 (C-05); environment backgrounds lane 02 (C-09), sky lane 07 (C-21) |
| HDR post (AO, SSR, DOF, motion blur, TAA, bloom, volumetrics) | linear | RGBA16F | lane 03 kernels (C-13) in C-01 phase `post-hdr`; lane 01 owns only the phase and the linear rule |
| OutputPass | exposure · operator → display-linear → sRGB OETF → triangular dither (±1 LSB) → overlay | RGBA8 canvas | lane 01 (C-05) |
| Display-space ops (grade, vignette, LUT, FXAA/SMAA, grain) | display-referred | RGBA8 ping-pong | lane 03 (C-13 output presets) |

Background opt-out: a depth test cannot identify background pixels. Transparent, additive and particle draws do not write depth, so glow over the sky would be treated as background and skip tone mapping. Instead, when any background declares `toneMapped: false`, the program feature `backgroundCoverage` adds a second color attachment, `R8` "coverage" (MRT location 1). It is cleared to 0, and every forward fragment writes `outCoverage = 1.0`. Under the shared blend state the result is the drawn coverage: alpha → `a`, premultiplied → 1, additive → `a` (`SRC_ALPHA, ONE`), multiply → 0, which is acceptable because multiply only darkens. `OutputPass` computes `display = mix(clamp(hdr, 0, 1), TONE_MAP(hdr · exposure), coverage)`. Cost: 1 B/px plus its MSAA resolve, paid only when the feature is on. This replaces `colorToAcesInputClearColor`.

Operator input convention: `OutputPass` multiplies by exposure once (`hdr · u_exposure`) before `TONE_MAP`. The ported three.js operators therefore have their internal `color *= toneMappingExposure` line removed. Otherwise exposure is applied twice, as it would be for `linear`, `reinhard`, `aces` (`toneMappingExposure / 0.6` becomes `/ 0.6`), `agx` and `neutral`.

Operators (all GLSL in `ToneMappingOperators.glsl.ts`, ported from three.js r185 `tonemapping_pars_fragment.glsl.js`, which is present at `node_modules/three@0.185.1`):
- `none`: clamp to [0,1].
- `linear`: `x` (already exposed), clamped.
- `reinhard`: `x / (1 + x)`, clamped.
- `aces`: keep the existing fitted ACES (`WebGL2Device.ts:3501-3517`). It already uses three's `ACESInputMat` / `ACESOutputMat` and the `/ 0.6` prescale (`:3514`).
- `agx`: three r185 `AgXToneMapping`: Rec.709 → Rec.2020, inset matrix, `log2` encode clamped to [−12.47393, 4.026069] EV, 6th-order polynomial sigmoid, outset matrix, `pow(x, 2.2)` linearize, Rec.2020 → Rec.709.
- `neutral`: Khronos PBR Neutral: `startCompression = 0.8 − 0.04`, `desaturation = 0.15`, min-channel offset, peak compression on the max channel, desaturation toward peak.

Default operator: `"aces"`, frozen as C-05 `DEFAULT_TONE_MAPPING` for continuity with every existing game and with the benchmark spec (`benchmarks/quality-rebuild` passes ACES to both engines). Lane 01 prepares the ACES-vs-AgX A/B (Phase 5); lane 12 runs it at a checkpoint. The default changes to `"agx"` only in a separate lane 01 PR that edits the value in `contracts/output.ts` (value change, no CCR per C-05; custodian review) and links the checkpoint A/B record showing no game regressing under vision and human review.

Exposure (C-05): `OutputPass` applies one multiplier, `u_exposure = output.exposure × upstreamExposure`. `output.exposure` comes from `app.setOutput` / `renderer.output.exposure` (lane 01, default 1). `upstreamExposure` is read from the C-01 blackboard key `"prd03.exposure"` (grade × auto-exposure, produced by lane 03 through C-13; default 1 when absent). `effects.colorGrade({ exposure })` therefore changes pixels once lane 03's `compiler/postprocess.ts` publishes it (request Q-03-1); lane 01's own `output.exposure` works standalone. Diagnostics report the value actually sent (`AuraOutputDiagnostics.exposure.applied` and `.source`).

Overlay (C-05): `OutputPassOptions.overlay` (flash, vignette, shape, fade) is applied after the encode-space conversion and before the 8-bit write, once, in the output shader; zero overlay is bit-identical to no overlay. This serves lane 09's juice overlay (request Q-01-1 from lane 09, accepted) and lane 07's `super-flash`.

### 6.6 PBR core corrections (shared `brdf` chunk)

All generated programs use one `brdf` chunk:
- F0, in the same order as three r185 `lights_physical_fragment.glsl.js:45-46`: `specularColor = min(pow2((ior − 1)/(ior + 1)) · specularColorFactor, 1) · specularIntensity`, then `specularColorBlended = mix(specularColor, baseColor, metallic)` and `F90 = mix(specularIntensity, 1, metallic)`. `ior` defaults to 1.5, which gives 0.04. Both `specularColor` (dielectric) and `specularColorBlended` are kept in `PhysicalMaterial`, because the IBL path needs the dielectric value separately.
- Diffuse: Lambert `baseColor · (1 − metallic) / π` (three's `diffuseContribution`) by default, matching glTF and three.js. Burley stays behind `#define DIFFUSE_BURLEY` for opt-in materials; its `energyFactor` is removed.
- Direct specular: GGX D, height-correlated Smith V, Schlick F, unchanged math, evaluated with `specularColorBlended`. Multiscatter compensation is a verbatim port of three r185 `BRDF_GGX_Multiscatter` (`lights_physical_pars_fragment.glsl.js:424-460`): DFG is sampled at both V and L; `FssEss_{V,L} = Fblend · dfg.x + F90 · dfg.y`; `Ems = 1 − (dfg.x + dfg.y)` per direction; `Favg = Fblend + (1 − Fblend)/21`; `Fms = FssEss_V · FssEss_L · Favg / (1 − Ems_V · Ems_L · Favg + ε)`; result `single + Fms · Ems_V · Ems_L`. The simpler `1 + F0(1/Ess − 1)` scale is not used, because it would not match the r185 reference test.
- DFG LUT: replace the approximate RGBA8 LUT (`BRDFLut.ts`) with the r185 16×16 RG16F table. Copy the `DATA` array verbatim from `node_modules/three/src/renderers/shaders/DFGLUTData.js` (MIT; keep the attribution header) into `packages/rendering/src/BRDFLut.ts`. It is linear-filtered and clamp-to-edge, and sampled as `texture(u_dfgLut, vec2(roughness, dotNV))`: x = roughness, y = dotNV, the opposite of the current Aura lookup `vec2(nDotV, roughness)`. It is a renderer-owned global texture bound for every lit program, not a material option (today it is optional: `TexturedPBRMaterial.ts:459-460`).
- Indirect: port r185 `RE_IndirectSpecular_Physical`. Run `computeMultiscattering` separately for the dielectric `specularColor` and the metallic `diffuseColor` (base), mix single and multi by metalness, and weight diffuse by `diffuseContribution · (1 − (singleDielectric + multiDielectric))`. Irradiance is cosine-weighted by `RECIPROCAL_PI`. This replaces `a3dPbrEnvironmentLightSplitSum` (§2.6) on generated programs. Probe normalization feeding `irradiance` and `radiance` is lane 02's (C-09 chunk at `fragment:indirect`); lane 01's default indirect body uses unit-normalized inputs so the BRDF math is testable alone.
- Specular AA (three r185 `lights_physical_fragment` lines 6-11 per research/03 §2): `vec3 dxy = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal))); float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z); roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0);` using the interpolated, non-normal-mapped normal.
- Ambient irradiance: `irradiance = ambientColor · ambientIntensity` and `diffuse += irradiance · BRDF_Lambert(diffuseColor)`, i.e. divide by π, with no hemisphere factor. Hemisphere lighting becomes an explicit light type (C-10 `lights.hemisphere`, lane 02; `ProgramFeatures.lights.hemisphere` bit reserved by C-02).
- Removed, not ported: `mix(1.1, 0.65, r)` and `mix(1.1, 0.85, r)` specular scales, `reflectionBand` / `roughEnvironmentFloor` procedural specular and the textured "stripes", `mix(1.0, 0.18, anisotropy)` on env and direct terms, `a3dApplyAdvancedPbrLobes`, `a3dApplyMetalRough`, `a3dPbrClampSampledSpecularEdgeEnergy`, source-paint gates, red-gated direct AO, and dual equirect+cube sampling. Extension lobes (clearcoat, sheen, anisotropy, iridescence, transmission) are lane 04's, registered through C-03 on top of this chunk's `PhysicalMaterial` struct. The generator includes every lobe returned by `materialLobes(flags)`. With none registered (the C-03 stub registry is real but empty until lane 04 registers), a material declaring an extension renders the base lobe only and records the C-36 degradation `extension-lobe-pending` with `ownerPrd: 4`. Lane 04's request Q-01-5 (r185 `brdf` chunk and `PhysicalMaterial` fields) is accepted and is exactly §8.3.
- AO: occlusion maps apply to indirect diffuse and, via `computeSpecularOcclusion`, indirect specular only, never to direct light.

### 6.7 Draw submission without per-draw allocation

- **`DrawPacket` pool:** one reusable object per render item per frame, holding a program handle, a pipeline-state key (u32), a VAO handle, a material uniform block and an instance count. `ForwardPass` builds packets into a typed array-backed queue and sorts by `(passBucket, blendMode, programId, materialId, depth)`.
- **`RenderPipeline` cache:** `(programId, renderStateKey, vertexLayoutKey)` → pipeline, created once.
- **Uniform last-value cache:** per program location, compare before `uniform*` calls (three's `WebGLUniforms` cache pattern).
- **UBOs:** `AuraFrame` (viewProjection, view, projection, cameraPosition, exposure, time, resolution, near/far) is uploaded once per view. `AuraLights` is uploaded once per frame. This also lets post read near/far from the same block (C-08) instead of the hard-coded `{ near: 0.1, far: 1000 }` (`WebGL2Device.ts:865`, now in lane 03's `webgl2/LegacyPost.ts`; lane 03 switches it, research/02 §3.7).
- **`InstanceBuffer`:** persistent and owned by the source node; `version` bumps on change; upload with `bufferSubData` only when the version changes. Grows by doubling; never per-frame `createBuffer`. The 64-instance uniform path is removed; all instancing uses attribute matrices (`a_instanceMatrix0..3`) plus optional `a_instanceColor`. The VAO cache key uses persistent buffer ids, and `WebGL2Device` deletes VAOs referencing a buffer when that buffer is disposed. `this.buffers` removes entries on dispose.
- **Static batching:** merge at mount for nodes marked static (no runtime handle, no animation, C-07 `AuraPrimitiveNode.static`), using lane 01's `MeshConsolidation` (research/07 §3.3). Removing the per-frame regrouping in `Renderer.ts:2361-2385` is inside lane 11's `renderer/CullingBatching.ts` carve and is requested (Q-11-3); lane 01 only exposes `consolidateStatic(items)` from `MeshConsolidation.ts`.
- **Deformation (C-18, lane 06):** lane 01 does not build morph textures or skinning palettes (CONTRACTS R5). The generator splices `prd06.deform` at `vertex:deform` (lane 06 request Q-01-2, accepted), the device binds `"2d-array"` textures to `TEXTURE_2D_ARRAY` units (lane 06 request Q-01-3, accepted), and lane 01's zero-allocation budget (§19) counts the C-18 cache's own `createdThisFrame` as reported.

### 6.8 Blend modes

`RenderState.blend` becomes a `BlendMode` (§7.2). Device mapping (WebGL2 `blendEquationSeparate` / `blendFuncSeparate`):

| Mode | color eq / src / dst | alpha eq / src / dst | depthWrite default | Queue |
|---|---|---|---|---|
| `opaque` | disabled | disabled | true | opaque |
| `alpha` | ADD / SRC_ALPHA / ONE_MINUS_SRC_ALPHA | ADD / ONE / ONE_MINUS_SRC_ALPHA | false | transparent, back-to-front |
| `premultiplied` | ADD / ONE / ONE_MINUS_SRC_ALPHA | ADD / ONE / ONE_MINUS_SRC_ALPHA | false | transparent, back-to-front |
| `additive` | ADD / SRC_ALPHA / ONE | ADD / ZERO / ONE | false | transparent (order-independent) |
| `multiply` | ADD / DST_COLOR / ONE_MINUS_SRC_ALPHA | ADD / ZERO / ONE | false | transparent |
| `custom` | user-specified | user-specified | user | user |

Additive and premultiplied draws accumulate into the HDR target, so additive emissive VFX adds energy that bloom (lane 03, C-13) can isolate. Alpha writes keep the canvas opaque (`alpha: false` context). `WebGL2StateCache` gains `blendFuncSeparate` and `blendEquationSeparate` dedupe. Contract form (C-04): `RenderCommandState.blendMode?` and `depthCompareV2?` are the PR 0a optional fields and win over the legacy `blend: boolean` / `depthCompare` when present; `resolveBlendMode` maps the legacy boolean (`true` → `alpha`). Lane 03's `(srcRGB, dstRGB, ZERO, ONE)` indirect-fraction blend (request Q-01-1 from lane 03) is a `custom` mode and needs no new member.

### 6.9 Resolution policy and governor

- Default `pixelRatio = min(devicePixelRatio, tier.maxPixelRatio)` with C-27 `maxPixelRatio` (Low 1, Medium 1.5, High 2, Ultra 3). An explicit `options.pixelRatio` wins (C-27 semantics). Lane 01 implements the policy as a pure function `resolveCanvasPixelRatio({ devicePixelRatio, tier, explicit, resolution })` in `packages/rendering/src/renderer/PixelRatio.ts` and uses it inside `Renderer` for its own canvases. The engine call sites (`configureCanvas` `index.ts:11133`, `:12280`; `devicePixelRatioSafe` clamp `:18700`; resize `:12294-12310`) are lane 15's and switch to it under `A3D_QR_CORE=v2` (request Q-15-1). Removing the fixed profile `pixelRatio` values (`index.ts:4256`, `:4271`, `:4286`, now `app/rendererOptions.ts`) is lane 11's (request Q-11-1).
- Re-evaluate on `resize` and on `matchMedia("(resolution: <current>dppx)")` change (same function, same request).
- `ResolutionGovernor` (`packages/rendering/src/ResolutionGovernor.ts`, lane 01) is the single render-scale state machine; lane 11's `quality/QualityGovernor.ts` wraps it for feature steps and tier changes (C-27 `forceRenderScale`). It samples C-28 FrameStats (`gpuMs` from timer queries when lane 11 provides them, else CPU frame interval). It adjusts `renderScale ∈ [tier.minRenderScale, 1]` in 0.1 steps with hysteresis: down after 30 consecutive frames over `targetFrameMs · 1.1`, up after 120 frames under `targetFrameMs · 0.8`. It applies to the scene target only, inside `Renderer` (lane 01), so it is standalone. `OutputPass` upsamples bilinearly; the CAS-style sharpen is lane 03's (C-13). On HiDPI the governor floor is `1/devicePixelRatio`, so the scene never drops below 1 CSS pixel = 1 render pixel unless `allowSubCssResolution: true`.
- Existing mechanisms are rewired by their owners, not kept in parallel (§2.8):
  - `AuraPerformanceQuality.resolutionScale` / `app.setPerformanceQuality()` (`index.ts:12455-12465`, lane 15) sets a manual `renderScale` ceiling through `Renderer.setRenderScaleCeiling(scale)` instead of resizing the canvas backing store (request Q-15-1).
  - `createPerformanceGovernor`'s `resolutionScale` step (`GameRenderPreset.ts:158`, `RESOLUTION_STEPS` `:130`, lane 11) calls `ResolutionGovernor` and keeps `particleScale`, `lodBias` and `shadowSize` (request Q-11-2); `GameAppRuntime.ts:127-139` (lane 09) follows (request Q-09-1).
  - The effective scale is `min(manual ceiling, governor scale)`, and the C-31 `resolution` section reports both.
- Canvas context: `antialias: false` (MSAA happens on the offscreen target), `preserveDrawingBuffer: false`, `alpha: false`, `powerPreference: "high-performance"`. The engine's context creation (`index.ts:13586-13597`, now `compiler/renderer.ts`, lane 15) switches under `A3D_QR_CORE=v2` (request Q-15-3); the C-29 factory defaults are lane 11's. Playwright `page.screenshot` (used by both quality-rebuild capture tools, §2.10a) is unaffected. For code that reads the canvas itself, C-05 `app.capture(): Promise<ImageBitmap | Blob>` renders a frame and reads it back in the same task, before compositing (lane 01 real). For one minor release, `renderer.debug.preserveDrawingBuffer: true` (C-38 pre-declared) restores the old attribute, with a dev warning, for readback consumers not yet migrated (§15 Phase 2).

## 7. APIs to add, change, remove

### 7.1 Public engine API (`@aura3d/engine`; types in `packages/engine/src/agent-api/index.ts`, owned by lane 15)

Every engine-facing field and member below is pre-declared in PR 0a as optional and inert (CONTRACTS §3.1 item 3, C-05, C-06, C-07, C-15, C-38) with a JSDoc `@qrOwner prd01 @contract C-NN` tag, and listed in `agent-api/compiler/diagnosticOnly.prd01.ts` until lane 01 wires it. Lane 01 never edits `index.ts` itself: it wires behaviour from its own files (`lanes/prd01.ts` C-38 `output` factory, `app/colorManagement.ts`, `compiler/{sceneGraph,color}.ts`, `agent-api/{sceneGraph,color}.ts`) or by request (§13.4). The tier type is C-27's (CONTRACTS R1): `"auto"` appears only in option types.

```ts
// ---- Renderer options (PR 0a pre-declared; lane 01 semantics) ----
import type { AuraQualityTier } from "@aura3d/engine/contracts";        // C-27, "low" | "medium" | "high" | "ultra"
export type AuraToneMappingOperator = "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral"; // C-05

export interface AuraRendererOutputOptions {
  /** Default "aces" (see §6.5 for the A/B decision gate). */
  readonly toneMapping?: AuraToneMappingOperator;
  /** Linear multiplier applied before the operator. Default 1. */
  readonly exposure?: number;
  /** Triangular ±1 LSB dither before 8-bit write. Default true. */
  readonly dithering?: boolean;
}

export interface AuraResolutionOptions {
  /** Default "device": min(devicePixelRatio, tier.maxPixelRatio). */
  readonly pixelRatio?: number | "device";
  readonly maxPixelRatio?: number;
  /** Dynamic resolution. Default true for "auto" tier, false otherwise. */
  readonly dynamic?: boolean;
  readonly targetFrameMs?: number;      // default 16.7
  readonly minRenderScale?: number;     // default tier.minRenderScale
  readonly allowSubCssResolution?: boolean; // default false
}

export interface AuraCreateAppRendererOptions {
  readonly quality?: AuraQualityTier | "auto" | { tier: AuraQualityTier | "auto"; overrides?: Partial<AuraQualityTierSettings> }; // C-27 (lane 11)
  readonly output?: AuraRendererOutputOptions;     // C-05 (lane 01); same shape as AuraOutputOptions
  readonly resolution?: AuraResolutionOptions;     // lane 01
  readonly msaa?: 0 | 2 | 4;                       // lane 01, default by C-27 tier
  readonly compile?: { readonly mode?: "warm-then-block" | "async-skip" }; // lane 01 (C-02 warm-up)
  readonly strictMount?: boolean;                  // lane 01 alias of A3D_QR_STRICT scoped to mount (§6.1 rule 4)
  readonly debug?: { readonly preserveDrawingBuffer?: boolean }; // lane 01, temporary (one minor), dev warning
  readonly textureBudgetBytes?: number;            // unchanged
  /** @deprecated Mapped to `quality` by lane 11 (C-27 "qualityProfile" alias); "safe-basic" maps to "low". */
  readonly qualityProfile?: AuraRendererQualityProfileId;
  // mode?/fallback?: removed by lane 15 under A3D_QR_STRICT (AuraMigrationError)
}

export interface AuraCreateAppOptions {
  // ...existing...
  /** @deprecated use renderer.resolution.pixelRatio. Still honored; wins over defaults. */
  readonly pixelRatio?: number;
}

export interface AuraApp /* extends AuraAppExtensionMap (C-38): member `output: AuraOutputSurface` + flattened methods */ {
  // ...existing...
  /** C-05. Renders one frame and reads it back in the same task (no preserveDrawingBuffer needed). With A3D_QR_CORE_OUTPUT the image is the post-OutputPass result. */
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  /** EXISTING method, signature unchanged. Additionally awaits ProgramWarmup (C-02) under A3D_QR_CORE=v2.
   *  Still resolves on mount failure unless strict (§6.1 rule 4). */
  ready(): Promise<void>;
  /** C-05. Fires on renderer-mount-failed and other fatal renderer errors. Returns an unsubscribe function. */
  onRendererError(listener: (error: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
  /** C-05. Partial update; triggers a redraw on static scenes. */
  setOutput(output: Partial<AuraOutputOptions>): void;
  /** C-05. Juice overlay; real path is the OutputPass shader, stub is the DOM overlay. */
  setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
}

// ---- Scene graph (change) ----
export type AuraEulerOrder = "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX";
export interface AuraTransformSpec {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;                 // radians, interpreted with rotationOrder
  readonly rotationOrder?: AuraEulerOrder;      // NEW, default "ZYX" (= current Rz·Ry·Rx behaviour)
  readonly quaternion?: readonly [number, number, number, number]; // NEW, wins over rotation
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;                   // resolved in world space after composition
}

/** Flattened node as produced by the scene compiler (internal type, exported for diagnostics). */
export interface AuraWorldTransform {
  readonly matrix: Float32Array;                 // column-major 4x4
  readonly position: AuraVec3;
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: AuraVec3;
  readonly sheared: boolean;
}

// ---- Primitives (change) ----
export interface AuraPrimitiveTessellation {
  readonly widthSegments?: number;    // sphere (64), plane (1), box (1)
  readonly heightSegments?: number;   // sphere (32), cylinder (1), plane (1), box (1)
  readonly depthSegments?: number;    // box (1)
  readonly radialSegments?: number;   // cylinder (48), capsule (32), torus (64)
  readonly tubularSegments?: number;  // torus (16)
  readonly capSegments?: number;      // capsule (8)
  readonly openEnded?: boolean;       // cylinder (false)
  readonly radiusTop?: number;        // cylinder (0.5), unit space before size
  readonly radiusBottom?: number;     // cylinder (0.5)
  readonly tube?: number;             // torus (0.045)
}
export interface AuraPrimitiveOptions extends AuraTransformSpec {
  // ...existing fields...
  readonly tessellation?: AuraPrimitiveTessellation; // NEW
}

// ---- Materials (C-15 fields pre-declared in PR 0a; blend/depthWrite/ior semantics are lane 01's, lobes are lane 04's via C-03) ----
export type AuraBlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply";
export interface AuraMaterialSpec {
  // ...existing...
  readonly blend?: AuraBlendMode;   // NEW; default "opaque", or "alpha" when opacity < 0.999 (current behavior)
  readonly ior?: number;            // EXISTING field, now reaches F0 (default 1.5)
  readonly specularIntensity?: number;      // NEW alias of specularFactor (glTF naming)
  readonly specularColor?: AuraColor;       // NEW alias of specularColorFactor
  readonly depthWrite?: boolean;            // NEW explicit override
}

// ---- Scene background (change) ----
// scene().background(color, { toneMapped?: boolean })   NEW option, default true

// ---- Color parsing (change) ----
export type AuraColor = `#${string}` | string | number; // number = 0xRRGGBB
/** Throws AuraColorParseError on unparseable input. Accepts #rgb, #rgba, #rrggbb, #rrggbbaa,
 *  rgb()/rgba()/hsl()/hsla(), CSS named colors, and numbers. Returns linear RGBA. */
export function parseAuraColor(color: AuraColor): readonly [number, number, number, number];
```

Removed from the public type surface: `AuraRendererMode`, `AuraRendererFallbackMode`, `AuraRendererQualityProfile.pixelRatio`, `.preserveDrawingBuffer`, `.maxRecommendedDrawCalls`, `.requestedFeatures`, `.supportedInRoot`, `.blockedInRoot`; `rendererQualityPresets`, `screenshotQuality`, `sceneExposurePresets`; `AuraRendererDiagnosticReport.exposure: AuraSceneExposurePreset`, which becomes `exposure: number`, the value actually sent. The deprecation calendar and the export-manifest removal are lane 15's (request Q-15-5). Lane 01's requirement, checked by its own test `tests/qr/prd01/unit/no-lying-metadata.test.ts`, is that none of these fields survive in a form that reports a value the renderer does not use.

Diagnostics (C-31 sections registered by lane 01 from `packages/engine/src/lanes/prd01.ts`; the stub reports `null` for each until then):
```ts
readonly output: {
  readonly toneMapping: AuraToneMappingOperator;
  readonly exposure: number;
  readonly dithering: boolean;
  readonly targetFormat: "rgba16f" | "r11g11b10f" | "rgba8";
  readonly degraded?: "rgba8-no-float-target";
};
readonly resolution: { readonly pixelRatio: number; readonly renderScale: number; readonly backingWidth: number; readonly backingHeight: number };
readonly programs: { readonly compiled: number; readonly pending: number; readonly compileMsTotal: number; readonly keys?: readonly string[] };
readonly frameAllocations?: { readonly jsHeapDeltaBytes: number; readonly glObjectsCreated: number }; // dev builds only
```

### 7.2 Rendering package (`@aura3d/rendering`)

```ts
// contracts/blend.ts (C-04, frozen in PR 0a; lane 01 implements). `RenderDevice.ts` is lane 11's, so the device-level
// `RenderCommandState` (RenderDevice.ts:135-161) is NOT retyped: PR 0a adds optional `blendMode?`, `depthCompareV2?`
// and `alphaToCoverage?` that win when present; `blend: boolean` (:139) and `depthCompare` (:140) remain.
// Lane 01 adds the same optional fields to the material-level `RenderState` (Material.ts:32-42, default :63-73).
export type BlendFactor = "zero" | "one" | "src-color" | "one-minus-src-color" | "src-alpha" | "one-minus-src-alpha"
  | "dst-color" | "one-minus-dst-color" | "dst-alpha" | "one-minus-dst-alpha";
export type BlendEquation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export interface BlendComponent { readonly equation: BlendEquation; readonly src: BlendFactor; readonly dst: BlendFactor }
export type BlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply"
  | { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
export type DepthCompare = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
// RenderCommandState / RenderState additions (optional):
//   readonly blendMode?: BlendMode;          // wins over `blend` when present
//   readonly depthCompareV2?: DepthCompare;  // wins over `depthCompare` when present
//   readonly alphaToCoverage?: boolean;      // semantics lane 04 (request Q-01-6 from lane 04 accepted: ForwardPass copies it)
export function resolveBlendMode(state: RenderCommandState): Exclude<BlendMode, string> | "opaque";  // legacy true → alpha
export function renderStateKey(state: RenderCommandState): number; // u32 for sort and pipeline cache (scissor excluded: dynamic state); stable across WebGL2 and WebGPU

// contracts/program.ts (C-02, frozen in PR 0a; lane 01's program/*.ts provide the real implementation via slot.provide)
// ProgramFeatures, TextureSlotFeature, ShadowReceiveFeature, MaterialExtensionFeature, ShaderChunk, ShaderFeature,
// ShaderHookPoint, computeProgramKey, generateProgram, ProgramHandle, ProgramCacheLike, programCacheSlot are exactly the
// C-02 signatures. Fields contributed by other lanes, read but not defined here:
//   extensions (C-03, lane 04), shadows (C-11, lane 02), environment (C-09, lane 02), fog incl. "volumetric" (C-21, lane 07),
//   skinning/morph (C-18 prd06.deform bits, lane 06), instancing.emissive and drawId (lane 11), features{} (any registered ShaderFeature).
import type { ProgramFeatures, ProgramCacheLike, GeneratedProgram } from "./contracts/program";

// program/ProgramGenerator.ts (real for generateProgram; throws PROGRAM_GENERATOR_PENDING only in the stub)
export function generateProgram(features: ProgramFeatures): GeneratedProgram;

// program/ProgramCache.ts (real for programCacheSlot)
export class ProgramCache implements ProgramCacheLike {
  constructor(device: RenderDevice, options?: { readonly parallelCompile?: boolean }); // parallelCompile default: C-28 probe.parallelShaderCompile
  acquire(features: ProgramFeatures): ProgramHandle;
  precompile(featureList: readonly ProgramFeatures[]): Promise<void>;
  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number };
  dispose(): void;
}
// program/MaterialFeatures.ts: default C-03 ProgramFeatureSource for any Material without an override
export function deriveProgramFeatures(material: Material, ctx: MaterialFeatureContext): ReturnType<ProgramFeatureSource["programFeatures"]>;

// Material.ts (change)
export abstract class Material {
  /** Replaces shaderKey/shaderVariant for lit and unlit built-ins. Custom materials keep shaderKey. */
  abstract programFeatures(context: MaterialFeatureContext): Omit<ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage">;
}

// output/OutputPass.ts (real for C-05 OutputPassLike; OutputPassOptions incl. `overlay?: OutputOverlayUniforms` is the C-05 type)
export class OutputPass implements OutputPassLike { constructor(device: RenderDevice); execute(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions, output: RenderTarget | "canvas"): void }
// output/HdrTarget.ts (real for C-05 probeHdrTargetFormat: rgba16f → r11f_g11f_b10f → rgba8 degraded)
export function probeHdrTargetFormat(device: RenderDevice): HdrTargetFormat;

// resources/InstanceBuffer.ts (real for C-07 instanceBufferSlot; InstanceBufferLike signature)
export class InstanceBuffer implements InstanceBufferLike {
  constructor(device: RenderDevice, capacity: number, options?: { readonly colors?: boolean });
  readonly count: number; readonly version: number;
  setMatrices(matrices: Float32Array, count?: number): void;    // bumps version; count > capacity throws INSTANCE_CAPACITY_EXCEEDED
  setColors(colors: Float32Array): void;                        // bumps version
  bind(): { readonly matrixBuffer: RenderBuffer; readonly colorBuffer?: RenderBuffer };
  dispose(): void;                                              // also evicts dependent VAOs
}

// resources/UniformBlock.ts (real for C-08 FrameUniformsLike; std140 offsets of the frozen AURA_FRAME_BLOCK)
export class FrameUniforms implements FrameUniformsLike { constructor(device: RenderDevice); update(camera: FrameCamera, timeSeconds: number, exposure: number, flags: number): void; readonly buffer: RenderBuffer | null }
export function packStd140(layout: readonly (readonly [string, "float" | "vec2" | "vec3" | "vec4" | "mat4"])[]): { readonly byteLength: number; readonly offsets: Readonly<Record<string, number>> };

// Morph textures and skinning palettes: C-18 (lane 06). Lane 01 defines no MorphTargetTexture type (CONTRACTS R5).

// renderer/FrameGraph.ts (real for C-01: ForwardPass split into opaque + transparent, contributor transparents interleaved
// by sortDepth, sceneDepthCopy published after opaque, FrameCamera.previousViewProjectionMatrix filled)
// registerFrameContributor / frameContributors are exactly the C-01 signatures.

// geometry/Primitives.ts (C-07 real; engine placeholder generators index.ts:17287-17479 stay in lane 15's compiler/geometry.ts for flag-off)
export function createPrimitiveGeometry(primitive: AuraBuiltinPrimitive, params: AuraPrimitiveTessellation | undefined, tier: Pick<AuraQualityTierSettings, "primitiveSegments">, effectiveDimensions?: readonly [number, number, number]): Geometry;
export interface UVSphereGeometryOptions { readonly textured?: boolean }                    // existing; default textured → true
export interface CylinderGeometryOptions { readonly radius?: number; readonly radiusTop?: number; readonly radiusBottom?: number;
  readonly height?: number; readonly segments?: number; readonly heightSegments?: number; readonly capped?: boolean; readonly textured?: boolean }
export interface CapsuleGeometryOptions { readonly radius?: number; readonly height?: number; readonly segments?: number;
  readonly rings?: number; readonly ellipticity?: number /* x/z ratio */; readonly textured?: boolean }
export interface TorusGeometryOptions { readonly radius?: number; readonly tube?: number; readonly radialSegments?: number; readonly tubularSegments?: number }
export interface PlaneGeometryOptions { readonly widthSegments?: number; readonly heightSegments?: number }
export interface BoxGeometryOptions { readonly widthSegments?: number; readonly heightSegments?: number; readonly depthSegments?: number }
// class Geometry { static torus(o?: TorusGeometryOptions): Geometry; static box(o?: BoxGeometryOptions): Geometry;
//                  static litPlane(o?: PlaneGeometryOptions): Geometry; /* existing uvSphere/cylinder/capsule extended */ }

// ResolutionGovernor.ts (new; wrapped by lane 11's QualityGovernor)
export interface ResolutionGovernorOptions { readonly targetFrameMs: number; readonly minRenderScale: number; readonly maxRenderScale: number; readonly hysteresisDownFrames?: number; readonly hysteresisUpFrames?: number }
export class ResolutionGovernor { constructor(o: ResolutionGovernorOptions); sample(frameMs: number, gpuMs?: number): number /* renderScale */; reset(): void }

// renderer/PixelRatio.ts (new)
export function resolveCanvasPixelRatio(o: { readonly devicePixelRatio: number; readonly tier: Pick<AuraQualityTierSettings, "maxPixelRatio">; readonly explicit?: number; readonly resolution?: AuraResolutionOptions }): number;

// Renderer.ts (change). RendererCreateOptions / backend selection are lane 11's (C-29); lane 01 adds render-time options only.
export interface RendererRenderOptions {
  readonly msaa?: 0 | 2 | 4;
  readonly hdrTarget?: "auto" | "rgba16f" | "r11g11b10f";   // "auto" = C-05 probeHdrTargetFormat
}
// Renderer#setRenderScaleCeiling(scale: number): void   (manual ceiling; effective = min(ceiling, governor))
```

Removed from `@aura3d/rendering` at `A3D_QR_CORE` removal (lane 01): `ForwardPass` option `outputColorSpace`, the `u_outputColorSpace` contract, `MAX_GPU_INSTANCES` export, and the hand-registered shader names (`aura3d/pbr`, `aura3d/pbr-textured`, `aura3d/instanced-pbr`, `aura3d/skinned-lit(-8)`, `aura3d/pbr-normal-map`), each kept one minor as a deprecated alias resolving to generator features. `MAX_GPU_MORPH_*` are lane 06's (C-18, lane 06 request Q-01-1 accepted). `LeanWebGL2Device`/`LeanProductionRenderer` are lane 15's.

## 8. Shader changes (GLSL level; WGSL twins by lane 11 through C-02 `ShaderChunk.wgsl`)

All shader work below is in generated programs (`program/chunks/*.glsl.ts`) and the output shader, reached only with `A3D_QR_CORE=v2` / `A3D_QR_CORE_OUTPUT`. The frozen legacy programs (`ShaderLibrary*.ts`, `ShaderChunks.ts`) are not edited except for accepted legacy-patch requests (§13.5, CONTRACTS §3.7).

### 8.1 Removed from every generated program
- `uniform float u_outputColorSpace;` and `a3dPbrEncodeOutput` (legacy: `ShaderLibraryCore.ts:588-593`, `ShaderLibrary.ts:406-411`, `:2466-2468`). The fragment output is `outColor = vec4(max(radiance, 0.0), alpha)`.
- All `step(0.5, u_*Enabled)` feature gates for textures, clustered lights, shadows and cube-vs-equirect. These become `#ifdef`.
- `a3dPbrEnvironmentSampleRaw`'s dual sampling: one sampler is declared, chosen by `ENVMAP_TYPE_CUBE_UV` or `ENVMAP_TYPE_EQUIRECT` (the cube-UV lookup chunk is lane 02's, C-09; the default `fragment:indirect` body uses equirect).
- The fudge set listed in §6.6.

### 8.2 `common` chunk
```glsl
#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
#define EPSILON 1e-6
float pow2(float x) { return x * x; }
vec3 BRDF_Lambert(vec3 diffuseColor) { return RECIPROCAL_PI * diffuseColor; }
layout(std140) uniform AuraFrame {
  mat4 u_view; mat4 u_projection; mat4 u_viewProjection; mat4 u_prevViewProjection;
  vec4 u_cameraPositionNear;   // xyz camera, w near
  vec4 u_resolutionFarTime;    // xy render px, z far, w time
  vec4 u_exposureFlags;        // x exposure (read only by OutputPass), yzw reserved
};
```

### 8.3 `brdf` chunk (replaces `ShaderChunks.ts:43-246` core)
```glsl
struct PhysicalMaterial {
  vec3 diffuseContribution;   // baseColor * (1 - metallic)
  vec3 baseColor; float metallic; float roughness;
  vec3 specularColor;         // dielectric F0 (IBL dielectric path)
  vec3 specularColorBlended;  // mix(F0, baseColor, metallic) (direct light, IBL metallic path uses baseColor)
  float specularF90; float ior; float specularIntensity;
};
PhysicalMaterial a3dMakeMaterial(vec3 baseColor, float metallic, float roughness, float ior,
                                 float specularIntensity, vec3 specularColorFactor, vec3 geometryNormal) {
  PhysicalMaterial m;
  m.baseColor = baseColor; m.metallic = metallic;
  m.diffuseContribution = baseColor * (1.0 - metallic);
#ifdef SPECULAR_AA
  vec3 dxy = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal)));   // non-normal-mapped normal
  float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);
  m.roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0);
#else
  m.roughness = clamp(roughness, 0.0525, 1.0);
#endif
  m.specularColor = min(vec3(pow2((ior - 1.0) / (ior + 1.0))) * specularColorFactor, vec3(1.0)) * specularIntensity;
  m.specularColorBlended = mix(m.specularColor, baseColor, metallic);
  m.specularF90 = mix(specularIntensity, 1.0, metallic);
  m.ior = ior; m.specularIntensity = specularIntensity;
  return m;
}
vec3 F_Schlick(vec3 f0, float f90, float dotVH) { float f = pow(1.0 - dotVH, 5.0); return f0 * (1.0 - f) + f90 * f; }
float V_GGX_SmithCorrelated(float a, float dotNL, float dotNV) {
  float a2 = pow2(a);
  float gv = dotNL * sqrt(a2 + (1.0 - a2) * pow2(dotNV));
  float gl = dotNV * sqrt(a2 + (1.0 - a2) * pow2(dotNL));
  return 0.5 / max(gv + gl, EPSILON);
}
float D_GGX(float a, float dotNH) { float a2 = pow2(a); float d = pow2(dotNH) * (a2 - 1.0) + 1.0; return RECIPROCAL_PI * a2 / pow2(d); }
uniform sampler2D u_dfgLut; // renderer-owned, r185 DFGLUTData (16x16 RG16F, linear, clamp), always bound for lit programs
vec2 a3dDFG(float roughness, float dotNV) { return texture(u_dfgLut, vec2(roughness, dotNV)).rg; } // x = roughness, y = dotNV (three r185)
vec3 a3dDirectSpecular(vec3 L, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 H = normalize(L + V);
  float dotNL = clamp(dot(N, L), 0.0, 1.0), dotNV = clamp(dot(N, V), 0.0, 1.0);
  float dotNH = clamp(dot(N, H), 0.0, 1.0), dotVH = clamp(dot(V, H), 0.0, 1.0);
  float a = pow2(m.roughness);
  vec3 F = F_Schlick(m.specularColorBlended, m.specularF90, dotVH);
  vec3 single = F * (V_GGX_SmithCorrelated(a, dotNL, dotNV) * D_GGX(a, dotNH));
  // Verbatim port of three r185 BRDF_GGX_Multiscatter (lights_physical_pars_fragment.glsl.js:424-460).
  vec2 dfgV = a3dDFG(m.roughness, dotNV);
  vec2 dfgL = a3dDFG(m.roughness, dotNL);
  vec3 FssEss_V = m.specularColorBlended * dfgV.x + m.specularF90 * dfgV.y;
  vec3 FssEss_L = m.specularColorBlended * dfgL.x + m.specularF90 * dfgL.y;
  float Ems_V = 1.0 - (dfgV.x + dfgV.y);
  float Ems_L = 1.0 - (dfgL.x + dfgL.y);
  vec3 Favg = m.specularColorBlended + (1.0 - m.specularColorBlended) * 0.047619;
  vec3 Fms = FssEss_V * FssEss_L * Favg / (1.0 - Ems_V * Ems_L * Favg + EPSILON);
  return single + Fms * (Ems_V * Ems_L);
}
void a3dDirectLight(vec3 L, vec3 radiance, vec3 V, vec3 N, PhysicalMaterial m, inout vec3 diffuseOut, inout vec3 specularOut) {
  float dotNL = clamp(dot(N, L), 0.0, 1.0);
  vec3 irradiance = radiance * dotNL;
#ifdef DIFFUSE_BURLEY
  diffuseOut += irradiance * BRDF_Lambert(m.diffuseContribution) * a3dBurleyTerm(N, V, L, m.roughness);
#else
  diffuseOut += irradiance * BRDF_Lambert(m.diffuseContribution);
#endif
  specularOut += irradiance * a3dDirectSpecular(L, V, N, m);
}
// Indirect: port three r185 computeMultiscattering + RE_IndirectSpecular_Physical (:579 onward): multiscatter is run
// separately with m.specularColor (dielectric) and m.baseColor (metallic), and the results are mixed by m.metallic.
// Diffuse = m.diffuseContribution * (1 - (singleDielectric + multiDielectric)) * irradiance * RECIPROCAL_PI.
// Ambient-light irradiance enters as `irradiance` (no π factor, so the 1/π Lambert applies).
// Probe normalization of `irradiance` and `radiance` comes from the lane 02 chunk at fragment:indirect (C-09).
```

### 8.4 Lights loop
Lane 01's default `fragment:lights` body (`lights_legacy`) is compile-time unrolled per type (`#if NUM_DIR_LIGHTS > 0 ...`, emulated by generating N copies in TypeScript) and reads today's packed light data so it works with every lane's stub. When lane 02 registers its lighting feature (C-10, `AuraLights` std140 layout inside the C-08 block name), that chunk replaces the default at the same hook and calls lane 01's `a3dDirectLight`. The clustered path keeps `u_clusterLightData` / `u_clusterLightIndices` textures but only under `#ifdef LIGHTS_CLUSTERED`. The default body uses the three.js r155+ physically based falloff `getDistanceAttenuation(d, cutoff, decay = 2)`; light units and the `lights.point` default intensity are lane 02's (C-10). Lane 01 only removes the `max(d², 1)` coupling inside its own chunk.

### 8.5 Instancing and morph vertex stage
```glsl
#ifdef USE_INSTANCING
in vec4 a_instanceMatrix0; in vec4 a_instanceMatrix1; in vec4 a_instanceMatrix2; in vec4 a_instanceMatrix3;
#ifdef USE_INSTANCING_COLOR
in vec4 a_instanceColor;
#endif
#endif
uniform mat4 u_modelMatrix;   // node world matrix WITHOUT geometry size
uniform mat4 u_geometryMatrix; // S(size ⊙ fit) · normalizeOffset, applied innermost (identity if unused)
...
mat4 instanceMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
vec4 local = u_geometryMatrix * vec4(transformed, 1.0);
vec4 world = u_modelMatrix * instanceMatrix * local;
```
This order (`world · instance · geometry`) is the C-07 composition rule and fixes the benchmark 16 class of bug structurally in generated programs: `size` is geometry-space and never scales instance translation. The engine-side fix of `createProductionInstanceTransforms` (include `node.size`, R18) is lane 15's unflagged correctness fix T3.10 in `compiler/primitives.ts`; both are consistent, and lane 01's `u_geometryMatrix` path is used when lane 15 emits it under `A3D_QR_CORE=v2` (request Q-15-2).

Morph and skinning: the `vertex:deform` hook is filled by lane 06's `a3d_prd06_deform` (`a3dDeform(out vec4 pos, out vec3 nrm, out vec4 tan)`, C-18), which applies morph before skinning (glTF order). Lane 01's vertex main calls `a3dDeform` when `features["prd06.deform"]` is set and uses the C-18 passthrough otherwise. Lane 01 declares no morph samplers itself.

### 8.6 OutputPass fragment
```glsl
uniform sampler2D u_scene;           // linear HDR (resolved)
uniform sampler2D u_coverage;        // R8 coverage (resolved), bound only with BACKGROUND_COVERAGE (§6.5)
uniform float u_exposure;
uniform int u_dither;                // 0/1
#include <tonemapping_ops>           // none/linear/reinhard/aces(fitted)/agx(r185)/neutral(Khronos); exposure lines removed
vec3 a3dLinearToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
float a3dTriangularNoise(vec2 p) { float r = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  float s = fract(sin(dot(p + 0.37, vec2(39.3468, 11.1351))) * 24634.6345); return r + s - 1.0; } // [-1,1], triangular pdf
void main() {
  vec3 hdr = texture(u_scene, v_uv).rgb;
  vec3 display = TONE_MAP(hdr * u_exposure);
#ifdef BACKGROUND_COVERAGE
  display = mix(clamp(hdr, 0.0, 1.0), display, texture(u_coverage, v_uv).r);
#endif
  vec3 encoded = a3dLinearToSRGB(clamp(display, 0.0, 1.0));
  if (u_dither == 1) encoded += a3dTriangularNoise(gl_FragCoord.xy) / 255.0;
#ifdef OUTPUT_OVERLAY                // C-05 overlay; uniform-branch idle when all zero (bit-identical)
  encoded = a3dApplyOutputOverlay(encoded, v_uv, u_overlayFlash, u_overlayVignette, u_overlayShape, u_overlayFade);
#endif
  outColor = vec4(encoded, 1.0);
}
```
`TONE_MAP` is a `#define` selecting the operator, so each operator is its own small program keyed in `ProgramCache`.

AgX body (port of three.js r185; keep constant values verbatim from `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`, deleting only the `color *= toneMappingExposure;` line because OutputPass has already applied exposure):
```glsl
vec3 agxDefaultContrastApprox(vec3 x) { vec3 x2 = x*x; vec3 x4 = x2*x2;
  return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }
vec3 AgXToneMapping(vec3 color) {
  const mat3 AgXInsetMatrix  = mat3(/* r185 constants, tonemapping_pars_fragment.glsl.js AgXInsetMatrix */);
  const mat3 AgXOutsetMatrix = mat3(/* r185 constants, AgXOutsetMatrix */);
  const float AgxMinEv = -12.47393; const float AgxMaxEv = 4.026069;
  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = AgXInsetMatrix * color;
  color = max(color, 1e-10);
  color = log2(color); color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv); color = clamp(color, 0.0, 1.0);
  color = agxDefaultContrastApprox(color);
  color = AgXOutsetMatrix * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
  return clamp(color, 0.0, 1.0);
}
```
Khronos PBR Neutral:
```glsl
vec3 NeutralToneMapping(vec3 color) {
  const float StartCompression = 0.8 - 0.04; const float Desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;
  float d = 1.0 - StartCompression;
  float newPeak = 1.0 - d * d / (peak + d - StartCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
```
The fake `agx()` and `neutral()` in `WebGL2Device.ts:3541-3550`, `LeanWebGL2Device.ts:3320-3338` and `PostProcessPass.ts:2558-2568` are deleted, not kept as options.

### 8.7 Depth program (feature `pass: "depth"`)
Same vertex stage as forward (`vertex:deform` from C-18, instancing, geometry matrix). Fragment: `#ifdef ALPHA_MASK` samples base color alpha and discards below cutoff; otherwise empty, with depth written by the hardware. No color attachment is required: lane 01 implements the PR 0a `RenderTargetDescriptor.depthOnly` / `depthCompare` / `dimension` / `layers` fields (lane 02 request Q-01-5, accepted), and lane 02 then drops the RGBA8 dummy attachment in its own `ShadowPass.ts:165-171` and composes C-11 depth-variant features. Lane 01 provides the program, not the shadow system.

## 9. Rendering changes (frame level)

With `A3D_QR_CORE` off, every item below is inactive and the frame is bit-identical to `85aafcd0` (C-01 invariant, IC-0 sentinel check). With it on:

1. **Frame order (C-01 phases, every route through `Renderer`):** `collect` (dirty world matrices, contributor collect: lane 11 culling/batching, lane 05 LOD, lane 08 presented pose) → `shadows` (lane 02 contributors) → upload `AuraFrame` and `AuraLights` UBOs (C-08) → clear HDR target to linear background color (no ACES pre-inversion) → `background` (lane 02 environment, lane 07 sky) → `opaque` (reserved, lane 01; front-to-back, sorted by program and material) → `after-opaque` (scene depth copy, lane 02 contact shadows, lane 10 scene-color copy) → `transmission` (lane 04) → transmissive → `transparent` (forward transparents and contributor `TransparentQueueItem`s interleaved by `sortDepth`; additive and multiply after alpha) → `after-transparent` → MSAA resolve (color plus depth) → `post-hdr` (lane 03 passes, C-13) → `output` (reserved, lane 01 OutputPass) → `after-output` (debug only) → canvas.
2. **HDR target format selection (C-05 `probeHdrTargetFormat`):** `rgba16f` if `EXT_color_buffer_float` or `EXT_color_buffer_half_float` permits rendering; else `r11f_g11f_b10f` if renderable (no alpha needed in the scene target); else `rgba8` plus degraded reporting. The capability probe result is cached per device.
3. **MSAA:** samples from C-27 `msaaSamples` (Low 0, Medium/High/Ultra 4), forced to 0 when TAA is on (current rule, `Renderer.ts:611`). The canvas context is created with `antialias: false` (§6.9; engine call site by request Q-15-3).
4. **Post contract (C-13 semantics, lane 03 implementation):** every pass in `post-hdr` is linear HDR on RGBA16F; display-space work only follows OutputPass as lane 03's output presets. Lane 01 enforces this at its own seam: `FrameGraph` rejects a `post-hdr` contributor pass that declares `space: "display"` (`FRAME_PHASE_SPACE_MISMATCH`). Plan-time tagging in `RendererPostprocessPlan.ts`, removal of the CPU readback chain (`Renderer.ts:977-1099`, `:1245-1282`, now `renderer/PostprocessExecution.ts`) and `POSTPROCESS_PASS_NOT_GPU` are lane 03's (requests Q-03-2, Q-03-3). The Deep Recovery 0.5-1.1 fps fix (`evidence/games/report.slim.json`) is therefore an integrated criterion (§17.2).
5. **Game presets:** `createSideViewGameRenderPreset` / `createTopDownGameRenderPreset` stop setting `targetFormat: "rgba8"` (`GameRenderPreset.ts:373`, `:450`) and inherit C-05 output options when `A3D_QR_CORE_OUTPUT` is on. The file is lane 11's (request Q-11-4); Aura Clash's move from Reinhard on RGBA8 to the default operator on RGBA16F is integrated.
6. **Lean entry:** lane 01 forbids a second render path; lane 15 routes `@aura3d/lean` through `Renderer` + OutputPass as its lean-to-engine shim (CONTRACTS §3.8, request Q-15-4). The inert intents in `packages/lean/src/base.ts:250` and the rotation-less `createAuraLeanModelMatrix` (`base.ts:521`) are fixed there.
7. **Silent fallback removal:** lane 15's T4.2 under `A3D_QR_STRICT` (§6.1 rule 4). Lane 01 provides `onRendererError` and the overlay data; lane 01's own browser test exercises it with the strict flag on.
8. **Static scenes:** unchanged single-frame behavior (`index.ts:12512-12521`), except the governor, DPR change and `setOutput` trigger a redraw (C-05 `setOutput` real marks the frame dirty).

## 10. Per-recommendation impact

Costs are estimates for the implementation described, measured against current code. "GPU" means per-frame GPU time at 1920×1080 backing on a mid integrated GPU; "CPU" means main-thread time per frame.

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Single renderer, no silent safe-basic, lean on core | Every route gets the same lit HDR image; no double-gamma washout on failure | 0 | 0 | −1 device instance | −30 to −45 KB (LeanWebGL2Device ≈4.5k lines, safe-basic ≈1.3k lines; deletions by lane 15) | Lean starter grows (gets real lighting); budget renegotiated by lane 15 | Explicit error overlay; no visual fallback |
| R2 | HDR end-to-end, tone map + encode last, all post linear | Correct bloom, AO and DOF energy; no 8-bit banding in fog gradients | +0.3-0.6 ms (RGBA16F ping-pong instead of RGBA8 for post) | 0 | +4 B/px per post buffer (RGBA16F 8 B vs RGBA8 4 B): ≈+16.6 MB at 1080p for two ping-pong buffers | +2 KB | Bandwidth heavy: Low tier uses R11G11B10F; post resolution is lane 03's (C-27 fields) | `rgba8` degraded path with tone map in last forward subpass, reported |
| R3 | Feature-keyed program generator | Removes drift; enables specular AA and IOR on every material, skinned included | −0.1 to −0.5 ms (no unused samplers or branches, unrolled light loops) | −0.2 ms per 200 draws (no runtime variant lookup); first-frame compile moved to warm-up | +program count (bounded by light buckets) | −15 to −25 KB (one PBR source instead of 6 copies) | Fewer instructions per fragment; important on tile GPUs | Unknown feature combination → nearest-superset program, with warning |
| R4 | Scene-graph matrix composition | Rotated and scaled sub-assemblies become possible; Courier Rush city spreads correctly | 0 | −0.1 ms (cached world matrices vs per-frame rebuild) | +64 B per node | +3 KB | None | Shear → TRS approximation for physics, flagged |
| R5 | Primitive tessellation, real capsule, caps, UVs and tangents | Removes faceting (benchmarks 01, 13, 06), cylinder caps (01, 02), capsule limbs | +vertex cost: sphere 221 → 2,145 verts; at 685 primitive calls (research/06 §4) with shared geometry this is <0.2 ms on desktop | Mount-time generation, cached | Shared geometry per param set: <2 MB typical | +2 KB | Low tier halves segments | Explicit `tessellation` overrides |
| R6 | DPR default `min(dpr, tierMax)` plus governor | 2-4× shaded pixels on HiDPI; the largest single sharpness gain (research/05 §0) | ×2.25-4 fill cost at DPR 1.5-2; governor caps | +0.05 ms governor | Targets scale with pixels (see §15 budgets) | +2 KB | Low tier caps DPR 1; governor floor | `pixelRatio` override; `dynamic: true` |
| R7 | Exposure wired; real AgX and Khronos Neutral | Authored exposure works; color-faithful operators for product and UI scenes | 0 (same pass) | 0 | 0 | +1.5 KB | None | ACES default |
| R8 | Ambient 1/π, no hemi fake | Restores form shading; shadowed sides stop lifting (benchmark 01: 95,2,7 vs 54,1,2) | 0 | 0 | 0 | 0 | None | Games retuned by lane 14; lane 02's physical lighting restores fill (integrated) |
| R9 | Remove fudges; IOR-driven F0; specular AA; direct multiscatter | Rough metals keep energy; glossy props stop sparkling; IOR materials correct | +0.05-0.1 ms (derivatives, two LUT fetches per light) | 0 | DFG LUT 16×16 RG16F = 1 KB (replaces the RGBA8 approximation) | ±0 | Derivatives are cheap; LUT already exists | `specularAntialiasing: false` per material |
| R10 | Persistent instance VBOs, zero per-draw allocation (morph textures are lane 06's, C-18) | Enables crowds, foliage and many-draw scenes at budget | 0 | −1 to −4 ms on the runner at 200-400 draws (removes Map, pipeline and buffer churn and the VAO leak) | Instance buffers persistent per node | +3 KB | Main win on mobile CPUs | `instanceBufferSlot` stub (per-frame upload) when flag off |
| R11 | Instancing size composition (C-07 `world · instance · geometry`; engine fix R18 by lane 15) | Benchmark 16 renders the authored field (71% coverage vs 8.7%) | 0 | 0 | 0 | 0 | None | None needed |
| R12 | Blend modes engine-wide | Additive glow, beams and sparks add light; premultiplied sprites without fringes | 0 | 0 | 0 | +1 KB | None | `alpha` |
| R13 | `preserveDrawingBuffer: false`, canvas `antialias: false` | Indirect: frees bandwidth for DPR | −0.2 to −1 ms on tile GPUs (no buffer preservation copy, no unused canvas MSAA) | 0 | −canvas MSAA storage (1080p 4×: ≈33 MB color + ≈33 MB depth-stencil) | 0 | Significant on Apple and mobile tilers | `app.capture()` for evidence |
| R14 | Color parser | No silent near-black from `#f80`, `"orange"`, `rgb()` | 0 | 0 | 0 | +1.5 KB (named color table) | None | Throws on invalid input instead of guessing |
| R15 | Async program compile and warm-up | No mid-game hitch when first VFX, skinned or toon material appears | 0 | Moves 50-300 ms of driver compile to load | 0 | +1 KB | Critical on mobile drivers | Synchronous compile when extension absent |

## 11. Migration plan

1. **Feature flag (CONTRACTS §5):** `A3D_QR_CORE` (`off` | `v2`; PRD-local aliases `renderer.core: "v1" | "v2"` and benchmark `?core=v1|v2`) gates every lane 01 behaviour change. Sub-flags `A3D_QR_CORE_OUTPUT` (HDR target + OutputPass) and `A3D_QR_CORE_GENERATOR` (draws through the generator) default to on under `v2` and can be excluded (`?a3d-qr=core,-core_generator`) for attribution. Captures select it through the resolved flag set (`?a3d-qr=core`, capture `--flags`, `qr_flags`), so no harness edit is needed. The flag moves `dev` → `standalone-accepted` (§17.1 green in lane CI) → `integrated-accepted` (§17.2 at a G-PANEL checkpoint) → `default-on` → `removed` (§5.3-§5.4); the off path and the frozen legacy programs are deleted only at removal.
2. **Engine bridge through seams:** with the flag on, lane 01's `compiler/sceneGraph.ts` and `compiler/color.ts` take over composition and color; primitive geometry, instance construction and the primitive material `blend` reach the bridge through lane 15's compiler files calling C-06/C-07 (requests Q-15-2, Q-15-6). The output is still a `RenderSource`, so `Renderer` changes land independently.
3. **Shader cutover by material class:** the generator serves every class through the default `programFeatures()` (§6.4); classes switch in the order `PBRMaterial` → `InstancedPBRMaterial` → `TexturedPBRMaterial` → `NormalMappedPBRMaterial` → `SkinnedLitMaterial` → unlit classes by adding them to the generator allow-list in `program/MaterialFeatures.ts` (lane 01's file). Each step keeps the lane 01 standalone scenes it touches at or above the flag-off result (§17.1 S12). Lane 04 may add per-class overrides at any time (Q-04-1); nothing waits on it.
4. **App overrides (lane 14 applies; lane 01 ships the C-39 codemod `core-v2` in `tools/quality-rebuild-codemods/core-v2.ts`, registered from `packages/aura3d-cli/src/commands/prd01/index.ts`):**
   - Delete `pixelRatio:` overrides that are ≤ 1: Skyline Runner 0.7 (`main.ts:1879`) and Data Galaxy 1 (`showcase-data-galaxy/src/main.ts:159`). Turbo Drift's `pixelRatio: 1` (`main.ts:2988`) and Rooftop Buckets' capture branch (`main.ts:738`) are capture-mode-only. Replace them with `renderer.resolution.maxPixelRatio: 1` inside the same capture condition, so CI capture cost is unchanged and gameplay gets device DPR. Convert `Math.min(x, window.devicePixelRatio || 1)` patterns (asset-audition 1.35, cinematic-architecture 1.45, digital-twin-ops 1.35, material-asset-inspector 1.5, product-configurator 1.5, webgpu-particle-lab 1.2, rooftop-buckets 1.75) to `renderer.resolution.maxPixelRatio: x`.
   - Rewrite `effects.colorGrade({ exposure })` unchanged; it now works. Flag any value outside [0.5, 2] for review.
   - Rewrite `lights.ambient(intensity)`: no automatic ×π. The codemod emits a review list per game with the old and new effective irradiance; lane 14 retunes against lane 02's physical lighting (integrated) so ambient stops being the primary fill.
   - Replace `qualityProfile: "production"` with `quality: "high"`, and `"safe-basic"` with nothing (default `"auto"`).
   - `renderer: { mode: "safe-basic" }` / `fallback` sites: `git grep -l "safe-basic" -- apps tools tests templates packages ':!*.json'` returned 91 files at audit commit `c08d8acb`: 43 in `tests/browser`, 15 Pulse Tunnel art-review scripts, `packages/create-aura3d/src`, `apps/showcase-vault-breakers/src` and `scripts`, the `write-route-health.mjs` scripts, and several `tools/`. The codemod classifies each as "selects the mode" (migrate or delete), "asserts the fallback warning string" (rewrite to assert `renderer-mount-failed` absence), or "documentation" (update), and writes the table to `evidence/prd01/safe-basic-inventory.json`. Owners apply it: lane 14 (apps), lane 13 (templates, `create-aura3d`), lane 15 (`scripts/`, `tools/` default, the removal under `A3D_QR_STRICT`), each test's owner by the creator rule. Lane 01 migrates only tests it owns.
   - Group transforms: lane 14 re-captures Courier Rush and Material Asset Inspector with `?a3d-qr=core`. The scaled groups will now spread and may need their child offsets re-authored, because they were tuned against the broken composition.
5. **Evidence tooling:** `tools/quality-rebuild-capture/capture-games.mjs` and `benchmarks/quality-rebuild/capture.mjs` (lane 12) already capture through Playwright `page.screenshot` (§2.10a), so they need no readback change. Recording lane 01's `diagnostics()` sections per capture is a C-33 step plugin request (Q-12-1); lane 01's own workflow `qr-prd01-core.yml` records them meanwhile. The 226 canvas-readback files (§2.10a) are triaged in Phase 2 into `evidence/prd01/readback-triage.json`:
   - (a) code that reads a canvas it renders itself (non-root): unaffected;
   - (b) code that reads the root `createAuraApp` canvas after the frame: migrate to `app.capture()`;
   - (c) third-party or unmigratable code: temporarily set `renderer.debug.preserveDrawingBuffer: true` with a tracking comment.

   Lane 01 migrates (b)/(c) files it owns; every other row becomes a request to its owner (the three template `screenshot.spec.ts` files: Q-13-1; apps: Q-14-1). Until a row is migrated, `preserveDrawingBuffer: false` is applied only when `A3D_QR_CORE=v2`, so flag-off routes and specs are unaffected.
6. **Deletion pass (`A3D_QR_CORE` removal, CONTRACTS §5.4):** lane 01 removes its §5.4 list, deprecated aliases older than one minor release, and the flag's off path in one PR.

## 12. Backward compatibility

Every row applies only with `A3D_QR_CORE=v2` (or `A3D_QR_STRICT` where noted); flag-off behaviour is unchanged (CONTRACTS §6.1).

| Change | Old behavior | New behavior | Compat mechanism | Breaks |
|---|---|---|---|---|
| `renderer.mode`, `renderer.fallback` (lane 15, `A3D_QR_STRICT`) | `"safe-basic"` selected the raw-GL renderer | Removed | Throws `AuraMigrationError` with a fix hint | 91 in-repo files reference `safe-basic` (§11 item 4); migrated by their owners from lane 01's inventory |
| Mount failure | Silent safe-basic image plus a warning string | No image; `diagnostics().errors` `renderer-mount-failed`, `onRendererError`, dev overlay | `ready()` still resolves (existing contract); `strictMount: true` rejects | Pages that "worked" only through the fallback now show the error (intended) |
| Canvas `alpha` | Default (true) | `alpha: false` | None | Apps relying on a transparent canvas over page content: check with `git grep -n "background(\"transparent\|alpha: true" -- apps templates` in Phase 2; none known |
| `qualityProfile` | Set DPR 1 / 1.5 | Mapped to `quality` tier | Deprecated alias for one minor | No |
| Default DPR | 1 | `min(dpr, tierMax)` | `pixelRatio` still wins | Performance profile of 13-14 games changes; governor mitigates |
| `RenderState.blend: boolean` | `true` = alpha | `blendMode?: BlendMode` wins when present (C-04) | `blend` stays; `resolveBlendMode` maps `true` → `"alpha"`, `false` → `"opaque"` | None: additive field |
| Group transform composition | Additive | Matrix | Flag; translation-only groups are identical | Courier Rush and Material Asset Inspector layouts (intended; lane 14 re-authors) |
| Euler order | Implicit Rz·Ry·Rx | Explicit `"ZYX"` default | Same matrix | No |
| Primitive tessellation | 16×12 sphere, 24-seg cylinder | 64×32 / 48 | `tessellation` option to request the old counts | Silhouette changes (intended) |
| Capsule | Sphere | Real capsule | None | Engine rigs whose "limbs" relied on scaled spheres look different; lane 06 re-authors rigs in its own scope |
| Instancing with `size` | Positions scaled by size | Positions in world units | None (declared correctness fix R18, lane 15, unflagged) | Any app that pre-divided positions by size (none found in `apps/`; to verify with `rg "instances\." apps`) |
| Ambient units | π× three | three-equivalent | Flag | Every ambient-heavy game gets darker fill; lane 14 retunes with lane 02's lighting at checkpoints |
| Exposure | Ignored | Applied | None | Games authored 1.02-1.06 (16 games, research/19 C12): +2-6% brightness |
| Tone curve on lean / no-post paths | Narkowicz in shader | OutputPass operator | None | Lean starters look different (intended) |
| Aura Clash tone map | Reinhard on RGBA8 | Default operator on RGBA16F | Flag + lane 11 preset change (Q-11-4) | Re-review Aura Clash (lane 14, integrated) |
| Background | ACES-inverted clear | Tone-mapped linear background | `background(color, { toneMapped: false })` reproduces "authored sRGB shows exactly" | Games choosing near-black backgrounds see little change |
| Color strings | Invalid → silent navy | Parsed; invalid throws `AuraColorParseError` under `A3D_QR_STRICT`, otherwise warns `COLOR_PARSE_FAILED` (C-36 `option-ignored`) and keeps the old fallback | `parseAuraColor` accepts all CSS forms | Strict apps that relied on the silent fallback get an exception (desired) |
| `preserveDrawingBuffer` | Always true | False | `app.capture()`; `renderer.debug.preserveDrawingBuffer: true` for one minor | 226 in-repo readback files (§2.10a) triaged in Phase 2, including the three template `screenshot.spec.ts`. External tools calling `canvas.toDataURL()` on the root canvas after the frame get blank data. Playwright `page.screenshot` is unaffected |
| `AuraPerformanceQuality.resolutionScale` | Resized the canvas backing store (whole frame, including output) | Caps the scene-target `renderScale`; output stays at backing resolution | Same field and range | UI and output passes get sharper at the same scale (intended) |
| `createPerformanceGovernor` | Own `RESOLUTION_STEPS` [1, 0.85, 0.7, 0.5] | Resolution step delegated to `ResolutionGovernor` | Same API and settings shape | Game apps see 0.1 steps with hysteresis instead of 4 coarse steps |

## 13. Contracts consumed / provided

The earlier "Dependencies on other PRDs" list is replaced by contracts (CONTRACTS §1, §2). Lane 01 builds against every consumed contract's PR 0a stub and never waits for the provider's real implementation. What a stub can and cannot show decides whether a criterion is standalone (§17.1) or integrated (§17.2). Conflict resolutions from CONTRACTS §0 that changed this PRD: R1 (tier type is C-27's), R2 (lane 01 owns OutputPass, operator enum and `app.setOutput`; lane 03 owns everything upstream and passes values in), R3 (one `ProgramCache`, lane 01's), R4 (lane 01 owns `BRDFLut.ts` and `u_dfgLut`), R5 (deformation resources are lane 06's), R18 (instance-size engine fix is lane 15's), R21 (route `main.ts` files are lane 14's; lane 01 ships the `core-v2` codemod).

### 13.1 Contracts provided (stub must keep working; real swapped by `slot.provide` from `packages/rendering/src/lanes/prd01.ts` / `packages/engine/src/lanes/prd01.ts`)

| ID | Name | Counterpart lanes (consumers) | Stub behaviour consumers rely on (must not regress) | Real (lane 01) |
|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 02, 03, 04, 07, 08, 10, 11 | PR 0b-2 seam in `renderer/FrameGraph.ts`: `collect` after `Renderer.ts:555`, `shadows` after `:622`, `background` between `:650` and `:664`, all after-phases after the single `ForwardPass`, `post-hdr` before `executePostprocess` (`:680`) only when a post target exists (else `FRAME_PHASE_SKIPPED`), `sceneDepth = { texture: null, available: false }`; all flags off → 0 contributor calls and bit-identical frame | ForwardPass split into opaque + transparent; contributor transparents interleaved by `sortDepth`; `sceneDepthCopy` after opaque (lane 02 Q-01-6, lane 07 R-01-1); `FrameCamera.previousViewProjectionMatrix`; `FRAME_PHASE_RESERVED` for `opaque`/`output` |
| C-02 | ProgramFeatures, ShaderFeature/chunk registry, ProgramCache | 02, 03, 04, 05, 06, 07, 08, 10, 11 | chunk and feature registries real (store, validate, `SHADER_CHUNK_DUPLICATE`); `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; `programCacheSlot.stub` wraps `createDefaultShaderLibrary` (`ShaderLibrary.ts:52`) ignoring features; ChunkHarness real | `program/{ProgramFeatures,ProgramKey,ProgramGenerator,ProgramCache,ProgramWarmup,MaterialFeatures}.ts`, `program/chunks/*.glsl.ts`, hook splicing per C-02, default hook bodies (§6.4), `u_dfgLut` r185 LUT, `brdf` chunk and `PhysicalMaterial` struct (base lobe for C-03) |
| C-04 | BlendMode, RenderCommandState, DepthCompare | 03, 04, 07, 11 | `resolveBlendMode` maps `blend: true/false`; `WebGL2Device` ignores `blendMode`/`depthCompareV2`/`alphaToCoverage`; lane 07's `VFX_BLEND_FALLBACK` adapter active | `WebGL2Device` state application (`:4380-4410`), `WebGL2StateCache.ts` separate func/equation dedupe, queue classification in ForwardPass, `renderStateKey` stable across backends (WebGPU mapping: lane 11) |
| C-05 | Output: HDR target, tone mapping, exposure, background coverage, overlay | 03, 07, 09, 12, 13, 14 | `setOutput` maps to the legacy present shader (`WebGL2Device.ts:3453-3633`, default `"reinhard"` `:1906`, ACES `:3501`), unsupported operators → `aces` + `capability-degraded`; `setOutputOverlay` → DOM overlay `div.a3d-output-overlay` with `reason: "dom-fallback"`; `capture()` → `canvas.toBlob` after sync render; `probeHdrTargetFormat` → `rgba16f` or `rgba8`; `DEFAULT_TONE_MAPPING = "aces"` | `output/{OutputPass,ToneMappingOperators.glsl,HdrTarget}.ts`, r185 AgX and Khronos Neutral, dither, coverage MRT, in-shader overlay (lane 09 Q-01-1), same-task `capture()`, `onRendererError`; C-38 `output` factory |
| C-06 | Scene graph transforms + color parsing | 08, 09, 10, 15 | `composeWorldMatrix`/`eulerToQuaternion` delegate to `eulerToQuat` (`index.ts:5345`) with ZYX; `parseAuraColor` delegates to the hex parser; new fields in `DIAGNOSTIC_ONLY_FIELDS` with `ownerPrd: 1` | `agent-api/sceneGraph.ts` (six orders, quaternion input, per-node dirty flags), `agent-api/color.ts` (CSS Color 4 subset, named colors), bodies in `compiler/{sceneGraph,color}.ts` |
| C-07 | Primitive tessellation + InstanceBuffer | 06, 10, 11, 13, 15 | `instanceBufferSlot.stub` wraps today's per-frame upload (`ForwardPass.ts:1711-1803`) with `version` bumps; `tessellation` declared and inert | `resources/InstanceBuffer.ts` (persistent, VAO eviction, capacity throw), `Geometry.{torus,box,litPlane}`, extended `cylinder`/`capsule`/`uvSphere`, `geometry/Primitives.ts` |
| C-08 | Frame uniforms (AuraFrame/AuraLights) + CameraLike | 02, 03, 07, 08, 10 | `buffer: null`; chunks read legacy `u_cameraPosition`/`u_viewProjection`; renderer accepts a plain `CameraLike`; post keeps `{ near: 0.1, far: 1000 }` | `resources/UniformBlock.ts` std140 packer, `AuraFrame` bound at binding 0 for all generated programs, `AuraLights` binding 1 reserved for lane 02's layout |

Registry entries lane 01 provides into other contracts: C-31 sections `output`, `resolution`, `programs`, `frameAllocations`; C-36 `diagnosticOnly.prd01.ts` entries for every C-05/C-06/C-07/C-15-blend field until wired, plus option-coverage rows for each wired field; C-38 `output` member factory and flattened `setOutput`/`setOutputOverlay`/`capture`/`onRendererError`/`precompile`; C-39 codemod `core-v2` and command `core inspect-programs`; C-30 scenes `prd01-*`; C-40 facts `F-01-*` (DPR default, tone-map default, `blend`, `tessellation`, `rotationOrder`, ambient 1/π, `app.capture()`).

Conformance suites that must pass for both `stub` and `real` (custodian-owned, PR 0a): `tests/unit/contracts/C-01-frame-graph.test.ts`, `tests/browser/contracts/C-01-frame-graph.spec.ts`, `C-02-program.test.ts`, `C-02-chunks.spec.ts`, `C-04-blend.test.ts`, `C-04-blend.spec.ts`, `C-05-output.test.ts`, `C-05-output.spec.ts`, `C-06-scene-graph.test.ts`, `C-07-geometry.test.ts`, `C-08-frame-uniforms.test.ts`. Lane 01 adds `tests/unit/contracts/impl/prd01-{frame-graph,program,blend,output,scene-graph,geometry,frame-uniforms}.test.ts` for its real implementations.

### 13.2 Contracts consumed (built against the PR 0a stub)

| ID | Name | Provider lane | What lane 01 uses | Stub behaviour lane 01 relies on | Effect on acceptance |
|---|---|---|---|---|---|
| C-03 | MaterialFeature lobe registry | 04 | `materialLobes(flags)`, `ProgramFeatureSource`, lobe chunks at `fragment:material`/`fragment:indirect` | registry real, no lobes registered → base lobe only, `extension-lobe-pending` | base-lobe correctness standalone; extension looks integrated |
| C-09 | EnvironmentSource / EnvironmentProbe | 02 | `ProgramFeatures.environment`, IBL chunk at `fragment:indirect` | legacy environment; default indirect body samples today's equirect | BRDF numerics standalone (CPU mirror); IBL scenes integrated |
| C-10 | Lighting API + runtime, `AuraLights` layout | 02 | `fragment:lights` chunk, light units | legacy light packing; `lights_legacy` default body | ambient 1/π standalone (unit + lane scene); lighting parity integrated |
| C-11 | ShadowCaster depth-variant hook + shadow lookup | 02 | `ProgramFeatures.shadows`, `pass: "depth"` consumers | features stored, legacy shadow path | depth program compile standalone; shadows integrated |
| C-12 | Sampler / texture-sampling descriptors | 02 | sampler mapping for `u_dfgLut` (linear, clamp) | today's sampler mapping | standalone |
| C-13 | PostPass registry + post pipeline + output presets | 03 | `post-hdr` ordering, `"prd03.exposure"` blackboard value, display presets after OutputPass | legacy post chain; no upstream exposure (1.0) | `output.exposure` standalone; `colorGrade` exposure, linear post, Deep Recovery integrated |
| C-14 | Velocity / temporal history | 03 | `pass: "velocity"` variant, MRT layout (lane 03 Q-01-2) | fields inert | standalone (compile only) |
| C-16 | Compressed textures + decoder registry | 05 | sRGB compressed formats in the color pipeline | UNORM only | integrated (texture color accuracy) |
| C-18 | Deformation resources | 06 | `prd06.deform` feature/chunks at `vertex:deform`, `"2d-array"` textures | passthrough deform chunk; `buildMorphTargetTexture` → CPU fallback | skinned/morph program compile standalone; deformed pixels integrated |
| C-21 | Sky / fog / atmosphere | 07 | `ProgramFeatures.fog`, fog chunk at `fragment:fog` | legacy fog uniforms; default fog body | standalone |
| C-27 | QualityTier settings | 11 | `maxPixelRatio`, `minRenderScale`, `targetFrameMs`, `msaaSamples`, `primitiveSegments`, `maxLightsPerPixel`, `nextLowerTier` | `QUALITY_TIERS` real data; `"auto"` → high desktop / medium coarse pointer | standalone |
| C-28 | Device capabilities | 11 | `probe.parallelShaderCompile`, `counters()` (`programCompiles`, `bufferCreates`, `readbacks`), FrameStats | `compileAsync` sync; counters partial (draws, buffers, texture bytes, wrapped compiles/readbacks); FrameStats real, `gpuMs` null | 0 compiles after ready and 0 buffer creates standalone (CPU frame time) |
| C-29 | Renderer factory / backends / lifecycle | 11 | renderer core runs inside the factory; context-loss re-upload of lane 01 resources via `resourceRegistrySlot` | today's `Renderer.create` (`Renderer.ts:472`); registry stub records and replays | standalone (WebGL2) |
| C-30 | Benchmark scene registry | 12 | lane scenes `prd01-*` in `scenes/prd01/`, `ReadyPayloadV2.qrFlags` | registry wraps the 18 base scenes + lane indices | standalone |
| C-31 | Diagnostics sections | 12 | `registerDiagnosticsSection` for `output`, `resolution`, `programs`, `frameAllocations` | each key present with `null`/empty | standalone |
| C-32 / C-33 | Rubric / capture harness | 12 | judgement schema, step plugins, `--flags`/`qr_flags` passthrough | today's capture scripts + plugin loading | standalone screening; acceptance only at G-PANEL |
| C-36 | SceneCompiler extension points | 15 | `SceneCompileContext.flags/quality/strict`, degradations `renderer-mount-failed`, `capability-degraded`, `extension-lobe-pending`, `option-ignored`; `DIAGNOSTIC_ONLY_FIELDS`; option coverage | wraps the moved legacy compiler | standalone |
| C-38 | App surface registry | 15 | `output` member, flattened methods, pre-declared renderer options | real in PR 0 | standalone |
| C-39 | CLI command / codemod registry | 15 | `registerCodemod("core-v2")`, `registerCliCommand("core inspect-programs")` | real in PR 0 | standalone |
| C-40 | Facts handoff | each lane → 13 | rows `F-01-*` | n/a | — |

### 13.3 Not dependencies (facts formerly listed as edges)
- Lane 02 owns the ambient-kills-IBL fix (`index.ts:12693-12707`, carved to `compiler/environment.ts`; 15 of 18 games per research/19 C1, Aura Clash avoids it via its own render source), the default HDR environment, PMREM, shadow strength and CSM. Lane 01's ambient 1/π change does not wait for it; the pairing "darker ambient + restored IBL" is evaluated only as an integrated criterion with `qr_flags=all` (§17.2), and lane 01's flag is not promoted to `integrated-accepted` on a checkpoint where games regress without lane 02 on.
- Lane 05 (assets), lane 08 (camera), lane 09 (game kits), lane 10 (world) consume C-06/C-07/C-08 through their stubs; none of their work is sequenced after lane 01.
- Lane 13 writes skills and templates only from verified `F-01-*` facts (C-40).

### 13.4 Requests to other lanes (non-blocking)

Filed on day 0 as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). Lane 01 never waits: each row names what lane 01 does meanwhile, and any criterion that needs the change is evaluated at the next checkpoint after it lands.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-03-1 | 03 | `agent-api/compiler/postprocess.ts` (ex-`index.ts:12797-12941`): with `A3D_QR_CORE_OUTPUT` on, publish `colorGrade.exposure × autoExposure` on the C-01 blackboard as `"prd03.exposure"` and stop sending `toneMapping.exposure` (`:12898-12904`) to the legacy present shader | C-05, C-13 | OutputPass uses `output.exposure` only; `colorGrade` exposure criterion integrated |
| Q-03-2 | 03 | `RendererPostprocessPlan.ts`: tag passes `space: "linear-hdr" \| "display"` and reject display passes before OutputPass; `webgl2/LegacyPost.ts`: RGBA16F ping-pong instead of RGBA8 (`WebGL2Device.ts:946-948`) and near/far from C-08 instead of `:865` when `A3D_QR_CORE=v2` | C-13, C-08 | lane 01's FrameGraph enforces `space` for `post-hdr` contributors only |
| Q-03-3 | 03 | `renderer/PostprocessExecution.ts` (ex-`Renderer.ts:977-1330`): remove the CPU readback chain (`:987`, `:1062`, `:1099`, `:1245-1282`) from interactive frames, reject non-GPU passes with `POSTPROCESS_PASS_NOT_GPU:<name>`; at `A3D_QR_POST` removal delete the fake `agx`/`neutral` CPU copies (`PostProcessPass.ts:2558`, `:2565`) | C-13, C-28 | Deep Recovery FPS criterion integrated (§17.2 I6) |
| Q-04-1 | 04 | `PBRMaterial.ts`, `TexturedPBRMaterial.ts`, `InstancedPBRMaterial.ts`, `NormalMappedPBRMaterial.ts`, `SkinnedLitMaterial.ts`: optional per-class `programFeatures()` overrides; drop `environmentBrdfLutTexture` (`TexturedPBRMaterial.ts:61`) once `u_dfgLut` is renderer-owned | C-03, C-02 | `program/MaterialFeatures.ts` default derivation covers all classes |
| Q-04-2 | 04 | `packages/assets/src/GLTFRenderResources.ts`: glTF `alphaMode: "BLEND"` → `renderState.blendMode = "alpha"`, `"MASK"` → `alphaMode: "mask"` feature; at `A3D_QR_MATERIALS` removal delete `production-runtime/materials/{MaterialCompiler,GLTFMaterialAdapter,GLTFPBRMaterialAdapter,PBRShaderFeatures}.ts` | C-04 | `resolveBlendMode` maps the legacy `blend: true` the GLB path already sets |
| Q-07-1 | 07 | `SpriteFlipbook.ts:119`, `:153`: `additive: true` sets `blendMode: "additive"`; particles `materialMode: "additive-glow"` (`index.ts:3707`, carved to `nodes/effects.ts`) → `"additive"`; `AtmosphereWetness.ts:119` hex parser → `parseAuraColor` | C-04, C-06 | lane 01's `prd01-blend-modes` scene proves blend modes on its own quads |
| Q-09-1 | 09 | `agent-api/GameAppRuntime.ts:127-139`: drive resolution through `Renderer.setRenderScaleCeiling` / `ResolutionGovernor` instead of the canvas backing store | C-27 | game apps keep today's governor with the flag off |
| Q-10-1 | 10 | `LayeredSceneComposition.ts:648` `parseHexColor` and `WaterSurface.ts:188` → `parseAuraColorSrgb` / `parseAuraColor` (same output space) | C-06 | duplicate parsers remain; lane 01's color test covers its own helpers |
| Q-11-1 | 11 | `agent-api/app/rendererOptions.ts` (ex-`index.ts:4225-4327`): with `A3D_QR_CORE=v2`, profiles stop setting `pixelRatio` (`:4256`, `:4271`, `:4286`) and `preserveDrawingBuffer` (`:4232`-`:4302`); map `qualityProfile` → C-27 tier; retire `rendererQualityPresets`/`screenshotQuality` | C-27 | lane 01 scenes pass explicit renderer options |
| Q-11-2 | 11 | `GameRenderPreset.ts:158` `createPerformanceGovernor`: resolution step calls `ResolutionGovernor`; delete `RESOLUTION_STEPS` (`:130`) at `A3D_QR_TIERS` removal | C-27 | unit test of `ResolutionGovernor` alone |
| Q-11-3 | 11 | `renderer/CullingBatching.ts`: with `A3D_QR_CORE=v2`, use `MeshConsolidation.consolidateStatic` at mount and skip per-frame regrouping (ex-`Renderer.ts:2361-2385`) | C-07, C-01 `collect` | lane 01 measures static scenes without regrouping in its own perf scene |
| Q-11-4 | 11 | `GameRenderPreset.ts:373`, `:450`: no `targetFormat: "rgba8"` and no implicit tone map when `A3D_QR_CORE_OUTPUT` is on; `WebGPUDevice.ts:1838-1845`: map C-04 `blendMode` and `renderStateKey`; WGSL twins for `a3d_prd01_*` chunks; `RendererTiming.ts` feeds C-28 `gpuMs` | C-04, C-27, C-28, C-29 | WebGPU keeps today's alpha-only blend; governor uses CPU frame time |
| Q-12-1 | 12 | C-33 step plugin `prd01-diagnostics` (record `output`, `resolution`, `programs` sections; assert `targetFormat ∈ {rgba16f, r11g11b10f}`, `programs.pending === 0` after ready, no `renderer-mount-failed`) and C-33 metric plugins (subject-mask IoU, per-region SSIM, ΔE2000 per swatch, temporal highlight σ); run the ACES-vs-AgX A/B (`?a3d-qr=core` with `output.toneMapping` per capture) at the next G-PANEL | C-30, C-33 | `qr-prd01-core.yml` computes the same metrics on lane scenes with `tests/qr/prd01/metrics/` |
| Q-13-1 | 13 | `templates/{mini-game,product-viewer,cinematic-scene}/tests/screenshot.spec.ts` → `app.capture()`; skills: remove `pixelRatio < 1` advice, document `quality`, `output`, `tessellation`, `blend`, `rotationOrder` from facts `F-01-*` | C-05, C-40 | facts published `proposed` → `verified` |
| Q-14-1 | 14 | Apply `aura3d codemod core-v2 --write` per route (§11 item 4); re-author Courier Rush (`city.ts:769`) and Material Asset Inspector (`main.ts:280-291`) group layouts; migrate class (b) readback rows in `apps/` | C-39, R21 | codemod report attached; lane scenes cover the mechanics |
| Q-15-1 | 15 | `agent-api/index.ts` `configureCanvas` (`:18105`), call sites `:11133`, `:12280`, resize `:12294-12310`, `devicePixelRatioSafe` clamp (`:18700`), `setPerformanceQuality` (`:12455-12465`): with `A3D_QR_CORE=v2`, call `resolveCanvasPixelRatio` and `Renderer.setRenderScaleCeiling` | C-27, C-06 | lane 01 tests DPR policy as a pure function and on lane scenes with explicit `pixelRatio` omitted |
| Q-15-2 | 15 | `compiler/geometry.ts` (ex-`index.ts:17287-17479`) and `compiler/primitives.ts` (`createProductionPrimitiveMesh` `:14977`, instance transforms `:14747`): with `A3D_QR_CORE=v2`, use `createPrimitiveGeometry` and emit `modelMatrix` without `size` plus `RenderItem.geometryMatrix = S(size ⊙ fit)` | C-07 | lane 01 scenes build primitives through `@aura3d/rendering` directly |
| Q-15-3 | 15 | `compiler/renderer.ts` (ex-`index.ts:13586-13597`): with `A3D_QR_CORE=v2`, context `{ antialias: false, preserveDrawingBuffer: false, alpha: false, powerPreference: "high-performance" }` unless `renderer.debug.preserveDrawingBuffer` | C-05, C-29 | lane 01's own canvases use the new attributes |
| Q-15-4 | 15 | `packages/lean/**`: route lean builders through `Renderer` + OutputPass (lights, environment, camera, rotation `base.ts:521`); delete `LeanWebGL2Device.ts`, `lean/LeanProductionRenderer.ts` | §3.8 | lean routes stay on the lean device (flag-off-equivalent) |
| Q-15-5 | 15 | `production-runtime/index.ts` re-export removals, export manifest, `BUNDLE_SIZES.md` budget renegotiation, the `index.ts:4547` exposure warning, `AuraRendererDiagnosticReport.exposure` type change | §4.4 | lane 01 reports bundle deltas in its PRs |
| Q-15-6 | 15 | `index.ts:14899-14934` primitive material: map `AuraMaterialSpec.blend`/`depthWrite`/`ior` (C-15, lane 01 semantics) into `renderState.blendMode`/`depthWrite`/F0; physics `:5183`, `:5192` consume C-06 world TRS, capsule collider `:5380` uses the C-07 capsule dimensions | C-06, C-07, C-15 | fields listed in `diagnosticOnly.prd01.ts` |
| Q-15-7 | 15 | PR 0b-1 / T3.8: verbatim move of `index.ts:17637-18010` into lane 01's `compiler/sceneGraph.ts` and of the color helpers (`:15378-15443`, `:17911`) into `compiler/color.ts` | C-06 | lane 01 writes the replacement in `agent-api/sceneGraph.ts` and wires it after the move |

### 13.5 Incoming requests to lane 01 (handled within 2 working days, CONTRACTS §6.5)

| From | IDs (in that PRD) | Disposition |
|---|---|---|
| 02 | Q-01-1..Q-01-4 legacy patches (ambient/π and hemisphere gate, falloff, SH9 diffuse, `A3D_PBR_NO_SPOT_SHADOW` removal); Q-01-5 `RenderTargetDescriptor` fields; Q-01-6 `sceneDepthCopy` and `after-opaque` before transparents | Accepted. Legacy patches land behind lane 02's uniforms (flag-off identical) per §3.7; Q-01-5/Q-01-6 are Phase 2 and Phase 3 tasks (§15) |
| 03 | Q-01-1 custom indirect-fraction blend; Q-01-2 `colorAttachments` MRT; Q-01-3 double-buffered instance transforms (`SceneOptimization.ts:207-217`); Q-01-4 `app/colorManagement.ts`; Q-01-5 FXAA/fusion deletion at flag removal; Q-01-6 `setOutput` forwards `preset`/`autoExposure`; Q-01-7/Q-01-8 contingencies | Accepted (Q-01-7/8 only if the 0b-2 carve is dropped) |
| 04 | Q-01-1..Q-01-4 legacy patches; Q-01-5 r185 `brdf` + LUT; Q-01-6 `alphaToCoverage` copy and transmissive queue after `transmission`; Q-01-7 delete `production-runtime/shaders/chunks/*` | Accepted; Q-01-5 is §8.3 |
| 06 | Q-01-1 legacy skinned/morph fork deletion at flag removal; Q-01-2 splice `prd06.deform`; Q-01-3 `sampler2DArray` reflection | Accepted |
| 07 | R-01-1 publish `"prd01.forwardTarget"` and fill `sceneDepth` in the stub seam; R-01-2 legacy height-fog mode | R-01-1 accepted (Phase 1); R-01-2 accepted as optional legacy patch |
| 08 | Q-01-1 legacy camera-fade patch | Declined under §3.7 (legacy frozen); camera fade is honoured on generated programs via C-02 |
| 09 | Q-01-1 in-shader C-05 overlay | Accepted (Phase 4) |
| 15 | Q-01-1 lean bug-fix port; Q-01-2 `A3DRenderer` members; Q-01-3 `PbrReference.ts`; Q-01-4 fold `ShaderLibraryCore.ts` at flag removal; Q-01-5 merge the scene-graph move | Accepted; `PbrReference.ts` is kept as the BRDF CPU mirror and switches to `Vec3` from `@aura3d/scene` (already a dependency of `@aura3d/rendering`) |

## 13A. Parallel execution

### Day-0 start conditions
Lane 01 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts: `packages/rendering/src/contracts/{core,frameGraph,program,materialLobes,blend,output,geometry,frameUniforms,environment,shadows,sampling,post,velocity,deform,atmosphere,quality,device,rendererFactory,renderItem,renderSource,index}.ts` and `testing/ChunkHarness.ts`; `packages/engine/src/contracts/{flags,output,sceneGraph,materials,diagnostics,compiler,app,index}.ts` and `stubs/*`; `packages/aura3d-cli/src/contracts/commands.ts`; the pre-declared optional fields of C-04, C-06, C-07, C-15, C-38; lane barrels `packages/{rendering,engine}/src/lanes/prd01.ts`, `agent-api/compiler/diagnosticOnly.prd01.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/index.ts`, `packages/aura3d-cli/src/commands/prd01/index.ts`; the conformance harness. No other lane's real implementation is needed.

Work in files lane 01 owns outright starts on day 0: `program/`, `output/`, `resources/{InstanceBuffer,UniformBlock}.ts`, `geometry/Primitives.ts`, `Geometry.ts`, `BlendModes.ts`, `ResolutionGovernor.ts`, `renderer/PixelRatio.ts`, `Material.ts`, `BRDFLut.ts`, `WebGL2StateCache.ts`, the unlit materials, `agent-api/{sceneGraph,color}.ts`, `tools/shader-lint/`, `tools/quality-rebuild-codemods/`, lane scenes and tests. Edits inside hot files start when the PR 0b part that carves them merges (≤ 2026-10-07); until then the replacement is written in a new lane module and wired after the merge:
- PR 0b-1: `app/colorManagement.ts`, C-31/C-36/C-38 seams; `compiler/{sceneGraph,color}.ts` (or lane 15 T3.8 / Q-15-7).
- PR 0b-2: `renderer/FrameGraph.ts` seam and the carve-outs that free lane 01's remaining cores of `ForwardPass.ts`, `WebGL2Device.ts`, `Renderer.ts`.

### Owned files and directories (must match CONTRACTS §4.1, row "01")
`packages/rendering/` default for anything not listed for another lane, which includes `Renderer.ts`, `ForwardPass.ts`, `WebGL2Device.ts`, `WebGL2StateCache.ts`, `RenderGraph.ts`, `RenderPass.ts`, `SceneOptimization.ts`, `BRDFLut.ts`, and legacy `ShaderLibrary.ts`/`ShaderLibraryCore.ts`/`ShaderChunks.ts`. Also: `renderer/` (default, incl. `FrameGraph.ts`), `forward/` (default), `webgl2/` (default, incl. `RenderTargets.ts`), `program/` (except the 11 items), `output/`, `resources/` (except 06 and 11 items), `shaders/` (default), `production-runtime/shaders/chunks/`, `BlendModes.ts`, `ResolutionGovernor.ts`, `ColorManagement.ts`, `Exposure.ts`, `ToneMapping.ts`, `Geometry.ts`, `Material.ts`, `MeshConsolidation.ts`, `PbrReference.ts`, `ShaderModule.ts`; `packages/engine/src/agent-api/{sceneGraph,color}.ts`, `agent-api/app/colorManagement.ts`, `agent-api/compiler/{sceneGraph,color}.ts`; `tools/quality-rebuild-codemods/`, `tools/shader-lint/`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd01,prd-01}/`, `packages/*/src/lanes/prd01.ts`, `agent-api/compiler/diagnosticOnly.prd01.ts`, `packages/aura3d-cli/src/commands/prd01/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/`, `.github/workflows/qr-prd01-*.yml`, `tests/qr/prd01/`, `tests/unit/contracts/impl/prd01-*`. New test files elsewhere under `tests/` belong to this lane by the creator rule.

Tasks of the earlier draft that edited files owned by other lanes were converted: to extension points (`index.ts` options/members → C-38 pre-declared fields and the `output` factory; scene graph and color → lane 01 carve targets; benchmark `scenes.ts`/`aura3d/common.ts` → C-30 lane scene dirs and the `?a3d-qr=` flag; capture assertions → C-33 plugin request; `RenderDevice.ts` blend retype → C-04 optional fields; morph textures → C-18) or to §13.4 requests (`compiler/{primitives,geometry,renderer,postprocess}.ts`, `index.ts` canvas/DPR/physics/material, `rendererOptions.ts`, `GameRenderPreset.ts`, `GameAppRuntime.ts`, `WebGPUDevice.ts`, `RendererPostprocessPlan.ts`, `PostprocessExecution.ts`, `LegacyPost.ts`, PBR material classes, `GLTFRenderResources.ts`, `SpriteFlipbook.ts`, lean, templates, routes, `BUNDLE_SIZES.md`).

### Extension points used in files owned by others
| Host file (owner) | Extension point | Lane 01 registrant |
|---|---|---|
| `app/createAuraApp.ts` (15) | C-38 `registerAppExtension({ member: "output" })` + flattened `setOutput`/`setOutputOverlay`/`capture`/`onRendererError`/`precompile` | `packages/engine/src/lanes/prd01.ts` |
| `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection` for `output`, `resolution`, `programs`, `frameAllocations` | same |
| compiler (15) | C-36 degradations, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage` | `agent-api/compiler/diagnosticOnly.prd01.ts`, `compiler/{sceneGraph,color}.ts` |
| `aura3d-cli/src/cli.ts` (05) | C-39 `registerCodemod("core-v2")`, `registerCliCommand("core inspect-programs")` | `packages/aura3d-cli/src/commands/prd01/index.ts` |
| `shared/registry.ts` (12) | C-30 lane scene index | `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/index.ts` |
| `capture-games.mjs`, `capture.mjs` (12) | C-33 `--flags` passthrough (`a3d-qr=core`) | lane workflow `qr-prd01-core.yml` |
| C-03 lobe chunks (04), C-09/C-10/C-11 chunks (02), C-18 deform (06), C-21 fog (07) | lane 01 is the host: generator splices registered chunks at C-02 hooks | `program/ProgramGenerator.ts` |

### Feature flags (CONTRACTS §5)
| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_CORE` | `off` \| `v2` | every lane 01 behaviour change: scene-graph composition, primitives through `createPrimitiveGeometry`, color parser, blend modes, DPR policy, render scale, capture path, frame-graph split, generator, HDR output | `renderer.core: "v1" \| "v2"`, benchmark `?core=v1\|v2` |
| `A3D_QR_CORE_OUTPUT` | bool (default on under `v2`) | HDR scene target, OutputPass, dither, background coverage, in-shader overlay | — |
| `A3D_QR_CORE_GENERATOR` | bool (default on under `v2`) | draws through `ProgramCache`/generator instead of `ShaderLibrary` | — |
`renderer.strictMount` is an alias of `A3D_QR_STRICT` (lane 15) scoped to mount; lane 01 owns no strict flag.

### Stubs used
C-03 (empty lobe registry), C-09/C-10 (legacy environment and lights), C-11 (features stored, not applied), C-12, C-13 (legacy post chain, no upstream exposure), C-14 (inert), C-16 (UNORM), C-18 (passthrough deform, CPU morph), C-21 (legacy fog), C-27 (real data), C-28 (sync `compileAsync`, partial counters, CPU-only FrameStats), C-29 (today's factory), C-30, C-31, C-32, C-33, C-36 (legacy compiler wrapper), C-38/C-39 (real). Lane 01's own stubs (C-01, C-02, C-04, C-05, C-06, C-07, C-08) stay the flag-off path until CONTRACTS §5.4 removal.

### Integration checkpoints (CONTRACTS §7; never block a lane 01 merge)
- IC-0 (2026-10-08): flags `none` baseline; lane 01 records baselines for its six lane scenes and the 18 base scenes (`evidence/prd01/IC-0/`).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening only. First expected integrated signals: lighting chunks on generated programs (C-10 real), linear post in `post-hdr` (C-13 real).
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds, the only rounds that can move `A3D_QR_CORE` to `integrated-accepted` and satisfy §17.2. Leave-one-out (`all,-core`) attributes regressions.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane. Unresolved Q-* requests are listed in each checkpoint report.

## 14. Implementation phases

Every phase merges to main at any time behind `A3D_QR_CORE` (CONTRACTS §6.1): no PR changes flag-off behaviour, and the flag-off sentinel identity check must stay green. Phases are numbered for traceability, not sequenced against other lanes: Phases 0-4 all start on day 0 after PR 0a in parallel sub-teams (their files are disjoint), and each phase depends only on lane 01's own earlier work where stated. "Lane capture" means `.github/workflows/qr-prd01-core.yml` on GitHub Actions `macos-14` (Chromium/ANGLE Metal), which captures lane 01's `prd01-*` scenes and the 18 base scenes in both engines with `?a3d-qr=core` and `?a3d-qr=none`. Exit criteria are standalone (provable with every other lane's stub); integrated targets are in §17.2. No phase exits on unit tests alone.

**Phase 0: Lane scaffolding (days 0-3, starts day 0).**
Lane scenes `prd01-scene-graph-hierarchy`, `prd01-tonemap-exposure-ramp`, `prd01-blend-modes`, `prd01-specular-aa`, `prd01-primitive-catalog`, `prd01-draw-throughput` with Aura and three r185 adapters in lane dirs (C-30); `qr-prd01-core.yml`; flag registration and the four C-31 sections (stub values); `diagnosticOnly.prd01.ts`; lane metrics scripts in `tests/qr/prd01/metrics/`; Q-* requests filed.
Exit: the lane capture runs green with `?a3d-qr=none` and `?a3d-qr=core` (identical while nothing is wired); IC-0 baselines for the six lane scenes and the 18 base scenes are committed under `docs/project/aura3d-quality-rebuild/evidence/prd01/IC-0/`.

**Phase 1: Scene graph, primitives, color parser, instance composition (C-06, C-07; starts day 0).**
Exit:
- §16.1 unit tests for composition, primitives, instance matrices and color pass; C-06 and C-07 conformance pass for stub and real.
- `prd01-scene-graph-hierarchy`: object mask IoU vs three ≥ 0.98, per-part centroid error ≤ 2 px at 1280×720 (flag on); flag off unchanged.
- `prd01-primitive-catalog`: per-primitive IoU ≥ 0.98; cylinder cap IoU ≥ 0.97, cap luma within ±10% of three, cap normal within 10° of +Y.
- Sphere silhouette faceting: max radial deviation from a fitted circle ≤ 0.5 px at 1280×720 in `prd01-primitive-catalog`.
- Instance composition: a `world · instance · geometry` unit test and the `prd01-draw-throughput` instance grid at authored spacing (mask coverage within ±5% of three).

**Phase 2: Blend modes, render-target fields, canvas policy, governor, capture (C-04, C-05 `capture`; starts day 0).**
Exit:
- `prd01-blend-modes` per-pixel MAD ≤ 2/255 vs three for alpha, premultiplied, additive, multiply; C-04 conformance real.
- `app.capture()` with `preserveDrawingBuffer: false` reproduces the `canvas.toDataURL()` image taken with `preserveDrawingBuffer: true` (MAD ≤ 1/255) on `prd01-scene-graph-hierarchy`.
- `RenderTargetDescriptor` `dimension`/`layers`/`depthOnly`/`depthCompare`/`colorAttachments` implemented (lane 02 Q-01-5, lane 03 Q-01-2); `RENDER_TARGET_FEATURE_PENDING` no longer thrown.
- `resolveCanvasPixelRatio` and `ResolutionGovernor` unit-tested; on lane scenes at `deviceScaleFactor: 2` with no explicit `pixelRatio`, `diagnostics().resolution.pixelRatio = min(2, tier.maxPixelRatio)`.
- Readback triage table committed (`evidence/prd01/readback-triage.json`); every lane 01-owned class (b) file migrated; requests filed for the rest.

**Phase 3: UBOs, frame graph, program generator, PBR core (C-01, C-02, C-08; starts day 0, chunks and key work first).**
Order inside the lane: `resources/UniformBlock.ts` → `program/ProgramKey.ts` → chunks → `ProgramGenerator` → `ProgramCache`/`ProgramWarmup` → material allow-list (`PBRMaterial`, `InstancedPBRMaterial`, `TexturedPBRMaterial`, `NormalMappedPBRMaterial`, `SkinnedLitMaterial`, unlit) → depth programs → FrameGraph split.
Exit:
- With `A3D_QR_CORE_GENERATOR` on, `diagnostics().programs.keys` contains only generator keys on all 18 base scenes; every registered chunk from any lane compiles in the generator (C-02 browser conformance real).
- Shader lint (§16.1) clean on every generated source.
- BRDF CPU-mirror tests (§15 Phase 3) pass; white Lambert plane under ambient 1 outputs linear radiance 1/π ± 1%.
- `prd01-specular-aa` temporal highlight σ ≤ 1.2× three's and ≤ 0.5× flag-off.
- No G-REG regression vs flag-off on the 18 base scenes beyond the declared look changes (fudge removal, ambient 1/π), each listed with its region and sign in `evidence/prd01/phase-3/declared-changes.md`.
- C-01 real: `after-opaque` contributor sees `sceneDepthCopy`; contributor transparents interleave by `sortDepth` (unit + browser).

**Phase 4: HDR end-to-end and OutputPass (C-05 real; starts day 0 with operator ports).**
Exit:
- With `A3D_QR_CORE_OUTPUT` on, every route that renders through `Renderer` reaches the canvas through OutputPass; `u_outputColorSpace` and the Narkowicz curve are absent from all generated sources.
- `prd01-tonemap-exposure-ramp` per-swatch ΔE2000 ≤ 2 (mean ≤ 1) vs three for `aces`, `agx`, `neutral` at exposures 0.5, 1, 2; single sRGB encode on the 50% grey card (C-05 browser conformance real).
- Dither and background-coverage tests (§15 Phase 4) pass; overlay at zero is bit-identical to no overlay.
- `output.exposure` 2 doubles linear pre-tonemap values (operator `linear`, low input).

**Phase 5: Tone-map default A/B preparation (after Phase 4 inside the lane).**
Exit: the lane capture records both operators for all lane and base scenes; the A/B request is filed with lane 12 (Q-12-1). The decision record `evidence/prd01/decisions/tonemap-default.md` is written from the G-PANEL result (integrated); until then `DEFAULT_TONE_MAPPING` stays `"aces"`.

**Phase 6: Submission performance (after Phase 3 inside the lane).**
Exit:
- `prd01-draw-throughput` steady state: zero GL object creation (C-28 `bufferCreates`, `renderTargetsCreated`, `programCompiles` deltas 0) and JS heap delta ≤ 16 KB/frame averaged over 600 frames.
- CPU submit time for `prd01-draw-throughput` ≤ 40% of flag-off on the runner.
- Zero program compiles after `app.ready()` over a 60 s scripted orbit on every lane scene and the 18 base scenes.

**Phase 7: Flag removal (CONTRACTS §5.4; only after `A3D_QR_CORE` has been `default-on` for two checkpoints).**
Exit: lane 01's §5.4 deletions are merged; `rg -n "u_outputColorSpace|mix\(1\.1, 0\.65|a3dApplyAdvancedPbrLobes" packages/rendering/src` returns nothing; `A3D_QR_CORE` is in `REMOVED_QR_FLAGS`; bundle delta recorded in the PR. Deletions owned by other lanes (lean device, safe-basic, `production-runtime/materials`, WGSL stubs) are tracked as their own requests and do not gate this exit.

## 15. Task checklist

Every item edits only lane 01-owned paths (§13A). Items that need another lane's file are §13.4 requests and are not checklist items. `[S]` marks items whose test is part of standalone acceptance (§17.1).

### Phase 0
- [ ] [S] `benchmarks/quality-rebuild/scenes/prd01/index.ts` (+ `aura3d/scenes/prd01/`, `three/scenes/prd01/`): add the six `prd01-*` scene specs exactly as specified in §17.3, each with `owner: "prd01"`, `referenceProfile: "contract"`, `qrFlags: ["core"]`, masks and `primaryCriterion`. Scenes that need unwired engine fields (`blend`, `tessellation`) build their content through `@aura3d/rendering` public APIs in the Aura adapter. Test: `tests/unit/contracts/C-30-bench-registry.test.ts` (unique ids, owner prefix, both adapters) plus a lane-capture run producing both PNGs per scene.
- [ ] `tests/qr/prd01/metrics/{maskIoU,regionSsim,deltaE2000,temporalSigma}.ts`: pure functions over PNG buffers used by the lane workflow until lane 12's C-33 metric plugins land (Q-12-1). Test: `tests/qr/prd01/unit/metrics.test.ts` with synthetic PNGs (known IoU 0.5, ΔE of a known swatch pair).
- [ ] `.github/workflows/qr-prd01-core.yml`: `runs-on: macos-14`; jobs `unit` (`pnpm test:unit -- tests/qr/prd01 tests/unit/contracts`), `browser` (Playwright Chromium with `tests/qr/prd01/playwright.config.ts`), `capture` (lane scenes + 18 base scenes, `--flags core` and `--flags none`, artifacts to `evidence/prd01/<run-id>/`). Test: workflow green on the PR 0a branch.
- [ ] `packages/engine/src/lanes/prd01.ts`: register C-31 sections `output`, `resolution`, `programs`, `frameAllocations` (observed values or `null`, never constants) and the C-38 `output` factory pointing at the stub until Phase 2/4. Test: `tests/unit/contracts/C-31-diagnostics.test.ts` and `C-38-app-extensions.test.ts` green with lane 01's entries.
- [ ] `agent-api/compiler/diagnosticOnly.prd01.ts`: list every pre-declared lane 01 field (`renderer.output`, `.resolution`, `.msaa`, `.compile`, `.strictMount`, `.debug`, `primitive.tessellation`, `material.blend`, `material.depthWrite`, `material.ior`, `transform.rotationOrder`, `transform.quaternion`, `background.toneMapped`). Test: C-36 option-coverage gate green.
- [ ] File requests Q-03-1 … Q-15-7 (§13.4) as `qr-request` issues; acknowledge incoming requests (§13.5).
- [ ] Commit IC-0 baselines (images, metrics JSON, run id) to `docs/project/aura3d-quality-rebuild/evidence/prd01/IC-0/`.

### Phase 1: Scene graph (C-06)
- [ ] [S] `packages/engine/src/agent-api/sceneGraph.ts`: `composeWorldMatrix(parent, local, out)`, `decomposeMatrix(m)`, `eulerToQuaternion(euler, order)` for all six orders, per-node version/dirty cache; column-major math written into caller-supplied outputs; no `@aura3d/math` import (§2.2). Provide via `sceneGraphSlot.provide` in `packages/engine/src/lanes/prd01.ts`. Test: `tests/unit/contracts/impl/prd01-scene-graph.test.ts`: (a) rotated parent [0, π/2, 0] with child at [1,0,0] gives world [0,0,−1]; (b) parent scale 6 with child at [1,0,0] gives [6,0,0]; (c) translation-only groups identical to the stub; (d) a three-level nest matches a three.js `Object3D` hierarchy (test imports `three` from `node_modules`) to 1e-5; (e) shear flags `SCENE_GRAPH_SHEAR`; (f) `"ZYX"` default reproduces the legacy `rotationXYZ` (`index.ts:17900-17909`) for 100 random Eulers.
- [ ] [S] `agent-api/compiler/sceneGraph.ts` (after the PR 0b-1 / T3.8 verbatim move, Q-15-7): with `A3D_QR_CORE=v2`, `flattenSceneNodes` / `composeAuraTransform` (ex-`index.ts:17960-18006`) call C-06 and attach `world: AuraWorldTransform`; `position`/`rotation`/`scale` are overwritten with decomposed world TRS for legacy consumers when `sheared === false`; `createModelMatrix` (ex-`:17766`) takes the world matrix and applies `S(size ⊙ fit) · normalizeOffset` innermost into a caller-supplied output (no per-call `Float32Array`). Flag off: moved bodies unchanged. Test: `tests/qr/prd01/unit/compiler-scene-graph.test.ts` — flag-off byte-equal `RenderSource` on the 18 base snapshots; flag-on 50 random single-node TRS matrices equal to the legacy ones.
- [ ] [S] `lookAt` resolves after composition using world position. Test: a child with `lookAt` inside a rotated group faces the world target (angle error < 1e-4 rad).
- [ ] [S] World-matrix cache: 1,000-node static scene computes 1,000 matrices on frame 1 and 0 on frame 2 (dev counter in the `frameAllocations` section).
- [ ] `rotationOrder`/`quaternion` and builder `.rotate(x, y, z, order?)` / `.quaternion(x, y, z, w)`: the fields are PR 0a pre-declared; lane 01 wires their semantics in `compiler/sceneGraph.ts` and removes them from `diagnosticOnly.prd01.ts`. Builder method bodies live with the builder owner (lane 15) and are covered by Q-15-6 if not pre-declared as delegating. Test: option-coverage rows `transform.rotationOrder`, `transform.quaternion` change the RenderSource.
- [ ] Publish facts `F-01-rotationOrder`, `F-01-groups` to Appendix B (C-40).

### Phase 1: Primitives (C-07)
- [ ] [S] `packages/rendering/src/Geometry.ts`: extend `cylinder` with `radiusTop`, `radiusBottom` and `heightSegments`; extend `litPlane` with segments; add `torus` and `box`; add capsule `ellipticity`; default `textured: true` from `createPrimitiveGeometry`. Test: `tests/qr/prd01/unit/geometry-primitives.test.ts` asserts, for every primitive, that every triangle's geometric normal agrees with the averaged vertex normal (dot > 0); indices in range; UVs in [0,1]; tangents orthogonal to normals (|dot| < 1e-4), w = ±1; bounds match spec; Uint32 indices above 65,535 vertices (C-07 conformance).
- [ ] [S] `packages/rendering/src/geometry/Primitives.ts`: `createPrimitiveGeometry(primitive, tessellation, tier, effectiveDimensions?)` with C-27 `primitiveSegments: "half"` halving, capsule folding of `size ⊙ localScale` (§6.3) and a geometry cache keyed by `(primitive, params)` with quantized capsule aspect. Test: capsule at size [0.2, 1, 0.2] has hemispherical ends of radius 0.1 and a 0.8 straight section (vertex check); 685 boxes produce 1 geometry upload (C-28 `bufferCreates` delta).
- [ ] [S] Browser test `tests/qr/prd01/browser/primitive-catalog.spec.ts` on `prd01-primitive-catalog` (both engines). A missing cap shows the ground or the inner back wall, which may be brighter than the side, so luma alone could pass with the cap absent. Assert: (1) cap-region object-mask IoU vs three ≥ 0.97 from a flat-ID render (unlit, per-object color); (2) cap-region mean linear luma within ±10% of three; (3) cap-region normal estimate (finite differences of depth) within 10° of +Y.
- [ ] Publish facts `F-01-tessellation`, `F-01-capsule` (C-40). Engine routing (`compiler/geometry.ts`, `:14977`) and the physics capsule (`index.ts:5380`) are Q-15-2 / Q-15-6.

### Phase 1: Instance composition (C-07)
- [ ] [S] `packages/rendering/src/resources/InstanceBuffer.ts` and `instanceBufferSlot.provide` in `packages/rendering/src/lanes/prd01.ts`: persistent buffer per source node, `version` bump on set, `bufferSubData` only on version change, capacity doubling, `INSTANCE_CAPACITY_EXCEEDED`. Test: C-07 conformance real; `tests/unit/contracts/impl/prd01-geometry.test.ts` capacity throw and version semantics.
- [ ] [S] `ForwardPass.ts` instancing (`:1711-1803`) and the generator `instancing` chunk: `u_modelMatrix` (node world, no size) · instance · `u_geometryMatrix` (§8.5), reading `RenderItem.geometryMatrix` when present (identity otherwise). Test: unit — a 3×3 grid with `size: 0.3`, spacing 1 gives world centers at spacing 1; instance rotated 45° about Y with size [0.3, 0.6, 0.3] has orthogonal world axes (dot < 1e-5). Browser — `prd01-draw-throughput` instance grid mask coverage within ±5% of three.
- [ ] Coordinate with lane 15 T3.10 (R18): the engine `size` fix ships unflagged in `compiler/primitives.ts`; lane 01's test fixture asserts both paths agree on scene 16 geometry.

### Phase 1: Frame graph seam (C-01, lane 07 R-01-1)
- [ ] [S] `renderer/FrameGraph.ts` (PR 0b-2 seam, lane 01 owned): publish the forward `RenderTarget` on the blackboard as `"prd01.forwardTarget"` and fill `ctx.sceneDepth = { texture, linearize, available: true }` when it has a depth texture. Test: `tests/unit/contracts/impl/prd01-frame-graph.test.ts` with `MockRenderDevice`; all-flags-off call count stays 0.

### Phase 1: Color parser (C-06)
- [ ] [S] `packages/engine/src/agent-api/color.ts`: `parseAuraColor` (linear RGBA) and `parseAuraColorSrgb` supporting `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` (comma and space syntax), `hsl()/hsla()`, the 148 CSS named colors, and numbers `0xRRGGBB`; exact piecewise sRGB transfer; `AuraColorParseError` carrying the input. The shared transfer functions live in lane 01's `packages/rendering/src/ColorManagement.ts` so the engine has one implementation. Test: `tests/unit/contracts/impl/prd01-color.test.ts`, a 40-input table (every syntax, `orange`, `rebeccapurple`, `#f80`, `0xff8800`, invalid strings); C-06 color round-trip conformance.
- [ ] [S] `agent-api/compiler/color.ts` (after Q-15-7 move): with `A3D_QR_CORE=v2`, the bodies of `colorToRgba` (ex-`index.ts:15378`), `colorToClearColor` (`:15383`), `colorToLinearClearColor` (`:15391`), `colorToLinearRgba` (`:15396`), `colorToLinearRgb` (`:15443`) and `colorToRgb` (`:17911`) delegate to `color.ts`, each keeping its output space (sRGB helpers → `parseAuraColorSrgb`, linear → `parseAuraColor`); invalid input warns `COLOR_PARSE_FAILED` and keeps the old fallback unless strict. Test: the 6 helpers return identical values to flag-off for 20 valid `#rrggbb` inputs; `"orange"` no longer returns `[0.02, 0.025, 0.035, 1]`.
- [ ] Remaining duplicate hex parsers in other lanes' files (`LayeredSceneComposition.ts:648`, `WaterSurface.ts:188`, `AtmosphereWetness.ts:119`, `index.ts:18709`/`:18722`, `packages/lean/src/base.ts:504`) are requests Q-10-1, Q-07-1, Q-15-6, Q-15-4. The template copy `packages/create-aura3d/templates/animation-studio/studio/src/state/util.ts:38` is user code and is left alone.

### Phase 2: Blend modes (C-04)
- [ ] [S] `packages/rendering/src/BlendModes.ts`: `resolveBlendMode`, factor tables (§6.8), `renderStateKey` (u32, scissor excluded). `Material.ts:32-42`: add `blendMode?`, `depthCompareV2?`, `alphaToCoverage?` to `RenderState` (defaults unchanged). Test: C-04 unit conformance (factor tables, key stability); `tests/unit/contracts/impl/prd01-blend.test.ts` — every built-in mode and 20 random custom states give distinct keys; legacy `blend: true` resolves to `alpha`.
- [ ] [S] `WebGL2Device.ts:4402-4405`: with `blendMode` present, apply `blendEquationSeparate` / `blendFuncSeparate` and `depthCompareV2`; legacy `blend` path unchanged when absent. `WebGL2StateCache.ts`: separate func/equation dedupe. ForwardPass copies `alphaToCoverage` into `RenderCommandState` (lane 04 Q-01-6). Test: C-04 browser conformance (4 modes × 3 backgrounds) and `tests/qr/prd01/browser/blend-modes.spec.ts` on `prd01-blend-modes` vs three (`NormalBlending`, premultiplied, `AdditiveBlending`, `MultiplyBlending`): MAD ≤ 2/255.
- [ ] [S] `ForwardPass.ts`: queue classification by blend mode (§6.8); additive and multiply after alpha. Test: unit sort order with 6 items.
- [ ] Legacy patch from lane 03 Q-01-1: `custom` blend `(srcRGB, dstRGB, ZERO, ONE)` reachable when `prd03.indirectFraction` is active. Test: C-04 key for that custom state is stable.
- [ ] Publish fact `F-01-blend` (C-40). Engine `material.blend` wiring (`index.ts:14899-14934`), glTF `alphaMode`, particles and `SpriteFlipbook` are Q-15-6, Q-04-2, Q-07-1; WebGPU mapping is Q-11-4.

### Phase 2: Render targets (CONTRACTS §3.4; lane 02 Q-01-5, lane 03 Q-01-2)
- [ ] [S] `WebGL2Device.ts` render-target creation (`:663-676` and the general path): implement `dimension: "2d" | "cube" | "2d-array"`, `layers`, `depthOnly`, `depthCompare` (comparison sampler), `colorAttachments` (MRT, `drawBuffers`, `clearBufferfv` per attachment); stop throwing `RENDER_TARGET_FEATURE_PENDING`. Device uniform reflection binds `GL_SAMPLER_2D_ARRAY` uniforms to `TEXTURE_2D_ARRAY` units (lane 06 Q-01-3). Test: `tests/qr/prd01/browser/render-targets.spec.ts` — depth-only cube target renders 6 faces; a 2-attachment target receives distinct clears; a `sampler2DArray` program samples layer 3.

### Phase 2: Canvas policy, DPR, governor, capture (C-05 `capture`, C-27)
- [ ] [S] `packages/rendering/src/renderer/PixelRatio.ts` `resolveCanvasPixelRatio`: `explicit ?? resolution.pixelRatio ?? min(devicePixelRatio, tier.maxPixelRatio)`, no `[1, 2]` clamp; `Renderer` uses it for canvases it sizes and re-evaluates on `resize` and `matchMedia("(resolution: …dppx)")`. Test: unit with mocked DPR 1, 2, 3 × every tier (Ultra at DPR 3 gives 3); browser at `deviceScaleFactor: 2` on a lane scene with no explicit `pixelRatio` asserts backing = 2× CSS (High tier).
- [ ] [S] `packages/rendering/src/ResolutionGovernor.ts` (§6.9) inside `Renderer`: samples C-28 FrameStats (`gpuMs` when non-null, else `intervalMs`), adjusts the scene-target size only; `Renderer.setRenderScaleCeiling`; effective `min(ceiling, governor)`; C-31 `resolution` section reports `pixelRatio`, `renderScale`, ceiling, backing size. Test: synthetic frame times — step down after 30 slow frames, up after 120 fast frames, floor at `1/devicePixelRatio`, `allowSubCssResolution` lifts the floor; canvas backing size unchanged when the ceiling is 0.5 and `renderScale === 0.5` is reported.
- [ ] [S] C-05 `capture()` real in the `output` factory (`packages/engine/src/lanes/prd01.ts`): render a frame now and `readPixels` the default framebuffer in the same task (flip rows; `ImageBitmap` or PNG `Blob`); never sets `preserveDrawingBuffer`; with `A3D_QR_CORE_OUTPUT` it reads the post-OutputPass image. Test: `tests/qr/prd01/browser/app-capture.spec.ts` — with `preserveDrawingBuffer: true`, `capture()` equals `canvas.toDataURL()` (MAD ≤ 1/255); with `false`, it still equals that image.
- [ ] [S] C-05 `onRendererError` real: the `output` factory forwards every C-36 degradation with code `renderer-mount-failed` (from `onDegradation`) and C-29 device-lost-without-restore to listeners and to `console.error` once, and records `{ code, message, cause }` in `diagnostics().errors`. Test (`tests/qr/prd01/browser/renderer-mount-failure.spec.ts`, `?a3d-qr=core,strict`): a C-29 `Renderer.create` test double that rejects → (1) with strict off `await app.ready()` resolves; (2) `diagnostics().errors` contains `renderer-mount-failed`; (3) `onRendererError` fired once; (4) with `renderer.strictMount: true`, `ready()` rejects with the same code. The "no safe-basic draw" and overlay assertions run once lane 15's T4.2 lands (integrated I9).
- [ ] [S] Lane 01 canvases (Renderer-created and lane scene adapters) use `{ antialias: false, preserveDrawingBuffer: false, alpha: false, powerPreference: "high-performance" }` under the flag, honouring `renderer.debug.preserveDrawingBuffer` with a dev warning. Test: `tests/qr/prd01/unit/context-attributes.test.ts` on the attributes passed to `getContext`.
- [ ] Readback triage: run `git grep -l "toDataURL\|readPixels\|toBlob(" -- tools tests apps templates 'packages/*/src'`, classify every hit (a)/(b)/(c) (§11 item 5) with its §4.1 owner, commit `evidence/prd01/readback-triage.json`, migrate lane 01-owned (b) files to `app.capture()`, and file the rest (Q-13-1, Q-14-1, others by owner). Test: lane browser suite green with `?a3d-qr=core`.
- [ ] `core-v2` codemod (`tools/quality-rebuild-codemods/core-v2.ts`, registered via C-39): pure `source → code + rows` transforms for `pixelRatio` overrides (Skyline Runner `main.ts:1879`; Turbo Drift capture-only `main.ts:2988` → `renderer.resolution.maxPixelRatio: 1` inside the same `visualCaptureCamera` branch, comment `:2983-2986` corrected; `Math.min(x, devicePixelRatio)` patterns), `qualityProfile` → `quality`, `safe-basic` inventory, ambient review list. Test: `tests/qr/prd01/unit/codemod-core-v2.test.ts` on fixtures copied from the routes (purity, exact rows). Lane 14 applies it (Q-14-1).

### Phase 3: Program generator (C-02, C-08, C-01)
- [ ] [S] `resources/UniformBlock.ts` (first): std140 packer, `AuraFrame` at binding 0 in the frozen C-08 order, uploaded once per view with `bufferSubData`; binding 1 reserved for lane 02's `AuraLights`. `frameUniformsSlot.provide` in `lanes/prd01.ts`. Test: C-08 conformance (offsets equal the frozen table) and `impl/prd01-frame-uniforms.test.ts`.
- [ ] [S] `program/{ProgramFeatures,ProgramKey,ProgramGenerator}.ts` and `program/chunks/{common,colorspace,brdf,normal,instancing,alpha,lights_legacy,indirect_default,fog_default,depth}.glsl.ts`, with C-02 hook splicing and default bodies (§6.4). Test: snapshot tests of generated source for 12 representative feature sets; key-uniqueness property test over 5,000 random feature records (including registered feature bits); every snapshot compiles in WebGL2 (`tests/qr/prd01/browser/program-generator-compile.spec.ts`); C-02 conformance real (every chunk any lane has registered compiles in the generator).
- [ ] [S] `program/ProgramCache.ts`: `KHR_parallel_shader_compile` (`COMPLETION_STATUS_KHR` polling via `requestAnimationFrame`) when C-28 `probe.parallelShaderCompile`, else synchronous; `programCacheSlot.provide`. Test: browser — `acquire` returns `pending` then `ready` without blocking the frame when the extension is present.
- [ ] [S] `program/ProgramWarmup.ts`: walk the render source, collect feature records for every item × light bucket × shadow × env state for the current tier and C-27 `nextLowerTier`, and `precompile`; `app.ready()` awaits it through the C-38 `output`/`precompile` registration. Test: after `ready`, the first frame triggers 0 compiles (C-28 `programCompiles` delta).
- [ ] [S] `program/MaterialFeatures.ts` and `Material.ts`: default `programFeatures()` (C-03 `ProgramFeatureSource`) derived from `shaderKey`/`shaderVariant` and public uniforms; allow-list order `PBRMaterial`, `InstancedPBRMaterial`, `TexturedPBRMaterial`, `NormalMappedPBRMaterial`, `SkinnedLitMaterial`, `UnlitMaterial`, `TexturedUnlitMaterial`, `InstancedUnlitMaterial`; `PortableShaderMaterial` and custom materials keep `shaderKey`. Test: every built-in class maps to a feature record whose generated program compiles; unknown combinations fall back to the nearest superset with a warning.
- [ ] [S] `ForwardPass.ts:681` `shaderCacheKey`: `computeProgramKey` when `A3D_QR_CORE_GENERATOR` is on; bind `AuraFrame`; per-item light packing stays in lane 02's `forward/Lighting.ts`. Test: flag-off keys unchanged; flag-on `diagnostics().programs.keys` contains only generator keys on the 18 base scenes.
- [ ] [S] `brdf` chunk per §8.3 (lane 04 Q-01-5): IOR F0, F90, Lambert default, Burley behind `DIFFUSE_BURLEY`, specular AA, verbatim r185 `BRDF_GGX_Multiscatter`, r185 indirect dielectric/metallic split. `BRDFLut.ts`: add the r185 `DFGLUTData.js` 16×16 RG16F array verbatim (MIT header retained) as a renderer-owned `u_dfgLut` sampled at `(roughness, dotNV)`, uploaded once per device and bound to every lit generated program; `createExternalParityBrdfLut` stays for flag-off. Tests in `tests/qr/prd01/unit/brdf-reference.test.ts`, using the CPU mirror in `PbrReference.ts` (updated) and a CPU port of three's GLSL written in the test with the same LUT data and bilinear sampling:
  - (a) For 200 random (N, V, L, roughness, metallic, ior, specularIntensity) samples, the direct specular matches three r185 `BRDF_GGX_Multiscatter` and the diffuse matches `BRDF_Lambert(diffuseContribution)`, relative error < 1e-3.
  - (b) For 200 random samples, the indirect (diffuse plus specular) for unit `radiance` and `irradiance` matches r185 `RE_IndirectSpecular_Physical`, relative error < 1e-3.
  - (c) White-furnace directional albedo: for metal F0 = 1 and roughness 1, numerically integrate `a3dDirectSpecular · dotNL` over the hemisphere of L (Monte Carlo, 65,536 samples, fixed seed) at dotNV ∈ {0.2, 0.5, 1.0}. With multiscatter off, the result must be ≤ 0.80 and within ±0.02 of `dfg.x + dfg.y`, which proves the LUT and the single-scatter lobe agree. With it on, the result must recover at least half the missing energy (`E_ms ≥ E_ss + 0.5 · (1 − E_ss)`) and never exceed 1.02, so no energy is gained. The test also asserts `E_ms` matches the same integral of the three r185 CPU port within ±0.01.
  - (d) LUT bytes are identical to `node_modules/three/src/renderers/shaders/DFGLUTData.js` (lane 04's byte-identity test attached to Q-01-5).
- [ ] [S] Ambient in `indirect_default`: `irradiance · BRDF_Lambert(diffuseColor)`, no hemisphere factor. Test: a white Lambert plane with ambient 1 and no other light outputs linear radiance 1/π ± 1% (browser readback of the HDR target in a test-only path).
- [ ] [S] `tools/shader-lint/index.ts` (run in `pnpm test:unit`): fail if any generated or registered source contains `mix(1.1,`, `mix(1.0, 0.18`, `roughEnvironmentFloor`, `sourcePaint`, `materialRedPaintGate`, `a3dApplyAdvancedPbrLobes`, `a3dApplyMetalRough`, `u_outputColorSpace`, `2.51 * color`, or `step(0.5, u_` feature gates; frozen legacy files are excluded until flag removal. Test: lint fixtures (one per pattern) fail; the generator snapshots pass.
- [ ] [S] Extension lobes: include `materialLobes(flags)` chunks at `fragment:material`/`fragment:indirect`; with none registered record `extension-lobe-pending` (C-36, `ownerPrd: 4`). Test: unit — a material declaring `KHR_materials_clearcoat` with an empty registry renders base-lobe source and records exactly one degradation; with a test lobe registered, its chunk appears once.
- [ ] [S] Depth programs: `pass: "depth" | "distance"` with `vertex:deform` (C-18 passthrough or lane 06's chunk), instancing and alpha-mask. Test: depth program compile; `MockRenderDevice` raster check that a caster with a test deform chunk writes deformed depth.
- [ ] [S] Single environment sampler by `ENVMAP_TYPE_*` in `indirect_default`. Test: generated source contains exactly one env sampler declaration.
- [ ] [S] C-01 real (`renderer/FrameGraph.ts`): split `ForwardPass` into opaque and transparent passes; `sceneDepthCopy` after opaque (single-sample, sampleable); `after-opaque` before transparents (lane 02 Q-01-6); contributor `TransparentQueueItem`s interleaved by `sortDepth`; transmissive queue after `transmission` (lane 04 Q-01-6); `previousViewProjectionMatrix`. Test: C-01 unit + browser conformance real; flag-off pixel identity on 3 base scenes.
- [ ] Accepted legacy patches (§13.5; flag-off identical by construction because each is gated by the requesting lane's uniform): lane 02 Q-01-1..Q-01-4, lane 04 Q-01-1..Q-01-4, lane 07 R-01-2. Test per patch: flag-off uniform-default source renders byte-identical on the 18 base snapshots (sentinel check).

### Phase 4: HDR and OutputPass (C-05)
- [ ] [S] `output/OutputPass.ts` and `output/ToneMappingOperators.glsl.ts` per §8.6; AgX and Neutral constants verbatim from `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` (r185). Test: CPU mirror of each operator vs three's formulas on 1,000 inputs (abs error < 1e-4); `tests/qr/prd01/browser/output-pass.spec.ts` on `prd01-tonemap-exposure-ramp` ΔE2000 ≤ 2; C-05 browser conformance real (exposure ramp monotonic, single sRGB encode on the 50% grey card).
- [ ] [S] `Renderer.ts`: with `A3D_QR_CORE_OUTPUT`, always render to the HDR target and finish with OutputPass in C-01 phase `output`, including when `postprocess` is absent; `ForwardPass` gets no `outputColorSpace` (`Renderer.ts:674`) on that path. Test: a single unlit quad with emissive 4.0 under `none`, `aces`, `agx`, `neutral` gives the expected 8-bit output ±1.
- [ ] [S] `output/HdrTarget.ts` `probeHdrTargetFormat`: `rgba16f` → `r11f_g11f_b10f` → `rgba8` (degraded, `capability-degraded`). Test: unit with mocked extension sets; C-31 `output.targetFormat`/`degraded`.
- [ ] [S] Dither. Test (`output-pass.spec.ts`): a horizontal linear-radiance ramp 0.20 → 0.22 across 1,280 px, operator `none`, exposure 1 (≈6 sRGB codes; undithered runs ≈200 px). Assert: (1) dither off, the longest run of identical 8-bit values is ≥ 150 px (the test can detect banding); (2) dither on, ≤ 16 px; (3) dither on, each 64-px block mean within 0.5/255 of the ideal encoded value (unbiased).
- [ ] [S] Exposure: `u_exposure = output.exposure × blackboard["prd03.exposure"] ?? 1`; `app.setOutput` real (C-05) marks static scenes dirty and forwards `preset`/`autoExposure` to `app.post` (lane 03 Q-01-6). `app/colorManagement.ts`: delete `sceneExposurePresets` and `defaultExposure` lies under the flag (lane 03 Q-01-4). Test: `setOutput({ exposure: 2 })` doubles the linear pre-tonemap value (operator `linear`, low input); with a test contributor publishing `"prd03.exposure" = 0.5`, the product is applied once; C-31 `output.exposure.applied` equals the sent value.
- [ ] [S] Background: clear the HDR target with the linear background color (no `colorToAcesInputClearColor`, ex-`index.ts:15400-15418`, on the flagged path); `scene().background(color, { toneMapped })` (PR 0a field) and the `backgroundCoverage` MRT (§6.5). Test (operator `aces`): (1) `#336699` with `toneMapped: false` reads back (51, 102, 153) ±1; (2) with `toneMapped: true` it equals CPU ACES of linear(#336699), encoded, ±1; (3) with `toneMapped: false`, an additive emissive quad (linear 4.0, alpha 1) over it reads back as `encode(ACES(linear(#336699) + 4.0))` ±1, not the clamped sum (fails under depth-based background classification by design).
- [ ] [S] Overlay in OutputPass (lane 09 Q-01-1): `setOutputOverlay` returns `{ applied: true }` without the DOM fallback when `A3D_QR_CORE_OUTPUT` is on. Test: zero overlay bit-identical to no overlay; flash `[1,1,1,0.5]` raises mean luma by the analytic amount ±1/255.
- [ ] [S] `FrameGraph`: reject `post-hdr` contributor passes declaring `space: "display"` (`FRAME_PHASE_SPACE_MISMATCH`). Test: unit. Plan tagging, CPU readback removal and Deep Recovery are Q-03-2, Q-03-3 (integrated).
- [ ] [S] `WebGL2Device` present shader (`ensureLdrPostprocessProgram`, `:3440-3640`): with `A3D_QR_CORE_OUTPUT` on, the legacy present path is bypassed; the fake `agx` (`:3541`) and `neutral` (`:3547`) remain only on the flag-off path until removal. Test: generated/output sources contain no per-channel `agx(float)`.
- [ ] Publish facts `F-01-output`, `F-01-exposure`, `F-01-capture` (C-40). Lean, `GameRenderPreset` and Aura Clash output changes are Q-15-4 and Q-11-4.

### Phase 5: Tone-map default A/B preparation
- [ ] [S] Lane capture: run every `prd01-*` scene and the 18 base scenes with `output.toneMapping` = `aces` and `agx` (both engines; three side `renderer.toneMapping`), recording `diagnostics().output.toneMapping` per run. Test: the lane report matches the requested operator for every capture.
- [ ] File the 18-game A/B with lane 12 (Q-12-1) for the next G-PANEL; games opt in with `?a3d-qr=core` and the operator query handled by lane 01's C-05 URL reader (`?aura3d-tonemap=aces|agx`, read in `lanes/prd01.ts`).
- [ ] Write `docs/project/aura3d-quality-rebuild/evidence/prd01/decisions/tonemap-default.md` from the G-PANEL record: per game or scene, per-category scores for both operators, delta, reviewer verdict. If AgX wins with no category regression, change `DEFAULT_TONE_MAPPING` in `contracts/output.ts` in a separate PR linking the record (value change, custodian review); otherwise record "ACES retained".

### Phase 6: Submission performance
- [ ] [S] `ForwardPass.drawItem` (`ForwardPass.ts:249-351`): packet pool and pipeline cache replace `new Map(binding.uniforms)` (`:293-311`) and `new RenderPipeline` (`:319`) per item; per-program uniform last-value cache in `WebGL2Device.uploadUniforms` (`:3695-3740`). The final draw call stays in lane 11's `forward/DrawSubmit.ts`. Test: 0 `RenderPipeline` constructions after frame 2 in `prd01-draw-throughput` (dev counter); CPU submit ms recorded.
- [ ] [S] InstanceBuffer adoption on the flagged path: delete the 64-instance uniform path from generated programs (`u_instanceMatrices[64]` exists only in the frozen legacy `ShaderLibraryCore.ts:247`, `:309`); all instancing uses attribute matrices. Test: 10,000 instances do 1 draw and 0 buffer creations after frame 1 (C-28 `bufferCreates`).
- [ ] [S] `WebGL2Device` VAO eviction: on `RenderBuffer.dispose`, delete VAOs whose key contains that buffer id (`vertexArrayCacheKey` `:4225`) and remove the buffer from `this.buffers` (`:498`). Test: create and dispose 1,000 instance buffers; the VAO map size returns to its baseline. This is a declared leak fix (CONTRACTS §6.1) and ships unflagged; lane 12 re-baselines nothing (no pixel change).
- [ ] [S] `MeshConsolidation.consolidateStatic(items)` for engine primitives without runtime handles or animation; lane 11 calls it at mount (Q-11-3). Test: unit — 576 static boxes consolidate to ≤ the legacy batch count with identical pixels in a `MockRenderDevice` raster.
- [ ] [S] Cached world matrices from Phase 1 are reused by `compiler/sceneGraph.ts` for static primitives, so no per-frame `createModelMatrix` call remains on the flagged path for them. Test: `frameAllocations.jsHeapDeltaBytes ≤ 16 KB/frame` over 600 frames on `prd01-draw-throughput`.
- [ ] [S] Zero-compile assertion: 60 s scripted orbit on every lane scene and the 18 base scenes logs 0 C-28 `programCompiles` after `await app.ready()` (lane capture assertion). The 18-game assertion is integrated (§17.2 I8).

### Phase 7: Flag removal (CONTRACTS §5.4)
- [ ] Remove the `A3D_QR_CORE` off path in one PR: frozen legacy lit programs and fudges (`ShaderLibraryCore.ts:291-782`, `ShaderLibrary.ts` lit programs, `ShaderChunks.ts` fudge chunks), fold or delete `ShaderLibraryCore.ts` (lane 15 Q-01-4), legacy skinned/morph forks and `MAX_GPU_MORPH_*` (lane 06 Q-01-1), FXAA/fusion branches (lane 03 Q-01-5), `production-runtime/shaders/chunks/*` (lane 04 Q-01-7), `createExternalParityBrdfLut`, the fake `agx`/`neutral` in `WebGL2Device.ts`. Keep shader-name aliases one minor. Test: `pnpm exec tsc -p tsconfig.build.json`, `pnpm test:unit`, lane browser suite, all remote; `rg -n "u_outputColorSpace|mix\(1\.1, 0\.65|a3dApplyAdvancedPbrLobes" packages/rendering/src` → nothing.
- [ ] Remove deprecated aliases older than one minor that lane 01 owns (`renderer.debug.preserveDrawingBuffer`, legacy `blend: boolean` reading in `resolveBlendMode` after C-04v2 if ever issued, shader-name aliases). Test: `git grep -n "debug: { preserveDrawingBuffer" -- apps templates tests tools` returns nothing outside migration-error tests (owners migrate their files from the triage table).
- [ ] Add `A3D_QR_CORE` to `REMOVED_QR_FLAGS` via the custodian (CONTRACTS §5.4) and record the bundle delta (`pnpm check:bundle-size`, remote) in the PR; `BUNDLE_SIZES.md` is updated by lane 15 (Q-15-5).

## 16. Test requirements

All browser, GPU and capture work runs remotely on GitHub Actions `macos-14` (Chromium/ANGLE Metal, Apple Paravirtual GPU), per `/Users/gurbakshchahal/.config/agent-policy/reference/remote-execution.md`. Lane workflow: `.github/workflows/qr-prd01-core.yml` (lane-owned) with jobs `unit`, `browser`, `capture`, `perf`; required checks on every lane 01 PR are also `qr-contracts.yml` (typecheck, lint, unit + all conformance suites, ownership check) and the flag-off sentinel identity check on the 6 scenes of `benchmarks/quality-rebuild/sentinels.json` (CONTRACTS §6.1). Local runs are limited to `vitest` unit tests that do not launch a browser. Tests live under `tests/qr/prd01/` and `tests/unit/contracts/impl/prd01-*` (lane-owned).

### 16.1 Unit (vitest)
- Contract conformance for stub and real: C-01, C-02, C-04, C-05, C-06, C-07, C-08 (custodian suites) plus `impl/prd01-*`.
- Scene graph composition, decomposition, shear, six Euler orders, `lookAt`, world-matrix cache counts (§15 Phase 1).
- Primitive topology: winding vs normals, UV range, tangent orthogonality, bounds, capsule shape, shared-geometry counts, Uint32 promotion.
- Instance matrix composition, including non-uniform size with rotation; InstanceBuffer capacity and version.
- Color parser table and helper regression (flag off vs on).
- Program key determinism and uniqueness (with registered feature bits); generated-source snapshots; shader lint; default `programFeatures()` for every built-in material.
- BRDF CPU mirror vs three.js r185 reference formulas; furnace test; ambient 1/π; DFG LUT byte identity.
- Tone-mapping operator CPU mirrors vs three r185 formulas; exposure product; overlay zero identity.
- `renderStateKey` packing; blend-mode sort order; std140 packing.
- ResolutionGovernor state machine; `resolveCanvasPixelRatio` table.
- FrameGraph: reserved phases, flag gating, `post-hdr` space rejection, transparent interleave.
- `core-v2` codemod purity on route fixtures.

### 16.2 Browser (Playwright, `tests/qr/prd01/playwright.config.ts`; Chromium on every PR, WebKit and Firefox per §18)
- `app-capture.spec.ts`, `primitive-catalog.spec.ts`, `blend-modes.spec.ts`, `render-targets.spec.ts`, `program-generator-compile.spec.ts`, `output-pass.spec.ts` (operators, exposure, dither, background coverage, overlay), `dpr.spec.ts` (deviceScaleFactor 1/2/3 on lane scenes with no explicit `pixelRatio`), `instancing-buffers.spec.ts` (VAO eviction, 10k instances), `renderer-mount-failure.spec.ts`, `frame-graph.spec.ts` (depth copy visible in `after-opaque`).
- Lane capture assertions (in `qr-prd01-core.yml` until lane 12's C-33 plugin lands, Q-12-1): per lane scene and base scene with `?a3d-qr=core`, `diagnostics().output.targetFormat ∈ {rgba16f, r11g11b10f}`, `resolution.pixelRatio` equals the expected tier DPR, `programs.pending === 0` after ready, no `renderer-mount-failed`, `qrFlags` contains `core`.

### 16.3 Performance tests
- `prd01-draw-throughput` and the base `18-game-scene` frame timing (C-28 FrameStats: CPU submit ms via `performance.now()` around `renderer.render`, GPU ms via timer query when lane 11 provides it) recorded per run into the lane report. The `perf` job fails if CPU submit regresses more than 15% vs the committed lane baseline for the same runner image, or if any §19 zero-allocation budget is violated.

## 17. Acceptance: standalone and integrated

Two kinds of acceptance, per CONTRACTS §8:
- **Standalone acceptance (§17.1)** is provable by lane 01 alone, with today's renderer plus `A3D_QR_CORE=v2` and every other lane's stub. It gates lane 01 merges and the move of `A3D_QR_CORE` to `standalone-accepted`. It is evidence of mechanism (composition, topology, blend math, operator math, allocation counts), never a claim of visual parity with three.js.
- **Integrated acceptance (§17.2, §17.4, §17.5)** depends on other lanes' real implementations and is evaluated only at CONTRACTS §7 checkpoints with `qr_flags=all` (and leave-one-out `all,-core` for attribution). It never blocks a merge. It is the only route to `integrated-accepted` and to any visual claim. Conformance tests, engineering gates, metric thresholds and vision-only screening rounds never support a claim that Aura3D matches three.js (CONTRACTS §7 honesty rule).

The integrated judge has three parts: lane 12's automated region metrics (necessary, not sufficient); a vision model reviewing side-by-side and game frames with the same rubric as research/21 and research/23 (both images scored, three reference included); and human review (owner or delegate), which at G-PANEL rounds is 2 humans + 1 vision model with the median of record (C-32). A scene passes only when all three pass.

### 17.1 Standalone acceptance (lane 01 alone; gates merges and `standalone-accepted`)

All on remote macos-14 CI (`qr-prd01-core.yml`), flag on, with the flag-off sentinel identity check green
(engineering evidence only: per-row matches against three on narrow lane scenes support no claim of three.js-level
visual quality; only a G-PANEL integrated round can, CONTRACTS §7):

| # | Criterion | Test / evidence | Contracts stubbed |
|---|---|---|---|
| S1 | Contract conformance real = stub for C-01, C-02, C-04, C-05, C-06, C-07, C-08; all-flags-off frame bit-identical | custodian suites + `impl/prd01-*`; sentinel check | — |
| S2 | Scene graph matches three `Object3D`: `prd01-scene-graph-hierarchy` mask IoU ≥ 0.98, centroid error ≤ 2 px; six Euler orders to 1e-5 | §15 Phase 1 tests; lane capture | C-36 |
| S3 | Primitive topology and caps: `prd01-primitive-catalog` per-primitive IoU ≥ 0.98, cap IoU ≥ 0.97, cap luma ±10%, cap normal ≤ 10° | `primitive-catalog.spec.ts` | C-27 |
| S4 | Instance composition `world · instance · geometry`: grid spacing exact; no shear; mask coverage ±5% of three | unit + `prd01-draw-throughput` capture | C-07 own |
| S5 | Color parser: 40-input table; legacy helpers byte-equal for `#rrggbb` | unit | — |
| S6 | Blend modes: `prd01-blend-modes` MAD ≤ 2/255 vs three for 4 modes; C-04 browser conformance real | `blend-modes.spec.ts` | — |
| S7 | Generator: only generator keys on the 18 base scenes; every registered chunk from any lane compiles; shader lint clean | `program-generator-compile.spec.ts`, C-02 browser conformance | C-03, C-09, C-10, C-11, C-18, C-21 (whatever is registered, stubs otherwise) |
| S8 | BRDF: r185 direct and indirect within 1e-3; furnace bounds; ambient 1/π ± 1%; LUT byte-identical | `brdf-reference.test.ts`, ambient browser test | C-09/C-10 (default hook bodies) |
| S9 | Specular AA: `prd01-specular-aa` highlight σ ≤ 1.2× three and ≤ 0.5× flag-off | lane capture, 60 frames | — |
| S10 | Output: `prd01-tonemap-exposure-ramp` ΔE2000 ≤ 2 (mean ≤ 1) for `aces`/`agx`/`neutral` × exposure 0.5/1/2; single sRGB encode; dither tests; background coverage tests; overlay zero identity | `output-pass.spec.ts`, C-05 browser conformance | C-13 (no upstream exposure) |
| S11 | Resolution: DPR policy table; governor hysteresis and floor; `capture()` equals `toDataURL()` with `preserveDrawingBuffer: false` | unit + `dpr.spec.ts` + `app-capture.spec.ts` | C-27, C-28 (CPU FrameStats) |
| S12 | No G-REG regression on the 18 base scenes beyond the declared look changes listed in `evidence/prd01/phase-3/declared-changes.md` (fudge removal, ambient 1/π, tessellation) | lane capture `core` vs `none` | all stubs |
| S13 | Allocation and compile: `prd01-draw-throughput` 0 GL objects/frame, heap ≤ 16 KB/frame over 600 frames, CPU submit ≤ 40% of flag-off; 0 compiles after `ready` on lane + base scenes | `perf` job, C-28 counters | C-28 (partial counters) |
| S14 | Mount-failure reporting: `onRendererError`, `diagnostics().errors`, strict reject | `renderer-mount-failure.spec.ts` | C-29 test double, C-36 |

### 17.2 Integrated acceptance (checkpoints only; never blocks; `qr_flags=all`, G-PANEL rounds)

| # | Criterion | Also needs (contracts / lanes) |
|---|---|---|
| I1 | Base scenes 01, 02, 06, 13, 16 meet §17.4 targets; no base scene drops more than 0.5 vs the IC-0 score | C-09/C-10/C-11 real (02), C-13 real (03), C-03 real (04), R18 (15), Q-15-2 |
| I2 | Joint target with lanes 02, 03, 04: Aura within 1.0 of three on every scene 01-18, and ≥ three on the six `prd01-*` scenes | 02, 03, 04 real; lane 12 G-PANEL |
| I3 | Games: §17.5 gates on all 18 routes with their route flags | 14 (route opt-in, codemod application), 02 (fill after ambient 1/π), Q-15-1 (DPR on routes) |
| I4 | Ambient 1/π ships without leaving games darker: no game visual category drops with `all` vs `none` on a G-PANEL | 02 (C-09/C-10 real), 14 |
| I5 | `colorGrade({ exposure })` changes route pixels by the expected factor | Q-03-1 |
| I6 | Deep Recovery runner FPS ≥ 10× its IC-0 value; no CPU readback in interactive frames (C-28 `readbacks` 0) | Q-03-2, Q-03-3 |
| I7 | Every route reaches the canvas through OutputPass, incl. lean starters and Aura Clash (`targetFormat = rgba16f`, app operator) | Q-15-4, Q-11-4 |
| I8 | 0 program compiles after `ready` during a 60 s scripted play session on each of the 18 games | 14 (route flags), C-33 plugin (Q-12-1) |
| I9 | No silent fallback on any route: forced mount failure shows the overlay and no safe-basic pixels | 15 (T4.2, `A3D_QR_STRICT`) |
| I10 | Tone-map default decision recorded from the ACES-vs-AgX G-PANEL A/B | 12 (Q-12-1) |

### 17.3 Lane benchmark scenes (C-30, `benchmarks/quality-rebuild/scenes/prd01/`; both engines; harness metrics by lane 12 via C-33, lane scripts meanwhile)
| Scene | Content | Criterion | Threshold |
|---|---|---|---|
| prd01-scene-graph-hierarchy | A "vehicle" group rotated 30° about Y and scaled 1.5, containing 4 wheel cylinders rotated 90° about Z and a nested turret group rotated −20° about X; built identically with three `Object3D` | Object mask IoU vs three; per-part centroid error | IoU ≥ 0.98; centroid error ≤ 2 px at 1280×720 |
| prd01-tonemap-exposure-ramp | 12 emissive swatches at 2^−4 … 2^7 linear, plus an 18% grey card, under unlit rendering; columns for `aces`, `agx`, `neutral` at exposure 0.5, 1, 2 | ΔE2000 per swatch vs three r185 with the same operator and exposure | ≤ 2.0 each; mean ≤ 1.0 |
| prd01-blend-modes | Four quads (alpha 0.5, premultiplied, additive, multiply) over a horizontal HDR gradient | Per-pixel MAD vs three (`NormalBlending`, `premultipliedAlpha`, `AdditiveBlending`, `MultiplyBlending`) | ≤ 2/255 |
| prd01-specular-aa | 40 thin glossy tori (roughness 0.05) and wires at 20-60 m, camera dolly over 60 frames | Temporal luminance variance in highlight regions (frame-to-frame σ) relative to three with `MeshStandardMaterial` | ≤ 1.2× three's σ; ≤ 0.5× Aura flag-off |
| prd01-primitive-catalog | Every primitive at hero size with a checker texture (default UVs; repeat wrapping is lane 04's C-12 sampler work and is not needed), overhead and key light | Mask IoU vs three geometry of the same parameters (flat-ID render); cap region IoU, luma and depth-derived normal (§15 Phase 1 primitive test) | IoU ≥ 0.98 per primitive; cap IoU ≥ 0.97, cap luma within ±10% of three, cap normal within 10° of +Y |
| prd01-draw-throughput | 2,000 unique-material primitives, 10,000 instances, 50 skinned characters (morph face added when lane 06's C-18 real lands; until then not included in the standalone budget) | CPU submit ms, heap delta, GL objects created per frame | §19 budgets |

All six scenes are `admittedAsReference: true` only for their metric criteria; none supports a parity claim without a G-PANEL round (CONTRACTS §7).

### 17.4 Integrated: existing base scenes (checkpoints only; never blocks)
Vision judge: the same rubric and prompt as `research/23` (image descriptions, differences table, 0-10 scores, classification), run by lane 12 at G-PANEL rounds on the checkpoint side-by-sides with `qr_flags=all`, plus human review per §17. The "lane 01 owned criterion" column says what lane 01's mechanism must contribute; the score thresholds need the listed lanes.

| Scene | IC-0 Aura / three (research/23) | Lane 01 owned criterion | Integrated target | Also needs |
|---|---|---|---|---|
| 01-simple-geometry | 3.5 / 4.5 | Cylinder cap present; faceting gone; shadow-side faces not lifted (ambient 1/π) | No "implementation-bug" classification; Aura ≥ 4.0; dark-face ΔE ≤ 5 vs three (54,1,2) | Q-15-2 (engine primitives) |
| 02-pbr-product | 3.5 / 6 | Plinth top rendered and flat-shaded (cap normals) | Plinth mask IoU ≥ 0.97; classification no longer "implementation-bug" for geometry | Q-15-2 |
| 06-metal-roughness-sweep | 4 / 7 | Sphere tessellation, specular AA, IOR F0, fudge removal | Aura ≥ 5.0 | 02 (PMREM, C-09) |
| 13-ibl-only | 3.5 / 6 | Faceting gone | "Faceted" no longer listed in the differences table; no stray default light | 02 (fallback-rig opt-out, C-10) |
| 16-instancing | 2.5 / 4.5 | Instance composition | Aura ≥ three − 0.5; classification not "implementation-bug" | 15 (R18 T3.10) |
| 11-multiple-lights, 18-game-scene | see research/23 | No regression from removing fudges | Aura ≥ IC-0 score | 02 (lighting chunk) |
| All 18 | — | No scene drops | No scene drops more than 0.5 vs IC-0 | all engine lanes |

### 17.5 Integrated: games (checkpoints only; never blocks; routes opt in with `A3D_QR_CORE` per lane 14)
The vision judge uses the `research/21` rubric (per-category 0-10 scores, verdict, "competitive?" answer) on the checkpoint contact sheets at 1920×1080, 1280×720 and 390×844 (`games.json` viewports), with human review at G-PANEL rounds. Baseline: research/21 (games 1.5-4/10, mean ≈ 3.0) reproduced at IC-0.

Lane 01 gates (core-attributable effects, attributed by leave-one-out `all,-core`):
- All 18 games: no visual category score decreases vs the `research/21` baseline; "low resolution / soft / aliased" complaints disappear from the judge's "what looks poor" list for every game that was at DPR ≤ 1 (aurora-lander, bank-shot, blockfall-reactor, courier-rush, deep-recovery, gallery-shift, gravity-post, neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, siege-golf, turbo-drift-circuit, skyline-runner).
- Courier Rush: the city kit renders at its intended ~66-unit extent (research/19 C6) with no overlapping blocks; human check against the street graph in `apps/showcase-courier-rush/src/city.ts`.
- Siege Golf, Pulse Tunnel, Mech Hangar (primitive-heavy): judge no longer lists "faceted" or "low-poly primitive" geometry artifacts caused by engine tessellation (asset choice is lanes 05/14).
- Aura Clash: renders through RGBA16F and the app operator (needs Q-11-4); human A/B vs IC-0 shows no loss of fighter readability.
- Deep Recovery: runner FPS ≥ 10× IC-0 (0.5 fps at 1080p in `report.slim.json`; needs Q-03-2, Q-03-3).
- Competitiveness itself ("competitive with a well-built modern three.js browser game") is lane 14's integrated gate, not lane 01's. Lane 01 is not declared complete while the judge cites any §2 core defect as a cause in any game at a G-PANEL round.

### 17.6 Per-game impact matrix

Integrated (evaluated at checkpoints with the route's flags and with `all`; never blocks). Measured at audit commit `c08d8acb`. "DPR today" is the effective gameplay pixel ratio: profile value or app override, per §2.10 and research/19 C2. Primitive columns count call sites of `cylinder(`, `capsule(`, `sphere(` and `torus(` under `apps/<game>/src` (`git grep -c`). They are a proxy for exposure to R5, not draw counts. FPS figures are runner values from `evidence/games/report.slim.json` where §2.11 cites them. Every game authors `lights.ambient`, so R8 (ambient 1/π) affects all 18 and is retuned by lane 14 against lane 02's lighting. All except Orbital Defense author `colorGrade` exposure, so R7 brightens them by the authored 1.02-1.06 (research/19 C12) once Q-03-1 lands.

| Game | Entry / path | DPR today | Cyl / cap / sph / tor | Other core-specific impact | Per-game integrated check (in addition to §17.5) |
|---|---|---|---|---|---|
| aura-clash-showcase | `createGameApp` + `createSideViewGameRenderPreset` (RGBA8, Reinhard) | probe-conditional (`AuraClashArenaApp.ts:1522`) | 5 / 2 / 0 / 0 | Moves to RGBA16F and the app operator (§9 item 5); 6 additive call sites gain real additive (R12) | `diagnostics().output.targetFormat = rgba16f`; human A/B of fighter readability |
| showcase-aurora-lander | `createAuraApp` | 1 (profile) | 1 / 0 / 6 / 5 | Torus and sphere faceting (R5) | Judge stops listing faceting; DPR = device |
| showcase-bank-shot | `createGameApp` | 1 | 5 / 0 / 2 / 2 | Cylinder caps (R5) | Table and pocket cylinder tops present in the contact sheet (human) |
| showcase-blockfall-reactor | `createGameApp` | 1 | 2 / 0 / 4 / 4 | 25 `instances.*` sites (R11 size bug, R10 buffers); 8 additive sites (R12) | Instance layout unchanged versus flag-off where `size` is 1; human check where `size ≠ 1` |
| showcase-courier-rush | `createAuraApp` | 1 | 3 / 0 / 1 / 2 | City group `scale(6)` (`city.ts:769`, R4); 18 instance sites; 7.1 fps | City at ~66-unit extent with no overlaps (§17.3); FPS ≥ IC-0 · 0.5 at device DPR |
| showcase-deep-recovery | `createAuraApp` | 1 | 16 / 0 / 34 / 11 | CPU readback post (0.5-1.1 fps) removed (§9 item 4) | FPS ≥ 10× IC-0 (needs Q-03-2/Q-03-3); rejected-pass warning visible until lane 03's GPU volumetric lands |
| showcase-gallery-shift | `createGameApp` | 1 | 2 / 0 / 1 / 7 | Two ambient lights: largest R8 darkening | Shadow-side faces not lifted; no category drop with lane 02 on |
| showcase-gravity-post | `createAuraApp` | 1 | 2 / 0 / 9 / 11 | 6.4 fps: most exposed to the R6 DPR cost | Governor holds FPS ≥ IC-0 · 0.5; resolution complaint gone |
| showcase-mech-hangar | `createAuraApp` | profile-dependent | 5 / 0 / 3 / 9 | Primitive-heavy hangar (R5) | No "faceted" or "low-poly primitive" in the judge output |
| showcase-neon-swarm | `createAuraApp` | 1 | 0 / 0 / 6 / 8 | 14 instance sites (R10, R11) | Swarm layout matches flag-off at `size` 1 |
| showcase-orbital-defense | `createAuraApp` | 1 | 0 / 0 / 6 / 3 | ~60 fps today: headroom for DPR 2 | Runs at device DPR with governor scale 1 on the runner |
| showcase-patrol-wing | `createGameApp` | 1 | 5 / 0 / 15 / 5 | Sphere faceting (R5) | Faceting complaint gone |
| showcase-pulse-tunnel | `createAuraApp` | 1 (art-review scripts force `safe-basic`) | 9 / 5 / 10 / 18 | Real capsules (R5); 15 art-review scripts migrated off `safe-basic` | Tunnel rings and capsules not faceted; art-review scripts run on core |
| showcase-rooftop-buckets | `createGameApp` | `min(dpr, 1.75)`; capture ≤ 1 | 7 / 0 / 6 / 10 | 31 instance sites; 7.6 fps | FPS ≥ IC-0 · 0.5; instance layout unchanged |
| showcase-siege-golf | `createGameApp` | 1 | 0 / 1 / 12 / 7 | 7.1 fps; capsule (R5) | No "faceted" geometry; FPS ≥ IC-0 · 0.5 |
| showcase-skyline-runner | `createAuraApp` | 0.7 forced | 0 / 6 / 4 / 9 | Largest DPR gain (0.7 → device); 6 capsule sites | Resolution complaint gone; FPS ≥ IC-0 · 0.5 |
| showcase-turbo-drift-circuit | `createAuraApp` | 1 (capture forced 1) | 8 / 0 / 9 / 2 | 46 instance sites (R10, R11); 11 additive sites (R12) | Track props at authored positions; additive glows add light (scene 21 behavior) |
| showcase-vault-breakers | `createGameApp`, `qualityProfile: "production"`, `fallback: "safe-basic"` (`main.ts:392`) | 1.5 | 1 / 0 / 2 / 3 | `fallback` option removed (throws migration error until edited) | Route mounts on core with no `renderer-mount-failed` |

## 18. Browser coverage

| Browser / engine | Platform | How tested | Required |
|---|---|---|---|
| Chromium stable (ANGLE Metal) | GitHub Actions macos-14 | `qr-prd01-core.yml` (all lane specs, lane capture) | Yes, every lane 01 PR (standalone) |
| WebKit (Playwright) | macos-14 | `webkit` project in `tests/qr/prd01/playwright.config.ts`: `output-pass`, `blend-modes`, `primitive-catalog`, `dpr`, `render-targets` | Yes, every lane 01 PR touching `packages/rendering/**` (standalone) |
| Firefox (Playwright) | macos-14 | Same subset | Nightly in the lane workflow (standalone) |
| Chromium (ANGLE D3D11 / WARP) | windows-latest | Correctness subset only (unit + `program-generator-compile`, WARP) | Nightly |
| Safari 17/18 on real Mac | Remote device farm (shared with lane 11, CONTRACTS C-28 consumers) | Automated capture of `prd01-tonemap-exposure-ramp`, `prd01-blend-modes`, base scene 01 | Before `A3D_QR_CORE` → `default-on` (integrated) |
| Edge | — | Covered by Chromium | No separate job |

Feature requirements: WebGL2 is mandatory (no WebGL1 path). The float render target is probed (§9 item 2). `KHR_parallel_shader_compile` and `EXT_disjoint_timer_query_webgl2` are optional with fallbacks (C-28 probe). `gl_VertexID` and `texelFetch` on `sampler2DArray` are WebGL2 core.

## 19. Performance budgets

Reference devices: **Low** = iPhone 12 / Pixel 6a class, 390×844 CSS. **Medium** = M1 MacBook Air (integrated), 1440×900 CSS. **High** = M1 Pro or RTX 3060-class, 1440×900 CSS. **Ultra** = RTX 4070-class desktop, 2560×1440 CSS. Tier values come from C-27 `QUALITY_TIERS`. The macos-14 runner (Apple Paravirtual GPU) is a regression signal for standalone gates (relative to flag-off on the same runner); absolute budgets are verified on reference devices through the remote device farm at checkpoints (integrated). Budgets cover lane 01's share of a frame: scene-graph update, `collect` and submit (CPU), forward opaque/transparent, and OutputPass (GPU). Shadows, IBL and post are budgeted by lanes 02 and 03 within a 16.7 ms total.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Max pixel ratio (C-27) | 1.0 | 1.5 | 2.0 | 3.0 (backing ≤ 8.3 MP, governor-limited) |
| MSAA samples | 0 (AA by lane 03, C-27 `postAntiAlias: fxaa`) | 4 | 4 at effective DPR < 1.75, else 2 | 4 at effective DPR < 1.75, else 2 |
| HDR target | R11G11B10F | RGBA16F | RGBA16F | RGBA16F |
| Forward + OutputPass GPU ms, base `18-game-scene` | ≤ 6.0 | ≤ 6.0 | ≤ 7.0 | ≤ 7.0 |
| OutputPass GPU ms | ≤ 0.3 | ≤ 0.4 | ≤ 0.6 | ≤ 0.8 |
| CPU submit ms, base `18-game-scene` | ≤ 3.0 | ≤ 2.0 | ≤ 1.5 | ≤ 1.5 |
| CPU submit ms, `prd01-draw-throughput` (2,000 draws + 10k instances) | n/a (Low caps at 500 draws: ≤ 4.0) | ≤ 6.0 | ≤ 5.0 | ≤ 4.0 |
| Steady-state JS heap delta per frame | ≤ 16 KB | ≤ 16 KB | ≤ 16 KB | ≤ 16 KB |
| GL objects created per steady-state frame (C-28 counters) | 0 | 0 | 0 | 0 |
| Render-target memory (scene color + depth + resolve + 2 post buffers), governor-enforced | ≤ 32 MB | ≤ 192 MB | ≤ 320 MB | ≤ 512 MB |
| Program warm-up, base `18-game-scene` | ≤ 1,500 ms | ≤ 600 ms | ≤ 400 ms | ≤ 400 ms |
| Compiles after `ready` in 60 s play | 0 | 0 | 0 | 0 |
| Sphere / cylinder default segments (C-27 `primitiveSegments`) | 32×16 / 24 | 64×32 / 48 | 64×32 / 48 | 64×32 / 48 |

Render-target memory is enforced by `ResolutionGovernor`: when the projected allocation exceeds the tier budget it first drops MSAA one step, then `renderScale`. The C-31 `resolution` section reports the action.

Bundle (gzip, `pnpm check:bundle-size`, remote; lane 01 reports deltas, lane 15 owns `BUNDLE_SIZES.md`):
- New rendering-core code (program generator + chunks + OutputPass + governor + resources) ≤ 45,000 B gzip measured in isolation (standalone).
- Engine root (`@aura3d/engine compatibility root`) ≤ 535,343 B (−40,000 B from 575,343 B) once lane 01's flag removal and lane 15's safe-basic and lean-device deletions have both landed (integrated).
- `mini-game starter app before user assets` ≤ 250,000 B after lean renders through the core (Q-15-4). If exceeded, lane 15 decides; the budget may not be met by removing lighting again. The 80,000 B `@aura3d/lean core primitive critical path` budget, met by dropping lights and environment (research/13 §0 item 3), is lane 15's to retire.

## 20. Mobile coverage

- Viewport captures at 390×844 portrait for every lane scene (standalone, lane capture) and, at checkpoints, every game and base scenes 01 and 16 (integrated).
- Real-device runs (remote device farm, shared with lane 11): iPhone 12 or later on iOS Safari 17+, and Pixel 6a or later on Chrome Android. Collect: float target probe result, chosen HDR format, MSAA, DPR, governor scale over 60 s, warm-up ms, steady FPS for base `18-game-scene` and 3 games (Orbital Defense, Turbo Drift, Courier Rush).
- Required behavior: the C-27 tier selected by `quality: "auto"` (stub: medium on coarse pointer; real heuristic: lane 11) is honoured by lane 01's DPR/MSAA/segments. There are no compiles after ready. When the float target is unavailable the output is visibly identical except banding, and `degraded` is reported. Thermal throttling is handled by the governor (5-minute soak, FPS must not fall below 30 at Low on base `18-game-scene`).
- Touch, safe-area and orientation are out of scope (lanes 08, 09, 14).

## 21. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd01/<phase or IC-k>/` (lane-owned):
1. Side-by-side Aura flag-off | Aura `?a3d-qr=core` | three r185 JPGs for the six `prd01-*` scenes and base scenes 01, 02, 06, 13, 16 from the lane workflow (run id in the filename). Standalone.
2. Lane report excerpts with region metrics, ΔE tables (`prd01-tonemap-exposure-ramp`), MAD (`prd01-blend-modes`), flicker σ (`prd01-specular-aa`), CPU/GPU timings and C-28 allocation counters (`prd01-draw-throughput`). Standalone.
3. `declared-changes.md` (Phase 3) listing every intended flag-on look change with region and sign. Standalone.
4. Readback triage and `safe-basic` inventory JSON (Phase 2). Standalone.
5. Checkpoint records: per IC-k, the lane 01 slice of lane 12's `PanelRoundRecord` (game contact sheets for all 18 games at 1920×1080 and 390×844 with `all`, `none` and `all,-core`; `diagnostics()` JSON for `output`, `resolution`, `programs`), vision-judge outputs (full text, research/21 and 23 rubric), and the human sign-off file `scores.signed.json`. Integrated.
6. Tone-map A/B decision record (Phase 5, from a G-PANEL). Integrated.
7. Bundle-size report diff per PR. Standalone.
8. Real-device mobile report. Integrated.

Screenshots alone are not acceptance. Each image is paired with the criterion and threshold from §17 that it evidences, and with the `qrFlags` it was captured with.

## 22. Completion criteria

Lane 01 is **standalone-complete** (flag `standalone-accepted`) when, on `main`:
1. Every §17.1 criterion S1-S14 passes in `qr-prd01-core.yml` with the flag-off sentinel identity check green.
2. C-01, C-02, C-04, C-05, C-06, C-07, C-08 real implementations are provided from lane barrels and pass the same conformance suites as their stubs.
3. All §13.5 accepted incoming requests are merged or explicitly declined with a reason; all §13.4 requests are filed.
4. `F-01-*` facts are in CONTRACTS Appendix B with `verified` status and evidence run ids.

Lane 01 is **integrated-complete** (flag `integrated-accepted`, then `default-on`, then `removed`) when, at G-PANEL checkpoints (never as a merge gate):
5. §17.2 I1-I10 pass with `A3D_QR_CORE` on inside `qr_flags=all`, attributed by leave-one-out, under vision-model and human review, with no regression in any game visual category.
6. §19 absolute budgets are met on reference devices (Low through High at minimum; Ultra may be deferred with written sign-off from lane 11).
7. The flag has been `default-on` for two checkpoints and the Phase 7 removal PR has merged: one renderer path for every route lane 01 owns, generator as the only source of lit programs, shader lint clean, `preserveDrawingBuffer` off by default with no remaining class (b) readbacks in lane 01-owned files.
Items that depend on other lanes' requests (lean, safe-basic deletion, engine DPR call sites, `GameRenderPreset`, CPU post readback) are tracked as those lanes' completion items and listed in each checkpoint report; they do not hold lane 01's completion beyond the integrated criteria above.

## 23. Rollback considerations

- Every behaviour change is behind `A3D_QR_CORE` (sub-flags `_OUTPUT`, `_GENERATOR`). Rollback while the flag exists is a flag default or a route-level opt-out (`?a3d-qr=-core`, `qualityRebuild: { flags: ["-core"] }`); no code revert is needed. Flag state moves backwards only at checkpoints, by the custodian (CONTRACTS §5.3).
- Unflagged changes are limited to declared correctness fixes (VAO leak eviction) and additive APIs; each lands as an isolated PR so it can be reverted alone. Any PR that turns main red is reverted at once by anyone (CONTRACTS §6.1).
- DPR has an emergency switch: `renderer.resolution.pixelRatio: 1` per app, and a global env `AURA3D_FORCE_PIXEL_RATIO` read only in capture tooling.
- The tone-map default is a single constant (`DEFAULT_TONE_MAPPING` in `contracts/output.ts`); reverting the Phase 5 decision does not touch shaders.
- Ambient 1/π is part of the flagged path; if games regress at a checkpoint without lane 02's lighting, the flag is simply not promoted. It is never re-introduced as a permanent legacy mode.
- The frozen legacy path is deleted only at flag removal (two `default-on` checkpoints). Deleted files stay retrievable from git history. No data migrations are involved. All changes are local code; there are no production infrastructure changes.

## 24. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Raising DPR on games already at 5-15 fps on the runner makes them slower before submission work lands | High | High | Governor in Phase 2; Phase 6 CPU work before routes opt in; per-game FPS floor is an integrated criterion; routes opt in per lane 14 |
| Ambient 1/π darkens ambient-lit games while lane 02's lighting is still a stub | High | High | Flagged; evaluated only with `all` at checkpoints (I4); flag not promoted on regression; lane 14 retunes |
| Default hook bodies diverge from lane 02/04/06/07 chunks, so standalone pixels differ from integrated pixels | Medium | Medium | Hook bodies are minimal and documented (§6.4); standalone gates are mechanism-only; visual claims only at G-PANEL |
| Contract stubs hide most visible gains until other lanes land (C-09/C-10/C-13 real) | High | Medium | Standalone acceptance limited to what stubs can show (§17.1); the rest is integrated (§17.2) |
| Program count explosion (light buckets × registered feature bits) causes compile stalls | Medium | Medium | Bucketing, warm-up of current and next-lower tier, parallel compile, key telemetry; warn at > 64 distinct keys per scene |
| RGBA16F MSAA memory at DPR 2 on integrated GPUs | Medium | High | MSAA step-down at DPR ≥ 1.75; RT memory budget enforced by governor |
| Float render targets unavailable on some mobile GPUs | Low-Medium | Medium | R11G11B10F, then reported RGBA8 degraded path |
| Fixing group composition breaks layouts tuned against the bug (Courier Rush, Material Asset Inspector) | Certain | Low | Flagged; lane 14 re-authors when opting the route in (Q-14-1) |
| Removing fudges changes material look across all scenes; some looked "better" by accident | High | Medium | `declared-changes.md` per material class in Phase 3; extension materials record `extension-lobe-pending` instead of being silently wrong |
| Requests to lanes 03, 11 and 15 land late, delaying integrated criteria (exposure, CPU post, DPR on routes) | Medium | Medium | Non-blocking by design; tracked per checkpoint; lane 01's own canvases and lane scenes prove the mechanism meanwhile |
| Two governors fight (lane 01 `ResolutionGovernor` vs lane 11 `QualityGovernor` vs `createPerformanceGovernor`) | Medium | Medium | `ResolutionGovernor` owns render scale only; lane 11 wraps it (C-27 `forceRenderScale`); `min(manual, governor)` unit test; Q-11-2 removes the third |
| AgX default debate | Medium | Low | ACES stays default unless the G-PANEL A/B passes |
| `preserveDrawingBuffer: false` breaks the 226 in-repo canvas-readback files and external tools | High | Medium | Applied only with the flag; triage and per-owner migration to `app.capture()`; temporary `renderer.debug.preserveDrawingBuffer`; Playwright `page.screenshot` capture tools unaffected |
| Background coverage MRT unsupported or costly on a device | Low | Low | On only when a background sets `toneMapped: false` |
| WebGPU diverges while WGSL twins are pending | High | Medium | Generator is backend-neutral data; the C-29 factory keeps WebGL2 unless lane 11's WGSL emitter is provided |
| Euler order confusion in three-compat migrations | Medium | Low | Explicit `rotationOrder`; default named `"ZYX"`; fact `F-01-rotationOrder` for lane 13 skills |
| Bundle growth from the named-color table, generator and output pass | Low | Low | Measured per PR; named colors behind a lazily imported table if needed |

## 25. Explicitly out of scope

- IBL generation, PMREM, default HDR environment, the ambient-disables-IBL bug, environment backgrounds, shadow algorithms (CSM, PCF hardware compare, point shadows), shadow strength, light units and default intensities: lane 02 (C-09, C-10, C-11). Lane 01 provides the program hooks only.
- Bloom, SSAO/GTAO, SSR, DOF, motion blur, TAA, FXAA/SMAA, color grade, LUT, vignette, volumetric GPU port, CPU readback removal: lane 03 (C-13, C-14). Lane 01 provides the HDR/output contract only.
- KHR material extension lobes, transmission render target, model tint semantics, texture samplers and wrapping, MikkTSpace tangents, per-class material overrides: lane 04 (C-03, C-12, C-15). KTX2 sRGB formats and decoders: lane 05 (C-16).
- Asset replacement (unlit card heroes, untextured kit meshes): lane 05.
- Morph textures, skinning palettes, character rigs built from capsules, animation controller defects: lane 06 (C-18, C-19).
- Particle rendering (effects.particles drawing zero pixels): lane 07 (C-20). Lane 01 provides blend modes.
- WebGPU device rebuild and WGSL emission, GPU tier detection heuristics, culling, batching, multi-draw: lane 11 (C-27, C-28, C-29).
- Engine bridge files (`agent-api/index.ts` core, compiler files other than `sceneGraph`/`color`), lean, safe-basic removal, public-package and export-map consolidation, three-compat: lane 15 (C-36, C-37, C-38).
- Route edits, per-game art direction and final competitiveness sign-off: lane 14. Templates and skills: lane 13.
