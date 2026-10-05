# 07 — WebGPU, GPU Architecture and Performance Audit

Branch: `aura3d-quality-rebuild/audit` · Date: 2026-10-05 · Scope: WebGPU backend, shader language and material system across backends, render graph, compute and GPU particles, instancing, batching, culling, LOD, occlusion, texture streaming, draw-call cost, WebGL2 uniforms and state caching, shader compile hitching, memory management, quality tiers and performance budgets.

Method: I read the implementation only (shader strings, the per-draw submit path, default values, and the call sites in the engine, apps and templates). I gave no credit to READMEs, tests, `route-health.json` or evidence JSON unless the code backed them. I ran no browser, dev server or test suite. The comparison baseline is the installed `node_modules/three@0.185.1` (r185) plus my knowledge of how `WebGPURenderer`, `WebGLRenderer` and TSL work.

---

## 0. Bottom line

1. **None of the 18 showcase games uses WebGPU.** Root `createAuraApp` mounts `ProductionRuntimeRenderer.create({ backend: "webgl2", … })`, hard-coded at `packages/engine/src/agent-api/index.ts:13586-13597`. No showcase passes a backend; `rg` finds `backend: "webgpu"` only in the five `wow-webgpu-*` diagnostic routes. WebGPU therefore adds zero pixels to the games the owner is judging. The "Atari look" comes entirely from the WebGL2 path and its defaults.
2. **The WebGPU backend is not a renderer. It is a GLSL-to-WGSL lookup table driven by regex.** `createNativeShaderSources` (`packages/rendering/src/WebGPUDevice.ts:3179-3311`) looks for marker substrings in the GLSL source (`"instanced-pbr"`, `"pbr-textured"`, `"pbr-direct"`, `"skinned-unlit"`, `"morph-unlit"`) and swaps in hand-written WGSL. Every other shader silently becomes **flat `u_draw.color`, unlit and unskinned**. That covers `skinned-lit`, `animation-toon`, `environment-background` (the sky), `pbr-normal-map`, `instanced-unlit` and `screen-space-line`. There is no TSL, no node graph and no shared material IR.
3. **The WebGPU PBR shader carries hacks tuned to one test asset.** It hard-codes a single light direction `normalize(vec3(0.36, 0.52, 0.78))` (`WebGPUDevice.ts:3665`) and multiplies direct light by a magic `2.25` (`:3765`). It also contains `productPropBodyGate / productPropOrangeGate / productPropAlbedo` (`:3555-3588`). These functions detect yellow and orange albedo and replace it with `vec3(1.0, 0.88, 0.012)` and `vec3(1.0, 0.24, 0.018)`, which are the Khronos **Duck** body and beak colours. They switch on through `u_productColorSmoothing`, which is set only by `apps/wow-webgpu-product-viewer/src/main.ts:59`, the Duck route. That route also clamps every material to roughness ≥ 0.88, metallic ≤ 0.04 and env specular 0.08 (`:51-66`). This is parity evidence manufactured for one asset.
4. **The WebGPU submission model is pathological.** Each `draw()` does the following (`WebGPUDevice.ts:1789-1981`):
   - creates a new command encoder;
   - allocates and uploads a new 8,208-byte uniform buffer (`new Float32Array(2052)` at `:2201`) and destroys it afterwards;
   - creates a new bind group and new samplers;
   - begins a new render pass with `loadOp: "load"`, issues one draw, ends the pass and calls `queue.submit()`.

   On top of that, the same draw is **software-rasterized triangle by triangle on the CPU** into a shadow `colorPixels` array (`rasterizeDraw`, `:1150` and `:1719-1787`) whenever a render target is bound. The HDR and postprocess path always binds one. The sync `readPixels()` returns those CPU pixels, not GPU output (`:804-842`).
5. **WebGL2, which is what games actually use, is a 2012-era immediate-mode renderer.** It has:
   - no UBOs and no `KHR_parallel_shader_compile`;
   - no `WEBGL_multi_draw`;
   - synchronous compile and link at first draw, with no warm-up;
   - per-draw `new Map` uniform construction and full re-upload of every uniform with no value cache;
   - **one blend function in the entire engine** (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, `WebGL2Device.ts:4402-4405`). Additive blending does not exist, yet `SpriteFlipbook.createBeamDescriptor` returns `additive: true` (`SpriteFlipbook.ts:119,153`). Glow, neon, sparks, muzzle flashes and beams cannot render as light. They render as dimming alpha cards. This is a direct cause of the flat, early-console look.
6. **The default backing-store resolution is 1× CSS pixels.** The default quality profile is `"safe-basic"` with `pixelRatio: 1` (`agent-api/index.ts:4249-4257`). It is applied at `:11133` as `options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe()`. Because the profile always defines `pixelRatio`, the DPR fallback is dead code. On a 2× display the 15 showcases that set no `pixelRatio` render a quarter of the native pixels. Skyline Runner sets `pixelRatio: 0.7` (`apps/showcase-skyline-runner/src/main.ts:1879`), and Turbo Drift and Data Galaxy set `1`. Upscaled, soft and aliased output is the single cheapest explanation of the "low-generation" feel.
7. **Instancing and batching leak GPU objects every frame.** For instanced items with more than 64 instances, or with per-instance colours or attributes, `ForwardPass.applyInstanceBinding` creates new vertex buffers every frame and disposes them afterwards (`ForwardPass.ts:1755, 1803, 346`). WebGL2's VAO cache is keyed on `buffer.id` (`WebGL2Device.ts:4225-4236`) and evicts only in `dispose()` (`:1459-1462`). Every frame therefore adds a new VAO per such draw that is never deleted. `this.buffers` (`:498`) also only grows. "Static batching" is rebuilt every frame from dynamic model matrices (`Renderer.ts:2361-2385`) and is capped at `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`).
8. **The performance and quality-tier infrastructure is mostly declarative.**
   - `sceneKitPerformanceBudgets` (`agent-api/index.ts:9681-9692`) is a literal table of `estimatedDrawCalls` and `targetP50Fps` values, not measurements.
   - `collectParticleBudgetDiagnostics` computes `estimatedUpdateCostMs = total*0.00018 + n*0.04` and `gpuReady = total >= 1000 && texturedBillboard` (`:8344-8358`), a heuristic named like a capability.
   - There is no adaptive quality, GPU tiering, auto-DPR or frame-time controller. `AuraPerformanceQuality` is an opt-in WeakMap that only one showcase sets.
   - `Batcher`, `BVH`, `Octree`, `FrustumCuller` and the `LOD` helpers in `packages/rendering/src/performance/` are exported (`index.ts:1163-1166`) but have no engine call sites.

The WebGPU effort (46 browser specs, 10 `tools/webgpu-*` audit tools, about 10 WebGPU commits and a parity matrix) has produced **narrow probes**: triangle, render target, unlit and limited-PBR GLB, post chain, and a standalone resident compute-particle demo. It has not produced a backend at feature parity, and **none of it can improve the games, because games never select it.**

---

## 1. Backend reality map

| Layer | File:line | What it is | Verdict |
|---|---|---|---|
| `createRenderDevice` | `packages/rendering/src/RenderBackend.ts:17-50` | `backend ?? "webgl2"`; WebGPU is a dynamic import | Default WebGL2 |
| Root app mount | `packages/engine/src/agent-api/index.ts:13586-13597` | `ProductionRuntimeRenderer.create({ backend: "webgl2", antialias: true, preserveDrawingBuffer: true })` | **Hard-coded WebGL2** for every `createAuraApp` route |
| `ProductionRuntimeRenderer` | `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts:57-90,190+` | Supports `"webgl2" \| "webgpu" \| "auto"` | Plumbing exists; unused by root |
| `production-runtime/backends/webgpu/*.ts` (Buffer, Capabilities, RenderTarget, Shader, Texture) | each file is 2 lines | `class WebGPUBuffer { readonly backend='webgpu'; constructor(readonly descriptor) {} }` | **Empty shells.** The same applies to `backends/webgl2/*` |
| `WebGPURendererBackend` | `production-runtime/backends/WebGPURendererBackend.ts:8-24` | Wraps only `createProductionWebGPUReport()` (an availability report) and does not implement `RendererBackend.renderImportedAsset` | Report, not renderer |
| `shaders/wgsl/pbr.wgsl` | 3 lines | `return vec4<f32>(abs(input.normal), 1.0);` | Placeholder "PBR" (normal visualiser) cited as the WGSL foundation of `textured-pbr` and `spot-shadows` in `docs/rendering/webgpu-current-architecture.md` |
| `shaders/wgsl/skybox.wgsl` | 2 lines | `return vec4<f32>(0.45, 0.55, 0.7, 1.0);` | Constant colour |
| `shaders/wgsl/postprocess.wgsl` | 42 lines | Real TAA (neighbourhood clamp, depth reject) mirroring `webgpu/WebGPUTemporal.ts` | Real but isolated |
| `webgpu/WebGPUPipelineCache.ts` | 15 lines | Generic `Map` memoiser; the device has its own per-shader map | Unused abstraction |
| `webgpu/WebGPUBuffer.ts`, `WebGPUTexture.ts`, `WebGPUCompute.ts` | 1–2 lines each | Re-exports | Façade files |
| Actual WebGPU device | `packages/rendering/src/WebGPUDevice.ts` (4,001 lines) | Implements `RenderDevice` against the GL-shaped `DrawCommand` | Where all real WebGPU code lives |
| `apps/webgpu-lab` | `src/*.ts` (31 lines total), README line 3 | "renders through the WebGL2 baseline and reports WebGPU availability" | **WebGL2 app with a WebGPU label** |
| `templates/production-webgpu-starter` | `src/main.ts` | `workflow: "starter with production WebGL2 output and an honest WebGPU availability report"` | **WebGL2 template with a WebGPU label** |
| `apps/showcase-webgpu-particle-lab` | `src/main.ts:90` `createAuraApp(...)`, README §Remediation | Demoted; renders `effects.particles` on WebGL2 | Honestly demoted, misleading route name |
| `apps/wow-webgpu-instancing` | `src/main.ts:44-58` | 160 separate `RenderItem`s, no `instanceTransforms` | **"Instancing" demo that does not instance** |
| `apps/wow-webgpu-compute-particles` | `src/main.ts:373-396` | `ResidentGPUParticleRenderer` on its **own canvas** | Real compute, does not compose with the scene renderer |

### Selection-ladder grading

| Capability | exists | technically works | public API | used by generated apps | good defaults | composes | modern quality | agents know | examples demonstrate |
|---|---|---|---|---|---|---|---|---|---|
| WebGPU render backend | Y | partial (5 shader families) | Y (`Renderer.create({backend})`) | **N** (root hard-codes webgl2) | N | N (silent unlit fallback) | N | N | 5 narrow `wow-webgpu-*` probes |
| WGSL generation / node system | **N** (marker → hand-written WGSL) | n/a | `PortableShaderMaterial` (hand-written GLSL plus WGSL pair) | N | n/a | N | N | N | head-to-head TSL bench only |
| `NodeMaterial` | 20-line data bag (`packages/materials/src/NodeMaterial.ts`) | N (no codegen) | exported | N | — | — | — | README claims "node materials" | none |
| Render graph | `RenderGraph.ts` (194 lines; topological sort); `FrameGraph` façade | Y (ordering only) | Y | Renderer uses it for 2 passes (`Renderer.ts:650-677`) | — | no aliasing or transient pooling | — | — | — |
| WebGPU compute (round-trip) | `GPUParticleBackend.ts` | Y | Y | `createRootGpuParticleWorkload` only | N (per-call alloc and readback) | partial | N | — | compute-particles route |
| Resident GPU particles | `ResidentGPUParticleRenderer.ts` (522 lines) | Y | exported | N | — | **N** (own canvas) | demo-grade | N | 1 route |
| WebGL2 instancing | Y | Y | `instances.*` | some games (Rooftop, Courier, Blockfall) | **N** (≤64 uniform path; >64 leaks VAOs) | partial | — | skill mentions | — |
| Frustum culling | Y | Y | `frustumCulling` | Y (root sets `true`, `index.ts:13995`) | Y in root, opt-in elsewhere (`Renderer.ts:2224`) | Y | — | — | — |
| LOD | `distanceLod` primitives; `performance/LOD.ts` | partial | Y | 4 games | N | — | — | — | — |
| Occlusion culling | **N** | — | — | — | — | — | — | — | — |
| Multi-draw / indirect / BatchedMesh equivalent | **N** | — | — | — | — | — | — | — | — |
| UBOs (WebGL2) | **N** | — | — | — | — | — | — | — | — |
| Parallel shader compile / warm-up | **N** | — | — | — | — | — | — | — | — |
| Blend modes beyond alpha | **N** | — | `additive: true` descriptor flag | — | — | — | — | — | — |
| Texture streaming | "M2 streaming distances" residency hint plus async "textured upgrade" (`index.ts:13600-13612`) | partial | — | Y | first frames scalar-only | — | — | — | — |
| GPU timing | `RendererTiming.ts:165` `EXT_disjoint_timer_query_webgl2` with CPU fallback | Y | Y | diagnostics only | — | — | — | — | — |
| Quality tiers | profile table plus `AuraPerformanceQuality` | Y | Y | 1 game (`turbo-drift`) sets `performanceQuality` | **N** (safe-basic: DPR 1) | — | — | — | — |

---

## 2. The WebGPU backend in detail

### 2.1 Shader "translation" by marker sniffing

`WebGPUDevice.createShaderProgram` (`:612-641`) passes the GLSL `ShaderSources` to `createNativeShaderSources` (`:3179`):

```ts
if (sources.webgpu && sources.portableBindings) → use author WGSL (PortableShaderMaterial)
if (/@(vertex|fragment|compute)/.test(...))     → passthrough WGSL
if (marker.includes("instanced-pbr"))           → nativeInstancedPbrShader
if (marker.includes("pbr-textured"))            → nativeTexturedPbrShader (+atlas if regex finds u_extensionScalarAtlas)
if (marker.includes("pbr-direct"))              → textured or untextured PBR
if (marker.includes("skinned-unlit"))           → nativeSkinnedUnlitShader
if (marker.includes("morph-unlit"))             → nativeMorphUnlitShader
if (/sampler2D/ && /location=2 in vec2/)        → "generated-texture": color * texture * vertexColor (unlit)
else                                            → "generated-basic":  return u_draw.color (* vertexColor)
```

The complete set of engine shader markers is: `animation-toon, depth, environment-background, instanced-pbr, instanced-unlit, morph-unlit, pbr-direct, pbr-normal-map, pbr-textured, screen-space-line, skinned-lit, skinned-lit-8, skinned-unlit, skinned-unlit-8, textured-unlit, unlit`. **Only five have real WGSL equivalents.** Consequences on WebGPU:

| GLSL material | WebGPU result |
|---|---|
| `SkinnedLitMaterial` (`skinned-lit`) | Does not match `"skinned-unlit"`. It falls through to the texture or basic path: **no skinning (bind pose) and no lighting** |
| `AnimationToonMaterial` | Flat colour |
| `EnvironmentBackgroundPass` sky | Flat `u_draw.color` (no HDR sky) |
| `pbr-normal-map` | Drops to unlit texture or flat colour |
| `ScreenSpaceLineMaterial` | Flat colour, no screen-space widening |
| Any custom GLSL | Flat colour, silently. There is no error and no diagnostic beyond the counters |

Three.js r185 for comparison: every material is a NodeMaterial graph compiled by `WGSLNodeBuilder` or `GLSLNodeBuilder` from one source, so lighting, skinning, morphs, fog, shadows, tone mapping and colour space are identical on both backends by construction (`node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js`, `.../webgl-fallback/nodes/GLSLNodeBuilder.js`).

### 2.2 What the "native PBR" WGSL actually computes (`WebGPUDevice.ts:3660-3780`)

- **Single hard-coded light:** `let lightDirection = normalize(vec3<f32>(0.36, 0.52, 0.78));` (`:3665`). Scene directional, point and spot lights are ignored unless `u_clusteredLightEnabled` is set, in which case direct light is *replaced* by a Lambert-only cluster loop with no specular (`:3738-3766`).
- `legacyDirect = (diffuse + specular) * nDotL * 2.25 * shadow` (`:3765`). The 2.25 is a magic gain standing in for light intensity and colour.
- **Ambient:** `baseColor * u_draw.params.z * (0.28 + 0.72 * (n.y*0.5+0.5))` (`:3710`), a hemisphere fake.
- **IBL:** samples an **equirect** texture with `mip = roughness * (mipCount-1)` and diffuse at the last mip (`:3715-3720`). That is not PMREM. A box-filtered mip chain is not GGX-convolved, so rough metals look blurry and smeared. Three.js uses PMREM cube-UV with a GGX prefilter on both backends.
- **Transmission:** `mix(opaque, opaque*0.22 + transmittedTint, transmission)` with alpha clamped to 0.22. This is a look-alike, not refraction.
- **Duck gates** (`:3555-3588`, applied at `:3675-3678` and `:3768-3773`): albedo is replaced by fixed yellow and orange constants, and normals are flattened toward `+Y` by `0.46–0.84`, whenever the material colour is warm. Default `u_productColorSmoothing` is 0, so this is off by default, but its existence in the general PBR shader shows the parity evidence was tuned per asset.

### 2.3 Instancing on WebGPU is capped at 4

`nativeUniformStruct` (`:3420-3466`) has `instance0..instance3`. `instanceMatrix(index)` (`:3863-3868`) returns `instance0` for any `index > 3`. The packer uploads `uniformMat4Array(instanceMatrixValue, 4)` (`:2240-2243`). ForwardPass sends up to 64 instances through the uniform path, so on WebGPU instances 4–63 **all render at instance 0's transform**. Three.js uses an `instanceMatrix` storage or attribute buffer of unlimited size.

### 2.4 Per-draw cost (`submitNativeRenderPass`, `:1789-1981`)

Per draw call:

1. `createCommandEncoder`.
2. `createNativeDrawUniformBuffer`: `new Float32Array(2052)`, which is 8,208 B, then `device.createBuffer`, `queue.writeBuffer`, and `buffer.destroy()` after submit. The size comes from one monolithic struct: MVP, colour, params, 4 instance matrices, 2 legacy joints, 8 morph vec4s, 96-joint palette, 2×32-tap PCF tables and so on, **for every draw including an unlit cube**.
3. `createNativePbrTextureBindings`. The fallback textures call `device.createSampler({...})` per draw (`:2186`), and the render-target lookup linearly scans `this.renderTargets` per texture (`:2023`).
4. `createBindGroup` with up to 19 entries, using `layout: "auto"` (`:1833`). With an auto layout, bind groups cannot be shared across pipelines.
5. `beginRenderPass` with `loadOp: shouldClear ? "clear" : "load"`, then one draw, `pass.end()`, and `queue.submit([encoder.finish()])`.
6. `rasterizeDraw` on the CPU.

At 200 draws that is 200 render passes (each a full tile load and store on Apple and mobile GPUs), 200 submits, about 1.6 MB of transient uniform buffers, 200 bind groups and hundreds of samplers **per frame**. Three.js `WebGPUBackend` encodes all draws of a `render()` into **one** render pass and one submit. It keeps a persistent per-object uniform buffer updated only on change (`UniformsGroup` and `Bindings`), reuses bind groups by cache key, and offers render bundles (`BundleGroup`). Aura's own docs measured render bundles and recorded "Zero engine call sites" (`docs/rendering/webgpu-current-architecture.md`, render-bundles row).

Pipeline state on WebGPU is also incomplete. `primitive: { topology }` (`:1850`) has **no `cullMode` and no `frontFace`**, so back faces are always rasterized. Blending is a single alpha-over state (`:1838-1845`). Canvas presentation has no MSAA (`sampleCount` comes only from the render target).

### 2.5 CPU shadow rasterizer and "pixel proof"

`draw()` calls both `submitNativeRenderPass` and `rasterizeDraw` (`:1149-1150`). `rasterizeDraw` (`:1719-1787`) and `rasterizeTriangle` (`:2970+`) software-rasterize every triangle of every instance, including CPU skinning and morph (`skinLocalPosition`, `readMorphedPosition`), into `target.colorPixels`. The device's own limitations string says so: "Synchronous readPixels remains CPU-shadowed for deterministic tests" (`:525`). `ProductionWebGPURenderer.renderImportedAsset` (sync, `ProductionWebGPURenderer.ts:94-130`) reads pixels through `readPixels`, so its "pixel metrics" describe the **CPU rasterizer's flat-shaded output**. In that sync path, the transmission backdrop texture is CPU raster output downsampled on the CPU (`TransmissionBackdropCapture.ts:78-110`). Only the `*Async` variants read the GPU. The CPU rasterizer also makes WebGPU frame time scale with triangle count × covered pixels in JavaScript.

### 2.6 Shadows on WebGPU: 8-bit depth

The `"depth-textures"` capability is not advertised on WebGPU (`WebGPUDevice.ts:507-525`), so `ShadowPass.ensureRenderTarget` (`ShadowPass.ts:165-171`) uses an `rgba8` colour target. `nativeDepthFragment` writes `vec4(position.z)` into it (`WebGPUDevice.ts:3313-3319`). That leaves **256 depth levels** for the whole light frustum, which guarantees acne and peter-panning. WebGL2 uses a real depth texture, though it also allocates a wasted `rgba8` colour attachment. Three.js uses `depth32float` or `depth24plus` comparison samplers on WebGPU.

### 2.7 Textures on WebGPU

There is no GPU mip generation. `mipLevelCount` is whatever levels the CPU provided (`:2036-2075`), so decoded images without pre-built mips minify with aliasing. Three.js `WebGPUTextureUtils` generates mips with a render-pass blit. Anisotropy is applied only for fully linear filtering (`:2647-2656`).

### 2.8 Compute

- **`WebGPUParticleBackend`** (`effects/GPUParticleBackend.ts:330+`). Every `spawn` or `update` call:
  1. allocates storage, uniform and readback buffers;
  2. uploads CPU arrays and dispatches;
  3. runs `copyBufferToBuffer` into readback buffers, then `mapAsync` and copies back to `Float32Array`;
  4. destroys all buffers (`:420-480`).

  This is a full CPU↔GPU round trip per frame, which is usually slower than integrating on the CPU. `createRootGpuParticleWorkload` (`engine/src/production-runtime/RootGpuParticleWorkload.ts:16-60`) then rewrites a **CPU vertex buffer of 6 vertices per particle** (`writeVertices`, `setAttribute` per vertex) and draws them as WebGL2 or WebGPU triangles. The docs label this "Compute: … dispatches workgroups, copies storage buffers, maps readback", which is accurate but not a GPU particle system.
- **`ResidentGPUParticleRenderer`** (`effects/ResidentGPUParticleRenderer.ts`, 522 lines). This is real resident compute: collect, recycle and reduce kernels (`:372-470`), storage buffers drawn directly, and timestamp writes. It is used only by `apps/wow-webgpu-compute-particles/src/main.ts:373-396`, on its own canvas, so it cannot depth-test against or composite with the scene renderer. `effects.particles` in games does not use it.
- In three.js r185, `renderer.compute(computeNode)` writes `StorageBufferAttribute`s that the same frame's `SpriteNodeMaterial` or `InstancedMesh` reads with no readback, in the same pass graph and depth buffer.

---

## 3. WebGL2: the path the games actually run

### 3.1 Draw path (`WebGL2Device.draw`, `:1269-1343`)

- `applyRenderState`, then `stateCache.useProgram`, then `uploadUniforms`, then VAO bind, then `drawElements` or `drawElementsInstanced`.
- **State cache:** `WebGL2StateCache.ts` (330 lines) dedupes program, buffer, VAO, enable, cull, blend and stencil calls. This works and is worth keeping.
- **Uniforms:** `uploadUniforms` (`:3695-3740`) iterates every entry of a per-draw `Map`, built fresh in `ForwardPass.drawItem` as `new Map(binding.uniforms)` plus about 10 `apply*Uniforms` helpers (`ForwardPass.ts:293-311`). It issues `uniform*` for each entry with **no last-value cache**, so camera, light, fog, shadow, environment and cluster uniforms are re-sent for every draw. Locations are cached (`:3742-3753`). **No UBOs exist anywhere**: `rg UNIFORM_BUFFER|uniformBlockBinding` across `packages/` returns nothing. Three.js WebGLRenderer uses `UniformsGroup` UBOs for shared data and dirty-checks per-material uniforms (`WebGLUniforms` with a `cache` per uniform).
- **Allocation per draw:** `new RenderPipeline({...})` (`ForwardPass.ts:319-326`) and spread-copied `DrawCommand`s. `isTransparentRenderItem` calls `new UnlitMaterial()` when an item has no material (`ForwardPass.ts:1668-1670`).
- **Blend:** only `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` (`:4402-4405`). The same is true in `LeanWebGL2Device.ts:4183`. `RenderState.blend` is a boolean (`RenderDevice.ts:139`). `depthCompare` is `"always" | "less-equal"` only. Three.js has Normal, Additive, Subtractive and Multiply blending, Custom `blendEquationSeparate` and `blendFuncSeparate`, `premultipliedAlpha`, and 8 depth functions.

### 3.2 Shader compile and hitching

`createShaderProgram` (`WebGL2Device.ts:535-573`) calls `compileShader` for both stages, `linkProgram`, and then immediately queries `getShaderParameter(COMPILE_STATUS)` and `getProgramParameter(LINK_STATUS)`. Those queries force synchronous driver compilation. Programs are created lazily the first time a material reaches the device through `ShaderModule.ts:23`. There is **no `KHR_parallel_shader_compile`** (zero matches repo-wide), no `compileAsync` or precompile API, and no warm-up of the shader variants a scene will need. The first time a VFX, toon or skinned material appears mid-game, the frame stalls for one or more driver compiles. Three.js offers `renderer.compileAsync(scene, camera)` and polls `COMPLETION_STATUS_KHR`.

### 3.3 Instancing and batching, and the VAO leak

- `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`). The GLSL instanced shaders declare `uniform mat4 u_instanceMatrices[64]` (`ShaderLibraryCore.ts:247,309`), which is 256 vertex uniform vectors, the WebGL2 minimum `MAX_VERTEX_UNIFORM_VECTORS`. That is a portability risk on mobile.
- With ≤ 64 instances and no colours, the matrices are re-sent as a uniform array on every draw.
- With more than 64 instances, or any `instanceColors` or `instanceAttributes`, `applyInstanceBinding` and `createExtraInstanceAttributeBindings` run `device.createBuffer("vertex", …)` **every frame** (`ForwardPass.ts:1755,1803`) and dispose in `finally` (`:346`).
- `WebGL2Device.vertexArrayCacheKey` includes `buffer.id` for instance attributes (`:4225-4236`). A new buffer gets a new id, which creates a new VAO (`:4200`), and that VAO is **never deleted** until device dispose (`:1459-1462`). `this.buffers.add(buffer)` (`:498`) has no matching delete. This is a monotonic leak of VAO handles and JS wrappers per instanced or coloured draw per frame. It is CONFIRMED by code reading but not measured in a browser.
- Root instance matrices are recomputed every frame in JS from transform specs (`createProductionInstanceTransforms`, `agent-api/index.ts:14747-14754`).
- **"Static batching"** (`Renderer.ts:2361-2385`) regroups same geometry and material items into instanced chunks of 64 **every frame**, from per-frame model matrices (`createModelMatrix(currentState.node, …, time)`, `index.ts:13977`). That pushes them into the per-frame buffer path above. True static batching would merge once (`MeshConsolidation.ts` exists for `consolidateStaticMeshes` on `primaryWorld` GLBs only, `index.ts:13565`).
- Three.js `InstancedMesh` uploads `instanceMatrix` once and re-uploads only on `needsUpdate`, with unlimited count. `BatchedMesh` uses `WEBGL_multi_draw` or indirect draws for heterogeneous geometry.

### 3.4 Culling, LOD and occlusion

- Frustum culling is on in root (`frustumCulling: true`, `agent-api/index.ts:13995`). Explicit render items are culled only when `frustumCulling === true` (`Renderer.ts:2217-2258`). Scene-graph items are culled when a camera exists (`:2456-2458`). This is fine, though the per-item test allocates a `Box3` (`toMathBox()`).
- `performance/FrustumCuller.ts` allocates `new Box3(new Vector3…)` per item per call. `BVH.ts`, `Octree.ts` and `Batcher.ts` are exported (`index.ts:1163-1166`) but **have no engine call sites**.
- `distanceLod` (`agent-api/index.ts:2348`) selects primitive levels and is used by 4 games. It does not reach GLB assets. There is no HLOD and no impostors at runtime.
- **There is no occlusion culling and no occlusion queries.** Three.js has `Object3D.occlusionTest` on WebGPU.

### 3.5 Default framebuffer and back-buffer settings

| Setting | Aura default | Evidence | three.js r185 | Visual and perf impact |
|---|---|---|---|---|
| Backing DPR | **1.0** (`safe-basic`), 1.5 (`production`) | `agent-api/index.ts:4256,4271,11133` | apps call `setPixelRatio(devicePixelRatio)`; examples cap at 2 | **Quarter-res on retina**, the dominant blur and alias cause |
| `preserveDrawingBuffer` | **true** in every profile and in the root mount | `:4257,4272,4287,13595` | false | Forces a copy each frame and disables tile discard on mobile and Apple |
| MSAA | 4× on the forward HDR target unless TAA (`Renderer.ts:611,780`); WebGPU with a depth texture gets 1× | | 4× via `antialias`, transmission and post use MSAA RTs | WebGPU path is unantialiased |
| Shadow map | 1024/2048/4096 by scene radius; **strength 0.24–0.38** | `agent-api/index.ts:12960-12968` | full-strength shadows; `VSM/PCFSoft`; CSM addon | Shadows only darken 24–38%, which flattens grounding (see the lighting report) |
| Anisotropy | `Sampler` default 1; root and GLB paths request 8 (`GLTFRenderResources.ts:2204`) | | 1, user-set | OK on GLB textures |

---

## 4. Shared material system across backends

There is none. The WebGL2 material set is ~14 GLSL "uber" programs in `ShaderLibraryCore.ts`, `ShaderLibrary.ts` and the material files (shader keys: unlit, textured-unlit, pbr, textured-pbr, normal-mapped-pbr, instanced-pbr, instanced-unlit, skinned-lit(-8), skinned-unlit(-8), morph-unlit, screen-space-line, depth, animation-toon). WebGPU has 5 hand-maintained WGSL clones that diverge in lighting model (§2.2). `PortableShaderMaterial` (`PortableShaderMaterial.ts:60+`) asks authors to write **both** GLSL and WGSL by hand with a `/* @aura3d-bindings */` marker (`WebGPUDevice.ts:3317-3325`). `NodeMaterial` (`packages/materials/src/NodeMaterial.ts`, 20 lines) stores `{id,type,inputs}` nodes and returns a string key, with no codegen. It is referenced only by the editor serializer and the README. Because there is no single source of truth, every lighting improvement must be made twice, and on WebGPU it never was.

Three.js r185 for comparison: TSL (`three/tsl`) lets one JS graph drive standard, physical, toon, sprite, points, lines and custom materials, and emits WGSL or GLSL. Lights, shadows, fog, tone mapping, colour space, skinning, morphs, batching and instancing are nodes, and compute shaders use the same language.

---

## 5. Render graph

`RenderGraph.ts` (194 lines) validates single-writer resources and topologically sorts passes. `Renderer` builds a graph with only `EnvironmentBackgroundPass` and `ForwardPass` (`Renderer.ts:650-677,819-846`). Shadow, post, bloom, SSAO and TAA run imperatively in `Renderer.ts` and `PostProcessPass.ts`. `production-runtime/framegraph/FrameGraph.ts` (65 lines) is a "compatibility façade" that renames resources and delegates to `RenderGraph`. It is referenced only by `NativeFrameGraphBindings.ts` and `production-runtime/index.ts`, and `Renderer` does not use it. There is no transient resource aliasing, no barrier or format negotiation and no async compute. It is acceptable as an ordering helper, but it is not a frame-graph architecture that could host deferred, G-buffer, SSR, SSGI or GTAO work. **There are also no MRT outputs** (`rg drawBuffers` finds nothing), so normal, velocity and depth for screen-space effects must be re-derived from extra passes or depth readback.

---

## 6. Memory and resource management

| Issue | Evidence | Severity |
|---|---|---|
| VAO leak per frame for instanced or coloured draws | `WebGL2Device.ts:4193-4218` key includes per-frame buffer id; delete only at `:1459` | P1 |
| `WebGL2Device.buffers` Set never shrinks | `:498` add, no delete | P2 |
| Per-frame instance buffer alloc and free | `ForwardPass.ts:1755,1803,346` | P1 (perf) |
| WebGPU per-draw 8 KB uniform buffer, bind group and sampler | `WebGPUDevice.ts:2201,2299-2305,2186,1884` | P1 (WebGPU only) |
| WebGPU CPU raster shadow copy for every render-target pixel | `:1719-1787`; `WebGPURenderTarget.colorPixels` | P1 (WebGPU only) |
| CPU morph creates a new `Geometry` per draw per frame when GPU morph is unsupported | `ForwardPass.ts:313-314,347-349` | P2 |
| Two full WebGL2 devices maintained (`WebGL2Device.ts` 4,769 lines and `LeanWebGL2Device.ts` 4,537 lines) | duplicated draw, blend and uniform code | P2 (divergence risk) |
| Texture budget | `textureBudgetBytes` option (`agent-api/index.ts:4324`) plus async textured upgrade with scalar-material first frames (`:13600-13612`) | Works; causes untextured first frames |

---

## 7. Quality tiers and performance budgets

- `rendererQualityProfiles` (`agent-api/index.ts:4248-4300`) has three profiles. `safe-basic` is the default (`:4312`). Its `blockedInRoot` lists "production PBR parity" and "postprocess pass chain", but games get PBR, bloom and fog through the production renderer anyway. The profile mostly sets **DPR = 1** and `preserveDrawingBuffer = true`.
- `AuraPerformanceQuality {resolutionScale, particleScale, lodBias, shadowSize}` (`RootRuntimeSupport.ts:64-82`) is **undefined unless a caller sets it**. Only `showcase-turbo-drift-circuit` does. There is no device detection, no GPU tier and no dynamic resolution based on measured frame time.
- **Budgets are constants.** `sceneKitPerformanceBudgets` (`:9681-9692`) holds hand-typed `estimatedDrawCalls` and `targetP50Fps`. Route-health `budgets.drawCalls` (for example `apps/showcase-bank-shot/route-health.json:276-280`, `drawCalls: 220`) are ceilings, not observations. `collectParticleBudgetDiagnostics` (`:8344-8358`) synthesizes `estimatedUpdateCostMs` from a formula, and its `gpuReady` flag means "≥ 1000 particles and textured billboards", not GPU execution.
- The real measurement plumbing that exists: `RendererTiming.ts` (GPU timer query with CPU fallback), `getDiagnostics().drawCalls` and the state-cache counters. These work, but nothing consumes them to adapt quality.

Three.js does not ship tiering either. That is the app's responsibility, but its defaults (DPR from the app, `preserveDrawingBuffer: false`) are not quality-hostile the way Aura's are.

---

## 8. Why this makes the games look old

Ranked by how much each item contributes to the pixels the owner sees in the 18 games, all of which use WebGL2:

1. **DPR 1 (or 0.7) back buffer** on high-DPI displays. Everything is upsampled about 2×, edges shimmer, and text and thin geometry dissolve. This one setting is worth more perceived quality than all of the WebGPU work combined.
2. **No additive or premultiplied blending.** Emissive VFX, neon, sparks, beams, engine glows, muzzle flashes and "additive-glow" particles composite as alpha-over cards that *occlude* the scene instead of adding light. Modern three.js work leans heavily on `AdditiveBlending` plus bloom for its "energy". Aura can only reach a glow look through bloom on opaque emissive surfaces.
3. **Weak default shadow strength (0.24–0.38)** and a single fitted shadow map over the whole scene. Objects float and the scene reads as flat-lit, like an early-3D game.
4. **Shader compile hitches and per-frame allocation churn** (uniform Maps, instance buffers, VAO leak) push games to stay small: few draws, primitive kits and low instance counts. Detail density stays at the "blocky primitives" level, and the `maxRecommendedDrawCalls: 180` default ceiling (`:4258`) reinforces this.
5. **No GPU particle path in the games.** `effects.particles` tops out at 1,600–2,400 particles (`agent-api/index.ts:18526`) with CPU simulation and alpha-only blending. The resident compute renderer lives on a separate canvas in one demo.
6. **There is no material authoring system** (no TSL or node graph) that would let agents or games express stylised or modern surfaces such as triplanar, dissolve, fresnel rim, flow maps, vertex-animated foliage or emissive pulses without hand-writing GLSL. Agents fall back to `baseColor` plus emissive on primitives.

WebGPU (A) is a large sunk cost with **zero visual effect on the games**. Its defects (flat-colour fallback, Duck hacks, 8-bit shadows, 4-instance cap) would make the games look *worse* if they were ever switched to it.

---

## 9. Fake parity inventory

| Claim or artifact | Reality | Evidence |
|---|---|---|
| `shaders/wgsl/pbr.wgsl` named as the WGSL foundation of `textured-pbr` and `spot-shadows` in the parity table | 3-line normal visualiser; the real WGSL is template strings in `WebGPUDevice.ts` | `production-runtime/shaders/wgsl/pbr.wgsl:1-3`; `docs/rendering/webgpu-current-architecture.md` |
| `production-runtime/backends/{webgpu,webgl2}/*` classes | 2-line descriptor holders | each file |
| `WebGPURendererBackend` | Wraps a capability report and cannot render | `backends/WebGPURendererBackend.ts:8-24` |
| "Duck" product viewer parity | Hue-gated albedo replacement and normal flattening in the general PBR shader plus a per-route material clamp | `WebGPUDevice.ts:3555-3588,3675-3678,3768-3773`; `apps/wow-webgpu-product-viewer/src/main.ts:51-66` |
| `wow-webgpu-instancing` ("A3D WebGPU Instancing") | 160 individual draws, no instancing | `apps/wow-webgpu-instancing/src/main.ts:44-58` |
| WebGPU instanced PBR | Max 4 distinct instance matrices | `WebGPUDevice.ts:3863-3868,2240-2243` |
| `apps/webgpu-lab`, `templates/production-webgpu-starter` | Render WebGL2 | READMEs and `scene.ts` `workflow` strings |
| `showcase-webgpu-particle-lab` | WebGL2 `createAuraApp` route (honestly demoted, but the name persists) | `apps/showcase-webgpu-particle-lab/README.md` |
| Sync WebGPU pixel proof (`renderImportedAsset`) | Reads the CPU software-raster shadow | `WebGPUDevice.ts:804-842,1150` |
| "Compute" particles in `createRootGpuParticleWorkload` | GPU dispatch, then full readback, then CPU vertex rebuild | `GPUParticleBackend.ts:420-480`; `RootGpuParticleWorkload.ts:28-55` |
| `SpriteFlipbook.createBeamDescriptor().additive === true` | No additive blend exists in either device | `SpriteFlipbook.ts:119,153`; `WebGL2Device.ts:4402-4405` |
| `NodeMaterial` / "node materials" | 20-line data bag, no codegen | `packages/materials/src/NodeMaterial.ts` |
| `sceneKitPerformanceBudget`, `particles.diagnostics().gpuReady` and `estimatedUpdateCostMs` | Constants and heuristics | `agent-api/index.ts:9681-9692,8344-8358` |
| `Batcher`, `BVH`, `Octree`, `FrustumCuller`, `LOD` performance helpers | Exported, not wired into the renderer | `rendering/src/index.ts:1163-1166`; no call sites |
| `FrameGraph` / `NativeFrameGraphBindings` | Not used by `Renderer` | `rg FrameGraph` |
| "Render bundles: adopt-candidate" | Docs record "Zero engine call sites" | `docs/rendering/webgpu-current-architecture.md` |

---

## 10. Recommendations

### Stop or delete

- Delete the `production-runtime/backends/{webgpu,webgl2}/*` shells, `shaders/wgsl/{pbr,skybox}.wgsl` placeholders, `webgpu/WebGPUPipelineCache.ts` and `NodeMaterial.ts`. They inflate the API surface and mislead agents.
- Remove `productProp*` gates and `u_productColorSmoothing` from `WebGPUDevice.ts`. Remove the material clamps from `wow-webgpu-product-viewer`, then re-baseline its evidence honestly.
- Remove the CPU `rasterizeDraw` path from the production WebGPU device. Keep deterministic CPU rasterization only in `MockRenderDevice`, and make sync `readPixels` throw on WebGPU.
- Rename `wow-webgpu-instancing`, `webgpu-lab`, `production-webgpu-starter` and `showcase-webgpu-particle-lab`, or make them real.
- Freeze new WebGPU parity probes until §10.3 exists. Every probe built on the marker-sniffing device is throwaway.

### Fix now in WebGL2 (biggest pixel return for the games)

1. **DPR:** default `pixelRatio` to `min(devicePixelRatio, 2)`. Remove `pixelRatio` from `safe-basic`, or set it to `"device"`. Add dynamic resolution driven by measured GPU and CPU frame time (`RendererTiming`) with a floor of 1.0 on high-DPI displays.
2. **`preserveDrawingBuffer: false`** by default. Capture screenshots through an explicit render-to-target and readback path, which evidence tooling should do anyway.
3. **Blend modes:** change `RenderState.blend` to `"none" | "alpha" | "premultiplied" | "additive" | "multiply" | custom {src,dst,eq}` with separate alpha. Wire it into both devices, the state cache, the WebGPU pipeline key and `effects.particles` material modes (`additive-glow`, `spark` and `star` must be additive).
4. **Uniform architecture:** add per-frame and per-view UBOs (camera, lights, fog, shadow, environment, clusters) and per-material UBOs or dirty-checked uniforms. Stop building a `Map` per draw.
5. **Instancing:** use persistent instance buffers owned by the node and updated with `bufferSubData` only on change. Drop the 64 cap and the uniform-array path (it also eats the vertex uniform budget). Fix the VAO cache by keying on persistent buffers and deleting VAOs on buffer dispose.
6. **Static batching:** merge once at mount for nodes flagged static (extend `MeshConsolidation`). Do not regroup per frame.
7. **Shader compile:** use `KHR_parallel_shader_compile` with `COMPLETION_STATUS_KHR` polling, and add an `app.compileAsync()` or warm-up that precompiles every material and variant in the scene, plus known VFX variants, before the first interactive frame.
8. **Shadows:** set default strength to 1.0 (physically, the light term is absent), use cascades for any scene radius above about 15 units, and drop the redundant `rgba8` colour attachment on WebGL2.

### Decide the WebGPU strategy (architecture)

- **Option A (recommended for a team this size):** build Aura's runtime on three.js r185 `WebGPURenderer` with automatic WebGL2 fallback and TSL. Keep Aura's agent API, asset pipeline, game kits and evidence tooling, and delete `WebGPUDevice.ts`, the two WebGL2 devices and the hand-maintained shader library. That buys a shared node material system, compute, storage-buffer particles, `BatchedMesh`, indirect draws, occlusion queries, PMREM, render bundles and per-pass encoding immediately.
- **Option B (own the renderer):** you need a material IR, at minimum a small node or typed shader DSL that emits both GLSL 300 es and WGSL from one source. On top of it you need:
  - a WebGPU backend that encodes one render pass per target with many draws;
  - persistent per-object and per-material uniform or storage buffers (dynamic offsets);
  - explicit bind group layouts cached by material;
  - pipeline creation via `createRenderPipelineAsync` (no hitch);
  - full pipeline state (cull, front face, blend, depth compare);
  - real depth shadow maps with comparison samplers;
  - GPU mip generation;
  - compute particles that render inside the scene pass.

  Treat any marker regex fallback as a hard error. This is a multi-quarter effort, and the existing `WebGPUDevice.ts` is not a usable starting point beyond its TAA, bloom and post WGSL and its readback helpers.
- Either way, **root `createAuraApp` must expose `renderer: { backend: "auto" | "webgl2" | "webgpu" }`**, and the 18 games need a CI pixel diff across backends before any "WebGPU" claim.

### Make performance claims honest

- Replace `estimatedDrawCalls`, `targetP50Fps` and `gpuReady` with measured values from `getDiagnostics()` and `RendererTiming`, recorded per route on the remote runner. Label anything not measured as `budget` or `estimate`.
- Wire `BVH` or `Octree` into culling for scenes with more than ~500 items, or delete them.

---

## 11. Preserve

- `WebGL2StateCache.ts`: correct, deduped GL state tracking.
- `RenderGraph.ts`: a small, correct pass-ordering core that could be extended with transient resources.
- `ResidentGPUParticleRenderer.ts`: a genuinely resident WebGPU compute particle pipeline with timestamp queries. It is worth porting into the scene pass, or as TSL compute if Option A is chosen.
- `webgpu/WebGPUTemporal.ts` and `production-runtime/shaders/wgsl/postprocess.wgsl`: a real TAA with neighbourhood clamping and depth rejection.
- `webgpu/WebGPUPostShaders.ts`: bloom, grade and FXAA WGSL with quality tables.
- WebGPU async readback helpers (`readPixelsAsync`, `readFloatPixelsAsync`, `WebGPUDevice.ts:844-1020`) and device-loss plumbing, which are useful for evidence tooling.
- `RendererTiming.ts`: GPU timer queries with an explicit CPU fallback.
- `ProductionRuntimeRenderer` backend selection, including strict refusal of silent fallback for explicit `webgpu`. This is a good contract once the backend is real.
- Honesty notes already present: the `showcase-webgpu-particle-lab` demotion, the `webgpu-lab` README, the `WEBGPU_PARITY_PLAN` "unproven" rows and the `tools/native-webgpu-probe` README disclaimers.
- `VertexArray` caching in `WebGL2Device`. Keep the design, fix the keying and eviction.

---

## 12. Comparison summary vs three.js r185

| Concern | three.js r185 | Aura3D current |
|---|---|---|
| Default backend | WebGPU, with automatic WebGL2 fallback | WebGL2, hard-coded in root |
| Material language | TSL → WGSL/GLSL from one graph | Hand GLSL; 5 hand WGSL clones; regex dispatch; flat-colour fallback |
| Lights on WebGPU | Full light nodes | One hard-coded direction ×2.25, or a Lambert-only cluster |
| IBL | PMREM GGX cube-UV | Equirect mip ≈ roughness |
| Shadows on WebGPU | Depth texture and comparison sampler | 8-bit `rgba8` encoded depth |
| Render passes | 1 pass per target per render | 1 pass and 1 submit **per draw** |
| Uniforms | Persistent grouped buffers, dirty-tracked | WebGPU: 8 KB new buffer per draw; WebGL2: per-draw Map, no UBO |
| Instancing | Unlimited `InstancedMesh`, upload on change | WebGL2 ≤ 64 uniform path or per-frame buffers plus VAO leak; WebGPU ≤ 4 |
| Batching | `BatchedMesh` with multi-draw or indirect | Per-frame regroup into 64-instance chunks |
| Compute | `renderer.compute`, storage buffers consumed in-pass | Round-trip readback, or a resident renderer on a separate canvas |
| Blending | Normal, Additive, Subtractive, Multiply, Custom, premultiplied | Alpha-over only |
| Shader compile | `compileAsync`, `KHR_parallel_shader_compile`, async pipelines | Sync at first draw |
| Occlusion | `occlusionTest` queries (WebGPU) | None |
| Mipmaps (WebGPU) | GPU-generated | CPU-provided only |
| Back-face culling (WebGPU) | Per material `side` | Never set; always double-sided |
| Pixel ratio | App-set, typically `devicePixelRatio` | Default 1.0 |
| `preserveDrawingBuffer` | false | true |
