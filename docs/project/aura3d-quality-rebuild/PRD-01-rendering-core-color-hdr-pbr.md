# PRD 01: Rendering Core, Scene Graph, Color, HDR, PBR

Program: Aura3D visual-quality autopsy and rebuild. Branch of record: `aura3d-quality-rebuild/audit` (audit commit `c08d8acb`).
Status: Draft, implementation-ready. Owner: rendering core.
Final gate: the shipped games and the `benchmarks/quality-rebuild` scenes look competitive with three.js r185 under human and vision-model review. Passing tests, 200 routes, non-blank screenshots and green parity matrices do not count as meeting this PRD.

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

Measured consequence: in the authoritative vision benchmark (research/23) Aura3D scores 1 to 4.5 out of 10 across 18 same-input scenes, against 4 to 7 for three.js r185 (scored on the same modern-browser scale; research/22's blind pass gave three 6.5 to 8.5). The game judgments (research/21) classify every shipped game as "not competitive with a well-built modern three.js browser game". PRD 01 does not fix lighting content, IBL or shadows (PRD 02), post kernels (PRD 03), or extension lobes (PRD 04). It removes the core-renderer defects that would make those PRDs land on a broken foundation, and it fixes the defects that are wholly in the core.

## 2. Evidence from current code (path:line)

All engine paths are under `packages/engine/src/agent-api/index.ts` (18,733 lines) unless stated.

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
- Fake operators: `agx()` and `neutral()` are per-channel curves (`packages/rendering/src/WebGL2Device.ts:3541-3550`), duplicated in `LeanWebGL2Device.ts:3320-3338` and in CPU form in `PostProcessPass.ts:2558`.
- Forward shader has its own Narkowicz curve without the 0.6 prescale: `a3dPbrEncodeOutput` (`packages/rendering/src/ShaderLibraryCore.ts:588-593`). It is used whenever `u_outputColorSpace` = 1 (lean path, no-post path).
- Aura Clash uses `createSideViewGameRenderPreset` with `targetFormat: "rgba8"` (`packages/engine/src/production-runtime/GameRenderPreset.ts:373`) and no tone-map key, so the device default operator `"reinhard"` applies (`WebGL2Device.ts:1906`) (research/19 C15).
- Clear color is pre-inverted through ACES (`colorToAcesInputClearColor`, `index.ts:15400-15418`).
- Post after tone map is 8-bit: ping-pong is RGBA8 unless bloom is on with an HDR source (`WebGL2Device.ts:946-948`). DOF, motion blur, SSAO, SSR, TAA and outline run on those buffers (research/05 §1.4, research/02 §4).
- No dither anywhere in the present shader (research/05 §7).
- The color parser accepts only `#rrggbb`. Everything else becomes `[0.02, 0.025, 0.035, 1]` with no warning (`colorToClearColor`, `index.ts:15383-15389`).
- Compressed textures upload only UNORM formats with no sRGB variant (`WebGL2Device.ts:4117-4134`). Owned by PRD 04; noted here because it is a color-pipeline contract.

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
- The DFG LUT is approximate: `BRDFLut.ts` wraps `generateApproximateBrdfLutPixels` (RGBA8). It is optional per material, and the shader falls back to `vec2(1, 0)` when it is unbound (`ShaderLibraryCore.ts:661`). three r185 ships a precomputed 16×16 RG16F LUT (4,096 samples per texel), sampled as `texture(dfgLUT, vec2(roughness, dotNV))` (`node_modules/three/src/renderers/shaders/DFGLUTData.js`). It is used for both IBL and direct-light multiscatter (`BRDF_GGX_Multiscatter`).
- No specular AA: no derivative-based roughness widening. The only `dFdx` in the shader library is for UV gradients (`ShaderLibrary.ts:2846`).
- `a3dPbrEnvironmentSampleRaw` always samples both the equirect and the cube map and mixes them (`ShaderLibraryCore.ts:476-480`).

### 2.7 Shader program architecture
- The cache key is `shaderKey[:variant]` (`packages/rendering/src/ForwardPass.ts:681-683`). There is no material-feature hash.
- Ten hand-named textured-PBR variants (`ShaderLibrary.ts:2065-2075`). All of them define `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` and `A3D_PBR_DISABLE_CLUSTERED_LIGHTING`.
- Separate hand-written programs: base PBR (`ShaderLibraryCore.ts:291-782`), instanced PBR (`ShaderLibrary.ts:101`), skinned-lit 4 and 8 influences (`:565`, `:1091`), normal-mapped PBR (`:1643`), textured PBR (`:2063`). Drift example: the rough floor is `mix(0.04, 0.38, r)` in base and `mix(0.012, 0.16, r)` plus stripes in textured (research/02 §3.4).
- Runtime-uniform branching: `step(0.5, u_...)`, `u_clusteredLightEnabled > 0.5` inside the light loop (`ShaderLibraryCore.ts:705-715`).
- `ShaderModule` compiles lazily at first draw (`packages/rendering/src/ShaderModule.ts:22-33`). `WebGL2Device.createShaderProgram` queries `COMPILE_STATUS` and `LINK_STATUS` immediately, with no `KHR_parallel_shader_compile` (research/07 §3.2).
- Unused but load-bearing-looking files: `production-runtime/shaders/chunks/*.glsl`, `production-runtime/shaders/wgsl/pbr.wgsl` (outputs `abs(normal)`), `production-runtime/materials/MaterialCompiler.ts` (research/03 §1, research/07 §1). They are not referenced from any render path, but `packages/rendering/src/production-runtime/index.ts` re-exports `MaterialCompiler`, `GLTFMaterialAdapter`, `PBRShaderFeatures` and `ShaderProgramLibrary`, and `GLTFPBRMaterialAdapter.ts` imports `GLTFMaterialAdapter`. Deleting them is therefore a public-surface removal (PRD 15) and requires deleting or rewriting `GLTFPBRMaterialAdapter.ts` at the same time.

### 2.8 Per-draw cost and resource lifetime
- `ForwardPass.drawItem` builds `new Map(binding.uniforms)` plus about 10 `apply*Uniforms` helpers (`ForwardPass.ts:293-311`) and calls `new RenderPipeline({...})` per item (`:319`).
- Uniform upload has no last-value cache, and there are no UBOs (`rg UNIFORM_BUFFER packages/` is empty; research/07 §3.1).
- `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`). Above 64, or with colors or attributes, `device.createBuffer("vertex", ...)` runs every frame (`:1755`, `:1803`) and is disposed at `:346`. VAO cache keys include `buffer.id` (`WebGL2Device.ts:4225-4236`) and are evicted only in `dispose()` (`:1459-1462`): one leaked VAO per such draw per frame (research/07 §3.3, code-confirmed, not browser-measured).
- GPU morph is limited to 64 vertices and 4 targets (`ForwardPass.ts:119-120`, `:1885`). Beyond that, CPU `applyMorphTargets` allocates, uploads and disposes a new `Geometry` per draw per frame (`:313-314`, `:347-349`).
- A texture-mode morph planner already exists but is not wired to `ForwardPass`: `MorphTargetPlan.ts` (`planMorphTargets`, modes `"uniform" | "texture" | "cpu"`). Its texture layout is one row per target attribute with `x = vertex`, so `textureWidth = vertexCount`. Any mesh with more vertices than `maxTextureSize` (default 4,096, `MorphTargetPlan.ts:26`) falls back to CPU, which includes the 5,000-vertex face in scene 24.
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
- Vision verdicts attribute "flat, washed-out, floating, primitive, faceted" looks across games to shadows and IBL (PRD 02), assets (PRD 05), and core issues: low DPR, faceted primitives, ambient wash, and missing additive glow (research/21 §§3-4 per game).

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

- `@aura3d/rendering` (`packages/rendering`): device, renderer, forward pass, shader system, primitives (new home), color and output pass.
- `@aura3d/engine` (root package `package.json` name `@aura3d/engine`; source in `packages/engine`, whose own package name is `@aura3d/engine-runtime`): agent-api bridge, scene flattening, primitive builders, renderer options, diagnostics, `GameAppRuntime` governor.
- `@aura3d/lean` (`packages/lean`): render path collapsed onto the core renderer. Package surface decisions belong to PRD 15.
- `@aura3d/scene` and `@aura3d/math`: not changed. The engine does not depend on `@aura3d/math`, and `Euler` there supports only `"XYZ"`. The scene-graph math lives in `packages/engine/src/agent-api/sceneGraph.ts` (§15 Phase 1), so no new package edge is added. Converging the engine onto `@aura3d/math` is PRD 15's decision.
- `@aura3d/assets` (`packages/assets/src/GLTFRenderResources.ts`): glTF `alphaMode` → `BlendMode`.
- `benchmarks/quality-rebuild`, `tools/quality-rebuild-capture`, `.github/workflows/quality-rebuild-capture.yml`: acceptance harness (extended with PRD 12).
- `apps/showcase-*`, `apps/aura-clash-showcase`: migration of app-level overrides (`pixelRatio`, ambient intensities, `colorGrade.exposure`). Owned by PRD 14; this PRD supplies codemod targets.

## 5. Affected files and directories

Modify:
- `packages/engine/src/agent-api/index.ts`: `createProductionSceneRenderer` (12523), quality profiles (4225-4310), `createAuraApp` canvas sizing (11126-11140), `startProductionRender` and resize (12241-12310), `createProductionRuntimePostprocess` (12797-12935), `createProductionRuntimeRendererInput` (13871-14011), primitive material and geometry (14837-14984), `createProductionInstanceTransforms` (14747), color parsing (15383-15418), primitive generators (17287-17479), `createModelMatrix` (17766), `flattenSceneNodes` / `composeAuraTransform` (17960-18010), `configureCanvas` (18105), `devicePixelRatioSafe` (18699).
- `packages/rendering/src/RenderDevice.ts` (`RenderCommandState`, 135-161) and `Material.ts` (`RenderState`, 32-42; `DEFAULT_RENDER_STATE`, 63-73; `validateRenderState`), `WebGL2Device.ts` (render state 4380-4410, VAO cache 4193-4236, buffer registry 498, present shader 3453-3633, tone-map options 1906-1910), `WebGL2StateCache.ts` (blendFuncSeparate, blendEquationSeparate), `ForwardPass.ts` (whole draw path), `Renderer.ts` (post orchestration, static batching 2361-2385, resize 508), `ShaderChunks.ts`, `ShaderLibraryCore.ts`, `ShaderLibrary.ts`, `ShaderModule.ts`, `PBRMaterial.ts`, `TexturedPBRMaterial.ts`, `InstancedPBRMaterial.ts`, `SkinnedLitMaterial.ts`, `NormalMappedPBRMaterial.ts`, `SceneOptimization.ts`, `ToneMapping.ts`, `ColorManagement.ts`, `Exposure.ts`.
- `packages/engine/src/production-runtime/GameRenderPreset.ts` (373, 450): drop `rgba8` and the implicit Reinhard. `createPerformanceGovernor` (158) delegates its resolution step to `ResolutionGovernor`.
- `packages/engine/src/agent-api/RootRuntimeSupport.ts` (`AuraPerformanceQuality.resolutionScale` maps to the scene-target `renderScale`), `packages/engine/src/agent-api/GameAppRuntime.ts` (127-139).
- `packages/rendering/src/MorphTargetPlan.ts`: wrapped texture layout (§6.7).
- `packages/rendering/src/BRDFLut.ts`: replace the approximate RGBA8 LUT with the r185 RG16F data (§6.6).
- `packages/assets/src/GLTFRenderResources.ts`: `alphaMode` → `BlendMode`.
- `packages/lean/src/base.ts`, `product.ts`, `game.ts`, `index.ts`.
- Canvas readback consumers listed in §2.10a that read the root canvas after the frame (inventory task in §15 Phase 2).

Create:
- `packages/rendering/src/program/` with `ProgramFeatures.ts`, `ProgramKey.ts`, `ProgramGenerator.ts`, `ProgramCache.ts`, `chunks/*.glsl.ts` (one exported template string per chunk), and `ProgramWarmup.ts`.
- `packages/rendering/src/output/OutputPass.ts` and `output/ToneMappingOperators.glsl.ts`.
- `packages/rendering/src/Geometry.ts`: extend `uvSphere`, `cylinder`, `capsule`, `litPlane`; add `torus` and `box` (§6.3).
- `packages/rendering/src/resources/InstanceBuffer.ts`, `resources/MorphTargetTexture.ts` (GPU upload of the `MorphTargetPlan` texture; the planner is extended, not duplicated), `resources/UniformBlock.ts`.
- `packages/rendering/src/BlendModes.ts`.
- `packages/rendering/src/ResolutionGovernor.ts`.
- `packages/engine/src/agent-api/sceneGraph.ts` (matrix hierarchy, extracted from `index.ts`).
- `packages/engine/src/agent-api/color.ts` (single color parser).

Delete (at the end of the migration, Phase 7):
- `createWebGLSceneRenderer` and its GLSL, GLB parser and backdrop helpers (`index.ts:15982` through about `17286`, plus `parseGlb` at about `:17018`).
- `packages/rendering/src/LeanWebGL2Device.ts` and `packages/rendering/src/lean/LeanProductionRenderer.ts`.
- `packages/rendering/src/production-runtime/shaders/chunks/*.glsl`, `production-runtime/shaders/wgsl/pbr.wgsl`, `production-runtime/shaders/wgsl/skybox.wgsl`, `production-runtime/materials/MaterialCompiler.ts`, `production-runtime/materials/GLTFMaterialAdapter.ts`, and `production-runtime/materials/PBRShaderFeatures.ts` (stubs; research/03 §13), together with their re-exports in `production-runtime/index.ts` and the dependent `production-runtime/materials/GLTFPBRMaterialAdapter.ts` (§2.7). PRD 15 records the export removal. Owners of `packages/rendering/src/shaders/*.glsl` must confirm they are build inputs before deletion.
- Hand-written program registrations for `aura3d/pbr`, `aura3d/instanced-pbr`, `aura3d/pbr-textured` (all 10 variants), `aura3d/skinned-lit`, `aura3d/skinned-lit-8` and `aura3d/pbr-normal-map`, replaced by generator output.
- Engine metadata that lies: `sceneExposurePresets` (`index.ts:4204-4214`), `rendererColorManagementPreset.defaultExposure` (`:4197`), and `renderer.qualityPresets()` / `screenshotQuality()` (`:4225-4246`). Tier semantics move to PRD 11's quality tiers.

## 6. Architecture proposal

### 6.1 One renderer, one contract

```
createAuraApp / createGameApp / @aura3d/lean / A3DRenderer / product viewer
            │  (all build a RenderSource; none owns GL state)
            ▼
   Renderer (packages/rendering/src/Renderer.ts)  ← the only frame owner
     ├─ FrameUniforms (UBO 0: camera, exposure, time)    ─┐
     ├─ LightUniforms (UBO 1: lights, shadow params)      ├─ uploaded once per frame/view
     ├─ ProgramCache(feature key → program, async compile)┘
     ├─ Opaque/transmissive/transparent queues (blend mode in the sort key)
     ├─ HDR scene target: RGBA16F (fallback R11F_G11F_B10F, then RGBA8 "degraded"), MSAA per tier
     ├─ HDR post chain (PRD 03 kernels; this PRD defines the contract: linear, scene-referred)
     └─ OutputPass: exposure → tone map → sRGB OETF → dither → (display-space grade/LUT/AA, PRD 03) → canvas
            ▼
   WebGL2Device (only GL device). WebGPU device conforms to the same RenderState / program contract (PRD 11)
```

Rules:
1. There is exactly one `RenderDevice` implementation per backend. `LeanWebGL2Device` is deleted. Bundle-size targets are renegotiated in PRD 15 rather than satisfied by forking the device.
2. The forward pass always writes linear scene-referred radiance. No material program contains a tone curve or an sRGB encode. The `u_outputColorSpace` uniform and `a3dPbrEncodeOutput` are removed.
3. Tone mapping and encode happen once, in `OutputPass`, for every entry point, including the no-effects path. An app that requests no effects still gets HDR target → OutputPass.
4. There is no silent fallback renderer. `createAuraApp` stays synchronous, and `app.ready()` keeps its documented contract of resolving rather than rejecting (`index.ts:10723-10726`). If the production path cannot mount:
   - nothing is drawn by any other renderer;
   - `diagnostics().errors` gains `{ code: "renderer-mount-failed", message, cause }`;
   - a new `app.onRendererError(listener)` subscription (same shape as the existing `onDeviceLost`, `index.ts:10748`) and `console.error` (once) receive the same object;
   - in dev builds (`import.meta.env.DEV` or `NODE_ENV !== "production"`), a DOM overlay `[data-aura3d-error="renderer-mount-failed"]` is placed over the canvas with the message and cause stack;
   - `app.step()` and `app.render()` become no-ops that push one warning.

   A new opt-in `renderer.strictMount: true` makes `ready()` reject with `AuraRuntimeError("renderer-mount-failed")`. Tests and the capture harness set it so failures fail loudly. `renderer.mode: "safe-basic"` is removed from the type, and passing it throws `AuraMigrationError` synchronously from `createAuraApp` with a message naming this PRD.
5. A capability fallback is allowed only when it is explicit and reported: for example, when no float color-renderable format exists the target becomes RGBA8 with tone mapping folded into a final forward subpass. `diagnostics().renderer.output.degraded = "rgba8-no-float-target"` and a one-time console warning record it.

### 6.2 Scene graph: matrix hierarchy

- Groups compose a 4×4 world matrix: `world(child) = world(parent) · local(child)`, with `local = T · R(q) · S`. Euler input is converted to a quaternion with an explicit order. The current `rotationXYZ` (`index.ts:17900-17909`) builds `Rz·Ry·Rx` for column vectors. That is the matrix three.js produces for Euler order `"ZYX"`, not `"XYZ"`. The default stays this order (named `"ZYX"` in the new API, with `rotationOrder` exposed) so every existing single-node rotation renders identically. The three-compat migration path (PRD 15) must map three's default `"XYZ"` explicitly.
- `flattenSceneNodes` returns nodes with `worldMatrix: Float32Array` (column-major) and a decomposed `world: { position, quaternion, scale }` for consumers that need TRS (physics, diagnostics). If decomposition detects shear (non-uniform parent scale followed by a rotated child), the node carries `worldMatrix` only, and physics receives the nearest TRS plus a diagnostics warning `SCENE_GRAPH_SHEAR` naming the node.
- `createModelMatrix` becomes `worldMatrix · S(size ⊙ fit) · normalizeOffset`. `size` and model fit are geometry-space scales applied innermost and are never inherited by children.
- `lookAt` resolves in world space after composition: the node's world position is used, and the resulting world rotation is converted back to local rotation relative to the parent.
- Matrices are cached per node and recomputed only when a node's local transform, its animation sample, or an ancestor changes. Each node gets a dirty flag and a version counter. Runtime node handles (`setPosition`, `setRotation`, `setScale`) bump the version.

### 6.3 Primitive geometry module

`@aura3d/rendering` already has correct generators that the engine bridge does not use. `Geometry.uvSphere(radius, segments = 48, rings = 24, { textured })` is at `packages/rendering/src/Geometry.ts:264`. `Geometry.cylinder({ segments = 48, capped = true, textured })` is at `:307`; it has separate cap vertices with ±Y normals and cap winding that faces outward (top cap `(center, s+1, s)` gives +Y, bottom `(center, s, s+1)` gives −Y). `Geometry.capsule({ radius, height, segments = 48, rings = 12 })` is at `:369`. The engine instead builds its own placeholder meshes (`index.ts:17287-17479`). The fix is to delete the engine generators and route `createProductionPrimitiveMesh` (`index.ts:14977`) to the rendering generators, extended as follows. All generators emit position, normal, uv0, tangent (xyzw), bounds, and `Uint32Array` indices when the vertex count exceeds 65,535:

| Primitive | Generator | Parameters (default) | Change needed |
|---|---|---|---|
| sphere | `Geometry.uvSphere` | `widthSegments 64`, `heightSegments 32` | Rename parameters; default `textured: true` |
| cylinder | `Geometry.cylinder` | `radialSegments 48`, `heightSegments 1`, `openEnded false`, `radiusTop/Bottom 0.5` | Add `heightSegments`, top and bottom radii, `openEnded` (= `!capped`) |
| capsule | `Geometry.capsule` | `capSegments 8`, `radialSegments 32` | Shape comes from effective dimensions (see below) |
| torus | new `Geometry.torus` | `radius 0.43`, `tube 0.045`, `radialSegments 64`, `tubularSegments 16` | New. Keeps the current engine proportions; adds UVs and tangents |
| plane | `Geometry.litPlane` extended | `widthSegments 1`, `heightSegments 1` | Add segments; keep the CCW-from-+Y winding the engine already fixed (`index.ts:17303-17309`) |
| box | engine `createBoxGeometry` moved to `Geometry.box` | `width/height/depthSegments 1` | Move; UVs and tangents already correct |

Capsule shape: a capsule cannot be a unit mesh scaled non-uniformly, because that produces ellipsoidal caps (the engine rigs scale capsules by values like `[0.1, 0.36, 0.1]`, `index.ts:6562`). For capsules only, the effective local dimensions `D = size ⊙ localScale` are folded into generation: `radius = 0.5 · min(D.x, D.z)`, `height = max(D.y, 2 · radius)`, x/z ellipticity applied as a horizontal-only scale. The node's render matrix then uses unit local scale. Geometry is cached by `(D.y / min(D.x, D.z))` quantized to 0.01.

Tier override: Low tier halves sphere, cylinder, capsule and torus segment counts at mount (the cache key includes segment counts). Geometry is shared per `(primitive, params)` across nodes; today every node builds its own.

### 6.4 Feature-keyed program generator

Replaces the hand-copied shaders.

- **Inputs:** a `ProgramFeatures` record derived from material, geometry, item and frame state (§7.3). Every field that changes generated code is in the record. Fields that only change values (base color, roughness factor) are never in it.
- **Key:** a stable string built from sorted feature fields (`ProgramKey.ts`). The key and the generated source are covered by a unit test so key collisions show up as test failures.
- **Assembly:** `#version 300 es`, precision, `#define` block from features, ordered chunk includes (`common`, `colorspace`, `brdf`, `lights_pars`, `shadow_pars` (PRD 02 owns contents), `ibl_pars` (PRD 02), `skinning_pars`, `morph_pars`, `instancing_pars`, `normal_pars`, `material_pars` (PRD 04 extension lobes), `fog_pars`, then vertex and fragment mains). Chunks are TypeScript template strings so they tree-shake and type-check. A runtime `#include` resolver is not used.
- **Light loop:** a compile-time `NUM_DIR_LIGHTS`, `NUM_POINT_LIGHTS`, `NUM_SPOT_LIGHTS`, `NUM_RECT_LIGHTS` (each 0..N, unrolled) when the total is ≤ 8. Above that, `LIGHTS_CLUSTERED` with the existing cluster textures. The light count is part of the key; three.js does the same. To bound program count, light counts are bucketed to {0, 1, 2, 4, 8} with unused slots zero-intensity.
- **Uniforms:** per-frame and per-view data in UBO `AuraFrame` (binding 0) and `AuraLights` (binding 1). Per-material scalars are plain uniforms with a per-program last-value cache. Samplers are declared only when their feature is on.
- **Variants that become features rather than programs:** skinned (4 or 8 influences, uniform or texture palette), instanced (attribute matrices, optional instance color), morph (texture, target count bucket, normals yes/no), textured slots (one flag per map, each with its own `uvSet` and `textureTransform`), double-sided, alpha mode (opaque, mask, blend), vertex colors, fog type, shadow receive type (none, PCF directional, CSM n, spot, point; PRD 02 fills chunks), env map type (none, cube PMREM, equirect; PRD 02), output space is always linear.
- **Depth and shadow programs:** the same generator with `pass: "depth"`, sharing the vertex stage features (skinning, instancing, morph, alpha-test). This is the hook PRD 02 needs to fix bind-pose and instanced shadows (research/19 C4).
- **Compile:** `ProgramCache.acquire()` returns a ready program or a pending handle. Draws whose program is pending are skipped that frame only if `renderer.compile.mode === "async-skip"`. The default mode is `"warm-then-block"`: `app.ready()` (existing method) resolves after `ProgramWarmup.precompile(scene)` has compiled every key the first frame needs, using `KHR_parallel_shader_compile` with `COMPLETION_STATUS_KHR` polling when available. Link status is checked only after completion.
- **WebGPU:** this PRD makes the feature record and chunk set backend-neutral data. WGSL emission is PRD 11's job. The generator API takes a `target: "glsl300es" | "wgsl"` parameter from day one; `"wgsl"` throws `NotImplemented` until PRD 11 lands.

### 6.5 Color and HDR pipeline contract

| Stage | Space | Format | Owner |
|---|---|---|---|
| Authored colors (hex, CSS, numbers) | sRGB → linear at parse | float | this PRD (`color.ts`) |
| Color textures | sRGB, hardware decode (`SRGB8_ALPHA8`; compressed sRGB formats via PRD 04) | — | PRD 04 |
| Forward shading | linear scene-referred radiance, unbounded | RGBA16F MSAA | this PRD |
| Environment and IBL inputs | linear HDR (no Reinhard pre-encode) | RGBA16F | PRD 02 |
| Background | linear; tone-mapped with the scene by default; `toneMapped: false` opt-out | — | this PRD |
| HDR post (AO, SSR, DOF, motion blur, TAA, bloom, volumetrics) | linear | RGBA16F | PRD 03 (kernels), this PRD (ordering rule) |
| OutputPass | exposure · operator → display-linear → sRGB OETF → triangular dither (±1 LSB) | RGBA8 canvas | this PRD |
| Display-space ops (grade, vignette, LUT, FXAA/SMAA, grain) | display-referred | RGBA8 ping-pong | PRD 03 |

Background opt-out: a depth test cannot identify background pixels. Transparent, additive and particle draws do not write depth, so glow over the sky would be treated as background and skip tone mapping. Instead, when any background declares `toneMapped: false`, the program feature `backgroundCoverage` adds a second color attachment, `R8` "coverage" (MRT location 1). It is cleared to 0, and every forward fragment writes `outCoverage = 1.0`. Under the shared blend state the result is the drawn coverage: alpha → `a`, premultiplied → 1, additive → `a` (`SRC_ALPHA, ONE`), multiply → 0, which is acceptable because multiply only darkens. `OutputPass` computes `display = mix(clamp(hdr, 0, 1), TONE_MAP(hdr · exposure), coverage)`. Cost: 1 B/px plus its MSAA resolve, paid only when the feature is on. This replaces `colorToAcesInputClearColor`.

Operator input convention: `OutputPass` multiplies by exposure once (`hdr · u_exposure`) before `TONE_MAP`. The ported three.js operators therefore have their internal `color *= toneMappingExposure` line removed. Otherwise exposure is applied twice, as it would be for `linear`, `reinhard`, `aces` (`toneMappingExposure / 0.6` becomes `/ 0.6`), `agx` and `neutral`.

Operators (all GLSL in `ToneMappingOperators.glsl.ts`, ported from three.js r185 `tonemapping_pars_fragment.glsl.js`, which is present at `node_modules/three@0.185.1`):
- `none`: clamp to [0,1].
- `linear`: `x` (already exposed), clamped.
- `reinhard`: `x / (1 + x)`, clamped.
- `aces`: keep the existing fitted ACES (`WebGL2Device.ts:3501-3517`). It already uses three's `ACESInputMat` / `ACESOutputMat` and the `/ 0.6` prescale (`:3514`).
- `agx`: three r185 `AgXToneMapping`: Rec.709 → Rec.2020, inset matrix, `log2` encode clamped to [−12.47393, 4.026069] EV, 6th-order polynomial sigmoid, outset matrix, `pow(x, 2.2)` linearize, Rec.2020 → Rec.709.
- `neutral`: Khronos PBR Neutral: `startCompression = 0.8 − 0.04`, `desaturation = 0.15`, min-channel offset, peak compression on the max channel, desaturation toward peak.

Default operator: `"aces"` for continuity with every existing game and with the benchmark spec (`benchmarks/quality-rebuild` passes ACES to both engines). Phase 5 runs an A/B (ACES vs AgX) on the 18 games and records the decision. Changing the default requires that A/B to show no game regressing under vision review.

Exposure: `renderer.output.exposure` (linear multiplier, default 1) × `effects.colorGrade({ exposure })` (linear multiplier, default 1). Both reach `u_exposure`. Diagnostics report the value actually sent.

### 6.6 PBR core corrections (shared `brdf` chunk)

All generated programs use one `brdf` chunk:
- F0, in the same order as three r185 `lights_physical_fragment.glsl.js:45-46`: `specularColor = min(pow2((ior − 1)/(ior + 1)) · specularColorFactor, 1) · specularIntensity`, then `specularColorBlended = mix(specularColor, baseColor, metallic)` and `F90 = mix(specularIntensity, 1, metallic)`. `ior` defaults to 1.5, which gives 0.04. Both `specularColor` (dielectric) and `specularColorBlended` are kept in `PhysicalMaterial`, because the IBL path needs the dielectric value separately.
- Diffuse: Lambert `baseColor · (1 − metallic) / π` (three's `diffuseContribution`) by default, matching glTF and three.js. Burley stays behind `#define DIFFUSE_BURLEY` for opt-in materials; its `energyFactor` is removed.
- Direct specular: GGX D, height-correlated Smith V, Schlick F, unchanged math, evaluated with `specularColorBlended`. Multiscatter compensation is a verbatim port of three r185 `BRDF_GGX_Multiscatter` (`lights_physical_pars_fragment.glsl.js:424-460`): DFG is sampled at both V and L; `FssEss_{V,L} = Fblend · dfg.x + F90 · dfg.y`; `Ems = 1 − (dfg.x + dfg.y)` per direction; `Favg = Fblend + (1 − Fblend)/21`; `Fms = FssEss_V · FssEss_L · Favg / (1 − Ems_V · Ems_L · Favg + ε)`; result `single + Fms · Ems_V · Ems_L`. The simpler `1 + F0(1/Ess − 1)` scale is not used, because it would not match the r185 reference test.
- DFG LUT: replace the approximate RGBA8 LUT (`BRDFLut.ts`) with the r185 16×16 RG16F table. Copy the `DATA` array verbatim from `node_modules/three/src/renderers/shaders/DFGLUTData.js` (MIT; keep the attribution header) into `packages/rendering/src/BRDFLut.ts`. It is linear-filtered and clamp-to-edge, and sampled as `texture(u_dfgLut, vec2(roughness, dotNV))`: x = roughness, y = dotNV, the opposite of the current Aura lookup `vec2(nDotV, roughness)`. It is a renderer-owned global texture bound for every lit program, not a material option (today it is optional: `TexturedPBRMaterial.ts:459-460`).
- Indirect: port r185 `RE_IndirectSpecular_Physical`. Run `computeMultiscattering` separately for the dielectric `specularColor` and the metallic `diffuseColor` (base), mix single and multi by metalness, and weight diffuse by `diffuseContribution · (1 − (singleDielectric + multiDielectric))`. Irradiance is cosine-weighted by `RECIPROCAL_PI`. This replaces `a3dPbrEnvironmentLightSplitSum` (§2.6). PRD 02 owns the probe normalization feeding `irradiance` and `radiance`.
- Specular AA (three r185 `lights_physical_fragment` lines 6-11 per research/03 §2): `vec3 dxy = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal))); float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z); roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0);` using the interpolated, non-normal-mapped normal.
- Ambient irradiance: `irradiance = ambientColor · ambientIntensity` and `diffuse += irradiance · BRDF_Lambert(diffuseColor)`, i.e. divide by π, with no hemisphere factor. Hemisphere lighting becomes an explicit light type (PRD 02 adds `lights.hemisphere`).
- Removed, not ported: `mix(1.1, 0.65, r)` and `mix(1.1, 0.85, r)` specular scales, `reflectionBand` / `roughEnvironmentFloor` procedural specular and the textured "stripes", `mix(1.0, 0.18, anisotropy)` on env and direct terms, `a3dApplyAdvancedPbrLobes`, `a3dApplyMetalRough`, `a3dPbrClampSampledSpecularEdgeEnergy`, source-paint gates, red-gated direct AO, and dual equirect+cube sampling. Extension lobes (clearcoat, sheen, anisotropy, iridescence, transmission) are re-implemented to KHR spec in PRD 04 on top of this chunk. Until then, a material declaring an extension renders the base lobe only, with the warning `EXTENSION_LOBE_PENDING_PRD04:<ext>` in diagnostics.
- AO: occlusion maps apply to indirect diffuse and, via `computeSpecularOcclusion`, indirect specular only, never to direct light.

### 6.7 Draw submission without per-draw allocation

- **`DrawPacket` pool:** one reusable object per render item per frame, holding a program handle, a pipeline-state key (u32), a VAO handle, a material uniform block and an instance count. `ForwardPass` builds packets into a typed array-backed queue and sorts by `(passBucket, blendMode, programId, materialId, depth)`.
- **`RenderPipeline` cache:** `(programId, renderStateKey, vertexLayoutKey)` → pipeline, created once.
- **Uniform last-value cache:** per program location, compare before `uniform*` calls (three's `WebGLUniforms` cache pattern).
- **UBOs:** `AuraFrame` (viewProjection, view, projection, cameraPosition, exposure, time, resolution, near/far) is uploaded once per view. `AuraLights` is uploaded once per frame. This also fixes the depth-range mismatch: post reads near/far from the same block instead of the hard-coded 0.1/1000 (research/02 §3.7).
- **`InstanceBuffer`:** persistent and owned by the source node; `version` bumps on change; upload with `bufferSubData` only when the version changes. Grows by doubling; never per-frame `createBuffer`. The 64-instance uniform path is removed; all instancing uses attribute matrices (`a_instanceMatrix0..3`) plus optional `a_instanceColor`. The VAO cache key uses persistent buffer ids, and `WebGL2Device` deletes VAOs referencing a buffer when that buffer is disposed. `this.buffers` removes entries on dispose.
- **Static batching:** merge at mount for nodes marked static (no runtime handle, no animation), using the existing `MeshConsolidation` (research/07 §3.3). Remove per-frame regrouping in `Renderer.ts:2361-2385`.
- **`MorphTargetTexture`:** GPU upload of a `MorphTargetPlan` (`MorphTargetPlan.ts`, extended, not duplicated). The plan's texture layout changes from "x = vertex" (width = vertexCount, which caps morphs at 4,096 vertices) to a wrapped layout: an RGBA16F `TEXTURE_2D_ARRAY` with `width = min(vertexCount, 1024)` and `height = ceil(vertexCount / width)`, and layer `= target · stride + attribute`. Here `stride` is 1, 2 or 3 for position, plus normal, plus tangent deltas. The vertex shader indexes with `gl_VertexID`. Weights go in `uniform float u_morphWeights[MORPHTARGETS_BUCKET]` with buckets {4, 8, 16, 32}. Active targets above 32 are sorted by weight and truncated, with the diagnostics warning `MORPH_TARGETS_TRUNCATED:<count>`. The `"uniform"` mode (≤ 64 vertices, ≤ 4 targets) is removed. `"cpu"` mode remains only in `MockRenderDevice` and for layers above `MAX_ARRAY_TEXTURE_LAYERS`, where it is reported in diagnostics.

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

Additive and premultiplied draws accumulate into the HDR target, so additive emissive VFX adds energy that bloom (PRD 03) can isolate. Alpha writes keep the canvas opaque (`alpha: false` context). `WebGL2StateCache` gains `blendFuncSeparate` and `blendEquationSeparate` dedupe.

### 6.9 Resolution policy and governor

- Default `pixelRatio = min(devicePixelRatio, tier.maxPixelRatio)`, with `tier.maxPixelRatio` Low 1, Medium 1.5, High 2, Ultra 3. Profiles lose their fixed `pixelRatio` field. An explicit `options.pixelRatio` wins. `devicePixelRatioSafe()` loses its `min(2, ...)` clamp (`index.ts:18700`); the tier cap replaces it.
- Re-evaluate on `resize` and on `matchMedia("(resolution: <current>dppx)")` change.
- `ResolutionGovernor` (`packages/rendering/src/ResolutionGovernor.ts`) is the single resolution state machine. It measures GPU frame time (`RendererTiming`, `EXT_disjoint_timer_query_webgl2`), falling back to CPU frame interval. It adjusts `renderScale ∈ [tier.minRenderScale, 1]` in 0.1 steps with hysteresis: down after 30 consecutive frames over `targetFrameMs · 1.1`, up after 120 frames under `targetFrameMs · 0.8`. It applies to the scene target only. `OutputPass` upsamples bilinearly; the CAS-style sharpen is PRD 03. On HiDPI the governor floor is `1/devicePixelRatio`, so the scene never drops below 1 CSS pixel = 1 render pixel unless `allowSubCssResolution: true`.
- Existing mechanisms are rewired, not kept in parallel (§2.8):
  - `AuraPerformanceQuality.resolutionScale` / `app.setPerformanceQuality()` sets a manual `renderScale` ceiling on the scene target. It no longer resizes the canvas backing store, so the OutputPass and DOM UI stay sharp.
  - `createPerformanceGovernor`'s `resolutionScale` step calls `ResolutionGovernor` (its `RESOLUTION_STEPS` table is deleted) and keeps owning `particleScale`, `lodBias` and `shadowSize`.
  - The effective scale is `min(manual ceiling, governor scale)`, and diagnostics report both.
- Canvas context: `antialias: false` (MSAA happens on the offscreen target), `preserveDrawingBuffer: false`, `alpha: false`, `powerPreference: "high-performance"`. Playwright `page.screenshot` (used by both quality-rebuild capture tools, §2.10a) is unaffected. For code that reads the canvas itself, `app.capture(): Promise<ImageBitmap | Blob>` renders a frame and reads it back in the same task, before compositing. For one minor release, `renderer.debug.preserveDrawingBuffer: true` restores the old attribute, with a dev warning, for readback consumers not yet migrated (§15 Phase 2).

## 7. APIs to add, change, remove

### 7.1 Public engine API (`@aura3d/engine`, `packages/engine/src/agent-api/index.ts`)

```ts
// ---- Renderer options (change) ----
export type AuraQualityTier = "low" | "medium" | "high" | "ultra" | "auto";
export type AuraToneMappingOperator = "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral";

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
  readonly quality?: AuraQualityTier;              // NEW, default "auto" (tier semantics: PRD 11)
  readonly output?: AuraRendererOutputOptions;     // NEW
  readonly resolution?: AuraResolutionOptions;     // NEW
  readonly msaa?: 0 | 2 | 4;                       // NEW, default by tier
  readonly compile?: { readonly mode?: "warm-then-block" | "async-skip" }; // NEW
  readonly strictMount?: boolean;                  // NEW, default false: ready() rejects on mount failure when true
  readonly debug?: { readonly preserveDrawingBuffer?: boolean }; // NEW, temporary (one minor), dev warning
  readonly textureBudgetBytes?: number;            // unchanged
  /** @deprecated Accepted for one minor release, mapped to `quality`; "safe-basic" maps to "low". */
  readonly qualityProfile?: AuraRendererQualityProfileId;
  // REMOVED: mode?: AuraRendererMode; fallback?: AuraRendererFallbackMode  (throws AuraMigrationError)
}

export interface AuraCreateAppOptions {
  // ...existing...
  /** @deprecated use renderer.resolution.pixelRatio. Still honored; wins over defaults. */
  readonly pixelRatio?: number;
}

export interface AuraApp {
  // ...existing...
  /** Renders one frame and reads it back in the same task (no preserveDrawingBuffer needed). After Phase 4 the image is the post-OutputPass result. */
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  /** EXISTING method, signature unchanged. Additionally awaits ProgramWarmup (KHR_parallel_shader_compile when available).
   *  Still resolves on mount failure unless renderer.strictMount is true (§6.1 rule 4). */
  ready(): Promise<void>;
  /** NEW. Fires on renderer-mount-failed and other fatal renderer errors. Returns an unsubscribe function. */
  onRendererError(listener: (error: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
  setOutput(output: AuraRendererOutputOptions): void;
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

// ---- Materials (change; PRD 04 owns the extension lobes) ----
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

Removed from the public type surface: `AuraRendererMode`, `AuraRendererFallbackMode`, `AuraRendererQualityProfile.pixelRatio`, `.preserveDrawingBuffer`, `.maxRecommendedDrawCalls`, `.requestedFeatures`, `.supportedInRoot`, `.blockedInRoot`; `rendererQualityPresets`, `screenshotQuality`, `sceneExposurePresets`; `AuraRendererDiagnosticReport.exposure: AuraSceneExposurePreset`, which becomes `exposure: number`, the value actually sent. PRD 15 owns the deprecation calendar. This PRD requires that none of these fields survive in a form that reports a value the renderer does not use.

Diagnostics additions (`AuraRendererDiagnosticReport`):
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
// RenderDevice.ts and Material.ts (change). Two types carry `blend: boolean` today: the material-level
// `RenderState` (Material.ts:32-42, default at :63-73) and the device-level `RenderCommandState`
// (RenderDevice.ts:135-161). Both change identically. Only `blend` and `depthCompare` change;
// depthTest, depthWrite, cullMode, colorWrite (4-tuple), scissor, polygonOffset and stencil are kept as is.
export type BlendFactor = "zero" | "one" | "src-color" | "one-minus-src-color" | "src-alpha" | "one-minus-src-alpha"
  | "dst-color" | "one-minus-dst-color" | "dst-alpha" | "one-minus-dst-alpha";
export type BlendEquation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export interface BlendComponent { readonly equation: BlendEquation; readonly src: BlendFactor; readonly dst: BlendFactor }
export type BlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply"
  | { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
export type DepthCompare = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
export interface RenderCommandState /* and Material RenderState */ {
  readonly depthTest: boolean;                                    // unchanged
  readonly depthWrite: boolean;                                   // unchanged
  readonly cullMode: "none" | "back" | "front";                   // unchanged
  readonly blend: BlendMode;            // was boolean. `true` accepted for one release → "alpha" (dev warning)
  readonly depthCompare: DepthCompare;  // was "always" | "less-equal"
  readonly colorWrite?: readonly [boolean, boolean, boolean, boolean]; // unchanged
  readonly scissor?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null; // unchanged
  readonly polygonOffset?: { readonly factor: number; readonly units: number } | null;  // unchanged
  readonly stencil?: StencilState | null;                          // unchanged
}
export function renderStateKey(state: RenderCommandState): number; // u32 for sort and pipeline cache (scissor excluded: dynamic state)

// program/ProgramFeatures.ts (new)
export interface ProgramFeatures {
  readonly pass: "forward" | "depth" | "distance" | "velocity";
  readonly target: "glsl300es" | "wgsl";
  readonly lighting: "lit" | "unlit";
  readonly maps: {
    readonly baseColor?: TextureSlotFeature; readonly normal?: TextureSlotFeature;
    readonly metallicRoughness?: TextureSlotFeature; readonly occlusion?: TextureSlotFeature;
    readonly emissive?: TextureSlotFeature;
  };
  readonly extensions: readonly MaterialExtensionFeature[]; // PRD 04 defines members; sorted
  readonly alphaMode: "opaque" | "mask" | "blend";
  readonly doubleSided: boolean;
  readonly vertexColors: boolean;
  readonly flatShading: boolean;
  readonly skinning?: { readonly influences: 4 | 8; readonly palette: "uniform" | "texture" };
  readonly morph?: { readonly targetBucket: 4 | 8 | 16 | 32; readonly normals: boolean; readonly tangents: boolean };
  readonly instancing?: { readonly color: boolean };
  readonly lights: { readonly dir: 0|1|2|4|8; readonly point: 0|1|2|4|8; readonly spot: 0|1|2|4|8; readonly rect: 0|1|2|4; readonly clustered: boolean; readonly hemisphere: boolean };
  readonly shadows: ShadowReceiveFeature;   // PRD 02 defines members
  readonly environment: "none" | "pmrem-cube" | "equirect"; // PRD 02 fills chunk
  readonly fog: "none" | "linear" | "exp2" | "height";      // PRD 10 may extend
  readonly diffuseModel: "lambert" | "burley";
  readonly specularAntialiasing: boolean;  // default true
  readonly backgroundCoverage: boolean;    // writes MRT 1 coverage (§6.5); frame-level, set by the renderer
}
export interface TextureSlotFeature { readonly uvSet: 0 | 1; readonly transform: boolean }

// program/ProgramKey.ts
export function computeProgramKey(features: ProgramFeatures): string;

// program/ProgramGenerator.ts
export interface GeneratedProgram { readonly key: string; readonly vertex: string; readonly fragment: string; readonly defines: Readonly<Record<string, string | number | true>> }
export function generateProgram(features: ProgramFeatures): GeneratedProgram;

// program/ProgramCache.ts
export interface ProgramHandle { readonly key: string; readonly status: "pending" | "ready" | "failed"; readonly program?: RenderShaderProgram; readonly error?: string }
export class ProgramCache {
  constructor(device: RenderDevice, options?: { readonly parallelCompile?: boolean });
  acquire(features: ProgramFeatures): ProgramHandle;
  precompile(featureList: readonly ProgramFeatures[]): Promise<void>;
  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number };
  dispose(): void;
}

// Material.ts (change)
export abstract class Material {
  /** Replaces shaderKey/shaderVariant for lit and unlit built-ins. Custom materials keep shaderKey. */
  abstract programFeatures(context: MaterialFeatureContext): Omit<ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage">;
}

// output/OutputPass.ts (new)
export interface OutputPassOptions {
  readonly toneMapping: AuraToneMappingOperatorLike; readonly exposure: number; readonly dithering: boolean;
  readonly backgroundCoverage: boolean; // true when any background is toneMapped: false (§6.5)
}
export class OutputPass { constructor(device: RenderDevice); execute(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions, output: RenderTarget | "canvas"): void }

// resources/InstanceBuffer.ts (new)
export class InstanceBuffer {
  constructor(device: RenderDevice, capacity: number, options?: { readonly colors?: boolean });
  readonly count: number; readonly version: number;
  setMatrices(matrices: Float32Array, count?: number): void;    // bumps version
  setColors(colors: Float32Array): void;                        // bumps version
  bind(): { readonly matrixBuffer: RenderBuffer; readonly colorBuffer?: RenderBuffer };
  dispose(): void;                                              // also evicts dependent VAOs
}

// resources/MorphTargetTexture.ts (new)
export class MorphTargetTexture {
  static fromGeometry(device: RenderDevice, geometry: Geometry, targets: readonly MorphTarget[]): MorphTargetTexture;
  readonly targetCount: number; readonly hasNormals: boolean; readonly hasTangents: boolean;
  dispose(): void;
}

// Geometry.ts (change; engine placeholder generators index.ts:17287-17479 are deleted)
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

// ResolutionGovernor.ts (new)
export interface ResolutionGovernorOptions { readonly targetFrameMs: number; readonly minRenderScale: number; readonly maxRenderScale: number; readonly hysteresisDownFrames?: number; readonly hysteresisUpFrames?: number }
export class ResolutionGovernor { constructor(o: ResolutionGovernorOptions); sample(frameMs: number, gpuMs?: number): number /* renderScale */; reset(): void }

// Renderer.ts (change)
export interface RendererCreateOptions {
  // REMOVED: preserveDrawingBuffer (internal capture path instead), antialias on canvas
  readonly msaa?: 0 | 2 | 4;
  readonly hdrTarget?: "auto" | "rgba16f" | "r11g11b10f";   // "auto" probes EXT_color_buffer_float/half_float
}
```

Removed from `@aura3d/rendering`: `LeanWebGL2Device`, `LeanProductionRenderer`, `ForwardPass` options `outputColorSpace`, the `u_outputColorSpace` contract, `MAX_GPU_INSTANCES` / `MAX_GPU_MORPH_VERTICES` / `MAX_GPU_MORPH_TARGETS` exports, and the hand-registered shader names (`aura3d/pbr`, `aura3d/pbr-textured`, `aura3d/instanced-pbr`, `aura3d/skinned-lit(-8)`, `aura3d/pbr-normal-map`). Each stays as a deprecated alias that resolves to generator features for one minor release.

## 8. Shader changes (GLSL level; WGSL via PRD 11)

### 8.1 Removed from every program
- `uniform float u_outputColorSpace;` and `a3dPbrEncodeOutput` (`ShaderLibraryCore.ts:588-593`, `ShaderLibrary.ts:406-411`, `:2466-2468`). The fragment output is `outColor = vec4(max(radiance, 0.0), alpha)`.
- All `step(0.5, u_*Enabled)` feature gates for textures, clustered lights, shadows and cube-vs-equirect. These become `#ifdef`.
- `a3dPbrEnvironmentSampleRaw`'s dual sampling: one sampler is declared, chosen by `ENVMAP_TYPE_CUBE_UV` or `ENVMAP_TYPE_EQUIRECT` (PRD 02 supplies the cube-UV lookup).
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
// PRD 02 owns the probe normalization of `irradiance` and `radiance`.
```

### 8.4 Lights loop
Compile-time unrolled loops per type (`#if NUM_DIR_LIGHTS > 0 ... #pragma unroll_loop` emulated by generating N copies in TypeScript). Light data is read from the `AuraLights` UBO (`std140` arrays sized by bucket). The clustered path keeps `u_clusterLightData` / `u_clusterLightIndices` textures but only under `#ifdef LIGHTS_CLUSTERED`. Falloff for point and spot lights uses the three.js r155+ physically based form `getDistanceAttenuation(d, cutoff, decay = 2)`. Exact intensity units and the `lights.point` default intensity are PRD 02's call; this PRD only removes the `max(d², 1)` clamp coupling inside the core.

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
This order (`world · instance · geometry`) fixes the benchmark 16 bug structurally: `size` is geometry-space and never scales instance translation.

Morph:
```glsl
#ifdef USE_MORPHTARGETS
uniform highp sampler2DArray u_morphTargets; // RGBA16F, layer = target*stride + attribute
uniform float u_morphWeights[MORPHTARGETS_BUCKET];
uniform int u_morphTextureWidth;
vec3 a3dMorphDelta(int target, int attribute) {
  int texel = gl_VertexID; ivec2 uv = ivec2(texel % u_morphTextureWidth, texel / u_morphTextureWidth);
  return texelFetch(u_morphTargets, ivec3(uv, target * MORPHTARGETS_STRIDE + attribute), 0).xyz;
}
#endif
// transformed += Σ w_i * a3dMorphDelta(i, 0); objectNormal += Σ w_i * a3dMorphDelta(i, 1) when MORPHNORMALS
```
Morph is applied before skinning, matching glTF.

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
Same vertex stage as forward (skinning, morph, instancing, geometry matrix). Fragment: `#ifdef ALPHA_MASK` samples base color alpha and discards below cutoff; otherwise empty, with depth written by the hardware. No color attachment is required. PRD 02 removes the RGBA8 dummy attachment (`ShadowPass.ts:165-171`) and switches to comparison samplers; this PRD provides the program.

## 9. Rendering changes (frame level)

1. **Frame order (root, every route):** update dirty world matrices → cull (light-frustum-aware caster lists: PRD 02) → upload `AuraFrame` and `AuraLights` UBOs → shadow passes (PRD 02) → clear HDR target to linear background color (no ACES pre-inversion) → environment background (PRD 02) → opaque (front-to-back, sorted by program and material) → transmission capture (PRD 04) → transmissive → transparent (alpha and premultiplied back-to-front; additive and multiply after alpha, no sort requirement) → MSAA resolve (color plus depth) → HDR post chain (PRD 03) → OutputPass → display-space passes (PRD 03) → canvas.
2. **HDR target format selection:** `rgba16f` if `EXT_color_buffer_float` or `EXT_color_buffer_half_float` permits rendering; else `r11f_g11f_b10f` if renderable (no alpha needed in the scene target); else `rgba8` plus degraded reporting. The capability probe result is cached per device.
3. **MSAA:** samples by tier (Low 0, Medium 4, High 4, Ultra 4), forced to 0 when TAA is on (current rule, `Renderer.ts:611`). The canvas context is created with `antialias: false`.
4. **Post contract:** every pass registered between resolve and OutputPass declares `space: "linear-hdr"` and reads and writes RGBA16F. Registration of a `space: "display"` pass before OutputPass throws at plan time. Every pass receives real near/far from `AuraFrame`. The CPU readback path (`Renderer.ts:993-1067`, `:1245-1275`) is removed from interactive rendering. A pass without a GPU implementation is rejected at plan time with `POSTPROCESS_PASS_NOT_GPU:<name>`; PRD 03 ports the remaining passes. This removes the 0.5-1.1 fps Deep Recovery path (`evidence/games/report.slim.json`).
5. **Game presets:** `createSideViewGameRenderPreset` / `createTopDownGameRenderPreset` stop setting `targetFormat: "rgba8"` (`GameRenderPreset.ts:373`, `:450`) and stop leaving tone mapping implicit. They inherit the app's `output` options. Aura Clash moves from Reinhard on RGBA8 to the default operator on RGBA16F.
6. **Lean entry:** `@aura3d/lean` builders produce the same `RenderSource` as the root bridge (lights, environment, camera position, rotation) and render through `Renderer`. The inert intents in `base.ts:250-260` are replaced by real nodes or removed (PRD 15 decides the surface; this PRD forbids a second render path).
7. **Silent fallback removal:** the `catch` at `index.ts:12545-12549` stops calling `createWebGLSceneRenderer`. It records `renderer-mount-failed` as in §6.1 rule 4: diagnostics error, `onRendererError`, dev overlay, and rejection of `ready()` only under `strictMount`. The `mode !== "production"` branch at `:12530-12531` is deleted along with the mode option.
8. **Static scenes:** unchanged single-frame behavior (`index.ts:12512-12521`), except the governor, DPR change and `setOutput` trigger a redraw.

## 10. Per-recommendation impact

Costs are estimates for the implementation described, measured against current code. "GPU" means per-frame GPU time at 1920×1080 backing on a mid integrated GPU; "CPU" means main-thread time per frame.

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Single renderer, no silent safe-basic, lean on core | Every route gets the same lit HDR image; no double-gamma washout on failure | 0 | 0 | −1 device instance | −30 to −45 KB (LeanWebGL2Device ≈4.5k lines, safe-basic ≈1.3k lines) | Lean starter grows (gets real lighting); budget renegotiated (PRD 15) | Explicit error overlay; no visual fallback |
| R2 | HDR end-to-end, tone map + encode last, all post linear | Correct bloom, AO and DOF energy; no 8-bit banding in fog gradients | +0.3-0.6 ms (RGBA16F ping-pong instead of RGBA8 for post) | 0 | +4 B/px per post buffer (RGBA16F 8 B vs RGBA8 4 B): ≈+16.6 MB at 1080p for two ping-pong buffers | +2 KB | Bandwidth heavy: Low tier uses R11G11B10F and halves post resolution (PRD 03) | `rgba8` degraded path with tone map in last forward subpass, reported |
| R3 | Feature-keyed program generator | Removes drift; enables specular AA and IOR on every material, skinned included | −0.1 to −0.5 ms (no unused samplers or branches, unrolled light loops) | −0.2 ms per 200 draws (no runtime variant lookup); first-frame compile moved to warm-up | +program count (bounded by light buckets) | −15 to −25 KB (one PBR source instead of 6 copies) | Fewer instructions per fragment; important on tile GPUs | Unknown feature combination → nearest-superset program, with warning |
| R4 | Scene-graph matrix composition | Rotated and scaled sub-assemblies become possible; Courier Rush city spreads correctly | 0 | −0.1 ms (cached world matrices vs per-frame rebuild) | +64 B per node | +3 KB | None | Shear → TRS approximation for physics, flagged |
| R5 | Primitive tessellation, real capsule, caps, UVs and tangents | Removes faceting (benchmarks 01, 13, 06), cylinder caps (01, 02), capsule limbs | +vertex cost: sphere 221 → 2,145 verts; at 685 primitive calls (research/06 §4) with shared geometry this is <0.2 ms on desktop | Mount-time generation, cached | Shared geometry per param set: <2 MB typical | +2 KB | Low tier halves segments | Explicit `tessellation` overrides |
| R6 | DPR default `min(dpr, tierMax)` plus governor | 2-4× shaded pixels on HiDPI; the largest single sharpness gain (research/05 §0) | ×2.25-4 fill cost at DPR 1.5-2; governor caps | +0.05 ms governor | Targets scale with pixels (see §15 budgets) | +2 KB | Low tier caps DPR 1; governor floor | `pixelRatio` override; `dynamic: true` |
| R7 | Exposure wired; real AgX and Khronos Neutral | Authored exposure works; color-faithful operators for product and UI scenes | 0 (same pass) | 0 | 0 | +1.5 KB | None | ACES default |
| R8 | Ambient 1/π, no hemi fake | Restores form shading; shadowed sides stop lifting (benchmark 01: 95,2,7 vs 54,1,2) | 0 | 0 | 0 | 0 | None | Games retuned by PRD 14; no legacy flag |
| R9 | Remove fudges; IOR-driven F0; specular AA; direct multiscatter | Rough metals keep energy; glossy props stop sparkling; IOR materials correct | +0.05-0.1 ms (derivatives, two LUT fetches per light) | 0 | DFG LUT 16×16 RG16F = 1 KB (replaces the RGBA8 approximation) | ±0 | Derivatives are cheap; LUT already exists | `specularAntialiasing: false` per material |
| R10 | Morph textures, persistent instance VBOs, zero per-draw allocation | Enables real faces, crowds, foliage at budget | Morph: +1 texelFetch per target per vertex | −1 to −4 ms on the runner at 200-400 draws (removes Map, pipeline and buffer churn and the VAO leak) | Morph texture: verts × targets × 8 B per attribute | +3 KB | Main win on mobile CPUs | CPU morph only in mock device |
| R11 | Instancing size bug fix | Benchmark 16 renders the authored field (71% coverage vs 8.7%) | 0 | 0 | 0 | 0 | None | None needed |
| R12 | Blend modes engine-wide | Additive glow, beams and sparks add light; premultiplied sprites without fringes | 0 | 0 | 0 | +1 KB | None | `alpha` |
| R13 | `preserveDrawingBuffer: false`, canvas `antialias: false` | Indirect: frees bandwidth for DPR | −0.2 to −1 ms on tile GPUs (no buffer preservation copy, no unused canvas MSAA) | 0 | −canvas MSAA storage (1080p 4×: ≈33 MB color + ≈33 MB depth-stencil) | 0 | Significant on Apple and mobile tilers | `app.capture()` for evidence |
| R14 | Color parser | No silent near-black from `#f80`, `"orange"`, `rgb()` | 0 | 0 | 0 | +1.5 KB (named color table) | None | Throws on invalid input instead of guessing |
| R15 | Async program compile and warm-up | No mid-game hitch when first VFX, skinned or toon material appears | 0 | Moves 50-300 ms of driver compile to load | 0 | +1 KB | Critical on mobile drivers | Synchronous compile when extension absent |

## 11. Migration plan

1. **Feature flag:** `renderer.core: "v2"` (internal, default off) gates the new path during Phases 1-5. The harness runs both paths side by side in `benchmarks/quality-rebuild` (`aura3d` adapter gains a `?core=v2` query switch). The flag is deleted in Phase 7; there is no permanent dual path.
2. **Engine bridge first:** `createProductionRuntimeRendererInput` and primitive and instance construction move to the new scene graph and geometry module behind the flag. The output is still a `RenderSource`, so `Renderer` changes can land independently.
3. **Shader cutover by material class:** `PBRMaterial` → `InstancedPBRMaterial` → `TexturedPBRMaterial` → `NormalMappedPBRMaterial` → `SkinnedLitMaterial`. Each switches `shaderKey` to `programFeatures()`. Each step must keep the benchmark scenes it touches at or above the v1 vision score before the next starts.
4. **App overrides (PRD 14 executes, this PRD provides the codemod `tools/quality-rebuild-codemods/core-v2.ts`):**
   - Delete `pixelRatio:` overrides that are ≤ 1: Skyline Runner 0.7 (`main.ts:1879`) and Data Galaxy 1 (`showcase-data-galaxy/src/main.ts:159`). Turbo Drift's `pixelRatio: 1` (`main.ts:2988`) and Rooftop Buckets' capture branch (`main.ts:738`) are capture-mode-only. Replace them with `renderer.resolution.maxPixelRatio: 1` inside the same capture condition, so CI capture cost is unchanged and gameplay gets device DPR. Convert `Math.min(x, window.devicePixelRatio || 1)` patterns (asset-audition 1.35, cinematic-architecture 1.45, digital-twin-ops 1.35, material-asset-inspector 1.5, product-configurator 1.5, webgpu-particle-lab 1.2, rooftop-buckets 1.75) to `renderer.resolution.maxPixelRatio: x`.
   - Rewrite `effects.colorGrade({ exposure })` unchanged; it now works. Flag any value outside [0.5, 2] for review.
   - Rewrite `lights.ambient(intensity)`: no automatic ×π. The codemod emits a review list per game with the old and new effective irradiance; tuning happens with PRD 02's IBL fix so ambient stops being the primary fill.
   - Replace `qualityProfile: "production"` with `quality: "high"`, and `"safe-basic"` with nothing (default `"auto"`).
   - Remove `renderer: { mode: "safe-basic" }` from `apps/showcase-pulse-tunnel/art-review/*.ts`. More broadly, `git grep -l "safe-basic" -- apps tools tests templates packages ':!*.json'` returned 91 files at audit commit `c08d8acb`: 43 in `tests/browser`, 15 Pulse Tunnel art-review scripts, `packages/create-aura3d/src`, `apps/showcase-vault-breakers/src` and `scripts`, the `write-route-health.mjs` scripts, and several `tools/`. Each is classified as "selects the mode" (migrate or delete), "asserts the fallback warning string" (rewrite to assert `renderer-mount-failed` absence), or "documentation" (update). The codemod emits that list. Phase 7 exit requires the grep to return only migration-error tests.
   - Group transforms: rerun visual capture for Courier Rush and Material Asset Inspector. The scaled groups will now spread and may need their child offsets re-authored, because they were tuned against the broken composition.
5. **Evidence tooling:** `tools/quality-rebuild-capture/capture-games.mjs` and `benchmarks/quality-rebuild/capture.mjs` already capture through Playwright `page.screenshot` (§2.10a), so they need no readback change. They gain `renderer: { strictMount: true }` and record `diagnostics()` fields (§16.2). The 226 canvas-readback files (§2.10a) are triaged in Phase 2:
   - (a) code that reads a canvas it renders itself (non-root): unaffected;
   - (b) code that reads the root `createAuraApp` canvas after the frame: migrate to `app.capture()`;
   - (c) third-party or unmigratable code: temporarily set `renderer.debug.preserveDrawingBuffer: true` with a tracking comment.

   The three template `screenshot.spec.ts` files are migrated in this PRD, because templates ship to users.
6. **Deletion pass (Phase 7):** remove the files in §5 "Delete", deprecated aliases older than one minor release, and the `renderer.core` flag.

## 12. Backward compatibility

| Change | Old behavior | New behavior | Compat mechanism | Breaks |
|---|---|---|---|---|
| `renderer.mode`, `renderer.fallback` | `"safe-basic"` selected the raw-GL renderer | Removed | Throws `AuraMigrationError` with a fix hint | 91 in-repo files reference `safe-basic` (§11 item 4): Pulse Tunnel art-review scripts, `create-aura3d`, Vault Breakers, route-health scripts, 43 browser specs. All are migrated in this PRD |
| Mount failure | Silent safe-basic image plus a warning string | No image; `diagnostics().errors` `renderer-mount-failed`, `onRendererError`, dev overlay | `ready()` still resolves (existing contract); `strictMount: true` rejects | Pages that "worked" only through the fallback now show the error (intended) |
| Canvas `alpha` | Default (true) | `alpha: false` | None | Apps relying on a transparent canvas over page content: check with `git grep -n "background(\"transparent\|alpha: true" -- apps templates` in Phase 2; none known |
| `qualityProfile` | Set DPR 1 / 1.5 | Mapped to `quality` tier | Deprecated alias for one minor | No |
| Default DPR | 1 | `min(dpr, tierMax)` | `pixelRatio` still wins | Performance profile of 13-14 games changes; governor mitigates |
| `RenderState.blend: boolean` | `true` = alpha | `BlendMode` | `true` → `"alpha"`, `false` → `"opaque"` with dev warning for one minor | Custom materials outside the repo: none known |
| Group transform composition | Additive | Matrix | None. This is a bug fix; translation-only groups are identical | Courier Rush and Material Asset Inspector layouts (intended) |
| Euler order | Implicit Rz·Ry·Rx | Explicit `"ZYX"` default | Same matrix | No |
| Primitive tessellation | 16×12 sphere, 24-seg cylinder | 64×32 / 48 | `tessellation` option to request the old counts | Silhouette changes (intended) |
| Capsule | Sphere | Real capsule | None | Engine rigs whose "limbs" relied on scaled spheres look different; PRD 06 re-authors |
| Instancing with `size` | Positions scaled by size | Positions in world units | None (bug fix) | Any app that pre-divided positions by size (none found in `apps/`; to verify with `rg "instances\." apps`) |
| Ambient units | π× three | three-equivalent | None | Every ambient-heavy game gets darker fill; retuned with PRD 02 in PRD 14 |
| Exposure | Ignored | Applied | None | Games authored 1.02-1.06 (16 games, research/19 C12): +2-6% brightness |
| Tone curve on lean / no-post paths | Narkowicz in shader | OutputPass operator | None | Lean starters look different (intended) |
| Aura Clash tone map | Reinhard on RGBA8 | Default operator on RGBA16F | None | Re-review Aura Clash (PRD 14) |
| Background | ACES-inverted clear | Tone-mapped linear background | `background(color, { toneMapped: false })` reproduces "authored sRGB shows exactly" | Games choosing near-black backgrounds see little change |
| Color strings | Invalid → silent navy | Parsed or throws | `parseAuraColor` accepts all CSS forms | Apps that relied on the silent fallback get an exception (desired) |
| `preserveDrawingBuffer` | Always true | False | `app.capture()`; `renderer.debug.preserveDrawingBuffer: true` for one minor | 226 in-repo readback files (§2.10a) triaged in Phase 2, including the three template `screenshot.spec.ts`. External tools calling `canvas.toDataURL()` on the root canvas after the frame get blank data. Playwright `page.screenshot` is unaffected |
| `AuraPerformanceQuality.resolutionScale` | Resized the canvas backing store (whole frame, including output) | Caps the scene-target `renderScale`; output stays at backing resolution | Same field and range | UI and output passes get sharper at the same scale (intended) |
| `createPerformanceGovernor` | Own `RESOLUTION_STEPS` [1, 0.85, 0.7, 0.5] | Resolution step delegated to `ResolutionGovernor` | Same API and settings shape | Game apps see 0.1 steps with hysteresis instead of 4 coarse steps |

## 13. Dependencies on other PRDs

- **PRD 02 (Lighting / IBL / Reflections / Shadows):** consumes the generator's `shadows`, `environment` and `lights` features and the `pass: "depth"` program. It owns the ambient-kills-IBL fix (`index.ts:12693-12707`; affects 15 of 18 games per research/19 C1, with Aura Clash avoiding it via its own render source), HDR default environment, PMREM, shadow strength and CSM. PRD 01 Phase 3 (generator) must land before PRD 02 shadow-variant work. The ambient 1/π change (R8) ships in the same release as PRD 02's default IBL so games are not left darker with no fill.
- **PRD 03 (Postprocessing / AA / Tone Mapping / Cinematic):** implements HDR-space kernels (bloom, GTAO, SSR, TAA, DOF), display-space AA and grade under the §6.5 and §9 item 4 contracts. Tone-mapping operators live in PRD 01's OutputPass; PRD 03 must not add another. Blocked by PRD 01 Phase 4.
- **PRD 04 (Materials / Textures / glTF Fidelity):** implements KHR extension lobes on top of the `brdf` chunk and the `extensions` feature array; owns tint semantics, samplers, KTX2 sRGB formats, MikkTSpace and transmission. Blocked by PRD 01 Phase 3.
- **PRD 05 (Asset Pipeline):** none blocking. Benefits from correct primitives and blend modes for kit assets.
- **PRD 06 (Animation / Characters):** depends on morph textures (Phase 6) and skinned programs from the generator (Phase 3); re-authors capsule-limb rigs (`index.ts:6562-6572`, `:8648-8661`).
- **PRD 07 (VFX / Particles):** depends on blend modes (Phase 2) and HDR additive accumulation.
- **PRD 08 (Camera / Controls / Game Feel):** depends on the scene graph's world-space `lookAt` (Phase 1).
- **PRD 09 (Shared Game Runtime):** game kits migrate to scene-graph groups once rotation composes correctly.
- **PRD 10 (World Building):** depends on the scene graph, primitive tessellation and the `fog` feature slot.
- **PRD 11 (WebGPU / GPU Architecture / Performance Tiers):** defines tier semantics consumed by `quality`; implements the WGSL target of the generator and the WebGPU device's conformance to `RenderState` / `BlendMode`. PRD 01 must keep the generator backend-neutral.
- **PRD 12 (Visual Benchmark + Regression):** hosts the new benchmark scenes in §17 and region-scoped metrics; runs the A/B for the tone-map default.
- **PRD 13 (Agent Authoring / Skills):** updates skills to `quality`, `output`, `tessellation`, `blend`; removes guidance to set `pixelRatio < 1` and to add `lights.ambient()` as the default fix (`index.ts:18256` lint message, jointly with PRD 02).
- **PRD 14 (18-Game Rebuild):** executes the app migrations in §11 item 4 and the final per-game visual sign-off.
- **PRD 15 (API / Package Consolidation):** owns the public surface removals, the `@aura3d/lean` decision and bundle budget renegotiation once `LeanWebGL2Device` is gone.

## 14. Implementation phases

Each phase merges behind `renderer.core: "v2"` unless noted. "Capture" means the `.github/workflows/quality-rebuild-capture.yml` workflow (both jobs: 18-game capture and the 18+ scene three.js benchmark) on macos-14, run remotely per policy. No phase exits on unit tests alone.

**Phase 0: Harness prerequisites (with PRD 12). About 1 week.**
Add benchmark scenes 19-24 (§17.1), subject-region metrics, `app.capture()`, the `?core=v2` adapter switch, and an Aura-side draw/allocation/compile counter dump in `report.json`.
Exit: the capture workflow runs green on `core=v1` and records baseline vision scores for scenes 01-24 and the 18 games. Baselines are committed under `docs/project/aura3d-quality-rebuild/evidence/baseline-v1/`.

**Phase 1: Scene graph, primitives, instancing fix, color parser (not flagged; pure bug fixes). About 1.5 weeks.**
Exit:
- Unit tests in §16.1 for composition, primitives, instancing and color pass.
- Benchmark 16 Aura subject coverage is within ±5% (relative) of three's mask coverage.
- Benchmark 01 and 02 object-mask IoU vs three is ≥ 0.97, so the cylinder cap and plinth top are present.
- Benchmark 13 sphere silhouette faceting is gone: the max radial deviation of the silhouette from a fitted circle is ≤ 0.5 px at 1280×720.
- Courier Rush and Material Asset Inspector are re-captured and reviewed by a human for intended layout.

**Phase 2: RenderState blend modes, canvas context, DPR and governor. About 1.5 weeks.**
Exit:
- Scene 21 (blend modes) MAD ≤ 2/255 vs three.
- `preserveDrawingBuffer` and canvas `antialias` are false on every route. `app.capture()` with `preserveDrawingBuffer: false` reproduces the Phase 0 scene 01 image (MAD ≤ 1/255).
- The §2.10a readback triage is committed (`docs/project/aura3d-quality-rebuild/evidence/prd-01/phase-2/readback-triage.md`, one row per file with class a/b/c). Every class (b) file is migrated. The three template screenshot specs and the full `pnpm test:browser` set pass remotely with no `renderer.debug.preserveDrawingBuffer` except in class (c) files.
- The 18 games run at device DPR, verified by `diagnostics().resolution.pixelRatio` in the capture workflow at `deviceScaleFactor: 2`. The benchmark harness passes an explicit `pixelRatio` (`common.ts:292`), so it does not measure this. Runner FPS is recorded, and no game drops below 50% of its v1 runner FPS with the governor on.
- `diagnostics().resolution` reports the actual backing size.

**Phase 3: Program generator and PBR core. About 4 weeks.**
Prerequisite inside the phase: `resources/UniformBlock.ts` and the `AuraFrame` / `AuraLights` UBOs land first (moved here from Phase 6), because the generated light loop (§8.4) reads `AuraLights`.
Order: `UniformBlock`, `PBRMaterial`, then `InstancedPBRMaterial`, then `TexturedPBRMaterial` (all variants), then `NormalMappedPBRMaterial`, then `SkinnedLitMaterial` (4/8, uniform/texture palette), then depth programs.
Exit:
- No hand-registered lit program is reachable from the root bridge (`diagnostics().programs.keys` contains only generator keys).
- The fudge grep (§16.1 "shader lint") is clean.
- Benchmarks 01, 06, 11 and 13 vision scores are ≥ v1 baseline + 0.5 and no scene regresses by more than 0.5.
- Scene 22 (specular AA) temporal flicker metric is ≤ 50% of v1.
- Benchmark 01 shadow-side face color: red box dark face within ΔE2000 ≤ 5 of three's (54,1,2) in the same lighting. PRD 02 shadow strength is not required for this face, which is shaded by ambient alone.

**Phase 4: HDR end-to-end and OutputPass. About 2 weeks.**
Exit:
- Every route reaches the canvas through OutputPass, including lean, no-effects and Aura Clash.
- `u_outputColorSpace` and the Narkowicz curve are absent from all generated sources.
- Scene 20 (tone-map ramp) per-swatch ΔE2000 ≤ 2 vs three for `aces`, `agx` and `neutral` at exposures 0.5, 1 and 2.
- The post plan rejects display-space passes before OutputPass.
- The CPU readback chain is gone from interactive rendering. Deep Recovery runner FPS ≥ 10× its v1 value; PRD 03 provides the GPU volumetric replacement, and until then the pass is rejected with a visible warning.
- `effects.colorGrade({ exposure })` changes pixels by the expected factor (unit and browser test).

**Phase 5: Tone-map default A/B and game re-capture. About 1 week.**
Exit: a written decision record (`docs/project/aura3d-quality-rebuild/decisions/tonemap-default.md`) with vision and human scores for ACES vs AgX on all 18 games and scenes 01-18. The default is changed only if no game drops in any visual category.

**Phase 6: Submission performance. About 3 weeks.**
UBO-dependent cleanup (packet pool, pipeline cache, uniform cache, persistent instance buffers, VAO eviction, morph textures, static batching at mount) and the 18-game zero-compile assertion. The UBOs themselves and `ProgramWarmup` land in Phase 3.
Exit:
- Scene 24 steady-state frame: zero GL object creation and JS heap delta ≤ 16 KB/frame averaged over 600 frames.
- CPU submit time for scene 24 ≤ 40% of v1 on the runner.
- Zero program compiles after `app.ready` during a 60 s scripted play session for each of the 18 games.
- A morph target with more than 64 vertices renders on GPU (unit plus browser test).

**Phase 7: Deletion and flag removal. About 1 week.**
Exit:
- The §5 "Delete" list is removed. `rg "LeanWebGL2Device|createWebGLSceneRenderer|u_outputColorSpace|preserveDrawingBuffer: true|mix\(1\.1, 0\.65" packages/` returns nothing.
- Two consecutive green capture runs on main with v2 as the only path.
- Engine root gzip ≤ 535,343 B (`BUNDLE_SIZES.md`).

## 15. Task checklist

### Phase 0
- [ ] `benchmarks/quality-rebuild/shared/scenes.ts`: add scene specs `19-scene-graph-hierarchy`, `20-tonemap-exposure-ramp`, `21-blend-modes`, `22-specular-aa`, `23-primitive-catalog`, `24-draw-throughput` exactly as specified in §17.1. Add both engine adapters in `benchmarks/quality-rebuild/aura3d/` and `three/`. Test: `capture.mjs` produces both PNGs for each scene in the remote workflow.
- [ ] `benchmarks/quality-rebuild/capture.mjs`: add subject-mask metrics (mask from non-background pixels in the three image), mask IoU, per-region SSIM, and `ΔE2000` per named swatch region. Write them to `report.json` under `scenes[].regions`. Test: unit test with two synthetic PNGs in `tests/unit/tools/quality-rebuild-metrics.test.ts`.
- [ ] `packages/engine/src/agent-api/index.ts`: add `AuraApp.capture()`. In Phase 0 it calls the existing render path and runs `gl.readPixels` on the default framebuffer in the same task, before the browser composites, so it works without `preserveDrawingBuffer`. It flips rows and resolves an `ImageBitmap` or PNG `Blob`. Phase 4 re-points it at the OutputPass result; the signature is unchanged. Test: `tests/browser/app-capture.spec.ts` renders benchmark scene 01 on v1 with `preserveDrawingBuffer: true` and checks that `capture()` matches `canvas.toDataURL()` (MAD ≤ 1/255). It is rerun in Phase 2 with `preserveDrawingBuffer: false`, where `capture()` must still match the Phase 0 image (MAD ≤ 1/255).
- [ ] `benchmarks/quality-rebuild/aura3d/common.ts`: read `?core=v1|v2` and pass `renderer: { core }`. Record `diagnostics().programs`, `frameAllocations` and `resolution` into `payload.extra`.
- [ ] Commit baseline captures and vision scores to `docs/project/aura3d-quality-rebuild/evidence/baseline-v1/` (images plus `scores.json`).

### Phase 1: Scene graph
- [ ] Create `packages/engine/src/agent-api/sceneGraph.ts` with `composeWorldMatrix(parent: Float32Array, local: AuraTransformSpec, out: Float32Array): Float32Array`, `decomposeMatrix(m): AuraWorldTransform`, and `eulerToQuaternion(euler, order)` for all six orders. Implement column-major math locally in this file and write into caller-supplied outputs. Do not import `@aura3d/math`: the engine has no dependency on it, and its `Euler` supports only `"XYZ"` (§2.2). Unit tests may import `three` from `node_modules` as a reference; `check:no-three-runtime` scans package runtime code, not `tests/`.
- [ ] Replace `composeAuraTransform` / `applyAuraParentTransform` / `flattenSceneNodes` (`index.ts:17960-18006`) with matrix composition. Each flattened node carries `world: AuraWorldTransform`, and its `position` / `rotation` / `scale` fields are overwritten with the decomposed world TRS (for legacy consumers) when `sheared === false`. Test: `tests/unit/agent-api/scene-graph-composition.test.ts` covers (a) rotated parent [0, π/2, 0] with child at [1,0,0] gives world [0,0,−1]; (b) parent scale 6 with child at [1,0,0] gives world position [6,0,0]; (c) translation-only groups give results identical to v1; (d) a three-level nest matches a three.js `Object3D` hierarchy built in the test (import `three` from `node_modules`) to 1e-5; (e) shear detection flags parent non-uniform scale with a rotated child.
- [ ] `createModelMatrix` (`index.ts:17766`): accept a precomputed world matrix and apply `S(size ⊙ fit) · normalizeOffset` innermost. Remove per-call `Float32Array` allocations by writing into a caller-supplied output. Test: existing single-node matrices unchanged (snapshot of 50 random TRS nodes).
- [ ] `lookAt`: resolve after composition using world position. Test: a child with `lookAt` inside a rotated group faces the world target (angle error < 1e-4 rad).
- [ ] Physics population (`index.ts:5183`, `:5192`) consumes `world` TRS. Test: a body inside a scaled group gets the scaled world position (`tests/unit/physics/scene-graph-bodies.test.ts`).
- [ ] Runtime node handles bump a per-node version. World matrices are cached and recomputed only on version change. Test: 1,000-node static scene computes 1,000 matrices on frame 1 and 0 on frame 2 (counter exposed in dev diagnostics).
- [ ] Add `rotationOrder` and `quaternion` to `AuraTransformSpec` and builder methods `.rotate(x, y, z, order?)` and `.quaternion(x, y, z, w)`. Test: `"ZYX"` default reproduces the v1 `rotationXYZ` matrix for 100 random Eulers.

### Phase 1: Primitives
- [ ] `packages/rendering/src/Geometry.ts`: extend `cylinder` with `radiusTop`, `radiusBottom` and `heightSegments`; extend `litPlane` with segments; add `torus` and `box`; add capsule `ellipticity`. Default `textured: true` when called from the engine. Test: `tests/unit/rendering/geometry-primitives.test.ts` asserts, for every primitive, that every triangle's geometric normal agrees with the averaged vertex normal (dot > 0); indices are in range; UVs are in [0,1]; tangents are orthogonal to normals (|dot| < 1e-4); w = ±1; bounds match spec.
- [ ] `index.ts:14977` `createProductionPrimitiveMesh`: route to the `Geometry` generators with `AuraPrimitiveOptions.tessellation` and tier defaults. Delete `createSphereGeometry`, `createCylinderGeometry`, `createTorusGeometry`, `createCapsuleApproxGeometry` and `createPlaneGeometry` (`index.ts:17287-17479`). Test: browser test `tests/browser/primitive-catalog.spec.ts` renders scene 23 on both engines. A missing cap shows the ground or the inner back wall, which may be brighter than the side, so a luma comparison alone could pass with the cap absent. The test therefore asserts: (1) the cap-region object-mask IoU vs three is ≥ 0.97, with the mask taken from a flat-ID render (unlit, per-object color); (2) the cap-region mean linear luma is within ±10% of three's; (3) the cap-region pixel-normal estimate (finite differences of the depth buffer) is within 10° of +Y.
- [ ] Capsule: fold `size ⊙ localScale` into generation as in §6.3, with a geometry cache keyed by quantized aspect. Test: capsule at size [0.2, 1, 0.2] has a silhouette whose top and bottom are hemispheres of radius 0.1 (vertex check) and whose straight section is 0.8 long.
- [ ] Geometry sharing: a `Map<string, Geometry>` keyed by primitive and params, owned by the scene renderer and disposed with it. Test: 685 boxes produce 1 geometry upload.
- [ ] Physics capsule shape (`index.ts:5380`) uses the same radius and height derivation as rendering. Test: collider dimensions equal rendered dimensions.

### Phase 1: Instancing fix
- [ ] `createProductionInstanceTransforms` (`index.ts:14747`): instance matrix = `T_i · R_i · S_i`. The item's `modelMatrix` is the node world matrix without `size`. The new uniform `u_geometryMatrix = S(size)` is applied innermost. Remove the per-frame rebuild: compute once and recompute only when `instances` change (version). Test: unit test on a 3×3 grid with `size: 0.3` and spacing 1 gives world instance centers at spacing 1. Browser test: scene 16 mask coverage within ±5% of three's.
- [ ] Non-uniform `size` with rotated instances does not shear. Test: instance rotated 45° about Y with size [0.3, 0.6, 0.3] has orthogonal world axes (dot < 1e-5).

### Phase 1: Color parser
- [ ] Create `packages/engine/src/agent-api/color.ts` with `parseAuraColor` supporting `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` (comma and space syntax), `hsl()/hsla()`, the 148 CSS named colors, and numbers `0xRRGGBB`. Convert sRGB to linear with the exact piecewise transfer, and also export `parseAuraColorSrgb` (no transfer) for display-space consumers. Throw `AuraColorParseError` with the input string. Replace the bodies of the engine helpers `colorToRgba` (`index.ts:15378`), `colorToClearColor` (`:15383`), `colorToLinearClearColor` (`:15391`), `colorToLinearRgba` (`:15396`), `colorToLinearRgb` (`:15443`), `colorToRgb` (`:17911`) and `LayeredSceneComposition.ts:648` `parseHexColor` with calls into `color.ts`. Each helper keeps its current output space (sRGB helpers call `parseAuraColorSrgb`; `Linear` helpers call `parseAuraColor`), so no call site changes color space in this task. Then route the remaining hex parsers found by `git grep -nE "parseInt\(.*16\)" -- 'packages/*/src/*.ts'` the same way: `index.ts:18709` and `:18722`, `packages/lean/src/base.ts:504`, `packages/rendering/src/AtmosphereWetness.ts:119` and `WaterSurface.ts:188`. The rendering-package helpers move to `@aura3d/rendering` `ColorManagement.ts`, which `color.ts` re-uses so the engine has one implementation. The template copy `packages/create-aura3d/templates/animation-studio/studio/src/state/util.ts:38` is user code and is left alone. Test: `tests/unit/agent-api/color-parser.test.ts` is a table test of 40 inputs (every syntax, the named colors `orange` and `rebeccapurple`, `#f80`, `0xff8800`, and invalid strings throwing). A regression test checks that the 7 helpers return the same values as v1 for 20 valid `#rrggbb` inputs.

### Phase 2: Blend modes
- [ ] `packages/rendering/src/Material.ts:32-42` (`RenderState`, `DEFAULT_RENDER_STATE` `blend: "opaque"`, `validateRenderState`) and `RenderDevice.ts:135-161` (`RenderCommandState`): change `blend` to `BlendMode`, `depthCompare` to the full set, and add `renderStateKey()`. Map `true`/`false` with a dev warning. Test: `tests/unit/rendering/render-state-key.test.ts` checks that every built-in mode and 20 random custom states produce distinct keys, and that `true` maps to `"alpha"` with one warning.
- [ ] `WebGL2Device.ts:4402-4405`: implement modes via `blendEquationSeparate` / `blendFuncSeparate` and the depth function. Add dedupe in `WebGL2StateCache.ts`. Test: `tests/browser/blend-modes.spec.ts` renders scene 21 and checks per-mode pixel values against analytically computed expectations (±1/255).
- [ ] `ForwardPass.ts`: queue classification by blend mode (§6.8); additive and multiply render after alpha. Test: unit test of the sort order with 6 items.
- [ ] Engine: `AuraMaterialSpec.blend` reaches `renderState.blend` in `createProductionPrimitiveMaterial` (`index.ts:14899-14903`, `:14930-14934`) and in GLB materials (`packages/assets/src/GLTFRenderResources.ts` alpha mode). Particles `materialMode: "additive-glow"` (`index.ts:3707`) maps to `"additive"`; PRD 07 renders the particles. Test: `tests/unit/agent-api/material-blend.test.ts` checks that `material.pbr({ color: "#ffffff", blend: "additive" })` on a primitive produces `renderState.blend === "additive"` and `depthWrite === false`, that `opacity: 0.5` with no `blend` produces `"alpha"`, and that a glTF `alphaMode: "BLEND"` material produces `"alpha"`.
- [ ] `SpriteFlipbook.ts:119`, `:153`: `additive: true` sets `blend: "additive"` on the produced material. Test: unit test.
- [ ] WebGPU device: map `BlendMode` in pipeline creation (`WebGPUDevice.ts:1838-1845`) so the contract holds on both backends. Visual parity is PRD 11's job. Test: pipeline descriptor unit test.

### Phase 2: Canvas, DPR, governor
- [ ] `index.ts:13586-13597` and `ProductionRuntimeRenderer.create`: `antialias: false`, `preserveDrawingBuffer: false`, `powerPreference: "high-performance"`. Remove `preserveDrawingBuffer` from the profile table (`:4232-4302`). Test: `tests/unit/agent-api/renderer-context-options.test.ts` asserts the context attributes passed to `getContext`.
- [ ] `configureCanvas` (`index.ts:11133`, `:12280`, `:12294-12310`): resolve `options.pixelRatio ?? renderer.resolution.pixelRatio ?? min(devicePixelRatio, tier.maxPixelRatio)`. Remove the `min(2, ...)` clamp in `devicePixelRatioSafe` (`:18700`). Subscribe to `matchMedia` resolution changes and re-size. Delete profile `pixelRatio`. Test: unit test with mocked `devicePixelRatio` 1, 2 and 3 and every tier (Ultra at DPR 3 gives 3); browser test with `deviceScaleFactor: 2` asserts the backing store is 2× CSS.
- [ ] Create `packages/rendering/src/ResolutionGovernor.ts` (§6.9) and wire it into the root frame loop, using `RendererTiming` GPU time when available. It changes only the scene target size; OutputPass upscales. Rewire `createPerformanceGovernor` (`GameRenderPreset.ts:158`) so its resolution step calls `ResolutionGovernor`, and delete `RESOLUTION_STEPS` (`:130`). Change `setPerformanceQuality` (`index.ts:12455-12465`) so `resolutionScale` sets the scene-target ceiling instead of resizing the canvas. Test: unit test feeding synthetic frame times verifies step-down after 30 slow frames, step-up after 120 fast frames, and the floor at `1/devicePixelRatio`. `tests/unit/agent-api-root-performance-quality.test.ts` is updated: canvas backing size is unchanged after `setPerformanceQuality({ resolutionScale: 0.5 })`, and `diagnostics().resolution.renderScale === 0.5`.
- [ ] Readback triage: run `git grep -l "toDataURL\|readPixels\|toBlob(" -- tools tests apps templates 'packages/*/src'` and classify every hit as (a) own canvas, (b) root canvas after frame, or (c) unmigratable (§11 item 5). Migrate (b) to `app.capture()`, including `templates/{mini-game,product-viewer,cinematic-scene}/tests/screenshot.spec.ts`, and mark (c) with `renderer.debug.preserveDrawingBuffer: true`. Commit the triage table (Phase 2 exit). Test: `pnpm test:templates` and `pnpm test:browser`, both remote.
- [ ] Remove `showcase-skyline-runner` `pixelRatio: 0.7` (`main.ts:1879`). Replace Turbo Drift's capture-only `pixelRatio: 1` (`main.ts:2988`) with `renderer.resolution.maxPixelRatio: 1` in the same `visualCaptureCamera` branch, and correct the comment at `:2983-2986` to say gameplay gets `min(dpr, tier cap)`. Coordinate with PRD 14.

### Phase 3: Program generator
- [ ] `resources/UniformBlock.ts` (first task of the phase): std140 packer and `AuraFrame` / `AuraLights` UBOs, uploaded once per view or frame with `bufferSubData`. Test: unit std140 layout test against hand-computed offsets. This lands before the generator light loop, which reads `AuraLights`.
- [ ] Create `packages/rendering/src/program/ProgramFeatures.ts`, `ProgramKey.ts` and `ProgramGenerator.ts` as in §7.2. Chunks go in `program/chunks/{common,colorspace,brdf,lights_pars,lights_fragment,shadow_pars,ibl_pars,skinning,morph,instancing,normal,material,fog,depth}.glsl.ts`. Test: snapshot tests of generated source for 12 representative feature sets; key-uniqueness property test over 5,000 random feature records; a GLSL compile test of every snapshot in a real WebGL2 context (`tests/browser/program-generator-compile.spec.ts`).
- [ ] Create `program/ProgramCache.ts` with `KHR_parallel_shader_compile` support (`COMPLETION_STATUS_KHR` polling via `requestAnimationFrame`) and synchronous fallback. Test: browser test measures that `acquire` returns `pending` then `ready` without blocking the frame when the extension is present.
- [ ] Create `program/ProgramWarmup.ts`: walk the render source, collect feature records for every item × lights × shadow × env state, and `precompile`. `AuraApp.ready` awaits it. Test: after `ready`, rendering the first frame triggers 0 compiles (`programs.compiled` delta).
- [ ] `Material.ts`: add `programFeatures()`. Implement it for `PBRMaterial`, `InstancedPBRMaterial`, `TexturedPBRMaterial`, `NormalMappedPBRMaterial`, `SkinnedLitMaterial` and `UnlitMaterial` / `TexturedUnlitMaterial` / `InstancedUnlitMaterial`. Keep `shaderKey` for `PortableShaderMaterial` and custom materials.
- [ ] `ForwardPass.ts:681` `shaderCacheKey`: use `computeProgramKey` when `programFeatures` exists. Add a `UBO` binding for `AuraFrame` and `AuraLights`. Remove per-item light packing (`LightUniforms.pack` per draw).
- [ ] `brdf` chunk per §8.3: IOR F0, F90, Lambert default, Burley behind `DIFFUSE_BURLEY`, specular AA, a verbatim port of r185 `BRDF_GGX_Multiscatter`, and the r185 indirect dielectric/metallic split. Replace the approximate LUT in `BRDFLut.ts` with the r185 `DFGLUTData.js` 16×16 RG16F array (MIT header retained), sampled at `(roughness, dotNV)`, uploaded once per device and bound to every lit program. Tests in `tests/unit/rendering/brdf-reference.test.ts`, using a CPU mirror in `PbrReference.ts` (updated) and a CPU port of three's GLSL written in the test with the same LUT data and bilinear sampling:
  - (a) For 200 random (N, V, L, roughness, metallic, ior, specularIntensity) samples, the direct specular matches three r185 `BRDF_GGX_Multiscatter` and the diffuse matches `BRDF_Lambert(diffuseContribution)`, relative error < 1e-3.
  - (b) For 200 random samples, the indirect (diffuse plus specular) for unit `radiance` and `irradiance` matches r185 `RE_IndirectSpecular_Physical`, relative error < 1e-3.
  - (c) White-furnace directional albedo: for metal F0 = 1 and roughness 1, numerically integrate `a3dDirectSpecular · dotNL` over the hemisphere of L (Monte Carlo, 65,536 samples, fixed seed) at dotNV ∈ {0.2, 0.5, 1.0}. With multiscatter off, the result must be ≤ 0.80 and within ±0.02 of `dfg.x + dfg.y`, which proves the LUT and the single-scatter lobe agree. With it on, the result must recover at least half the missing energy (`E_ms ≥ E_ss + 0.5 · (1 − E_ss)`) and never exceed 1.02, so no energy is gained. The test also asserts `E_ms` matches the same integral of the three r185 CPU port within ±0.01.
- [ ] Ambient: `irradiance · BRDF_Lambert(diffuseColor)` with no hemisphere factor. Remove `environmentHemi` (`ShaderLibraryCore.ts:622-623`). Test: unit-level pixel test, a white Lambert plane with ambient 1 and no other light outputs linear radiance 1/π ± 1%.
- [ ] Shader lint (`tools/shader-lint/index.ts`, new, run in `pnpm test:unit`): fail if any generated or registered source contains `mix(1.1,`, `mix(1.0, 0.18`, `roughEnvironmentFloor`, `sourcePaint`, `materialRedPaintGate`, `a3dApplyAdvancedPbrLobes`, `a3dApplyMetalRough`, `u_outputColorSpace`, `2.51 * color`, or `step(0.5, u_` feature gates.
- [ ] Extension materials: material features `extensions` produce the base lobe only plus diagnostics warning `EXTENSION_LOBE_PENDING_PRD04:<name>`. PRD 04 replaces this. Test: unit test of the warning.
- [ ] Depth programs: `pass: "depth"` variants with skinning, instancing, morph and alpha-mask. Expose `DepthPass` usage behind PRD 02's switch. Test: depth program compile and a CPU raster check in `MockRenderDevice` that a skinned caster's depth uses the posed vertices.
- [ ] Remove `a3dPbrEnvironmentSampleRaw` dual sampling. Single env sampler by `ENVMAP_TYPE_*`. PRD 02 supplies cube-UV. Test: generated source contains exactly one env sampler declaration.
- [ ] Delete the hand registrations (`ShaderLibraryCore.ts:291-782` PBR body, `ShaderLibrary.ts` lit programs) once their material classes are migrated, keeping deprecated name aliases that map to features. Test: `rg "registerLeanPbrShader|aura3d/pbr-textured" packages/rendering/src` only finds the alias table.

### Phase 4: HDR and OutputPass
- [ ] Create `packages/rendering/src/output/OutputPass.ts` and `output/ToneMappingOperators.glsl.ts` with operators per §8.6. Port AgX and Neutral constants verbatim from `node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` (r185). Test: CPU mirror of each operator compared to three's JS-evaluated GLSL formulas on 1,000 inputs (abs error < 1e-4); browser scene 20 ΔE2000 ≤ 2.
- [ ] `Renderer.ts`: always render to the HDR target and finish with OutputPass, including when `postprocess` is absent. Remove the `outputColorSpace` option from `ForwardPass` (`Renderer.ts:674`). Test: browser test renders a single unlit quad with emissive 4.0 under `none`, `aces`, `agx` and `neutral`, asserting the expected 8-bit output ±1.
- [ ] HDR target format probe: `rgba16f` → `r11f_g11f_b10f` → `rgba8` (degraded). Diagnostics `output.targetFormat` and `degraded`. Test: unit test with mocked extension sets.
- [ ] Dither in OutputPass. Test (`output-pass.spec.ts`): render a horizontal linear-radiance ramp from 0.20 to 0.22 across 1,280 px with operator `none` and exposure 1. That is about 6 sRGB codes, so undithered runs are about 200 px wide. Assert: (1) with dither off, the longest run of identical 8-bit values in a row is ≥ 150 px, which proves the test can detect banding; (2) with dither on, the longest run is ≤ 16 px; (3) with dither on, the row mean of each 64-px block is within 0.5/255 of the ideal encoded value, which proves the dither is unbiased.
- [ ] Exposure: `createProductionRuntimePostprocess` (`index.ts:12898-12904`) sends `exposure = renderer.output.exposure × colorGrade.exposure` and the operator from `renderer.output.toneMapping`. Remove the `index.ts:4547` warning. Delete `sceneExposurePresets` and the overlay text (`:18657`); diagnostics report the sent exposure. Test: unit test and browser test, where exposure 2 doubles the linear pre-tonemap value (checked with operator `linear` at low input).
- [ ] Background: clear the HDR target with the linear background color and delete `colorToAcesInputClearColor` (`index.ts:15400-15418`). Add `scene().background(color, { toneMapped })` and the `backgroundCoverage` MRT (§6.5). Test (operator `aces`): (1) background `#336699` with `toneMapped: false` reads back as (51, 102, 153) ±1; (2) with `toneMapped: true` it equals the CPU ACES of linear(#336699), encoded, ±1; (3) with `toneMapped: false`, an additive emissive quad (linear 4.0, alpha 1) over the background reads back as `encode(ACES(linear(#336699) + 4.0))` ±1, not as the clamped sum. Check (3) would fail under depth-based background classification, which is why it exists.
- [ ] Post plan contract: `RendererPostprocessPlan.ts` tags each pass `space`, rejects display-space passes before OutputPass, and removes the CPU readback branch from `Renderer.ts:993-1067` and `:1245-1275` for interactive frames. Unknown non-GPU passes emit `POSTPROCESS_PASS_NOT_GPU`. Test: unit plan tests; Deep Recovery runner FPS check in the capture workflow.
- [ ] `GameRenderPreset.ts:373`, `:450`: drop `targetFormat: "rgba8"`; inherit `output`. Test: Aura Clash capture shows `output.targetFormat = rgba16f` and operator = app default.
- [ ] `@aura3d/lean` (`packages/lean/src/base.ts`, `product.ts`): submit lights, environment and camera position through the same `RenderSource` fields as the root bridge, and add rotation to `createAuraLeanModelMatrix` (`base.ts:521-523`). Route rendering through `Renderer` + OutputPass. Remove `LeanProductionRenderer` usage. Test: `templates/mini-game` and `templates/product-viewer` capture with a lit, shadowed, rotated model (browser test asserts a nonzero specular highlight region and a non-identity rotation).

### Phase 5: Tone-map default A/B
- [ ] Add `?toneMapping=aces|agx` to the game capture harness (`tools/quality-rebuild-capture/capture-games.mjs`), passing `renderer.output.toneMapping`, and to the benchmark adapter (`benchmarks/quality-rebuild/aura3d/common.ts`; three side `renderer.toneMapping`). Test: the capture `report.json` records `diagnostics().output.toneMapping` per run and matches the query.
- [ ] Run the capture workflow twice on the same commit (ACES and AgX) for all 18 games and scenes 01-18. Run the `research/21` rubric on the games and the `research/23` rubric on the scenes, with a human reviewer. Write `docs/project/aura3d-quality-rebuild/decisions/tonemap-default.md` with a table: game or scene, per-category scores for both operators, delta, and the reviewer verdict.
- [ ] If AgX wins with no category regression in any game, change `DEFAULT_TONE_MAPPING` in `output/OutputPass.ts` in a separate PR that links the record. Otherwise record "ACES retained" and close.

### Phase 6: Submission performance
- [ ] `ForwardPass.drawItem` (`ForwardPass.ts:249-351`): replace `new Map(binding.uniforms)` and `new RenderPipeline` per item with the packet pool and pipeline cache (§6.7). Add a per-program uniform last-value cache in `WebGL2Device.uploadUniforms` (`:3695-3740`). Test: dev counter shows 0 `RenderPipeline` constructions after frame 2 in scene 24; benchmark CPU ms recorded.
- [ ] `resources/InstanceBuffer.ts` and engine wiring: `instances.*` nodes own an `InstanceBuffer`. Delete the 64-instance uniform path (`ForwardPass.ts:1711-1736`, shader `u_instanceMatrices[64]` at `ShaderLibraryCore.ts:247`, `:309`). Test: scene 16 with 10,000 instances does 1 draw and 0 buffer creations after frame 1.
- [ ] `WebGL2Device` VAO eviction: on `RenderBuffer.dispose`, delete VAOs whose key contains that buffer id (`:4193-4236`) and remove the buffer from `this.buffers` (`:498`). Test: browser test creates and disposes 1,000 instance buffers and asserts the VAO map size returns to its baseline.
- [ ] `MorphTargetPlan.ts`: change the texture layout to the wrapped `TEXTURE_2D_ARRAY` layout of §6.7 and remove the `"uniform"` mode. Add `resources/MorphTargetTexture.ts` (upload of the plan) and the morph chunk (§8.5). Remove the CPU morph fallback from `ForwardPass.ts:313-314`, `:347-349` and `:1841-1853`; keep it in `MockRenderDevice`. Test: `planMorphTargets(8, 5000, true)` returns mode `"texture"` with `width ≤ 1024` (unit). A glTF morph with 5,000 vertices × 8 targets animates on GPU, and the vertex positions read back via transform feedback match the CPU reference within 1e-4 (browser).
- [ ] Static batching at mount: extend `MeshConsolidation` for engine primitives without runtime handles or animation; remove per-frame `batchStaticRenderItems` regrouping (`Renderer.ts:2361-2385`). Test: scene 17 (576 buildings) draw count ≤ v1 and 0 batching work per frame (counter).
- [ ] Remove per-frame `createModelMatrix` calls for static primitives in `createProductionRuntimeRendererInput` (`index.ts:13976`) by using the cached world matrices from Phase 1. Test: allocation counter.
- [ ] 18-game warm-up assertion (`ready()` already awaits `ProgramWarmup` from Phase 3; `renderer.compile.mode` added there). Test: 18-game scripted play logs 0 compiles after `await app.ready()` (capture workflow assertion).

### Phase 7: Deletion
- [ ] Delete `createWebGLSceneRenderer` and helpers (`index.ts:15982` to the end of that block), the `mode !== "production"` branch (`:12530-12531`) and the `catch` fallback (`:12545-12549`). Report `renderer-mount-failed` per §6.1 rule 4. Test (`renderer-mount-failure.spec.ts`): force a bridge failure with a mock that throws in `createProductionRuntimeSceneRenderer`, then assert that (1) `await app.ready()` resolves; (2) `diagnostics().errors` contains `renderer-mount-failed`; (3) `onRendererError` fired once; (4) the overlay `[data-aura3d-error="renderer-mount-failed"]` exists in a dev build; (5) the canvas is uniformly the clear state, with no safe-basic draw; (6) with `strictMount: true`, `ready()` rejects with the same code.
- [ ] Delete `packages/rendering/src/LeanWebGL2Device.ts`, `lean/LeanProductionRenderer.ts`, `production-runtime/shaders/chunks/*`, `production-runtime/shaders/wgsl/{pbr,skybox}.wgsl`, `production-runtime/materials/{MaterialCompiler,GLTFMaterialAdapter,GLTFPBRMaterialAdapter,PBRShaderFeatures}.ts`, their re-exports in `production-runtime/index.ts` (record in PRD 15's removal list), and their tests (`tests/unit/rendering/lean-webgl2-boundary.test.ts` rewritten against the core renderer). Test: `pnpm exec tsc -p tsconfig.build.json` remotely, plus `pnpm check:bundle-size` and `pnpm check:public-surface-diff` with the removals acknowledged.
- [ ] Remove the `renderer.core` flag and v1 branches. Remove deprecated aliases older than one minor (coordinate with PRD 15), including `renderer.debug.preserveDrawingBuffer`, the `blend: boolean` mapping, `qualityProfile`, and the hand-registered shader-name aliases. Test: `git grep -n "debug: { preserveDrawingBuffer\|qualityProfile:" -- apps templates tests tools` returns nothing outside migration-error tests.
- [ ] Update `BUNDLE_SIZES.md` via `pnpm check:bundle-size` and record the delta in the PR.

## 16. Test requirements

All browser, GPU and capture work runs remotely on GitHub Actions `macos-14` (ANGLE Metal; workflow `.github/workflows/quality-rebuild-capture.yml`, extended), per `/Users/gurbakshchahal/.config/agent-policy/reference/remote-execution.md`. Local runs are limited to `vitest` unit tests that do not launch a browser.

### 16.1 Unit (vitest, `tests/unit/...`)
- Scene graph composition, decomposition, shear, Euler orders, `lookAt` (§15 Phase 1).
- Primitive topology: winding vs normals, UV range, tangent orthogonality, bounds, capsule shape, shared-geometry counts.
- Instance matrix composition, including non-uniform size with rotation.
- Color parser table.
- Program key determinism and uniqueness; generated-source snapshots; shader lint.
- BRDF CPU mirror vs three.js r185 reference formulas; furnace test; ambient 1/π.
- Tone-mapping operator CPU mirrors vs three r185 formulas.
- `RenderState` key packing; blend-mode sort order; std140 packing.
- ResolutionGovernor state machine.
- Post plan contract (space tagging, rejection of display-space passes before output, rejection of CPU passes).

### 16.2 Browser (Playwright Chromium on macos-14; WebKit and Firefox jobs added, §18)
- `tests/browser/app-capture.spec.ts`, `primitive-catalog.spec.ts`, `blend-modes.spec.ts`, `program-generator-compile.spec.ts`, `output-pass.spec.ts` (operators, exposure, dither, background), `dpr.spec.ts` (deviceScaleFactor 1/2/3), `instancing-buffers.spec.ts` (VAO eviction, 10k instances), `morph-texture.spec.ts`, `renderer-mount-failure.spec.ts`, `lean-core-parity.spec.ts`.
- Capture workflow assertions (new step in `tools/quality-rebuild-capture/capture-games.mjs`): per game, `diagnostics().output.targetFormat ∈ {rgba16f, r11g11b10f}`, `resolution.pixelRatio` equals the expected tier DPR, `programs.pending === 0` after ready, and no `renderer-mount-failed`.

### 16.3 Performance tests
- Scene 24 and 18-game-scene frame timing (CPU submit ms via `performance.now()` around `renderer.render`, GPU ms via timer query where available) recorded per run into `report.json`. The workflow fails if CPU submit regresses more than 15% vs the committed baseline for the same runner image.

## 17. Visual acceptance tests

### 17.1 New benchmark scenes (spec owned here, harness owned by PRD 12)
| Scene | Content | Criterion | Threshold |
|---|---|---|---|
| 19-scene-graph-hierarchy | A "vehicle" group rotated 30° about Y and scaled 1.5, containing 4 wheel cylinders rotated 90° about Z and a nested turret group rotated −20° about X; built identically with three `Object3D` | Object mask IoU vs three; per-part centroid error | IoU ≥ 0.98; centroid error ≤ 2 px at 1280×720 |
| 20-tonemap-exposure-ramp | 12 emissive swatches at 2^−4 … 2^7 linear, plus an 18% grey card, under unlit rendering; columns for `aces`, `agx`, `neutral` at exposure 0.5, 1, 2 | ΔE2000 per swatch vs three r185 with the same operator and exposure | ≤ 2.0 each; mean ≤ 1.0 |
| 21-blend-modes | Four quads (alpha 0.5, premultiplied, additive, multiply) over a horizontal HDR gradient | Per-pixel MAD vs three (`NormalBlending`, `premultipliedAlpha`, `AdditiveBlending`, `MultiplyBlending`) | ≤ 2/255 |
| 22-specular-aa | 40 thin glossy tori (roughness 0.05) and wires at 20-60 m, camera dolly over 60 frames | Temporal luminance variance in highlight regions (frame-to-frame σ) relative to three with `MeshStandardMaterial` | ≤ 1.2× three's σ; ≤ 0.5× Aura v1 |
| 23-primitive-catalog | Every primitive at hero size with a checker texture (requires PRD 04 sampler fix for repeat; uses default UVs otherwise), overhead and key light | Mask IoU vs three geometry of the same parameters (flat-ID render); cap region IoU, luma and depth-derived normal (§15 Phase 1 primitive test) | IoU ≥ 0.98 per primitive; cap IoU ≥ 0.97, cap luma within ±10% of three, cap normal within 10° of +Y |
| 24-draw-throughput | 2,000 unique-material primitives, 10,000 instances, 1 morph face (5k verts × 8 targets), 50 skinned characters | CPU submit ms, heap delta, GL objects created per frame | §19 budgets |

### 17.2 Existing benchmark scenes PRD 01 must move
Vision judge: the same rubric and prompt as `research/23` (image descriptions, differences table, 0-10 scores, classification). Run on `evidence/benchmark/<scene>-side-by-side.jpg` from the remote workflow, plus one human reviewer (repo owner) who signs the scores file. A scene passes when both the vision model and the human agree.

| Scene | v1 Aura / three (research/23) | PRD 01 owned criterion | Required after PRD 01 alone |
|---|---|---|---|
| 01-simple-geometry | 3.5 / 4.5 | Cylinder cap present; faceting gone; shadow-side faces not lifted (ambient 1/π) | No "implementation-bug" classification; Aura ≥ 4.0; dark-face ΔE ≤ 5 vs three |
| 02-pbr-product | 3.5 / 6 | Plinth top rendered and flat-shaded (cap normals) | Plinth mask IoU ≥ 0.97; classification no longer "implementation-bug" for geometry |
| 06-metal-roughness-sweep | 4 / 7 | Sphere tessellation, specular AA, IOR F0, fudge removal | Aura ≥ 5.0 (full parity needs PRD 02 PMREM) |
| 13-ibl-only | 3.5 / 6 | Faceting gone; no stray default light (requires PRD 02 fallback-rig opt-out) | "Faceted" no longer listed in the differences table |
| 16-instancing | 2.5 / 4.5 | Instance layout | Aura ≥ three − 0.5; classification not "implementation-bug" |
| 11-multiple-lights, 18-game-scene | see research/23 | No regression from removing fudges | Aura ≥ v1 score |
| All 18 | — | No scene drops | No scene drops more than 0.5 vs v1 |

Joint target after PRD 01 + 02 + 03 + 04 (tracked here, owned by PRD 12): Aura within 1.0 of three on every scene 01-18, and ≥ three on 19-23.

### 17.3 Games
The vision judge uses the `research/21` rubric (per-category 0-10 scores, verdict, "competitive?" answer) on `evidence/games/<id>-contact.jpg` and `<id>-mid.jpg` from the capture workflow at 1920×1080, 1280×720 and 390×844. Human review is required for sign-off.

PRD 01 gates (core-only effects):
- All 18 games: no visual category score decreases vs the `research/21` baseline; "low resolution / soft / aliased" complaints disappear from the judge's "what looks poor" list for every game that was at DPR ≤ 1 (aurora-lander, bank-shot, blockfall-reactor, courier-rush, deep-recovery, gallery-shift, gravity-post, neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, siege-golf, turbo-drift-circuit, skyline-runner).
- Courier Rush: the city kit renders at its intended ~66-unit extent (research/19 C6) with no overlapping blocks; human check against the street graph in `apps/showcase-courier-rush/src/city.ts`.
- Siege Golf, Pulse Tunnel, Mech Hangar (primitive-heavy): judge no longer lists "faceted" or "low-poly primitive" geometry artifacts caused by engine tessellation (asset choice is PRD 05/14).
- Aura Clash: renders through RGBA16F and the app operator; human A/B vs v1 shows no loss of fighter readability.
- Deep Recovery: runner FPS ≥ 10× v1 (0.5 fps at 1080p in `report.slim.json`).
- Competitiveness itself ("competitive with a well-built modern three.js browser game") is gated by PRD 14, not by PRD 01 alone. PRD 01 must not be declared done while any core defect in §2 is cited by the judge as a cause in any game.

### 17.4 Per-game impact matrix

Measured at audit commit `c08d8acb`. "DPR today" is the effective gameplay pixel ratio: profile value or app override, per §2.10 and research/19 C2. Primitive columns count call sites of `cylinder(`, `capsule(`, `sphere(` and `torus(` under `apps/<game>/src` (`git grep -c`). They are a proxy for exposure to R5, not draw counts. FPS figures are runner values from `evidence/games/report.slim.json` where §2.11 cites them. Every game authors `lights.ambient`, so R8 (ambient 1/π) affects all 18 and is retuned with PRD 02. All except Orbital Defense author `colorGrade` exposure, so R7 brightens them by the authored 1.02-1.06 (research/19 C12).

| Game | Entry / path | DPR today | Cyl / cap / sph / tor | Other core-specific impact | Per-game check after PRD 01 (in addition to §17.3) |
|---|---|---|---|---|---|
| aura-clash-showcase | `createGameApp` + `createSideViewGameRenderPreset` (RGBA8, Reinhard) | probe-conditional (`AuraClashArenaApp.ts:1522`) | 5 / 2 / 0 / 0 | Moves to RGBA16F and the app operator (§9 item 5); 6 additive call sites gain real additive (R12) | `diagnostics().output.targetFormat = rgba16f`; human A/B of fighter readability |
| showcase-aurora-lander | `createAuraApp` | 1 (profile) | 1 / 0 / 6 / 5 | Torus and sphere faceting (R5) | Judge stops listing faceting; DPR = device |
| showcase-bank-shot | `createGameApp` | 1 | 5 / 0 / 2 / 2 | Cylinder caps (R5) | Table and pocket cylinder tops present in the contact sheet (human) |
| showcase-blockfall-reactor | `createGameApp` | 1 | 2 / 0 / 4 / 4 | 25 `instances.*` sites (R11 size bug, R10 buffers); 8 additive sites (R12) | Instance layout unchanged versus v1 where `size` is 1; human check where `size ≠ 1` |
| showcase-courier-rush | `createAuraApp` | 1 | 3 / 0 / 1 / 2 | City group `scale(6)` (`city.ts:769`, R4); 18 instance sites; 7.1 fps | City at ~66-unit extent with no overlaps (§17.3); FPS ≥ v1 · 0.5 at device DPR |
| showcase-deep-recovery | `createAuraApp` | 1 | 16 / 0 / 34 / 11 | CPU readback post (0.5-1.1 fps) removed (§9 item 4) | FPS ≥ 10× v1; rejected-pass warning visible until PRD 03 |
| showcase-gallery-shift | `createGameApp` | 1 | 2 / 0 / 1 / 7 | Two ambient lights: largest R8 darkening | Shadow-side faces not lifted; no category drop after PRD 02 IBL |
| showcase-gravity-post | `createAuraApp` | 1 | 2 / 0 / 9 / 11 | 6.4 fps: most exposed to the R6 DPR cost | Governor holds FPS ≥ v1 · 0.5; resolution complaint gone |
| showcase-mech-hangar | `createAuraApp` | profile-dependent | 5 / 0 / 3 / 9 | Primitive-heavy hangar (R5) | No "faceted" or "low-poly primitive" in the judge output |
| showcase-neon-swarm | `createAuraApp` | 1 | 0 / 0 / 6 / 8 | 14 instance sites (R10, R11) | Swarm layout matches v1 at `size` 1 |
| showcase-orbital-defense | `createAuraApp` | 1 | 0 / 0 / 6 / 3 | ~60 fps today: headroom for DPR 2 | Runs at device DPR with governor scale 1 on the runner |
| showcase-patrol-wing | `createGameApp` | 1 | 5 / 0 / 15 / 5 | Sphere faceting (R5) | Faceting complaint gone |
| showcase-pulse-tunnel | `createAuraApp` | 1 (art-review scripts force `safe-basic`) | 9 / 5 / 10 / 18 | Real capsules (R5); 15 art-review scripts migrated off `safe-basic` | Tunnel rings and capsules not faceted; art-review scripts run on core |
| showcase-rooftop-buckets | `createGameApp` | `min(dpr, 1.75)`; capture ≤ 1 | 7 / 0 / 6 / 10 | 31 instance sites; 7.6 fps | FPS ≥ v1 · 0.5; instance layout unchanged |
| showcase-siege-golf | `createGameApp` | 1 | 0 / 1 / 12 / 7 | 7.1 fps; capsule (R5) | No "faceted" geometry; FPS ≥ v1 · 0.5 |
| showcase-skyline-runner | `createAuraApp` | 0.7 forced | 0 / 6 / 4 / 9 | Largest DPR gain (0.7 → device); 6 capsule sites | Resolution complaint gone; FPS ≥ v1 · 0.5 |
| showcase-turbo-drift-circuit | `createAuraApp` | 1 (capture forced 1) | 8 / 0 / 9 / 2 | 46 instance sites (R10, R11); 11 additive sites (R12) | Track props at authored positions; additive glows add light (scene 21 behavior) |
| showcase-vault-breakers | `createGameApp`, `qualityProfile: "production"`, `fallback: "safe-basic"` (`main.ts:392`) | 1.5 | 1 / 0 / 2 / 3 | `fallback` option removed (throws migration error until edited) | Route mounts on core with no `renderer-mount-failed` |

## 18. Browser coverage

| Browser / engine | Platform | How tested | Required |
|---|---|---|---|
| Chromium stable (ANGLE Metal) | macOS 14 | Capture workflow (existing), all browser specs | Yes, every PR |
| WebKit (Playwright) | macOS 14 | New `webkit` project running `output-pass`, `blend-modes`, `primitive-catalog`, `dpr` specs | Yes, every PR touching rendering |
| Firefox (Playwright) | macOS 14 | Same subset | Yes, nightly |
| Chromium (ANGLE D3D11 / WARP) | windows-latest runner | Correctness subset only (no GPU; WARP) | Nightly |
| Safari 17/18 on real Mac | Remote device farm (provider chosen by PRD 11) | Manual plus automated capture of scenes 01, 20, 21 | Before Phase 7 sign-off |
| Edge | — | Covered by Chromium | No separate job |

Feature requirements: WebGL2 is mandatory (no WebGL1 path). The float render target is probed (§9 item 2). `KHR_parallel_shader_compile` and `EXT_disjoint_timer_query_webgl2` are optional with fallbacks. `gl_VertexID` and `texelFetch` on `sampler2DArray` are WebGL2 core.

## 19. Performance budgets

Reference devices: **Low** = iPhone 12 / Pixel 6a class, 390×844 CSS. **Medium** = M1 MacBook Air (integrated), 1440×900 CSS. **High** = M1 Pro or RTX 3060-class, 1440×900 CSS. **Ultra** = RTX 4070-class desktop, 2560×1440 CSS. The macos-14 runner (Apple Paravirtual GPU) is a regression signal only; budgets are verified on reference devices through the remote device farm (PRD 11). Budgets cover the PRD 01 share of a frame: scene graph update, culling and submit (CPU), forward opaque/transparent, and OutputPass (GPU). Shadows, IBL and post are budgeted in PRDs 02 and 03 within a 16.7 ms total.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Max pixel ratio | 1.0 | 1.5 | 2.0 | 3.0 (governor-limited) |
| MSAA samples | 0 (AA by PRD 03) | 4 | 4 at effective DPR < 1.75, else 2 | 4 at effective DPR < 1.75, else 2 |
| HDR target | R11G11B10F | RGBA16F | RGBA16F | RGBA16F |
| Forward + OutputPass GPU ms, scene 18-game-scene | ≤ 6.0 | ≤ 6.0 | ≤ 7.0 | ≤ 7.0 |
| OutputPass GPU ms | ≤ 0.3 | ≤ 0.4 | ≤ 0.6 | ≤ 0.8 |
| CPU submit ms, scene 18-game-scene | ≤ 3.0 | ≤ 2.0 | ≤ 1.5 | ≤ 1.5 |
| CPU submit ms, scene 24 (2,000 draws + 10k instances) | n/a (Low caps at 500 draws: ≤ 4.0) | ≤ 6.0 | ≤ 5.0 | ≤ 4.0 |
| Steady-state JS heap delta per frame | ≤ 16 KB | ≤ 16 KB | ≤ 16 KB | ≤ 16 KB |
| GL objects created per steady-state frame | 0 | 0 | 0 | 0 |
| Render-target memory (scene color + depth + resolve + 2 post buffers), governor-enforced | ≤ 32 MB | ≤ 192 MB | ≤ 320 MB | ≤ 512 MB |
| Program warm-up, 18-game-scene | ≤ 1,500 ms | ≤ 600 ms | ≤ 400 ms | ≤ 400 ms |
| Compiles after `ready` in 60 s play | 0 | 0 | 0 | 0 |
| Sphere / cylinder default segments | 32×16 / 24 | 64×32 / 48 | 64×32 / 48 | 64×32 / 48 |

Render-target memory is enforced by `ResolutionGovernor`: when the projected allocation exceeds the tier budget it first drops MSAA one step, then `renderScale`. Diagnostics report the action.

Bundle (gzip, `pnpm check:bundle-size`, remote):
- Engine root (`@aura3d/engine compatibility root`) ≤ 535,343 B after Phase 7 (−40,000 B from 575,343 B), from deleting safe-basic, the lean device and duplicated shaders.
- New rendering-core code (program generator + chunks + OutputPass + governor + resources) ≤ 45,000 B gzip measured in isolation.
- `mini-game starter app before user assets` ≤ 250,000 B (existing budget) after lean renders through the core. If exceeded, PRD 15 decides; the budget may not be met by removing lighting again.
- The 80,000 B `@aura3d/lean core primitive critical path` budget is retired by PRD 15. It was met by dropping lights and environment (research/13 §0 item 3).

## 20. Mobile coverage

- Viewport captures at 390×844 portrait (existing harness run `mobile-390x844`) for every game and scenes 01, 16, 20, 21, 23.
- Real-device runs (remote device farm, PRD 11): iPhone 12 or later on iOS Safari 17+, and Pixel 6a or later on Chrome Android. Collect: float target probe result, chosen HDR format, MSAA, DPR, governor scale over 60 s, warm-up ms, steady FPS for 18-game-scene and 3 games (Orbital Defense, Turbo Drift, Courier Rush).
- Required behavior: the Low tier is selected by `quality: "auto"` on these devices (PRD 11 heuristic). There are no compiles after ready. When the float target is unavailable the output is visibly identical except banding, and `degraded` is reported. Thermal throttling is handled by the governor (5-minute soak, FPS must not fall below 30 at Low on scene 18).
- Touch, safe-area and orientation are out of scope (PRD 08 / 14).

## 21. Screenshots and evidence required

Committed under `docs/project/aura3d-quality-rebuild/evidence/prd-01/<phase>/`:
1. Side-by-side Aura v1 | Aura v2 | three r185 JPGs for scenes 01, 02, 06, 13, 16, 19-24 from the remote workflow (run id in the filename).
2. `report.json` excerpts with region metrics, ΔE tables (scene 20), MAD (scene 21), flicker σ (scene 22), CPU/GPU timings and allocation counters (scene 24).
3. Game contact sheets for all 18 games at 1920×1080 and 390×844, v1 vs v2, with `diagnostics()` JSON (output, resolution, programs).
4. Vision-judge outputs (full text, same rubric as research/21 and 23) and the human sign-off file `scores.signed.json` (reviewer, date, per-scene and per-game pass/fail).
5. Tone-map A/B decision record (Phase 5).
6. Bundle-size report diff.
7. Real-device mobile report (Phase 6 or 7).

Screenshots alone are not acceptance. Each image must be paired with the judged criterion and threshold from §17.

## 22. Completion criteria

PRD 01 is complete when all of the following hold on `main`:
1. One renderer path. No silent fallback. `LeanWebGL2Device`, safe-basic and the stub shader directories are deleted (§15 Phase 7 grep is clean).
2. Every route reaches the canvas through OutputPass with an HDR scene target, a selectable operator (`none/linear/reinhard/aces/agx/neutral`, with AgX and Neutral matching three r185 within the §17.1 thresholds), wired exposure and dithering. All post registered before OutputPass is linear HDR.
3. Scene-graph composition matches three.js `Object3D` (scene 19 thresholds), and Courier Rush's scaled city renders at the intended extent.
4. Primitives match three topology (scene 23), the capsule is real, and caps are present (scenes 01, 02).
5. Benchmark 16 passes (§17.2) and instancing never scales translation by `size`.
6. The generator is the only source of lit programs. Shader lint is clean (no listed fudges). IOR F0, specular AA, direct multiscatter and ambient 1/π are in every lit program, including skinned.
7. Blend modes pass scene 21 on Chromium and WebKit.
8. Default DPR follows the device up to the tier cap. `preserveDrawingBuffer` and canvas MSAA are off. Every root-canvas readback in the repo uses `app.capture()` (Phase 2 triage). `renderer.debug.preserveDrawingBuffer` is deleted, with no remaining users outside class (c) files that have been rewritten.
9. Zero GL allocations and ≤ 16 KB heap per steady frame on scene 24, morph textures in use, and no compiles after `ready` in all 18 games.
10. §17.2 and §17.3 gates pass under both vision-model and human review, with no regression in any game visual category.
11. §19 budgets are met on reference devices (Low through High at minimum; Ultra may be deferred to PRD 11 with written sign-off).

## 23. Rollback considerations

- Phases 1 and 2 are bug fixes merged without a flag. Each lands as an isolated PR (scene graph, primitives, instancing, color parser, blend modes, canvas options, DPR) so it can be reverted alone. DPR has an emergency switch: `renderer.resolution.pixelRatio: 1` per app, and a global env `AURA3D_FORCE_PIXEL_RATIO` read only in capture tooling.
- Phases 3-6 sit behind `renderer.core: "v2"`. Rollback is a one-line default change while v1 still exists. v1 is removed only after two consecutive green capture runs plus human sign-off (Phase 7 exit).
- The tone-map default is a single constant (`DEFAULT_TONE_MAPPING` in `output/OutputPass.ts`); reverting the Phase 5 decision does not touch shaders.
- The ambient 1/π change ships in the same release as PRD 02's default IBL (§13). If PRD 02 slips, R8 can be gated by `renderer.core` and held, but never re-introduced as a permanent legacy mode.
- Deleted files stay retrievable from git history. No data migrations are involved. All changes are local code; there are no production infrastructure changes.

## 24. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Raising DPR on games already at 5-15 fps on the runner makes them slower before Phase 6 lands | High | High | Governor in Phase 2; land Phase 6 CPU work before final DPR sign-off; per-game FPS floor exit criterion |
| Ambient 1/π darkens all ambient-lit games before PRD 02 restores IBL | High | High | Ship R8 with PRD 02 (§13); PRD 14 retunes |
| Program count explosion (light buckets × features) causes compile stalls | Medium | Medium | Bucketing, warm-up, parallel compile, key telemetry; cap distinct keys per scene (warn > 64) |
| RGBA16F MSAA memory at DPR 2 on integrated GPUs | Medium | High | MSAA step-down at DPR ≥ 1.75; RT memory budget enforced by governor |
| Float render targets unavailable on some mobile GPUs | Low-Medium | Medium | R11G11B10F, then reported RGBA8 degraded path |
| Fixing group composition breaks layouts tuned against the bug (Courier Rush, Material Asset Inspector) | Certain | Low | Planned re-authoring in PRD 14; human review in Phase 1 |
| Removing fudges changes material look across all scenes; some looked "better" by accident | High | Medium | Vision A/B per material class in Phase 3; extension materials flagged pending PRD 04 instead of silently wrong |
| AgX default debate | Medium | Low | ACES stays default unless the Phase 5 A/B passes |
| `preserveDrawingBuffer: false` breaks the 226 in-repo canvas-readback files and external tools reading the canvas | High | Medium | Phase 2 triage and migration to `app.capture()`; temporary `renderer.debug.preserveDrawingBuffer`; Playwright `page.screenshot` capture tools unaffected |
| A third resolution scaler is added next to `setPerformanceQuality` and `createPerformanceGovernor` and they fight | Medium | Medium | §6.9 makes `ResolutionGovernor` the only state machine, and the other two drive it; unit test of `min(manual, governor)` |
| Background coverage MRT unsupported or costly on a device | Low | Low | Feature is only on when a background sets `toneMapped: false`; otherwise no second attachment |
| WebGPU path diverges further while WGSL emission waits for PRD 11 | High | Medium | Generator is backend-neutral data; root stays WebGL2 until PRD 11 passes the same benchmarks |
| Euler order confusion in three-compat migrations | Medium | Low | Explicit `rotationOrder`; default named `"ZYX"`; documented in skills (PRD 13) |
| Bundle growth from the named-color table, generator and output pass offsets deletions less than planned | Low | Low | Measure per phase; named colors behind a lazily imported table if needed |

## 25. Explicitly out of scope

- IBL generation, PMREM, default HDR environment, the ambient-disables-IBL bug, environment backgrounds, shadow algorithms (CSM, PCF hardware compare, point shadows), shadow strength, light units and default intensities: PRD 02. PRD 01 provides the program hooks only.
- Bloom, SSAO/GTAO, SSR, DOF, motion blur, TAA, FXAA/SMAA, color grade, LUT, vignette, volumetric GPU port: PRD 03. PRD 01 provides the HDR/output contract only.
- KHR material extension lobes, transmission render target, model tint semantics, texture samplers and wrapping, KTX2 sRGB formats, MikkTSpace tangents, Draco/Meshopt decoders: PRD 04.
- Asset replacement (unlit card heroes, untextured kit meshes): PRD 05.
- Character rigs built from capsules, animation controller defects: PRD 06.
- Particle rendering (effects.particles drawing zero pixels): PRD 07. PRD 01 provides blend modes.
- WebGPU device rebuild and WGSL emission, GPU tier detection heuristics, occlusion culling, multi-draw: PRD 11.
- Public-package and export-map consolidation, three-compat: PRD 15.
- Per-game art direction and final competitiveness sign-off: PRD 14.
