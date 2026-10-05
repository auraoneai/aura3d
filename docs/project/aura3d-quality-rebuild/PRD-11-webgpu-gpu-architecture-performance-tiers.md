# PRD 11: WebGPU, GPU Architecture and Performance Tiers

Program: Aura3D visual-quality autopsy and rebuild. Branch of record: `aura3d-quality-rebuild/audit` (audit commit `c08d8acb`, evidence run GH Actions `37289688772`, macos-14, ANGLE Metal, Apple Paravirtual GPU).

Final gate: the shipped games run smoothly and look competitive at the resolution the device can afford. Passing tests, 200 routes, non-blank screenshots, green parity matrices and engine-reported fps do not count as meeting this PRD. Frame time is measured by the harness from `requestAnimationFrame` intervals and GPU timer queries, never from the engine's own counter (that counter is constant, see §2.6).

Research inputs: research/07 (WebGPU, GPU, perf), research/02 (frame trace), research/13 (package architecture), research/17-g2/g5 (Courier, Gravity Post, Deep Recovery), research/19 (claim verification), research/20 (non-visual scorecards, perf), research/21 (authoritative vision judgment of games), research/22-23 (benchmark judgments), `evidence/games/report.slim.json`, `evidence/benchmark/report.json`.

Parallel-execution status (revision 2026-10-05, against `CONTRACTS.md`): this lane (PRD 11, flags `A3D_QR_TIERS` with sub-flags `_GOVERNOR`/`_BATCHING`, and `A3D_QR_WEBGPU`) starts on day 0 from the PR 0a branch and is never held by another lane. It **provides** C-27 (QualityTier settings), C-28 (device probe, counters, compileAsync, FrameStats, RenderTargetPool) and C-29 (renderer factory, backends, device lifecycle, ResourceRegistry), and keeps their PR 0a stubs working. Everything it needs from other lanes is consumed through contracts (built against stubs) or filed as a non-blocking `qr-request` (§12.3). Every task edits only paths CONTRACTS §4.1 assigns to lane 11, or uses an extension point (C-01 frame contributors, C-02 chunk registry, C-11 depth variants, C-31 diagnostics sections, C-36 compiler context, C-38 app extensions, C-39 codemods, C-30 lane scenes). Acceptance is split into **standalone** (§16.0; gates merges) and **integrated** (§16.1; evaluated only at CONTRACTS §7 checkpoints, never blocks). References to other PRD numbers below are either research citations or the lane that owns a consumed contract; none is a precondition for starting or merging work here.

---

## 1. Problem statement

1. **The games are slow on the same runner where two siblings hold 60 fps.** At 1920x1080 on the macos-14 runner (`evidence/games/report.slim.json`):

   | Game | fps 1080p | p50 ms | p95 ms | 720p fps | Main suspected cause (code-confirmed where cited) |
   |---|---|---|---|---|---|
   | Deep Recovery | **0.5** | 1916.7 | 2366.9 | 1.1 | `effects.volumetricFog` forces the whole post chain onto CPU readback (§2.4) |
   | Gravity Post | 6.4 | 150.0 | 216.7 | 7.1 | ~330 unbatched primitives, 1,230-1,294 draw calls (research/17-g5:108, research/20:2018) |
   | Courier Rush | 7.1 | 183.2 | 334.1 | 5.0 | ~1,530 draw calls at title; 1920 run lost its WebGL context permanently (research/20:713,738) |
   | Siege Golf | 7.1 | 18.2 | 1100.5 | 13.7 | `app.setScene` rebuild on every camera phase (research/17-g3:89) |
   | Rooftop Buckets | 7.6 | 133.3 | 183.1 | 12.2 | ~200 primitive draws, light count (research/20:1147) |
   | Mech Hangar | 9.3 | 83.4 | 246.6 | 15.6 | forced 1.5 DPR + ~190 unbatched draws (research/20:228) |
   | Blockfall Reactor | 9.8 | 83.4 | 199.4 | 12.2 | 200 hidden legacy boxes, ~80 `text3D` digits, 3 WebGL contexts (research/20:1529) |
   | Gallery Shift | 10.1 | 99.9 | 133.2 | 14.5 | not profiled |
   | Aura Clash | 11.1 | 83.4 | 135.6 | 13.3 | not profiled ("5x gap", research/20:134) |
   | Skyline Runner | 11.4 | 83.3 | 132.1 | 12.8 | 308 MB heap, 33 MB assets, evidence plumbing in the loop (research/20:637) |
   | Bank Shot | 14.9 | 66.7 | 84.2 | 25.8 | ~193 draws for one table (research/20:1242) |
   | Patrol Wing | 15.8 | 66.6 | 101.1 | 54.8 | resolution-dependent: fill/post bound at 1080p (research/20:843) |
   | Turbo Drift | 19.7 | 50.0 | 83.4 | 23.2 | 4096 shadow over 500-unit bounds, post chain (research/20:520) |
   | Pulse Tunnel | 23.5 | 34.0 | 67.7 | 29.6 | ~250 un-instanced draws (research/20:1777) |
   | Neon Swarm | 25.8 | 33.4 | 53.2 | 39.0 | 4 × `neonStreetLampProp` at 272,036 tris each (~1.09M tris, mostly off screen) plus a point light per lamp (research/17-g4:294; `apps/showcase-neon-swarm/src/main.ts:608-627`) |
   | Aurora Lander | 52.2 | 16.7 | 33.4 | 49.0 | ~150 primitive nodes CPU overhead (research/20:1950) |
   | Vault Breakers | 57.4 | 16.7 | 18.5 | 59.0 | baseline |
   | Orbital Defense | 59.6 | 16.7 | 19.1 | 60.0 | baseline, 8-16 draws |

   The runner GPU is weak, so absolute numbers are pessimistic. The relative gap is the signal: same engine, same runner, same browser, 4-120x slower. This is not an engine-wide ceiling; it is per-draw CPU cost, missing batching, CPU readback passes and route bugs.

2. **The engine reports 60 fps for every game.** The production frame loop writes `diagnosticsState.fps = diagnosticsState.fps || 60` (`packages/engine/src/agent-api/index.ts:12338`). Every judge that trusted engine telemetry scored performance wrong (research/20:44,713,843,1102,1205,1623).

3. **Resolution is chosen for CI determinism, not for the image or the device.** `safe-basic` hard-codes `pixelRatio: 1` (`index.ts:4256`) and wins over `devicePixelRatio` (`index.ts:11133`). The mobile capture at DPR 3 rendered a 390x844 backing store for a 390x844 viewport: 1/9 of native pixels (`report.slim.json`, all games' `mobile-390x844` runs; vision judge "visibly soft or blurry, consistent with a low render scale", research/21:1720,1741). There is no tier system and no frame-time governor. The DPR default itself belongs to lane 01, which reads `maxPixelRatio`/`minRenderScale` from this lane's C-27 table; this PRD supplies the tiers and governor that make raising it affordable.

4. **WebGPU is a large sunk cost that adds zero pixels.** No game selects it: root `createAuraApp` hard-codes `backend: "webgl2"` (`index.ts:13590`). The WebGPU device is a regex lookup from GLSL marker strings to five hand-written WGSL shaders, with silent flat-colour fallback for everything else, a hard-coded light direction and `2.25` gain, Duck-specific albedo gates, a 4-instance cap, 8-bit shadow depth, one render pass and one submit per draw, an 8,208-byte uniform buffer allocated per draw, and a CPU software rasterizer running alongside the GPU (research/07 §2). If games were switched to it they would look worse.

5. **GPU architecture is immediate-mode WebGL1-style.** No UBOs, no uniform value cache, no `KHR_parallel_shader_compile`, no `WEBGL_multi_draw`, a per-frame VAO leak for instanced/coloured draws, 64-instance uniform arrays, per-frame regrouping that calls itself static batching, and exported `BVH` / `Octree` / `Batcher` / `FrustumCuller` / `LOD` with no engine call sites (research/07 §3). The per-draw submission core (uniform cache, UBOs, `InstanceBuffer`) is lane 01's, reached here through C-02/C-04/C-07. This PRD owns the parts in its own files (multi-draw `webgl2/MultiDraw.ts`, cross-node batching and culling `renderer/CullingBatching.ts`, draw issuance `forward/DrawSubmit.ts`, telemetry, budgets, tiers) and the measured acceptance of the whole perf stack through C-28 counters.

6. **Performance metadata is fabricated.** `sceneKitPerformanceBudgets` are hand-typed `estimatedDrawCalls` / `targetP50Fps` constants (`index.ts:9681-9692`). `collectParticleBudgetDiagnostics` emits `estimatedUpdateCostMs = total*0.00018 + n*0.04` and a `gpuReady` flag meaning "≥ 1000 particles and textured billboards" (`index.ts:8344-8358`). `route-health.json` draw budgets are ceilings, not observations (research/07 §7).

---

## 2. Evidence from current code

### 2.1 Backend selection

- `packages/engine/src/agent-api/index.ts:13586-13597`: `ProductionRuntimeRenderer.create({ canvas, width, height, backend: "webgl2", antialias: true, preserveDrawingBuffer: true, clearColor: colorToAcesInputClearColor(...) })`. There is no `renderer.backend` option on `createAuraApp`.
- `packages/rendering/src/RenderBackend.ts:17-50`: `backend ?? "webgl2"`; WebGPU is a dynamic import because `WebGPUDevice.ts` is "~139 KB of source" and put Aura Clash "309 KB over its JS budget" (comment at `:41-44`).
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts:57-90`: `"webgl2" | "webgpu" | "auto"`, strict refusal of silent fallback for explicit `webgpu` (`:73-78`). Keep this contract. The comment at `:61-66` records that `pnpm check:bundle-size` does not enable splitting, so the split is invisible to the budget check.
- WebGPU-labelled routes: `apps/{webgpu-lab, wow-webgpu-triangle, wow-webgpu-render-target, wow-webgpu-pbr-asset, wow-webgpu-product-viewer, wow-webgpu-instancing, wow-webgpu-compute-particles, showcase-webgpu-particle-lab}`, `templates/production-webgpu-starter`, 10 `tools/*webgpu*` directories, 46 browser specs matching `webgpu` in `tests/browser/`.

### 2.2 WebGPU device (research/07 §2; line numbers in `packages/rendering/src/WebGPUDevice.ts`, 4,001 lines)

| Defect | Lines |
|---|---|
| Marker-sniffing shader selection; 5 of 16 engine shader keys have WGSL, the rest become flat `u_draw.color` | `createNativeShaderSources` `:3179-3311` |
| Hard-coded light `normalize(vec3(0.36,0.52,0.78))`, `* 2.25` gain | `:3665`, `:3765` |
| Duck gates `productPropBodyGate/OrangeGate/Albedo`, enabled by `u_productColorSmoothing` from `apps/wow-webgpu-product-viewer/src/main.ts:59` | `:3555-3588`, `:3675-3678`, `:3768-3773` |
| Per draw: new command encoder, new 8,208 B uniform buffer (`new Float32Array(2052)`), new bind group (`layout: "auto"`), new samplers, one render pass, one `queue.submit` | `:1789-1981`, `:2201`, `:2186`, `:1833` |
| CPU software raster of every triangle into `colorPixels`; sync `readPixels` / `readFloatPixels` return CPU pixels | `rasterizeDraw` call `:1150`, body `:1719-1787`; `readPixels` `:804-842`, `readFloatPixels` `:1022` |
| Instance matrices capped at 4 (`instance0..3`; index > 3 returns `instance0`) | `:3420-3466`, `:3863-3868`, `:2240-2243` |
| No `cullMode` / `frontFace`; single alpha blend | `:1850`, `:1838-1845` |
| `depth-textures` not advertised → shadows into `rgba8` (256 depth levels) | `:507-525`; `ShadowPass.ts:165-171`; `:3313-3319` |
| No GPU mip generation | `:2036-2075` |

Façade and placeholder files: `production-runtime/backends/{webgpu,webgl2}/*.ts` (2-line descriptor holders), `production-runtime/backends/WebGPURendererBackend.ts:8-24` (wraps a report), `production-runtime/shaders/wgsl/pbr.wgsl` (outputs `abs(normal)`), `production-runtime/shaders/wgsl/skybox.wgsl` (constant colour), `webgpu/WebGPUPipelineCache.ts` (unused memoiser), `webgpu/WebGPUBuffer.ts` / `WebGPUTexture.ts` / `WebGPUCompute.ts` (re-exports).

Worth keeping (research/07 §11): `webgpu/WebGPUTemporal.ts` + `production-runtime/shaders/wgsl/postprocess.wgsl` (real TAA), `webgpu/WebGPUPostShaders.ts` (bloom, grade, FXAA WGSL), `readPixelsAsync` / `readFloatPixelsAsync` (`:844-1020`), device-loss plumbing, `effects/ResidentGPUParticleRenderer.ts` (real resident compute, own canvas).

### 2.3 WebGL2 submission path (research/07 §3, research/02 §3.4)

- `WebGL2Device.draw` `:1269-1343`; `uploadUniforms` `:3695-3740` re-sends every uniform per draw, no value cache; no UBOs (`rg UNIFORM_BUFFER packages/` is empty); `createShaderProgram` `:535-573` queries `LINK_STATUS` synchronously right after `linkProgram` (`:552`, `:556`), and shader compile checks `COMPILE_STATUS` synchronously (`:3660`), so every first use of a program stalls the main thread.
- `ForwardPass.drawItem`: `new Map(binding.uniforms)` + ~10 `apply*Uniforms` per item (`ForwardPass.ts:293-311`); `new RenderPipeline` per item (`:319-326`); `new UnlitMaterial()` in `isTransparentRenderItem` (`:1668-1670`).
- `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`); `uniform mat4 u_instanceMatrices[64]` = 256 vertex uniform vectors, the WebGL2 minimum (`ShaderLibraryCore.ts:247,309`).
- Per-frame instance VBO create/dispose (`ForwardPass.ts:1755`, `:1803`, `:346`); VAO cache keyed on `buffer.id` (`WebGL2Device.ts:4225-4236`), evicted only in `dispose()` (`:1459-1462`); `this.buffers.add` at `:498` never deletes. Monotonic VAO and wrapper leak per instanced/coloured draw per frame.
- Only blend: `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` (`WebGL2Device.ts:4402-4405`).
- `rg "WEBGL_multi_draw|KHR_parallel_shader_compile|UNIFORM_BUFFER|WEBGL_debug_renderer_info" packages/` returns nothing. The only timer-query use is `RendererTiming.ts:165`.

### 2.4 CPU readback in the production frame (Deep Recovery)

- `apps/showcase-deep-recovery/src/main.ts:280-285`: `effects.volumetricFog({ density: 0.12, color: "#1d4b57", intensity: 0.38 })`.
- `index.ts:12805-12825`: a `volumetric-fog` node always submits `postprocess.volumetricLight`.
- `packages/rendering/src/Renderer.ts:2111-2119` `canFuseLdrPostprocess`: the fusable set is `bloom, tone-mapping, color-grade, depth-of-field, motion-blur, ssao, ssr, taa, outline, fxaa`. `volumetric-light` is not in it, so `executeFusedLdrPostprocess` returns false (`:993`) and **the whole chain** falls to the per-pass path.
- Per-pass path: HDR bloom does `readFloatPixels` of the full target, CPU `bloomFloatPixels` + CPU `toneMapFloatPixels` (`Renderer.ts:1012-1025`), and **creates a new `rgba8` render target inside the frame loop** (`:1004-1011`). Each remaining pass does `readPixels` → JS kernel → `writePostProcessPixels` (`executePixelPostprocessPass`, `:1245-1280`), with `readRendererOwnedDepthTexture` for depth passes (`:1248-1250`).
- Result: frame time scales with pixel count: 1920x1080 p50 1,917 ms, 1280x720 850 ms, 390x844 282 ms (`report.slim.json`). Pixel ratio between 1080p and 720p is 2.25; frame-time ratio is 2.26.
- Other CPU passes reachable the same way: `chromatic-aberration`, `film-grain`, `contact-shadow` (all outside the fusable set), plus point-shadow face readback with 8-bit quantisation (`Renderer.ts:1516-1603`, `:1915-1931`; research/02 §3.6).
- The "fused" path is itself only GPU when the device implements `presentLdrPostprocess` (`Renderer.ts:1086-1095`); otherwise it does `this.device.readPixels(...)` → `fusedLdrPostprocessPixels` → `writePostProcessPixels` on the CPU (`Renderer.ts:1097-1109`). Fusion is also declined, sending the chain to the per-pass CPU path, when DoF/SSAO/SSR are requested and the target has no depth texture (`Renderer.ts:1085`). The readback counter (C-28) must therefore count both paths; "fused" is not a synonym for "GPU".
- Ownership after PR 0b: `Renderer.ts:977-1330` (post execution) is carved into `renderer/PostprocessExecution.ts` (lane 03), and `createProductionRuntimePostprocess` (`index.ts:12797-12941`, volumetric pass built at `:12810`, spread at `:12938`) into `agent-api/compiler/postprocess.ts` (lane 03). This PRD therefore provides the guard, counters and target pool and requests the wiring (§12.3 Q-03-1, Q-03-2).

### 2.5 Batching cannot merge root primitives

- `createProductionRuntimePrimitiveEntries` (`index.ts:14014-14017`) calls `createProductionPrimitiveResources(node)` per node, which calls `createProductionPrimitiveGeometry(node)` and `createProductionPrimitiveMaterial(node)` per node (`:14678-14692`). Every primitive owns a unique `Geometry` and a unique `PBRMaterial`.
- `applyRendererOwnedStaticBatching` keys batches on object identity: `staticBatchKey = geometryId:materialId:shadow` via `WeakMap` ids (`Renderer.ts:2399-2409`). With per-node resources the key is unique per node, so **root primitives never batch**. Each primitive is at least one forward draw plus one shadow draw.
- This is the draw-count source for Gravity Post (~330 primitive instances → 1,230-1,294 draws), Courier Rush (looped `primitives.*` in `apps/showcase-courier-rush/src/city.ts:76-161, 287-410, 490-496`; ~1,530 draws at title), Pulse Tunnel (105 primitive calls, ~250 draws), Rooftop Buckets, Bank Shot and Mech Hangar.
- When batching does apply, it regroups every frame from per-frame model matrices into 64-instance chunks and pushes them onto the leaking per-frame buffer path (`Renderer.ts:2361-2386`; research/07 §3.3).
- Instanced primitives have a geometry bug: `createProductionInstanceTransforms` (`index.ts:14747-14753`) omits `node.size`, so the node's size scale multiplies instance translations (benchmark 16-instancing: grid at 30% of authored extent; research/22 §16, confirmed by skeptic). The fix is the declared correctness fix R18 in `agent-api/compiler/primitives.ts` (lane 15 after PR 0b-1, C-07 composition order world · instance · geometry); this PRD owns the instancing test that proves it (V2, integrated).

### 2.6 Telemetry

- `index.ts:12338`: `diagnosticsState.fps = diagnosticsState.fps || 60` in `renderFrame` (production path). The canvas-runtime path computes `Math.round(1000 / delta)` (`:11336`), but the production path overwrites `fps` with a sticky 60.
- `packages/rendering/src/RendererTiming.ts` (251 lines) has a real `EXT_disjoint_timer_query_webgl2` backend (`createWebGL2GpuTimingBackend`, `:164`) and a CPU fallback (`:134`). Nothing consumes it to adapt quality or report frame cost.
- `sceneKitPerformanceBudgets` (`index.ts:9681-9692`) carries `calibrationSource: "benchmark/runner/fps-calibration.mjs"` (`:9528`, `:9722`) on constants.
- The benchmark harness records `drawCalls` and `loadMs` per scene but no frame time (`evidence/benchmark/report.json` payload keys).
- The game capture harness (`tools/quality-rebuild-capture/capture-games.mjs`) measures its own rAF fps (`pageStartFps`, `:413-436`) and already reads engine diagnostics through the live-app registry `globalThis.__AURA3D_LIVE_APPS__.all()` (`:371-380`), recording `d.fps` (the fake 60) next to it. Deployed games are captured from `productionOrigin` (`games.json`, `https://aura3d.auraone.ai`); undeployed ones from a local static build (`capture-games.mjs:878`). Any URL switch this PRD adds for capture must therefore work in production builds.
- `AuraDiagnostics.fps` is typed `number` (`index.ts:10379`). Existing tests that pin `fps: 60` as fixture data: `tests/unit/agent-api/devtools.test.ts:8,16`, `tests/unit/apps/aura-clash-arena-proof.test.ts:174`. Existing tests over the current quality/governor surfaces: `tests/unit/agent-api-root-performance-quality.test.ts`, `tests/unit/muse3jsparity-root-governor-contract.test.ts`.

### 2.7 Quality and resolution controls

- Profiles (`index.ts:4248-4308`, union type at `:1761`): `safe-basic` DPR 1, `production` 1.5, `cinematic` 1.5, `experimental-webgpu` 1 (`:4294-4308`); all `preserveDrawingBuffer: true`; `maxRecommendedDrawCalls` 180/260/320/220. Games that opt into `qualityProfile: "production"` therefore get a fixed DPR 1.5 regardless of device: Mech Hangar (`apps/showcase-mech-hangar/src/main.ts:705`), Vault Breakers (`apps/showcase-vault-breakers/src/main.ts:392`), Rooftop Buckets (`apps/showcase-rooftop-buckets/src/main.ts:743`, plus an explicit `pixelRatio` clamp to 1.75 at `:738`), Aura Clash (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1531`, explicit clamp to 1.75 at `:1522-1530`). Skyline Runner forces `pixelRatio: 0.7` (`apps/showcase-skyline-runner/src/main.ts:1879`). An explicit top-level `AuraCreateAppOptions.pixelRatio` (`index.ts:10798`) wins over the profile.
- `AuraPerformanceQuality { resolutionScale, particleScale, lodBias, shadowSize }` (`packages/engine/src/agent-api/RootRuntimeSupport.ts:66`, validated by `validateRootPerformanceQuality` immediately below it: `lodBias ∈ [1,8]`, `shadowSize` power of two in [256,4096]), stored in a `WeakMap` keyed by canvas, applied only if a caller sets it (`index.ts:11138`; method `setPerformanceQuality` at `:10700`). Only `showcase-turbo-drift-circuit` sets it, and only in visual-capture mode (`apps/showcase-turbo-drift-circuit/src/main.ts:2983-2994`).
- A second, independent governor exists: `createPerformanceGovernor` (`packages/engine/src/production-runtime/GameRenderPreset.ts:158`) steps `resolutionScale → particleScale → lodBias → shadowSize`. It is driven by `GameAppRuntime` when `performanceBudget` is set (`packages/engine/src/agent-api/GameAppRuntime.ts:126-129`) and used directly by the `animation-studio` and `character-controller` templates (`packages/create-aura3d/templates/animation-studio/src/scene-player.ts:647`, `character-controller/src/main.ts:38`). No shipped game sets `performanceBudget`. Lane 01 owns `ResolutionGovernor.ts` (CONTRACTS §4.1; the file does not exist yet), which is not a frozen contract; this PRD therefore defines its own render-scale interface in `quality/RenderScaleController.ts` (§6.5) and must make sure the remaining feature steps do not fight `QualityGovernor` (§6.5).
- `AuraCreateAppRendererOptions.textureBudgetBytes` defaults to 256 MiB for every device (`index.ts:1785-1790`).
- No device detection, no GPU tier, no dynamic resolution.

### 2.8 Context loss

- `WebGL2Device.ts:417-445`: on `webglcontextlost` it sets `contextLost = true` and notifies listeners; on `webglcontextrestored` (`:433-443`) it sets `contextLost = false` and notifies. **No GPU resource is re-created** (programs, buffers, textures, VAOs, render targets are all invalid after restore). `app.onDeviceLost` / `onDeviceRestored` exist (`index.ts:10736-10750`) but nothing in the root bridge rebuilds. Courier Rush 1920 went permanently black (research/20:738). An existing spec, `tests/browser/context-loss-recovery.spec.ts`, drives `WEBGL_lose_context`; it is extended in Phase 5 rather than duplicated.

### 2.9 Unwired performance helpers

- `packages/rendering/src/performance/{Batcher,BVH,Octree,FrustumCuller,LOD,ResourceBudget,RendererStats}.ts` exported (`packages/rendering/src/index.ts:1163-1166`); `Batcher`, `BVH`, `Octree` have no engine call sites. `FrustumCuller` allocates `new Box3(new Vector3...)` per item per call (research/07 §3.4).

### 2.10 Benchmark evidence relevant to this PRD (research/23, authoritative)

- 16-instancing: Aura 2.5/10 vs three.js 4.5/10, "core feature under test is visibly wrong" (`research/23:1003-1004`).
- 17-large-environment: Aura 1,135 draws vs three.js 2,395; Aura 3.0/10 vs 4.5/10 (`research/23:1063-1064`). Draw count is not the bottleneck there; shadow quality is (PRD 02).
- 14-particles: Aura 1/10 (nothing drawn; drawCalls 1) vs 4/10 (`research/23:887-888`). PRD 07 owns it; this PRD owns the particle budget per tier and the WebGPU compute path decision.
- The harness was judged fair in every scene (research/22, research/23 §5 per scene).

### 2.11 Reference spot-check (2026-10-05, working tree at `6b8e87b3`)

Checked with `rg -n` against the code; all line numbers in this PRD are pre-PR 0b and move with the carve-outs in CONTRACTS §3.

| Reference | Verified content | Status |
|---|---|---|
| `packages/engine/src/agent-api/index.ts:12338` | `diagnosticsState.fps = diagnosticsState.fps \|\| 60;` (canvas path `:11336` `Math.round(1000 / delta)`) | correct |
| `index.ts:13590` | `backend: "webgl2",` in root mount (second literal at `:16069`, safe-basic path) | correct; `:16069` added |
| `index.ts:4248`, `:4256`, `:4315` | `rendererQualityProfiles`, safe-basic `pixelRatio: 1`, `normalizeCreateAppRendererOptions` | correct |
| `index.ts:9681`, `:8344` | `const sceneKitPerformanceBudgets` (not exported), `function collectParticleBudgetDiagnostics` | correct |
| `index.ts:12810`, `:12938` | `const volumetricPass = authoredVolumetricFog …`, `...(volumetricPass ? { volumetricLight: volumetricPass } : {})` | narrowed from "12805-12825" |
| `index.ts:14014`, `:14678`, `:14747` | `createProductionRuntimePrimitiveEntries`, `createProductionPrimitiveResources`, `createProductionInstanceTransforms` | correct |
| `packages/rendering/src/Renderer.ts:472`, `:993`, `:2111`, `:2361`, `:2399` | `static async create`, fused attempt, `canFuseLdrPostprocess`, `applyRendererOwnedStaticBatching`, `staticBatchKey` | correct |
| `Renderer.ts:1097-1109` | fused CPU fallback via `readPixels` | new evidence (§2.4) |
| `WebGL2Device.ts:418-445` | lost/restored listeners defined `:418-443`, registered `:444-445` | correct |
| `WebGPUDevice.ts:804`, `:1022`, `:1150`, `:1719`, `:3179`, `:3555`, `:3665`, `:3765`, `:3866` | sync `readPixels`, `readFloatPixels`, `rasterizeDraw` call and body, `createNativeShaderSources`, `productPropBodyGate`, hard-coded light, `* 2.25`, `instance3` cap | correct |
| `ForwardPass.ts:121`, `:43`, `:1787` | `MAX_GPU_INSTANCES = 64`; `RenderItem.instanceColors`; `a_instanceColor` upload | correct; instance colour already exists on the legacy path (`ShaderLibraryCore.ts:244,259`) |
| `RenderDevice.ts:428`, `:462` | `interface RenderDevice`, `class RenderDeviceError` | correct |
| `RootRuntimeSupport.ts:58`, `:66` | `readRootDiagnosticSnapshot`, `AuraPerformanceQuality` | corrected from "57-60" |
| `GameRenderPreset.ts:158`, `GameAppRuntime.ts:126` | `createPerformanceGovernor`, `perfGovernorOptions = options.performanceBudget` | correct |
| `tools/quality-rebuild-capture/capture-games.mjs:371`, `:413` | live-app registry read, `pageStartFps` | corrected from ":417" |
| `apps/showcase-siege-golf/src/main.ts:978`, `:1104`; `showcase-blockfall-reactor/src/main.ts:630`, `:791`, `:826`; `showcase-skyline-runner/src/main.ts:1875`, `:1879`; `showcase-rooftop-buckets/src/main.ts:738`, `:743`; `showcase-mech-hangar/src/main.ts:705`; `showcase-vault-breakers/src/main.ts:392`; `showcase-neon-swarm/src/main.ts:612` | per-phase `setScene`, hidden locked blocks, draw-call probe, safe-basic + DPR 0.7, DPR clamp + profile, profile, profile, lamp model | correct (neon lamp model call at `:612` inside `:608-627`) |
| `packages/rendering/src/{quality,batching,renderer,forward,webgl2,program,resources}/` | do not exist yet; created by PR 0a/0b or by this lane | expected |

---

## 3. Root cause

| Root cause | Class (A engine / B defaults / D game / G evidence) | Effect |
|---|---|---|
| Renderer built as an immediate-mode device that does per-draw allocation and full uniform re-upload | A | High CPU cost per draw → agents keep scenes sparse; `maxRecommendedDrawCalls: 180` |
| Primitive resources created per node; batch key is object identity | A | Primitive-heavy games issue 200-1,500 draws; batching never fires for primitives |
| CPU readback kernels left in the production pass catalogue and selected implicitly when any non-fusable pass is present | A | Deep Recovery 0.5 fps; any future use of contact-shadow, film-grain, CA, volumetric has the same cliff |
| Resolution chosen for screenshot determinism (DPR 1, `preserveDrawingBuffer`) with no device-aware tiering | B / G | Blurry HiDPI and mobile output; no headroom management when DPR rises |
| WebGPU pursued as parity probes on a device that translates GLSL by marker regex, with no shared material source | A / G | Zero effect on games; probes tuned per asset (Duck); every lighting fix would need doing twice |
| Telemetry that defaults to success (`fps || 60`), budgets as constants | G | Slow games passed gates; reviewers scored perf from fiction |
| Context-restore path that flips a flag but rebuilds nothing | A | Permanent black canvas after GPU reset |
| Routes ship scaffolding in the frame (hidden probe nodes, evidence serialisation, extra WebGL contexts, unused heavy assets) | D | Per-route 2-5x losses independent of the engine |

The common pattern: performance was "proven" by counters and declarations, never by measured frame time on the shipped route.

---

## 4. Affected packages

| Package | Change |
|---|---|
| `@aura3d/rendering` | Quality tier model, device probe, quality governor with its own render-scale controller, frame stats, multi-draw batching, cross-node static batching, BVH culling wiring, CPU-readback guard and counters for production post (wired by lane 03), render-target pool (C-28 slot), context-restore resource rebuild, WebGPU freeze (Phase 1) and the conditional replacement backend (Phase 6+) |
| `@aura3d/engine` | `createAuraApp` options (`quality`, `adaptive`, `backend`, `targetFrameRate`, `batching`; all pre-declared by C-38 in PR 0a) parsed in `agent-api/app/rendererOptions.ts`, `app.quality` (C-38 extension), `app.diagnostics().frame`/`.quality`/`.renderer.batching` (C-31 sections), removal of fabricated budget fields (`devtools/sceneKitBudgets.ts`), deprecation of `qualityProfile` / `performanceQuality`. The fps literal and the primitive compiler are lane 15 files and are changed by request (§12.3) |
| `@aura3d/effects` / rendering `effects/` | Particle budget per tier is C-27 data that lane 07 reads; `ResidentGPUParticleRenderer.ts` and `GPUParticleBackend.ts` are lane 07 files (request Q-07-2) |
| `@aura3d/materials` | Delete `NodeMaterial.ts` (20-line data bag; lane 11 owns this one file) |
| `@aura3d/lean` | No work in this lane (lane 15 owns lean). Tier APIs re-exported from engine contracts |
| `apps/*` | Lane 11 owns only `apps/webgpu-lab/` and `apps/wow-webgpu-instancing/`. The 18 games (lane 14) get perf fixes by request (§9.6, Q-14-*); other WebGPU routes by request to their owners |
| `tools/quality-rebuild-capture`, `benchmarks/quality-rebuild`, `.github/workflows/quality-rebuild-capture.yml` (lane 12) | Frame-time recording via C-30 `ReadyPayloadV2.frameTiming` and C-33 plugins (request Q-12-*); lane-owned scenes in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/`; lane workflow `.github/workflows/qr-prd11-perf.yml` |
| Docs and skills | `docs/rendering/webgpu-*.md` (owned); skills and templates via C-40 facts to lane 13; `BUNDLE_SIZES.md` (lane 15) via request |

---

## 5. Affected files and directories

Ownership rule: every path below is classified by CONTRACTS §4.1 (longest-prefix). "Owned" paths are edited by this lane directly. "Seam" paths are reached only through the named extension point from a lane-11 file. "Request" paths are changed by their owner on a `qr-request` (§12.3); this lane never edits them and never waits on them.

Modify, owned by lane 11 (after the PR 0b carve-outs that create them):
- `packages/engine/src/agent-api/app/rendererOptions.ts` (carve-out of `index.ts:4225-4327`: `rendererQualityProfiles` `:4248-4309`, safe-basic `pixelRatio: 1` `:4256`, `normalizeCreateAppRendererOptions` `:4315-4326`): parse `quality`/`adaptive`/`targetFrameRate`/`batching`/`backend` (pre-declared C-38), deprecation mappings, `experimental-webgpu` → `AuraMigrationError`, `?aura3d-quality=`/`?aura3d-adaptive=` parsing.
- `packages/engine/src/agent-api/devtools/sceneKitBudgets.ts` (carve-out of `index.ts:9681-9796`): budget renames, `calibrationSource` removal.
- `packages/engine/src/agent-api/RootPerformanceQuality.ts` (new, lane 11 per §4.1): deprecated `AuraPerformanceQuality` alias mapping onto C-27 overrides. `RootRuntimeSupport.ts:66` itself (lane 15) keeps its export; it re-exports from this file by request Q-15-4.
- `packages/engine/src/production-runtime/GameRenderPreset.ts` (`createPerformanceGovernor` `:158`): delegate feature steps to an injected `AuraQualityController` when one is supplied (§6.5).
- `packages/rendering/src/renderer/CullingBatching.ts` (carve-out of `Renderer.ts:2208-2258`, `:2361-2409`): content-keyed static batching, BVH culling, per-structural-change plan.
- `packages/rendering/src/renderer/{RendererFactory,DeviceLifecycle}.ts` (carve-out of `Renderer.create` `Renderer.ts:472` and `ProductionRuntimeRenderer.ts:57-90` selection): C-29 real.
- `packages/rendering/src/forward/DrawSubmit.ts` (carve-out of the final `device.draw*` in `ForwardPass.drawItem` `:269-351`): multi-draw and instanced submission.
- `packages/rendering/src/webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts` (PR 0b seams of `WebGL2Device.ts`: listeners `:418-445`, `linkProgram` sites 552/2770/2812/3429/3641, `readPixels` sites 1132-1186/1623, new probe and multi-draw).
- `packages/rendering/src/RenderDevice.ts` (`interface RenderDevice` `:428`, `RenderDeviceError` `:462`): realise the C-28 optional members' semantics (types pre-declared in PR 0a).
- `packages/rendering/src/RendererTiming.ts` (timer queries `:164-210`): scoped GPU timing for FrameStats.
- `packages/rendering/src/MockRenderDevice.ts`: counters, multi-draw, CPU raster stays here only.
- `packages/rendering/src/performance/{BVH,FrustumCuller,Batcher}.ts`: allocation-free API (`performance/` default is lane 15; these three files are lane 11).
- `packages/rendering/src/RenderBackend.ts` (`:17-50`), `production-runtime/ProductionWebGPURenderer.ts` (`:93`, `:137`), `production-runtime/backends/`, `production-runtime/shaders/wgsl/` (incl. `pbr.wgsl`, `skybox.wgsl`), `WebGPUDevice.ts`, `webgpu/` (except `WebGPUPostShaders.ts`, lane 03).
- `packages/materials/src/NodeMaterial.ts`; `apps/webgpu-lab/`, `apps/wow-webgpu-instancing/`; `tools/{perf-gate,wgsl-validate,bundle-size,production-runtime-template-readiness,production-runtime-package-surface-readiness}/` (except `bundle-size/lit-scene.ts`); `docs/rendering/webgpu-*`; `scripts/migrations/prd11-*`.
- Tests owned by explicit assignment: `tests/unit/agent-api-root-performance-quality.test.ts`, `tests/unit/muse3jsparity-root-governor-contract.test.ts`.

Reached through a seam (no edit to the host file):
- `Renderer.ts` frame (lane 01): C-01 `registerFrameContributor({ id: "prd11.frameStats" | "prd11.batching", phases: ["collect", "after-output"] })` from `packages/rendering/src/lanes/prd11.ts`.
- Generated programs (lane 01): C-02 `registerShaderChunk`/`registerShaderFeature("prd11.drawId" | "prd11.instanceEmissive")` from `packages/rendering/src/batching/shaders/*.glsl.ts`.
- `DepthPass.ts` (lane 02): C-11 `registerDepthVariantFeature("prd11.drawId")` so batched casters render in shadow passes.
- `app/createAuraApp.ts`, `app/diagnostics.ts` (lane 15): C-38 `registerAppExtension({ member: "quality" })` and flattened `precompile`; C-31 `registerDiagnosticsSection` for keys `frame`, `quality`, `renderer.batching`; C-36 `SceneCompileContext.quality` is filled from the C-27 controller.
- `packages/aura3d-cli/src/cli.ts` (lane 05): C-39 `registerCodemod("prd11-batch-optout")` from `packages/aura3d-cli/src/commands/prd11/`.
- Benchmarks (lane 12): C-30 lane scenes in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/`.

Changed by request only (§12.3): `index.ts:12338` fps literal and `:11336`, diagnostics snapshot throttle `:11678`, overlay `:18654`, root mount `:13586-13597` (lane 15); `compiler/primitives.ts` (`:14014-14755`; lane 15); `compiler/postprocess.ts` (volumetric `:12810`, `:12938`) and `renderer/PostprocessExecution.ts` (`Renderer.ts:977-1330`) (lane 03); `renderer/ShadowOrchestration.ts` point-shadow readback (`Renderer.ts:1516-1603`, `:1915-1931`) (lane 02); `WebGL2Device.ts` GL-object invalidation on restore and VAO counter (lane 01); `ForwardPass.ts` 64-instance chunking (lane 01); `GameAppRuntime.ts:126-129` (lane 09); `nodes/particles.ts` (`collectParticleBudgetDiagnostics` `:8344-8358`, lane 07); `tools/quality-rebuild-capture/capture-games.mjs`, `benchmarks/quality-rebuild/capture.mjs`, `.github/workflows/quality-rebuild-capture.yml` (lane 12); `games.json` and every game route under `apps/showcase-*`, `apps/aura-clash-showcase/` (lane 14); `apps/wow-webgpu-product-viewer/` (lane 04); `templates/production-webgpu-starter`, `tools/agent-templates/`, skills (lane 13); `packages/rendering/src/index.ts:1163-1168` barrel re-exports, `packages/editor/` serializer, `BUNDLE_SIZES.md`, `tests/browser/context-loss-recovery.spec.ts` (no package import, so lane 15 by the creator rule) (lane 15).

Create (all lane 11 paths):
- `packages/rendering/src/quality/QualityTier.ts` (re-exports the frozen C-27 table from `contracts/quality.ts`, adds validation helpers), `quality/DeviceProbe.ts`, `quality/DeviceClasses.ts` (versioned renderer-string table), `quality/TierResolver.ts`, `quality/RenderScaleController.ts`, `quality/QualityGovernor.ts`, `quality/FrameStats.ts` (real `frameStatsSlot` provider with GPU timing), `quality/PostprocessGuard.ts` (pure plan filter wired by lane 03).
- `packages/rendering/src/batching/BatchedGeometryPool.ts`, `batching/MultiDrawBatch.ts`, `batching/DrawDataTexture.ts`, `batching/StaticMergePlanner.ts`, `batching/ContentKeys.ts` (geometry content key and `materialSpecKey`), `batching/shaders/{drawId,instanceEmissive}.glsl.ts` (C-02 chunks).
- `packages/rendering/src/resources/ResourceRegistry.ts` (real `resourceRegistrySlot`), `resources/RenderTargetPool.ts` (real `renderTargetPoolSlot`).
- `packages/rendering/src/program/UniformLayout.ts`, `program/chunks/manifest.ts` (both lane 11 by §4.1).
- `packages/rendering/src/lanes/prd11.ts`, `packages/engine/src/lanes/prd11.ts` (lane barrels: `slot.provide`, contributor, section and app-extension registration), `packages/engine/src/agent-api/compiler/diagnosticOnly.prd11.ts`.
- Phase 6+ (conditional, §6.2): `packages/rendering/src/webgpu/device/WebGPURenderDevice.ts`, `webgpu/device/PipelineCache.ts`, `webgpu/device/BindGroupLayouts.ts`, `webgpu/device/UniformRing.ts`, `webgpu/device/MipGenerator.ts`, `webgpu/WgslAssembler.ts`, `program/chunks/*.wgsl.ts`.
- `tools/perf-gate/` (budget evaluator over capture reports), `tests/qr/prd11/**` (unit, browser and fixture files, incl. `tests/qr/prd11/fixtures/renderer-strings.json`), `tests/unit/contracts/impl/prd11-{quality,device,renderer-factory}.test.ts`, `.github/workflows/qr-prd11-perf.yml`, `scripts/migrations/prd11-batch-optout.mjs`, `packages/aura3d-cli/src/commands/prd11/index.ts`, lane benchmark scenes `prd11-draw-call-stress`, `prd11-instancing-100k`, `prd11-tier-ladder` (C-30 ids; the earlier "19-/20-" numbering is withdrawn per CONTRACTS §3.8).

Delete (lane 11 paths only):
- Phase 1: `production-runtime/backends/webgpu/*.ts` (5 files, 2 lines each), `production-runtime/backends/webgl2/*.ts` (6 one-line/two-line re-exports, including `WebGL2StateCache.ts` which re-exports the real `packages/rendering/src/WebGL2StateCache.ts`; the real file stays), `production-runtime/backends/WebGPURendererBackend.ts`, `webgpu/WebGPUPipelineCache.ts`, `webgpu/WebGPUBuffer.ts`, `webgpu/WebGPUTexture.ts`, `webgpu/WebGPUCompute.ts` (re-export façades; the matching `packages/rendering/src/index.ts:1167-1168` re-exports are removed by request Q-15-5, so until then the façades are kept as one-line deprecated re-exports and deleted in the same release), `packages/materials/src/NodeMaterial.ts` (barrel line by Q-15-5), `production-runtime/shaders/wgsl/pbr.wgsl` (outputs `abs(normal)`) and `skybox.wgsl` (constant colour), `productProp*` functions and `u_productColorSmoothing` in `WebGPUDevice.ts`, `rasterizeDraw` / `rasterizeTriangle` and `colorPixels` from the production WebGPU device (keep CPU raster only in `MockRenderDevice`). `production-runtime/backends/RendererBackend.ts` and `WebGL2RendererBackend.ts` are deleted only if `rg -l "RendererBackend" packages tools apps` shows no importer other than the deleted façades; otherwise they stay and are listed in the Phase 1 PR description.
- Phase 2: nothing in lane 11 files; production reachability of `executePixelPostprocessPass` is removed by lane 03 wiring `PostprocessGuard` (Q-03-1).
- Phase 7 (conditional): `packages/rendering/src/WebGPUDevice.ts` in favour of `webgpu/device/`.

---

## 6. Architecture proposal

### 6.1 Ownership split (CONTRACTS §4.1) and the contracts across it

Lane 01 owns, behind `A3D_QR_CORE`, the renderer core this lane measures: `DrawPacket` pool, `RenderPipeline` cache, uniform last-value cache, UBOs `AuraFrame`/`AuraLights` (C-08), persistent `InstanceBuffer` + VAO-leak fix (C-07), static merge at mount via `MeshConsolidation`, blend modes (C-04), `ProgramWarmup`/`ProgramCache` (C-02), DPR default `min(devicePixelRatio, tier.maxPixelRatio)` (reads C-27), `ResolutionGovernor.ts`, `preserveDrawingBuffer: false` and `app.capture()` (C-05). This lane consumes those only through the contracts named, against their PR 0a stubs.

This lane owns (all in lane-11 paths, §5):
1. The **tier table** (C-27, data real in PR 0a) and its auto-detection (`quality/*`). Lane 01 reads `maxPixelRatio`/`minRenderScale`; other lanes read their rows (§6.3).
2. The **quality governor** and a lane-owned render-scale controller (`quality/RenderScaleController.ts`) that applies scale through C-27 `forceRenderScale` (stub: `createAuraApp` canvas sizing). When lane 01's `ResolutionGovernor` exists it may implement the same `RenderScaleSource` interface; CCR-11-1 proposes a `renderScaleSourceSlot` in C-27 so the swap needs no consumer change.
3. **Measured telemetry**: C-28 FrameStats (GPU scopes), counters, probe; C-31 sections `frame`/`quality`/`renderer.batching`. The `|| 60` literal is in a lane 15 file and is replaced on request Q-15-1; `diagnostics().frame` is measured from day 0 regardless.
4. **Cross-node batching** in `renderer/CullingBatching.ts`, `batching/*`, `forward/DrawSubmit.ts`, `webgl2/MultiDraw.ts`: content-keyed instancing (no engine change needed, §6.6), `WEBGL_multi_draw` batches, BVH culling.
5. **No CPU readback in production frames**: C-28 readback counters, `quality/PostprocessGuard.ts`, C-28 `RenderTargetPool`, context-restore rebuild (C-29 `ResourceRegistry`, `webgl2/ContextLifecycle.ts`). Lane 03 wires the guard and pool into post execution (Q-03-1).
6. **Performance budgets** and the CI gates that enforce them (`tools/perf-gate/`, `.github/workflows/qr-prd11-perf.yml`) on lane scenes standalone, and on the 18 games and benchmark at checkpoints.
7. **WebGPU decision** (C-29 backend selection, `A3D_QR_WEBGPU`), the Phase 1 freeze and the conditional Phase 6+ backend that assembles WGSL from C-02-registered chunks plus lane-11 WGSL twins.
8. **Measured acceptance of the perf stack** through C-28 counters: VAO-leak, zero-allocation submission and warm-up hitch checks run against whatever implementation is behind each slot (stub or real) and are reported per checkpoint; they gate this lane's merges only where the code under test is lane 11's.

### 6.2 WebGPU decision

**Decision: WebGL2 is the only shipping backend. WebGPU is frozen now and rebuilt later only behind gate G-WGPU.**

Reasoning from evidence:
- Zero of 18 games select WebGPU (`index.ts:13590`). Every visual and perf defect the owner sees is on WebGL2.
- The existing WebGPU device cannot be evolved. Its shader selection is a string lookup (`WebGPUDevice.ts:3179-3311`), its lighting is a different model from WebGL2, and its submission model is one pass and one submit per draw. Fixing it means replacing the shader source, binding model, submission model and CPU raster. Nothing structural survives except the post WGSL, TAA, async readback and device-loss plumbing.
- What WebGPU would add that WebGL2 cannot: compute (resident GPU particles in the scene pass, GPU culling, GPU skinning pre-pass), storage-buffer instancing with no attribute limits, indirect draws, render bundles, `createRenderPipelineAsync`, and timestamp queries. These are real, but they matter only once the WebGL2 path stops wasting 4-120x on CPU overhead and readback. Lane 07's GPU particles (C-20) can run on WebGL2 via transform feedback or texture ping-pong at the C-27 tier budgets; WebGPU raises the ceiling, it is not the floor.

Phase 1 freeze (immediate, no new WebGPU features):
- Delete Duck gates, `u_productColorSmoothing`, the CPU raster from the production device and the façade files (§5). Make sync `readPixels` and `readFloatPixels` on WebGPU throw `new RenderDeviceError("Synchronous readback is not supported on WebGPU; use readPixelsAsync", "WEBGPU_SYNC_READBACK_UNSUPPORTED")` (constructor is `(message, code, details?)`, `RenderDevice.ts:462-471`); evidence tools use `readPixelsAsync`.
- Make the marker regex fallback a hard error: any shader that has no WGSL (not `portable`, not `passthrough`, no matching marker) becomes `new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING", { marker: sources.marker })`, never flat colour. This makes the remaining probes honest without new work.
- Rename or demote (lane 11 paths edited directly; others by request): `apps/wow-webgpu-instancing` → delete (it does not instance: one `RenderItem` per cube built every frame, `src/main.ts:44-55`); `apps/webgpu-lab` keeps its directory (a new `apps/backend-availability-lab/` path would fall under lane 15's `apps/` default) but is retitled "Backend availability lab" and stops claiming rendering parity; `templates/production-webgpu-starter` → removed from `tools/production-runtime-template-readiness` and `tools/production-runtime-package-surface-readiness` listings here, and from `tools/agent-templates/index.ts` and root `templates/` by request Q-13-1 (it is not in `packages/create-aura3d/templates/`); `apps/showcase-webgpu-particle-lab` → `apps/showcase-particle-lab` by request Q-14-12; `apps/wow-webgpu-product-viewer` → remove material clamps (`src/main.ts:51-66`) by request Q-04-1, or delete.
- Replace WebGPU claims in `docs/rendering/webgpu-current-architecture.md`, `webgpu-fallback.md`, `webgpu-hardware-matrix.md`, `webgpu-route-and-report-evidence.md` (owned) with one status line: "WebGPU: experimental probe device; not used by any game; no visual parity claim." Package READMEs (lane 15) and skills (lane 13) receive the same line as C-40 fact F-11-02 (Q-13-2, Q-15-6).
- `ProductionRuntimeRenderer` keeps `"webgpu"` and `"auto"` internally; `renderer/RendererFactory.ts` (C-29) selects WebGPU for `"auto"` only with `A3D_QR_WEBGPU` on and tier `ultra`, so `createAuraApp` does not expose WebGPU by default. `experimental-webgpu` stays in the frozen union type (`index.ts:1761`; removing a member is not an allowed CCR) but `app/rendererOptions.ts` throws `AuraMigrationError` for it.
- Freeze the 10 `tools/*webgpu*` audit tools and the 46 WebGPU browser specs: lane 11 deletes the specs and tools it owns that test removed behaviour (Duck route parity, sync pixel proof) and moves triangle, render-target and async readback specs to a non-gating `webgpu-smoke` job in `.github/workflows/qr-prd11-perf.yml`; specs owned by another lane under the §4.1 creator rule are listed in request Q-15-7.

Gate G-WGPU: a scope decision for the conditional Phases 6-8, evaluated at a G-PANEL checkpoint (CONTRACTS §7) and recorded in `docs/project/aura3d-quality-rebuild/evidence/prd-11/decisions/G-WGPU.md`. It never holds Phases 0-5 or any other lane. All of the following must hold at the checkpoint:
1. C-02 conformance passes for `real` and the checkpoint's compiled-feature report (C-36 `compiledFeatures`) shows every lit, unlit, skinned, morph, instanced and depth program used by the 18 games and 18 benchmark scenes comes from the generator (no hand-written programs).
2. All 18 games meet the macos-14 Medium-tier runner budget in §17.2 on WebGL2 for two consecutive checkpoint captures.
3. Lane 07 has recorded (C-40 fact) a concrete particle workload the WebGL2 C-20 path cannot reach at the High/Ultra budget (for example 200k particles with depth collision). That workload is the first WebGPU deliverable.
4. Lane 15's architecture decision record does not adopt three.js `WebGPURenderer` as the render core. If it does, Phases 6-8 are cancelled and replaced by that migration; Phases 0-5 still apply because they fix the shipping path.

Pure groundwork that cannot ship pixels (`program/UniformLayout.ts` std140/WGSL offsets, `program/chunks/manifest.ts` parity test, `tools/wgsl-validate/` naga job) may start at any time; it is listed under Phase 6 for tracking only.

Phase 6+ backend (if G-WGPU passes): a new `WebGPURenderDevice` implementing the same `RenderDevice` / `RenderState` / program contract as `WebGL2Device`, consuming generator output with `target: "wgsl"` (§8.4). Design rules:
- One command encoder per frame; one render pass per render target per frame, many draws.
- Pipelines from `createRenderPipelineAsync`, keyed on `(programKey, renderStateKey, vertexLayoutKey, colorFormats, depthFormat, sampleCount)`; warm-up compiles all pipelines the first frame needs before `app.ready`.
- Explicit bind group layouts: group 0 frame/view (uniform, dynamic offset per view), group 1 lights/shadows/environment, group 2 material (cached per material instance, rebuilt on texture change), group 3 object (uniform ring buffer, 256-byte aligned dynamic offsets).
- Per-object data in a persistent `UniformRing` (triple-buffered, `writeBuffer` once per frame for the dirty range). Instancing reads `array<mat4x4f>` from a storage buffer via `@builtin(instance_index)`; no instance cap.
- Full pipeline state: `cullMode`, `frontFace`, PRD 01 blend modes, 8 depth compare functions, `depth32float` (or `depth24plus`) shadow maps with `sampler_comparison`.
- GPU mip generation (`MipGenerator`, render-pass blit per level).
- Canvas MSAA via a multisampled colour target resolved into the swap-chain texture.
- No CPU raster; sync readback throws.
- Compute: lane 07 moves `ResidentGPUParticleRenderer` (its file) into the scene pass (shared depth buffer) on request Q-07-2, driven by the C-20 particle API; this lane supplies the device-side storage-buffer and compute-pass support in `webgpu/device/`.

### 6.3 Quality tiers

One tier table drives DPR caps, governor ranges and feature levels for every subsystem. Owners of each feature implement the feature; this table is the contract they read. The authoritative copy is the frozen `QUALITY_TIERS` in `packages/rendering/src/contracts/quality.ts` (C-27, real data in PR 0a), which includes the R9 (anisotropy), R10 (Ultra froxel grid) and R11 (Ultra particle budget) corrections. This section restates it with the consuming lane; a value change is an additive CCR approved by this lane and the consuming owner (CONTRACTS C-27 semantics).

| Setting (C-27 field) | Low | Medium | High | Ultra | Read by (lane, contract) |
|---|---|---|---|---|---|
| `maxPixelRatio` | 1 | 1.5 | 2 | 3 (backing ≤ 8.3 MP) | 01 (canvas sizing, C-05) |
| `minRenderScale` (of tier DPR; floor 1/DPR CSS rule) | 0.5 | 0.6 | 0.7 | 0.75 | this lane's `RenderScaleController`; 01 `ResolutionGovernor` when it exists |
| `targetFrameMs` (default; `targetFrameRate` option overrides) | 33.3 (mobile) / 16.7 (desktop) | 16.7 | 16.7 | 16.7 (8.3 at 120 Hz if `targetFrameRate: "display"`) | governor |
| `msaaSamples` | 0 | 4 | 4 | 4 (MSAA fallback when TAA lacks motion vectors) | 01 HDR target (C-05) |
| `postAntiAlias` | `fxaa` | `none` (MSAA) | `none` (MSAA + 01 specular AA) | `taa` | 03 (C-13, C-14) |
| `shadow.mapSize` / `cascades` | 1024 / 1 | 2048 / 2 | 2048 / 3 | 4096 / 4 | 02 (C-11) |
| `shadow.filter` | `pcf2` (1 tap `sampler2DShadow`) | `pcf3` (4 bilinear taps) | `pcf5` (9 taps) | `pcf5` | 02 (C-11) |
| `shadow.contact` | false | false | false | true | 02 (C-11) |
| `shadow.localShadowLights` | 0 | 1 spot | 2 spot or 1 point | 4 (any) | 02 (C-10, C-11) |
| `maxLightsPerPixel` | 4 | 8 | 16 | 32 (clustered) | 01 light buckets (C-08) |
| `ambientOcclusion` | `off` | `low` (SAO half-res, 8 samples) | `medium` (GTAO half-res, 12 samples, bilateral upsample) | `high` (GTAO full-res, 16 samples, temporal) | 03 (C-13) |
| `ssr` | `off` | `off` | `medium` (half-res, 32 steps) | `high` (full-res, 64 steps, temporal) | 03 (C-13) |
| `bloomMipLevels` | 3 (from half-res) | 5 | 6 | 6 + HDR threshold | 03 (C-13) |
| `volumetricFog` / `froxelGrid` | `analytic` / null | `analytic` / null | `froxel-medium` / [160,90,64] | `froxel-high` / [240,135,128] (R10; 07 may report `VOLUMETRIC_GRID_REDUCED` to 96 slices) | 07 (C-21) |
| `particleBudget` (live, all emitters) | 2,000 | 10,000 | 50,000 | 100,000 (200,000 with WebGPU compute, R11) | 07 (C-20) |
| `softParticles` | false | true | true | true | 07 (C-20) |
| `lodBias` (multiplies screen-size thresholds) | 2.0 | 1.5 | 1.0 | 0.75 | 05 `LodSelector`, 10 (C-26) |
| `primitiveSegments` | `half` | `full` | `full` | `full` | 01 (C-07 tessellation) |
| `maxTextureSize` | 1024 | 2048 | 4096 | 4096 | 04 (`textures/TextureBudget.ts`), 05 |
| `textureBudgetBytes` (today 256 MiB everywhere, `index.ts:1790`) | 128 MiB | 256 MiB | 512 MiB | 1 GiB | 04, 05 (C-16, C-17) |
| `anisotropy` (R9) | 4 | 8 | 16 | 16 | 04 (C-12) |
| `environmentSize` (PMREM) | 128 | 256 | 512 | 1024 | 02 (C-09) |
| `drawBudget` (warning, not cap) | 150 | 300 | 600 | 1,500 | C-31 `renderer.batching` section; 14 route budgets (C-35 `GameBudgets.drawCalls`) |

Rules:
- Tier changes that alter generated code (cascade count, PCF taps) are C-02 feature bits. Warm-up of the current and next-lower tier keys goes through C-02 `ProgramCacheLike.precompile` and C-28 `compileAsync`; with the PR 0a stubs (`precompile` wraps `ShaderLibrary`; `compileAsync` resolves after a synchronous compile) the warm-up still runs, it is just not parallel, which `AuraPrecompileReport.parallel` reports.
- Apps can override any field: `quality: { tier: "high", overrides: { ssr: "off" } }` (`resolveTierSettings` validates; invalid → `QUALITY_OVERRIDE_INVALID`).
- `"auto"` is the default in option types. An explicit `pixelRatio` still wins over `maxPixelRatio` (C-27 semantics).

### 6.4 Tier auto-detection

`TierResolver.detect(probe)` runs once before first frame and returns `{ tier, reasons[], confidence }`:

1. **Hard floors.** No `EXT_color_buffer_float` (or half-float) → Low. `maxTextureSize < 4096` → Low. Software rasterizer (renderer string matches `/SwiftShader|llvmpipe|Microsoft Basic Render|WARP/i`) → Low with `confidence: "high"`.
2. **Class table.** The renderer string is read from `gl.getParameter(gl.RENDERER)` first (Firefox returns a sanitized real string there and deprecates the debug extension), then from `WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL` when exposed (Chromium). It is mapped through a small, versioned table in `quality/DeviceClasses.ts`. The table must agree with the §17.1 hardware classes; one row per class:
   - Ultra: NVIDIA RTX 40xx desktop at 4070 or above, RTX 50xx desktop; Apple M3 Max, M4 Max, M-series Ultra.
   - High: Apple M1/M2/M3/M4 Pro, M1/M2 Max; NVIDIA RTX 20/30 desktop and RTX 30/40 laptop; AMD RDNA2+ (RX 6000/7000).
   - Medium: Apple M1-M4 base; Intel Iris Xe and Arc integrated; Adreno 650-799; Apple A14 and newer (only identifiable through signals, see below).
   - Low: Intel UHD/HD; Adreno 500-640; Mali-G5x/G7x; Apple A12/A13; `Apple Paravirtual device` (CI runner).
   - Unknown → Medium with `confidence: "low"`.
   Masked strings: Safari returns `"Apple GPU"` for every Apple GPU, and some privacy modes return a generic string. For `"Apple GPU"` with `mobile === true` the class is Medium, `confidence: "low"` (A12/A13 phones are then corrected by calibration in step 4); with `mobile === false` it is Medium, `confidence: "low"`. Any other masked string goes to step 3 with Medium, `confidence: "low"`.
3. **Signal adjustment.** `navigator.hardwareConcurrency ≤ 4` or `navigator.deviceMemory ≤ 4` (Chromium only; the value is quantised and capped at 8) lowers one tier when `mobile === true`. If the backing area at the candidate tier's `maxPixelRatio` exceeds 4 MP on a Low/Medium class, DPR is lowered within the tier (to the largest value keeping ≤ 4 MP, not below 1), not the tier.
4. **Calibration frames.** The first 30 rendered frames after `app.ready` are timed (GPU timer query if available, else rAF interval). If p50 > 1.25 × `targetFrameMs` the resolver drops one tier before the governor engages; if GPU p50 < 0.5 × target with confidence low, it raises one tier. Raising requires GPU timer samples: the rAF interval is vsync-capped and can never fall below the display interval, so interval-only calibration only ever lowers. This runs under the start screen; games already show a title card.
5. **Persistence.** The decision is cached in `localStorage["aura3d.quality.v1"]` keyed by `(unmaskedRenderer || "masked", engineVersion, screen.width x screen.height x DPR)`. A cached decision skips step 4 calibration but the governor still runs.
6. **Contract mapping.** The result is published as C-27 `AuraTierDecision { tier, source, reason }` with `source` ∈ `"explicit"` (option), `"url"` (`?aura3d-quality=`), `"cache"`, `"classified"` (steps 1-3), `"calibrated"` (step 4), `"default"` (C-27 stub fallback: `"high"` desktop, `"medium"` on `(pointer: coarse)`). The richer fields (`confidence`, `reasons[]`, unmasked renderer) ride on the optional extension proposed in CCR-11-2 and are always present in the C-31 `quality` section. Until this lane's resolver is provided (`slot.provide` in `packages/rendering/src/lanes/prd11.ts`, flag `A3D_QR_TIERS`), every consumer sees the stub decision, so no consumer waits.

### 6.5 Quality governor

Render scale is stepped by a `RenderScaleSource` (`sample(frameMs, gpuMs?) → renderScale`, 0.1 steps, down after 30 frames over `targetFrameMs · 1.1`, up after 120 frames under `targetFrameMs · 0.8`). This lane ships the default implementation in `quality/RenderScaleController.ts` and applies the scale through C-27 `forceRenderScale` (stub path: `createAuraApp` canvas sizing, `index.ts:11126-11140`). Lane 01's `ResolutionGovernor.ts` may implement the same interface once it exists (CCR-11-1 adds `renderScaleSourceSlot` to C-27); until then nothing waits on it. The interface exposes no "at floor" flag, so `QualityGovernor` derives it: `effectiveFloor = max(tier.minRenderScale, allowSubCssResolution ? 0 : 1 / devicePixelRatio_effective)` where `devicePixelRatio_effective` is the backing DPR in use, and "at floor" means the last returned scale ≤ `effectiveFloor + 1e-6`. `QualityGovernor` wraps it:
- If render scale has been at the effective floor for 300 consecutive frames (120 on `mobile === true`, §17.1) and p50 GPU ms (or interval ms when no timer) over the last 60 frames > `targetFrameMs · 1.1`, step one feature down in this order: SSR → AO → volumetric froxels → shadow cascades → shadow map size → bloom mips → particle budget → MSAA samples. "One step" sets that feature to the value the next-lower tier has for it in §6.3 (for example High SSR `half-res` → Medium `off`; High AO GTAO half-res → Medium SAO). A feature whose current value already equals the next-lower tier's value, or the `floor` tier's value, is skipped and the next feature in the order is stepped instead. Never a whole-tier jump.
- After a step the counter resets: the next down-step needs another 300 frames over threshold.
- Step back up in reverse order after 600 consecutive frames under `targetFrameMs · 0.7` with render scale at 1.
- Never steps while `quality.lock()` is set. The capture harness locks through `globalThis.__AURA3D_LIVE_APPS__` before every shot (request Q-12-2; this lane's own specs do it directly), and the governor also treats an in-flight C-05 `app.capture()` as locked when that member reports it. Evidence capture locks the tier so screenshots are reproducible.
- Every step emits `quality.onChange({ from, to, reason, frameMsP50 })` and a diagnostics entry.
- Single authority: when the engine governor is enabled (`adaptive` not false, `A3D_QR_TIERS_GOVERNOR` on), `createPerformanceGovernor` (`GameRenderPreset.ts:158`, lane 11) accepts an optional `quality: AuraQualityController` and, when given one, no longer steps `particleScale`, `lodBias` or `shadowSize` itself; it forwards to `app.quality` overrides and reports `delegated: true` in its snapshot. `GameAppRuntime`'s `performanceBudget` loop (`GameAppRuntime.ts:126-129`, lane 09) passes `app.quality` into it on request Q-09-1; until that lands the two governors can both act on games that set `performanceBudget` (no shipped game does, §2.7). With `adaptive: false` both keep today's behaviour. Unit test (lane-owned, on `GameRenderPreset.ts`): a governor constructed with a controller produces one step per over-budget window, not two.

### 6.6 Batching and draw reduction (WebGL2)

Three layers, applied in order at scene mount and on structural scene change (not per frame):

1. **Content-keyed dedupe (renderer, lane 11).** The engine creates a unique `Geometry` and `PBRMaterial` per primitive node (`index.ts:14678-14692`, lane 15 after PR 0b). Instead of editing that compiler, `batching/ContentKeys.ts` computes keys the renderer can trust: `geometryContentKey(geometry)` = primitive descriptor when the C-07 tessellation metadata is present, else a hash of vertex count, index count and a strided sample of the position/normal/uv arrays, memoised per `Geometry` in a `WeakMap` and verified by full-array compare on first collision; `materialSpecKey(material)` = stable key of every scalar field and texture identity except `baseColor`, `emissive`, `emissiveIntensity` and `opacity` (when ≥ 0.999). Items whose keys match but whose colours differ are merged with per-instance colour through the existing legacy `RenderItem.instanceColors` → `a_instanceColor` path (`ForwardPass.ts:43`, `:1787-1791`; `ShaderLibraryCore.ts:244,259`), so dedupe works on the flag-off core. Per-instance emissive needs the `prd11.instanceEmissive` C-02 feature (generated path only); emissive-varying items stay separate on the legacy path (`reasonsNotBatched["emissive-varies"]`). An engine-side cache in `compiler/primitives.ts` (request Q-15-2) is an optimisation that reduces mount-time hashing, not a precondition.
2. **Instancing by key (renderer).** Items sharing `(geometryContentKey, materialSpecKey, castShadow, renderStateKey)` (C-04) become one instanced item backed by C-07 `instanceBufferSlot` (stub: today's per-frame upload; real: lane 01's persistent buffer). The plan is rebuilt only on structural change (C-37 registry `version`, or a change in the item list's identity set), never per frame. Dynamic transforms update matrices in place. Chunking: while the stub instance path is active the planner caps groups at `MAX_GPU_INSTANCES` (64, `ForwardPass.ts:121`); once C-07 real is provided the cap is the buffer capacity.
3. **Multi-draw (renderer).** Remaining static items with the same program and render state but different geometry (for example a board of boxes, cylinders and tori with different materials) are packed into a `BatchedGeometryPool` (one shared vertex buffer and index buffer per vertex layout) and drawn with `WEBGL_multi_draw.multiDrawElementsInstancedWEBGL` via `webgl2/MultiDraw.ts` (C-28 `multiDrawElementsInstanced?`), with per-draw data (model matrix and scalar material params) in a `DrawDataTexture` (RGBA32F, 4 texels per matrix + 2 texels material params) indexed by `gl_DrawID`. Materials in a batch are restricted to scalar PBR (no per-draw textures); textured materials batch only by layer 2. Without the extension the same packing is drawn with a loop of `drawElements` calls reusing one VAO and one program, with `u_drawId` as a uniform. Both variants need the `prd11.drawId` vertex feature, which only the generated path (C-02 real, `A3D_QR_CORE=v2`) can splice; with the C-02 stub (`generateProgram` throws `PROGRAM_GENERATOR_PENDING`) the planner skips layer 3 and reports `reasonsNotBatched["multi-draw-generator-pending"]`.

Shadow passes use the same batches: layer 1-2 instanced casters already render through the existing instanced depth path; layer 3 casters register `prd11.drawId` as a C-11 depth-variant feature (stub: stored, applied once lane 02's `DepthPass` consumes registered features).

### 6.7 Culling

- `renderer/CullingBatching.ts` (carve-out of the explicit-item culling `Renderer.ts:2208-2258`) builds a `BVH` over static item world bounds at plan time and refits dynamic items per frame. Frustum test walks the BVH when item count > 256; below that, a flat allocation-free loop over a `Float32Array` of bounds.
- Batches carry per-instance bounds; instanced draws whose every instance is outside the frustum are skipped; partial visibility draws the full instance count (GPU culling only in WebGPU Phase 8).
- Lane 02's light-frustum caster query can use the same BVH through the exported `performance/BVH.ts` API (casters are not filtered by camera frustum; research/02 §3.3). This is offered, not required (request Q-02-2).

### 6.8 No CPU readback in production

- `quality/PostprocessGuard.ts` exports `guardPostprocessPlan(passes, { mode: "throw" | "drop", device })` that returns `{ passes, dropped }`: a pass is allowed only if it is GPU-expressible on this device (in the fusable set of `canFuseLdrPostprocess`, `Renderer.ts:2111-2120`, **and** `device.presentLdrPostprocess` exists, **and** any depth input has a sampleable depth texture, `Renderer.ts:1085`), or is a C-13 `gpuOnly` registered pass. Mode comes from C-36 `SceneCompileContext.strict` (`A3D_QR_STRICT`) — `"throw"` raises `new RenderDeviceError("Postprocess pass has no GPU implementation", "POSTPROCESS_PASS_CPU_ONLY", { passes })` — else `"drop"`, which records `POSTPROCESS_PASS_DROPPED:<name>` once per pass name. No bundler env flags are used (`import.meta.env` is Vite-only). The CPU kernels remain callable only when `postprocess.execution === "cpu-deterministic"` (tests and `MockRenderDevice`). Lane 03 calls the guard at the top of `executePostprocess`/`executePostprocessAsync` in `renderer/PostprocessExecution.ts` (request Q-03-1, behind `A3D_QR_TIERS`); this lane proves the guard as a pure function and the counters prove the result.
- `effects.volumetricFog` should map to analytic height fog in the forward shader only (the existing `resolveVolumetricFog(...).forward` terms at `index.ts:12760-12786`) and submit no `volumetricLight` pass (`index.ts:12810`, `:12938`) whenever lane 07's GPU volumetric pass (C-21) is not active. The file is lane 03's `compiler/postprocess.ts` (request Q-03-2); with the guard wired, the pass is dropped anyway, so either change alone removes the readback.
- `contact-shadow`, `film-grain`, `chromatic-aberration`: dropped by the guard with a diagnostics error, never run on the CPU, whenever lanes 02/03 have not registered a GPU pass for them (C-13).
- Post targets come from C-28 `renderTargetPoolSlot` (real implementation `resources/RenderTargetPool.ts`, keyed by `(width, height, format, samples, depth)`); the `createRenderTarget` calls inside post execution (`Renderer.ts:1004`, `:1034`, `:1140`, `:1169`) are replaced by `acquire`/`release` by lane 03 (Q-03-1). The C-28 counter `renderTargetsCreated` asserts zero creations after frame 2.
- C-28 `counters().readbacks` counts every `readPixels` / `readFloatPixels` / `readDepthPixels` (wrapped in `webgl2/Counters.ts`), including the fused CPU fallback (`Renderer.ts:1097-1109`) and point-shadow face readback (`Renderer.ts:1516-1603`; lane 02, Q-02-1). The C-01 invariant "no phase may perform synchronous GPU readback" is enforced by this counter.

### 6.9 Context loss and restore

C-29 `ResourceRegistry` (real in `resources/ResourceRegistry.ts`) records registered GPU resources' creation descriptors and CPU-side sources (geometry arrays, texture `ImageBitmap` or decoded data reference, program feature key, render target descriptor). Owners register their own resources through `resourceRegistrySlot` (stub: records registrations, `rebuild` calls each in order). On `webglcontextrestored` (`webgl2/ContextLifecycle.ts`, carve-out of `WebGL2Device.ts:418-445`):
1. The device's GL object maps are invalidated so buffers, VAOs, programs and textures recreate lazily from their CPU-side sources (`WebGL2Device` internal maps are lane 01's; request Q-01-1 adds `invalidateGpuObjects()` called from `ContextLifecycle.ts`). Until that lands, the registry rebuilds every registered resource eagerly, which covers render targets (pool), textures with `retainForRestore` and programs via C-02 `precompile`.
2. `renderer/DeviceLifecycle.ts` emits `onDeviceRestored` only after `ResourceRegistry.rebuild` resolves (C-29 semantics). The root bridge pauses rendering while `isDeviceLost()` (request Q-15-3); the canvas is cleared to the background colour meanwhile.
3. Memory policy: Medium and below release decoded image data after upload and re-fetch on restore (slower restore, less memory); High and Ultra retain `ImageBitmap`s.

### 6.10 Telemetry

`quality/FrameStats.ts` is the real C-28 `frameStatsSlot` provider: a fixed-size ring (240 frames) of C-28 `FrameStatsSample { intervalMs, cpuFrameMs, cpuSubmitMs, gpuMs: number | null, scopes }`, paired per frame with a C-28 `DeviceCounters` delta (`drawCalls`, `bufferCreates`, `textureUploads`, `readbacks`, `renderTargetsCreated`, `programCompiles`, live counts and bytes). Percentiles are computed on demand. It is driven by the C-01 frame contributor `prd11.frameStats` (`begin` in `collect`, `end` from a no-draw pass in `after-output`), so it needs no edit to `Renderer.ts`; per-phase GPU scopes (`shadow`, `forward`, `post`) are added by lanes 01/03 calling `frameStatsSlot.get().scope(...)` (Q-01-2, Q-03-1) and appear in `scopes` when they land. The C-31 section `frame` exposes it: `frame.fps` is `1000 / p50(intervalMs)` and is `null` until 30 frames exist (C-28 semantics). The legacy `diagnostics().fps` number uses the same formula over whatever samples exist once lane 15 replaces `index.ts:12338` (Q-15-1). The overlay (`index.ts:18654`, lane 15) shows measured p50/p95 and tier on request Q-15-1.

### 6.11 Recommendations with cost profile

Costs are relative to the current WebGL2 path on the same scene. "Bundle" is gzip added to the root critical path unless stated as lazy.

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory cost | Bundle | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | WebGPU freeze: delete hacks, CPU raster, façades; hard error on missing WGSL | None directly; removes risk of worse pixels and false claims | None for games | WebGPU probes faster (no CPU raster) | −`colorPixels` per WebGPU target | −(WebGPU chunk shrinks; lazy) | None | Probes that depended on removed paths are deleted, not faked |
| R2 | Quality tiers + auto-detect | Lets PRD 01 raise DPR to device native on capable hardware; Ultra unlocks SSR/GTAO/froxels | Per tier (§17) | Detection < 2 ms once; calibration uses frames already rendered | Tier-dependent | +3 KB (table, resolver) | Mobile lands on Low/Medium with DPR ≤ 1.5 and 30 fps target | Unknown device → Medium, governor corrects |
| R3 | Quality governor | Keeps frame time stable instead of stuttering; preserves resolution before features | Reduces under load | < 0.05 ms/frame | None | +2 KB | Critical: thermal throttling on phones is handled | `adaptive: false` |
| R4 | Primitive geometry/material dedupe → instancing by key | Enables denser scenes (more props, more detail) within budget; no visual change by itself | Fewer state changes; same triangles | Large: Gravity Post 1,230+ → target ≤ 150 draws | Less: one geometry per primitive type instead of per node | +2 KB | Large: CPU-bound phones gain most | `batching: "off"` per app; per-node opt-out `batch: false` |
| R5 | `WEBGL_multi_draw` batches + `DrawDataTexture` | As R4 for heterogeneous static sets | One extra texel fetch per vertex for batched draws | Large for scenes with many unique static meshes | Shared VB/IB; +96 B per draw in data texture | +4 KB | Extension availability varies by browser and driver; loop fallback keeps program/VAO savings | Loop of `drawElements` with `u_drawId` |
| R6 | No CPU readback; pooled post targets; analytic fog interim | Deep Recovery becomes viewable; volumetric look reduced to height fog whenever the C-21 GPU volumetric pass is inactive | Same or lower | Removes 0.3-1.9 s/frame (Deep Recovery) | −1 full-frame float buffer per readback | −(CPU kernels tree-shaken from production) | Large; mobile was 282 ms/frame | `execution: "cpu-deterministic"` for tests only |
| R7 | Measured telemetry + fps fix | None directly; makes every perf claim checkable | Timer queries ~0 | < 0.05 ms | 240 × ~64 B | +2 KB | Same | Interval-only when timer query absent |
| R8 | Warm-up for current + next-lower tier, compile telemetry, hitch gate | Removes first-use stalls when VFX/skinned materials appear | None | Compile moved before first interactive frame (longer load, typically 50-400 ms per program count, measured by gate) | Programs for 2 tiers resident | +1 KB (on top of lane 01's C-02 `ProgramCache` warm-up) | Parallel compile matters most on mobile drivers | `compile.mode: "async-skip"` |
| R9 | Context restore rebuild | Canvas recovers instead of staying black | Re-upload cost on restore only | Restore 0.2-2 s | High/Ultra retain `ImageBitmap`s (+ texture bytes in CPU RAM) | +3 KB | Mobile GPUs reset more often; restore is essential | Reload-page prompt via `onDeviceLost` if rebuild fails |
| R10 | BVH culling + allocation-free frustum test | None directly | Fewer draws off-screen | Saves O(n) allocations; BVH walk for large scenes | BVH nodes ~32 B × 2n | +2 KB (already in package; now reachable) | Medium | Flat loop below 256 items |
| R11 | WebGPU backend from generator WGSL (Phase 6+, gated) | Identical pixels to WebGL2 by construction; enables R12 | One pass per target; async pipelines | Lower than WebGL2 at high draw counts (bind groups, bundles) | Uniform ring 3 × frames × objects × 256 B | Lazy chunk ≤ 120 KB, never in WebGL2 critical path | Only where `navigator.gpu` and the probe pass; otherwise WebGL2 | `backend: "auto"` falls back to WebGL2 with reported reason |
| R12 | Resident compute particles in the scene pass (WebGPU, with PRD 07) | Ultra particle density (200k) with depth-correct compositing | Compute dispatch per emitter | No CPU sim | Storage buffers ~48 B × particles | Inside R11 chunk | Not on Low/Medium | WebGL2 GPU particles at the tier budget |
| R13 | Per-route perf fixes (§9.6) | Games become playable; game feel scores stop being capped by fps | Route-specific | Route-specific | Skyline −300 MB heap target, Neon Swarm −1.09M tris | Route bundles shrink (unused assets removed) | Large | n/a (bug fixes) |

---

## 7. APIs to add, change and remove

### 7.1 `@aura3d/engine` agent API

Where the types live: the C-27/C-28/C-29 types are frozen in `packages/rendering/src/contracts/{quality,device,rendererFactory}.ts` and re-exported by `packages/engine/src/contracts/` (PR 0a, custodian lane 15). The `AuraCreateAppRendererOptions` members `quality`, `backend`, `adaptive`, `targetFrameRate`, `batching`, the `AuraApp.quality` member and the flattened `precompile` are pre-declared by C-38 in PR 0a; the `AuraPrimitiveNode.batch`/`static` fields by C-07. This lane implements them in `agent-api/app/rendererOptions.ts`, `packages/engine/src/lanes/prd11.ts` and lane-11 rendering files; it edits no type in `index.ts:1-2097` (frozen except by CCR). Members below marked **CCR-11-n** are additive optional fields this lane proposes (§12.1).

```ts
// Frozen in C-27 (contracts/quality.ts), re-exported by the engine:
export type AuraQualityTier = "low" | "medium" | "high" | "ultra";
export type AuraFeatureLevel = "off" | "low" | "medium" | "high";
// AuraQualityTierSettings: exactly the C-27 field list (maxPixelRatio, minRenderScale, targetFrameMs, msaaSamples,
// postAntiAlias, shadow { mapSize, cascades, filter, localShadowLights, contact }, maxLightsPerPixel, ambientOcclusion,
// ssr, bloomMipLevels, volumetricFog, froxelGrid, particleBudget, softParticles, lodBias, primitiveSegments,
// maxTextureSize, textureBudgetBytes, anisotropy, environmentSize, drawBudget). Values: §6.3.

export interface AuraAdaptiveQualityOptions {
  /** Default true. False disables both the resolution and the quality governor. */
  readonly enabled?: boolean;
  /** Default true. False keeps features fixed and adapts render scale only. */
  readonly features?: boolean;
  /** Lowest tier the feature governor may step down to. Default "low". */
  readonly floor?: AuraQualityTier;
}

// Members pre-declared on the EXISTING interface (index.ts:1781) by C-38 in PR 0a; semantics implemented in app/rendererOptions.ts.
export interface AuraCreateAppRendererOptions {
  // existing members (mode, fallback, qualityProfile, textureBudgetBytes) ...
  /** Default "webgl2". Maps to C-29 RendererCreateOptions.backend: "webgpu-experimental" → "webgpu" only with A3D_QR_WEBGPU on; "auto" selects WebGPU only on ultra with A3D_QR_WEBGPU on (C-29 semantics). */
  readonly backend?: "webgl2" | "webgpu-experimental" | "auto";
  /** Default "auto". C-27 type. */
  readonly quality?: AuraQualityTier | "auto" | { readonly tier: AuraQualityTier | "auto"; readonly overrides?: Partial<AuraQualityTierSettings> };
  /** Default { enabled: true, features: true } when A3D_QR_TIERS_GOVERNOR is on; otherwise governors are off. */
  readonly adaptive?: boolean | AuraAdaptiveQualityOptions;
  /** Default 60; "display" uses the measured vsync interval. */
  readonly targetFrameRate?: 30 | 60 | 90 | 120 | "display";
  /** Default "on" when A3D_QR_TIERS_BATCHING is on, else "off". "off" disables layers 1-3 (debug/rollback). */
  readonly batching?: "on" | "off" | { readonly dedupe?: boolean; readonly instancing?: boolean; readonly multiDraw?: boolean };
}
// Top-level AuraCreateAppOptions.pixelRatio (index.ts:10798) is unchanged and still wins over tier DPR (C-27 semantics).
// Strictness comes from C-38 AuraCreateAppOptions.strict / A3D_QR_STRICT via C-36 SceneCompileContext.strict: PostprocessGuard "throw" (§6.8).

// URL overrides (C-27): read in ALL builds (deployed games are captured from production, §2.6) by app/rendererOptions.ts:
//   ?aura3d-quality=low|medium|high|ultra   forces the tier (C-27 source "url")
//   ?aura3d-adaptive=0                      disables both governors
// They change only quality settings, never content, and are recorded in the C-31 `quality` section.

// Frozen in C-27; real implementation registered as the C-38 `quality` app extension by packages/engine/src/lanes/prd11.ts:
export interface AuraQualityController {
  readonly tier: AuraQualityTier;
  readonly settings: AuraQualityTierSettings;
  readonly decision: AuraTierDecision;
  set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void>; // resolves after warm-up of new programs (C-02 precompile)
  lock(): void;
  unlock(): void;
  /** Test/capture hook: pins render scale (number in [effectiveFloor, 1] or "floor"); null releases. Implies lock() while pinned. */
  forceRenderScale(scale: number | "floor" | null): void;
  onChange(l: (e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void): () => void;
}

// Frozen in C-27:
export interface AuraTierDecision {
  readonly tier: AuraQualityTier;
  readonly source: "explicit" | "url" | "cache" | "classified" | "calibrated" | "default";
  readonly reason: string;
  // CCR-11-2 (additive, optional): confidence?: "high" | "low"; reasons?: readonly string[]; renderer?: string | null; tableVersion?: string
}

// C-27 onChange event is { from, to, reason }. CCR-11-2 adds optional richer fields consumers may ignore:
//   fromSettings?, toSettings?, renderScale?: { from: number; to: number }, kind?: "governor-down" | "governor-up" | "calibration" | "api", frameMsP50?: number

export interface AuraFrameTimingReport {
  readonly frames: number;               // samples in the ring (≤ 240)
  readonly fps: number | null;           // 1000 / p50(intervalMs); null before 30 frames
  readonly intervalMs: AuraPercentiles;  // rAF-to-rAF
  readonly cpuFrameMs: AuraPercentiles;  // engine frame callback, incl. game callbacks
  readonly cpuSubmitMs: AuraPercentiles; // renderer.render only
  readonly gpuMs: AuraPercentiles | null; // null when no timer query
  readonly drawCalls: number;
  readonly instances: number;
  readonly triangles: number;
  readonly programsCompiledSinceReady: number;
  readonly readbacksThisFrame: number;
  readonly bufferCreatesThisFrame: number;
  readonly renderTargetsCreatedThisFrame: number;
  readonly liveBuffers: number;
  readonly liveVertexArrays: number;
  readonly textureBytes: number;
  readonly renderTargetBytes: number;
  readonly tier: AuraQualityTier;
  readonly renderScale: number;
  readonly backingSize: readonly [number, number];
}

export interface AuraPercentiles { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number }

export interface AuraPrecompileOptions {
  /** Extra material/effect variants that appear later (VFX, hit flashes, skinned enemies). */
  readonly include?: readonly (AuraSceneNode | AuraMaterialSpec | { readonly effect: string })[];
  /** Default ["current", "next-lower"]. */
  readonly tiers?: readonly ("current" | "next-lower" | AuraQualityTier)[];
}
export interface AuraPrecompileReport { readonly programs: number; readonly compileMs: number; readonly parallel: boolean }

// AuraApp: `quality` and flattened `precompile` are pre-declared by C-38 (PR 0a). The `frame` report is the C-31 section key
// "frame" (AuraDiagnostics gains optional members for every section key in PR 0a), so no AuraApp type edit is needed:
//   diagnostics().frame?: AuraFrameTimingReport; diagnostics().quality?: AuraQualityDiagnostics; diagnostics().renderer.batching?: BatchPlanReport
export interface AuraQualityDiagnostics { readonly decision: AuraTierDecision; readonly settings: AuraQualityTierSettings; readonly renderScale: number; readonly governorSteps: readonly { readonly frame: number; readonly feature: string; readonly from: unknown; readonly to: unknown }[]; readonly locked: boolean; readonly probe: DeviceProbe | null; }

// C-07 pre-declared (PR 0a) on AuraPrimitiveNode; semantics owned here. The compiler (lane 15) copies them onto
// RenderItem.batch / RenderItem.static (CCR-11-3 adds those two optional RenderItem fields) on request Q-15-2.
//   batch?: boolean   // default true; false keeps the node out of dedupe/instancing/multi-draw
//   static?: boolean  // default inferred: true when the node has no runtime handle and no animation
// Until Q-15-2 lands the planner infers "static" from an unchanged world matrix over 2 consecutive structural versions,
// and treats every item as batch-eligible except transparent, skinned, morph and textured-unique items.
```

Changes:
- `diagnostics().fps` stays typed `number` (no type break for consumers of `AuraDiagnostics`, `index.ts:10379`) but becomes measured: `1000 / median(intervalMs)` over the samples available (≥ 2 frames), `0` before the second frame, read from `frameStatsSlot` (C-28). The literal `diagnosticsState.fps || 60` at `index.ts:12338` is in a lane 15 file and is removed on request Q-15-1 as a declared correctness fix (CONTRACTS §6.1). `diagnostics().frame.fps` (C-31 section, this lane) is the strict variant: `number | null`, `null` before 30 frames, and is measured from day 0 regardless of Q-15-1.
- `qualityProfile?: AuraRendererQualityProfileId` is deprecated (flag alias of `A3D_QR_TIERS`, CONTRACTS §5.1). Mapping in `app/rendererOptions.ts`: `"safe-basic"` → `quality: "auto"`; `"production"` → `"auto"`; `"cinematic"` → `{ tier: "auto", overrides: {} }` with floor `"high"` on desktop; `"experimental-webgpu"` → throws `AuraMigrationError("experimental-webgpu profile removed; see PRD 11 §6.2")`. One release of console warnings, then removal on the lane 15 release train (flag removal, CONTRACTS §5.4).
- `performanceQuality?: AuraPerformanceQuality` and `app.setPerformanceQuality()` are deprecated aliases implemented in `agent-api/RootPerformanceQuality.ts`: `resolutionScale` → `forceRenderScale`; `particleScale` → `overrides.particleBudget = tierBudget * particleScale`; `lodBias` → `overrides.lodBias`; `shadowSize` → `overrides.shadow.mapSize`. Removed one release later.
- `sceneKitPerformanceBudgets`: fields renamed `budgetDrawCalls`, `budgetP50FrameMs`; `calibrationSource` removed; type gets `kind: "aura-scene-kit-budget"` and the docstring "budget, not a measurement". Measured values live in capture reports only.
- `collectParticleBudgetDiagnostics`: `gpuReady` removed; `estimatedUpdateCostMs` renamed `heuristicUpdateCostMs`; adds `measuredUpdateMs` from `FrameStats` scope `particles`.
- `effects.volumetricFog`: documented as "analytic height fog on all tiers" whenever the C-21 GPU volumetric pass (lane 07) is inactive; never submits a CPU pass (guard, §6.8; Q-03-2).

Removed from public types: nothing in the frozen `index.ts:1-2097` types section (CCR rule). Runtime removals: `"experimental-webgpu"` throws; `AuraRendererQualityProfile.preserveDrawingBuffer`/`.pixelRatio` stop being applied when lane 01's C-05 output path is active; `maxRecommendedDrawCalls` is superseded by `settings.drawBudget` and kept as a deprecated field for one release.

### 7.2 `@aura3d/rendering`

```ts
// quality/QualityTier.ts: re-exports the frozen C-27 data and helpers from contracts/quality.ts (QUALITY_TIERS,
// resolveTierSettings, nextLowerTier); adds nothing that changes values. QualityTier = AuraQualityTier.

// DeviceProbe: frozen in C-28 (contracts/device.ts). quality/DeviceProbe.ts implements it; webgl2/Probe.ts exposes it as
// RenderDevice.probe (optional member pre-declared in PR 0a).
//   rendererString: gl.getParameter(gl.RENDERER) (sanitized-real on Firefox, often "WebKit WebGL" / "Apple GPU" on Safari)
//   unmaskedRenderer/unmaskedVendor: WEBGL_debug_renderer_info when exposed; mobile: navigator.userAgentData?.mobile, else coarse pointer
export function probeWebGL2Device(gl: WebGL2RenderingContext, env?: ProbeEnvironment): DeviceProbe;

// quality/TierResolver.ts (decision type = C-27 AuraTierDecision + CCR-11-2 optional fields)
export function classifyDevice(probe: DeviceProbe, table?: DeviceClassTable): AuraTierDecision;
export function calibrateTier(decision: AuraTierDecision, samples: readonly FrameStatsSample[], targetFrameMs: number): AuraTierDecision;
export interface TierCache { read(key: string): AuraTierDecision | undefined; write(key: string, decision: AuraTierDecision): void }
export function tierCacheKey(probe: DeviceProbe, engineVersion: string): string;

// quality/RenderScaleController.ts (lane 11; CCR-11-1 proposes renderScaleSourceSlot in C-27 so lane 01 can provide an alternative)
export interface RenderScaleSource { sample(frameMs: number, gpuMs: number | null): number; readonly scale: number; reset(scale?: number): void }
export function createRenderScaleController(options: { readonly minRenderScale: number; readonly devicePixelRatio: number; readonly allowSubCssResolution?: boolean; readonly targetFrameMs: number }): RenderScaleSource;

// quality/QualityGovernor.ts
export interface QualityGovernorOptions { readonly tier: AuraQualityTier; readonly floor: AuraQualityTier; readonly targetFrameMs: number; readonly features: boolean; readonly mobile: boolean }
export class QualityGovernor {
  constructor(resolution: RenderScaleSource, options: QualityGovernorOptions);
  sample(stats: FrameStatsSample): QualityGovernorStep | null; // called once per frame
  readonly settings: AuraQualityTierSettings;
  lock(): void;
  unlock(): void;
}
export interface QualityGovernorStep { readonly feature: keyof AuraQualityTierSettings; readonly from: unknown; readonly to: unknown; readonly direction: "down" | "up" }

// quality/FrameStats.ts: real provider of C-28 frameStatsSlot. FrameStatsSample / FrameStatsLike are frozen in C-28:
//   FrameStatsSample { intervalMs, cpuFrameMs, cpuSubmitMs, gpuMs: number | null, scopes: Record<string, number> }
export class FrameStats implements FrameStatsLike {
  constructor(capacity?: number, gpu?: RendererGpuTimingBackend); // default 240; gpu from RendererTiming.ts:164
  begin(timestamp: number): void;
  end(): FrameStatsSample;
  scope<T>(name: "shadow" | "forward" | "post" | "particles" | string, fn: () => T): T; // GPU+CPU scoped timing
  percentiles(field: "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs"): { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number };
  fps(): number | null;   // 1000 / p50(intervalMs); null before 30 samples (C-28)
  legacyFps(): number;    // same formula over available samples; 0 before 2 samples (extra, not in FrameStatsLike)
}

// quality/PostprocessGuard.ts (pure; wired by lane 03 in renderer/PostprocessExecution.ts, Q-03-1)
export function guardPostprocessPlan<P extends { readonly name: string }>(passes: readonly P[], options: { readonly mode: "throw" | "drop"; readonly gpuFusable: boolean; readonly hasDepthTexture: boolean; readonly cpuDeterministic: boolean }): { readonly passes: readonly P[]; readonly dropped: readonly string[] };

// RenderDevice optional members, frozen in C-28 (pre-declared PR 0a); this lane makes them real for WebGL2/WebGPU/Mock:
//   probe?: DeviceProbe; counters?(): DeviceCounters; resetFrameCounters?(): void; compileAsync?(shader): Promise<void>;
//   multiDrawElementsInstanced?(mode: "triangles", counts, offsetsBytes, instanceCounts, drawCount): void
// DeviceCounters (C-28): drawCalls, bufferCreates, textureUploads, readbacks, renderTargetsCreated, programCompiles,
//   liveBuffers, liveVertexArrays, textureBytes, renderTargetBytes. CCR-11-4 (optional): instances?, triangles?, programsBound?

// batching/BatchedGeometryPool.ts
export interface BatchedRange { readonly firstIndex: number; readonly indexCount: number; readonly baseVertex: number }
export class BatchedGeometryPool {
  constructor(device: RenderDevice, layout: VertexLayoutKey, initialVertices?: number, initialIndices?: number);
  add(geometry: Geometry): BatchedRange; // copies into shared VB/IB; indices rebased (WebGL2 has no baseVertex draw)
  remove(range: BatchedRange): void;     // marks free; compacts on next mount pass
  readonly vertexBuffer: GPUBufferHandle;
  readonly indexBuffer: GPUBufferHandle;
}

// batching/DrawDataTexture.ts
export class DrawDataTexture {
  constructor(device: RenderDevice, capacity: number); // RGBA32F, width 1024, DRAW_TEXELS (6) per draw
  write(drawIndex: number, modelMatrix: Float32Array, materialParams: Float32Array /* vec4 */): void;
  flush(): void; // texSubImage2D of dirty rows only
}

// batching/MultiDrawBatch.ts
export interface MultiDrawBatchItem { readonly geometry: Geometry; readonly modelMatrix: Float32Array; readonly material: ScalarPBRParams; readonly bounds: Box3Like; readonly castShadow: boolean }
export class MultiDrawBatch {
  static plan(items: readonly RenderItem[], options?: { readonly maxDrawsPerBatch?: number }): readonly MultiDrawBatchPlan[];
  constructor(device: RenderDevice, pool: BatchedGeometryPool, plan: MultiDrawBatchPlan);
  updateMatrix(drawIndex: number, modelMatrix: Float32Array): void;
  draw(visible: Uint8Array | null): number; // returns draws issued; uses multi-draw or loop fallback
}

// batching/StaticMergePlanner.ts
export function planBatches(items: readonly RenderItem[], options: { readonly dedupe: boolean; readonly instancing: boolean; readonly multiDraw: boolean }): BatchPlan;
export interface BatchPlan { readonly instanced: readonly InstancedBatchPlan[]; readonly multiDraw: readonly MultiDrawBatchPlan[]; readonly passthrough: readonly RenderItem[]; readonly report: { readonly inputItems: number; readonly outputDraws: number; readonly reasonsNotBatched: Readonly<Record<string, number>> } }

// resources/ResourceRegistry.ts: real provider of C-29 resourceRegistrySlot (ResourceRegistryLike frozen in C-29)
export class ResourceRegistry implements ResourceRegistryLike {
  register<T extends object>(handle: T, descriptor: { readonly kind: string; readonly rebuild: () => Promise<void> | void; readonly retainForRestore?: boolean }): T;
  unregister(handle: object): void;
  rebuild(device: RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }>;
}

// resources/RenderTargetPool.ts: real provider of C-28 renderTargetPoolSlot (RenderTargetPoolLike frozen in C-28)
export class RenderTargetPool implements RenderTargetPoolLike {
  acquire(desc: { width: number; height: number; format: TextureFormat; samples: 1 | 4; depth: boolean }): RenderTarget;
  release(target: RenderTarget): void;
  trim(maxIdleFrames: number): void;
}

// No RendererOptions (Renderer.ts, lane 01) change. Inputs reach the renderer through contracts instead:
//   tier settings: C-01 FrameContributorContext.tier / C-36 SceneCompileContext.quality
//   batching on/off: A3D_QR_TIERS_BATCHING + AuraCreateAppRendererOptions.batching (C-38), read by the prd11.batching contributor
//   frame stats: C-28 frameStatsSlot; strictness: C-36 SceneCompileContext.strict
// renderer/RendererFactory.ts and renderer/DeviceLifecycle.ts implement C-29 RendererCreateOptions, RendererFrameResult and
// RendererLifecycle exactly as frozen (Renderer.create/renderFrame/renderFrameAsync delegating stubs are added by PR 0b-2).
```

Removed exports (barrel lines in `packages/rendering/src/index.ts` are lane 15's; removed by request Q-15-5 in the same release as the file deletions): `WebGPURendererBackend`, `WebGPUPipelineCache`, the `production-runtime/backends/{webgpu,webgl2}` classes, `Batcher` (superseded by `planBatches`; deprecated re-export for one release). `createRootGpuParticleWorkload` (lane 07's `RootGpuParticleWorkload.ts`) leaves the production entry by request Q-07-2. `FrustumCuller` keeps its name with an allocation-free signature `cull(bounds: Float32Array, count: number, frustum: Float32Array, out: Uint8Array): number`.

### 7.3 Program-layer additions owned here (`program/UniformLayout.ts`, `program/chunks/manifest.ts`, `program/chunks/*.wgsl.ts`)

```ts
// program/UniformLayout.ts
export type UniformMember = { readonly name: string; readonly type: "f32" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4" | "i32" | "u32"; readonly arrayLength?: number };
export interface UniformBlockLayout { readonly name: "AuraFrame" | "AuraLights" | "AuraMaterial" | "AuraObject"; readonly group: 0 | 1 | 2 | 3; readonly binding: number; readonly members: readonly UniformMember[] }
export function std140Offsets(layout: UniformBlockLayout): { readonly size: number; readonly offsets: Readonly<Record<string, number>> };
export function emitGlslBlock(layout: UniformBlockLayout): string; // layout(std140) uniform AuraFrame { ... };
export function emitWgslStruct(layout: UniformBlockLayout, kind: "uniform" | "storage"): string; // struct + @group/@binding var

// webgpu/WgslAssembler.ts (Phase 6, conditional): assembles WGSL from C-02-registered chunk names using the lane-11 WGSL twins
export function assembleWgsl(features: ProgramFeatures, registry: ShaderChunkRegistryLike): { readonly vertex: string; readonly fragment: string; readonly bindGroupLayouts: GPUBindGroupLayoutDescriptor[]; readonly vertexLayout: GPUVertexBufferLayout[]; readonly missing: readonly string[] };
```

`ProgramGenerator.ts` (lane 01) is not edited. If lane 01 later wants `generate(features, { target: "wgsl" })`, it delegates to `assembleWgsl` (request Q-01-3, optional). The `AuraFrame`/`AuraLights` member lists are read from C-08 (`contracts/frameUniforms.ts`), so the layouts track lane 01's UBOs without coordination.

---

## 8. Shader changes

### 8.1 Multi-draw (GLSL 300 es)

Batched program feature `drawId: "multi-draw" | "uniform"` adds to the vertex stage:

```glsl
#ifdef AURA_MULTI_DRAW
#extension GL_ANGLE_multi_draw : require
#define AURA_DRAW_ID gl_DrawID
#else
uniform int u_drawId;
#define AURA_DRAW_ID u_drawId
#endif
uniform highp sampler2D u_drawData;      // RGBA32F, width 1024
flat out int v_drawId;
#define DRAW_TEXELS 6                     // generated; DrawDataTexture uses the same constant

vec4 auraDrawTexel(int id, int slot) {
  int t = id * DRAW_TEXELS + slot;
  return texelFetch(u_drawData, ivec2(t % 1024, t / 1024), 0);
}
// slots 0-3: column-major model matrix; slot 4: vec4(baseColor.rgb, roughness); slot 5: vec4(emissive.rgb * intensity, metallic)
mat4 auraDrawMatrix(int id) {
  return mat4(auraDrawTexel(id, 0), auraDrawTexel(id, 1), auraDrawTexel(id, 2), auraDrawTexel(id, 3));
}
```

`#extension` must precede all non-preprocessor tokens. The chunk is registered from `packages/rendering/src/batching/shaders/drawId.glsl.ts` as C-02 `registerShaderChunk({ name: "a3d_prd11_draw_id", owner: "prd11", stage: "both", glsl, wgsl })` and activated by the frozen `ProgramFeatures.drawId: "multi-draw" | "uniform"` field (already in C-02, marked PRD 11) through `registerShaderFeature({ id: "prd11.drawId", hooks: ["vertex:pars", "vertex:world", "fragment:pars", "fragment:material"], … })`. C-02 `ShaderChunk` has no field to hoist an `#extension` line, so CCR-11-5 adds `requiresExtensions?: readonly string[]` (additive; the generator places them immediately after `#version 300 es`); until it merges, the `uniform` variant (no extension) is used everywhere and multi-draw falls back to the loop path. The vertex stage writes `v_drawId = AURA_DRAW_ID`; the fragment stage declares the same sampler and reads slots 4-5. Normal matrix is `transpose(inverse(mat3(model)))` only when the `nonUniformScale` feature is set; otherwise `mat3(model)` with per-fragment normalisation. `DrawDataTexture` capacity at width 1024 and 6 texels per draw is 170 draws per row; height grows by powers of two up to 64 rows (10,922 draws per batch texture). The chunk compiles standalone through C-02 `ChunkHarness` (real in PR 0a); it reaches production draws only on the generated path (`A3D_QR_CORE=v2`). If the C-02 chunk descriptor lacks an extension-hoist field, CCR-11-5 (above) covers it.

### 8.2 Instancing attributes

Matrices: C-07 `InstanceBufferLike` (lane 01) supplies matrix and colour buffers; the legacy path keeps `u_instanceMatrices[64]` / attribute mode (`ShaderLibraryCore.ts:247-258`) and already reads `a_instanceColor` (location 12, multiplied into `v_vertexColor`, `ShaderLibraryCore.ts:244,259`; uploaded from `RenderItem.instanceColors`, `ForwardPass.ts:1787-1791`). This lane's dedupe therefore uses `instanceColors` (linear RGBA, sRGB→linear on CPU at write) and sets the shared material's base colour to white, so that `baseColor × instanceColor` equals the original per-node colour; the planner merges only when the original materials have no vertex colours and the merge is pixel-identical in S3. `a_instanceEmissive` (vec4: rgb, intensity) is selected by the frozen C-02 field `ProgramFeatures.instancing.emissive` (chunk `a3d_prd11_instance_emissive` in `batching/shaders/instanceEmissive.glsl.ts`; data from `RenderItem.instanceEmissive?`, pre-declared in PR 0a for lane 11) and applies on the generated path only. Depth programs ignore colour attributes but keep matrices (lane 02 casters via C-11).

### 8.3 Tier-driven defines

Only code-shape changes enter the C-02 feature key: `SHADOW_CASCADES 1|2|3|4`, `SHADOW_PCF_TAPS 1|4|9` (lane 02, C-11), `MAX_LIGHTS_PER_PIXEL` bucket (lane 01, C-08), `SOFT_PARTICLES` (lane 07, C-20). AO/SSR/bloom levels are pass toggles and never enter forward program keys. Warm-up covers `current` and `nextLowerTier(current)` keys via C-02 `precompile`.

### 8.4 WGSL emission (Phase 6+, conditional)

- **Chunks are dual-authored.** C-02 `ShaderChunk.wgsl?` is the "PRD 11 twin" field (absence → `WGSL_PROGRAM_MISSING` on the WebGPU backend). For chunks this lane registers, the twin is set inline. For chunks other lanes register, this lane keeps twins in its own files `program/chunks/<name>.wgsl.ts` keyed by chunk name in `program/chunks/manifest.ts` (lane 11 per §4.1: name, inputs, outputs, required uniforms, required textures), and `WgslAssembler` uses `chunk.wgsl ?? manifestTwin(name)`; owners may instead set `wgsl` on their own chunk (lane 06 does for `shaders/deform/`). A unit test asserts every registered GLSL chunk has a twin with identical manifest entries and reports missing twins per owning lane. Automatic GLSL→WGSL transpilation at runtime is rejected: a WASM transpiler (naga) would add roughly a megabyte to the client.
- **Uniforms.** `AuraFrame`, `AuraLights` from `UniformLayout` as `@group(0) @binding(0) var<uniform> frame: AuraFrame;` and `@group(1) @binding(0) var<uniform> lights: AuraLights;`. Per-material scalars as `@group(2) @binding(0) var<uniform> material: AuraMaterial;` (one buffer per material instance, rewritten on change). Per-object `@group(3) @binding(0) var<uniform> object: AuraObject;` with dynamic offset into `UniformRing`.
- **Instancing.** `@group(3) @binding(1) var<storage, read> instances: array<mat4x4f>;` indexed with `@builtin(instance_index)`; instance colour in `array<vec4f>` at binding 2.
- **Shadows.** `texture_depth_2d_array` + `sampler_comparison`, sampled with `textureSampleCompareLevel(shadowMap, shadowSampler, uv, cascade, depthRef)`. No `rgba8` encoded depth.
- **Textures.** Colour textures in `rgba8unorm-srgb` (hardware decode, matching WebGL2 `SRGB8_ALPHA8`); samplers created once per sampler descriptor and cached.
- **Removed from WGSL:** `productPropBodyGate/OrangeGate/Albedo`, `u_productColorSmoothing`, the hard-coded `lightDirection`, the `2.25` direct gain, the hemisphere ambient fake, equirect-mip "IBL", the `instance0..3` struct members, and `nativeUniformStruct` (the 2,052-float monolith).
- **Validation in CI.** `tools/wgsl-validate/` runs `naga` (pinned exact version, installed in the remote job, not on the Mac) over the WGSL emitted for the warm-up key corpus: every key used by the 18 games and 18 benchmark scenes, at all four tiers. The corpus is read from checkpoint C-36 `compiledFeatures` reports, so it grows as other lanes' chunks become real; a missing twin is reported, not a failure, until G-WGPU is a "go".

### 8.5 Post

Lane 03 owns kernels (C-13). This lane's shader-level requirement, enforced by `PostprocessGuard` and the C-28 readback counter: no post pass may be implemented as a CPU kernel in production builds. Every GPU post pass reads near/far from C-08 `AuraFrame` (lane 01 replaces the hard-coded 0.1/1000 at `WebGL2Device.ts:865`, `:4567-4574`; C-13 semantics). The WGSL twin of `executePostGraph` is this lane's (C-13 "PRD 11 adds the WGSL twin") and is part of conditional Phase 7.

---

## 9. Rendering changes

### 9.1 Frame structure (WebGL2, flags `A3D_QR_TIERS` + sub-flags on; owner of each step in brackets)

```
app frame (rAF)
 ├─ game callbacks (cpuFrameMs)                                          [09/15 frame loop; unchanged]
 ├─ Renderer.render  (cpuSubmitMs)                                       [01]
 │   ├─ C-01 collect: prd11.frameStats → FrameStats.begin + GPU timer      [11, lanes/prd11.ts]
 │   ├─ C-01 collect: prd11.batching → BatchPlan (rebuilt on structural change only),
 │   │                BVH refit → visibility bitset, instance matrix/colour updates via C-07 [11, renderer/CullingBatching.ts]
 │   ├─ shadow work (batched casters via C-11 depth variants)             [02]
 │   ├─ forward: draws issued through forward/DrawSubmit.ts (instanced / multi-draw / single) [01 core, 11 submit]
 │   ├─ post: PostprocessGuard plan filter, targets from C-28 pool         [03 wiring, 11 guard + pool]
 │   ├─ OutputPass at renderScale → canvas                                [01, C-05]
 │   └─ C-01 after-output: prd11.frameStats → FrameStats.end + counters delta [11]
 ├─ QualityGovernor.sample(sample)  → app.quality overrides / RenderScaleSource [11, C-38 quality extension]
 └─ diagnostics publish (throttled to 4 Hz; never serialises scene each frame) [15, Q-15-1]
```

With every lane-11 flag off, no contributor is registered as active and the frame is bit-identical to `85aafcd0` (C-01 invariant, IC-0 identity).

### 9.2 Primitive batching without editing the root bridge

- Lane 11 needs no edit to `createProductionPrimitiveResources` (`index.ts:14678-14720`, lane 15 `compiler/primitives.ts`): `batching/ContentKeys.ts` derives `geometryContentKey` and `materialSpecKey` from the `RenderItem` the bridge already produces (§6.6 layer 1).
- `materialSpecKey(material)` = stable key of the material's scalar fields with `baseColor`, `emissive`, `emissiveIntensity` removed (and opacity removed when ≥ 0.999), plus `cullMode`, blend state (C-04 `renderStateKey`) and texture identities. Items with textures still dedupe by full key (identical textured props share one draw).
- Per-node colour is written to `instanceColors` when batched. Emissive differences block merging on the legacy path and use `instanceEmissive` on the generated path.
- Optional optimisation, request Q-15-2: a per-scene `PrimitiveResourceCache` in `compiler/primitives.ts` so identical nodes share `Geometry`/`PBRMaterial` objects (saves memory and key hashing; batching output is identical either way, which S3 checks).
- C-31 section `renderer.batching` reports `{ inputItems, outputDraws, instancedBatches, multiDrawBatches, reasonsNotBatched, planBuildMs, planVersion }`.

### 9.3 Draw-call targets for the worst games (Medium tier, desktop 1080p; integrated, measured at checkpoints)

| Game | Current draws (report) | Target | Mechanism |
|---|---|---|---|
| Gravity Post | 1,230-1,294 | ≤ 150 | content-keyed instancing of ~330 primitives; multi-draw for board pieces (generated path) |
| Courier Rush | ~1,530 title, 436-545 mid | ≤ 250 | city primitives instanced by type; static city multi-draw; traffic as instanced GLB |
| Pulse Tunnel | ~250 | ≤ 80 | tunnel rings instanced |
| Bank Shot | ~193 | ≤ 60 | dedupe + `text3D` digits replaced (lane 14 route edit, Q-14-6) |
| Mech Hangar | ~190 | ≤ 90 | dedupe; DPR from tier instead of forced 1.5 (Q-14-4) |
| Rooftop Buckets | ~200 primitives | ≤ 80 | dedupe + instancing |

Draw counts include shadow-pass draws. Standalone, the same mechanisms are proven on lane scenes `prd11-draw-call-stress` and `prd11-instancing-100k` (§16.0 S3-S5).

### 9.4 Post execution

- The GPU-fused path (device `presentLdrPostprocess`, `Renderer.ts:1086-1095`) is the only production path. A pass it cannot express is a dev error (strict) and a production drop (§6.8). The fused CPU fallback (`:1097-1109`) is reachable only with `execution: "cpu-deterministic"`.
- Post execution (`renderer/PostprocessExecution.ts`, lane 03) acquires every intermediate target from the C-28 pool; the pool is drained by `renderer/DeviceLifecycle.ts` on dispose and on device loss (lane 11).

### 9.5 Context restore

`webgl2/ContextLifecycle.ts` (restored listener, carve-out of `WebGL2Device.ts:433-443`) calls `invalidateGpuObjects()` when lane 01 provides it (Q-01-1), then `resourceRegistrySlot.get().rebuild(device)`, then C-02 `precompile` of the current key set (async with warm-up); `renderer/DeviceLifecycle.ts` emits restored only after all three resolve (C-29). The root bridge skips frames while `isDeviceLost()` and clears to the background colour (Q-15-3).

### 9.6 Per-game impact and route-level perf fixes (route edits are lane 14's by request; measured by this lane)

Every one of the 18 games has a row. "Engine" lists the phases of this PRD that change the game without route edits. "Route fix" is the route-side work: lane 14 owns every `apps/showcase-*` and `apps/aura-clash-showcase/` file (CONTRACTS R21), so each fix is a `qr-request` (Q-14-n, §12.3); this lane owns the measurement. Every target in this table is **integrated** (§16.1): evaluated at checkpoints with the route's flags, never a merge gate for this lane. Target is the §17.2 runner gate at forced Medium, `adaptive=0`; games that already pass must not regress p50 by more than 15%. "Visual check" is the V-row that guards against buying speed with pixels.

| Game | 1080p fps now | Engine | Route fix | Target (runner, 1080p) | Visual check |
|---|---|---|---|---|---|
| Deep Recovery | 0.5 | Phase 2 guard drops the CPU post chain (`volumetric-light` not fusable, `Renderer.ts:2111-2119`) once lane 03 wires it (Q-03-1/Q-03-2) | none: keep `effects.volumetricFog` (`apps/showcase-deep-recovery/src/main.ts:280-285`); it renders as analytic height fog whenever the C-21 GPU volumetric pass is inactive | p50 ≤ 50 ms at the first checkpoint with Q-03-1 merged; ≤ 33 ms with batching on | V7 |
| Gravity Post | 6.4 | Phase 3 dedupe + instancing (~330 primitives) | Stop replacing dock-gate textures per frame (Q-14-9; research/17-g5:108) | ≤ 33 ms; draws ≤ 150 (§9.3) | V6, V8 |
| Courier Rush | 7.1 | Phase 3 batching; Phase 5 restore | Q-14-7: mark static city groups `static: true` (`apps/showcase-courier-rush/src/city.ts:76-161, 287-410, 490-496`); add `onDeviceLost`/`onDeviceRestored` DOM overlay in `main.ts`; move the `?capture=review` city fork behind a dynamic import (research/17-g2 X10) | ≤ 33 ms; draws ≤ 250; context-restore test passes | V6, Phase 5 SSIM |
| Siege Golf | 7.1 (p50 18.2 ms, p95 1,100 ms) | Phase 0 makes the hitch visible | Q-14-2: replace `app.setScene(buildHoleScene(flow.hole, cameraPhase))` in `applyCameraPhase` (`apps/showcase-siege-golf/src/main.ts:975-985`, call at `:978`, also `:1104`) with runtime handle updates (C-37 handles) | p95 ≤ 2 × p50 and p99 ≤ 50 ms | V6 |
| Rooftop Buckets | 7.6 | Phase 3 dedupe + instancing; Phase 4 tier DPR | Q-14-4: remove `pixelRatio` clamp (`apps/showcase-rooftop-buckets/src/main.ts:738`) and `qualityProfile: "production"` (`:743`) | ≤ 33 ms; draws ≤ 80 | V6, V9 |
| Mech Hangar | 9.3 | Phase 3 dedupe (~190 draws); Phase 4 tier DPR | Q-14-4: remove `qualityProfile: "production"` (`apps/showcase-mech-hangar/src/main.ts:705`), which forces DPR 1.5 through the profile (research/20:228) | ≤ 33 ms; draws ≤ 90 | V6 |
| Blockfall Reactor | 9.8 | Phase 3 | Q-14-1: delete `.addMany(createLockedBlockNodes())` (`apps/showcase-blockfall-reactor/src/main.ts:630`; nodes built in `reactor-scene.ts:516`) and the boot render-mode A/B probe (`main.ts:763-826`, `measureDrawCallsOnce` at `:791`, invoked at `:826`); replace the 80 `text3D` scoreboard digit nodes (6 score + 2 level slots × 10 digits, handles at `main.ts:834-846`) with a DOM scoreboard; reduce to one WebGL context per page (capture `window.__QRC__.contexts`) | ≤ 33 ms; 1 context | V6 |
| Gallery Shift | 10.1 | Phases 0-4 | Not profiled. Phase 0 task (lane 11, from a checkpoint capture or a lane-workflow run of the route with `?a3d-qr=tiers`): record `frame` scopes and `renderer.batching.reasonsNotBatched`, file the top three costs in `evidence/prd-11/phase-0/gallery-shift.md` | ≤ 33 ms | V6 |
| Aura Clash | 11.1 | Phases 0-4 | Not profiled ("5x gap", research/20:134). Q-14-4: remove the 1.75 DPR clamp and `qualityProfile: "production"` (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1522-1531`; keep the probe-only branches); Phase 0 profiling as for Gallery Shift (2 skinned rigs, 98.6k-tri textured city block, research/17-g1:19) | ≤ 33 ms; `precompile-hitch` passes | V6 |
| Skyline Runner | 11.4 | Phase 4 tier DPR | Q-14-3: remove `pixelRatio: 0.7` (`apps/showcase-skyline-runner/src/main.ts:1879`) and `qualityProfile: "safe-basic"` (`:1875`); drop the unused 80k Meshy hero and the 118k-tri tea house (research/20:595,612); move evidence serialisation out of the frame loop | ≤ 33 ms; heap ≤ 150 MB at ready (from 308 MB) | V6, V9 |
| Bank Shot | 14.9 | Phase 3 dedupe (~193 draws) | Q-14-6: replace `text3D` digits with a DOM scoreboard | ≤ 33 ms; draws ≤ 60 | V6 |
| Patrol Wing | 15.8 (54.8 at 720p) | Phase 2-4; fill/post-bound, so governor render scale is the main lever | Profile `post` scope cost at 1080p in Phase 0 and record it | ≤ 33 ms forced Medium; with `adaptive` on, governor holds p50 ≤ 33 ms | V8 |
| Turbo Drift | 19.7 | Phase 4 tier shadow size (Medium 2048, 2 cascades, read by lane 02 from C-27, instead of one 4096 map over 500-unit bounds, research/20:520) | Q-14-8: replace capture-only `pixelRatio: 1` + `performanceQuality` (`apps/showcase-turbo-drift-circuit/src/main.ts:2983-2994`) with `quality.lock()` during capture | ≤ 33 ms | V6, V8 |
| Pulse Tunnel | 23.5 | Phase 3 instancing of tunnel rings (~250 draws) | none | ≤ 33 ms; draws ≤ 80 | V6 |
| Neon Swarm | 25.8 | Phase 3 | Q-14-5 (asset from Q-05-1): replace the four 272,036-tri `neonStreetLampProp` instances (`apps/showcase-neon-swarm/src/main.ts:608-627`, model call `:612`) with a lamp asset ≤ 5k tris (C-17 admission budget) | ≤ 33 ms; triangles submitted ≤ 1M (Medium) | V6 |
| Aurora Lander | 52.2 | Phase 3 dedupe (~150 primitive nodes) | none | ≤ 20 ms (already near; no regression > 15%) | V6 |
| Vault Breakers | 57.4 | Phase 4 tier DPR | Q-14-4: remove `qualityProfile: "production"` (`apps/showcase-vault-breakers/src/main.ts:392`) | no regression > 15% vs 16.7 ms p50 (p95 18.5) | V6 |
| Orbital Defense | 59.6 | none expected | none | no regression > 15% vs 16.7 ms p50 (p95 19.1) | V6 |
| All 18 | | Phase 0 throttle (Q-15-1) | `diagnostics()` reads at ≤ 4 Hz; no `structuredClone` of renderer diagnostics per frame (`readRootDiagnosticSnapshot`, `RootRuntimeSupport.ts:58`, called at `index.ts:11678`) inside rAF | | |

---

## 10. Migration plan

Every step merges to main behind its flag (CONTRACTS §6.1) with the flag-off sentinel identity check green; the order below is this lane's internal sequencing, not a dependency on any other lane.

1. **Telemetry first (Phase 0, day 0).** Land FrameStats (C-28 real), counters, probe, the `frame`/`quality`/`renderer.batching` C-31 sections and the lane perf workflow before any optimisation, so every later change has a measured before/after on the same runner. File Q-15-1 (fps literal) and Q-12-1 (harness recording) the same day; neither blocks the lane's measurements, which come from `diagnostics().frame` in lane specs.
2. **Freeze WebGPU (Phase 1, day 0).** Deletions in lane-11 paths in one PR series, docs updated in the same PR; claim removals in files of other lanes go out as requests (Q-13-1, Q-13-2, Q-15-5, Q-15-6) with the exact text. Flag-off pixels are unaffected (no game uses WebGPU); the PR declares it a removal under CONTRACTS §6.1.
3. **Remove CPU readback (Phase 2).** Guard, pool and counters land in lane-11 files behind `A3D_QR_TIERS`; wiring is Q-03-1/Q-03-2/Q-02-1. Deep Recovery is the integrated acceptance case.
4. **Batching (Phase 3).** Behind `A3D_QR_TIERS_BATCHING` (`batching: "on"` once the flag is `integrated-accepted`; per-app `"off"` for one release as rollback). Apps get batching without source changes. Apps that mutate non-colour material fields per node at runtime (rg for `setMaterial(` / `material.roughness =` in `apps/`) are listed by `scripts/migrations/prd11-batch-optout.mjs`, exposed as C-39 codemod `prd11-batch-optout` (report mode), and lane 14 applies `batch: false` per route (Q-14-11, CONTRACTS R21).
5. **Tiers + governor (Phase 4).** `qualityProfile` / `performanceQuality` mapped with warnings in lane-11 files. Route-side removal of fixed-DPR sources is lane 14's (Q-14-3, Q-14-4, Q-14-8), applied whenever lane 14 chooses after `A3D_QR_TIERS` reaches `standalone-accepted`: explicit `pixelRatio` in Skyline Runner (0.7, `main.ts:1879`), Rooftop Buckets (≤ 1.75, `main.ts:738`), Aura Clash (≤ 1.75, `AuraClashArenaApp.ts:1522-1530`), Turbo Drift capture (1, `main.ts:2988`); `qualityProfile: "production"` (fixed DPR 1.5 via the profile) in Mech Hangar (`main.ts:705`), Vault Breakers (`main.ts:392`), Rooftop Buckets (`main.ts:743`), Aura Clash (`AuraClashArenaApp.ts:1531`). `createPerformanceGovernor` users (`animation-studio`, `character-controller` templates, lane 13) need no change: they delegate when given a controller (§6.5).
6. **Context restore (Phase 5).** Lane-11 lifecycle files; Q-01-1 and Q-15-3 improve but do not gate it.
7. **WebGPU replacement (Phases 6-8)**, conditional on the G-WGPU checkpoint decision (§6.2).

---

## 11. Backward compatibility

- With `A3D_QR_TIERS`, `A3D_QR_TIERS_*` and `A3D_QR_WEBGPU` off, rendered pixels are identical to `85aafcd0` (IC-0 tolerance) on the 6 sentinel scenes, the 18 base scenes and the 18 games. Declared exceptions: Phase 1 WebGPU deletions (no game uses WebGPU) and the measured-fps correctness fix (diagnostics only, Q-15-1).
- `diagnostics().fps` changes from a constant 60 to measured; its type stays `number`. Any test asserting engine output `fps === 60` is wrong and is fixed, not preserved. `rg -n "fps.*60" tests/ apps/*/route-health.json tools/` lists the call sites to review; known fixtures are listed in §2.6 and go to their owners as Q-15-7.
- `tests/unit/agent-api-root-performance-quality.test.ts` and `tests/unit/muse3jsparity-root-governor-contract.test.ts` keep passing unchanged through the deprecation release (they exercise the alias path), then are rewritten against `app.quality` when the aliases are removed.
- `qualityProfile` and `performanceQuality` keep working for one release with a one-time console warning naming PRD 11.
- `backend` option did not exist on `createAuraApp` (pre-declared optional by C-38); no break. `ProductionRuntimeRenderer.create({ backend: "webgpu" })` remains for internal probes and still refuses silent fallback (`ProductionRuntimeRenderer.ts:73-78`).
- Batching changes draw order only within a sort bucket; transparent items are never instanced or multi-draw batched in this PRD (they need back-to-front order and stay passthrough, `reasonsNotBatched.transparent`). For reference, three.js r185 `InstancedMesh` never sorts its instances, while `BatchedMesh` sorts per object when `sortObjects` is true (default); Aura's passthrough rule is the conservative choice and per-instance transparent sorting is out of scope.
- Rendering output of batched vs unbatched draws must be pixel-identical on the benchmark (S3, §16.0).
- Removed WebGPU route (`apps/wow-webgpu-instancing`): its deployed URL redirects to `/apps/webgpu-lab/` for one release; the route-health catalogue entry is updated by its owner on request Q-15-6.
- `sceneKitPerformanceBudgets` field renames: old names kept as deprecated getters for one release.

---

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table is replaced by contracts. This lane builds against each consumed contract's PR 0a stub and never waits for the provider's real implementation. What a stub can and cannot show decides whether a criterion is standalone (§16.0) or integrated (§16.1). Items of the old table that were not dependencies (who reads which tier row) moved to the §6.3 "Read by" column.

### 12.1 Contracts provided

| ID | Name | Surface this lane provides | Stub that must keep working (PR 0a/0b, CONTRACTS) | Real (lane 11) | Consumers |
|---|---|---|---|---|---|
| C-27 | QualityTier settings | `QUALITY_TIERS` (frozen data), `resolveTierSettings`, `nextLowerTier`, `AuraTierDecision`, `AuraQualityController` (`app.quality` via C-38), `?aura3d-quality=`/`?aura3d-adaptive=0` | `QUALITY_TIERS` real; `"auto"` → `"high"` desktop / `"medium"` on `(pointer: coarse)` with `source: "default"`; `set` updates settings and emits `onChange`; `forceRenderScale` through `createAuraApp` canvas sizing (`index.ts:11126-11140`) | `quality/{DeviceProbe,DeviceClasses,TierResolver,RenderScaleController,QualityGovernor}.ts`, calibration, `localStorage["aura3d.quality.v1"]` cache, URL parsing in `app/rendererOptions.ts`; `slot.provide` in `packages/rendering/src/lanes/prd11.ts` and `registerAppExtension({ member: "quality", flag: "A3D_QR_TIERS" })` in `packages/engine/src/lanes/prd11.ts` | 01, 02, 03, 04, 05, 06, 07, 10, 12, 13, 14 |
| C-28 | Device capabilities | `DeviceProbe`, `DeviceCounters`, `RenderDevice.{probe,counters,resetFrameCounters,compileAsync,multiDrawElementsInstanced}`, `frameStatsSlot`, `renderTargetPoolSlot`, `RenderDeviceDiagnostics.{programCompileCount,readPixelsCalls}` | probe from `WEBGL_debug_renderer_info` else nulls; partial counters (`drawCalls`, `bufferCreates`, `textureBytes` from existing diagnostics; `readbacks`/`programCompiles` by wrapping in `webgl2/Counters.ts`); `compileAsync` resolves after a synchronous compile; FrameStats real with `gpuMs: null`; pool stub creates on acquire, disposes on release | `webgl2/{Probe,Counters,MultiDraw}.ts` full counters incl. live buffers/VAOs and bytes; `KHR_parallel_shader_compile` `compileAsync`; `quality/FrameStats.ts` with `EXT_disjoint_timer_query_webgl2` GPU scopes (`RendererTiming.ts:164`); `resources/RenderTargetPool.ts` pooling + `trim` | 01, 02, 03, 06, 07, 12 |
| C-29 | Renderer factory, backends, frame API, device lifecycle | `RendererCreateOptions`, `Renderer.create/renderFrame/renderFrameAsync/backend`, `RendererLifecycle`, `resourceRegistrySlot` | `create` keeps `Renderer.create` (`Renderer.ts:472`) and today's selection; `renderFrame` wraps `render()` (`:541`) and returns FrameStats timing; lifecycle attaches to `WebGL2Device.ts:418-445`; registry stub records and replays `rebuild` in order | `renderer/{RendererFactory,DeviceLifecycle}.ts`, `webgl2/ContextLifecycle.ts`, `resources/ResourceRegistry.ts`; WebGPU device, pipeline cache and WGSL assembly (conditional Phase 6+, `A3D_QR_WEBGPU`) | 01, 07, 12, 15 |

Registry entries this lane provides into other lanes' contracts: C-01 contributors `prd11.frameStats` and `prd11.batching` (phases `collect`, `after-output`); C-02 chunks `a3d_prd11_draw_id`, `a3d_prd11_instance_emissive`, features `prd11.drawId` (frozen `ProgramFeatures.drawId`) and instancing emissive (frozen `ProgramFeatures.instancing.emissive`), plus WGSL twins (`ShaderChunk.wgsl`, `program/chunks/*.wgsl.ts`); C-11 depth variant `prd11.drawId`; C-14 `RenderItem.instanceEmissive` values; C-30 scenes `prd11-draw-call-stress`, `prd11-instancing-100k`, `prd11-tier-ladder`; C-31 sections `frame`, `quality`, `renderer.batching`; C-36 `diagnosticOnly.prd11.ts` entries for every C-27/C-38 option until wired, and option-coverage rows for `quality`, `batching`, `adaptive`, `targetFrameRate`; C-38 member `quality` and flattened `precompile`; C-39 codemod `prd11-batch-optout` and command `perf gate` (`packages/aura3d-cli/src/commands/prd11/`); C-40 facts `F-11-01` (tier table, already `proposed` in CONTRACTS Appendix B), `F-11-02` (WebGPU status line), `F-11-03` (measured `frame` diagnostics), `F-11-04` (batching rules and `batch: false`), `F-11-05` (governor behaviour and `quality.lock()` for capture).

Conformance suites that must pass for both `stub` and `real` (custodian-owned): `tests/unit/contracts/C-27-quality.test.ts` (every field present for every tier; override validation; `nextLowerTier` chain), `tests/unit/contracts/C-28-device.test.ts` (FrameStats percentiles; counter reset semantics on MockRenderDevice), `tests/browser/contracts/C-28-counters.spec.ts` (static scene: 0 readbacks and 0 bufferCreates after warm-up), `tests/unit/contracts/C-29-renderer-factory.test.ts`, `tests/browser/contracts/C-29-context-loss.spec.ts` (`WEBGL_lose_context` round-trip restores pixels). This lane adds `tests/unit/contracts/impl/prd11-{quality,device,renderer-factory}.test.ts` for its real implementations.

Contract Change Requests this lane opens (all additive, CONTRACTS §6.4; none is needed to start, each has a fallback):

| CCR | Contract | Change | Fallback until merged |
|---|---|---|---|
| CCR-11-1 | C-27 | `renderScaleSourceSlot: ContractSlot<(o) => RenderScaleSource>` so lane 01's `ResolutionGovernor` can be provided without consumer changes | lane-11 `RenderScaleController` is used directly |
| CCR-11-2 | C-27 | optional `confidence?`, `reasons?`, `renderer?`, `tableVersion?` on `AuraTierDecision`; optional `fromSettings?`, `toSettings?`, `renderScale?`, `kind?`, `frameMsP50?` on the `onChange` event | richer data published only in the C-31 `quality` section |
| CCR-11-3 | C-07 / `contracts/renderItem.ts` | optional `RenderItem.batch?: boolean`, `RenderItem.static?: boolean` | planner infers static from unchanged matrices; `batch: false` not honoured |
| CCR-11-4 | C-28 | optional `instances?`, `triangles?`, `programsBound?` on `DeviceCounters` | computed by `prd11.batching` from the plan and reported in `renderer.batching` |
| CCR-11-5 | C-02 | optional `ShaderChunk.requiresExtensions?: readonly string[]` (hoisted after `#version`) | `drawId: "uniform"` loop variant only |

### 12.2 Contracts consumed

| ID | Name | Provider (lane) | What this lane uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 01 | `registerFrameContributor` for `prd11.frameStats` (`collect`, `after-output`) and `prd11.batching` (`collect`) | PR 0b-2 seam: `collect` runs right after `collectRenderItemsWithDiagnostics` (`Renderer.ts:555`); `after-output` after `executePostprocess`, before `endFrame`; contributors gated by their flag | standalone (frame timing, batching plans run on today's renderer) |
| C-02 | ProgramFeatures, chunk registry, ProgramCache | 01 | `registerShaderChunk`/`registerShaderFeature`; frozen `drawId` and `instancing.emissive` fields; `ProgramCacheLike.precompile`; `ChunkHarness`; `ShaderChunk.wgsl` | registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` and ignores features; ChunkHarness real | chunk compile and warm-up timing standalone; multi-draw and per-instance emissive pixels integrated |
| C-04 | BlendMode, RenderCommandState | 01 | `renderStateKey` in batch keys | `renderStateKey` real for today's single alpha blend | standalone |
| C-05 | Output, capture | 01 | `app.capture()` in-flight state (governor lock), DPR application of `maxPixelRatio` | existing capture path; canvas sizing as today | governor lock standalone via `quality.lock()`; sharper backing store (V9) integrated |
| C-07 | Primitive tessellation, InstanceBuffer; `AuraPrimitiveNode.batch/static` | 01 | `instanceBufferSlot` for instanced batches; tessellation metadata for content keys; node fields | stub wraps the per-frame instance upload (`ForwardPass.ts:1711-1803`), `version` increments; tessellation inert; node fields declared | draw reduction and pixel identity standalone (64-chunked); VAO-flat over 10,000 frames integrated (needs C-07 real) |
| C-08 | Frame uniforms | 01 | `AuraFrame`/`AuraLights` member lists for `UniformLayout` and WGSL | types declared | conditional Phase 6 only |
| C-11 | ShadowCaster depth-variant hook | 02 | `registerDepthVariantFeature("prd11.drawId")` | features stored, applied once `DepthPass` consumes them | instanced casters standalone (existing path); multi-draw casters integrated |
| C-13 | PostPass registry | 03 | `gpuOnly` pass list for the guard's allow-set | registry stores entries; legacy chain runs with `A3D_QR_POST` off | guard unit-tested standalone; Deep Recovery frame time integrated (needs Q-03-1) |
| C-20 / C-21 | Particles, sky/fog/atmosphere | 07 | `particles` FrameStats scope; volumetric-pass-active signal for the fog rule | stubs report no GPU volumetric pass | integrated |
| C-30 | Benchmark scene registry, ReadyPayloadV2 | 12 | lane scenes in `scenes/prd11/`, `ReadyPayloadV2.frameTiming`, `qrFlags` | registry wraps 18 base scenes + lane indices | standalone (own scenes) |
| C-31 | Diagnostics sections | 12 | `registerDiagnosticsSection` for `frame`, `quality`, `renderer.batching` | keys present with null values | standalone |
| C-32 / C-33 | Rubric, capture harness | 12 | judgement schema; `--flags` passthrough; step plugins | today's capture scripts + plugin loading + `a3d-qr=` passthrough | screening standalone; acceptance only at G-PANEL |
| C-35 | Art direction, `GameBudgets.drawCalls` per tier | 14 | per-route draw budgets read by `tools/perf-gate/` | types only | integrated |
| C-36 | SceneCompiler extension points | 15 | `SceneCompileContext.quality/strict/flags`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage`, `compiledFeatures` | wraps the moved legacy compiler; context filled from C-27 stub | standalone |
| C-37 | RuntimeNode registry | 15 | `version` (structural change trigger for batch plans) | `version` real | standalone |
| C-38 | App surface registry | 15 | `quality` member, `precompile`, pre-declared renderer options | real in PR 0 | standalone |
| C-39 | CLI/codemod registry | 15 | `registerCodemod("prd11-batch-optout")` | real in PR 0 | standalone |
| C-40 | Facts handoff | each lane → 13 | rows `F-11-01..05` | n/a | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R1 (this lane owns `AuraQualityTier` and the table), R9 (anisotropy L4/M8/H16/U16), R10 (Ultra froxel 240x135x128), R11 (Ultra particles 100k, 200k with WebGPU compute), R19 (this lane owns `RendererFactory`/`DeviceLifecycle`), R20 (templates and skills written by lane 13 from C-40 facts), R21 (routes written by lane 14), R22 (`games.json` data by lane 14).

### 12.3 Requests to other lanes (non-blocking)

Filed on day 0 as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). This lane never waits: each row names what this lane does meanwhile, and any criterion that needs the change is evaluated at the next checkpoint after it lands. Line numbers are pre-PR 0b.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | `WebGL2Device.ts`: add `invalidateGpuObjects()` that clears the buffer/VAO (`:4225-4236`)/program/texture maps so they recreate lazily after `webglcontextrestored`; expose `liveVertexArrays` to `webgl2/Counters.ts`; delete the `this.buffers.add` leak (`:498`) on dispose | C-28, C-29 | registry rebuilds registered resources eagerly; `liveVertexArrays` reported `null` |
| Q-01-2 | 01 | `Renderer.ts`: wrap shadow (`:622`) and forward (`:664`) work in `frameStatsSlot.get().scope("shadow" \| "forward", …)` | C-28 | whole-frame GPU time from the `prd11.frameStats` contributor; `scopes` empty |
| Q-01-3 | 01 | Optional, conditional Phase 6: `ProgramGenerator.generate(features)` with `target: "wgsl"` delegates to `webgpu/WgslAssembler.ts` | C-02 | lane 11 calls `assembleWgsl` directly |
| Q-01-4 | 01 | `ForwardPass.ts:1711-1803`: when C-07 real is provided, stop 64-instance chunking (`MAX_GPU_INSTANCES`, `:121`) for items carrying an `InstanceBufferLike`; generator honours `instancing.emissive` from `RenderItem.instanceEmissive` | C-07, C-02 | planner chunks at 64; emissive-varying items not merged |
| Q-02-1 | 02 | `renderer/ShadowOrchestration.ts` (ex-`Renderer.ts:1516-1603`, `:1915-1931`): replace point-shadow face `readShadowFacePixels` with a GPU path, or, with `A3D_QR_TIERS` on and no GPU path, disable point shadows with diagnostic `POINT_SHADOW_PENDING` | C-11, C-28 | counter reports the readbacks; games without point shadows unaffected |
| Q-02-2 | 02 | Optional: use `performance/BVH.ts` `queryFrustum` for the light-frustum caster query | C-11 | none needed |
| Q-02-3 | 02 | `DepthPass.ts`: compose registered depth variant features (C-11 real), including `prd11.drawId` | C-11 | multi-draw casters excluded from layer 3 (`reasonsNotBatched["caster-variant-pending"]`) |
| Q-03-1 | 03 | `renderer/PostprocessExecution.ts` (ex-`Renderer.ts:977-1330`): at the top of `executePostprocess`/`executePostprocessAsync`, call `guardPostprocessPlan` (mode from C-36 `strict`); replace `this.device.createRenderTarget` at `:1004`, `:1034`, `:1140`, `:1169` with `renderTargetPoolSlot.get(device).acquire/release`; wrap in `frameStatsSlot.get().scope("post", …)`; all behind `A3D_QR_TIERS` | C-28, C-13 | guard proven as a pure function; lane spec records Deep Recovery readbacks > 0 as a failing control |
| Q-03-2 | 03 | `compiler/postprocess.ts` (ex-`index.ts:12797-12941`): do not build `volumetricPass` (`:12810`) / spread `volumetricLight` (`:12938`) when the C-21 GPU volumetric pass is inactive; do not emit `contactShadow`, `filmGrain`, `chromaticAberration` without a registered GPU pass; diagnostic `EFFECT_PENDING_GPU_PASS:<name>` | C-13, C-21 | guard drops them once Q-03-1 lands |
| Q-04-1 | 04 | `apps/wow-webgpu-product-viewer/src/main.ts:51-66, :59`: remove material clamps and `u_productColorSmoothing` use; re-capture, or delete the route if the Duck renders wrong | C-29 | lane 11 removes the uniform from `WebGPUDevice.ts`; the route's unknown uniform is ignored |
| Q-05-1 | 05 | Admit a street-lamp asset ≤ 5k tris (C-17 admission) to replace `neonStreetLampProp` (272,036 tris, 15.99 MB) | C-17 | none; Neon Swarm triangle target is integrated |
| Q-07-1 | 07 | `nodes/particles.ts` (ex-`index.ts:8344-8358`): remove `gpuReady`; rename `estimatedUpdateCostMs` → `heuristicUpdateCostMs`; add `measuredUpdateMs` from `frameStatsSlot` scope `particles` | C-28, C-20 | fabricated field reported as such in the `frame` section notes |
| Q-07-2 | 07 | Wrap particle update/draw in `scope("particles")`; remove `createRootGpuParticleWorkload` from the production entry; conditional Phase 8: move `effects/ResidentGPUParticleRenderer.ts` into the scene pass on the new WebGPU device | C-20, C-29 | `particles` scope absent |
| Q-09-1 | 09 | `GameAppRuntime.ts:126-129`: pass `app.quality` into `createPerformanceGovernor({ …, quality })` when `adaptive` is on | C-27 | two governors may both act on `performanceBudget` apps (none shipped) |
| Q-12-1 | 12 | `capture-games.mjs` `pageSnapshot` (`:371-380`): store `app.diagnostics().frame` per live app as `runs[].engineFrame` and `fpsAgreement = (1000 / engineFrame.intervalMs.p50) / harnessFps`; extend `pageStartFps` (`:413`) to `max(fpsSampleMs, 30 frames)` capped at 60 s; benchmark `capture.mjs --perf` (3 s warm-up, 5 s measured) writing `ReadyPayloadV2.frameTiming` | C-30, C-33 | lane specs `tests/qr/prd11/browser/fps-agreement.spec.ts` measure agreement on lane scenes |
| Q-12-2 | 12 | Harness calls `app.quality.lock()` before every shot; checkpoint step 5 records per-tier perf by capturing with `?aura3d-quality=<tier>&aura3d-adaptive=0` | C-33, C-27 | lane workflow does this for lane scenes |
| Q-12-3 | 12 | `quality-rebuild-capture.yml`: optional input `perf_gate` that runs `node tools/perf-gate/index.mjs` on the report; add a `windows-latest` 2-game smoke job (SwiftShader/WARP tier `"low"` check) | C-33 | `qr-prd11-perf.yml` runs both on lane scenes |
| Q-13-1 | 13 | Move `templates/production-webgpu-starter` to `templates/_archived/`; drop it from `tools/agent-templates/index.ts` | C-40 | lane-11 readiness tools stop listing it |
| Q-13-2 | 13 | Rewrite `aura3d-performance`, `aura3d-core`, `aura3d-threejs-migration` skill text from facts F-11-01..05; remove WebGPU readiness claims | C-40 | facts published `proposed` → `verified` |
| Q-14-1 | 14 | Blockfall Reactor: delete `.addMany(createLockedBlockNodes())` (`main.ts:630`, nodes `reactor-scene.ts:516`) and dependent `lockedNodeId` lookups; delete the render-mode A/B probe (`main.ts:763-826`, `measureDrawCallsOnce` `:791`, call `:826`); replace the 80 `text3D` digit nodes (`main.ts:834-846`) with a DOM scoreboard; one WebGL context per page | C-24 | measured as-is at checkpoints |
| Q-14-2 | 14 | Siege Golf: replace `app.setScene(buildHoleScene(...))` (`main.ts:978`, `:1104`) with C-37 handle updates | C-37 | hitch reported by `frame` p95/p99 |
| Q-14-3 | 14 | Skyline Runner: remove `pixelRatio: 0.7` (`main.ts:1879`) and `qualityProfile: "safe-basic"` (`:1875`); drop the unused 80k Meshy hero and 118k-tri tea house; move evidence serialisation out of the frame loop | C-27 | — |
| Q-14-4 | 14 | Remove `qualityProfile: "production"` from Mech Hangar `main.ts:705`, Vault Breakers `main.ts:392`, Rooftop Buckets `main.ts:743`, Aura Clash `AuraClashArenaApp.ts:1531`; remove the non-probe DPR clamps (Rooftop `main.ts:738`, Aura Clash `:1522-1530`) | C-27 | deprecated profile maps to `"auto"` with a warning |
| Q-14-5 | 14 | Neon Swarm `main.ts:608-627`: use the Q-05-1 lamp; keep per-lamp point lights | C-17 | — |
| Q-14-6 | 14 | Bank Shot: replace `text3D` digits with DOM | C-24 | — |
| Q-14-7 | 14 | Courier Rush: `static: true` on city groups (`city.ts:76-161, 287-410, 490-496`); `onDeviceLost`/`onDeviceRestored` overlay in `main.ts` (`role="status"`, `aria-live="polite"`); `?capture=review` fork behind a dynamic import | C-29, C-07 | planner infers static; restore tested on the lane fixture |
| Q-14-8 | 14 | Turbo Drift `main.ts:2983-2994`: replace capture-only `pixelRatio: 1` + `performanceQuality` with `app.quality.lock()` | C-27 | alias path keeps it working |
| Q-14-9 | 14 | Gravity Post: stop replacing dock-gate textures per frame (research/17-g5:108) | C-15 | — |
| Q-14-10 | 14 | `games.json`: add `qrFlags: ["tiers"]` variants and a scenario with `query: { "aura3d-quality": "medium", "aura3d-adaptive": "0" }` per game | C-33 | lane workflow appends the params itself |
| Q-14-11 | 14 | Review `aura3d codemod prd11-batch-optout` report; add `batch: false` where it lists runtime non-colour material mutation | C-39 | items stay batched; S3 pixel identity guards correctness |
| Q-14-12 | 14 | Rename `apps/showcase-webgpu-particle-lab` → `apps/showcase-particle-lab` (or retitle) | — | — |
| Q-15-1 | 15 | `index.ts:12338`: replace `diagnosticsState.fps \|\| 60` with `frameStatsSlot` `legacyFps()`; use the same at `:11336`; throttle `readRootDiagnosticSnapshot` at `:11678` to ≤ 4 Hz; overlay `:18654` shows `frame` p50/p95, GPU ms or `n/a`, tier, render scale. Declared correctness fix (CONTRACTS §6.1) | C-28, C-31 | `diagnostics().frame` is measured and used by every lane-11 gate |
| Q-15-2 | 15 | `compiler/primitives.ts`: per-scene `PrimitiveResourceCache`; copy `node.batch`/`node.static` onto `RenderItem` (CCR-11-3); R18 `createProductionInstanceTransforms` size fix (`:14747`) | C-07 | content keys in the renderer; static inferred |
| Q-15-3 | 15 | Root bridge: pause rendering while `isDeviceLost()`, clear to background; root mount (`index.ts:13586-13597`) creates through C-29 `Renderer.create({ backend })` with the parsed option | C-29 | lifecycle events still emitted; WebGPU never selected by default |
| Q-15-4 | 15 | `RootRuntimeSupport.ts:66`: re-export `AuraPerformanceQuality` and the alias mapping from `agent-api/RootPerformanceQuality.ts` | C-27 | alias lives beside the old type |
| Q-15-5 | 15 | `packages/rendering/src/index.ts:1163-1168` and `packages/materials` barrel: drop deleted façades and `NodeMaterial`; `Batcher` becomes a deprecated re-export | — | façades kept as one-line deprecated re-exports |
| Q-15-6 | 15 | Package READMEs, `BUNDLE_SIZES.md` WebGPU line and this lane's bundle numbers; route-health catalogue and redirect for `wow-webgpu-instancing`; `packages/editor` serializer drops the node-material type with a load-time warning; root script `check:bundle-size:split` (root-manifest batch) | C-40, §4.4 | lane runs `tools/bundle-size` via its own package script |
| Q-15-7 | 15 (forwards to the creator-rule owner where a test's first `packages/**` import is another lane's) | Tests not owned by lane 11: `tests/browser/context-loss-recovery.spec.ts` expects rebuilt pixels, not only the flag; `tests/unit/agent-api/devtools.test.ts:8,16`, `tests/unit/apps/aura-clash-arena-proof.test.ts:174` stop asserting engine `fps === 60`; WebGPU specs testing removed behaviour are deleted or moved to `webgpu-smoke` | — | lane-11 equivalents live in `tests/qr/prd11/` |

---

## Parallel execution

### Day-0 start conditions

This lane starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts: `packages/rendering/src/contracts/{core,frameGraph,program,blend,geometry,frameUniforms,shadows,post,quality,device,rendererFactory,renderItem,renderSource,index}.ts` and `testing/ChunkHarness.ts`; `packages/engine/src/contracts/{flags,diagnostics,compiler,runtimeNodes,app,index}.ts` and `stubs/*`; the C-27/C-28/C-07/C-38 pre-declared optional members (`RenderDevice` optional members, `RenderItem.instanceEmissive`, `AuraPrimitiveNode.batch/static`, renderer options `quality/backend/adaptive/targetFrameRate/batching`, `AuraApp.quality`, `precompile`); the lane barrels `packages/{rendering,engine}/src/lanes/prd11.ts`, `agent-api/compiler/diagnosticOnly.prd11.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/index.ts`, `packages/aura3d-cli/src/commands/prd11/index.ts`; the conformance harness. Nothing from any other lane's real implementation is needed.

Work in files this lane owns outright starts on day 0: `packages/rendering/src/{quality,batching}/` (new), `webgpu/` (except `WebGPUPostShaders.ts`), `WebGPUDevice.ts`, `RenderDevice.ts`, `RenderBackend.ts`, `RendererTiming.ts`, `MockRenderDevice.ts`, `resources/{ResourceRegistry,RenderTargetPool}.ts`, `program/UniformLayout.ts`, `program/chunks/manifest.ts`, `program/chunks/*.wgsl.ts`, `performance/{BVH,Batcher,FrustumCuller}.ts`, `production-runtime/{backends,shaders/wgsl}/`, `ProductionWebGPURenderer.ts`; `packages/materials/src/NodeMaterial.ts`; engine `GameRenderPreset.ts`, `RootPerformanceQuality.ts`; `apps/{webgpu-lab,wow-webgpu-instancing}/`; the five owned tools; `docs/rendering/webgpu-*`; lane scenes, specs and workflow. Edits to carved regions start when the PR 0b part containing them merges (≤ 2026-10-07); until then the replacement is written in the new lane module and wired after the merge:
- PR 0b-1: `agent-api/app/rendererOptions.ts`, `agent-api/devtools/sceneKitBudgets.ts`, C-31/C-36/C-38 seams.
- PR 0b-2: `renderer/{CullingBatching,RendererFactory,DeviceLifecycle}.ts`, `forward/DrawSubmit.ts`, `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`, C-01 and C-28/C-29 seams.
- PR 0b-3: C-39 fallthrough, C-33 step-plugin loading.

### Owned files and directories (must match CONTRACTS §4.1)

`packages/rendering/src/{quality,batching,webgpu}/` (except `WebGPUPostShaders.ts`), `renderer/{CullingBatching,RendererFactory,DeviceLifecycle}.ts`, `forward/DrawSubmit.ts`, `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`, `program/UniformLayout.ts`, `program/chunks/*.wgsl.ts`, `program/chunks/manifest.ts`, `resources/{ResourceRegistry,RenderTargetPool}.ts`, `performance/{BVH,Batcher,FrustumCuller}.ts`, `production-runtime/backends/`, `production-runtime/shaders/wgsl/`, `production-runtime/ProductionWebGPURenderer.ts`, `RenderDevice.ts`, `WebGPUDevice.ts`, `RenderBackend.ts`, `RendererTiming.ts`, `MockRenderDevice.ts`; `packages/materials/src/NodeMaterial.ts`; `packages/engine/src/production-runtime/GameRenderPreset.ts`, `agent-api/RootPerformanceQuality.ts`, `agent-api/app/rendererOptions.ts`, `agent-api/devtools/sceneKitBudgets.ts`; `apps/{webgpu-lab,wow-webgpu-instancing}/`; `tools/{perf-gate,wgsl-validate,bundle-size,production-runtime-template-readiness,production-runtime-package-surface-readiness}/` (except `bundle-size/lit-scene.ts`); `scripts/migrations/prd11-*`; `docs/rendering/webgpu-*`. Explicit test assignments: `tests/unit/agent-api-root-performance-quality.test.ts`, `tests/unit/muse3jsparity-root-governor-contract.test.ts`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd11,prd-11}/`, `packages/*/src/lanes/prd11.ts`, `agent-api/compiler/diagnosticOnly.prd11.ts`, `packages/aura3d-cli/src/commands/prd11/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/`, `.github/workflows/qr-prd11-*.yml`, `tests/qr/prd11/`, `tests/unit/contracts/impl/prd11-*`. New test files elsewhere under `tests/` (e.g. `tests/browser/perf/*.spec.ts`) belong to this lane by the creator rule.

Not owned, although the earlier draft edited them: `Renderer.ts`, `ForwardPass.ts`, `WebGL2Device.ts`, `WebGL2StateCache.ts`, `ResolutionGovernor.ts`, `program/ProgramGenerator.ts` (01); `renderer/ShadowOrchestration.ts`, `DepthPass.ts` (02); `renderer/PostprocessExecution.ts`, `compiler/postprocess.ts`, `webgpu/WebGPUPostShaders.ts` (03); `apps/wow-webgpu-product-viewer/` (04); `effects/ResidentGPUParticleRenderer.ts`, `RootGpuParticleWorkload.ts`, `nodes/particles.ts` (07); `GameAppRuntime.ts` (09); `tools/quality-rebuild-capture/` (except `games.json`), `benchmarks/quality-rebuild/` (except lane dirs), `.github/workflows/quality-rebuild-capture.yml` (12); templates, skills, `tools/agent-templates/` (13); `apps/showcase-*`, `apps/aura-clash-showcase/`, `games.json` (14); `agent-api/index.ts`, `RootRuntimeSupport.ts`, `compiler/{primitives,renderer,renderInput}.ts`, `app/createAuraApp.ts`, `packages/rendering/src/index.ts`, `performance/` default (`Octree`, `LOD`, `ResourceBudget`, `RendererStats`), `packages/editor/`, `BUNDLE_SIZES.md` (15). Each earlier task on them was converted to an extension point (below) or to a §12.3 request.

### Extension points used in files owned by others

| Host file (owner) | Extension point | Lane-11 registrant |
|---|---|---|
| `Renderer.ts` frame (01) | C-01 `registerFrameContributor({ id: "prd11.frameStats", owner: "prd11", flag: "A3D_QR_TIERS", phases: ["collect", "after-output"] })` and `{ id: "prd11.batching", flag: "A3D_QR_TIERS_BATCHING", phases: ["collect"] }` (note: the batching plan itself runs inside the carved `renderer/CullingBatching.ts`; the contributor carries the per-frame visibility and matrix updates for items added by other contributors) | `packages/rendering/src/lanes/prd11.ts` |
| generated programs (01) | C-02 `registerShaderChunk` (`a3d_prd11_draw_id`, `a3d_prd11_instance_emissive`), `registerShaderFeature("prd11.drawId")`, `ShaderChunk.wgsl` twins | `batching/shaders/*.glsl.ts`, `program/chunks/*.wgsl.ts` |
| `DepthPass.ts` (02) | C-11 `registerDepthVariantFeature("prd11.drawId")` | `batching/shaders/drawId.glsl.ts` |
| post execution (03) | C-28 `renderTargetPoolSlot.provide`, `frameStatsSlot.provide`; `guardPostprocessPlan` export | `resources/RenderTargetPool.ts`, `quality/FrameStats.ts`, `quality/PostprocessGuard.ts` |
| `app/createAuraApp.ts` (15) | C-38 `registerAppExtension({ member: "quality" })`, flattened `precompile` | `packages/engine/src/lanes/prd11.ts` |
| `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection` keys `frame`, `quality`, `renderer.batching` | same |
| compiler (15) | C-36 `SceneCompileContext.quality` (filled from C-27), `DIAGNOSTIC_ONLY_FIELDS` via `diagnosticOnly.prd11.ts`, `registerOptionCoverage` | same |
| runtime nodes (15) | C-37 registry `version` read by the batch planner | `renderer/CullingBatching.ts` |
| `aura3d-cli/src/cli.ts` (05) | C-39 `registerCodemod("prd11-batch-optout")`, `registerCliCommand("perf gate")` | `packages/aura3d-cli/src/commands/prd11/index.ts` |
| benchmark registry (12) | C-30 lane scenes | `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/` |

### Flags (CONTRACTS §5)

| Flag | Owner | Gates | State path |
|---|---|---|---|
| `A3D_QR_TIERS` | 11 | tier resolver, C-27 real controller, C-28 real counters/FrameStats GPU scopes/pool, readback guard, context-restore rebuild, `qualityProfile` deprecation mapping (alias) | `dev` → `standalone-accepted` when §16.0 S1-S2, S6-S10 pass in `qr-prd11-perf.yml` → `integrated-accepted` at a G-PANEL round meeting §16.1 I1-I4 |
| `A3D_QR_TIERS_GOVERNOR` | 11 | `QualityGovernor` + `RenderScaleController` (with it off, tiers are static) | same, with S7 and I5 |
| `A3D_QR_TIERS_BATCHING` | 11 | layers 1-3, BVH culling (`batching: "on"` default follows the flag state) | same, with S3-S5 and I2-I3 |
| `A3D_QR_WEBGPU` | 11 | C-29 `backend: "auto"`/`"webgpu-experimental"` selection; Phase 6+ device | stays `dev` unless G-WGPU is "go" and V10 passes |

URL forms: `?a3d-qr=tiers`, `?a3d-qr=tiers,-tiers_batching`, `?a3d-qr=webgpu`. Phase 1 freeze deletions are not flagged (declared removal; no game uses WebGPU).

### Stubs used

C-01 (PR 0b-2 seam, contributors gated by flag), C-02 (registries real, generator throws `PROGRAM_GENERATOR_PENDING`, cache wraps `ShaderLibrary`), C-04 (today's blend), C-05 (today's capture and canvas sizing), C-07 (per-frame instance upload, tessellation inert), C-11 (depth features stored only), C-13 (registry stores; legacy chain runs), C-20/C-21 (no GPU volumetric pass), C-30 (registry wraps base scenes), C-31 (null sections), C-33 (today's capture + `a3d-qr` passthrough), C-35 (types only), C-36 (wraps legacy compiler), C-37 (`add` remounts; `version` real), C-38/C-39 (real). This lane's own C-27/C-28/C-29 stubs stay the default for everyone while its flags are off.

### Requests to other lanes (non-blocking)

The full list with "meanwhile" behaviour is §12.3: Q-01-1..4, Q-02-1..3, Q-03-1..2, Q-04-1, Q-05-1, Q-07-1..2, Q-09-1, Q-12-1..3, Q-13-1..2, Q-14-1..12, Q-15-1..7, plus CCR-11-1..5 (§12.1). All are filed on day 0; each is listed in the checkpoint report until resolved (CONTRACTS §6.5).

### Integration checkpoints (CONTRACTS §7)

| Checkpoint | Date (UTC) | What this lane reads from it |
|---|---|---|
| IC-0 | 2026-10-08 | flag-off identity; the perf baseline per game and scene (fps, draws, readbacks) that every integrated row is compared against |
| IC-1 | 2026-10-15 | first `all`/`none` runs with `A3D_QR_TIERS` on: `frame` present for every run, fps agreement (I1) where Q-12-1 has landed, readback counts per game |
| IC-2, IC-3 | 2026-10-22, 2026-10-29 | batching draw reductions on games (I2), Deep Recovery frame time if Q-03-1/Q-03-2 landed (I3), tier-ladder captures |
| IC-4 (G-PANEL) | 2026-11-05 | first round that can accept: V5/V6/V7/V8 panel judgments, per-tier perf (I4), flag promotion of `A3D_QR_TIERS*` to `integrated-accepted` |
| IC-8, IC-12 (G-PANEL) | 2026-12-03, 2026-12-31 | runner gate for all 18 games two checkpoints in a row (I4), G-WGPU decision record, mobile real-device lane result |

A missed integrated target files a `qr-ic-regression` against the attributed lane and does not block merges here.

---

## 13. Implementation phases

Each phase lands as its own PR series behind its flag, measured remotely on GitHub Actions `macos-14` by this lane's workflow `.github/workflows/qr-prd11-perf.yml` (lane scenes, lane specs, unit tests) and, at checkpoints, by lane 12's `quality-rebuild-capture.yml`. Phases 0-5 all start on day 0 in parallel sub-streams; the only intra-lane ordering is that Phase 4's governor consumes Phase 0's FrameStats (it can be developed against the C-28 stub FrameStats, which is already real CPU timing). "Exit (standalone)" gates this lane's merges and flag promotion to `standalone-accepted`; "Integrated" items are evaluated only at checkpoints (§16.1) and never block.

**Phase 0: Measured telemetry (no pixel change).** Start: day 0 (owned files); seams after PR 0b-2.
Deliver: `quality/FrameStats.ts` (real `frameStatsSlot`, GPU timing via `RendererTiming.ts`), `webgl2/{Probe,Counters}.ts`, `quality/DeviceProbe.ts`, C-01 contributor `prd11.frameStats`, C-31 sections `frame`/`quality`/`renderer.batching`, `tools/bundle-size --splitting`, lane workflow, lane scene `prd11-tier-ladder`, requests Q-15-1/Q-12-1/Q-01-2/Q-03-1 filed.
Exit (standalone): S1, S2 (§16.0). Integrated: I1 fps agreement on the 18 games (needs Q-12-1 for harness storage).

**Phase 1: WebGPU freeze.** Start: day 0.
Deliver: §6.2 deletions in lane-11 paths, hard error on missing WGSL, sync-readback throw, `apps/wow-webgpu-instancing` deletion, `apps/webgpu-lab` retitle, docs status line; Q-04-1, Q-13-1, Q-13-2, Q-14-12, Q-15-5, Q-15-6, Q-15-7 filed.
Exit (standalone): S10.

**Phase 2: No CPU readback in production frames.** Start: day 0.
Deliver: `quality/PostprocessGuard.ts`, `resources/RenderTargetPool.ts` (real `renderTargetPoolSlot`), readback counter gate in lane specs; Q-03-1, Q-03-2, Q-02-1 filed.
Exit (standalone): S6. Integrated: I3 (Deep Recovery p50 and vision floors; needs Q-03-1 or Q-03-2), I1 readback = 0 across 18 games.

**Phase 3: Batching.** Start: day 0 (`batching/*`, `ContentKeys.ts`, `performance/*`); wiring after PR 0b-2.
Deliver: §6.6 layers 1-2 in `renderer/CullingBatching.ts` (content keys, instancing via C-07 slot), layer 3 (`BatchedGeometryPool`, `DrawDataTexture`, `MultiDrawBatch`, `webgl2/MultiDraw.ts`, C-02 chunks), BVH culling (§6.7), `forward/DrawSubmit.ts`, `renderer.batching` section, codemod `prd11-batch-optout`, lane scenes `prd11-draw-call-stress` and `prd11-instancing-100k`.
Exit (standalone): S3, S4, S5. Integrated: I2 (§9.3 game draw targets; multi-draw pixels need C-02 real; VAO-flat needs C-07 real), V2 (needs R18 fix, Q-15-2).

**Phase 4: Tiers, detection, governor.** Start: day 0 (`quality/*`); `rendererOptions.ts` after PR 0b-1.
Deliver: §6.3-6.5, `TierResolver`, `DeviceClasses` + fixtures, `RenderScaleController`, `QualityGovernor`, C-38 `quality` extension, URL params, deprecation mappings, persistence, next-lower-tier warm-up via C-02 `precompile`, `createPerformanceGovernor` delegation; Q-09-1, Q-14-3, Q-14-4, Q-14-8, Q-14-10, Q-12-2 filed.
Exit (standalone): S7, S8, S9. Integrated: I4 (§17.2 runner budget for all 18 games), I5 (governor holds p50 on games), V5, V8, V9.

**Phase 5: Context restore.** Start: day 0 (`ResourceRegistry.ts`); lifecycle files after PR 0b-2.
Deliver: §6.9 registry rebuild, `ContextLifecycle.ts`, `DeviceLifecycle.ts` ordering, texture retention policy by tier; Q-01-1, Q-15-3, Q-14-7 filed.
Exit (standalone): S11. Integrated: I6 (4 games restore).

**Gate G-WGPU review** (§6.2), at a G-PANEL checkpoint. Recorded in `docs/project/aura3d-quality-rebuild/evidence/prd-11/decisions/G-WGPU.md` with evidence links. If it is "no-go" or lane 15's architecture record adopts three.js `WebGPURenderer`, Phases 6-8 are not started; this does not affect completion of Phases 0-5 (§21).

**Phase 6: WGSL emission (conditional; pure groundwork may start any time).**
Deliver: `program/UniformLayout.ts`, `program/chunks/{manifest,*.wgsl}.ts`, `webgpu/WgslAssembler.ts`, `tools/wgsl-validate/` naga job in `qr-prd11-perf.yml` (ubuntu-latest).
Exit (standalone): `std140Offsets` equals hand-computed offsets for every block; manifest parity test lists every registered chunk; naga validates WGSL for every lane-11-owned chunk and every C-02 chunk with a twin. Integrated: every key in the checkpoint warm-up corpus (18 games × 4 tiers + 18 benchmark scenes) validates.

**Phase 7: `WebGPURenderDevice` (conditional).**
Deliver: §6.2 backend rules in `webgpu/device/`; delete `WebGPUDevice.ts`; port TAA/FXAA WGSL (`WebGPUTemporal.ts`, `postprocess.wgsl`; bloom WGSL in lane 03's `WebGPUPostShaders.ts` is consumed through C-13 `fragment.wgsl`) and async readback.
Exit (integrated, V10): 18 benchmark scenes render on WebGPU with mean ΔE2000 ≤ 1.0 and p99 ≤ 5 vs WebGL2 same engine, SSIM ≥ 0.98, vision review "no visible difference"; one render pass per target per frame (counter); zero per-draw buffer creation after frame 2; forced-WebGPU runner budget no worse than WebGL2 +10%. Standalone: the same on lane scenes `prd11-*`.

**Phase 8: Compute (conditional).**
Deliver: storage-buffer instancing at 100k instances, compute-pass support for lane 07's resident particles (Q-07-2), `backend: "auto"` exposure behind Ultra-only default.
Exit (integrated, V11): benchmark 14-particles at 200k particles on Ultra: vision score ≥ three.js r185 at the same count; depth-correct compositing against scene geometry visible in screenshot; `auto` selects WebGPU only where the probe passes and the forced-backend pixel diff gate passed in the same CI run. Standalone: `prd11-instancing-100k` on WebGPU matches WebGL2 (ΔE2000 mean ≤ 1.0).

---

## 14. Task checklist

Every item edits only lane-11 paths (§Parallel execution) or registers through an extension point. Items that need another lane's file are requests (§12.3) and appear here only as "file Q-…". Tests live in `tests/qr/prd11/` unless stated; browser tests and perf captures run in `.github/workflows/qr-prd11-perf.yml` on `macos-14`.

### Phase 0: telemetry (day 0)

- [ ] `packages/rendering/src/quality/FrameStats.ts`: class `FrameStats implements FrameStatsLike` (C-28): ring (capacity 240) with `begin`, `end`, `scope`, `percentiles` (nearest-rank), `fps()` (`null` before 30 samples), `legacyFps()` (`0` before 2). `slot.provide` for `frameStatsSlot` in `packages/rendering/src/lanes/prd11.ts` behind `A3D_QR_TIERS`. Unit test `tests/qr/prd11/unit/frame-stats.test.ts`: 240 known samples → exact p50/p95/p99/max; ring wraps at 241; 30 × 50 ms → `fps() === 20`; 10 samples → `fps() === null`, `legacyFps() === 20`.
- [ ] `packages/rendering/src/RendererTiming.ts` (`createWebGL2GpuTimingBackend` `:164`): add `scope(name)` that brackets `EXT_disjoint_timer_query_webgl2` queries and resolves results 2-3 frames later into `FrameStatsSample.gpuMs`/`scopes`; on `GPU_DISJOINT_EXT` discard the sample (`gpuMs: null`). Unit test with a fake GL returning disjoint on one frame.
- [ ] `packages/rendering/src/webgl2/Counters.ts` (PR 0b-2 seam): extend the stub's `readPixels`/`linkProgram` wrapping to all C-28 `DeviceCounters` fields by wrapping the public `RenderDevice` methods on the device instance (`createBuffer`, `createTexture`, texture update, `createRenderTarget`, `draw*`, `readPixels`, `readFloatPixels`, `readDepthPixels`, `destroy*`); `liveVertexArrays` stays `null` until Q-01-1. `RenderDevice.ts`: document semantics (per-frame fields reset by `resetFrameCounters`). `MockRenderDevice.ts`: implement counters natively. Unit test: each call increments exactly one counter; `resetFrameCounters` zeroes per-frame fields only.
- [ ] `packages/rendering/src/webgl2/Probe.ts` + `quality/DeviceProbe.ts`: `probeWebGL2Device(gl, env)` reading `gl.RENDERER`, `WEBGL_debug_renderer_info` (if exposed), `MAX_TEXTURE_SIZE`, `MAX_SAMPLES`, `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `EXT_disjoint_timer_query_webgl2`, `KHR_parallel_shader_compile`, `WEBGL_multi_draw`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `navigator.userAgentData?.mobile` else `matchMedia("(pointer: coarse)")`; exposed as `RenderDevice.probe`. Unit test with a fake GL; every CI job logs the probe (§18).
- [ ] `packages/rendering/src/lanes/prd11.ts`: register C-01 contributor `prd11.frameStats` (`collect` → `begin(performance.now())` + whole-frame GPU query; `after-output` → no-draw pass calling `end()` and storing the counters delta). Unit test (MockRenderDevice + C-01 stub): one `begin`/`end` per `render()`; zero contributor calls with `A3D_QR_TIERS` off.
- [ ] `packages/engine/src/lanes/prd11.ts`: C-31 `registerDiagnosticsSection({ key: "frame" })` returning `AuraFrameTimingReport` from `frameStatsSlot` (fields that cannot be measured are `null`, C-31 rule), plus `quality` and `renderer.batching` sections. Unit test: section schema-valid on a disposed app; no GPU readback in `collect`.
- [ ] File Q-15-1 (fps literal `index.ts:12338`, `:11336`, overlay `:18654`, snapshot throttle `:11678`), Q-01-2 and Q-03-1 (scopes), Q-12-1 (harness `engineFrame`, `fpsAgreement`, 30-frame window, `--perf`), Q-15-7 (fixtures pinning `fps: 60`). Attach the exact patch text from §12.3 to each issue.
- [ ] `tests/qr/prd11/browser/fps-agreement.spec.ts` (macos-14): on `prd11-tier-ladder` and the base scenes 01, 12, 18 with `?a3d-qr=tiers`, compare `diagnostics().frame.fps` with an in-page rAF counter over ≥ 30 frames; assert agreement within 10%; assert `frame` is never a constant (two scenes with different loads report different p50).
- [ ] `tools/bundle-size/index.ts`: add `--splitting` (esbuild `splitting: true`, `format: "esm"`) that reports the root critical-path gzip separately from lazy chunks; expose it as the `tools/bundle-size` package script (root script by request Q-15-6); record today's baseline in `docs/project/aura3d-quality-rebuild/evidence/prd-11/phase-0/bundle.json` so the §17.1 bundle row has a before value.
- [ ] `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd11/tier-ladder.ts`: scene `prd11-tier-ladder` (base scene 18 content parameterised by `?aura3d-quality=` and a benchmark-only `?loadMs=<n>` busy loop inside the lane's Aura adapter, never in engine or game code), both adapters, `qrFlags: ["tiers"]`, `admittedAsReference: false` (perf scene, no parity claim).
- [ ] `.github/workflows/qr-prd11-perf.yml`: on PRs labelled `lane:prd11` and nightly: unit tests, lane browser specs on `macos-14` (Chromium/ANGLE Metal), lane scene captures with `--flags tiers` and `--flags none`, `tools/perf-gate` over the lane report, `webgpu-smoke` (non-gating), and the probe log artifact.
- [ ] Profile the three unprofiled or fill-bound games (Gallery Shift, Aura Clash, Patrol Wing) from the IC-1 capture (or a lane-workflow run of the deployed route with `?a3d-qr=tiers`, which needs no route edit). For each, write `docs/project/aura3d-quality-rebuild/evidence/prd-11/phase-0/<game>.md` with `frame` p50 (and `scopes` where Q-01-2/Q-03-1 landed), draw calls, triangles, readbacks, and the top three costs with file:line causes; these replace "not profiled" in §1 and §9.6.

### Phase 1: WebGPU freeze (day 0)

- [ ] `packages/rendering/src/WebGPUDevice.ts`: delete `productPropBodyGate`, `productPropOrangeGate`, `productPropAlbedo` (`:3555-3588`) and their call sites (`:3675-3678`, `:3768-3773`); delete `u_productColorSmoothing` from `nativeUniformStruct` and the packer.
- [ ] `WebGPUDevice.ts`: delete `rasterizeDraw` (`:1719-1787`), `rasterizeTriangle` (`:2970+`), CPU skin/morph helpers used only by them, `colorPixels` on `WebGPURenderTarget`; `draw()` (`:1149-1150`) calls only `submitNativeRenderPass`.
- [ ] `WebGPUDevice.ts` `readPixels` (`:804-842`) and `readFloatPixels` (`:1022`): throw `new RenderDeviceError(..., "WEBGPU_SYNC_READBACK_UNSUPPORTED")`; remove the "CPU-shadowed" capability notes at `:550-551`. Update `ProductionWebGPURenderer.renderImportedAsset` (`ProductionWebGPURenderer.ts:93`) to delegate to `renderImportedAssetAsync` (`:137`) or delete it; callers in lane-11 tools are updated here, other callers (`rg -n "renderImportedAsset\(" tools apps tests`) go to their owners in Q-15-7.
- [ ] `WebGPUDevice.ts` `createNativeShaderSources` (`:3179-3311`): keep the `portable` and `passthrough` branches and the marker branches that have real WGSL; replace the final `generated-texture` / `generated-basic` flat-colour fallbacks with `throw new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING", { marker })`. Unit test `tests/qr/prd11/unit/wgsl-missing.test.ts`: shader sources from `SkinnedLitMaterial` (`"skinned-lit"`), `AnimationToonMaterial` (`"animation-toon"`), `EnvironmentBackgroundPass` (`"environment-background"`) and `ScreenSpaceLineMaterial` (`"screen-space-line"`) each throw with `code === "WGSL_PROGRAM_MISSING"`; an `instanced-pbr` marker still returns a program.
- [ ] Delete `packages/rendering/src/production-runtime/backends/webgpu/*.ts`, `backends/webgl2/*.ts`, `backends/WebGPURendererBackend.ts`, `webgpu/WebGPUPipelineCache.ts`, `webgpu/WebGPUBuffer.ts`, `webgpu/WebGPUTexture.ts`, `webgpu/WebGPUCompute.ts`, `production-runtime/shaders/wgsl/{pbr,skybox}.wgsl`; fix importers inside lane-11 paths (`rg -l "WebGPURendererBackend|WebGPUPipelineCache|backends/webgpu|backends/webgl2" packages tools apps`); file Q-15-5 for the `packages/rendering/src/index.ts:1163-1168` barrel lines (façades remain as one-line deprecated re-exports until it merges).
- [ ] Delete `packages/materials/src/NodeMaterial.ts`; file Q-15-5 (materials barrel, README "node materials" claim) and Q-15-6 (editor serializer drops the node type with a load-time warning).
- [ ] `apps/wow-webgpu-instancing`: delete the app; file Q-15-6 for its route-health entry and redirect.
- [ ] File Q-04-1 (`apps/wow-webgpu-product-viewer/src/main.ts:51-66, :59` clamps and `u_productColorSmoothing`).
- [ ] `apps/webgpu-lab`: retitle to "Backend availability lab", remove any rendering-parity wording, keep the directory; file Q-14-12 for `apps/showcase-webgpu-particle-lab`.
- [ ] Remove `production-webgpu-starter` from `tools/production-runtime-template-readiness/index.ts` and `tools/production-runtime-package-surface-readiness/index.ts`; file Q-13-1 (`tools/agent-templates/index.ts`, `templates/_archived/`). Check after Q-13-1: `rg -l "production-webgpu-starter" tools packages docs` returns only the archive note.
- [ ] `packages/engine/src/agent-api/app/rendererOptions.ts` (carve-out of `index.ts:4288-4300` profile): `experimental-webgpu` throws `AuraMigrationError` naming PRD 11 §6.2 (the union member stays in the frozen type). Unit test.
- [ ] Rewrite `docs/rendering/webgpu-current-architecture.md`, `webgpu-fallback.md`, `webgpu-hardware-matrix.md`, `webgpu-route-and-report-evidence.md` to the single status line plus a link to this PRD; remove WebGPU parity rows that cite `production-runtime/shaders/wgsl/pbr.wgsl`.
- [ ] Publish C-40 fact F-11-02 (WebGPU status line) and file Q-13-2 (skills `aura3d-core`, `aura3d-performance`, `aura3d-threejs-migration`).
- [ ] WebGPU browser specs: delete the lane-11-owned specs for Duck parity and sync pixel proof; move triangle, render-target and async readback specs to the non-gating `webgpu-smoke` job in `qr-prd11-perf.yml`; list the others in Q-15-7.

### Phase 2: no CPU readback (day 0)

- [ ] `packages/rendering/src/quality/PostprocessGuard.ts`: `guardPostprocessPlan(passes, { mode, gpuFusable, hasDepthTexture, cpuDeterministic })` per §6.8. `gpuFusable` is computed by the caller from the same predicate as `canFuseLdrPostprocess` (`Renderer.ts:2111-2120`) plus `device.presentLdrPostprocess` presence (`:1086`); this module exports `isGpuFusablePlan(passNames, sourceIsHdr)` so the predicate lives in one place. `"throw"` → `RenderDeviceError("Postprocess pass has no GPU implementation", "POSTPROCESS_PASS_CPU_ONLY", { passes })`; `"drop"` → drop non-fusable passes, re-check, return `dropped` for `POSTPROCESS_PASS_DROPPED:<name>` (once per name per renderer). Unit tests (`tests/qr/prd11/unit/postprocess-guard.test.ts`): `[bloom, tone-mapping, volumetric-light]` with `"drop"` → `[bloom, tone-mapping]` and one dropped name; with `"throw"` → throws `POSTPROCESS_PASS_CPU_ONLY`; `cpuDeterministic` → input unchanged; DoF without depth texture → dropped.
- [ ] `packages/rendering/src/resources/RenderTargetPool.ts`: `acquire/release/trim(120)` keyed by `(width, height, format, samples, depth)`; `slot.provide` for `renderTargetPoolSlot` behind `A3D_QR_TIERS`. Unit test (MockRenderDevice): 100 frames of acquire/release → creations equal distinct descriptors; `trim` disposes idle targets; C-28 conformance passes for `real`.
- [ ] File Q-03-1 (guard + pool + `post` scope in `renderer/PostprocessExecution.ts`), Q-03-2 (`compiler/postprocess.ts` volumetric `:12810`/`:12938`, contact shadow, film grain, CA), Q-02-1 (point-shadow readback), each with the patch text and the unit tests above as acceptance.
- [ ] `tests/qr/prd11/browser/no-readback.spec.ts` (macos-14): on base scenes 01-18 and lane scenes with `?a3d-qr=tiers`, sample C-28 `counters().readbacks` per frame for 120 frames after ready; assert 0 for every scene that has no non-fusable pass today; for scenes with a non-fusable pass, record the count as a **failing control** that must turn 0 when Q-03-1 lands (reported per checkpoint, never a merge gate here). The same spec runs over the 18 deployed games in report mode.
- [ ] Unit test (MockRenderDevice, lane-owned): a plan containing `volumetric-light` through the pure guard with the C-28 counting device yields 0 readbacks, proving the mechanism independently of the wiring.

### Phase 3: batching (day 0 for new modules; wiring after PR 0b-2)

- [ ] `packages/rendering/src/batching/ContentKeys.ts`: `geometryContentKey(geometry)` (C-07 tessellation descriptor if present, else hash of counts + strided position/normal/uv sample, memoised in a `WeakMap`, full-array compare on first collision) and `materialSpecKey(material)` (stable key ordering; `baseColor`, `emissive`, `emissiveIntensity` excluded; opacity excluded when ≥ 0.999; includes `cullMode`, C-04 `renderStateKey`, texture identities). Unit tests: 300 separately allocated box `Geometry` objects with equal params → 1 geometry key; colour change keeps the material key; roughness change changes it; a hash collision with different arrays yields different keys.
- [ ] `packages/rendering/src/batching/StaticMergePlanner.ts`: `planBatches(items, { dedupe, instancing, multiDraw })` groups by `(geometryContentKey, materialSpecKey, castShadow, renderStateKey)` for instancing (merged material base colour white, per-node colour into `instanceColors`, §8.2); remaining static opaque scalar-PBR items by `(programKey, renderStateKey, vertexLayoutKey)` for multi-draw (skipped with `multi-draw-generator-pending` while C-02 is the stub); transparent items passthrough. `reasonsNotBatched` counts: `transparent`, `textured-unique`, `skinned`, `morph`, `batch:false`, `dynamic-material`, `emissive-varies`, `vertex-colors`, `multi-draw-generator-pending`, `caster-variant-pending`. Unit test: 300 boxes with 3 colours → 1 instanced batch of 300 (64-chunked into 5 draws while the C-07 stub is active) with 3 distinct instance colours.
- [ ] `packages/rendering/src/renderer/CullingBatching.ts` (carve-out of `Renderer.ts:2208-2258`, `:2361-2409`): replace the per-frame regroup in `applyRendererOwnedStaticBatching` and the identity `staticBatchKey` (`:2399-2409`) with a `BatchPlan` cached by structural version (C-37 `version` or item identity set); matrices of dynamic-transform-only items update in place through C-07 `InstanceBufferLike.setMatrices`. Behind `A3D_QR_TIERS_BATCHING`; with it off the carved code runs byte-identical. Unit test: 600 frames of an unchanged scene build the plan once.
- [ ] Runtime material mutation without engine edits: per frame, `CullingBatching.ts` compares each batched source item's `baseColor`/`emissive` (O(n) float compare, no allocation) and rewrites that instance's colour; a change to any field inside `materialSpecKey` moves the item out of its batch at the next plan rebuild (`reasonsNotBatched["dynamic-material"]`). Unit test: recolouring 1 of 100 batched boxes changes 1 instance colour and keeps 1 draw; changing its roughness yields 2 draws, not 100.
- [ ] `packages/rendering/src/forward/DrawSubmit.ts` (carve-out of the `device.draw*` issuance in `ForwardPass.drawItem` `:269-351`): `submitDraw(device, pipeline, geometry, instanceCount, ranges)` dispatches single, instanced, or multi-draw (`webgl2/MultiDraw.ts`) submission; byte-identical behaviour for single draws.
- [ ] `packages/rendering/src/batching/BatchedGeometryPool.ts`: shared VB/IB per vertex layout, `Uint32` indices rebased by vertex offset; free-list + compaction on plan rebuild. Unit test with `MockRenderDevice`: add 3 geometries, remove middle, compact → ranges contiguous and indices valid.
- [ ] `packages/rendering/src/batching/DrawDataTexture.ts`: RGBA32F width 1024, `DRAW_TEXELS = 6`, dirty-row `texSubImage2D`. Unit test: writing draw 171 updates row 1 only.
- [ ] `packages/rendering/src/batching/MultiDrawBatch.ts` + `webgl2/MultiDraw.ts`: `multiDrawElementsInstancedWEBGL` when `device.probe.multiDraw`, else loop `drawElements` with `u_drawId`; `MockRenderDevice.multiDrawElementsInstanced`. Unit test: both paths issue identical range sequences on `MockRenderDevice` (one call vs N calls).
- [ ] `packages/rendering/src/batching/shaders/{drawId,instanceEmissive}.glsl.ts`: register C-02 chunks `a3d_prd11_draw_id`, `a3d_prd11_instance_emissive` and feature `prd11.drawId` (selecting frozen `ProgramFeatures.drawId`); C-11 `registerDepthVariantFeature("prd11.drawId")`. Tests: `C-02-chunks.spec.ts` compiles both in ChunkHarness on macos-14; `tests/qr/prd11/unit/draw-id-chunk.test.ts` checks the slot layout matches `DrawDataTexture` (`DRAW_TEXELS` imported, not duplicated). File CCR-11-5 and Q-02-3.
- [ ] `packages/rendering/src/performance/FrustumCuller.ts`: new signature `cull(bounds: Float32Array, count, frustumPlanes: Float32Array, out: Uint8Array): number` with no allocation; delete the `Box3`-per-item path. Unit test: zero allocations (spy on `Box3`/`Vector3` constructors).
- [ ] `packages/rendering/src/performance/BVH.ts`: build over static bounds at plan time; `refit(dynamicIndices)`; `queryFrustum(planes, out)`; used by `CullingBatching.ts` above 256 items. Unit test: 10,000 random boxes, BVH result equals brute force.
- [ ] `packages/rendering/src/performance/Batcher.ts`: mark deprecated, re-export `planBatches`; delete one release later.
- [ ] C-31 section `renderer.batching` (§9.2) registered in `packages/engine/src/lanes/prd11.ts`.
- [ ] Lane scenes (C-30): `benchmarks/quality-rebuild/scenes/prd11/{draw-call-stress,instancing-100k}.ts` with adapters in `aura3d/scenes/prd11/` and `three/scenes/prd11/`, following the existing `16-instancing.ts` pattern: `prd11-draw-call-stress` (5,000 static primitives, 6 primitive types, 12 colours, 4 roughness values, one sun, no shadows; three.js `BatchedMesh`), `prd11-instancing-100k` (100,000 boxes, per-instance colour, non-uniform size `[0.3,0.6,0.3]`, rotated; three.js `InstancedMesh`). Procedural generators live in the lane dir (helper requests to lane 12 only if a shared helper is needed).
- [ ] `scripts/migrations/prd11-batch-optout.mjs` + C-39 `registerCodemod("prd11-batch-optout")` (report mode): lists `apps/` nodes with runtime non-colour material mutation (`setMaterial(`, `material.roughness =`); file Q-14-11.
- [ ] `tests/qr/prd11/browser/vao-leak.spec.ts`: base scene 16-instancing and `prd11-instancing-100k`, 10,000 frames, assert `liveBuffers` (and `liveVertexArrays` once Q-01-1 lands) identical at frames 60 and 10,000; reported per checkpoint against whichever C-07 implementation is active.
- [ ] File Q-15-2 (`PrimitiveResourceCache`, `node.batch/static` → `RenderItem`, R18), Q-01-4 (chunk cap and emissive with C-07 real), CCR-11-3, CCR-11-4.

### Phase 4: tiers and governor (day 0 for `quality/*`; `rendererOptions.ts` after PR 0b-1)

- [ ] `packages/rendering/src/quality/QualityTier.ts`: re-export C-27 `QUALITY_TIERS`, `resolveTierSettings`, `nextLowerTier` from `contracts/quality.ts` (no value copies); add `validateOverrides` used by `resolveTierSettings` (power-of-two shadow sizes, budgets > 0) if the PR 0a stub lacks it (CCR-free: it is lane-11 code behind the frozen signature). Unit test `tests/qr/prd11/unit/quality-tier.test.ts`: table deep-equals the C-27 frozen values (R9/R10/R11 included); invalid override throws `QUALITY_OVERRIDE_INVALID`.
- [ ] `packages/rendering/src/quality/DeviceClasses.ts`: versioned regex table (§6.4 step 2) with `tableVersion`; fixture `tests/qr/prd11/fixtures/renderer-strings.json` containing the runner string `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)` (from `evidence/games/report.slim.json`), `"Apple GPU"` (Safari desktop and mobile), the SwiftShader/WARP strings, and at least 10 real strings per class row (collected from public WebGL report dumps and from the CI probe logs, §18), each `{ string, mobile, expectedTier, expectedConfidence }`. Unit test: every fixture maps to its expected tier and confidence; every §17.1 reference device appears with the tier of its column.
- [ ] `packages/rendering/src/quality/TierResolver.ts`: `classifyDevice`, `calibrateTier` (30 samples, thresholds 1.25× / 0.5×; raising only with GPU samples), `tierCacheKey`, localStorage `TierCache` with try/catch for blocked storage; output mapped to C-27 `source` values (§6.4 step 6). Unit tests for each step and for a cache hit skipping calibration.
- [ ] `packages/rendering/src/quality/RenderScaleController.ts`: `createRenderScaleController` (0.1 steps; down after 30 frames over `targetFrameMs · 1.1`; up after 120 frames under `· 0.8`; floor `max(minRenderScale, allowSubCssResolution ? 0 : 1/DPR)`). Unit test with synthetic frame streams. File CCR-11-1.
- [ ] `packages/rendering/src/quality/QualityGovernor.ts`: §6.5 ordering and hysteresis over a `RenderScaleSource`. Unit test with a stub source pinned at the floor, tier `"high"`, `targetFrameMs` 16.7, constant 20 ms frames (1.2×): first step `ssr high→off` at frame 300 ± 1, second `ambientOcclusion high→medium` at frame 600 ± 1; frames then drop to 10 ms with the source at scale 1 → first up-step at frame 600 ± 1 after the drop, restoring `ambientOcclusion`; `lock()` → zero steps over 2,000 frames of 20 ms; a tier `"medium"` run skips `ssr` (already off) and steps `ambientOcclusion` first; mobile uses 120-frame windows. Oscillation test (synthetic model: High, scale pinned at floor, base load 1.2 × target, each down-step removes 10% of frame time, each up-step adds it back): ≤ 2 direction changes over 3,000 frames and no step in the last 1,000.
- [ ] `packages/engine/src/agent-api/app/rendererOptions.ts` (carve-out of `normalizeCreateAppRendererOptions`, `index.ts:4315-4326`): parse `quality`, `adaptive`, `targetFrameRate`, `batching`, `backend` (C-38 pre-declared); `?aura3d-quality=`/`?aura3d-adaptive=0` in all builds with the route's query preserved; deprecated `qualityProfile`/`performanceQuality` mappings with one-time warnings (§7.1); `experimental-webgpu` throws. Remove `diagnosticOnly.prd11.ts` entries as each field is wired; add option-coverage rows. Unit test: param parsing, invalid values ignored with a diagnostics warning, `decision.source === "url"` when forced.
- [ ] `packages/engine/src/lanes/prd11.ts`: register the real C-38 `quality` app extension (probe → resolver before first frame via `RenderDevice.probe`; controller backed by `QualityGovernor`; `onChange`; `forceRenderScale` through the C-27 stub path) and the flattened `precompile`. Tier settings reach other lanes through C-36 `SceneCompileContext.quality` and C-01 `FrameContributorContext.tier`, both filled from the controller; no compiler edit. Unit test: with `A3D_QR_TIERS` off, `app.quality` is the C-27 stub (`decision.source === "default"`).
- [ ] `agent-api/RootPerformanceQuality.ts`: deprecated `AuraPerformanceQuality` alias mapping onto C-27 overrides and `forceRenderScale`; keep `tests/unit/agent-api-root-performance-quality.test.ts` and `tests/unit/muse3jsparity-root-governor-contract.test.ts` green unchanged (they exercise the alias path). File Q-15-4.
- [ ] `packages/engine/src/production-runtime/GameRenderPreset.ts` (`createPerformanceGovernor` `:158`): optional `quality` parameter; when present, forward `particleScale`/`lodBias`/`shadowSize` steps to `quality` overrides and report `delegated: true`. Unit test: one step per over-budget window with both active. File Q-09-1.
- [ ] `app.quality.set(tier)`: warm the new keys via C-02 `precompile` and C-28 `compileAsync` before switching; resolves when switched. Browser spec `tests/qr/prd11/browser/tier-switch-hitch.spec.ts` on `prd11-tier-ladder`: High→Low produces no frame > 50 ms.
- [ ] `app.precompile(options)`: wrap C-02 `precompile` for `include` variants (effect names map to C-20 particle/VFX material keys when registered); report compile ms and `parallel` (false with the C-28 stub). Browser spec `tests/qr/prd11/browser/precompile-hitch.spec.ts` on `prd11-tier-ladder` with late-appearing skinned and VFX nodes added through C-37 `add`: `frame.programsCompiledSinceReady === 0` after `precompile({ include })` and no frame > 50 ms after ready. The Aura Clash variant (hit flash is DOM/CSS, `styles.css:299-304`; engine-side variants are the second fighter's skinned materials and the special-move nodes; `games.json` timeline through `04-action` and `05-special`) runs in report mode at checkpoints.
- [ ] `agent-api/devtools/sceneKitBudgets.ts` (carve-out of `index.ts:9681-9796`): rename to `budgetDrawCalls`, `budgetP50FrameMs`, remove `calibrationSource` (type field `:9528`), add `kind: "aura-scene-kit-budget"` and deprecated getters for one release. File Q-07-1 (`collectParticleBudgetDiagnostics`).
- [ ] File Q-14-3, Q-14-4, Q-14-8 (route DPR/profile/capture changes), Q-14-10 (`games.json` variants), Q-12-2 (harness lock and per-tier captures). Publish C-40 facts F-11-01 (`verified` once S8 passes) and F-11-05.

### Phase 5: context restore (day 0 for the registry; lifecycle files after PR 0b-2)

- [ ] `packages/rendering/src/resources/ResourceRegistry.ts`: real `resourceRegistrySlot` provider (`register` with `retainForRestore`, `unregister`, `rebuild` per §6.9); lane-11 resources (pool targets, `DrawDataTexture`, `BatchedGeometryPool` buffers, instance buffers it creates) register themselves. Unit test with `MockRenderDevice` simulating loss: every registered handle valid after `rebuild`, counts reported.
- [ ] `packages/rendering/src/webgl2/ContextLifecycle.ts` (carve-out of `WebGL2Device.ts:418-445`): on restored, call `invalidateGpuObjects?.()` (Q-01-1), then `registry.rebuild(device)`, then C-02 `precompile` of the active key set; `renderer/DeviceLifecycle.ts` emits `onDeviceRestored` only after all resolve (C-29). With `A3D_QR_TIERS` off, today's flag-only behaviour runs.
- [ ] Texture retention policy by tier (Medium and below release decoded data; High and Ultra retain `ImageBitmap`): `quality/RetentionPolicy.ts` returns `retainForRestore` per tier; texture owners read it (fact F-11-03). Unit test of policy selection.
- [ ] `tests/qr/prd11/browser/context-restore.spec.ts` (macos-14), built on the existing helper `tests/browser/rendering-webgl2-harness.ts:988-994` (`loseContext`): base scenes 01, 12, 18 and `prd11-instancing-100k` paused, `loseContext()` + `restoreContext()`, rendering resumes within 2 s and SSIM ≥ 0.98 vs the pre-loss frame. The 4-game version (Courier, Aura Clash, Turbo Drift, Gravity Post) runs in report mode at checkpoints.
- [ ] File Q-01-1 (GL object invalidation, VAO counter), Q-15-3 (root bridge pause), Q-14-7 (Courier overlay), Q-15-7 (`tests/browser/context-loss-recovery.spec.ts` expects rebuilt pixels).

### Route fixes (lane 14 edits on request; this lane measures each in the capture report)

These are not lane-11 tasks; they are the §12.3 requests whose results this lane reads at checkpoints. The lane-11 task for each is "file the request with the patch text, and add the measurement to the integrated table".
- [ ] File Q-14-1 (Blockfall Reactor `main.ts:630`, `:763-826`, `:834-846`, `reactor-scene.ts:516`); measurement: `engineFrame.drawCalls` drops, no console error, one WebGL context per page.
- [ ] File Q-14-2 (Siege Golf `main.ts:978`, `:1104`); measurement: p95 ≤ 2 × p50.
- [ ] File Q-14-3 (Skyline Runner `main.ts:1875`, `:1879`, unused tea house and 80k Meshy hero, evidence serialisation); measurement: heap ≤ 150 MB at ready (`performance.memory.usedJSHeapSize`).
- [ ] File Q-05-1 and Q-14-5 (Neon Swarm `main.ts:608-627`, lamp ≤ 5k tris); measurement: triangles submitted ≤ 1M, asset bytes drop ≥ 15 MB.
- [ ] File Q-14-4 (Mech Hangar `:705`, Vault Breakers `:392`, Rooftop `:738`, `:743`, Aura Clash `AuraClashArenaApp.ts:1522-1531`); measurement: canvas backing size equals `min(DPR, tier.maxPixelRatio) × CSS size`.
- [ ] File Q-14-6 (Bank Shot digits), Q-14-7 (Courier `city.ts` static groups, capture fork, overlay), Q-14-8 (Turbo Drift `:2983-2994`), Q-14-9 (Gravity Post textures), Q-14-10 (`games.json`), Q-14-11 (batch opt-out review), Q-14-12 (particle-lab rename).

### Phases 6-8 (conditional on the G-WGPU checkpoint decision; groundwork items marked ◦ may start any time)

- [ ] ◦ `packages/rendering/src/program/UniformLayout.ts`: `std140Offsets`, `emitGlslBlock`, `emitWgslStruct`; member lists read from C-08; unit test against hand-computed offsets for `AuraFrame` (mat4 ×3, vec4 camera, vec4 exposure/time/near/far, vec2 resolution padded) and `AuraLights`.
- [ ] ◦ `packages/rendering/src/program/chunks/manifest.ts` + `*.wgsl.ts` twins for registered chunks without an inline `wgsl`; unit test of manifest parity reporting missing twins per owning lane.
- [ ] ◦ `tools/wgsl-validate/`: pinned `naga` CLI (`cargo install naga-cli --version <exact>` inside the job, never on the Mac) over the corpus, as an `ubuntu-latest` job in `.github/workflows/qr-prd11-perf.yml`.
- [ ] `packages/rendering/src/webgpu/WgslAssembler.ts`: `assembleWgsl(features, registry)` emitting WGSL, `bindGroupLayouts`, `vertexLayout`; snapshot tests for 10 representative keys. Optional Q-01-3.
- [ ] `packages/rendering/src/webgpu/device/WebGPURenderDevice.ts`: frame encoder, per-target pass, `PipelineCache` (async creation), `BindGroupLayouts`, `UniformRing`, `MipGenerator`, full pipeline state, depth shadow maps, MSAA canvas resolve; port async readback and device-loss plumbing from `WebGPUDevice.ts:844-1020`.
- [ ] Port `webgpu/WebGPUTemporal.ts` and `production-runtime/shaders/wgsl/postprocess.wgsl` (lane 11) onto the new device; consume lane 03's `WebGPUPostShaders.ts` and C-13 `fragment.wgsl` through the post registry, without editing lane 03 files.
- [ ] Delete `packages/rendering/src/WebGPUDevice.ts`; `RenderBackend.ts` imports the new device lazily.
- [ ] Cross-backend pixel-diff job in `qr-prd11-perf.yml`: lane scenes standalone; 18 benchmark scenes at checkpoints (V10).
- [ ] File Q-07-2 for the resident particle renderer move and production-export removal; this lane provides the storage-buffer and compute-pass support in `webgpu/device/`.
- [ ] `renderer/RendererFactory.ts` `backend: "auto"`: select WebGPU only on Ultra with probe pass and `A3D_QR_WEBGPU` on, never on Low/Medium; record the selection reason in the C-31 `quality` section.

---

## 15. Test requirements

All browser tests and perf captures run remotely on GitHub Actions `macos-14` (Chromium, ANGLE Metal, Apple Paravirtual GPU) per policy; nothing GPU-heavy runs on the Mac. Unit tests run in `qr-contracts.yml` (custodian) and in the lane workflow `.github/workflows/qr-prd11-perf.yml`. Every lane test is run three ways: flags `none` (must match `85aafcd0` behaviour), `tiers` (lane flags on, everything else stubbed), and `all` at checkpoints.

### 15.1 Unit (Vitest, `tests/qr/prd11/unit/**`, `tests/unit/contracts/impl/prd11-*`)

- `quality/*`: table equals C-27, override validation, probe parsing, class table fixtures (≥ 10 strings per §6.4 class row, plus the runner string, `"Apple GPU"` and software rasterizers), calibration thresholds, cache key stability, C-27 `source` mapping, render-scale controller, governor sequences (down, up, lock, oscillation bound ≤ 2 direction changes in 3,000 frames at 1.2× load), `createPerformanceGovernor` delegation.
- `FrameStats`: percentiles, wrap, scopes, disjoint discard, `fps()`/`legacyFps()` thresholds; C-28 conformance `real`.
- `batching/*`: content keys (incl. collision), plan grouping and `reasonsNotBatched`, per-frame colour refresh, pool add/remove/compact, draw-data row updates, multi-draw vs loop range equivalence on `MockRenderDevice`.
- `PostprocessGuard`: drop/throw/cpu-deterministic, depth-texture rule, readback count 0 on the counting mock.
- `RenderTargetPool`: zero creations after warm frames; C-28 conformance `real`.
- `ResourceRegistry` / lifecycle: rebuild completeness, restored emitted after rebuild; C-29 conformance `real`.
- Zero-allocation submission (measured on whatever C-07/C-02 implementation is active): `MockRenderDevice` frame of 1,000 items after 3 warm frames → `bufferCreates == 0`, `renderTargetsCreated == 0`; the stricter "no `new Map` in `ForwardPass`" check is reported per checkpoint (it measures lane 01's code).
- Engine (lane-11 files only): `rendererOptions.ts` parsing and URL params, deprecated option mappings, `experimental-webgpu` throws, `sceneKitBudgets.ts` renames with deprecated getters, `RootPerformanceQuality.ts` alias; the two explicitly owned legacy tests stay green unchanged.
- Phase 6: `UniformLayout` offsets, chunk manifest parity, WGSL snapshots.

### 15.2 Browser (Playwright, `tests/qr/prd11/browser/*.spec.ts`, macos-14)

- Standalone (gate merges): `fps-agreement.spec.ts` (lane + base scenes), `no-readback.spec.ts` (base scenes without non-fusable passes = 0; others as failing controls), `batching-pixel-identity.spec.ts` (18 base scenes + `prd11-draw-call-stress`, `A3D_QR_TIERS_BATCHING` on vs off, max per-pixel abs diff ≤ 2/255 and SSIM ≥ 0.999; float summation order may differ by 1 LSB), `tier-switch-hitch.spec.ts` (`prd11-tier-ladder`, High↔Low, no frame > 50 ms), `precompile-hitch.spec.ts` (lane scene with late nodes), `governor.spec.ts` (`prd11-tier-ladder` with `?loadMs=<n>` in the lane adapter only: render scale reaches the effective floor before the first feature step; remove load and recover to the starting tier within 1,500 frames), `context-restore.spec.ts` (base scenes 01, 12, 18 + lane scene), `vao-leak.spec.ts` (`liveBuffers` flat; `liveVertexArrays` once Q-01-1), C-28/C-29 browser conformance `real`.
- Report mode at checkpoints (never gate): the same specs over the 18 games (`no-readback`, `context-restore` on 4 games, Aura Clash `precompile-hitch`, game `fps-agreement` on Orbital Defense, Gravity Post, Deep Recovery).
- Phase 7: `webgpu-parity.spec.ts` cross-backend diff (Chrome on macos-14 with WebGPU enabled; skipped with a recorded reason if `navigator.gpu` is absent on the runner).

### 15.3 Perf captures

- Standalone (lane workflow): lane scenes `prd11-draw-call-stress`, `prd11-instancing-100k`, `prd11-tier-ladder` and base scenes 16-18, both engines, `--flags tiers`; gate per §17.3/§17.4 via `tools/perf-gate/`. Two consecutive green nightly runs are required for any standalone exit that cites perf.
- Integrated (checkpoint, lane 12 dispatch): 18-game run with forced Medium + `adaptive=0` (Q-14-10 / Q-12-2), viewports 1920x1080, 1280x720, 390x844; gate per §17.2 evaluated by `tools/perf-gate/` on the checkpoint report; two consecutive checkpoints required.

---

## 16. Acceptance: standalone and integrated

Two kinds of acceptance, per CONTRACTS §8 (row "11 GPU/tiers"):
- **Standalone acceptance (§16.0)** is provable by this lane alone, with today's renderer, its own flags and stubs for every other contract. It gates this lane's merges and the move of `A3D_QR_TIERS`, `_GOVERNOR`, `_BATCHING` to `standalone-accepted`. It is evidence of mechanism (measured telemetry, tiers, batching identity, restore), never a claim of visual or performance parity with three.js.
- **Integrated acceptance (§16.1)** needs other lanes' real implementations (and lane 14's route edits) to pass and is evaluated only at CONTRACTS §7 checkpoints with `qr_flags=all`. It never blocks a merge. It is the only route to `integrated-accepted` and to any public perf or visual claim. Conformance tests, engineering gates, metric thresholds and vision-only screening rounds never support a claim that Aura3D matches three.js (CONTRACTS §7 honesty rule).

### 16.0 Standalone acceptance (this lane alone; gates merges and `standalone-accepted`)

All on remote macos-14 CI in `qr-prd11-perf.yml`, flags `tiers`, with the flag-off sentinel identity check green:

| # | Criterion | Test / evidence | Contracts stubbed |
|---|---|---|---|
| S1 | Measured telemetry: `diagnostics().frame.fps` within 10% of an in-page rAF counter on `prd11-tier-ladder` at three loads and on base scenes 01, 12, 18; `fps` is `null` before 30 frames; no path yields 60 without 60-fps samples | `fps-agreement.spec.ts`, `frame-stats.test.ts` | C-01 (stub seam), C-31 |
| S2 | Counters are measured: every C-28 field changes exactly when its operation runs; static base scene 01 has 0 readbacks and 0 bufferCreates after warm-up; C-28 conformance `real` passes | `counters.test.ts`, `C-28-counters.spec.ts` | C-01 |
| S3 | Batching pixel identity: 18 base scenes and `prd11-draw-call-stress`, `A3D_QR_TIERS_BATCHING` on vs off: SSIM ≥ 0.999 and max per-channel diff ≤ 2/255 | `batching-pixel-identity.spec.ts` (V1) | C-07 (stub), C-02 (stub), C-04 |
| S4 | Draw reduction on today's renderer: `prd11-draw-call-stress` ≤ 110 draws (5,000 inputs in 24 geometry×roughness groups, 64-chunked; ≤ 20 with multi-draw once C-02 real), `prd11-instancing-100k` ≤ 1,600 draws while the C-07 stub chunks at 64 (≤ 2 with C-07 real), plan built once per structural change | `renderer.batching` section + capture report | C-07, C-02 |
| S5 | CPU: `planBatches` on 5,000 items ≤ 15 ms; `BVH.queryFrustum` on 10,000 ≤ 0.3 ms; `FrustumCuller.cull` zero allocations; CPU submit on `prd11-draw-call-stress` ≤ 4 ms p50 on the runner | §17.4 microbenchmarks, lane capture | — |
| S6 | Readback guard: pure-function tests; counting-mock plan with `volumetric-light` → 0 readbacks; `RenderTargetPool` 0 creations after frame 2 on the mock; on base scenes without non-fusable passes `readbacks === 0` every frame after ready | `postprocess-guard.test.ts`, `no-readback.spec.ts` | C-13, C-28 pool consumers |
| S7 | Governor: unit sequences of §14 Phase 4 exact; on `prd11-tier-ladder` with `?loadMs`, render scale reaches the effective floor before the first feature step, recovery to the starting tier within 1,500 frames, `lock()` → 0 steps | `quality-governor.test.ts`, `governor.spec.ts` | C-02 precompile (stub), C-05 |
| S8 | Tier detection: every fixture string maps to its tier and confidence; the macos-14 runner (`Apple Paravirtual device`) classifies Low with `source: "classified"`; a Windows SwiftShader/WARP smoke run classifies Low; URL/explicit overrides win | `device-classes.test.ts`, probe log artifact, `windows-latest` smoke in the lane workflow | — |
| S9 | No hitch from tier changes: High↔Low on `prd11-tier-ladder` has no frame > 50 ms; `precompile({ include })` leaves `programsCompiledSinceReady === 0` on the lane scene | `tier-switch-hitch.spec.ts`, `precompile-hitch.spec.ts` | C-02 (stub cache), C-28 `compileAsync` (own) |
| S10 | WebGPU freeze: `rg -n "productProp\|u_productColorSmoothing\|rasterizeDraw\|colorPixels" packages/rendering/src/WebGPUDevice.ts` empty; WGSL-missing and sync-readback throws tested; `docs/rendering/webgpu-*.md` carry the status line; `webgpu-smoke` green (non-gating) | `wgsl-missing.test.ts`, rg check in the workflow | C-29 |
| S11 | Context restore: `loseContext()`/`restoreContext()` on base scenes 01, 12, 18 and `prd11-instancing-100k` resumes within 2 s with SSIM ≥ 0.98 vs pre-loss; `onDeviceRestored` fires after `rebuild` resolves; C-29 conformance `real` | `context-restore.spec.ts`, `C-29-context-loss.spec.ts` | C-02 precompile, Q-01-1 absent (eager rebuild) |
| S12 | Bundle: lane additions ≤ 19 KB gzip on the critical path, ≤ 10 KB net of deletions, measured with `tools/bundle-size --splitting` | `evidence/prd-11/<phase>/bundle.json` | — |

### 16.1 Integrated acceptance (checkpoints only; never blocks)

| # | Criterion (CONTRACTS §8 row 11) | Needs (contract / request) | First checkpoint it can pass |
|---|---|---|---|
| I1 | All 18 games: engine `frame.fps` agrees with harness fps within 10%; every capture run contains `engineFrame`; `readbacks === 0` after ready on every game | Q-12-1, Q-15-1; Q-03-1/Q-03-2, Q-02-1 for readbacks | IC-1 (agreement), later for readbacks |
| I2 | §9.3 draw targets on the six worst games; VAO/buffer counts flat over 10,000 frames on base 16 and `prd11-instancing-100k` | C-07 real, C-02 real (multi-draw), Q-14-1/-6/-7, Q-15-2 | IC-2 onward |
| I3 | Deep Recovery 1080p p50 ≤ 50 ms (from 1,917 ms), then ≤ 33 ms with batching; V7 | Q-03-1 or Q-03-2 | first checkpoint after either lands |
| I4 | §17.2 runner gate for all 18 games, two consecutive checkpoints; no >15% p50 regression on passing games; §17.3 benchmark perf gate | all engine lanes' real implementations, Q-14-* | G-PANEL IC-4 onward |
| I5 | With `adaptive` on, the governor holds p50 ≤ 33 ms on Patrol Wing, Turbo Drift and Gravity Post; V8 | C-05 real DPR application, lanes 02/03/07 honouring C-27 rows | IC-4 |
| I6 | Context loss restores rendering on Courier Rush, Aura Clash, Turbo Drift, Gravity Post (≤ 2 s, SSIM ≥ 0.98) | Q-15-3, Q-01-1, Q-14-7 | IC-2 onward |
| I7 | V2-V11 below | as listed per row | G-PANEL rounds |

Visual rows (perf work must not buy speed with pixels, and tiers must look like tiers). Every row needs vision-model review (claude-opus-5.5 via Kiro Prism, same rubric as research/21 and research/23, C-32 schema) plus human owner sign-off for the rows marked H; acceptance only on G-PANEL rounds (2 humans + 1 vision model, median of record).

| # | Scenes / games | Reference | Criterion | Threshold | Review |
|---|---|---|---|---|---|
| V1 (= S3, standalone) | Base scenes 01-18 + `prd11-draw-call-stress`, batched vs batching off | Aura unbatched, same run | Pixel identity | SSIM ≥ 0.999, max per-channel diff ≤ 2/255 | automated |
| V2 | Base 16-instancing, `prd11-instancing-100k` | three.js r185 same scene (`benchmarks/quality-rebuild/three/`) | Instance field extent, spacing, rotation, per-instance colour match | Automated: the bounding box of instance-coloured pixels (HSL hue 0.50-0.72, saturation ≥ 0.25, matching the `instancingGrid` palette in `benchmarks/quality-rebuild/shared/procedural.ts:41`) has width and height within ±5% of three.js and centroid within 2% of frame width; vision score ≥ three.js − 0.5. Today's Aura grid (30% of authored extent) fails the automated check; passing needs the R18 fix (Q-15-2) | automated + vision |
| V3 | `prd11-draw-call-stress` | three.js r185 `BatchedMesh` version | Same composition and shading; batching does not flatten material variety | vision score ≥ three.js − 0.5; automated (standalone part, gates merges): count of distinct (colour, roughness) clusters in the frame (k-means on lit pixels, k = 48) ≥ 40 of the 48 authored combinations (12 colours × 4 roughness) | automated + vision |
| V4 | Benchmark 01, 06, 13, 18 at deviceScaleFactor 2, High tier | three.js r185 at `setPixelRatio(2)` | Edge sharpness, no shimmer/stair-stepping on thin lines | anti_aliasing category ≥ three.js − 0.5 | vision + H |
| V5 | Benchmark 01-18 at each tier (Low, Medium, High, Ultra) | Aura High tier | Low still reads correctly (shadows present, materials distinguishable); Ultra ≥ High | Low overall ≥ High − 1.5; Medium ≥ High − 0.75; Ultra ≥ High; no category at Low drops to ≤ 2; automated: Low's shadow-region mean luminance in benchmark 12 is ≤ 0.8 × the lit-region mean (shadows not dropped) | automated + vision |
| V6 | 18 games, `03-mid` + `04-action` shots, forced Medium | Per-game category scores in research/21, or lane 14's accepted baseline in `evidence/prd-14/baseline.json` once that file exists | Perf changes do not lower visual categories | no category drops > 0.5 vs the reference for that game, scored in the same run against the reference image re-judged with the same model and prompt (pairwise, to remove judge drift) | vision + H |
| V7 | Deep Recovery `03-mid` / `04-action` after Phase 2 | research/21 Deep Recovery scores (postprocessing 3, atmospheric_effects 1.5) | Water column still reads as underwater haze with analytic fog | postprocessing ≥ 3 and atmospheric_effects ≥ 1.5; automated: over the 60-frame filmstrip, p95 interval ≤ 50 ms and mean absolute frame-to-frame luma change > 0 for ≥ 55 of 59 pairs (the image actually moves) | automated + vision + H |
| V8 | 3 games (Patrol Wing, Turbo Drift, Gravity Post) with render scale forced to the Medium effective floor via `app.quality.forceRenderScale("floor")` from the harness (through `__AURA3D_LIVE_APPS__`) | same game, same frame, render scale 1 | Degradation is graceful: softer, not broken | overall vision score ≥ scale-1 score − 1.0; automated: SSIM of the floor-scale frame vs scale-1 frame, both downsampled to 50%, ≥ 0.90 | automated + vision |
| V9 | Mobile 390x844 DPR 3 emulated, Medium tier, 18 games | the current capture (`evidence/games/<game>/mobile-390x844__03-mid`) at 390x844 backing | Sharper than the 1/9-pixel capture | Automated: canvas backing store = 585 × 1266 (1.5 × CSS) for all 18 games (today 390 × 844); vision pairwise forced choice "which image is sharper" (new vs old, order randomised) picks new for ≥ 16 of 18 games. `mobile_presentation` is not used: it scores UI layout, which this PRD does not change | automated + vision + H |
| V10 (Phase 7) | Benchmark 01-18, Aura WebGPU vs Aura WebGL2 | Aura WebGL2 same run | Backend equivalence | ΔE2000 mean ≤ 1.0, p99 ≤ 5; SSIM ≥ 0.98; vision "no visible difference" | automated + vision |
| V11 (Phase 8) | Benchmark 14-particles at 200k on Ultra | three.js r185 same count (WebGPU `SpriteNodeMaterial` or `Points`) | Density, additive energy, depth compositing | vision score ≥ three.js | vision + H |

Vision review inputs are full-resolution PNG plus a 1100 px JPEG (research/21 method). If the image cannot be decoded by the reviewer, the row fails; pixel-stat fallbacks (research/22) do not count as visual acceptance.

---

## 17. Performance budgets

### 17.1 Per-tier budgets on target hardware classes

Budgets are per frame at the tier's default DPR and render scale 1, measured with GPU timer queries where available. CPU budget is the engine's share (`cpuSubmitMs` + engine frame work); game logic gets a separate 4 ms. Memory is GPU-resident (textures + render targets + buffers, from `DeviceCounters`) plus JS heap. Bundle is gzip of the root critical path with code splitting enabled; PRD 15 owns the absolute core budget (today 575,343 B gzip, `BUNDLE_SIZES.md` via research/13:547). This PRD bounds its own additions and the lazy chunks per tier.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Hardware class (reference) | Intel UHD 620; Adreno 610-618, Mali-G52/G76; iPhone XR/11 | Apple M1/M2 base; Intel Iris Xe; iPhone 12-15; Adreno 650-740 | M1-M4 Pro, M1/M2 Max; RTX 3060 laptop; RX 6600 | RTX 4070+ desktop; M3/M4 Max |
| Resolution | DPR ≤ 1 | DPR ≤ 1.5 | DPR ≤ 2 | DPR ≤ 3, ≤ 8.3 MP |
| Target | 30 fps mobile / 60 desktop | 60 fps | 60 fps | 60 fps (120 with `"display"`) |
| GPU ms (p50 / p95) | 28 / 33 mobile; 14 / 16.7 desktop | 12 / 16 | 12 / 16 | 12 / 16 (6.5 / 8 at 120 Hz) |
| Engine CPU ms (p50 / p95) | 6 / 9 | 5 / 8 | 5 / 8 | 5 / 8 |
| Draw calls (after batching, incl. shadow) | ≤ 150 | ≤ 300 | ≤ 600 | ≤ 1,500 |
| Triangles submitted | ≤ 300k | ≤ 1M | ≤ 3M | ≤ 8M |
| Live particles (C-27 `particleBudget`) | 2,000 | 10,000 | 50,000 | 100,000 (200,000 with WebGPU compute, R11) |
| GPU memory | ≤ 256 MB | ≤ 512 MB | ≤ 1 GB | ≤ 2 GB |
| JS heap at ready | ≤ 150 MB | ≤ 250 MB | ≤ 350 MB | ≤ 500 MB |
| Shader compile before first interactive frame | ≤ 1.5 s | ≤ 1.0 s | ≤ 1.0 s | ≤ 1.0 s |
| Compile stalls after ready | 0 frames > 50 ms from compile | same | same | same |
| Bundle added by this PRD (critical path) | ≤ 19 KB gzip total, itemised from §6.11 (tiers + resolver 3, governor 2, telemetry 2, batching 6 = R4 2 + R5 4, registry 3, warm-up 1, BVH/culler 2), measured by `tools/bundle-size --splitting` (lane-11 tool; the current harness re-inlines dynamic imports, `ProductionRuntimeRenderer.ts:61-66`; the flag is a Phase 0 task, root script alias by Q-15-6); net of removed WebGPU façades and CPU post kernels it must be ≤ 10 KB | same | same | same |
| Lazy chunks loaded at this tier | none | SAO (PRD 03) | GTAO, SSR, froxel fog | + temporal passes; WebGPU device chunk ≤ 120 KB gzip only if selected |
| Mobile | primary mobile tier | flagship phones | not selected on phones by auto | never on phones |

Mobile thermal rule: on `mobile === true`, the governor uses `targetFrameMs` 33.3 unless the app sets `targetFrameRate: 60`, and steps down after 120 frames instead of 300.

### 17.2 Runner gate (macos-14, Apple Paravirtual GPU via ANGLE Metal, 3 vCPU; integrated, I4)

This gate is evaluated on checkpoint captures only (it measures every engine lane and lane 14's routes together); this lane's own workflow applies the same thresholds to lane scenes as an early signal. This is the only GPU environment available in CI today. It is far below the Low hardware class, so the gate is relative to what Orbital Defense and Vault Breakers already achieve on it (59.6 / 57.4 fps at 1080p, `report.slim.json`). Games run forced Medium settings with `adaptive=0`. Desktop viewports have DPR 1 on the runner; the emulated 390x844 DPR-3 viewport renders at Medium's 1.5 cap.

| Viewport | p50 interval | p95 interval | p99 | Readbacks | Draws |
|---|---|---|---|---|---|
| 1280x720 | ≤ 20 ms | ≤ 34 ms | ≤ 50 ms | 0 | ≤ 300 |
| 1920x1080 | ≤ 33 ms | ≤ 50 ms | ≤ 84 ms | 0 | ≤ 300 |
| 390x844 (DPR 3 emulated, backing at Medium DPR 1.5) | ≤ 33 ms | ≤ 50 ms | ≤ 84 ms | 0 | ≤ 300 |

All 18 games must pass, for two consecutive runs. A game that already passes must not regress by more than 15% p50. Engine `frame.fps` must agree with harness fps within 10%.

### 17.3 Benchmark perf gate (runner; base scenes integrated, lane scenes standalone)

| Scene | Aura p50 vs three.js r185 p50, same runner | Draws |
|---|---|---|
| 16-instancing (10k) | ≤ 1.25× | ≤ 2 |
| 17-large-environment (576 buildings) | ≤ 1.25× | ≤ 100 (three.js reports 2,395; Aura 1,135 today) |
| 18-game-scene | ≤ 1.25× | ≤ 40 |
| `prd11-draw-call-stress` (5,000; standalone) | ≤ 1.5× three.js `BatchedMesh` | ≤ 20 with multi-draw; ≤ 50 loop fallback (generated path); ≤ 110 on the legacy path (S4) |
| `prd11-instancing-100k` (standalone for draws; timing integrated) | ≤ 1.25× | ≤ 2 with C-07 real; ≤ 1,600 with the stub |

### 17.4 CPU microbenchmarks (Node, runner)

- `ForwardPass` + `MockRenderDevice`, 1,000 items, 3 warm frames then 300 measured: p50 ≤ 2 ms, zero buffer/target creations (measures lane 01's submission core plus `forward/DrawSubmit.ts`; reported per checkpoint, gates this lane only for the `DrawSubmit.ts` share).
- `planBatches` on 5,000 items: ≤ 15 ms (plan rebuild only, never per frame).
- `BVH.queryFrustum` on 10,000 items: ≤ 0.3 ms.
- `QualityGovernor.sample`: ≤ 0.01 ms; `FrameStats.end`: ≤ 0.02 ms; per-frame batch colour refresh on 5,000 instances: ≤ 0.3 ms.

---

## 18. Browser coverage

| Browser | Backend | Coverage | CI |
|---|---|---|---|
| Chromium (Chrome/Edge) on macOS | WebGL2 via ANGLE Metal | Full: standalone perf and identity gates on lane scenes; integrated perf and visual gates at checkpoints | macos-14 (`qr-prd11-perf.yml`; checkpoints via `quality-rebuild-capture.yml`) |
| WebKit (Safari engine) | WebGL2 | Functional + visual (V1, V5, V6); perf recorded, not gated (WebKit in Playwright is not Safari's shipping GPU process configuration) | Playwright `webkit` project in `qr-prd11-perf.yml` on macos-14 |
| Firefox | WebGL2 | Functional + visual; perf recorded, not gated; `gl.RENDERER` sanitized-real path of the probe | Playwright `firefox` project in `qr-prd11-perf.yml` on macos-14 |
| Chromium on Windows / Linux runners | WebGL2 via SwiftShader/WARP (no GPU) | Tier detection must return Low with `source: "classified"` from the hard-floor rule; functional smoke only | `windows-latest` job in `qr-prd11-perf.yml` on 2 lane scenes (games via Q-12-3) |
| Any browser with `navigator.gpu` | WebGPU (Phase 7+, conditional) | V10 cross-backend diff; `auto` selection rules | macos-14 Chrome with WebGPU if adapter is available; otherwise job records "adapter unavailable" and the WebGPU phase exit cannot be claimed |

Feature availability (`WEBGL_multi_draw`, `KHR_parallel_shader_compile`, `EXT_disjoint_timer_query_webgl2`, unmasked renderer string) differs between browsers and drivers and is detected at runtime; every feature has the fallback listed in §6.11. Each CI job logs the `DeviceProbe` it saw so coverage claims name the actual capability set.

---

## 19. Mobile coverage

- **What CI can prove today (standalone):** tier decision and backing-store size at 390x844 DPR 3 (Playwright emulation on the macos-14 GPU) on lane scenes, with `(pointer: coarse)` → C-27 stub `"medium"` and the resolver's `mobile === true` path. It cannot prove mobile GPU frame time or thermal behaviour.
- **Real-device lane (integrated; required for any mobile perf claim):** AWS Device Farm (via the `auraone-production-operator` profile and the gated remote-run pattern) running Chrome on 2 Android devices (one Adreno 6xx Low-class, one Adreno 7xx Medium-class) and Safari on 2 iPhones (iPhone 11 Low-class, iPhone 14/15 Medium-class). Each device runs the 18 games for 60 s at `quality: "auto"` and records `diagnostics().frame`, tier decision and governor steps; the lane scenes run first, so the lane can validate its mechanism on devices before the games are rebuilt. Until this lane runs, mobile budgets in §17.1 are labelled "unverified" in every report and README, and no mobile performance claim is made.
- **Mobile acceptance:** auto-detection lands on Low or Medium on all four devices; p50 ≤ 33.3 ms after 60 s (thermal); no governor oscillation (≤ 4 direction changes per minute); V9 passes on device screenshots, not only emulated ones.
- **Context loss:** run the restore test on one Android device (backgrounding the tab for 60 s is the realistic trigger).

---

## 20. Screenshots and evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd-11/<phase>/` (standalone, from `qr-prd11-perf.yml`) and `…/evidence/prd-11/checkpoints/IC-<k>/` (integrated, copied from the lane 12 checkpoint record), produced only by remote workflows:

- Standalone: lane `report.json` with `frame` per scene and flag set, probe log, `perf-gate.json` from `tools/perf-gate/` (every budget row with measured value, threshold, pass/fail), pixel-identity diffs (S3), `renderer.batching` reports (S4), restore pre/post screenshots with SSIM (S11), `bundle.json` (S12).
- Integrated: checkpoint game reports with `runs[].fps`, `runs[].engineFrame`, `fpsAgreement`, tier decision, governor log, readbacks, draw/instance counts, heap, GPU memory.
- Benchmark report with `ReadyPayloadV2.frameTiming` for base scenes 16-18 and the lane scenes, and side-by-side JPEGs for base 16, `prd11-draw-call-stress`, `prd11-instancing-100k` (V2, V3).
- Per-tier contact sheets (Low/Medium/High/Ultra) for benchmark 01-18 (V5) and 6 games (Deep Recovery, Courier Rush, Gravity Post, Turbo Drift, Aura Clash, Patrol Wing).
- DPR 2 crops of benchmark 01/06/13/18 next to three.js at DPR 2 (V4).
- Deep Recovery: 60-frame filmstrip before and after Phase 2 (V7).
- Context restore: pre-loss and post-restore screenshots with SSIM value (S11 lane scenes; I6 games).
- Vision review markdown for every V-row, with model id and prompt, alongside the images reviewed.
- WebGPU (Phase 7): cross-backend diff images (`diff.png` heatmap) and ΔE2000/SSIM table.
- A `CLAIMS.md` line per shipped claim, each linking to the report entry that proves it. Claims without a link are deleted.

---

## 21. Completion criteria

This PRD has two completion levels, both on evidence produced by remote workflows.

**Lane complete (standalone; under this lane's control alone):**
1. S1-S12 (§16.0) pass in `qr-prd11-perf.yml` for two consecutive nightly runs; C-27/C-28/C-29 conformance passes for `real`; flag-off sentinel identity green.
2. `A3D_QR_TIERS`, `A3D_QR_TIERS_GOVERNOR`, `A3D_QR_TIERS_BATCHING` are in `standalone-accepted` (CONTRACTS §5.3).
3. WebGPU Phase 1 freeze complete in lane-11 paths; no lane-11 doc, route name or diagnostic claims WebGPU rendering for games; F-11-02 published.
4. `qualityProfile` / `performanceQuality` deprecated with mappings in lane-11 files; the two owned legacy tests green.
5. Every §12.3 request and CCR is filed with exact patch text, and each one's status is listed in the latest checkpoint report.

**Program complete (integrated; evaluated at G-PANEL checkpoints, never a merge gate):**
1. I1-I7 (§16.1) pass: all 18 games pass the §17.2 runner gate for two consecutive checkpoints (incl. Deep Recovery, Courier Rush, Gravity Post); engine fps agrees with harness fps within 10%; zero CPU readbacks and zero render-target creations after ready across all 18 games; VAO/buffer counts flat over 10,000 frames on base 16 and `prd11-instancing-100k`; §17.3 passes; V2-V9 pass with the listed review; context loss restores on the 4 test games.
2. `diagnosticsState.fps || 60` no longer exists (Q-15-1), and the flags reach `integrated-accepted`, then `default-on` after two clean checkpoints.
3. WebGPU: either G-WGPU was reviewed at a G-PANEL checkpoint and recorded go/no-go, or Phases 6-8 are complete with V10 (and V11 for Phase 8) passing.
4. Mobile: either the real-device lane has run with the §19 acceptance met, or every mobile perf number is labelled "unverified" in reports and docs.
5. The owner, looking at the shipped games on a HiDPI laptop and a phone, judges them smooth and sharp. Counters alone do not meet this criterion.

---

## 22. Rollback considerations

- Every behaviour change is behind a lane-11 flag; turning `A3D_QR_TIERS*` / `A3D_QR_WEBGPU` off (`?a3d-qr=-tiers`, `A3D_QR=-tiers`) restores `85aafcd0` behaviour without a revert. Each phase is also a separate PR series; revert by phase. Phases 0 and 1 have no runtime behaviour risk for games (games never used WebGPU).
- Batching: `A3D_QR_TIERS_BATCHING` off, `batching: "off"` per app, `batch: false` per node (once Q-15-2/CCR-11-3 land), and a kill switch `globalThis.__AURA3D_DISABLE_BATCHING__ = true` read at plan time in `renderer/CullingBatching.ts` (documented for incident use, removed after two releases).
- Multi-draw: auto-disabled when `WEBGL_multi_draw` is absent; kill switch `__AURA3D_DISABLE_MULTIDRAW__` forces the loop fallback if a driver bug appears.
- Tiers: `quality: "medium"` + `adaptive: false` reproduces a fixed configuration; deleting the localStorage key resets detection; `A3D_QR_TIERS` off returns every consumer to the C-27 stub decision.
- No-readback guard: in production it drops passes rather than throwing, so a missed CPU pass degrades visuals, not availability. Rolling back means re-allowing `execution: "cpu-deterministic"` per app, which is permitted only for debugging, never for a shipped route; or turning `A3D_QR_TIERS` off, which makes lane 03's wiring (Q-03-1) a no-op.
- WebGPU deletions: git revert restores files; the deleted route redirects for one release.
- Context restore: if rebuild fails, `onDeviceLost` overlay offers reload (routes that adopt it, Q-14-7); the previous behaviour (black canvas) is never restored silently while `A3D_QR_TIERS` is on.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Runner GPU too weak for Medium settings once lanes 02/03 enable cascades, GTAO and froxels | Medium | Gate fails for reasons unrelated to waste | Gate is relative to Orbital Defense/Vault Breakers; if they fall below 60 at a checkpoint with lanes 02/03 real, re-baseline thresholds from them with the change recorded; add a real-GPU runner (self-hosted or cloud GPU) through the provisioning scripts |
| Tier misclassification (masked renderer strings, new GPUs) | High | Wrong default quality | Calibration frames + governor correct it; class table versioned and updated from capture logs |
| Governor oscillation or visible popping when features step | Medium | Distracting quality changes | Hysteresis, feature-by-feature steps, warm-up of next-lower keys, lock during capture; V8 review |
| Dedupe breaks per-node material mutation in existing games | Medium | Wrong colours or shared edits | Copy-on-write; migration scan script; per-node `batch: false`; V1 pixel identity |
| Multi-draw driver bugs (ANGLE backends) | Low-medium | Corrupt draws on some devices | Loop fallback, kill switch, pixel-identity test per browser job |
| Transparent sorting changes from batching | Low | Halos, wrong overlap | Transparent items are never instanced or multi-drawn (passthrough, §11) |
| WebGPU work restarts before WebGL2 path is fixed | Medium | Repeats the sunk-cost pattern | G-WGPU gate is a written decision with evidence links; Phase 6 tasks blocked in tracker until recorded |
| WGSL chunks drift from GLSL | Medium (Phase 6+) | Backend visual divergence | Manifest parity test, naga validation, V10 cross-backend diff in the same CI run |
| Mobile claims made without real devices | High | Repeats fabricated-evidence pattern | §19 "unverified" labelling rule; program completion criterion 4 |
| Lane 15 adopts three.js `WebGPURenderer` | Unknown | Phases 6-8 wasted if started | G-WGPU item 4 reads lane 15's architecture record at the checkpoint; Phases 6-8 are conditional scope, not part of lane completion |
| Dropping the CPU volumetric pass makes Deep Recovery look flatter while the C-21 GPU volumetric pass is inactive | High | Temporary visual loss | Accepted: 0.5 fps is unplayable; V7 floor; lane 07's GPU fog is its own lane deliverable |
| Requests to other lanes sit unresolved | Medium | Integrated rows (I1-I6) cannot pass | Every lane-11 mechanism is proven standalone on lane scenes; requests carry exact patch text; unresolved requests are listed in every checkpoint report (CONTRACTS §6.5) and escalated after 2 working days |
| Content-key dedupe merges items that are not pixel-identical (vertex colours, float rounding) | Low-medium | Wrong colours | Merge only without vertex colours; S3 pixel identity on 18 base scenes; full-array compare on hash collision |
| CCR-11-1..5 rejected | Low | Richer data or features unavailable | Each CCR has a listed fallback (§12.1); none blocks standalone acceptance |

---

## 24. Explicitly out of scope

- Shadow algorithms, cascade fitting, PCF/PCSS implementation (lane 02, C-11); this lane only sets per-tier parameters in C-27.
- Post kernels: GTAO, SSR, bloom, TAA, SMAA implementations and post execution wiring (lane 03, C-13).
- Particle simulation, VFX authoring and GPU volumetric fog (lane 07, C-20/C-21); this lane sets budgets and the WebGPU compute decision.
- The program generator, UBOs, uniform cache, `InstanceBuffer`, VAO fix, blend modes, DPR default and `ResolutionGovernor` implementation (lane 01, C-02/C-04/C-05/C-07/C-08); this lane measures them.
- Edits to game routes and `games.json` (lane 14), shared game runtime APIs (lane 09), templates and skills (lane 13).
- Package consolidation, barrels, bundle core budget, three.js adoption decision, `agent-api/index.ts` and the scene compiler (lane 15).
- Occlusion culling (hardware occlusion queries or Hi-Z), GPU-driven culling, indirect draws on WebGL2, deferred or visibility-buffer rendering, OffscreenCanvas/worker rendering, WebXR, ray tracing. Revisit after Phase 8 with measured need.
- Real-device lab procurement beyond the AWS Device Farm lane described in §19.

