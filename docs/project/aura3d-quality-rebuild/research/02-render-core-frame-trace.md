# 02 — Render core frame trace (WebGL2)

Branch: `aura3d-quality-rebuild/audit` @ `950b2971`. Method: code reading only (no browser, no build). Every claim below is backed by a `path:line` reference to implementation code, not README/evidence/test files. Comparison baseline is three.js r185 (`node_modules/three` is present at 0.185.1).

## 0. TL;DR

The core forward PBR math (GGX + height-correlated Smith + Burley, split-sum with multi-scatter) and the main game path's HDR target (RGBA16F + 4x MSAA, then ACES) are reasonable and roughly on par with three.js `WebGLRenderer` + `EffectComposer`. The games still look several generations old because of what feeds that core and what surrounds it:

1. **Most games have no image-based lighting.** 20 of the 26 showcase `main.ts` files add `lights.ambient(...)` and none of them author an HDRI. When a scene has an ambient light and no environment node, the root bridge builds an environment with `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0`, no texture and no procedural map (`packages/engine/src/agent-api/index.ts:12691-12706`). The result is no reflections at all, just flat constant ambient multiplied by a fake `0.35..1.0` hemisphere factor (`ShaderLibraryCore.ts:622-623`). Metal and gloss read as plastic.
2. **When an environment does exist by default, it is LDR and tinted.** The generated "gameplay" or "studio" environment is a 128x64 float map. It is Reinhard-tone-mapped and quantized to sRGB **8-bit** *before* lighting (`ExternalParityRenderPreset.ts:137-151`, `EnvironmentMapResources.ts:162-169`), so the IBL has no HDR highlight energy. The "gameplay" preset also bakes a teal horizon `[0.1,0.72,0.7]` and a cyan specular `[0.2,0.96,1]` (`ExternalParityRenderPreset.ts:588-604`) into every game that doesn't light itself.
3. **Shadows are structurally broken for game content.** The shadow `DepthPass` uses one static depth shader. It ignores skinning, instancing, morphs and alpha-cutout (`DepthPass.ts:59-84`, shader at `ShaderLibraryCore.ts:784-805`). Animated characters cast bind-pose shadows, foliage casts solid quads, and statically batched or instanced props cast nothing (or one phantom at the origin, because batching rewrites `modelMatrix` to identity: `SceneOptimization.ts:211-217`). There is one directional map per frame, fitted to the *camera-culled* item bounds with no texel snapping (`Renderer.ts:622-630`, `1964-1986`). That means shimmer and shadows that vanish when the caster leaves the screen. Cascades never run on the root path (`Renderer.ts:1387-1391` require a `PerspectiveCamera` instance; the bridge passes a bare `{viewProjectionMatrix}`). Filtering is nearest-sampled manual compare, not hardware `sampler2DShadow` (`ShadowPass.ts:139-144`). Point shadows are read back to the CPU and quantized to **8-bit depth** (`Renderer.ts:1915-1931`).
4. **The scene graph is not a scene graph.** Group transforms are composed by *adding* positions and Euler angles and multiplying scales component-wise (`agent-api/index.ts:17982-18006`). Rotated or scaled groups don't rotate or scale their children's offsets, so agents can only build axis-aligned assemblies. Together with 16x12 spheres and "capsule = sphere" primitives (`index.ts:17360-17479`), that is a large part of the blocky, early-console look.
5. **Post-processing after tone mapping runs in 8-bit display space.** SSAO, SSR, DOF, TAA, motion blur and outline run on RGBA8 ping-pong buffers after ACES (`WebGL2Device.ts:1016-1033`). SSAO is an 8-tap raw-nonlinear-depth difference that multiplies the final color (`WebGL2Device.ts:3093-3129`). Bloom's threshold is clamped to `[0,1]` (`WebGL2Device.ts:4485`) and its HDR bright pass passes the full color through a hard step (`WebGL2Device.ts:2844-2853`). The default "performance" bloom is a single-scale blur of at most 4 pixels (`index.ts:12792-12796`).
6. **Defaults undercut resolution.** The default renderer profile `safe-basic` has `pixelRatio: 1` (`index.ts:4256`) and wins over `devicePixelRatio` (`index.ts:11129`), so on a 2x display every game that doesn't override it renders at a quarter of the native pixel count.
7. **Templates use a different, crippled renderer.** `templates/mini-game` imports `@aura3d/lean/game`. `lights.directional()` and `environments.studio()` there are inert intents (`packages/lean/src/base.ts:252-259`). The lean renderer submits no lights, no environment, no camera position (the shader defaults to `[0,0,1]`, `ForwardPass.ts:1559`), no shadows and no post (`LeanProductionRenderer.ts:53-61`). Model matrices have no rotation (`base.ts:390`). This is the starting point the agent skills tell agents to scaffold from.

The renderer is not hopeless: the HDR target, sRGB texture handling, a sane BRDF core, glTF texture plumbing (anisotropy 8, mipmaps) and a real HDRI/PMREM path (`PBRHDRPipeline.ts`, RGBA16F) all exist. But the defaults, the bridge, the shadow subsystem and the post chain cap the final pixels well below current three.js work.

---

## 1. Render paths inventory: which one the games use

| # | Path | Entry | Device | Used by |
|---|------|-------|--------|---------|
| 1 | **Root production bridge** | `createAuraApp` / `createGameApp` → `startProductionRender` → `createProductionSceneRenderer` → `createProductionRuntimeSceneRenderer` (`agent-api/index.ts:11126`, `12241`, `12595`, `13540`) | `ProductionRuntimeRenderer` → `ProductionWebGL2Renderer` → `Renderer` → `WebGL2Device` (`ProductionRuntimeRenderer.ts:95-108`, `ProductionWebGL2Renderer.ts:34-46`) | **All 26 showcase apps** (`createGameApp` is a thin wrapper around `createAuraApp`: `index.ts:11818-11826`), plus aura-clash and neon-corridor |
| 2 | Root "safe-basic" fallback | `createWebGLSceneRenderer` (`index.ts:15982`) with its own raw GL program (`index.ts:16681-16775`) | raw `WebGL2RenderingContext` | Runs silently if the production bridge throws (`index.ts:12614-12620`) or if `renderer.mode !== "production"` |
| 3 | Canvas-2D diagnostic preview | `renderDiagnosticPreviewToCanvas` (`index.ts:11364-11366`) | 2D context | Non-renderable scenes only. It now throws instead of hiding a failed WebGL mount (`index.ts:11391-11396`) |
| 4 | Lean primitive renderer | `@aura3d/lean` `createAuraApp` → `LeanProductionRenderer` (`packages/lean/src/index.ts:11-16`) | **`LeanWebGL2Device`**, a forked 4,537-line device (`packages/rendering/src/LeanWebGL2Device.ts`) | `templates/mini-game` |
| 5 | Lean product renderer | `@aura3d/lean/product` → `LeanProductRenderer` → `Renderer` (`lean/LeanProductRenderer.ts:20-28`) | `WebGL2Device` | `templates/product-viewer`, and the lean game entry (`lean/src/game.ts:1-6` imports product) |
| 6 | WebGPU production | `ProductionWebGPURenderer` (590 lines) | WebGPU | Not on games: the root bridge passes `backend: "webgl2"` explicitly (`index.ts:13584`) |
| 7 | `AdvancedRenderer` / `A3DRenderer` / `createA3DApp` | Thin wrappers over `Renderer` (`rendering/src/advanced-runtime/AdvancedRenderer.ts:19-24`, `engine/src/advanced-runtime/A3DRenderer.ts`) | `WebGL2Device` | 4 apps or examples |

**Conclusion:** games use path 1. Starter templates use path 4 or 5. Paths 1 and 5 share `Renderer` but differ completely in what they submit (lights, environment, post). Path 4 forks the device. There are at least three distinct forward-shading pipelines with three different lighting contracts, and agents get the weakest one when they scaffold.

---

## 2. Actual pipeline (root production bridge, one frame)

```
 createAuraApp(canvas, {scene})                             agent-api/index.ts:11126
   │ normalizeCreateAppRendererOptions → profile "safe-basic"   :4311-4327
   │ configureCanvas(pixelRatio = options.pixelRatio ?? profile.pixelRatio(=1) ?? DPR)  :11129, :18105-18120
   ▼
 startProductionRender ──► createProductionRuntimeSceneRenderer          :12241, :13540
   │  TypedGLBActor per typed model (lazy import)                       :13552-13583
   │    └─ loadProductionGLTFRenderPipeline → createGLTFRenderResources  assets/asset-corpus/ProductionGLTFRenderPipeline.ts:75-110
   │         material selection: SkinnedLit / TexturedPBR / PBR / Unlit   assets/GLTFRenderResources.ts:1506-1653
   │  primitives → PBRMaterial scalar + low-poly generated meshes        index.ts:14938-14984, :17287-17479
   │  environment = createProductionRuntimeEnvironment(snapshot)        :12536-12722
   │     ├─ env node "hdri" → async HDR chain (RGBA16F PMREM)           :14190-14245
   │     ├─ env node other → generated LDR 128x64 map                   ExternalParityRenderPreset.ts:133-221
   │     ├─ ambient light(s) → color only, NO IBL                       :12691-12706   ◄── 20/26 games
   │     └─ none → category preset ("gameplay"/"studio"/…)              :12708-12722
   │  ProductionRuntimeRenderer.create({backend:"webgl2", antialias:true,
   │       preserveDrawingBuffer:true, clearColor: ACES-pre-inverted})  :13584-13594
   ▼
 per RAF: renderFrame → renderer.render(time)                           :12317
   │ createProductionRuntimeRendererInput                               :13871-14005
   │   items = actor.collectRenderItems(modelMatrix) + primitives
   │   modelMatrix = T * R(eulerXYZ) * S * normalizeToUnit               :17766-17789
   │   source = { staticBatching:true, frustumCulling:true, collectedLights,
   │              environmentLighting, postprocess (ALWAYS), shadow, environmentFog, cameraPosition }  :13990-14004
   ▼
 Renderer.render(source, {viewProjectionMatrix})                          Renderer.ts:541
   │ 1 collect → frustum cull (explicit items) → static mesh consolidation
   │   → static batching (instanceTransforms, modelMatrix=identity)      :2180-2215, :2361-2386
   │ 2 postprocess present? yes → forwardTarget RGBA16F, MSAA 4 (1 if TAA),
   │   depth: DEPTH24 MS renderbuffer (+DEPTH24 texture if SSAO/SSR/DOF) :582-618, :928-943; WebGL2Device.ts:640-700
   │ 3 SHADOW: first shadow-casting light only
   │     directional/spot → ShadowPass (DEPTH24 texture, RGBA8 dummy color)  :1354-1438; ShadowPass.ts:155-173
   │     point → 6 faces, readDepthPixels → CPU → 8-bit atlas → upload   :1516-1603, :1915-1931
   │     casters = CULLED items (castShadow!==false), depth shader = static MVP only  :625; DepthPass.ts:59-84
   │ 4 clear(clearColor); optional EnvironmentBackgroundPass (output linear)  :648-656
   │ 5 ForwardPass: sort (opaque front→back, transmission, transparent back→front)
   │     per item: new uniform Map, light pack, env/fog/shadow/camera uniforms,
   │     new RenderPipeline, per-draw instance VBO create+destroy       ForwardPass.ts:249-351, :1652-1664, :1744-1779
   │     shader = ShaderModule(shaderKey[:variant]) cached per device+library  :368-379, :483-499
   │     fragment: PBR core + ad-hoc extension lobes + fog → outColor LINEAR (u_outputColorSpace=0)
   │ 6 MSAA resolve (blitFramebuffer, NEAREST, color+depth)             WebGL2Device.ts:769-785
   │ 7 POST (fused native path) presentLdrPostprocess                    Renderer.ts:1068-1111; WebGL2Device.ts:871-1120
   │     [HDR] bloom bright-pass (threshold ≤1, hard step unless softKnee) → blur (perf: 1 scale ≤4px | balanced: pyramid)
   │     [HDR→LDR] tone-map (ACES fitted, exposure=1, whitePoint=1) + color-grade  → RGBA8 ping-pong
   │     [LDR 8-bit] DOF → motion blur → SSAO → SSR → TAA → outline       (byte kernels)
   │     [LDR] FXAA → default framebuffer (RGBA8, sRGB-encoded in shader)
   │   non-fusable passes (volumetric-light, contact-shadow, film-grain, CA)
   │     → CPU: readPixels / readFloatPixels → JS kernel → writePixels   Renderer.ts:994-1066, :1245-1280
   ▼
 canvas (preserveDrawingBuffer:true, alpha:false, antialias:true but unused)   WebGL2Device.ts:351-355
```

---

## 3. Stage-by-stage findings

### 3.1 Scene description and transforms

| Item | Code | Behaviour | three r185 |
|---|---|---|---|
| Group composition | `index.ts:17960-18006` | `position = parent.position + child.position`, `rotation = parent.euler + child.euler`, `scale = parent ⊙ child`. A parent rotation does **not** rotate the child offset; a parent scale does **not** scale the child offset. | `Object3D.matrixWorld = parent.matrixWorld * matrix` (full affine composition) |
| Node matrix | `index.ts:17766-17789` | `T * R(xyz Euler) * S * (normalize-to-unit offset)`. No quaternion, no pivot. | Quaternion TRS |
| Model normalization | `index.ts:17791-17810` | Every model is rescaled to `AURA_NORMALIZED_MODEL_MAX_DIMENSION` unless `scaleMode: "world"` | Models keep authored units |

**Visual impact:** agents cannot build rotated sub-assemblies (a vehicle with rotated wheels inside a rotated group, a tilted roof on a rotated house, and so on). Everything gets laid out on world axes, which produces the grid-aligned, toy-block composition seen across the showcases. This is an architecture (F) and authoring (E) ceiling, not a renderer one.

### 3.2 Asset loading and material resolution

- glTF materials map to `SkinnedLitMaterial`, `TexturedPBRMaterial` (any texture), `InstancedPBRMaterial`, `PBRMaterial` or `Unlit*` (`GLTFRenderResources.ts:1506-1653`). Texture plumbing is sound. Color textures are bound as sRGB through `SRGB8_ALPHA8` (`WebGL2Device.ts:4067`). Samplers default to `linear-mipmap-linear` with `maxAnisotropy: 8` (`GLTFRenderResources.ts:2196-2214`). Missing tangents are generated per vertex, Lengyel style, rather than MikkTSpace (`:1153-1252`). That is acceptable; three uses derivative-based TBN when tangents are missing.
- **Tint override destroys authored materials.** A model node with `material.color` sets `replaceSurfaceTextures: true` (`index.ts:13569-13571`). `applyMaterialTint` then disables the base color and metallic-roughness textures. It also sets **emissive = base color** with `emissiveStrength` defaulting to `0.28`, and overrides roughness to `0.38` and metallic to `0.16` (`production-runtime/TypedGLBActor.ts:476-510`). Every tinted model becomes a flat, self-glowing, semi-glossy solid.
- Primitive meshes are low poly: sphere 12 rows x 16 columns (`index.ts:17360-17362`), cylinder 24 segments, torus tube 10, **capsule is the sphere** (`:17477-17479`). Primitives get scalar `PBRMaterial`; textures only arrive through an async "C1 upgrade" when the spec references images (`:13603-13609`). Showcases lean heavily on primitives: pulse-tunnel has 105 primitive calls, mech-hangar 45, gravity-post 39, siege-golf 35.

### 3.3 Culling and batching

- Explicit items are frustum-culled only when `frustumCulling: true` (`Renderer.ts:2217-2228`). The root bridge sets it (`index.ts:13995`).
- **The culled list is reused as the shadow caster list** (`Renderer.ts:555-557`, `625`). Off-screen casters cast no shadow into view.
- Static batching groups items with identical geometry and material into one item with `modelMatrix = identity` and `instanceTransforms` (`SceneOptimization.ts:207-217`). The forward pass handles this. **The depth pass does not** (see 3.6).
- Consolidation and batching rebuild items and drop `normalMatrix` and `boundingBoxCenter` (`SceneOptimization.ts:196-217`). Transparent sorting then falls back to translation (identity for batches).

### 3.4 Shader generation architecture

- **Uber-shaders written as hand-concatenated GLSL template strings**, with `#include <chunk>` for 6 chunks (`ShaderChunks.ts:15-617`) and `#ifdef` only for a **hand-enumerated list of 10 named textured-PBR variants** (`ShaderLibrary.ts:2063-2076`). Everything else (procedural env vs sampled env, cube vs equirect, clustered vs uniform lights, shadows on/off, point vs directional shadow, fog, transmission, iridescence, sheen and so on) branches at **runtime on float uniforms** (`step(0.5, u_…)`, `if (u_shadowMapEnabled < 0.5)`). For example, `a3dPbrEnvironmentSampleRaw` always samples **both** the equirect and the cube map and mixes them (`ShaderLibraryCore.ts:476-480`).
- Cache key = `shaderKey[:variant]` (`ForwardPass.ts:681-683`). There is no material-feature hash like three's `WebGLPrograms.getProgramCacheKey` (which keys on maps present, skinning, morph count, shadow type, tone mapping, fog, light counts and so on).
- Separate hand-written programs exist for skinned-lit (`ShaderLibrary.ts:565`), skinned-lit-8-influence (`:1091`), instanced PBR (`:101`), normal-mapped PBR (`:1643`), textured PBR (`:2063`) and base PBR (`ShaderLibraryCore.ts:291`). The lighting code is **copy-pasted** across them, with drift. For example the procedural rough floor is `mix(0.04,0.38,r)` in base PBR (`ShaderLibraryCore.ts:642`) but `mix(0.012,0.16,r)` plus three extra "stripes" in textured PBR (`ShaderLibrary.ts:2655-2665`).
- Precision: `precision highp float` everywhere. That's fine.
- Per-draw CPU cost: a `new Map` of uniforms, `LightUniforms.pack` per item, `new RenderPipeline` per item, and a per-draw `createBuffer`/`dispose` for instance matrices above 64 and for instance colors (`ForwardPass.ts:292-350`, `1744-1816`). Matrices are copied via `Array.from` repeatedly. This drives the `maxRecommendedDrawCalls: 180` budget (`index.ts:4258`), which pushes agents toward sparse scenes.

**Ceiling:** runtime-uniform branching forces every program to declare every sampler (env 2D plus cube, shadow, point shadow, spot shadow, cluster textures, BRDF LUT). Each new feature has to be retrofitted into five copy-pasted shaders, and features silently diverge between them.

### 3.5 Lighting model

Core BRDF (`ShaderChunks.ts:43-126`): Schlick Fresnel, GGX (`α = r²`, `α² = r⁴`), height-correlated Smith, Burley diffuse, `kd = (1-F)(1-metal)`. That is correct and comparable to three's `BRDF_GGX` and `BRDF_Lambert`.

Split-sum IBL with Fdez-Agüera multi-scatter compensation (`ShaderChunks.ts:217-245`). Correct in form.

Problems:

| Issue | Evidence | Effect |
|---|---|---|
| Ambient-only scenes get **zero** specular IBL | `index.ts:12691-12706`; `ForwardPass.ts:1309-1318` clears procedural uniforms when absent | No reflections; gloss and metal look like plastic. Affects every showcase with `lights.ambient` and no environment (20/26) |
| Fake hemisphere ambient | `environmentHemi = mix(0.35,1.0,N.y*0.5+0.5)` (`ShaderLibraryCore.ts:622-623`) | Downward faces get 35%. A single constant-color "fill" with no directional information |
| Environment colors capped at [0,1] | `ForwardPass.ts:1291-1296`, fog `:557-562` | No HDR sky or ambient energy can be authored |
| Diffuse IBL = lowest specular mip of the same map | `diffuseEnvironmentLod = mipCount-1` (`ShaderLibraryCore.ts:636-637`) | With the generated map (5 levels from 128x64) diffuse samples an 8x4 GGX r=1 level, not a cosine-convolved irradiance map. The computed `irradianceWidth: 16` map (`ExternalParityRenderPreset.ts:147-149`) is never bound |
| Heuristic scalars on top of physics | `sampledSpecular *= mix(1.1, 0.65, roughness)` (`ShaderLibraryCore.ts:650`); anisotropy multiplies **all** direct and IBL shading by `mix(1, 0.18, aniso)` (`:667`, `:756`) | Non-physical energy. Anisotropic materials go dark |
| Extension lobes are ad hoc | `a3dApplyAdvancedPbrLobes` modulates albedo with constants (`ShaderChunks.ts:253-327`). The environment sheen term adds `sheenColor * (1-N·V)^8 * 1.4` **without any radiance** (`:428-430`) | Sheen rim glows in the dark. Clearcoat, iridescence and anisotropy in the base shader are approximations, not KHR-spec lobes |
| Light count | `u_lightData[96]`, 6 vec4 per light, so a 16-light uniform path; more than 16 switches to clustered (`ForwardPass.ts:251-258`, `ShaderLibraryCore.ts:705`) | Acceptable |
| Point and spot falloff | `rangeFalloff² / max(d², 1)` (`ShaderLibraryCore.ts:733-735`) | Physically shaped. But with `lights.point` intensity defaulting to 2 (`index.ts:3088`), a light 5 m away contributes `2/25 = 0.08`, so point lights barely register, and agents compensate with ambient |
| Exposure fixed at 1 | `toneMapping: { exposure: 1 }` (`index.ts:12884-12890`). `sceneExposurePresets` (`index.ts:4204-4214`) and `rendererColorManagementPreset.defaultExposure: 1.05` (`:4197`) are diagnostics-only. `colorGrade({exposure})` is explicitly ignored (`:4547`) | Fake parity; there is no exposure control |

### 3.6 Shadows

| Aspect | Code | Status |
|---|---|---|
| Casters | First shadow-casting light only (`Renderer.ts:1371`, `1849-1858`) | One shadowed light per frame |
| Directional fit | `createDirectionalShadowMatrix(items, dir)`: ortho box around the **culled visible items' bounds**, 8% padding, **no texel snapping** (`Renderer.ts:1964-1986`) | Shimmer when the camera moves. Resolution is spread over the entire visible world (ground planes included). Shadows vanish when casters go off-screen |
| CSM | Only when `light instanceof DirectionalLight && camera instanceof PerspectiveCamera && cascadeCount>1` (`Renderer.ts:1387-1399`) | **Never on root.** The bridge passes `{viewProjectionMatrix}` (`index.ts:13998`), so `resolvedCamera.camera` is undefined, and `createProductionRuntimeShadowOptions` never sets `cascadeCount` (`index.ts:12942-12974`) |
| Size | 1024, 2048 or 4096 by "scene radius" heuristic (`index.ts:12958`) | OK |
| Depth format | `DEPTH_COMPONENT24` texture plus a wasted RGBA8 color attachment (`ShadowPass.ts:165-171`, `WebGL2Device.ts:663-676`) | OK precision |
| Filtering | `NEAREST` sampler, manual `receiverDepth > storedDepth`, 9 or 16 taps (`ShadowPass.ts:139-144`, `ShaderLibraryCore.ts:494-531`, `index.ts:12968-12969`) | **No hardware PCF** (`sampler2DShadow` + `TEXTURE_COMPARE_MODE` + linear). Visibly stair-stepped penumbra. three r185 `PCFShadowMap` uses hardware comparison sampling |
| **Skinned casters** | `DepthPass` draws `u_modelViewProjection * a_position` only (`DepthPass.ts:59-84`; shader `ShaderLibraryCore.ts:784-805`) | **Animated characters cast bind-pose (T-pose) shadows** |
| **Instanced and batched casters** | `instanceTransforms` ignored; batched items have identity `modelMatrix` (`SceneOptimization.ts:215`) | **Batched or instanced props cast one shadow at the mesh's local origin (world origin for batches) or none at all** |
| Alpha-cutout casters | No `u_alphaCutoff` or texture in the depth shader | Foliage and fences cast solid-quad shadows |
| Morph casters | Ignored | Rest-pose shadow |
| Point light | 6 passes, each `readDepthPixels` → `Math.round(depth*255)` → CPU blit → `writeRenderTargetPixels` (`Renderer.ts:1516-1603`, `1915-1931`) | **8-bit nonlinear depth** plus 6 GPU→CPU stalls per frame. Severe acne or peter-panning; slow |
| Spot | Perspective with `near = 0.01` (`Renderer.ts:1873`) | Wastes depth precision |

three r185 comparison: `WebGLShadowMap` builds depth-material variants keyed on skinning, morph count, instancing, alphaTest and side; supports one shadow per light; `DirectionalLightShadow` uses a user camera (and `CSM` addon); PCF uses hardware comparison.

### 3.7 Render targets, formats and depth

| Target | Format | Code |
|---|---|---|
| Default framebuffer | RGBA8, `alpha:false`, `antialias:true` (unused because the frame is blitted), `preserveDrawingBuffer:true` (forced, `index.ts:13589`) | `WebGL2Device.ts:351-355` |
| Forward scene (root) | **RGBA16F**, MSAA 4x renderbuffer (1x when TAA) | `index.ts:12862`; `Renderer.ts:611`, `928-943`; `WebGL2Device.ts:683-684` |
| Forward depth | MS `DEPTH_COMPONENT24` renderbuffer; resolved into a `DEPTH_COMPONENT24` texture when depth post is requested; single-sample non-texture path uses **`DEPTH_COMPONENT16`** | `WebGL2Device.ts:654-690` |
| Shadow | `DEPTH_COMPONENT24` texture plus RGBA8 color | `ShadowPass.ts:165-171` |
| Post ping-pong | RGBA8 (RGBA16F only for the bloom ping-pong when the source is HDR) | `WebGL2Device.ts:946-948` |
| Projection | Standard perspective, near 0.05 and far 100 default (`RootRuntimeSupport.ts:16-21`) | No logarithmic or reversed-Z anywhere in `rendering/src` (rg finds nothing except a CSM comment) |

**Depth-range mismatch:** the native post linearizes depth with `normalizeLdrDepthRange(undefined)` = near 0.1, far 1000 (`WebGL2Device.ts:4567-4574`). `Renderer` never passes the real camera range (no `depthRange` in `Renderer.ts`), and `executeReflectionSurfaceSsr` hardcodes `{near:0.1, far:1000}` (`WebGL2Device.ts:865`). The camera is 0.05/100, so SSR and DOF linearization is wrong by a large factor.

### 3.8 Post-processing

Pass catalogue and execution:

| Pass | Space | Implementation | Quality vs three r185 |
|---|---|---|---|
| Bloom | HDR in | Bright pass: `luma >= threshold ? source : 0` (hard step) or a smoothstep knee. **Threshold must be ≤ 1** (`WebGL2Device.ts:4485-4487`) and the root clamps it to [0,1] (`index.ts:12869`). Default quality `"performance"` = single scale (`NativeBloomPyramid.ts:33-34`), radius mapped to **1..4 px** (`index.ts:12792-12796`). `bloom.color` is accepted and ignored | UnrealBloomPass uses 5 mip levels, luminosity-high-pass with smoothWidth, and HDR thresholds above 1 for emissive isolation |
| Tone mapping | HDR → LDR | ACES fitted (matches three's matrices, `WebGL2Device.ts:3495-3517`). "AgX" is `smoothstep(log2(1+x)/log2(17))` per channel (`:3541-3545`), **not AgX**. "Neutral" is not Khronos PBR Neutral (`:3547-3550`) | three has real AgX and Neutral |
| Color grade | LDR sRGB | contrast, saturation, vignette (`:3572-3587`). Exposure ignored | OK |
| SSAO | **LDR, post tone map** | 8 taps of raw nonlinear depth differences with bias 0.025 in raw depth units, applied as `source.rgb *= factor` (`:3093-3129`) | three SAO/GTAO: normal-aware hemisphere, linear-space, applied to ambient |
| SSR | LDR | Wrong depth range (above) | three SSRPass operates pre-output |
| DOF, motion blur, TAA, outline | LDR 8-bit | byte kernels | TAA in 8-bit display space ghosts and bands |
| Volumetric light, contact shadow, film grain, chromatic aberration | — | **CPU readback kernels** (`Renderer.ts:1245-1280`) | Real-time unusable |
| FXAA | LDR | After MSAA 4x (double AA, softening) | — |

### 3.9 Fog

`effects.fog()` defaults to `density: 0.12`, color `#9fb7d9` (`index.ts:3442-3448`). The root maps it to exp² with `maxOpacity = 0.25 + intensity*0.55`, about 0.525 by default (`index.ts:12741-12756`). At 10 m: `1 - e^{-(1.2)^2} = 0.76`, times 0.525, gives **40% blue-gray haze at 10 m by default**. The fog is mixed in linear before tone mapping (`ShaderChunks.ts:493-495`), which is correct, but the default flattens contrast and saturation. Almost every showcase adds `effects.fog` (see section 5).

### 3.10 Color pipeline

Linear workflow: textures are sRGB-decoded by hardware, shading is linear, the RGBA16F target holds linear values, ACES is applied, and the final `linearToSrgb` happens in shader to an RGBA8 framebuffer (`WebGL2Device.ts:3482-3493`). That's correct, but:

- The forward shader carries its **own Narkowicz ACES** (`2.51x² …`, `ShaderLibraryCore.ts:588-593`). It is used whenever `outputColorSpace="srgb"`: the lean path, the no-post path, `EnvironmentBackgroundPass` without post. The root post uses the **fitted** ACES with input/output matrices. Two different tone curves exist depending on path.
- Instanced unlit and some unlit programs output linear without any tone mapping or encode (`ShaderLibrary.ts:85-96`). In the lean or no-post path those draws come out darker or more saturated than lit draws.
- The clear color is pre-inverted through the fitted ACES so the background lands on its authored sRGB (`index.ts:15400-15415`). This is a workaround for "tone mapping the background", and it means any route using the `ToneMapping` CPU path or the in-shader Narkowicz path gets the wrong background.

### 3.11 Skinning and morphs

- Skinning: uniform array or data-texture palette, 4 or 8 influences (`ForwardPass.ts:106-121`, `382-476`). Fine. Not supported in shadows.
- Morphs: the GPU uniform path is limited to **≤64 vertices and ≤4 targets** (`ForwardPass.ts:119-120`, `1885-1887`). Every real face or character morph falls back to CPU `applyMorphTargets`, which allocates **a new Geometry, uploads it and disposes it every frame** (`ForwardPass.ts:313`, `347-349`, `1841-1853`). three uses a morph texture (`morphTargetsTexture`) with no vertex limit. Visually correct, but the cost drives budget cuts.

### 3.12 Instancing

The uniform path holds ≤64 instances (`u_instanceMatrices[64]`). Above that, the attribute path creates **a fresh VBO per draw per frame** (`ForwardPass.ts:1753-1772`). Instances with mixed handedness expand to individual draws (`:274-279`). Instanced items cast no correct shadows (3.6).

### 3.13 Resolution and AA defaults

| Default | Value | Code |
|---|---|---|
| Quality profile | `"safe-basic"` | `index.ts:4312` |
| Pixel ratio | `options.pixelRatio ?? profile.pixelRatio (1) ?? DPR`, so **DPR is never reached** | `index.ts:11129`, `:4256` |
| Profile "production" | pixelRatio 1.5 (still not DPR) | `index.ts:4271` |
| Minimum backing size | 320x220 | `index.ts:18115-18116` |

Showcases that don't set `pixelRatio` (bank-shot, blockfall, courier-rush, deep-recovery, gallery-shift, gravity-post, neon-swarm, orbital-defense, patrol-wing, pulse-tunnel, siege-golf, aurora-lander, meshy-relic-pilot) render at 1x CSS pixels. `showcase-skyline-runner` explicitly sets `pixelRatio: 0.7` with `qualityProfile: "safe-basic"`. three examples universally call `renderer.setPixelRatio(window.devicePixelRatio)`.

---

## 4. HDR/LDR boundaries (root production path)

1. **IBL source (default, pre-lighting): float → Reinhard → sRGB8.** `EnvironmentMapResources.ts:162-169` via `ExternalParityRenderPreset.ts:138-151`. This is the most damaging boundary: reflections can never exceed 1.0 and are already tone-compressed before ACES compresses them again (double tone mapping).
2. **Environment and fog color uniforms: validated to [0,1]** (`ForwardPass.ts:1291`, `557`).
3. **Forward shading → RGBA16F + MSAA 4x.** HDR, good (`index.ts:12862`).
4. **MSAA resolve in HDR** (`WebGL2Device.ts:769-785`). Standard; HDR edge aliasing is the same as in three.
5. **Bloom bright pass: HDR, but threshold ≤1** (`WebGL2Device.ts:4485`).
6. **Tone map (ACES fitted, exposure 1) → RGBA8 ping-pong.** All subsequent passes (DOF, motion blur, SSAO, SSR, TAA, outline, FXAA) are 8-bit display-referred (`WebGL2Device.ts:1016-1033`).
7. **Final present: RGBA8 default framebuffer, sRGB encoded in shader** (`WebGL2Device.ts:3490-3493`).
8. **Point-shadow depth: 24-bit → 8-bit** via CPU (`Renderer.ts:1921`).
9. CPU fallback passes: `readFloatPixels` or `readPixels` round trips (`Renderer.ts:1013-1028`, `1247`).

Lean or template path: forward → **RGBA8 default framebuffer directly** with in-shader Narkowicz ACES (`ShaderLibraryCore.ts:588-593`). No HDR target, no post.

Opt-in HDRI path (no showcase uses it: `rg 'environment: "hdri"|environments.hdri'` over apps, examples and templates returns nothing): RGBE parse → RGBA16F PMREM equirect plus cube (`PBRHDRPipeline.ts:149-237`). This is the only physically sane IBL, and it is unused.

---

## 5. What the showcases actually turn on (from `apps/showcase-*/src/main.ts`)

| Feature | Count (of 26) | Note |
|---|---|---|
| `lights.ambient` | 20 | Kills IBL when no environment node (3.5) |
| Authored environment (`environments.*`) | 4 (cinematic-architecture, product-configurator, siege-golf, turbo-drift) | All procedural LDR (`studio`, `productHero`, `nightCinematic`); **0 HDRI** |
| `effects.fog` | ~20 | Default haze 40% at 10 m |
| `effects.neonBloom` or `bloom` | ~20 | Many add `quality:"balanced", softKnee:0.5` themselves. That is an agent workaround for bad defaults, and with threshold 0.68 and knee 0.5 the knee spans 0.18..1.0, so nearly everything blooms (haze) |
| `effects.ambientOcclusion` or `contactOcclusion` | ~8 | Post-tonemap 8-tap raw-depth SSAO |
| Blob or "contact shadow" fake discs (`shadows.contact` = translucent dark cylinder, `index.ts:2366-2385`) | 10 apps | An early-console technique, used because real shadows are unreliable |
| `pixelRatio` override | 12 | The remainder render at DPR 1 |

---

## 6. Capability ladder grades

Ladder: exists / works / public API / used by generated apps / good defaults / composes / modern quality / agents know / examples show.

| Capability | Exists | Works | API | Used | Defaults | Composes | Modern | Agents know | Examples |
|---|---|---|---|---|---|---|---|---|---|
| HDR scene target (RGBA16F + MSAA) | ✔ | ✔ | implicit | ✔ (root) | ✔ | ✖ (8-bit after tone map) | ~ | n/a | ✔ |
| Tone mapping (ACES) | ✔ | ✔ | effect | ✔ | ✖ exposure fixed 1 | ~ | ~ | ✖ | ~ |
| AgX / Neutral | fake | — | ✔ | ✖ | — | — | ✖ | — | — |
| Sampled HDR IBL (PMREM) | ✔ | ✔ | `environments.hdri` | **✖ (0 apps)** | ✖ | ✔ | ✔ | ✖ | ✖ |
| Default IBL | ✔ | ✔ | implicit | partial | ✖ LDR 8-bit, teal tint | ✖ disabled by ambient | ✖ | ✖ | ✖ |
| Directional shadows | ✔ | ✔ static meshes | `shadow:true` | ✔ | ~ | **✖ skinned, instanced, batched, alpha, off-screen** | ✖ no HW PCF, no snapping | ~ | ~ |
| CSM | ✔ | ✔ (Scene camera path) | option | **✖ unreachable from root** | ✖ | — | — | ✖ | ✖ |
| Point shadows | ✔ | 8-bit CPU | ✔ | rare | ✖ | ✖ | ✖ | — | — |
| Bloom | ✔ | ✔ | ✔ | ✔ | ✖ threshold ≤1, 4px single scale | ~ | ✖ | workaround | ~ |
| SSAO | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ post-tonemap, raw depth | ✖ | — | ✖ |
| SSR / DOF | ✔ | wrong depth range | ✔ | rare | ✖ | ✖ | ✖ | — | — |
| TAA | ✔ | rigid opaque only | ✔ | rare | — | ✖ 8-bit | ✖ | — | — |
| Scene hierarchy | ✔ | **✖ (additive Euler)** | `groups` | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| GPU skinning | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ shadows | ~ | ✔ | ✔ |
| GPU morph | ✔ ≤64 vertices | CPU fallback | ✔ | ✔ | ✖ | ✖ shadows | ✖ perf | — | — |
| Instancing | ✔ | ✔ | `instances` | few | ~ | ✖ shadows, per-frame VBO | ~ | ~ | — |
| DPR rendering | ✔ | ✔ | `pixelRatio` | partial | **✖ 1.0** | — | — | ~ | — |
| Shader variants | ✔ 10 hand-named | ✔ | — | ✔ | — | ✖ runtime uniform branching | ✖ | — | — |

---

## 7. MVP shortcuts that now impose a quality ceiling

1. **Runtime-uniform uber-shaders with copy-pasted lighting**, instead of a define-keyed program generator. Every new feature costs five edits and drifts. Unused samplers stay bound. *Replace with a single chunk-assembled PBR program generator keyed on a feature hash (three-style `getProgramCacheKey`).*
2. **`DepthPass` as one static MVP shader.** *Replace with depth-material variants that share the forward vertex stage (skinning, instancing, morph, alpha-test).*
3. **Shadow frustum fit to culled-item bounds.** *Replace with light-space fitting to the camera frustum (CSM on the root path) using texel-snapped stable fits; casters collected from an unculled light-frustum query.*
4. **CPU point-shadow atlas at 8 bits.** *Replace with a cube depth texture or a GPU-rendered atlas into a DEPTH24 texture with a viewport per face.*
5. **Post chain where everything after tone mapping is an 8-bit byte kernel**, plus CPU-readback passes. *Move SSAO and SSR before tone mapping on RGBA16F with linear depth and normals (an MRT normal buffer), keep TAA on HDR, and tone map last (an OutputPass equivalent).*
6. **Generated LDR environment (128x64, Reinhard → sRGB8).** *Replace with a GPU PMREM over an HDR RoomEnvironment-like procedural scene in RGBA16F as the default for every app.*
7. **Ambient light replacing IBL** (`index.ts:12691`). *Ambient should add to the default environment, never zero it.*
8. **Additive-Euler group composition.** *Replace with matrix hierarchy composition (the `@aura3d/scene` Transform already supports world matrices).*
9. **`pixelRatio: 1` hard default.** *Default to `min(devicePixelRatio, 2)` with a resolution-scale governor.*
10. **Multiple competing renderers** (root bridge, safe-basic raw GL, lean `LeanWebGL2Device` fork, lean product, WebGPU). *Collapse to one renderer with one lighting contract. Delete the lean device fork and the safe-basic raw-GL renderer.*
11. **Tint override that disables textures and adds self-emission** (`TypedGLBActor.ts:476-510`). *Make tint multiply baseColorFactor only; never auto-emit.*
12. **Bloom threshold clamped ≤1 and full-color hard step.** *Allow HDR thresholds, subtract the threshold (soft-knee by default), and use a mip pyramid by default.*
13. **Fixed exposure plus decorative exposure presets.** *Wire exposure to the tone-map uniform; delete the diagnostic-only presets.*

---

## 8. Recommendations (ordered)

**P0**
- R1. Default environment: GPU-prefiltered HDR (RGBA16F) procedural room or sky for all apps. `lights.ambient` adds irradiance on top and never disables specular IBL. Delete the `"gameplay"` teal and cyan baked tint.
- R2. Shadow pass rewrite: depth-material variants (skinning, instancing incl. batched `instanceTransforms`, morph, alpha-cutout); hardware `sampler2DShadow` PCF; stable texel-snapped fit; root bridge passes a real camera so CSM runs; casters not filtered by camera frustum; point shadows as a GPU depth cube.
- R3. Fix group transforms to matrix composition (scene graph), and raise primitive tessellation (sphere 64x32, cylinder 48, real capsule).
- R4. Default `pixelRatio = min(DPR, 2)`.
- R5. Collapse the lean template path onto the root renderer: real lights, environment, camera position and rotation. Template-scaffolded games must start with the same pipeline as showcases.

**P1**
- R6. Post order: HDR SSAO (normal plus linear depth), HDR SSR, HDR TAA, then bloom pyramid (HDR threshold, soft knee), then tone map plus grade plus encode last. Pass the true camera near and far.
- R7. Fog defaults: density about 0.015 and maxOpacity 1, or physically based height fog. The current default hazes 40% at 10 m.
- R8. Tint semantics: multiply only, no auto-emission, don't drop textures.
- R9. Shader generation: feature-keyed program cache; single PBR source; remove `mix(1.1,0.65,r)`-style fudge factors; implement KHR-spec sheen, clearcoat and iridescence, or don't advertise them.
- R10. Morph textures (no 64-vertex limit); persistent instance VBOs; remove per-draw allocations.

**P2**
- R11. Real AgX and Khronos Neutral; exposure wired.
- R12. Drop `preserveDrawingBuffer:true` and `antialias:true` on the default framebuffer when post is active.
- R13. Remove the CPU-readback post passes from the catalogue or implement them on GPU.

---

## 9. Subsystems worth preserving

- `WebGL2Device` RGBA16F, MSAA and depth-texture render targets plus resolve (`WebGL2Device.ts:640-785`).
- Core BRDF chunk (`ShaderChunks.ts:43-245`): GGX, Smith-correlated, split-sum with multi-scatter.
- The fitted ACES matching three (`WebGL2Device.ts:3495-3517`).
- The glTF texture and sampler plumbing (sRGB decode, anisotropy, mipmaps, tangent generation, KHR texture transforms).
- The HDRI → RGBA16F PMREM pipeline (`PBRHDRPipeline.ts`, `upgradeProductionEnvironmentHdri`), which should become the default rather than an unused option.
- Skinning palette selection (uniform vs data-texture, 8 influences).
- Render-queue sorting (`performance/RenderItemSorting.ts`), which is correct.
- Native bloom pyramid code path (`NativeBloomPyramid.ts`); only its defaults and threshold contract need changing.
