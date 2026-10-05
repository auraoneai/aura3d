## Rendering-stack findings (GPU to public API)

Scope: the path from `createAuraApp` scene nodes to the default framebuffer, as the 18 captured games actually run it. Sources: research 02, 03, 04, 05, 06, 07, 13, 14, 15, 18, and the adversarial corrections in 19, which take precedence. Pixel evidence comes from 21 (game vision judgment) and 23 (same-input benchmark vision judgment, Aura3D 3.0.1 vs three@0.185.1). Line numbers were spot-checked against the current checkout (`index.ts:12705`, `:13590`, `:14747`, `:17982`, `:4256`; `Renderer.ts:1389`; `ExternalParityRenderPreset.ts:169`; `WebGL2Device.ts:4404`; `DepthPass.ts:66`). Unless stated otherwise, `index.ts` means `packages/engine/src/agent-api/index.ts`.

Bottom line. The core BRDF is sound. Benchmark 11-multiple-lights, which uses direct lights only (no shadows, no IBL, no post), is the one scene where the judges rated Aura3D equal to three.js (5/5, 23 §11). Every subsystem around that core is behind three.js r185, with the largest gaps in environment lighting, shadows, post order, blending, materials beyond base PBR, and draw submission. Most quality decisions are also hard-coded as constants in a 13k-line agent-api bridge, so no public API can reach them. Across the 18 benchmark scenes, Aura3D averages 3.6/10 (median 3.5) and three.js 5.4/10 (median 5.5) (23). Pass-1 metric judging (22) gave three.js 6.5–8.5. The vision scores in 23 are authoritative, and they rate the three.js reference itself as "competent but dated". Aura3D loses on identical inputs, and it loses most in exactly the features that define a modern look.

---

### C.1 Frame trace: what one game frame actually does

This is the root production bridge path used by 17 of 18 games. Aura Clash diverges at the marked points. `✖` marks a defect that caps quality; `≈` marks a working subsystem whose defaults limit it.

```
SCENE (public API)
 createAuraApp / createGameApp(canvas, {scene})                  index.ts:11126, :11818 (thin wrapper)
  ├ profile = "safe-basic" (default)                              index.ts:4312
  ├ backing store = options.pixelRatio ?? profile.pixelRatio(=1) ?? DPR   index.ts:11133, :12280
  │   ✖ DPR fallback unreachable → 1x CSS pixels on retina (13–14/18 games; Skyline 0.7)   19 C2
  ├ scene → flattenSceneNodes → composeAuraTransform              index.ts:17960-18006
  │   ✖ pos = p+c, euler = e_p+e_c, scale = s_p⊙s_c (no matrix hierarchy)   19 C6
  ▼
ASSETS
 createProductionSceneRenderer                                    index.ts:12523
  ├ try createProductionRuntimeSceneRenderer                      index.ts:13540
  │   catch → ✖ createWebGLSceneRenderer (raw GL, 1 light, no shadow/IBL)   index.ts:12543-12549, :15982
  ├ typed GLB → TypedGLBActor → GLTFRenderResources material select  GLTFRenderResources.ts:1506-1653
  │   ✖ material.color ⇒ tint{replaceSurfaceTextures:true} (hard-coded)  index.ts:13570; TypedGLBActor.ts:484-514
  │   ✖ OPAQUE+transmission ⇒ roughness≥0.72, transmission=0           GLTFRenderResources.ts:1743-1769, :1840
  ├ primitives → scalar PBRMaterial; sphere 12x16, capsule = sphere   index.ts:17360-17479, :14979
  ├ instances → createProductionInstanceTransforms (✖ drops node.size)  index.ts:14747-14753
  ├ effect nodes (particles/rain/snow/flipbook/beam) → ✖ warning only, 0 pixels  index.ts:13722-13723
  ├ ENVIRONMENT = createProductionRuntimeEnvironment              index.ts:12628
  │   authored env node     → 128x64 LDR procedural map (2/18: Turbo, Siege Golf)
  │   ✖ ambient, no env node → environmentMapIntensity 0, specular 0 (15/18)   index.ts:12693-12707
  │   none                  → category preset "gameplay" (teal/cyan tint)   ExternalParityRenderPreset.ts:588-606
  │   Aura Clash            → compatibility RenderSource environmentLighting   index.ts:13994
  └ ProductionRuntimeRenderer.create({backend:"webgl2" ✖ hard-coded, antialias, preserveDrawingBuffer,
        clearColor: ACES-pre-inverted background})                index.ts:13586-13597
  ▼
GRAPH / TRANSFORMS (per RAF)
 createProductionRuntimeRendererInput                             index.ts:13871-14005
  ├ modelMatrix = T·R(eulerXYZ)·S·normalizeToUnit                 index.ts:17766-17789
  ├ source = {staticBatching:true, frustumCulling:true, collectedLights, environmentLighting,
  │           postprocess: compat?.postprocess ?? root, shadow (spread after compat), fog, cameraPosition}
  │   ✖ no environmentBackground ever set (rg empty in engine/src)   19 C9
  └ camera = {viewProjectionMatrix} only (not a Camera instance)   index.ts:14006
  ▼
CULLING
 Renderer.render → cull explicit items → static batching (modelMatrix=identity + instanceTransforms)
                                                                  Renderer.ts:2200-2228; SceneOptimization.ts:207-217
  ✖ the culled + batched list is reused as the shadow-caster list  Renderer.ts:622-625
  ▼
SHADOWS (first shadow-casting light only)                         Renderer.ts:1371
  ├ directional: ortho box around culled caster bounds (+8%), no texel snap   Renderer.ts:1964-1986
  │   map size 1024/2048/4096 from ALL node positions incl. parked FX pools   index.ts:12949-12960
  ├ ✖ CSM gate needs PerspectiveCamera AND cascadeCount>1; root provides neither   Renderer.ts:1387-1391
  ├ ✖ DepthPass: one position-only MVP shader (no skin/instance/morph/alpha)   DepthPass.ts:59-87; ShaderLibraryCore.ts:784-805
  ├ point: 6 faces → readDepthPixels → 8-bit CPU atlas             Renderer.ts:1516-1603, :1915-1931
  └ strength 0.32 (0.38 city-day, 0.24 product; name-inferred)     index.ts:12966-12968
  ▼
TARGETS
 forward target RGBA16F, MSAA 4x (1x if TAA), DEPTH24 MS RB      Renderer.ts:582-618; WebGL2Device.ts:640-700
   Aura Clash: ✖ targetFormat "rgba8"                             GameRenderPreset.ts:373
  ▼
MATERIALS / SHADERS / LIGHTING (ForwardPass)
 sort → per item: new uniform Map, LightUniforms.pack, new RenderPipeline,
        instance VBO create+destroy (>64 or colors)              ForwardPass.ts:249-351, :1744-1816
 shader = shaderKey[:variant] (10 hand-named textured variants; rest = runtime float branches)
                                                                  ForwardPass.ts:681-683; ShaderLibrary.ts:2063-2076
 ≈ GGX + height-correlated Smith + Burley; split-sum + multi-scatter   ShaderChunks.ts:43-245
 ✖ ambient = color·intensity·hemi(0.35..1)·albedo, no 1/π (≈π× three)   ShaderLibraryCore.ts:622-634
 ✖ env sampler minFilter "linear" ⇒ WebGL2 reads mip 0 only      ExternalParityRenderPreset.ts:169
 ✖ diffuse IBL = roughest specular mip; SH9 irradiance never bound   ShaderLibraryCore.ts:636-637
 ✖ lights 17+ ignored in extension-textured variants (count = min(n,16))   ShaderLibrary.ts:3140-3147
 fog exp² mixed in linear (default ≈40% haze at 10 m)            ShaderChunks.ts:493-495; index.ts:12741-12759
 out: linear HDR (u_outputColorSpace = 0)
  ▼
RESOLVE: blitFramebuffer color+depth, NEAREST                     WebGL2Device.ts:769-785
  ▼
POST (fused native path)                                          Renderer.ts:1068-1111; WebGL2Device.ts:871-1120
 [HDR]  bloom bright-pass: threshold clamped ≤1, soft knee ≤0.5, "balanced" gain ×7   index.ts:12872; NativeBloomPyramid.ts:106-111
 [HDR→LDR] tone map ACES fitted, exposure 1, whitePoint 1 (hard-coded)   index.ts:12898-12904
           Aura Clash: ✖ "reinhard" device default on rgba8       WebGL2Device.ts:1906; RendererPostprocessPlan.ts:183-184
 [LDR 8-bit] DOF → motion blur → SSAO(raw depth) → SSR(depth 0.1/1000) → TAA → outline   WebGL2Device.ts:1016-1033
 [LDR] "FXAA" (4-tap cross blur) on top of the MSAA result (17/18 games)   WebGL2Device.ts:3613-3630
 ✖ non-fusable (volumetric light, contact shadow, grain, CA) → readPixels → JS kernel → upload   Renderer.ts:994-1066, :1245-1280
  ▼
COLOR / FRAMEBUFFER
 linearToSrgb in shader → RGBA8 default framebuffer, alpha:false, preserveDrawingBuffer:true,
 no dither                                                        WebGL2Device.ts:351-355, :3482-3493
 blend: one function engine-wide, SRC_ALPHA/ONE_MINUS_SRC_ALPHA    WebGL2Device.ts:4404
```

Game-path census for the 18 games (18 C1/C5/C11, 19). 15/18 have zero IBL. 2/18 use the 128×64 LDR procedural environment. Aura Clash gets its environment through a compatibility source. 17/18 run rgba16f + ACES, and 1/18 (Aura Clash) runs rgba8 + Reinhard. 17/18 add "FXAA" on top of 4× MSAA. 4/18 use the `production` profile, which gives a fixed 1.5×. None of the 18 shows a sky from its environment, uses an HDRI, renders particles through the bridge, uses CSM or WebGPU, or uses additive blending.

---

### C.2 Render-path inventory (front-ends and devices)

There is no single renderer. These are the 15 distinct entry points that produce or claim to produce frames:

| # | Front-end | File:line | Device | Lighting contract | Who reaches it |
|---|---|---|---|---|---|
| 1 | Root production bridge `createProductionRuntimeSceneRenderer` | `index.ts:13540` → `ProductionRuntimeRenderer.ts:95-108` → `ProductionWebGL2Renderer.ts:34-46` → `Renderer` | `WebGL2Device` (4,769 LOC) | Bridge-constant policy: env selection, ACES@1, shadow 0.32, no background | 17/18 games, racing and falling-blocks templates |
| 2 | Same bridge with `attachRootRenderSource` compatibility source | `RootRuntimeSupport.ts:92`; `index.ts:13991-14001` | `WebGL2Device` | Caller's `environmentLighting`/`postprocess` (GameRenderPreset rgba8 + Reinhard) | Aura Clash, `character-controller` template, smart-city-control (no postprocess) |
| 3 | Safe-basic raw-GL fallback `createWebGLSceneRenderer` | `index.ts:15982`, GLSL `:16681-16975`, own GLB parser `:17018` | raw `getContext("webgl2")` | 1 `u_lightDirection`, no shadows/IBL, `CULL_FACE` off (`:16010`), double gamma (05 §4.4) | **Silent** swap whenever #1 throws (`index.ts:12543-12549`), or `mode !== "production"` |
| 4 | Canvas2D diagnostic preview | `index.ts:11364-11396` | 2D context | none | non-renderable scenes |
| 5 | `LeanProductionRenderer` | `rendering/src/lean/LeanProductionRenderer.ts:29, 52-70` | **`LeanWebGL2Device`** fork (4,537 LOC, about 92% identical, 13 §2.2) | One ForwardPass, no lights/env/shadow/post | core `@aura3d/lean` |
| 6 | `LeanProductRenderer` | `rendering/src/lean/LeanProductRenderer.ts:17-36` | `WebGL2Device` via `Renderer` | `Renderer` capable, but `lean/base.ts` submits no lights/env (`base.ts:386-397`); placement has no rotation (`base.ts:521-523`) | `templates/mini-game`, `templates/product-viewer` (19 C7) |
| 7 | `ProductionWebGPURenderer` | `…/ProductionWebGPURenderer.ts:32` | `WebGPUDevice` (4,001 LOC, marker-sniffed WGSL) | 5 shader families; everything else is flat `u_draw.color` (07 §0.2) | `wow-webgpu-*` diagnostic routes only |
| 8 | `A3DRenderer` (advanced) | `engine/src/advanced-runtime/A3DRenderer.ts:41` | `Renderer` | Caller-supplied (can reach CSM) | 31 app imports, no game |
| 9 | `A3DRenderer` (production) | `engine/src/production-runtime/index.ts:175` | `ProductionRuntimeRenderer` | Caller `RendererShadowOptions` (`:163-173`) | subpath only; no game |
| 10 | `AdvancedRenderer` | `rendering/src/advanced-runtime/AdvancedRenderer.ts:19` (73 LOC delegation) | `Renderer` | Caller | advanced subpath |
| 11 | `CurrentRoutesInteractiveRenderer` | `rendering/src/threejs-example-parity/index.ts:43` | `ProductionRuntimeRenderer` | parity harness | 2 apps by deep relative import |
| 12 | `createProductViewer` | `engine/src/production-runtime/index.ts:1436-1621` | `ProductionRuntimeRenderer` | The only product path with a visible HDR skybox (sphere mesh) and honoured exposure (`?? 0.9`) | production-* templates |
| 13 | Direct `Renderer.render({cameraPolicy:"identity"})` harnesses | 15 tool/test files; `apps/flagship-ibl-states` (14 §3.5) | `WebGL2Device` | Hand-tuned `createExternalParityEnvironmentLighting("studio")` | parity gates; **not** games |
| 14 | `NativeFrameGraphBindings` / FrameGraph façade | `NativeFrameGraphBindings.ts:77-104` | `WebGL2Device` | Wires `EnvironmentBackgroundPass` as SkyboxPass | tests only (19 C9) |
| 15 | `ResidentGPUParticleRenderer` | `ResidentGPUParticleRenderer.ts` (522 LOC) | WebGPU, **own canvas** | none (does not compose) | `wow-webgpu-compute-particles` |

Two more paths look like renderers but are not: `production-runtime/backends/{webgpu,webgl2}/*` (2-line descriptor classes) and `WebGPURendererBackend`, which wraps only a capability report (07 §1).

Consequence: three lighting contracts (bridge constants, caller-supplied, none), two forked WebGL2 devices, and a silent fallback renderer. A game's look depends on which path it lands on (17 vs Aura Clash) and on whether an unrelated bridge branch throws. No single place can fix "the renderer". The 227 rendering files (43.6k LOC) outside the production renderer's static closure, including `CascadedShadowMaps`, `ScreenSpaceReflectionPass`, `PlanarReflection`, `ReflectionProbe`, `SpecularPrefilter` and `EffectComposer`, are unreachable from the builder API the games use (13 §2.4).

---

### C.3 HDR/LDR boundaries (root path, in frame order)

1. **IBL source, pre-lighting: float → Reinhard → sRGB8.** The 128×64 procedural map is tone-mapped and quantized before the GGX prefilter and the SH bake (`EnvironmentMapResources.ts:153-173, 525-537`, called from `ExternalParityRenderPreset.ts:137-151`). The brightest possible environment reflection is about 0.65 linear (04 §5.2), and the map is tone-mapped twice (Reinhard here, ACES later). This applies on every backend because it happens on the CPU.
2. **Environment and fog colour uniforms are validated to [0,1]** (`ForwardPass.ts:1291-1296, 557-562`). No HDR sky or ambient energy can be authored.
3. **Forward shading writes to RGBA16F + MSAA 4×** (`index.ts:12862-12866`). This is genuine HDR. Aura Clash is the exception and writes to **RGBA8** (`GameRenderPreset.ts:373`).
4. **MSAA resolve in HDR** (`WebGL2Device.ts:769-785`).
5. **Bloom bright pass runs in HDR, but the threshold must be ≤1** (engine clamp `index.ts:12872-12873`; device throws above 1, `WebGL2Device.ts:4484-4490`). Emissive isolation above 1.0 is impossible.
6. **Tone map: ACES fitted, exposure 1 → RGBA8 ping-pong.** From here on, every pass is 8-bit display-referred: DOF, motion blur, SSAO, SSR, TAA, outline and FXAA (`WebGL2Device.ts:1016-1033`). Bloom ping-pong stays RGBA16F only when its source is HDR (`:946-948`).
7. **CPU fallback passes** round-trip through `readPixels`/`readFloatPixels` (`Renderer.ts:994-1066, 1245-1280`).
8. **Point-shadow depth goes from 24-bit to 8-bit** through a CPU `Math.round(depth*255)` (`Renderer.ts:1915-1931`).
9. **Present: in-shader linear→sRGB to an RGBA8 framebuffer, no dither** (`WebGL2Device.ts:3482-3493`; 05 §7). This bands dark exp² fog gradients.
10. **Alternate curves.** The forward shader carries its own Narkowicz ACES for `outputColorSpace="srgb"` (lean, no-post and background-without-post paths: `ShaderLibraryCore.ts:588-593`). Some unlit programs output linear with no encode (`ShaderLibrary.ts:85-96`). The clear colour is pre-inverted through fitted ACES (`index.ts:15400-15415`), so every path that uses another curve gets the wrong background.

The HDRI path (`PBRHDRPipeline.ts:149-237`, RGBA16F PMREM) is the only physically sane IBL, and 0 of 18 games use it.

---

### C.4 Architectural issues: path, visual consequence, ceiling class

Ceiling class:
- **STRUCTURAL**: a permanent ceiling while the current design stands. The fix replaces the subsystem.
- **CONTRACT**: the public API or bridge data shape cannot express the capability. The fix is an API or bridge change.
- **DEFAULT**: a wrong constant. It is cheap to fix, but caps every app until it is changed.
- **BUG**: a localized defect.

Pixel evidence is cited as 23/<scene> (benchmark, Aura vs three score) or 21/<game>.

| # | Issue | Code | Visual consequence (evidence) | Class |
|---|---|---|---|---|
| A1 | Ambient light **replaces** IBL instead of adding to it | `index.ts:12693-12707` (zeros at `:12705`); `production-runtime/index.ts:1455, 1566` keep the explicit 0; the engine lint tells agents to add ambient (`index.ts:18256`) | 15/18 games have no reflections and no sky/ground diffuse gradient; metals read black or plastic. 21 repeatedly records "unlit black void" and "flat" lighting. | CONTRACT (permanent until the lighting contract makes environment the default and ambient additive) |
| A2 | Default environment is a CPU-generated **128×64 LDR** map, tone-mapped before prefilter, cyan-tinted "gameplay" preset | `ExternalParityRenderPreset.ts:133-221, 588-606`; `EnvironmentMapResources.ts:153-173` | No HDR glints, nothing for bloom to catch, teal cast on every game that does not light itself | STRUCTURAL |
| A3 | Env sampler `minFilter:"linear"` makes WebGL2 read **mip 0 only** | `ExternalParityRenderPreset.ts:169`; `WebGL2Device.ts:3819-3824, 4139-4146`; `Sampler.ts:27` default | Rough and smooth materials get identical sharp reflections, and "diffuse IBL" is a per-normal texel (04 §5.2). The same `Sampler` default breaks mipmapping on textured primitives (`index.ts:14379-14381`). | BUG (but a `Sampler` default that every caller inherits) |
| A4 | HDRI PMREM runs on the CPU with 128² faces and 32 point samples, blends toward the global average by `min(0.82, r⁴·0.82)`, takes diffuse from the 1×1 roughest mip, and never binds SH9 | `production-runtime/environment/PMREMGenerator.ts:118-149, 282-351` (blend `:345-350`); `ShaderLibraryCore.ts:636-637`; SH computed at `EnvironmentMapResources.ts:543-571`, unbound | 23/06 roughness sweep 4 vs 7 ("blotchy prefiltered specular, dead roughness-1 end"); 23/13 IBL-only 3.5 vs 6 ("diffuse irradiance, roughness-filtered specular … wrong"); 23/03 helmet visor blurrier (6.5 vs 7). The main thread hitches on HDRI upgrade (04 §5.5). | STRUCTURAL (no GPU PMREM, no irradiance binding) |
| A5 | No environment background on any root path | `rg environmentBackground packages/engine/src` returns nothing; only `clearColor` (`index.ts:13586-13596`); the default background is `#070b12` (`index.ts:4781`) | 23/09 outdoor 3.5 vs 5.5 ("no HDRI background"); 23/13; 21: void backgrounds dominate most of the 18 verdicts | CONTRACT |
| A6 | **DepthPass is one static position-only shader** | `DepthPass.ts:59-87`; `ShaderLibraryCore.ts:784-805`; used by directional, spot, point, CSM and framegraph paths (19 C4) | Skinned characters cast bind-pose shadows (23/08: 3.5 vs 5, "character casts almost no shadow"; 23/15). Instanced items cast one copy. Static batches (≥2 identical items) cast one copy at the **world origin** (`SceneOptimization.ts:209-216`). Alpha-mask foliage casts solid quads. Blended materials cast nothing. | STRUCTURAL |
| A7 | Shadow fit and selection: one shadowed light per frame; ortho box fit to **camera-culled** casters (ground included) with no texel snap; map size from all nodes, including parked FX at y=-50…-70 | `Renderer.ts:1371, 622-625, 1964-1986`; `index.ts:12949-12960` | Shimmer under camera motion. Shadows vanish when casters leave the screen. Texel density is spread over the whole visible world. 23/12 shadows 3.5 vs 5.5 ("drops one shadow-casting light entirely"). 23/17 large environment 3 vs 4.5. | STRUCTURAL |
| A8 | CSM is unreachable from root: the gate needs a `PerspectiveCamera` instance **and** `cascadeCount>1`; the bridge passes `{viewProjectionMatrix}` and never sets `cascadeCount`; the public `lights.directional` takes only `shadow?: boolean` | `Renderer.ts:1387-1391`; `index.ts:14006, 12942-12974, 3072`; the CSM implementation also picks a cascade per item by object centre (`ForwardPass.ts:834-854`) | Large levels get one low-density map (23/17) | CONTRACT (the CSM code exists in `CascadedShadowMaps.ts` with stable texel snap at `:198-201`, but needs a real camera object on the root path) |
| A9 | Shadow filtering is manual NEAREST compare with 9/16 taps; no `sampler2DShadow` or `TEXTURE_COMPARE_MODE` | `ShadowPass.ts:142`; `ShaderLibrary.ts:225-251`; rg finds no compare mode | Stair-stepped penumbrae. 23/15: Aura shadows "over-blurred … slightly misprojected". | BUG/STRUCTURAL (depth texture setup) |
| A10 | Shadow **strength 0.24/0.32/0.38**, chosen by node-name category, with no public override | `index.ts:12966-12968`; categories `index.ts:4737-4765`; applied as `mix(1,1-occ,s)` (`ShaderLibrary.ts:251` etc.) | Fully shadowed pixels keep 62–76% of the key light; three.js defaults to 1.0. 23/15 measured shadow darkening of 9% (Aura) vs 50% (three). 23/17 is city-day 0.38 because the boxes are named "city building N" (22 §17 skeptic). | DEFAULT + CONTRACT |
| A11 | Point shadows: 6 GPU→CPU stalls per frame, 8-bit depth | `Renderer.ts:1516-1603, 1915-1931` | Acne or peter-panning; slow | STRUCTURAL |
| A12 | **Post order:** everything after tone mapping runs on 8-bit byte kernels | `WebGL2Device.ts:1016-1033` | SSR reflects tone-mapped colour, DOF loses highlight energy, TAA in 8-bit ghosts and bands (05 §0.6) | STRUCTURAL |
| A13 | SSAO uses raw nonlinear depth, 8 taps, bias 0.025, no normals | `WebGL2Device.ts:3091-3129`; `index.ts:12895`; near 0.05/far 100 at `RootRuntimeSupport.ts:16-21` | Numerically zero occlusion beyond about 2 m (19 C14). 7 games pay for AO and get none, so objects float. | STRUCTURAL (no normal or linear-depth buffer) |
| A14 | SSR/DOF linearize with a hard-coded near 0.1/far 1000; the renderer never passes the camera range | `WebGL2Device.ts:865, 4567-4574` | Wrong depth reconstruction by a large factor | BUG |
| A15 | CPU-readback post passes (volumetric light, contact shadow, grain, CA, CPU bloom chain) | `Renderer.ts:994-1066, 1245-1280`; 05 §5.4 | Deep Recovery captured at **0.5 fps** (1920×1080), 1.1 fps (1280×720) and 3.6 fps (mobile) (`evidence/games/report.slim.json`) | STRUCTURAL |
| A16 | Tone mapping is hard-coded to ACES, exposure 1; `colorGrade.exposure`, `lut`, `shadows`, `highlights` and `temperature` are dropped; "AgX" and "Neutral" are per-channel fakes; exposure presets are diagnostics only | `index.ts:12898-12904, 4547, 4204-4214`; `WebGL2Device.ts:3541-3550`; no `TEXTURE_3D` anywhere (18 §2) | Every game has the same ACES@1 look; 16 games' authored exposures are ignored; no LUT grading | CONTRACT |
| A17 | Aura Clash path: rgba8 target and a Reinhard device default | `GameRenderPreset.ts:264-389`; `RendererPostprocessPlan.ts:183-184`; `WebGL2Device.ts:1906` | The flagship fighting game tone-maps clamped LDR input with a different curve from the other 17 | BUG (preset) |
| A18 | Bloom contract: threshold ≤1, soft knee ≤0.5 (the validator max is copied into 17 routes), hidden ×7 "balanced" gain, `bloom.color` dropped, default "performance" is single-scale 1–4 px | `index.ts:12872, 12791-12796`; `WebGL2Device.ts:4484-4496, 2847-2851, 1004-1007`; `NativeBloomPyramid.ts:106-111` | Mid-tones from luma 0.05–0.34 upward bloom → milky haze (19 C13). 21/courier-rush shows "blown-out bloom". 23/18 game scene "bloom is overblown". | CONTRACT + DEFAULT |
| A19 | "FXAA" is a thresholded 4-tap cross blur (25% centre + 75% neighbour average), applied after 4× MSAA | `WebGL2Device.ts:3613-3630`; `Renderer.ts:611` | Double AA that blurs edges and texture detail; 17/18 games | BUG |
| A20 | Backing store at 1× DPR by default; no resolution governor | `index.ts:4256, 11133, 12280`; `devicePixelRatioSafe` (`:18699`) is dead | A quarter of the native pixels on 2× displays (13–14/18 games). The capture runner used `deviceScaleFactor: 1`, so 21's screenshots **do not show this loss**; the shipped retina experience is worse than the judged frames. | DEFAULT |
| A21 | **One blend function engine-wide**; `renderState.blend` is a boolean | `WebGL2Device.ts:4404`; `LeanWebGL2Device.ts:4183`; `WebGPUDevice.ts:1826-1844` | Glow, neon, sparks, beams and "additive-glow" particles composite as occluding alpha cards (07 §8.2). `SpriteFlipbook` beam reports `additive: true` (`SpriteFlipbook.ts:119,153`), which nothing honours. | STRUCTURAL (render-state model) |
| A22 | Production bridge draws **zero pixels** for `effects.particles`/rain/snow/flipbook/beam; `game.effects` nodes are never mounted | `index.ts:13722-13723, 3646-3670`; `GameRuntime.ts:2860-2876`; no `.nodes()` caller (16 §4) | 23/14 particles **1 vs 4** ("the scene's entire subject is missing"); 21: missing hit feedback across games; ≥9 routes hand-roll spark pools | CONTRACT (silent no-op API) |
| A23 | Scene "hierarchy" is additive Euler / additive position / component scale | `index.ts:17982-18006` | Agents can only build axis-aligned assemblies. Courier Rush's `group(...).scale([6,6,6])` city collapses, because primitives grow 6× at unscaled positions (19 C6). | STRUCTURAL (flatten-snapshot design) |
| A24 | `createProductionInstanceTransforms` omits `node.size`, so S(size) is applied **outside** the instance translation | `index.ts:14747-14753, 13976`; `ShaderLibraryCore.ts:258-261` | 23/16 instancing 2.5 vs 4.5: the 41.6-unit grid renders at 12.5 units as one overlapped slab. Non-uniform sizes would shear rotated instances. | BUG (confirmed, 22 §16 skeptic) |
| A25 | Shader architecture: hand-concatenated GLSL uber-shaders, 10 hand-named `#ifdef` variants, everything else branched on float uniforms, no feature-hash program key, lighting copy-pasted into ≥5 programs with drift | `ShaderLibrary.ts:2063-2076, 565, 1091, 101, 1643`; `ShaderLibraryCore.ts:291-781, 476-480, 642` vs `ShaderLibrary.ts:2655-2665`; `ForwardPass.ts:681-683` | Each feature needs about 5 edits and drifts. Every program binds every sampler. Lights 17+ are silently dropped in extension variants (`ShaderLibrary.ts:3140-3147`: Gallery Shift about 31 lights, Courier about 20). | STRUCTURAL (largest long-term ceiling) |
| A26 | Extension lobes are heuristics, not KHR lobes: `a3dApplyAdvancedPbrLobes` modulates albedo with constants; sheen adds rim without radiance; anisotropy multiplies all shading by `mix(1,0.18,a)`; `sampledSpecular *= mix(1.1,0.65,r)` | `ShaderChunks.ts:253-327, 428-430`; `ShaderLibraryCore.ts:650, 667, 756` | 23/07 sheen 3 vs 6 ("16 near-identical glossy plastic balls"); 23/04 clearcoat 4.5 vs 6.5 (clearcoat roughness texture ignored, milky veil); 23/05 transmission 3 vs 6 (black glass, also A27) | STRUCTURAL |
| A27 | Import and tint heuristics rewrite authored materials: forced tint wipes BC/MR textures and adds emissive = base × 0.28 by default; unbacked transmission becomes rough plastic; red-paint and "product prop" gates sit in general shaders | `index.ts:13570`; `TypedGLBActor.ts:484-514`; `GLTFRenderResources.ts:1743-1769, 1840`; `WebGPUDevice.ts:3555-3588`; 03 §3.1 | Tinted GLBs become flat, self-lit solids. 23/05: glass → dark plastic. Tint never touches alpha, so "ghosts" render opaque (18 C8). | CONTRACT + BUG |
| A28 | No material-authoring system: `NodeMaterial` is a 20-line data bag, WebGPU uses marker sniffing, and there is no TSL equivalent | `packages/materials/src/NodeMaterial.ts`; `WebGPUDevice.ts:3179-3311` | No triplanar, dissolve, rim, flow, vertex-animated foliage or emissive pulse without hand-written GLSL. Agents fall back to `baseColor` + emissive on primitives (07 §8.6). | STRUCTURAL |
| A29 | Per-draw CPU cost: `new Map` uniforms, `new RenderPipeline` per item, no UBOs, no multi-draw, no parallel shader compile, per-frame instance VBOs (>64 instances or with colours) that leak a VAO each frame | `ForwardPass.ts:249-351, 1744-1816`; `WebGL2Device.ts:4225-4236, 1459-1462`; `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`); budget `maxRecommendedDrawCalls: 180` (`index.ts:4258`) | Pushes content toward sparse primitive scenes. Measured on the macos-14 GH runner (3-vCPU virtual M1, ANGLE Metal; run 37289688772): most games ran at 5–15 fps at 1920×1080 (Courier 7.1, Gravity Post 6.4, Rooftop 7.6, Aura Clash 11.1); only Orbital Defense, Vault Breakers and Aurora Lander reached about 52–60 fps. The runner is virtualized, so absolute fps is not representative; the relative spread is. | STRUCTURAL |
| A30 | Morphs: GPU path limited to ≤64 vertices and ≤4 targets; otherwise a new Geometry is allocated, uploaded and disposed every frame | `ForwardPass.ts:119-120, 313, 347-349, 1841-1853, 1885-1887` | Faces and visemes cost a full CPU re-upload; the budget pressure caps character density | STRUCTURAL |
| A31 | Low-tessellation primitives (sphere 12×16, cylinder 24, torus tube 10, capsule = sphere; no UVs or tangents on cylinder/torus) | `index.ts:17359-17362, 17477-17479, 14979` | 685 `primitives.*` vs 112 `model()` calls in the games (06 §0.5), so most pixels are faceted, untexturable meshes | DEFAULT |
| A32 | Fog: default density 0.12 capped at 0.525, giving ≈40% haze at 10 m; resolved from the **static snapshot's first fog node** | `index.ts:3442-3448, 12740-12759` | Flattened contrast. Skyline's five act fogs freeze at act 0 (18 §2). 23/09: "greyed-out haze". | DEFAULT + BUG |
| A33 | Light units: ambient ≈ π× three.js; point intensity default 2, range 10×scale, `d² ≥ 1` clamp; spot `decay` ignored; an implicit direct light is injected when none is authored | `ShaderLibraryCore.ts:622-634, 733-735`; `index.ts:3088, 13244`; 22 §14 | Ambient washes out directional cues; point lights barely register. 23/14: an authored dark scene is lit anyway. | CONTRACT |
| A34 | Depth: 0.05/100 default, single-sample path uses DEPTH16, no reversed-Z or log depth | `RootRuntimeSupport.ts:16-21`; `WebGL2Device.ts:654-690` | Precision waste and z-fighting risk on large levels; it also feeds A13 | DEFAULT |
| A35 | WebGPU backend: GLSL marker sniffing selects hand-written WGSL; unknown shaders become flat unlit; fixed light `normalize(0.36,0.52,0.78)` × 2.25; Duck-colour gates; 4-instance cap; one encoder, buffer, bind group and submit per draw, plus a CPU software raster | `WebGPUDevice.ts:3179-3311, 3555-3588, 3665, 3765, 3863-3868, 1789-1981, 1150` | Zero effect on the games (the root hard-codes webgl2 at `index.ts:13590`). Switching to it would make them look worse. | STRUCTURAL (sunk cost) |

Benchmark failures with no attributed cause yet (23/01 and 23/12: a missing cylinder cap from the same GLB; 23/02: the product pedestal renders translucent and artifacted; 23/18: a shadow streak band across the ground) are recorded as implementation bugs pending root cause.

---

### C.5 MVP shortcuts that became ceilings

| Shortcut (why it was taken) | What it now blocks | Evidence |
|---|---|---|
| A **bridge** that translates the scene snapshot into `Renderer` calls, with quality policy hard-coded inside it (env choice, ACES@1, shadow strength by name, bloom clamps, `backend:"webgl2"`, no background) | Every quality knob sits in a constant the public API cannot reach. Fixing a look means editing a 13k-line file, and harnesses that call `Renderer` directly prove features the games cannot get. | `index.ts:12523-14006`; 14 §3.5 |
| Silent `try/catch` fallback to a second, raw-GL renderer | Any exception changes the game's look; there is no single renderer to own quality | `index.ts:12543-12549`; 13 §2.3 |
| Forked `LeanWebGL2Device` and lean base with inert intents, to hit a bundle-size gate | Templates agents scaffold from start unlit, with no rotation, and every device fix has to be made twice | `LeanWebGL2Device.ts`; `lean/src/base.ts:250-260, 521-523`; 13 §2.2 |
| Uber-shaders branched on float uniforms, plus copy-paste per material family | Feature-keyed variants, a consistent BRDF across programs, compile-time stripping, and any material extension | A25 |
| A single static depth shader | Correct shadows for skinned, instanced, batched, morphed and alpha-tested content | A6 |
| Shadow box fit to visible item bounds | Stable, camera-frustum-fitted, cascaded shadows; off-screen casters | A7, A8 |
| CPU point-shadow atlas | GPU cube shadows | A11 |
| Post kernels written to bit-match a CPU reference (integer LUTs, "squareWords" arithmetic, 05 §0.6), placed after tone mapping | HDR SSAO, SSR and TAA; correct DOF/bokeh energy | A12–A15 |
| CPU-generated LDR procedural environment | Bright reflections, roughness response and any default IBL quality | A2, A3 |
| CPU PMREM with an average-blend fudge, chosen because it passes "variance decreases with mip" checks | Directional diffuse IBL and clean rough specular | A4 |
| `lights.ambient` treated as an alternative environment branch | IBL in 15/18 games | A1 |
| Flattened additive transform composition | Hierarchical assemblies, rigs and rotated groups | A23 |
| `pixelRatio: 1` hard-coded in every profile | Native resolution | A20 |
| `blend: boolean` render state | Additive and premultiplied VFX | A21 |
| Effect nodes accepted as typed API with "non-pixel-backed" warnings | Particles, weather, flipbooks, beams and feel feedback in production | A22 |
| Per-draw allocation-heavy submit path (no UBO, no persistent instance buffers) | Scene density beyond about 180 draws; frame rate | A29 |
| Name-inferred scene categories feeding renderer constants | Predictable shading; it also makes benchmark results depend on node names | A10; 22 §17 |

---

### C.6 Fake parity register (merged from 03, 04, 05, 07, 13, 14, 15; corrected by 19)

Verdict key: **FABRICATED** (not produced by the engine) · **LABEL** (hand-authored status) · **SELF-REF** (checks its own config, labels or strings) · **LOOSE** (real render, threshold cannot discriminate quality) · **LIVENESS** (renders / no errors only) · **HARNESS-ONLY** (works on a path games do not take) · **UNREACHABLE** (code exists; the product path never runs it) · **STUB** (named like a feature, does no work) · **HEURISTIC** (named like a capability, computes a guess) · **ROUTE-LOCAL** (one-off code counted as engine capability).

| # | Claimed capability | Where claimed | What really backs it | Verdict |
|---|---|---|---|---|
| 1 | 13-scene three.js visual parity, scores 0.82–0.93 | `three-compat:compare-threejs` (`package.json:335`) → `three-compat:release` | Constants in `benchmarks/three-compat/shared/scenes.ts:22-34`; Canvas2D paintings shifted 18 px (`tests/browser/three-compat-threejs-visual-parity.spec.ts:64-100`) | FABRICATED (19 C18 confirmed) |
| 2 | Aura faster than three.js (e.g. 11.4 vs 15.9 ms) | `tools/three-compat-threejs-runtime-parity` | The same constants injected into `window.__runtime` | FABRICATED |
| 3 | Three.js broad-replacement readiness | `tools/three-compat-broad-replacement-readiness/index.ts:16` | Consumes #1 | FABRICATED (transitive) |
| 4 | Production-runtime three.js parity | `production-runtime-threejs-*-parity.json` | `renderA3DScene(s){return 'a3d:'+s}` (`benchmarks/production-runtime/aura3d/renderScene.ts:2`) | STUB |
| 5 | 54/54 three.js examples "matched", 22 categories, 0 partial | `docs/project/parity/threejs/parity-matrix.md`; `README.md:218` | Literal `"matched"` in `tools/threejs-parity-threejs-inventory/index.ts`; `visualStatus` derived from it (`:251-256`) | LABEL + SELF-REF |
| 6 | "graphics-and-visual-quality: parity" | `tools/superiority-visual-quality/index.ts:7-22` | #5 plus report pass flags | SELF-REF |
| 7 | WebXR ballshooter/dragging/AR matched | inventory `:177-179` | Injected XR session; Canvas2D preview "not Aura3D rendering evidence" | LABEL (mocked) |
| 8 | WebGPU rtt/compute/materials/instancing matched | inventory; `wow-webgpu-*` | Marker-sniffed WGSL; `wow-webgpu-instancing` issues 160 separate draws (`src/main.ts:44-58`); WebGPU instancing capped at 4 | LABEL |
| 9 | WebGPU Duck product-viewer parity | `wow-webgpu-product-viewer` evidence | Hue gates replacing albedo with Duck colours, fixed light, ×2.25 (`WebGPUDevice.ts:3555-3588, 3665, 3765`); per-route material clamps (`src/main.ts:51-66`) | FABRICATED (asset-tuned) |
| 10 | WebGPU sync pixel proof | `renderImportedAsset` | Returns the CPU software raster, not GPU output (`WebGPUDevice.ts:804-842, 1150`) | FABRICATED |
| 11 | WGSL "PBR" / skybox foundation | `docs/rendering/webgpu-current-architecture.md` | `pbr.wgsl` = `abs(normal)`; `skybox.wgsl` = constant colour | STUB |
| 12 | `webgpu-lab`, `production-webgpu-starter`, `showcase-webgpu-particle-lab` | route and template names | Render WebGL2 | LABEL |
| 13 | PBR material parity vs three/Babylon (11 extensions) | `tools/external-parity-pbr-visual-parity` | MAE ≤ 64, ≤ 82% changed (`:584-587`); the three.js side has no environment; 23/04, /05 and /07 show clearcoat, transmission and sheen failing on identical inputs | LOOSE |
| 14 | Shadow visual parity | `tools/external-parity-shadow-visual-parity` | MAE ≤ 72, ≤ 86% changed (`:578-579`); 23/08, /12 and /15 show shadows missing or 9% vs 50% | LOOSE |
| 15 | three.js shadowmap PCF parity | `tools/threejs-parity-shadowmap-parity` | `pcfCoverage` = harness config self-report (`:119`); "SSIM proxy" = `1-meanDelta/255 ≥ 0.4` (`:338`) | SELF-REF + LOOSE |
| 16 | Diagnostic `mapType: "pcf-soft"` / quality preset `shadowMap:"pcf-soft"` | `index.ts:4614`; `renderer.qualityPresets()` | Runtime always uses `filter:"pcf"` (`index.ts:12971`), NEAREST manual compare | LABEL |
| 17 | Cascaded shadow maps (stable fits, hysteresis) | `rendering/src/shadows/*`; `apps/shadow-cascade-evidence` | Real, but unreachable from root (A8); `CascadeHysteresis.ts` has no consumer | UNREACHABLE |
| 18 | GGX-prefiltered default environment mips | `specularFilterModel: "ggx-importance-sampled…"` (`EnvironmentMapResources.ts:570`) | Never sampled on WebGL2 (non-mip sampler, `ExternalParityRenderPreset.ts:169`); on WebGPU, nearest-mip only | UNREACHABLE (19 C10: WebGL2-specific) |
| 19 | Diffuse irradiance "sh9-cosine-convolved" | diagnostics `diffuseIrradianceModel` | Computed and reported; no shader binds it | UNREACHABLE |
| 20 | Unit test proves "IBL cube sampling" | `tests/unit/rendering/shader-library.test.ts:131, 155` | The fragment source contains `textureLod(u_environmentCubeMapTexture` | SELF-REF (string) |
| 21 | `ReflectionProbe` | `rendering/src/ReflectionProbe.ts` | Raw cube capture: no prefilter, no selection, no consumers | STUB |
| 22 | Rect/softbox area lights | shader integrator | The root emits spot proxies | UNREACHABLE |
| 23 | Spot `decay` | public light options | Accepted, ignored | STUB |
| 24 | Exposure control (`sceneExposurePresets`, `colorGrade.exposure`, overlay `tone: aces-filmic @ <exposure>`) | `index.ts:4204-4214, 3549, 18657` | Renderer always uses 1 (`index.ts:12898-12904`); warning at `:4547` | LABEL |
| 25 | AgX / Neutral tone mapping | `ToneMappingOperator` union; `WebGL2Device.ts:3541-3550` | Per-channel smoothstep / rational curve; never selected on root | STUB |
| 26 | "FXAA" | `effects.antiAlias({mode:"fxaa"})` | 4-tap cross blur (`WebGL2Device.ts:3613-3630`); the WebGPU version is a 2-tap directional blend described as "FXAA 3.11 console core" | STUB |
| 27 | SSAO / `ambientOcclusion` / `contactOcclusion` | effects API, 7 games | Raw-depth kernel ≈ 0 beyond 2 m (19 C14); `runExternalParitySSAO` defaults to a synthetic square depth buffer (`SSAOPass.ts:12-20`) | STUB |
| 28 | Contact shadows | diagnostics | Counted from node **names** ("contact shadow", "footprint", "glow pool", `index.ts:4485-4487`); `shadows.contact` is a translucent dark cylinder (`index.ts:2366-2385`) | HEURISTIC |
| 29 | `EffectComposer`, cinematic `Bloom/Vignette/FilmGrain/DepthHaze` passes | `postprocess/EffectComposer.ts`; `cinematic/*Pass.ts` | JS readback kernels / data descriptors with `rendererOwnedEvidence` flags | STUB |
| 30 | Bloom colour, LUT grading | `bloom.color`, `colorGrade.lut` | Accepted and dropped; no 3D textures exist | STUB |
| 31 | Additive glow (`materialMode:"additive-glow"`, beam `additive:true`) | `index.ts:3707`; `SpriteFlipbook.ts:119,153` | No additive blend exists (`WebGL2Device.ts:4404`) | STUB |
| 32 | `effects.particles` visible particles | API; `showcase-webgpu-particle-lab` README | Production bridge draws 0 pixels (`index.ts:13722`); 23/14: 1 vs 4 | STUB (silent no-op) |
| 33 | GPU particles `particles.diagnostics().gpuReady`, `estimatedUpdateCostMs` | `index.ts:8344-8358` | `total >= 1000 && texturedBillboard`; a linear formula | HEURISTIC |
| 34 | Compute particles `createRootGpuParticleWorkload` | `production-runtime` export | GPU dispatch → full readback → CPU vertex rebuild; no consumer | HARNESS-ONLY |
| 35 | Water reflections "tie" vs three | 3.0.1 matrix `water-reflections` | Route-local constant-colour horizon band (`showcaseShaders.ts:290-367`); engine says "no planar reflection … unsupported" (`WaterSurface.ts:83-91`) | ROUTE-LOCAL + LOOSE |
| 36 | Transmission | `TransmissionPass.ts`; KHR matrix | `evaluateExternalParityTransmission` is a CPU function on one RGB sample; every interactive variant defines `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` | STUB (03 §13) |
| 37 | Advanced PBR lobes (sheen, clearcoat, iridescence, anisotropy "browser-proven") | `PhysicalMaterialSpec.ts:43-52`; `PRODUCTION_PBR_SHADER_FEATURES` all `true` | `a3dApplyAdvancedPbrLobes` computes five lobes and returns none (`ShaderChunks.ts:253-327`); the "proof" is that pixels change under rotation | STUB |
| 38 | glTF `KHR_materials_ior`, `KHR_texture_transform` "runtime-supported"; Draco/Meshopt/KTX2 | `GLTFExtensionSupport.ts:39-68` | IOR is not in F0; transform is base-only in skinned shaders; the app path supplies no decoder; KTX2 sRGB decodes as linear | LABEL |
| 39 | Node materials | README; `NodeMaterial.ts` | 20-line data bag, no codegen | STUB |
| 40 | Performance helpers `Batcher`, `BVH`, `Octree`, `FrustumCuller`, `LOD` | `rendering/src/index.ts:1163-1166` | `createFlatOctree = {bounds, items}`; no engine call sites | STUB |
| 41 | Quality profiles (`safe-basic`/`production`/`cinematic`) with antialiasing, `blockedInRoot`, `requestedFeatures` | `index.ts:4248-4309` | Only `pixelRatio` is live; `safe-basic` "blocks" a post chain that runs anyway | LABEL |
| 42 | `sceneKitPerformanceBudgets` (draw calls, p50 fps) | `index.ts:9681-9692` | Literal table | LABEL |
| 43 | three-compat layer ("faithful" ledger rows; `ThreeToA3DAdapter`) | `ApproximationLedger.ts`; `migration/ThreeToA3DAdapter.ts:18` | No imports from rendering; geometries generate no attributes; the rewrite target `createThreeCompatRenderer` does not exist; templates are 2-line stubs | STUB |
| 44 | Same-scene three.js parity incl. "large-scene performance" | `tools/external-parity-threejs-visual-parity` | "Close" = channel Δ < 96; the large scene is byte-identical to the gallery scene; setup-line counts are constants | LOOSE + FABRICATED |
| 45 | 15/15 r185 head-to-head workloads pass | `docs/project/threejs-superiority-status.md` | Correctness checks only; 6/11 verdict strings admit "visible aura lighting loss"; the reference scenes have shadows off, ambient 0.35 and 87–99% near-black pixels | LIVENESS |
| 46 | 3.0.1 visual superiority targets met | `muse3jsparity-301-visual.spec.ts:124-129` | 1 win (text), 5 ties, 1 loss; a vacuous `.every` over the wins; SSIM computed but ungated | SELF-REF |
| 47 | Game Visual QA 17/17 PASS | `AURA3D-VERIFICATION-MATRIX.md:160-203` | Non-blank canvas + 0 errors + state change; it notes "washed-out grey" and "bloom blowout" while passing | LIVENESS |
| 48 | CI visual baseline | `pnpm test:visual` → `tools/visual-baseline` | A fixture with 2 distinct pixels; no golden images anywhere | LIVENESS |
| 49 | `compare-engines` visual gate | `tools/compare-engines/index.ts:2110` | `maxChangedPixelRatio: 1` cannot fail; renders box grids, not the named scenes | FABRICATED (metric) |

Pattern (14 §3.11, 15 §7): the honesty cleanups reworded claims and deleted the worst fabrications. None of them added a perceptual bar, and the comparison loop tuned Aura toward a dark three.js contract scene. Every row above was able to pass because no gate captured the shipped `createAuraApp` route with engine defaults and compared it against a well-built reference. The only real, tight comparison is `tools/external-parity-product-visual-parity` (MAE ≤ 8, ≤ 15% changed), plus the new `benchmarks/quality-rebuild/` harness, whose fairness 22 verified.

---

### C.7 Which parts of the architecture impose the current quality ceiling (ranked)

Ranking is by how much of the gap to well-built three.js work each part holds in the shipped frames, and by whether it can be fixed without redesign.

1. **Renderer ownership and the bridge-as-policy design** (A1, A5, A10, A16, A18, A20; C.2 rows 1–3; C.5 rows 1–2). Quality is decided by constants inside `createProductionRuntime*` (`index.ts:12523-14006`): environment branch, ACES@1, shadow strength by node name, bloom clamps, no background, WebGL2 hard-coded, 1× DPR. The renderer underneath can do more than the bridge lets it. Three lighting contracts and a silent fallback renderer mean there is no single place to raise the floor. This ceiling is the root of most of the others: until one renderer with one public lighting/output contract exists, every fix stays route-local or bridge-local.
2. **The environment-lighting pipeline** (A1–A5). This covers ambient replacing IBL in 15/18 games, the LDR 128×64 CPU environment, the mip-0 sampler, the average-blended CPU PMREM, the unbound irradiance, and the missing background. It is the largest per-pixel loss. Modern three.js work starts from PMREM/RoomEnvironment plus `scene.background`, and Aura's default delivers neither. Benchmark scenes that depend on IBL score 3–4 vs 6–7 (23/06, /09, /13).
3. **The shadow subsystem** (A6–A11). Shadow problems are the most frequent cause of lost points in 23: 01, 02, 08, 10, 12, 15, 17 and 18 all cite missing, faint or misprojected shadows. The causes are a static depth shader, a camera-culled fit with no snapping, one shadowed light, unreachable CSM, software NEAREST PCF, and 0.24–0.38 strength. Fixing the strength is a constant change; the rest needs a rewrite of `DepthPass`, the fitter, and how the bridge hands over the camera.
4. **Shader and material architecture** (A25–A28). Runtime-branched uber-shaders, copy-pasted lighting, heuristic extension lobes, asset-specific gates, and no material-graph system together cap every material beyond base metal/rough. Benchmark 04/05/07 score 3–4.5 vs 6–6.5, and stylized looks cannot be built without hand-written GLSL. This is the hardest ceiling to remove, and every new feature makes it worse.
5. **The post chain and compositing model** (A12–A15, A19, A21, A22). This covers LDR byte kernels after tone mapping, raw-depth SSAO, wrong SSR/DOF depth, CPU readback passes (Deep Recovery at 0.5 fps), the fake FXAA, a single alpha-over blend, and effect nodes that draw nothing. Together these remove the "energy" layer (glow, sparks, particles, grounding AO) that modern browser games depend on (23/14: 1 vs 4; 21: missing feedback is a common thread across games).
6. **Draw submission and scene representation** (A23, A24, A29, A30, A31). Per-draw allocations, no UBOs or persistent instance buffers, the VAO leak, CPU morphs, the flattened additive-Euler scene graph, the instancing size bug, and 12×16 primitives. Together they cap scene density and composition, which pushes agents toward sparse, axis-aligned primitive scenes. Measured fps is 5–15 for most games on the capture runner.
7. **Resolution and AA defaults** (A19, A20). These are cheap to fix and large in shipped perceived quality on retina displays. They are under-weighted by the judged screenshots, which were captured at `deviceScaleFactor: 1`.
8. **WebGPU** (A35). It imposes no ceiling on today's frames, because games never select it. It matters strategically: in its current form it is not a path to a higher ceiling and should not be counted as one.

Keep these subsystems; they are sound: the RGBA16F + MSAA targets and resolve (`WebGL2Device.ts:640-785`), the core BRDF and multi-scatter split-sum (`ShaderChunks.ts:43-245`), the fitted ACES matching three.js (`WebGL2Device.ts:3495-3517`), the glTF texture/sampler plumbing (sRGB, trilinear, 8× anisotropy), the HDRI RGBE → RGBA16F path (with a GPU PMREM replacing the CPU one), skinning palettes, render-queue sorting, the native bloom pyramid (with its contract changed), and the CSM code in `CascadedShadowMaps.ts`, once a real camera reaches it.
