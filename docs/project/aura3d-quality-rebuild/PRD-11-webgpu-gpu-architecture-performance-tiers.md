# PRD 11: WebGPU, GPU Architecture and Performance Tiers

Program: Aura3D visual-quality autopsy and rebuild. Branch of record: `aura3d-quality-rebuild/audit` (audit commit `c08d8acb`, evidence run GH Actions `37289688772`, macos-14, ANGLE Metal, Apple Paravirtual GPU).

Final gate: the shipped games run smoothly and look competitive at the resolution the device can afford. Passing tests, 200 routes, non-blank screenshots, green parity matrices and engine-reported fps do not count as meeting this PRD. Frame time is measured by the harness from `requestAnimationFrame` intervals and GPU timer queries, never from the engine's own counter (that counter is constant, see §2.6).

Research inputs: research/07 (WebGPU, GPU, perf), research/02 (frame trace), research/13 (package architecture), research/17-g2/g5 (Courier, Gravity Post, Deep Recovery), research/19 (claim verification), research/20 (non-visual scorecards, perf), research/21 (authoritative vision judgment of games), research/22-23 (benchmark judgments), `evidence/games/report.slim.json`, `evidence/benchmark/report.json`.

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

3. **Resolution is chosen for CI determinism, not for the image or the device.** `safe-basic` hard-codes `pixelRatio: 1` (`index.ts:4256`) and wins over `devicePixelRatio` (`index.ts:11133`). The mobile capture at DPR 3 rendered a 390x844 backing store for a 390x844 viewport: 1/9 of native pixels (`report.slim.json`, all games' `mobile-390x844` runs; vision judge "visibly soft or blurry, consistent with a low render scale", research/21:1720,1741). There is no tier system and no frame-time governor. The DPR default itself is fixed in PRD 01 §6.9; this PRD supplies the tiers and governor that make raising it affordable.

4. **WebGPU is a large sunk cost that adds zero pixels.** No game selects it: root `createAuraApp` hard-codes `backend: "webgl2"` (`index.ts:13590`). The WebGPU device is a regex lookup from GLSL marker strings to five hand-written WGSL shaders, with silent flat-colour fallback for everything else, a hard-coded light direction and `2.25` gain, Duck-specific albedo gates, a 4-instance cap, 8-bit shadow depth, one render pass and one submit per draw, an 8,208-byte uniform buffer allocated per draw, and a CPU software rasterizer running alongside the GPU (research/07 §2). If games were switched to it they would look worse.

5. **GPU architecture is immediate-mode WebGL1-style.** No UBOs, no uniform value cache, no `KHR_parallel_shader_compile`, no `WEBGL_multi_draw`, a per-frame VAO leak for instanced/coloured draws, 64-instance uniform arrays, per-frame regrouping that calls itself static batching, and exported `BVH` / `Octree` / `Batcher` / `FrustumCuller` / `LOD` with no engine call sites (research/07 §3). PRD 01 §6.7 fixes the per-draw submission core. This PRD adds the parts PRD 01 does not cover (multi-draw, cross-node batching, culling, telemetry, budgets, tiers) and owns the measured acceptance of the whole perf stack.

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

Façade and placeholder files: `production-runtime/backends/{webgpu,webgl2}/*.ts` (2-line descriptor holders), `production-runtime/backends/WebGPURendererBackend.ts:8-24` (wraps a report), `production-runtime/shaders/wgsl/pbr.wgsl` (outputs `abs(normal)`), `shaders/wgsl/skybox.wgsl` (constant colour), `webgpu/WebGPUPipelineCache.ts` (unused memoiser), `webgpu/WebGPUBuffer.ts` / `WebGPUTexture.ts` / `WebGPUCompute.ts` (re-exports).

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

### 2.5 Batching cannot merge root primitives

- `createProductionRuntimePrimitiveEntries` (`index.ts:14014-14017`) calls `createProductionPrimitiveResources(node)` per node, which calls `createProductionPrimitiveGeometry(node)` and `createProductionPrimitiveMaterial(node)` per node (`:14678-14692`). Every primitive owns a unique `Geometry` and a unique `PBRMaterial`.
- `applyRendererOwnedStaticBatching` keys batches on object identity: `staticBatchKey = geometryId:materialId:shadow` via `WeakMap` ids (`Renderer.ts:2399-2409`). With per-node resources the key is unique per node, so **root primitives never batch**. Each primitive is at least one forward draw plus one shadow draw.
- This is the draw-count source for Gravity Post (~330 primitive instances → 1,230-1,294 draws), Courier Rush (looped `primitives.*` in `apps/showcase-courier-rush/src/city.ts:76-161, 287-410, 490-496`; ~1,530 draws at title), Pulse Tunnel (105 primitive calls, ~250 draws), Rooftop Buckets, Bank Shot and Mech Hangar.
- When batching does apply, it regroups every frame from per-frame model matrices into 64-instance chunks and pushes them onto the leaking per-frame buffer path (`Renderer.ts:2361-2386`; research/07 §3.3).
- Instanced primitives have a geometry bug: `createProductionInstanceTransforms` (`index.ts:14747-14753`) omits `node.size`, so the node's size scale multiplies instance translations (benchmark 16-instancing: grid at 30% of authored extent; research/22 §16, confirmed by skeptic). PRD 01 §6.2 owns the `createModelMatrix` rule; this PRD owns the instancing test that proves it.

### 2.6 Telemetry

- `index.ts:12338`: `diagnosticsState.fps = diagnosticsState.fps || 60` in `renderFrame` (production path). The canvas-runtime path computes `Math.round(1000 / delta)` (`:11336`), but the production path overwrites `fps` with a sticky 60.
- `packages/rendering/src/RendererTiming.ts` (251 lines) has a real `EXT_disjoint_timer_query_webgl2` backend (`createWebGL2GpuTimingBackend`, `:164`) and a CPU fallback (`:134`). Nothing consumes it to adapt quality or report frame cost.
- `sceneKitPerformanceBudgets` (`index.ts:9681-9692`) carries `calibrationSource: "benchmark/runner/fps-calibration.mjs"` (`:9528`, `:9722`) on constants.
- The benchmark harness records `drawCalls` and `loadMs` per scene but no frame time (`evidence/benchmark/report.json` payload keys).
- The game capture harness (`tools/quality-rebuild-capture/capture-games.mjs`) measures its own rAF fps (`:417-436`) and already reads engine diagnostics through the live-app registry `globalThis.__AURA3D_LIVE_APPS__.all()` (`:371-380`), recording `d.fps` (the fake 60) next to it. Deployed games are captured from `productionOrigin` (`games.json`, `https://aura3d.auraone.ai`); undeployed ones from a local static build (`capture-games.mjs:878`). Any URL switch this PRD adds for capture must therefore work in production builds.
- `AuraDiagnostics.fps` is typed `number` (`index.ts:10379`). Existing tests that pin `fps: 60` as fixture data: `tests/unit/agent-api/devtools.test.ts:8,16`, `tests/unit/apps/aura-clash-arena-proof.test.ts:174`. Existing tests over the current quality/governor surfaces: `tests/unit/agent-api-root-performance-quality.test.ts`, `tests/unit/muse3jsparity-root-governor-contract.test.ts`.

### 2.7 Quality and resolution controls

- Profiles (`index.ts:4248-4308`, union type at `:1761`): `safe-basic` DPR 1, `production` 1.5, `cinematic` 1.5, `experimental-webgpu` 1 (`:4294-4308`); all `preserveDrawingBuffer: true`; `maxRecommendedDrawCalls` 180/260/320/220. Games that opt into `qualityProfile: "production"` therefore get a fixed DPR 1.5 regardless of device: Mech Hangar (`apps/showcase-mech-hangar/src/main.ts:705`), Vault Breakers (`apps/showcase-vault-breakers/src/main.ts:392`), Rooftop Buckets (`apps/showcase-rooftop-buckets/src/main.ts:743`, plus an explicit `pixelRatio` clamp to 1.75 at `:738`), Aura Clash (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1531`, explicit clamp to 1.75 at `:1522-1530`). Skyline Runner forces `pixelRatio: 0.7` (`apps/showcase-skyline-runner/src/main.ts:1879`). An explicit top-level `AuraCreateAppOptions.pixelRatio` (`index.ts:10798`) wins over the profile.
- `AuraPerformanceQuality { resolutionScale, particleScale, lodBias, shadowSize }` (`packages/engine/src/agent-api/RootRuntimeSupport.ts:66`, validated by `validateRootPerformanceQuality` immediately below it: `lodBias ∈ [1,8]`, `shadowSize` power of two in [256,4096]), stored in a `WeakMap` keyed by canvas, applied only if a caller sets it (`index.ts:11138`; method `setPerformanceQuality` at `:10700`). Only `showcase-turbo-drift-circuit` sets it, and only in visual-capture mode (`apps/showcase-turbo-drift-circuit/src/main.ts:2983-2994`).
- A second, independent governor exists: `createPerformanceGovernor` (`packages/engine/src/production-runtime/GameRenderPreset.ts:158`) steps `resolutionScale → particleScale → lodBias → shadowSize`. It is driven by `GameAppRuntime` when `performanceBudget` is set (`packages/engine/src/agent-api/GameAppRuntime.ts:126-129`) and used directly by the `animation-studio` and `character-controller` templates (`packages/create-aura3d/templates/animation-studio/src/scene-player.ts:647`, `character-controller/src/main.ts:38`). No shipped game sets `performanceBudget`. PRD 01 §6.9 already routes its resolution step through `ResolutionGovernor`; this PRD must make sure the remaining feature steps do not fight `QualityGovernor` (§6.5).
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
| `@aura3d/rendering` | Quality tier model, device probe, quality governor (on top of PRD 01 `ResolutionGovernor`), frame stats, multi-draw batching, cross-node static batching, BVH culling wiring, removal of CPU readback from production post, render-target pooling in post, context-restore resource rebuild, WebGPU freeze (Phase 1) and the replacement backend (Phase 6+) |
| `@aura3d/engine` | `createAuraApp` options (`quality`, `adaptive`, `backend`, `targetFrameRate`), `app.quality`, `app.diagnostics().frame`, fps fix, primitive geometry/material dedupe, removal of fabricated budget fields, deprecation of `qualityProfile` / `performanceQuality` |
| `@aura3d/effects` | Particle budget per tier (consumes PRD 07 pipeline); delete `WebGPUParticleBackend` round-trip path from production exports |
| `@aura3d/materials` | Delete `NodeMaterial.ts` (20-line data bag) or move to `experimental` with no README claim |
| `@aura3d/lean` | No new work; PRD 01 deletes `LeanWebGL2Device`. Tier APIs re-exported from engine |
| `apps/*` | 18 games: perf fixes in §9.6; WebGPU routes renamed/demoted (§6.2) |
| `tools/quality-rebuild-capture`, `benchmarks/quality-rebuild`, `.github/workflows/quality-rebuild-capture.yml` | Frame-time capture, perf gates, stress scenes (joint with PRD 12) |
| Docs and skills | `docs/rendering/webgpu-*.md`, `aura3d-performance` skill, `BUNDLE_SIZES.md` claims |

---

## 5. Affected files and directories

Modify:
- `packages/engine/src/agent-api/index.ts`: `AuraCreateAppRendererOptions` (`1781-1791`), `AuraRendererQualityProfileId` (`1761`), `rendererQualityProfiles` (`4248-4309`), `normalizeCreateAppRendererOptions` (`4315-4326`), `AuraDiagnostics` (`10377`), `AuraApp` (`10680`), `AuraCreateAppOptions` (`10773`), `createAuraApp` canvas sizing (`11126-11140`), diagnostics snapshot (`11678`), production `renderFrame` (`12317-12345`, fps at `12338`), `createProductionRuntimePostprocess` volumetric (`12806-12825`, spread at `12938`), root mount (`13586-13597`), `createProductionRuntimeRendererInput` (`13842`), `createProductionRuntimePrimitiveEntries` (`14014-14018`), `createProductionPrimitiveResources` (`14678-14720`), `createProductionInstanceTransforms` (`14747-14754`), `createProductionPrimitiveMaterial` (`14877`), `createProductionPrimitiveGeometry` (`14938`), `sceneKitPerformanceBudgets` (`9681-9722`, type field at `9528`), `collectParticleBudgetDiagnostics` (`8344-8358`), overlay (`18654`).
- `packages/engine/src/agent-api/RootRuntimeSupport.ts`: `AuraPerformanceQuality` (`66`) becomes a deprecated alias; `readRootDiagnosticSnapshot` (`57-60`) throttled by its caller.
- `packages/engine/src/production-runtime/GameRenderPreset.ts` (`createPerformanceGovernor`, `158`) and `packages/engine/src/agent-api/GameAppRuntime.ts` (`126-129`): feature steps delegate to `QualityGovernor` when the app's engine governor is active (§6.5).
- `packages/rendering/src/Renderer.ts`: `executePostprocess` (`977-1066`), `executePixelPostprocessPass` (`1245-1280`) and `...Async` (`1282-1320`), `canFuseLdrPostprocess` (`2111`), static batching (`2361-2409`), frustum culling (`2217-2258`), point-shadow readback (`1516-1603`, `1915-1931`; PRD 02 replaces the algorithm, this PRD forbids readback).
- `packages/rendering/src/ForwardPass.ts`: batched draw path, `DrawPacket` queue consumption (PRD 01 builds it).
- `packages/rendering/src/WebGL2Device.ts`: extension probe (`WEBGL_multi_draw`, `KHR_parallel_shader_compile`, `EXT_disjoint_timer_query_webgl2`, `WEBGL_debug_renderer_info`), context restore (`418-443`), resource registry used for rebuild.
- `packages/rendering/src/WebGL2StateCache.ts`: counters exported into `FrameStats`.
- `packages/rendering/src/RendererTiming.ts`: rolling percentiles, per-pass scopes.
- `packages/rendering/src/performance/BVH.ts`, `FrustumCuller.ts`: allocation-free API; wire into `Renderer`.
- `packages/rendering/src/RenderBackend.ts`, `production-runtime/ProductionRuntimeRenderer.ts`: backend option set during freeze.
- `packages/rendering/src/WebGPUDevice.ts`: Phase 1 removals; Phase 6 replacement.
- `tools/quality-rebuild-capture/capture-games.mjs`, `games.json`; `benchmarks/quality-rebuild/capture.mjs`, `shared/scenes.ts`, `aura3d/*.ts`, `three/*.ts`; `.github/workflows/quality-rebuild-capture.yml`.
- `apps/showcase-deep-recovery/src/main.ts`, `apps/showcase-courier-rush/src/{main,city}.ts`, `apps/showcase-gravity-post/src/main.ts`, `apps/showcase-blockfall-reactor/src/{main,reactor-scene}.ts`, `apps/showcase-skyline-runner/src/main.ts`, `apps/showcase-mech-hangar/src/main.ts`, `apps/showcase-vault-breakers/src/main.ts`, `apps/showcase-rooftop-buckets/src/main.ts`, `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`, `apps/showcase-neon-swarm/src/main.ts`, `apps/showcase-siege-golf/src/main.ts`, `apps/showcase-turbo-drift-circuit/src/main.ts` (coordinated with PRD 14, which owns content).
- `tools/agent-templates/index.ts`, `tools/production-runtime-template-readiness/index.ts`, `tools/production-runtime-package-surface-readiness/index.ts`: drop `production-webgpu-starter` from template listings.
- `tests/browser/context-loss-recovery.spec.ts`: extend for Phase 5; `tests/unit/agent-api/devtools.test.ts`, `tests/unit/agent-api-root-performance-quality.test.ts`, `tests/unit/muse3jsparity-root-governor-contract.test.ts`: update for measured fps and deprecations.

Create:
- `packages/rendering/src/quality/QualityTier.ts` (tier table, types), `quality/DeviceProbe.ts`, `quality/DeviceClasses.ts` (versioned renderer-string table), `quality/TierResolver.ts`, `quality/QualityGovernor.ts`, `quality/FrameStats.ts`.
- `packages/rendering/src/batching/BatchedGeometryPool.ts`, `batching/MultiDrawBatch.ts`, `batching/DrawDataTexture.ts`, `batching/StaticMergePlanner.ts`.
- `packages/rendering/src/resources/ResourceRegistry.ts` (rebuild on context restore), `resources/RenderTargetPool.ts`.
- `packages/rendering/src/program/UniformLayout.ts` (shared std140/WGSL layout description; PRD 01 creates `program/`).
- Phase 6+: `packages/rendering/src/webgpu/device/WebGPURenderDevice.ts`, `webgpu/device/PipelineCache.ts`, `webgpu/device/BindGroupLayouts.ts`, `webgpu/device/UniformRing.ts`, `webgpu/device/MipGenerator.ts`, `program/chunks/*.wgsl.ts`.
- `tools/perf-gate/` (budget evaluator over capture reports), `tests/unit/rendering/quality/*.test.ts`, `tests/unit/rendering/batching/*.test.ts`, `tests/browser/perf/*.spec.ts`, `tests/fixtures/quality/renderer-strings.json`, `scripts/migrations/prd11-batch-optout.mjs`.

Delete:
- Phase 1: `production-runtime/backends/webgpu/*.ts` (5 files, 2 lines each), `production-runtime/backends/webgl2/*.ts` (6 one-line/two-line re-exports, including `WebGL2StateCache.ts` which re-exports the real `packages/rendering/src/WebGL2StateCache.ts`; the real file stays), `production-runtime/backends/WebGPURendererBackend.ts`, `webgpu/WebGPUPipelineCache.ts`, `webgpu/WebGPUBuffer.ts`, `webgpu/WebGPUTexture.ts`, `webgpu/WebGPUCompute.ts` (re-export façades; update importers and the `index.ts:1167-1168` re-exports), `packages/materials/src/NodeMaterial.ts`, `productProp*` functions and `u_productColorSmoothing` in `WebGPUDevice.ts`, `rasterizeDraw` / `rasterizeTriangle` and `colorPixels` from the production WebGPU device (keep CPU raster only in `MockRenderDevice`). PRD 01 already deletes `shaders/wgsl/pbr.wgsl` and `skybox.wgsl`. `production-runtime/backends/RendererBackend.ts` and `WebGL2RendererBackend.ts` are deleted only if `rg -l "RendererBackend" packages tools apps` shows no importer other than the deleted façades; otherwise they stay and are listed in the Phase 1 PR description.
- Phase 2: production reachability of `executePixelPostprocessPass` (moved behind `execution: "cpu-deterministic"`).
- Phase 7 (only if G-WGPU passes): `packages/rendering/src/WebGPUDevice.ts` in favour of `webgpu/device/`.

---

## 6. Architecture proposal

### 6.1 Ownership split with PRD 01

PRD 01 §6.7-6.9 owns implementation of: `DrawPacket` pool, `RenderPipeline` cache, uniform last-value cache, UBOs `AuraFrame`/`AuraLights`, persistent `InstanceBuffer` + VAO-leak fix + buffer registry delete, static merge at mount via `MeshConsolidation`, blend modes, `ProgramWarmup` with `KHR_parallel_shader_compile`, DPR default `min(devicePixelRatio, tier.maxPixelRatio)`, `ResolutionGovernor` (render-scale only), `preserveDrawingBuffer: false` and `app.capture()`.

This PRD owns:
1. The **tier table** and its auto-detection (`tier.maxPixelRatio` and `tier.minRenderScale` are read by PRD 01's governor).
2. The **quality governor** that steps feature levels when render scale is already at its floor.
3. **Measured telemetry** (`FrameStats`, `app.diagnostics().frame`) and the fps fix.
4. **Cross-node batching**: primitive geometry/material dedupe so batch keys match, `WEBGL_multi_draw` batches for heterogeneous static geometry, BVH culling.
5. **No CPU readback in production frames**, render-target pooling in post, context-restore rebuild.
6. **Performance budgets** and the CI gates that enforce them on the 18 games and benchmark.
7. **WebGPU decision**, the Phase 1 freeze and the Phase 6+ replacement backend that consumes PRD 01's generator with a WGSL target.
8. **Measured acceptance of PRD 01's perf items**: the VAO-leak test, zero-allocation submission test, warm-up hitch gate. PRD 01 lands the code; this PRD's gates decide whether it worked.

### 6.2 WebGPU decision

**Decision: WebGL2 is the only shipping backend. WebGPU is frozen now and rebuilt later only behind gate G-WGPU.**

Reasoning from evidence:
- Zero of 18 games select WebGPU (`index.ts:13590`). Every visual and perf defect the owner sees is on WebGL2.
- The existing WebGPU device cannot be evolved. Its shader selection is a string lookup (`WebGPUDevice.ts:3179-3311`), its lighting is a different model from WebGL2, and its submission model is one pass and one submit per draw. Fixing it means replacing the shader source, binding model, submission model and CPU raster. Nothing structural survives except the post WGSL, TAA, async readback and device-loss plumbing.
- What WebGPU would add that WebGL2 cannot: compute (resident GPU particles in the scene pass, GPU culling, GPU skinning pre-pass), storage-buffer instancing with no attribute limits, indirect draws, render bundles, `createRenderPipelineAsync`, and timestamp queries. These are real, but they matter only after the WebGL2 path stops wasting 4-120x on CPU overhead and readback. PRD 07's GPU particles can run on WebGL2 via transform feedback or texture ping-pong at the tier budgets in §6.4; WebGPU raises the ceiling, it is not the floor.

Phase 1 freeze (immediate, no new WebGPU features):
- Delete Duck gates, `u_productColorSmoothing`, the CPU raster from the production device and the façade files (§5). Make sync `readPixels` and `readFloatPixels` on WebGPU throw `new RenderDeviceError("Synchronous readback is not supported on WebGPU; use readPixelsAsync", "WEBGPU_SYNC_READBACK_UNSUPPORTED")` (constructor is `(message, code, details?)`, `RenderDevice.ts:462-471`); evidence tools use `readPixelsAsync`.
- Make the marker regex fallback a hard error: any shader that has no WGSL (not `portable`, not `passthrough`, no matching marker) becomes `new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING", { marker: sources.marker })`, never flat colour. This makes the remaining probes honest without new work.
- Rename or demote: `apps/wow-webgpu-instancing` → delete (it does not instance: one `RenderItem` per cube built every frame, `src/main.ts:44-55`); `apps/webgpu-lab` → `apps/backend-availability-lab`; `templates/production-webgpu-starter` → remove from the template listings in `tools/agent-templates/index.ts` and the two `tools/production-runtime-*-readiness` tools (it is not in `packages/create-aura3d/templates/`); `apps/showcase-webgpu-particle-lab` → `apps/showcase-particle-lab`; `apps/wow-webgpu-product-viewer` → remove material clamps (`src/main.ts:51-66`), re-baseline evidence, or delete.
- Replace WebGPU claims in `docs/rendering/webgpu-current-architecture.md`, `webgpu-fallback.md`, `webgpu-hardware-matrix.md`, `webgpu-route-and-report-evidence.md`, package READMEs and skills with one status line: "WebGPU: experimental probe device; not used by any game; no visual parity claim."
- `ProductionRuntimeRenderer` keeps `"webgpu"` and `"auto"` internally but `createAuraApp` does not expose WebGPU until G-WGPU. `experimental-webgpu` profile removed from the public union.
- Freeze the 10 `tools/*webgpu*` audit tools and the 46 WebGPU browser specs: delete those that test removed behaviour (Duck route parity, sync pixel proof); keep triangle, render-target and async readback specs as smoke tests on a non-gating CI job.

Gate G-WGPU (all required before Phase 6 starts):
1. PRD 01 `ProgramGenerator` produces every lit, unlit, skinned, morph, instanced and depth program used by the 18 games and 18 benchmark scenes (no hand-written programs left).
2. All 18 games meet the macos-14 Medium-tier runner budget in §17 on WebGL2 for two consecutive capture runs.
3. PRD 07 has shipped the WebGL2 GPU particle path and documented a concrete workload it cannot reach at the High/Ultra budget (for example 200k particles with depth collision). That workload is the first WebGPU deliverable.
4. PRD 15 has not chosen to adopt three.js `WebGPURenderer` as the render core. If PRD 15 chooses adoption, Phases 6-8 of this PRD are cancelled and replaced by PRD 15's migration; Phases 1-5 still apply because they fix the shipping path.

Phase 6+ backend (if G-WGPU passes): a new `WebGPURenderDevice` implementing the same `RenderDevice` / `RenderState` / program contract as `WebGL2Device`, consuming generator output with `target: "wgsl"` (§8.4). Design rules:
- One command encoder per frame; one render pass per render target per frame, many draws.
- Pipelines from `createRenderPipelineAsync`, keyed on `(programKey, renderStateKey, vertexLayoutKey, colorFormats, depthFormat, sampleCount)`; warm-up compiles all pipelines the first frame needs before `app.ready`.
- Explicit bind group layouts: group 0 frame/view (uniform, dynamic offset per view), group 1 lights/shadows/environment, group 2 material (cached per material instance, rebuilt on texture change), group 3 object (uniform ring buffer, 256-byte aligned dynamic offsets).
- Per-object data in a persistent `UniformRing` (triple-buffered, `writeBuffer` once per frame for the dirty range). Instancing reads `array<mat4x4f>` from a storage buffer via `@builtin(instance_index)`; no instance cap.
- Full pipeline state: `cullMode`, `frontFace`, PRD 01 blend modes, 8 depth compare functions, `depth32float` (or `depth24plus`) shadow maps with `sampler_comparison`.
- GPU mip generation (`MipGenerator`, render-pass blit per level).
- Canvas MSAA via a multisampled colour target resolved into the swap-chain texture.
- No CPU raster; sync readback throws.
- Compute: `ResidentGPUParticleRenderer` moved into the scene pass (shared depth buffer), driven by PRD 07's particle API.

### 6.3 Quality tiers

One tier table drives DPR caps, governor ranges and feature levels for every subsystem. Owners of each feature implement the feature; this table is the contract they read.

| Setting | Low | Medium | High | Ultra | Read by |
|---|---|---|---|---|---|
| `maxPixelRatio` | 1 | 1.5 | 2 | 3 (backing ≤ 8.3 MP) | PRD 01 §6.9 |
| `minRenderScale` (of tier DPR; floor 1/DPR CSS rule from PRD 01) | 0.5 | 0.6 | 0.7 | 0.75 | PRD 01 governor |
| `targetFrameMs` (default; `targetFrameRate` option overrides) | 33.3 (mobile) / 16.7 (desktop) | 16.7 | 16.7 | 16.7 (8.3 at 120 Hz if `targetFrameRate: "display"`) | governor |
| Scene MSAA samples | 0 | 4 | 4 | 4 (1 when TAA) | PRD 01 HDR target |
| Post AA | FXAA | none (MSAA) | none (MSAA + PRD 01 specular AA) | TAA (PRD 03) with MSAA fallback when motion vectors unavailable | PRD 03 |
| Directional shadow map | 1024, 1 cascade | 2048, 2 cascades | 2048, 3 cascades | 4096, 4 cascades | PRD 02 |
| Shadow filter | hardware PCF 2x2 (1 tap `sampler2DShadow`) | PCF 3x3 (4 bilinear taps) | PCF 5x5 (9 taps) | PCF 5x5 + contact shadows | PRD 02 |
| Shadowed local lights | 0 | 1 spot | 2 spot or 1 point | 4 (any) | PRD 02 |
| Max lights shaded per pixel | 4 | 8 | 16 | 32 (clustered) | PRD 01 light buckets |
| AO | off | SAO half-res, 8 samples | GTAO half-res, 12 samples, bilateral upsample | GTAO full-res, 16 samples, temporal | PRD 03 |
| SSR | off | off | half-res, 32 steps | full-res, 64 steps, temporal | PRD 03 |
| Bloom mip levels | 3 (from half-res) | 5 | 6 | 6 + HDR threshold per PRD 03 | PRD 03 |
| Volumetric fog | analytic height fog only | analytic height fog | froxel 160x90x64 | froxel 240x135x128, temporal | PRD 07 |
| Particle budget (live, all emitters) | 2,000 | 10,000 | 50,000 | 200,000 (WebGPU compute if G-WGPU, else 100,000) | PRD 07 |
| Particle soft-depth fade | off | on | on | on | PRD 07 |
| LOD bias (multiplies screen-size thresholds) | 2.0 | 1.5 | 1.0 | 0.75 | `distanceLod`, PRD 10 |
| Primitive tessellation | half segments (PRD 01 §6.3) | full | full | full | PRD 01 |
| Max texture dimension | 1024 | 2048 | 4096 | 4096 | PRD 04 |
| Texture streaming budget (default `textureBudgetBytes`, today 256 MiB everywhere) | 128 MiB | 256 MiB | 512 MiB | 1 GiB | PRD 04 / `index.ts:1790` |
| Anisotropy | 2 | 4 | 8 | 16 | PRD 04 |
| Environment (PMREM) size | 128 | 256 | 512 | 1024 | PRD 02 |
| Draw budget (warning, not cap) | 150 | 300 | 600 | 1,500 | diagnostics |

Rules:
- Tier changes that alter generated code (cascade count, PCF taps) are part of the program feature key; PRD 01's warm-up precompiles the current tier and the next-lower tier so a governor step never compiles on the critical frame.
- Apps can override any field: `quality: { tier: "high", overrides: { ssr: "off" } }`.
- `"auto"` is the default. Explicit `pixelRatio` still wins (PRD 01).

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

### 6.5 Quality governor

PRD 01's `ResolutionGovernor` adjusts render scale (`sample(frameMs, gpuMs?) → renderScale`, 0.1 steps, down after 30 frames over `targetFrameMs · 1.1`, up after 120 frames under `targetFrameMs · 0.8`; PRD 01 §6.9). It exposes no "at floor" flag, so `QualityGovernor` derives it: `effectiveFloor = max(tier.minRenderScale, allowSubCssResolution ? 0 : 1 / devicePixelRatio_effective)` where `devicePixelRatio_effective` is the backing DPR in use, and "at floor" means the last returned scale ≤ `effectiveFloor + 1e-6`. `QualityGovernor` wraps it:
- If render scale has been at the effective floor for 300 consecutive frames (120 on `mobile === true`, §17.1) and p50 GPU ms (or interval ms when no timer) over the last 60 frames > `targetFrameMs · 1.1`, step one feature down in this order: SSR → AO → volumetric froxels → shadow cascades → shadow map size → bloom mips → particle budget → MSAA samples. "One step" sets that feature to the value the next-lower tier has for it in §6.3 (for example High SSR `half-res` → Medium `off`; High AO GTAO half-res → Medium SAO). A feature whose current value already equals the next-lower tier's value, or the `floor` tier's value, is skipped and the next feature in the order is stepped instead. Never a whole-tier jump.
- After a step the counter resets: the next down-step needs another 300 frames over threshold.
- Step back up in reverse order after 600 consecutive frames under `targetFrameMs · 0.7` with render scale at 1.
- Never steps during `app.capture()` or when `quality.lock()` is set. Evidence capture locks the tier so screenshots are reproducible.
- Every step emits `quality.onChange({ from, to, reason, frameMsP50 })` and a diagnostics entry.
- Single authority: when the engine governor is enabled (`adaptive` not false), `createPerformanceGovernor` (`GameRenderPreset.ts:158`) and `GameAppRuntime`'s `performanceBudget` loop (`GameAppRuntime.ts:126-129`) no longer step `particleScale`, `lodBias` or `shadowSize` themselves; they forward to `app.quality` overrides and report `delegated: true` in their snapshot. With `adaptive: false` they keep today's behaviour. Unit test: an app with both enabled produces one step per over-budget window, not two.

### 6.6 Batching and draw reduction (WebGL2)

Three layers, applied in order at scene mount and on structural scene change (not per frame):

1. **Resource dedupe (engine).** Primitive geometry is cached per `(primitive, segments)` (PRD 01 §6.3). Primitive materials are cached per `materialSpecKey(node.material)`: a stable hash of all fields that are not per-instance-colourable. Fields that differ only in `color`, `emissive`, `emissiveIntensity` and `opacity` (when opaque) collapse into one material plus per-instance colour/emissive attributes. Runtime handles that mutate a node's material (`setColor`, `setEmissive`) write the instance attribute; handles that change other material fields get a copy-on-write private material.
2. **Instancing by key (renderer).** Items sharing `(geometryId, materialId, castShadow, blendMode)` and flagged static or dynamic-transform-only become one instanced item backed by PRD 01's persistent `InstanceBuffer`. Dynamic transforms update the instance buffer range with `bufferSubData` only for changed instances (per-node version counters from PRD 01 §6.2). No 64-instance chunks; no per-frame regroup.
3. **Multi-draw (renderer).** Remaining static items with the same program and render state but different geometry (for example a board of boxes, cylinders and tori with different materials) are packed into a `BatchedGeometryPool` (one shared vertex buffer and index buffer per vertex layout) and drawn with `WEBGL_multi_draw.multiDrawElementsInstancedWEBGL`, with per-draw data (model matrix and scalar material params) in a `DrawDataTexture` (RGBA32F, 4 texels per matrix + 2 texels material params) indexed by `gl_DrawID`. Materials in a batch are restricted to scalar PBR (no per-draw textures); textured materials batch only by layer 2. Without the extension the same packing is drawn with a loop of `drawElements` calls reusing one VAO and one program, with `u_drawId` as a uniform; that still removes VAO and program switches.

Shadow passes use the same batches (PRD 01 depth programs share vertex features; PRD 02 owns caster selection).

### 6.7 Culling

- `Renderer` builds a `BVH` over static item world bounds at mount and refits dynamic items per frame. Frustum test walks the BVH when item count > 256; below that, a flat allocation-free loop over a `Float32Array` of bounds.
- Batches carry per-instance bounds; instanced draws whose every instance is outside the frustum are skipped; partial visibility draws the full instance count (GPU culling only in WebGPU Phase 8).
- PRD 02's light-frustum caster query uses the same BVH (casters are not filtered by camera frustum; research/02 §3.3).

### 6.8 No CPU readback in production

- `Renderer.executePostprocess` treats any pass outside the fused GPU catalogue as unsupported. Behaviour is selected by a new explicit renderer option `postprocessGuard: "throw" | "drop"` (default `"drop"`), not by bundler-specific env flags (`@aura3d/rendering` is consumed through several bundlers, and `import.meta.env` is Vite-only). `"throw"` raises `new RenderDeviceError("Postprocess pass has no GPU implementation", "POSTPROCESS_PASS_CPU_ONLY", { passes })`; `"drop"` removes the pass, runs the fused path and records diagnostics error `POSTPROCESS_PASS_DROPPED:<name>` once per pass name. The engine passes `"throw"` when `createAuraApp({ diagnostics: { strict: true } })` is set; unit tests and `tests/browser/perf/*` run strict. The CPU kernels remain callable only when `postprocess.execution === "cpu-deterministic"` (tests and `MockRenderDevice`).
- Until PRD 07's GPU volumetric pass lands, `effects.volumetricFog` maps to analytic height fog in the forward shader only (the existing `resolveVolumetricFog(...).forward` terms at `index.ts:12764-12786`) and submits no `volumetricLight` pass.
- `contact-shadow`, `film-grain`, `chromatic-aberration`: PRD 03 moves film grain and CA into the display-space GPU chain; contact shadows move to PRD 02. Until then they are dropped with a diagnostics error, not run on the CPU.
- Post targets come from `RenderTargetPool` keyed by `(width, height, format, samples, depth)`; `createRenderTarget` inside `executePostprocess` is forbidden (test asserts zero target creations after frame 2).
- `FrameStats.readbacksThisFrame` counts every `readPixels` / `readFloatPixels` / `readDepthPixels`. CI fails if any game frame after `ready` has a nonzero count outside `app.capture()`.

### 6.9 Context loss and restore

`ResourceRegistry` records every GPU resource's creation descriptor and CPU-side source (geometry arrays, texture `ImageBitmap` or decoded data reference, program feature key, render target descriptor). On `webglcontextrestored`:
1. All handles are invalidated; the registry re-creates buffers, textures (from retained `ImageBitmap` where `retainForRestore` is true, else re-fetched through the asset cache), programs via `ProgramCache` (async, with warm-up), VAOs lazily, render targets via the pool.
2. The frame loop resumes after warm-up completes; the app gets `onDeviceRestored` after resources are valid, not before.
3. Memory policy: Medium and below release decoded image data after upload and re-fetch on restore (slower restore, less memory); High and Ultra retain `ImageBitmap`s.

### 6.10 Telemetry

`FrameStats` (rendering) is a fixed-size ring (240 frames) of `{ intervalMs, cpuFrameMs, cpuSubmitMs, gpuMs | NaN, drawCalls, instances, triangles, programsBound, programsCompiled, bufferCreates, textureUploads, readbacks, renderTargetsCreated }`. Percentiles computed on demand. `app.diagnostics().frame` exposes it; `frame.fps` is `1000 / p50(intervalMs)` and is `null` until 30 frames exist, while the legacy `diagnostics().fps` number uses the same formula over whatever samples exist (§7.1). The overlay (`index.ts:18654`) shows measured p50/p95 and tier.

### 6.11 Recommendations with cost profile

Costs are relative to the current WebGL2 path on the same scene. "Bundle" is gzip added to the root critical path unless stated as lazy.

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory cost | Bundle | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | WebGPU freeze: delete hacks, CPU raster, façades; hard error on missing WGSL | None directly; removes risk of worse pixels and false claims | None for games | WebGPU probes faster (no CPU raster) | −`colorPixels` per WebGPU target | −(WebGPU chunk shrinks; lazy) | None | Probes that depended on removed paths are deleted, not faked |
| R2 | Quality tiers + auto-detect | Lets PRD 01 raise DPR to device native on capable hardware; Ultra unlocks SSR/GTAO/froxels | Per tier (§17) | Detection < 2 ms once; calibration uses frames already rendered | Tier-dependent | +3 KB (table, resolver) | Mobile lands on Low/Medium with DPR ≤ 1.5 and 30 fps target | Unknown device → Medium, governor corrects |
| R3 | Quality governor | Keeps frame time stable instead of stuttering; preserves resolution before features | Reduces under load | < 0.05 ms/frame | None | +2 KB | Critical: thermal throttling on phones is handled | `adaptive: false` |
| R4 | Primitive geometry/material dedupe → instancing by key | Enables denser scenes (more props, more detail) within budget; no visual change by itself | Fewer state changes; same triangles | Large: Gravity Post 1,230+ → target ≤ 150 draws | Less: one geometry per primitive type instead of per node | +2 KB | Large: CPU-bound phones gain most | `batching: "off"` per app; per-node opt-out `batch: false` |
| R5 | `WEBGL_multi_draw` batches + `DrawDataTexture` | As R4 for heterogeneous static sets | One extra texel fetch per vertex for batched draws | Large for scenes with many unique static meshes | Shared VB/IB; +96 B per draw in data texture | +4 KB | Extension availability varies by browser and driver; loop fallback keeps program/VAO savings | Loop of `drawElements` with `u_drawId` |
| R6 | No CPU readback; pooled post targets; analytic fog interim | Deep Recovery becomes viewable; volumetric look temporarily reduced to height fog until PRD 07 | Same or lower | Removes 0.3-1.9 s/frame (Deep Recovery) | −1 full-frame float buffer per readback | −(CPU kernels tree-shaken from production) | Large; mobile was 282 ms/frame | `execution: "cpu-deterministic"` for tests only |
| R7 | Measured telemetry + fps fix | None directly; makes every perf claim checkable | Timer queries ~0 | < 0.05 ms | 240 × ~64 B | +2 KB | Same | Interval-only when timer query absent |
| R8 | Warm-up for current + next-lower tier, compile telemetry, hitch gate | Removes first-use stalls when VFX/skinned materials appear | None | Compile moved before first interactive frame (longer load, typically 50-400 ms per program count, measured by gate) | Programs for 2 tiers resident | +1 KB (on top of PRD 01 `ProgramWarmup`) | Parallel compile matters most on mobile drivers | `compile.mode: "async-skip"` |
| R9 | Context restore rebuild | Canvas recovers instead of staying black | Re-upload cost on restore only | Restore 0.2-2 s | High/Ultra retain `ImageBitmap`s (+ texture bytes in CPU RAM) | +3 KB | Mobile GPUs reset more often; restore is essential | Reload-page prompt via `onDeviceLost` if rebuild fails |
| R10 | BVH culling + allocation-free frustum test | None directly | Fewer draws off-screen | Saves O(n) allocations; BVH walk for large scenes | BVH nodes ~32 B × 2n | +2 KB (already in package; now reachable) | Medium | Flat loop below 256 items |
| R11 | WebGPU backend from generator WGSL (Phase 6+, gated) | Identical pixels to WebGL2 by construction; enables R12 | One pass per target; async pipelines | Lower than WebGL2 at high draw counts (bind groups, bundles) | Uniform ring 3 × frames × objects × 256 B | Lazy chunk ≤ 120 KB, never in WebGL2 critical path | Only where `navigator.gpu` and the probe pass; otherwise WebGL2 | `backend: "auto"` falls back to WebGL2 with reported reason |
| R12 | Resident compute particles in the scene pass (WebGPU, with PRD 07) | Ultra particle density (200k) with depth-correct compositing | Compute dispatch per emitter | No CPU sim | Storage buffers ~48 B × particles | Inside R11 chunk | Not on Low/Medium | WebGL2 GPU particles at the tier budget |
| R13 | Per-route perf fixes (§9.6) | Games become playable; game feel scores stop being capped by fps | Route-specific | Route-specific | Skyline −300 MB heap target, Neon Swarm −1.09M tris | Route bundles shrink (unused assets removed) | Large | n/a (bug fixes) |

---

## 7. APIs to add, change and remove

### 7.1 `@aura3d/engine` agent API (`packages/engine/src/agent-api/index.ts`)

```ts
export type AuraQualityTier = "low" | "medium" | "high" | "ultra";

export type AuraFeatureLevel = "off" | AuraQualityTier;

export interface AuraQualityTierSettings {
  readonly maxPixelRatio: number;
  readonly minRenderScale: number;
  readonly targetFrameMs: number;
  readonly msaaSamples: 0 | 4;
  readonly postAntiAlias: "fxaa" | "none" | "taa";
  readonly shadow: { readonly mapSize: 1024 | 2048 | 4096; readonly cascades: 1 | 2 | 3 | 4; readonly filter: "pcf2" | "pcf3" | "pcf5"; readonly localShadowLights: number };
  readonly maxLightsPerPixel: 4 | 8 | 16 | 32;
  readonly ambientOcclusion: AuraFeatureLevel;
  readonly ssr: AuraFeatureLevel;
  readonly bloomMipLevels: 3 | 5 | 6;
  readonly volumetricFog: "analytic" | "froxel-medium" | "froxel-high";
  readonly particleBudget: number;
  readonly softParticles: boolean;
  readonly lodBias: number;
  readonly primitiveSegments: "half" | "full";
  readonly maxTextureSize: 1024 | 2048 | 4096;
  readonly textureBudgetBytes: number;
  readonly anisotropy: 2 | 4 | 8 | 16;
  readonly environmentSize: 128 | 256 | 512 | 1024;
  readonly drawBudget: number;
}

export interface AuraAdaptiveQualityOptions {
  /** Default true. False disables both the resolution and the quality governor. */
  readonly enabled?: boolean;
  /** Default true. False keeps features fixed and adapts render scale only. */
  readonly features?: boolean;
  /** Lowest tier the feature governor may step down to. Default "low". */
  readonly floor?: AuraQualityTier;
}

// Extends the EXISTING interface at index.ts:1781 (mode, fallback, qualityProfile, textureBudgetBytes stay).
export interface AuraCreateAppRendererOptions {
  // existing members ...
  /** Default "webgl2". "webgpu-experimental" is accepted only when built with AURA3D_EXPERIMENTAL_WEBGPU and is never selected by "auto" before G-WGPU. */
  readonly backend?: "webgl2" | "webgpu-experimental";
  /** Default "auto". */
  readonly quality?: AuraQualityTier | "auto" | { readonly tier: AuraQualityTier | "auto"; readonly overrides?: Partial<AuraQualityTierSettings> };
  /** Default { enabled: true, features: true }. */
  readonly adaptive?: boolean | AuraAdaptiveQualityOptions;
  /** Default 60; "display" uses the measured vsync interval. */
  readonly targetFrameRate?: 30 | 60 | 90 | 120 | "display";
  /** Default "on". "off" disables engine batching layers 1-3 (debug/rollback). */
  readonly batching?: "on" | "off" | { readonly dedupe?: boolean; readonly instancing?: boolean; readonly multiDraw?: boolean };
}
// Top-level AuraCreateAppOptions.pixelRatio (index.ts:10798) is unchanged and still wins over tier DPR (PRD 01).
// AuraCreateAppOptions.diagnostics gains `strict?: boolean` (default false): postprocessGuard "throw" (§6.8).

// URL overrides read by createAuraApp in ALL builds (deployed games are captured from production, §2.6):
//   ?aura3d-quality=low|medium|high|ultra   forces the tier (source "explicit")
//   ?aura3d-adaptive=0                      disables both governors
// They change only quality settings, never content, and are recorded in diagnostics().frame / decision.reasons.

export interface AuraQualityController {
  readonly tier: AuraQualityTier;
  readonly settings: AuraQualityTierSettings;
  readonly decision: AuraTierDecision;
  set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void>; // resolves after warm-up of new programs
  lock(): void;
  unlock(): void;
  /** Test/capture hook: pins render scale (number in [effectiveFloor, 1] or "floor"); null releases. Implies lock() while pinned. */
  forceRenderScale(scale: number | "floor" | null): void;
  onChange(listener: (event: AuraQualityChangeEvent) => void): () => void;
}

export interface AuraTierDecision {
  readonly tier: AuraQualityTier;
  readonly source: "explicit" | "cache" | "class-table" | "calibration" | "hard-floor";
  readonly confidence: "high" | "low";
  readonly reasons: readonly string[];
  readonly renderer: string | null; // unmasked renderer string or null when masked
}

export interface AuraQualityChangeEvent {
  readonly from: { readonly tier: AuraQualityTier; readonly settings: AuraQualityTierSettings; readonly renderScale: number };
  readonly to: { readonly tier: AuraQualityTier; readonly settings: AuraQualityTierSettings; readonly renderScale: number };
  readonly reason: "governor-down" | "governor-up" | "calibration" | "api";
  readonly frameMsP50: number;
}

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

export interface AuraApp {
  // existing members ...
  readonly quality: AuraQualityController;
  precompile(options?: AuraPrecompileOptions): Promise<AuraPrecompileReport>;
  diagnostics(): AuraDiagnostics & { readonly frame: AuraFrameTimingReport };
}

export interface AuraPrimitiveNode {
  // existing members ...
  /** Default true. False keeps this node out of dedupe/instancing/multi-draw (e.g. per-node material animation of non-colour fields). */
  readonly batch?: boolean;
  /** Default inferred: true when the node has no runtime handle and no animation. */
  readonly static?: boolean;
}
```

Changes:
- `diagnostics().fps` stays typed `number` (no type break for consumers of `AuraDiagnostics`, `index.ts:10379`) but becomes measured: `1000 / median(intervalMs)` over the samples available (≥ 2 frames), `0` before the second frame. `diagnostics().frame.fps` is the strict variant: `number | null`, `null` before 30 frames. The literal `diagnosticsState.fps || 60` at `index.ts:12338` is removed.
- `qualityProfile?: AuraRendererQualityProfileId` is deprecated. Mapping: `"safe-basic"` → `quality: "auto"`; `"production"` → `"auto"`; `"cinematic"` → `{ tier: "auto", overrides: {} }` with floor `"high"` on desktop; `"experimental-webgpu"` → throws `AuraMigrationError("experimental-webgpu profile removed; see PRD 11 §6.2")`. One release of console warnings, then removal (PRD 15 release train).
- `performanceQuality?: AuraPerformanceQuality` and `app.setPerformanceQuality()` are deprecated aliases: `resolutionScale` → governor `renderScale` lock; `particleScale` → `overrides.particleBudget = tierBudget * particleScale`; `lodBias` → `overrides.lodBias`; `shadowSize` → `overrides.shadow.mapSize`. Removed one release later.
- `sceneKitPerformanceBudgets`: fields renamed `budgetDrawCalls`, `budgetP50FrameMs`; `calibrationSource` removed; type gets `kind: "aura-scene-kit-budget"` and the docstring "budget, not a measurement". Measured values live in capture reports only.
- `collectParticleBudgetDiagnostics`: `gpuReady` removed; `estimatedUpdateCostMs` renamed `heuristicUpdateCostMs`; adds `measuredUpdateMs` from `FrameStats` scope `particles`.
- `effects.volumetricFog`: until PRD 07 ships `VolumetricFogPass`, documented as "analytic height fog on all tiers"; never submits a CPU pass.

Removed from public types: `"experimental-webgpu"` profile, `AuraRendererQualityProfile.preserveDrawingBuffer` and `.pixelRatio` (PRD 01), `maxRecommendedDrawCalls` (replaced by `settings.drawBudget`).

### 7.2 `@aura3d/rendering`

```ts
// quality/QualityTier.ts
export const QUALITY_TIERS: Readonly<Record<QualityTier, QualityTierSettings>>; // §6.3 table, frozen
export type QualityTier = "low" | "medium" | "high" | "ultra";
export function resolveTierSettings(tier: QualityTier, overrides?: Partial<QualityTierSettings>): QualityTierSettings;
export function nextLowerTier(tier: QualityTier): QualityTier | null;

// quality/DeviceProbe.ts
export interface DeviceProbe {
  readonly backend: "webgl2" | "webgpu";
  readonly rendererString: string;          // gl.getParameter(gl.RENDERER); sanitized-real on Firefox, often "WebKit WebGL" / "Apple GPU" on Safari
  readonly unmaskedRenderer: string | null; // WEBGL_debug_renderer_info when exposed
  readonly unmaskedVendor: string | null;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
  readonly floatColorBuffer: boolean;
  readonly halfFloatColorBuffer: boolean;
  readonly timerQuery: boolean;
  readonly parallelShaderCompile: boolean;
  readonly multiDraw: boolean;
  readonly devicePixelRatio: number;
  readonly screen: readonly [number, number];
  readonly hardwareConcurrency: number | null;
  readonly deviceMemoryGB: number | null;
  readonly mobile: boolean | null; // navigator.userAgentData?.mobile, else coarse-pointer media query
}
export function probeWebGL2Device(gl: WebGL2RenderingContext, env?: ProbeEnvironment): DeviceProbe;

// quality/TierResolver.ts
export interface TierDecision { readonly tier: QualityTier; readonly source: "explicit" | "cache" | "class-table" | "calibration" | "hard-floor"; readonly confidence: "high" | "low"; readonly reasons: readonly string[] }
export function classifyDevice(probe: DeviceProbe, table?: DeviceClassTable): TierDecision;
export function calibrateTier(decision: TierDecision, samples: readonly number[], targetFrameMs: number): TierDecision;
export interface TierCache { read(key: string): TierDecision | undefined; write(key: string, decision: TierDecision): void }
export function tierCacheKey(probe: DeviceProbe, engineVersion: string): string;

// quality/QualityGovernor.ts
export interface QualityGovernorOptions { readonly tier: QualityTier; readonly floor: QualityTier; readonly targetFrameMs: number; readonly features: boolean }
export class QualityGovernor {
  constructor(resolution: ResolutionGovernor, options: QualityGovernorOptions);
  sample(stats: FrameStatsSample): QualityGovernorStep | null; // called once per frame
  readonly settings: QualityTierSettings;
  lock(): void;
  unlock(): void;
}
export interface QualityGovernorStep { readonly feature: keyof QualityTierSettings; readonly from: unknown; readonly to: unknown; readonly direction: "down" | "up" }

// quality/FrameStats.ts
export interface FrameStatsSample {
  intervalMs: number; cpuFrameMs: number; cpuSubmitMs: number; gpuMs: number; // NaN when unknown
  drawCalls: number; instances: number; triangles: number; programsBound: number; programsCompiled: number;
  bufferCreates: number; textureUploads: number; readbacks: number; renderTargetsCreated: number;
}
export class FrameStats {
  constructor(capacity?: number); // default 240
  begin(timestamp: number): void;
  end(): FrameStatsSample;
  scope<T>(name: "shadow" | "forward" | "post" | "particles" | string, fn: () => T): T; // GPU+CPU scoped timing
  percentiles(field: keyof FrameStatsSample): { p50: number; p95: number; p99: number; max: number };
  fps(): number | null;   // 1000 / p50(intervalMs); null before 30 samples
  legacyFps(): number;    // same formula over available samples; 0 before 2 samples
}

// RenderDevice.ts additions
export interface DeviceCounters { readonly drawCalls: number; readonly bufferCreates: number; readonly textureUploads: number; readonly readbacks: number; readonly renderTargetsCreated: number; readonly liveBuffers: number; readonly liveVertexArrays: number; readonly textureBytes: number; readonly renderTargetBytes: number }
export interface RenderDevice {
  // existing ...
  readonly probe: DeviceProbe;
  counters(): DeviceCounters;            // monotonic totals; FrameStats diffs them
  resetFrameCounters(): void;
  multiDrawElementsInstanced?(mode: "triangles", counts: Int32Array, offsetsBytes: Int32Array, instanceCounts: Int32Array, drawCount: number): void;
}

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

// resources/ResourceRegistry.ts
export class ResourceRegistry {
  register<T extends GPUResourceHandle>(handle: T, descriptor: ResourceDescriptor): T;
  unregister(handle: GPUResourceHandle): void;
  rebuild(device: RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }>;
}

// resources/RenderTargetPool.ts
export class RenderTargetPool {
  acquire(desc: { width: number; height: number; format: TextureFormat; samples: 1 | 4; depth: boolean }): RenderTarget;
  release(target: RenderTarget): void;
  trim(maxIdleFrames: number): void;
}

// Renderer options
export interface RendererOptions {
  // existing ...
  readonly quality?: QualityTierSettings;
  readonly batching?: { readonly dedupe?: boolean; readonly instancing?: boolean; readonly multiDraw?: boolean };
  readonly frameStats?: FrameStats;
  /** Default "drop". "throw" raises POSTPROCESS_PASS_CPU_ONLY for any non-GPU post pass (§6.8). */
  readonly postprocessGuard?: "throw" | "drop";
}
```

Removed exports: `WebGPURendererBackend`, `WebGPUPipelineCache`, the `production-runtime/backends/{webgpu,webgl2}` classes, `createRootGpuParticleWorkload` from the production entry (moved to `@aura3d/engine/experimental`), `Batcher` (superseded by `planBatches`; delete after one release). `FrustumCuller` keeps its name with an allocation-free signature `cull(bounds: Float32Array, count: number, frustum: Float32Array, out: Uint8Array): number`.

### 7.3 Program generator (PRD 01 `program/`) additions owned here

```ts
// program/UniformLayout.ts
export type UniformMember = { readonly name: string; readonly type: "f32" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4" | "i32" | "u32"; readonly arrayLength?: number };
export interface UniformBlockLayout { readonly name: "AuraFrame" | "AuraLights" | "AuraMaterial" | "AuraObject"; readonly group: 0 | 1 | 2 | 3; readonly binding: number; readonly members: readonly UniformMember[] }
export function std140Offsets(layout: UniformBlockLayout): { readonly size: number; readonly offsets: Readonly<Record<string, number>> };
export function emitGlslBlock(layout: UniformBlockLayout): string; // layout(std140) uniform AuraFrame { ... };
export function emitWgslStruct(layout: UniformBlockLayout, kind: "uniform" | "storage"): string; // struct + @group/@binding var
```

`ProgramGenerator.generate(features, { target })` with `target: "wgsl"` stops throwing `NotImplemented` in Phase 6. It returns `{ vertex: string; fragment: string; bindGroupLayouts: GPUBindGroupLayoutDescriptor[]; vertexLayout: GPUVertexBufferLayout[] }`.

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

`#extension` must precede all non-preprocessor tokens; the generator places it immediately after `#version 300 es`. The vertex stage writes `v_drawId = AURA_DRAW_ID`; the fragment stage declares the same sampler and reads slots 4-5. Normal matrix is `transpose(inverse(mat3(model)))` only when the `nonUniformScale` feature is set; otherwise `mat3(model)` with per-fragment normalisation. `DrawDataTexture` capacity at width 1024 and 6 texels per draw is 170 draws per row; height grows by powers of two up to 64 rows (10,922 draws per batch texture).

### 8.2 Instancing attributes

PRD 01 replaces `u_instanceMatrices[64]` with `a_instanceMatrix0..3`. This PRD adds `a_instanceColor` (vec4, sRGB→linear done on CPU at write) and `a_instanceEmissive` (vec4: rgb, intensity) under feature `instanceColor` / `instanceEmissive`, which the dedupe layer (§6.6) requires. Depth programs ignore colour attributes but keep matrices (PRD 02 shadow casters).

### 8.3 Tier-driven defines

Only code-shape changes enter the key: `SHADOW_CASCADES 1|2|3|4`, `SHADOW_PCF_TAPS 1|4|9` (PRD 02 implements), `MAX_LIGHTS_PER_PIXEL` bucket (PRD 01 buckets), `SOFT_PARTICLES` (PRD 07). AO/SSR/bloom levels are pass toggles and never enter forward program keys. Warm-up covers `current` and `nextLowerTier(current)` keys.

### 8.4 WGSL emission (Phase 6+)

- **Chunks are dual-authored.** Each PRD 01 chunk file `program/chunks/<name>.glsl.ts` gets a sibling `<name>.wgsl.ts` exporting the same function names and signatures (manifest `program/chunks/manifest.ts`: name, inputs, outputs, required uniforms, required textures). A unit test asserts every GLSL chunk has a WGSL sibling with identical manifest entries. Automatic GLSL→WGSL transpilation at runtime is rejected: a WASM transpiler (naga) would add roughly a megabyte to the client.
- **Uniforms.** `AuraFrame`, `AuraLights` from `UniformLayout` as `@group(0) @binding(0) var<uniform> frame: AuraFrame;` and `@group(1) @binding(0) var<uniform> lights: AuraLights;`. Per-material scalars as `@group(2) @binding(0) var<uniform> material: AuraMaterial;` (one buffer per material instance, rewritten on change). Per-object `@group(3) @binding(0) var<uniform> object: AuraObject;` with dynamic offset into `UniformRing`.
- **Instancing.** `@group(3) @binding(1) var<storage, read> instances: array<mat4x4f>;` indexed with `@builtin(instance_index)`; instance colour in `array<vec4f>` at binding 2.
- **Shadows.** `texture_depth_2d_array` + `sampler_comparison`, sampled with `textureSampleCompareLevel(shadowMap, shadowSampler, uv, cascade, depthRef)`. No `rgba8` encoded depth.
- **Textures.** Colour textures in `rgba8unorm-srgb` (hardware decode, matching WebGL2 `SRGB8_ALPHA8`); samplers created once per sampler descriptor and cached.
- **Removed from WGSL:** `productPropBodyGate/OrangeGate/Albedo`, `u_productColorSmoothing`, the hard-coded `lightDirection`, the `2.25` direct gain, the hemisphere ambient fake, equirect-mip "IBL", the `instance0..3` struct members, and `nativeUniformStruct` (the 2,052-float monolith).
- **Validation in CI.** `tools/wgsl-validate/` runs `naga` (pinned exact version, installed in the remote job, not on the Mac) over the WGSL emitted for the warm-up key corpus: every key used by the 18 games and 18 benchmark scenes, at all four tiers.

### 8.5 Post

PRD 03 owns kernels. This PRD's shader-level requirement: no post pass may be implemented as a CPU kernel in production builds, and every GPU post pass reads near/far from `AuraFrame` (PRD 01 fixes the hard-coded 0.1/1000 at `WebGL2Device.ts:865`, `:4567-4574`).

---

## 9. Rendering changes

### 9.1 Frame structure (WebGL2, after Phases 1-5)

```
app frame (rAF)
 ├─ FrameStats.begin
 ├─ game callbacks (cpuFrameMs scope "game")
 ├─ Renderer.render  (cpuSubmitMs)
 │   ├─ dirty transforms → InstanceBuffer.subData / DrawDataTexture.flush
 │   ├─ BVH refit (dynamic) → frustum visibility bitset
 │   ├─ shadow scope: batches (instanced + multi-draw) via depth programs
 │   ├─ forward scope: DrawPacket queue sorted (pass, blend, program, material, depth)
 │   ├─ post scope: GPU passes only, targets from RenderTargetPool
 │   └─ OutputPass (PRD 01) at renderScale → canvas
 ├─ QualityGovernor.sample(FrameStats.end())
 └─ diagnostics publish (throttled to 4 Hz; never serialises scene each frame)
```

### 9.2 Primitive pipeline changes in the root bridge

- `createProductionPrimitiveResources` takes a `PrimitiveResourceCache` (`Map<string, Geometry>` keyed by primitive + segments; `Map<string, PBRMaterial>` keyed by `materialSpecKey`).
- `materialSpecKey(spec)` = stable JSON of the spec with `color`, `emissive`, `emissiveIntensity` removed (and `opacity` removed when `opacity ≥ 0.999`), plus `cullMode` and texture URLs. Nodes whose spec includes textures still dedupe by full key (identical textured props share a material).
- Per-node colour/emissive is written to instance attributes when the item is batched, or to a per-draw material uniform block when it is not.
- `diagnostics().renderer.batching` reports `{ inputItems, outputDraws, instancedBatches, multiDrawBatches, reasonsNotBatched }`.

### 9.3 Draw-call targets for the worst games (Medium tier, desktop 1080p)

| Game | Current draws (report) | Target | Mechanism |
|---|---|---|---|
| Gravity Post | 1,230-1,294 | ≤ 150 | dedupe + instancing of ~330 primitives; multi-draw for board pieces |
| Courier Rush | ~1,530 title, 436-545 mid | ≤ 250 | city primitives instanced by type; static city multi-draw; traffic as instanced GLB |
| Pulse Tunnel | ~250 | ≤ 80 | tunnel rings instanced |
| Bank Shot | ~193 | ≤ 60 | dedupe + text3D digits replaced (PRD 14) |
| Mech Hangar | ~190 | ≤ 90 | dedupe; DPR from tier instead of forced 1.5 |
| Rooftop Buckets | ~200 primitives | ≤ 80 | dedupe + instancing |

Draw counts include shadow-pass draws.

### 9.4 Post execution

- Fused GPU path is the only production path. A pass the fused path cannot express is a dev error and a production drop (§6.8).
- `executePostprocess` acquires every intermediate target from `RenderTargetPool`; `Renderer.dispose` drains it.

### 9.5 Context restore

`WebGL2Device` restored listener calls `ResourceRegistry.rebuild(device)`, then `ProgramCache.rebuildAll()` (async with warm-up), then emits restored. `Renderer` skips frames while rebuilding and clears to the background colour.

### 9.6 Per-game impact and route-level perf fixes (route edits implemented with PRD 14; measured by this PRD)

Every one of the 18 games has a row. "Engine" lists the phases of this PRD that change the game without route edits. "Route fix" is the route-side work (PRD 14 owns the edit, this PRD owns the measurement). Target is the §17.2 runner gate at forced Medium, `adaptive=0`; games that already pass must not regress p50 by more than 15%. "Visual check" is the V-row that guards against buying speed with pixels.

| Game | 1080p fps now | Engine | Route fix | Target (runner, 1080p) | Visual check |
|---|---|---|---|---|---|
| Deep Recovery | 0.5 | Phase 2 removes the CPU post chain (`volumetric-light` not fusable, `Renderer.ts:2111-2119`) | Keep `effects.volumetricFog` (`apps/showcase-deep-recovery/src/main.ts:280-285`); it renders as analytic height fog until PRD 07 | p50 ≤ 50 ms after Phase 2, ≤ 33 ms after Phase 3 | V7 |
| Gravity Post | 6.4 | Phase 3 dedupe + instancing (~330 primitives) | Stop replacing dock-gate textures per frame (PRD 04; research/17-g5:108) | ≤ 33 ms; draws ≤ 150 (§9.3) | V6, V8 |
| Courier Rush | 7.1 | Phase 3 batching; Phase 5 restore | Mark static city groups `static: true` (`apps/showcase-courier-rush/src/city.ts:76-161, 287-410, 490-496`); add `onDeviceLost`/`onDeviceRestored` DOM overlay in `main.ts`; move the `?capture=review` city fork behind a dynamic import (research/17-g2 X10) | ≤ 33 ms; draws ≤ 250; context-restore test passes | V6, Phase 5 SSIM |
| Siege Golf | 7.1 (p50 18.2 ms, p95 1,100 ms) | Phase 0 makes the hitch visible | Replace `app.setScene(buildHoleScene(flow.hole, cameraPhase))` in `applyCameraPhase` (`apps/showcase-siege-golf/src/main.ts:975-985`, also `:1104`) with runtime handle updates (PRD 09) | p95 ≤ 2 × p50 and p99 ≤ 50 ms | V6 |
| Rooftop Buckets | 7.6 | Phase 3 dedupe + instancing; Phase 4 tier DPR | Remove `pixelRatio` clamp (`apps/showcase-rooftop-buckets/src/main.ts:738`) and `qualityProfile: "production"` (`:743`) | ≤ 33 ms; draws ≤ 80 | V6, V9 |
| Mech Hangar | 9.3 | Phase 3 dedupe (~190 draws); Phase 4 tier DPR | Remove `qualityProfile: "production"` (`apps/showcase-mech-hangar/src/main.ts:705`), which forces DPR 1.5 through the profile (research/20:228) | ≤ 33 ms; draws ≤ 90 | V6 |
| Blockfall Reactor | 9.8 | Phase 3 | Delete `.addMany(createLockedBlockNodes())` (`apps/showcase-blockfall-reactor/src/main.ts:630`; nodes built in `reactor-scene.ts:516`) and the boot render-mode A/B probe (`main.ts:763-826`, `measureDrawCallsOnce` at `:791`, invoked at `:826`); replace the 80 `text3D` scoreboard digit nodes (6 score + 2 level slots × 10 digits, handles at `main.ts:834-846`) with a DOM scoreboard; reduce to one WebGL context per page (capture `window.__QRC__.contexts`) | ≤ 33 ms; 1 context | V6 |
| Gallery Shift | 10.1 | Phases 0-4 | Not profiled. Phase 0 task: record `FrameStats` scopes and `renderer.batching.reasonsNotBatched`, file the top three costs in `evidence/prd-11/phase-0/gallery-shift.md` before Phase 3 | ≤ 33 ms | V6 |
| Aura Clash | 11.1 | Phases 0-4 | Not profiled ("5x gap", research/20:134). Remove the 1.75 DPR clamp and `qualityProfile: "production"` (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1522-1531`; keep the probe-only branches); Phase 0 profiling as for Gallery Shift (2 skinned rigs, 98.6k-tri textured city block, research/17-g1:19) | ≤ 33 ms; `precompile-hitch` passes | V6 |
| Skyline Runner | 11.4 | Phase 4 tier DPR | Remove `pixelRatio: 0.7` (`apps/showcase-skyline-runner/src/main.ts:1879`) and `qualityProfile: "safe-basic"` (`:1875`); drop the unused 80k Meshy hero and the 118k-tri tea house (research/20:595,612); move evidence serialisation out of the frame loop | ≤ 33 ms; heap ≤ 150 MB at ready (from 308 MB) | V6, V9 |
| Bank Shot | 14.9 | Phase 3 dedupe (~193 draws) | Replace `text3D` digits (PRD 14) | ≤ 33 ms; draws ≤ 60 | V6 |
| Patrol Wing | 15.8 (54.8 at 720p) | Phase 2-4; fill/post-bound, so governor render scale is the main lever | Profile `post` scope cost at 1080p in Phase 0 and record it | ≤ 33 ms forced Medium; with `adaptive` on, governor holds p50 ≤ 33 ms | V8 |
| Turbo Drift | 19.7 | Phase 4 tier shadow size (Medium 2048, 2 cascades via PRD 02 instead of one 4096 map over 500-unit bounds, research/20:520) | Replace capture-only `pixelRatio: 1` + `performanceQuality` (`apps/showcase-turbo-drift-circuit/src/main.ts:2983-2994`) with `quality.lock()` during capture | ≤ 33 ms | V6, V8 |
| Pulse Tunnel | 23.5 | Phase 3 instancing of tunnel rings (~250 draws) | none | ≤ 33 ms; draws ≤ 80 | V6 |
| Neon Swarm | 25.8 | Phase 3 | Replace the four 272,036-tri `neonStreetLampProp` instances (`apps/showcase-neon-swarm/src/main.ts:608-627`) with a lamp asset ≤ 5k tris (PRD 05 admission budget) | ≤ 33 ms; triangles submitted ≤ 1M (Medium) | V6 |
| Aurora Lander | 52.2 | Phase 3 dedupe (~150 primitive nodes) | none | ≤ 20 ms (already near; no regression > 15%) | V6 |
| Vault Breakers | 57.4 | Phase 4 tier DPR | Remove `qualityProfile: "production"` (`apps/showcase-vault-breakers/src/main.ts:392`) | no regression > 15% vs 16.7 ms p50 (p95 18.5) | V6 |
| Orbital Defense | 59.6 | none expected | none | no regression > 15% vs 16.7 ms p50 (p95 19.1) | V6 |
| All 18 | | Phase 0 throttle | `diagnostics()` reads at ≤ 4 Hz; no `structuredClone` of renderer diagnostics per frame (`readRootDiagnosticSnapshot`, `RootRuntimeSupport.ts:57-60`, called at `index.ts:11678`) inside rAF | | |

---

## 10. Migration plan

1. **Telemetry first (Phase 0).** Land `FrameStats`, the fps fix and capture-harness frame recording before any optimisation, so every later change has a measured before/after on the same runner.
2. **Freeze WebGPU (Phase 1).** Deletions and renames in one PR series; docs and skills updated in the same PR so no claim outlives its code.
3. **Remove CPU readback (Phase 2).** Ships alone; Deep Recovery is the acceptance case.
4. **Batching (Phase 3).** Behind `batching: "on"` default; per-app `"off"` for one release as rollback. Codemod not needed: apps get batching without source changes. Apps that mutate non-colour material fields per node at runtime (rg for `setMaterial(` / `material.roughness =` in `apps/`) get `batch: false` added by a one-time script `scripts/migrations/prd11-batch-optout.mjs` that lists candidates for manual review rather than editing blindly.
5. **Tiers + governor (Phase 4).** `qualityProfile` / `performanceQuality` mapped with warnings. `apps/showcase-turbo-drift-circuit` (only `performanceQuality` user, capture-only) migrated to `quality` in the same PR. Fixed-DPR sources removed by PRD 14 after tier gates pass: explicit `pixelRatio` in Skyline Runner (0.7, `main.ts:1879`), Rooftop Buckets (≤ 1.75, `main.ts:738`), Aura Clash (≤ 1.75, `AuraClashArenaApp.ts:1522-1530`), Turbo Drift capture (1, `main.ts:2988`); `qualityProfile: "production"` (fixed DPR 1.5 via the profile) in Mech Hangar (`main.ts:705`), Vault Breakers (`main.ts:392`), Rooftop Buckets (`main.ts:743`), Aura Clash (`AuraClashArenaApp.ts:1531`). `createPerformanceGovernor` users (`animation-studio`, `character-controller` templates) need no change: they delegate when the engine governor is on (§6.5).
6. **Context restore (Phase 5).**
7. **WebGPU replacement (Phases 6-8)**, only after G-WGPU.

---

## 11. Backward compatibility

- `diagnostics().fps` changes from a constant 60 to measured; its type stays `number`. Any test asserting engine output `fps === 60` is wrong and is fixed, not preserved. `rg -n "fps.*60" tests/ apps/*/route-health.json tools/` lists the call sites to review; known fixtures are listed in §2.6.
- `tests/unit/agent-api-root-performance-quality.test.ts` and `tests/unit/muse3jsparity-root-governor-contract.test.ts` keep passing unchanged through the deprecation release (they exercise the alias path), then are rewritten against `app.quality` when the aliases are removed.
- `qualityProfile` and `performanceQuality` keep working for one release with a one-time console warning naming PRD 11.
- `backend` option did not exist on `createAuraApp`; no break. `ProductionRuntimeRenderer.create({ backend: "webgpu" })` remains for internal probes and still refuses silent fallback.
- Batching changes draw order only within a sort bucket; transparent items are never instanced or multi-draw batched in this PRD (they need back-to-front order and stay passthrough, `reasonsNotBatched.transparent`). For reference, three.js r185 `InstancedMesh` never sorts its instances, while `BatchedMesh` sorts per object when `sortObjects` is true (default); Aura's passthrough rule is the conservative choice and per-instance transparent sorting is out of scope.
- Rendering output of batched vs unbatched draws must be pixel-identical on the benchmark (test in §15).
- Removed WebGPU routes: redirect their deployed URLs to `/apps/backend-availability-lab/` for one release (route-health catalogue updated).
- `sceneKitPerformanceBudgets` field renames: old names kept as deprecated getters for one release.

---

## 12. Dependencies on other PRDs

| PRD | Dependency direction | What |
|---|---|---|
| 01 | This PRD depends on it | `ProgramGenerator` + `target` param, `ProgramWarmup`, UBOs, uniform cache, `InstanceBuffer` + VAO fix, `DrawPacket` pool, blend modes, DPR policy, `ResolutionGovernor`, `app.capture()`, primitive geometry module, `createModelMatrix` size rule (fixes 16-instancing) |
| 02 | Reads this PRD's tier table; uses BVH for caster query | Cascades, filter taps, local shadow count per tier; depth programs for batched/instanced casters |
| 03 | Reads tier table | AO/SSR/bloom/AA per tier; GPU film grain/CA so no CPU fallback is needed |
| 04 | Reads tier table | Max texture size, anisotropy; stops tint overrides that disable textures (affects Courier, Gravity Post batching keys) |
| 05 | Supplies budgets to | Triangle and texture budgets per tier for asset admission |
| 07 | Bidirectional | Particle budget per tier; GPU volumetric fog replaces analytic interim; WebGPU compute particles are G-WGPU item 3 |
| 09 | This PRD depends on it for Siege Golf | Runtime handles instead of `setScene` rebuilds |
| 10 | Reads tier table | LOD bias, vegetation density per tier |
| 12 | Joint | Frame-time capture in benchmark and game harness; perf gate job; stress scenes 19-20 |
| 13 | Consumes | `aura3d-performance` skill rewritten to tiers, measured `frame` diagnostics, batching rules; remove WebGPU claims from skills |
| 14 | Joint | Route-level fixes (§9.6) and per-game sign-off |
| 15 | Decides | three.js `WebGPURenderer` adoption vs own backend (G-WGPU item 4); bundle budgets; release train for deprecations |

---

## 13. Implementation phases

Each phase lands as its own PR series and is measured on the remote macos-14 capture job (`.github/workflows/quality-rebuild-capture.yml`) against the previous phase's report.

**Phase 0: Measured telemetry (no behaviour change).**
Deliver `FrameStats`, `DeviceCounters`, fps fix (`index.ts:12338`), `app.diagnostics().frame`, overlay showing p50/p95/tier, capture harness recording `diagnostics().frame` next to its own rAF fps, benchmark perf mode.
Exit: for all 18 games, `|frame.fps − harness rAF fps| / harness fps ≤ 10%` on the runner; every capture report contains `frame` for every run; `readbacksThisFrame` is reported (Deep Recovery shows > 0, which proves the counter works).

**Phase 1: WebGPU freeze.**
Deliver §6.2 deletions, hard error on missing WGSL, sync-readback throw, route renames/deletions, doc and skill claim removal.
Exit: `rg -n "productProp|u_productColorSmoothing|rasterizeDraw|colorPixels" packages/rendering/src/WebGPUDevice.ts` returns nothing; `rg -n "backend: \"webgpu\"" apps/` only matches renamed probe routes; `docs/rendering/webgpu-*.md` contain the single status line; build and unit tests green; remaining WebGPU smoke specs pass on the non-gating job.

**Phase 2: No CPU readback in production frames.**
Deliver §6.8: production guard, analytic volumetric interim, `RenderTargetPool`, readback counter gate.
Exit: Deep Recovery 1080p p50 ≤ 50 ms on runner (from 1,917 ms; the §17.2 budget applies after Phase 3); `readbacksThisFrame === 0` for every frame after `ready` across all 18 games; `renderTargetsCreatedThisFrame === 0` after frame 2; vision judge of Deep Recovery `03-mid` (same rubric and model as research/21) scores postprocessing ≥ 3 and atmospheric_effects ≥ 1.5, the current research/21 values (`research/21-game-vision-judgment.md:699,707`).

**Phase 3: Batching.**
Deliver §6.6 layers 1-3, `materialSpecKey`, instance colour/emissive attributes, `DrawDataTexture`, `MultiDrawBatch` with loop fallback, BVH culling (§6.7), batching diagnostics.
Exit: §9.3 draw targets met; benchmark scenes 01-18 pixel-identical batched vs `batching: "off"` (§15.3); 16-instancing extent matches three.js (requires PRD 01 `createModelMatrix` fix); 10,000-frame leak test flat (`liveVertexArrays`, `liveBuffers` constant ±0 after frame 60); CPU submit for stress scene 19 (5,000 static primitives) ≤ 4 ms p50 on runner.

**Phase 4: Tiers, detection, governor.**
Deliver §6.3-6.5, `app.quality`, `quality` / `adaptive` / `targetFrameRate` options, deprecation mappings, persistence, warm-up of next-lower tier, Turbo Drift migration.
Exit: tier detection unit tests over the device-class fixture corpus pass; runner (Paravirtual) detects Low with `confidence: "high"` unless forced; forced-Medium runner budget (§17.2) met by all 18 games; governor oscillation test (unit, synthetic model: start at High with render scale pinned at floor, base load 1.2 × target, each feature step down removes 10% of frame time and each step up adds it back): over 3,000 frames there are ≤ 2 direction changes and no step at all in the last 1,000 frames; no frame > 50 ms caused by a governor step in `tier-switch-hitch.spec.ts` (compile already warmed).

**Phase 5: Context restore.**
Deliver §6.9 `ResourceRegistry` rebuild, root bridge resume, Courier overlay.
Exit: `WEBGL_lose_context.loseContext()` + `restoreContext()` browser test on 4 games (Courier, Aura Clash, Turbo Drift, Gravity Post) returns to rendering within 2 s, and the post-restore screenshot matches the pre-loss screenshot (SSIM ≥ 0.98, same camera, paused).

**Gate G-WGPU review** (§6.2). Recorded as a decision note in `docs/project/aura3d-quality-rebuild/decisions/` with the evidence links. If it fails or PRD 15 adopts three.js `WebGPURenderer`, stop here.

**Phase 6: WGSL emission.**
Deliver `UniformLayout`, dual-authored chunks, `target: "wgsl"`, naga validation job.
Exit: every key in the warm-up corpus (18 games × 4 tiers + 18 benchmark scenes) emits WGSL that naga validates; GLSL/WGSL manifests match; `std140Offsets` equals the WGSL host-shareable layout for every block (unit test with hand-computed offsets).

**Phase 7: `WebGPURenderDevice`.**
Deliver §6.2 backend rules; delete `WebGPUDevice.ts`; port TAA/bloom/FXAA WGSL and async readback.
Exit: 18 benchmark scenes render on WebGPU with mean ΔE2000 ≤ 1.0 and p99 ≤ 5 vs WebGL2 same engine, SSIM ≥ 0.98, vision review "no visible difference"; one render pass per target per frame (counter); zero per-draw buffer creation after frame 2; forced-WebGPU runner budget no worse than WebGL2 +10%.

**Phase 8: Compute.**
Deliver resident compute particles in the scene pass (with PRD 07), storage-buffer instancing at 100k instances, `backend: "auto"` exposure behind Ultra-only default.
Exit: benchmark 14-particles at 200k particles on Ultra: vision score ≥ three.js r185 at the same count; depth-correct compositing against scene geometry visible in screenshot; `auto` selects WebGPU only where the probe passes and the forced-backend pixel diff gate passed in the same CI run.

---

## 14. Task checklist

### Phase 0: telemetry

- [ ] `packages/rendering/src/quality/FrameStats.ts`: implement `FrameStats` ring (capacity 240) with `begin`, `end`, `scope`, `percentiles` (nearest-rank). Unit test `tests/unit/rendering/quality/frame-stats.test.ts`: 240 known samples → exact p50/p95/p99/max; ring wraps at 241.
- [ ] `packages/rendering/src/RenderDevice.ts`: add `DeviceCounters`, `counters()`, `resetFrameCounters()`. Implement in `WebGL2Device.ts` by incrementing in `createBuffer`, texture upload paths, `readPixels`/`readFloatPixels`/`readDepthPixels`, `createRenderTarget`, VAO create/delete; `liveBuffers`/`liveVertexArrays` from registry sizes. Implement in `MockRenderDevice`. Unit test: each call increments exactly one counter.
- [ ] `packages/rendering/src/RendererTiming.ts`: expose `scope(name)` that brackets `EXT_disjoint_timer_query_webgl2` queries and resolves results 2-3 frames later into `FrameStats.gpuMs`; on `GPU_DISJOINT_EXT` discard the sample. Unit test with a fake GL that returns disjoint on one frame.
- [ ] `packages/rendering/src/Renderer.ts`: wrap shadow, forward, post in `FrameStats.scope`; record `cpuSubmitMs` around `render()`.
- [ ] `packages/engine/src/agent-api/index.ts:12338`: delete `diagnosticsState.fps = diagnosticsState.fps || 60`; set `diagnosticsState.fps = frameStats.legacyFps()` (median over available samples, `0` before frame 2) and `frame.fps = frameStats.fps()` (`null` before 30 frames). Replace the canvas-runtime per-frame `Math.round(1000 / delta)` at `:11336` with the same `FrameStats` source so both paths agree. Unit tests: after 30 synthetic 50 ms frames `diagnostics().fps === 20` and `frame.fps === 20`; after 10 frames `frame.fps === null` and `diagnostics().fps === 20`; no code path yields 60 without 60-fps samples. Update fixtures that pin `fps: 60` (`tests/unit/agent-api/devtools.test.ts`, `tests/unit/apps/aura-clash-arena-proof.test.ts`) only where they assert engine output, not where 60 is input data.
- [ ] `index.ts`: add `frame: AuraFrameTimingReport` to diagnostics; overlay (`:18654`) prints `p50/p95 ms`, `gpu ms` or `gpu n/a`, tier, render scale.
- [ ] `tools/quality-rebuild-capture/capture-games.mjs`: in `pageSnapshot` (`:371-380`) also read `app.diagnostics().frame` from each entry of `globalThis.__AURA3D_LIVE_APPS__.all()` and store it in `runs[].engineFrame`; add `fpsAgreement = (1000 / engineFrame.intervalMs.p50) / harnessFps`. Extend the fps window (`pageStartFps`, `:417`) to `max(fpsSampleMs, time for 30 frames)` capped at 60 s, so 0.5-fps games still produce 30 samples. Report fails a run when agreement is outside [0.9, 1.1] or `engineFrame` is missing.
- [ ] `benchmarks/quality-rebuild/capture.mjs`: add `--perf` mode: 3 s warm-up, 5 s measured rAF interval for both engines, record p50/p95 and `drawCalls`; write into `report.json` `engines.<e>.perf`. Joint with PRD 12.
- [ ] `index.ts` `readRootDiagnosticSnapshot` callers: throttle diagnostics snapshot (`structuredClone`) to ≤ 4 Hz; test that 60 frames trigger ≤ 4 clones.
- [ ] `tools/bundle-size/index.ts`: add `--splitting` (esbuild `splitting: true`, `format: "esm"`) that reports the root critical-path gzip separately from lazy chunks; record today's baseline in `evidence/prd-11/phase-0/bundle.json` so the §17.1 bundle row has a before value. Joint with PRD 15.
- [ ] Profile the three unprofiled or fill-bound games from the first Phase 0 capture: Gallery Shift, Aura Clash, Patrol Wing. For each, write `docs/project/aura3d-quality-rebuild/evidence/prd-11/phase-0/<game>.md` with `FrameStats` scope p50 (shadow / forward / post / game), draw calls, triangles, readbacks, and the top three costs with file:line causes. These notes replace "not profiled" in §1 and §9.6 before Phase 3 starts.

### Phase 1: WebGPU freeze

- [ ] `packages/rendering/src/WebGPUDevice.ts`: delete `productPropBodyGate`, `productPropOrangeGate`, `productPropAlbedo` (`:3555-3588`) and their call sites (`:3675-3678`, `:3768-3773`); delete `u_productColorSmoothing` from `nativeUniformStruct` and the packer.
- [ ] `WebGPUDevice.ts`: delete `rasterizeDraw` (`:1719-1787`), `rasterizeTriangle` (`:2970+`), CPU skin/morph helpers used only by them, `colorPixels` on `WebGPURenderTarget`; `draw()` (`:1149-1150`) calls only `submitNativeRenderPass`.
- [ ] `WebGPUDevice.ts` `readPixels` (`:804-842`) and `readFloatPixels` (`:1022`): throw `new RenderDeviceError(..., "WEBGPU_SYNC_READBACK_UNSUPPORTED")`; remove the "CPU-shadowed" capability note at `:550`. Update `ProductionWebGPURenderer.renderImportedAsset` (`ProductionWebGPURenderer.ts:93`) to delegate to `renderImportedAssetAsync` (`:137`) or delete it, and update its callers (`rg -n "renderImportedAsset\(" tools apps tests`).
- [ ] `WebGPUDevice.ts` `createNativeShaderSources` (`:3179-3311`): keep the `portable` and `passthrough` branches and the marker branches that have real WGSL; replace the final `generated-texture` / `generated-basic` flat-colour fallbacks with `throw new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING", { marker })`. Unit test: shader sources from `SkinnedLitMaterial` (`"skinned-lit"`), `AnimationToonMaterial` (`"animation-toon"`), `EnvironmentBackgroundPass` (`"environment-background"`) and `ScreenSpaceLineMaterial` (`"screen-space-line"`) each throw with `code === "WGSL_PROGRAM_MISSING"`; an `instanced-pbr` marker still returns a program.
- [ ] Delete `packages/rendering/src/production-runtime/backends/webgpu/*.ts`, `backends/webgl2/*.ts`, `backends/WebGPURendererBackend.ts`, `webgpu/WebGPUPipelineCache.ts`, `webgpu/WebGPUBuffer.ts`, `webgpu/WebGPUTexture.ts`, `webgpu/WebGPUCompute.ts`; fix importers (`rg -l "WebGPURendererBackend|WebGPUPipelineCache|backends/webgpu|backends/webgl2" packages tools apps`).
- [ ] Delete `packages/materials/src/NodeMaterial.ts`, its export and the README "node materials" claim; update the editor serializer that references it to drop the node type with a load-time warning.
- [ ] `apps/wow-webgpu-instancing`: delete the app and its route-health entry.
- [ ] `apps/wow-webgpu-product-viewer/src/main.ts:51-66,59`: remove material clamps and `u_productColorSmoothing`; re-capture evidence; if the Duck renders wrong, delete the route rather than tune it.
- [ ] Rename `apps/webgpu-lab` → `apps/backend-availability-lab`, `apps/showcase-webgpu-particle-lab` → `apps/showcase-particle-lab`; update `showcase-index`, route-health catalogue, deploy manifests; add redirects from old paths.
- [ ] Remove `production-webgpu-starter` from the template listings in `tools/agent-templates/index.ts`, `tools/production-runtime-template-readiness/index.ts` and `tools/production-runtime-package-surface-readiness/index.ts` and from docs; move `templates/production-webgpu-starter` to `templates/_archived/production-webgpu-starter` for one release. Check: `rg -l "production-webgpu-starter" tools packages docs` returns only the archive note.
- [ ] `packages/engine/src/agent-api/index.ts:4288-4300`: remove `"experimental-webgpu"` profile from the public union; passing it throws `AuraMigrationError` naming PRD 11 §6.2.
- [ ] Rewrite `docs/rendering/webgpu-current-architecture.md`, `webgpu-fallback.md`, `webgpu-hardware-matrix.md`, `webgpu-route-and-report-evidence.md` to the single status line plus a link to this PRD; remove WebGPU parity rows that cite `shaders/wgsl/pbr.wgsl`.
- [ ] Skills (`aura3d-core`, `aura3d-performance`, `aura3d-threejs-migration` sources in the repo): remove WebGPU readiness claims; PRD 13 tracks wording.
- [ ] `tests/browser/*webgpu*`: delete specs for Duck parity and sync pixel proof; move triangle, render-target and async readback specs to a `webgpu-smoke` project that runs non-gating in the macos-14 workflow.

### Phase 2: no CPU readback

- [ ] `packages/rendering/src/Renderer.ts` `executePostprocess` (`:977`, fused attempt at `:993`) and `executePostprocessAsync` (`:1113`, fused attempt at `:1129`): add `RendererOptions.postprocessGuard: "throw" | "drop"` (default `"drop"`). If `canFuseLdrPostprocess` (`:2111`) is false and `postprocess.execution !== "cpu-deterministic"`: `"throw"` → `throw new RenderDeviceError("Postprocess pass has no GPU implementation", "POSTPROCESS_PASS_CPU_ONLY", { passes: names })`; `"drop"` → remove the non-fusable passes, re-check fusability, run the fused path, push diagnostics error `POSTPROCESS_PASS_DROPPED:<name>` once per pass name per renderer. Engine: `diagnostics.strict: true` maps to `"throw"`. Unit tests (MockRenderDevice): `[bloom, tone-mapping, volumetric-light]` with `"drop"` → zero `readPixels`/`readFloatPixels` calls and one diagnostics entry; with `"throw"` → throws `POSTPROCESS_PASS_CPU_ONLY`; with `execution: "cpu-deterministic"` → current CPU path unchanged.
- [ ] `Renderer.ts:1004-1011`: replace `this.device.createRenderTarget` with `RenderTargetPool.acquire`; release at frame end. Create `packages/rendering/src/resources/RenderTargetPool.ts` with `acquire/release/trim(120)`; unit test: 100 frames → creations equal distinct descriptors.
- [ ] `packages/engine/src/agent-api/index.ts:12805-12825`: stop submitting `volumetricLight` from `effects.volumetricFog`; keep forward terms (`:12760-12786`). Diagnostics note `volumetric-fog: analytic-forward (PRD 07 pending)`. Unit test: postprocess options for a scene with `volumetricFog` contain no `volumetricLight`.
- [ ] `index.ts` postprocess builder: stop emitting `contactShadow`, `filmGrain`, `chromaticAberration` options until PRD 02/03 provide GPU passes; diagnostics error `EFFECT_PENDING_GPU_PASS:<name>`.
- [ ] Point-shadow readback (`Renderer.ts:1516-1603`, `1915-1931`): until PRD 02 replaces it, disable point shadows on the root path with diagnostics `POINT_SHADOW_PENDING_PRD02`; PRD 02 owns the GPU replacement.
- [ ] Browser test `tests/browser/perf/no-readback.spec.ts` (runs on macos-14): load each of the 18 games, wait for ready, sample `diagnostics().frame.readbacksThisFrame` for 120 frames; assert all 0.

### Phase 3: batching

- [ ] `packages/engine/src/agent-api/index.ts:14014-14017`: pass a per-scene `PrimitiveResourceCache` into `createProductionPrimitiveResources`; geometry key `primitive:segments`; material key `materialSpecKey(node.material)` (§9.2). Unit test: 300 boxes with 3 colours → 1 geometry, 1 material, 3 distinct instance colours.
- [ ] `index.ts`: implement `materialSpecKey(spec)` (stable key ordering, colour fields excluded, opacity excluded when ≥ 0.999). Unit test: key equality across colour change; inequality across roughness change.
- [ ] Runtime handles (`setColor`, `setEmissive` on primitive handles): write instance attribute when batched; copy-on-write material on other mutations. Unit test: mutating roughness on one of 100 batched boxes yields 2 draws, not 100.
- [ ] `packages/rendering/src/batching/StaticMergePlanner.ts`: `planBatches` groups by `(geometryId, materialId, castShadow, blendMode)` for instancing; remaining static opaque scalar-PBR items by `(programKey, renderStateKey, vertexLayoutKey)` for multi-draw; transparent items passthrough. Report `reasonsNotBatched` counts (`transparent`, `textured-unique`, `skinned`, `morph`, `batch:false`, `dynamic-material`).
- [ ] `Renderer.ts:2361-2386`: replace `applyRendererOwnedStaticBatching` per-frame regroup with plan built at mount / structural change (scene version), consuming PRD 01 `InstanceBuffer`; delete `MAX_GPU_INSTANCES`-chunking.
- [ ] `packages/rendering/src/batching/BatchedGeometryPool.ts`: shared VB/IB per vertex layout, `Uint32` indices rebased by vertex offset; free-list + compaction on mount. Unit test with `MockRenderDevice`: add 3 geometries, remove middle, compact → ranges contiguous and indices valid.
- [ ] `packages/rendering/src/batching/DrawDataTexture.ts`: RGBA32F width 1024, `DRAW_TEXELS = 6`, dirty-row `texSubImage2D`. Unit test: writing draw 171 updates row 1 only.
- [ ] `packages/rendering/src/batching/MultiDrawBatch.ts`: use `WEBGL_multi_draw.multiDrawElementsInstancedWEBGL` when `device.probe.multiDraw`; else loop `drawElements` with `u_drawId`. Unit test both paths issue identical command sequences on `MockRenderDevice` (one call vs N calls, same ranges).
- [ ] Program generator feature `drawId: "multi-draw" | "uniform"` and `instanceColor` / `instanceEmissive` (§8.1-8.2) in PRD 01's `program/` chunks; generator snapshot test for both.
- [ ] Depth programs (PRD 01 `pass: "depth"`) accept `drawId` and instance features so shadows render batched casters; browser test on benchmark 12-shadows: batched vs unbatched shadow region SSIM ≥ 0.999.
- [ ] `packages/rendering/src/performance/FrustumCuller.ts`: new signature `cull(bounds: Float32Array, count, frustumPlanes: Float32Array, out: Uint8Array): number` with no allocation; delete `Box3` per-item path. Unit test: allocation count via a `Float32Array` subclass spy is zero.
- [ ] `packages/rendering/src/performance/BVH.ts`: build over static bounds at mount; `refit(dynamicIndices)`; `queryFrustum(planes, out)`. Wire into `Renderer` explicit-item culling (`Renderer.ts:2217-2258`) above 256 items. Unit test: 10,000 random boxes, BVH result equals brute force.
- [ ] `packages/rendering/src/performance/Batcher.ts`: mark deprecated, re-export `planBatches`; delete next release.
- [ ] Diagnostics `renderer.batching` (§9.2) in `index.ts`; route-health draw counts read from it.
- [ ] `benchmarks/quality-rebuild/shared/scenes.ts`: add scene `19-draw-call-stress` (5,000 static primitives, 6 primitive types, 12 colours, 4 roughness values, one sun, no shadows) and `20-instancing-100k` (100,000 boxes, per-instance colour, non-uniform size `[0.3,0.6,0.3]`, rotated) with three.js equivalents (`InstancedMesh`, `BatchedMesh`): spec entries in `shared/scenes.ts` next to `"18-game-scene"` (`:337`), generators in `shared/procedural.ts`, and per-engine files `aura3d/19-draw-call-stress.ts`, `aura3d/20-instancing-100k.ts`, `three/19-draw-call-stress.ts`, `three/20-instancing-100k.ts` following the existing `16-instancing.ts` pattern; joint with PRD 12.
- [ ] Browser test `tests/browser/perf/vao-leak.spec.ts`: benchmark 16-instancing, 10,000 frames, assert `liveVertexArrays` and `liveBuffers` identical at frames 60 and 10,000.

### Phase 4: tiers and governor

- [ ] `packages/rendering/src/quality/QualityTier.ts`: `QUALITY_TIERS` frozen per §6.3; `resolveTierSettings` deep-merges overrides with validation (power-of-two shadow sizes, budgets > 0). Unit test: every field present for every tier; invalid override throws `QUALITY_OVERRIDE_INVALID`.
- [ ] `packages/rendering/src/quality/DeviceProbe.ts`: `probeWebGL2Device(gl, env)` reading `gl.RENDERER`, `WEBGL_debug_renderer_info` (if exposed), `MAX_TEXTURE_SIZE`, `MAX_SAMPLES`, `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `EXT_disjoint_timer_query_webgl2`, `KHR_parallel_shader_compile`, `WEBGL_multi_draw`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `navigator.userAgentData?.mobile` else `matchMedia("(pointer: coarse)")`. Unit test with a fake GL.
- [ ] `packages/rendering/src/quality/DeviceClasses.ts`: versioned regex table (§6.4 step 2) with `tableVersion`; fixture file `tests/fixtures/quality/renderer-strings.json` containing the runner string `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)` (from `evidence/games/report.slim.json`), `"Apple GPU"` (Safari, desktop and mobile variants), the SwiftShader/WARP strings, and at least 10 real strings per class row in §6.4 step 2 (collected from public WebGL report dumps and from the CI `DeviceProbe` logs, §18), each with `{ string, mobile, expectedTier, expectedConfidence }`. Unit test: every fixture maps to its expected tier and confidence; a test asserts every §17.1 reference device appears in the fixtures with the tier of its column.
- [ ] `packages/rendering/src/quality/TierResolver.ts`: `classifyDevice`, `calibrateTier` (30 samples, thresholds 1.25× / 0.5×), `tierCacheKey`, localStorage `TierCache` with try/catch for blocked storage. Unit tests for each step and for cache hit skipping calibration.
- [ ] `packages/rendering/src/quality/QualityGovernor.ts`: §6.5 ordering and hysteresis; wraps PRD 01 `ResolutionGovernor` (`sample(frameMs, gpuMs?) → renderScale`; "at floor" means the returned scale ≤ `effectiveFloor + 1e-6`, §6.5). Unit test with a stub `ResolutionGovernor` that returns the floor, tier `"high"`, `targetFrameMs` 16.7, constant 20 ms frames (1.2×): first step is `ssr high→off` at frame 300 ± 1, second is `ambientOcclusion high→medium` at frame 600 ± 1; frames then drop to 10 ms with the stub returning scale 1 → first up-step at frame 600 ± 1 after the drop, restoring `ambientOcclusion`; `lock()` → zero steps over 2,000 frames of 20 ms load; a tier `"medium"` run skips `ssr` (already off) and steps `ambientOcclusion` first.
- [ ] `packages/engine/src/agent-api/index.ts` `normalizeCreateAppRendererOptions` (`:4311-4327`): accept `quality`, `adaptive`, `targetFrameRate`, `batching`, `backend`; map deprecated `qualityProfile` and `performanceQuality` (§7.1) with one-time warnings; `experimental-webgpu` throws.
- [ ] `index.ts` `createAuraApp`: run probe → resolver before first frame; pass `QualityTierSettings` into renderer options and into PRD 02/03/07 consumers through `createProductionRuntimeRendererInput` (`:13871-14005`); expose `app.quality`.
- [ ] `app.quality.set(tier)`: precompile new keys via PRD 01 `ProgramWarmup` before switching; returns when switched. Browser test: switching High→Low on benchmark 18 produces no frame > 50 ms.
- [ ] `app.precompile(options)`: wrap `ProgramWarmup.precompile` for `include` variants (effect names map to PRD 07 particle/VFX material keys); report compile ms and `parallel`. Browser test `tests/browser/perf/precompile-hitch.spec.ts` on Aura Clash (its hit flash is DOM/CSS, `styles.css:299-304`, so the engine-side variants are the second fighter's skinned materials and the special-move nodes): run the `games.json` timeline through `04-action` and `05-special`; assert `frame.programsCompiledSinceReady === 0` at the end and no frame > 50 ms after ready. If it fails, the route passes the late nodes to `app.precompile({ include })` and the test re-runs; the engine fix is accepted only when the route needs no more than that one call.
- [ ] `apps/showcase-turbo-drift-circuit/src/main.ts`: replace `performanceQuality` with `quality`; remove capture-only `pixelRatio: 1` (`:2983-2988`) once capture locks tier.
- [ ] `sceneKitPerformanceBudgets` (`index.ts:9681-9722`): rename fields, remove `calibrationSource`, add deprecated getters; `collectParticleBudgetDiagnostics` (`:8344-8358`): remove `gpuReady`, rename to `heuristicUpdateCostMs`, add `measuredUpdateMs`.
- [ ] `tools/quality-rebuild-capture/games.json` + harness: capture each game twice: no params (records the `auto` decision) and `?aura3d-quality=medium&aura3d-adaptive=0` (budget gate). Implement the two URL params in `createAuraApp` for all builds (§7.1; deployed games are captured from production), append them to the URL with the route's existing query string preserved. Unit test: param parsing, invalid values ignored with a diagnostics warning, `decision.source === "explicit"` when forced.

### Phase 5: context restore

- [ ] `packages/rendering/src/resources/ResourceRegistry.ts`: register descriptors in `WebGL2Device` create paths; `rebuild()` per §6.9. Unit test with `MockRenderDevice` simulating loss: all registered handles valid after rebuild.
- [ ] `WebGL2Device.ts:433-443`: restored listener awaits `registry.rebuild()` and `ProgramCache.rebuildAll()` before notifying `deviceRestoredListeners`.
- [ ] `index.ts` root bridge: pause scene rendering while `deviceLost()`; clear to background; resume after restored event. Browser test `tests/browser/perf/context-restore.spec.ts` on 4 games (§13 Phase 5 exit), built on the existing `WEBGL_lose_context` helper (`tests/browser/rendering-webgl2-harness.ts:988-994`) and the existing `tests/browser/context-loss-recovery.spec.ts`, which is updated to expect rebuilt pixels rather than only the restored flag.
- [ ] Texture retention policy by tier (Medium and below release decoded data; High and Ultra retain `ImageBitmap`); unit test of policy selection.
- [ ] `apps/showcase-courier-rush/src/main.ts`: add `app.onDeviceLost` / `onDeviceRestored` overlay (DOM, accessible: `role="status"`, `aria-live="polite"`).

### Route fixes (with PRD 14; each measured in the capture report)

- [ ] `apps/showcase-blockfall-reactor/src/main.ts:630`: remove `.addMany(createLockedBlockNodes())` (the per-cell hidden boxes built in `reactor-scene.ts:516`) and every `lockedNodeId` handle lookup that depends on them; delete the render-mode A/B probe (`main.ts:763-826`). Check: capture `engineFrame.drawCalls` drops and no console error.
- [ ] `apps/showcase-blockfall-reactor/src/main.ts:834-846`: replace ~80 `text3D` digit nodes with a DOM scoreboard (or one canvas texture); verify one WebGL context per page (`document.querySelectorAll("canvas")` contexts counted in capture).
- [ ] `apps/showcase-siege-golf/src/main.ts:975-985`: replace per-phase `app.setScene(buildHoleScene(...))` with runtime handle updates (PRD 09 API); capture p95 ≤ 2× p50.
- [ ] `apps/showcase-skyline-runner/src/main.ts`: remove `pixelRatio: 0.7` (`:1879`), unused tea-house and 80k Meshy model loads, evidence serialisation from the frame loop; heap ≤ 150 MB at ready (Chrome `performance.memory.usedJSHeapSize` in capture).
- [ ] `apps/showcase-neon-swarm/src/main.ts:608-627`: replace `assets.neonStreetLampProp` (272,036 tris, 15.99 MB, ×4, research/17-g4:294) with a lamp admitted at ≤ 5k tris (PRD 05 admission; or a primitive lamp); keep the per-lamp point lights. Check: capture triangles submitted ≤ 1M and asset bytes drop by ≥ 15 MB.
- [ ] `apps/showcase-mech-hangar/src/main.ts:705`, `apps/showcase-vault-breakers/src/main.ts:392`: remove `qualityProfile: "production"` (fixed DPR 1.5 via the profile). `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1522-1531`: replace the non-probe `Math.min(devicePixelRatio, 1.75)` branch with no `pixelRatio` and remove `qualityProfile: "production"`. `apps/showcase-rooftop-buckets/src/main.ts:738,743`: same. Check: capture `canvas` backing size equals `min(DPR, tier.maxPixelRatio) × CSS size`.
- [ ] `apps/showcase-courier-rush/src/city.ts`: mark static city groups `static: true`; move `?capture=review` canyon set out of the shipped bundle (dynamic import only in capture builds).

### Phases 6-8 (only after G-WGPU)

- [ ] `packages/rendering/src/program/UniformLayout.ts`: `std140Offsets`, `emitGlslBlock`, `emitWgslStruct`; unit test against hand-computed offsets for `AuraFrame` (mat4 ×3, vec4 camera, vec4 exposure/time/near/far, vec2 resolution padded) and `AuraLights`.
- [ ] `packages/rendering/src/program/chunks/*.wgsl.ts`: one WGSL sibling per GLSL chunk; `manifest.ts`; unit test of manifest parity.
- [ ] `ProgramGenerator.generate(features, { target: "wgsl" })`: assemble WGSL, emit `bindGroupLayouts` and `vertexLayout`; snapshot tests for 10 representative keys.
- [ ] `tools/wgsl-validate/`: script running pinned `naga` CLI over the warm-up corpus in a remote job (`.github/workflows/quality-rebuild-capture.yml` new job on `ubuntu-latest`; naga installed via `cargo install naga-cli --version <exact>` in the job).
- [ ] `packages/rendering/src/webgpu/device/WebGPURenderDevice.ts`: frame encoder, per-target pass, `PipelineCache` (async creation), `BindGroupLayouts`, `UniformRing`, `MipGenerator`, full pipeline state, depth shadow maps, MSAA canvas resolve; port async readback and device-loss plumbing from `WebGPUDevice.ts:844-1020`.
- [ ] Port `webgpu/WebGPUTemporal.ts`, `WebGPUPostShaders.ts`, `production-runtime/shaders/wgsl/postprocess.wgsl` into PRD 03's pass interface on WebGPU.
- [ ] Delete `packages/rendering/src/WebGPUDevice.ts`; `RenderBackend.ts` imports the new device lazily.
- [ ] Cross-backend pixel-diff job: 18 benchmark scenes rendered by Aura WebGL2 and Aura WebGPU in the same macos-14 run; ΔE2000/SSIM thresholds in §16.
- [ ] Move `effects/ResidentGPUParticleRenderer.ts` to render into the scene pass (shared depth attachment) behind PRD 07's particle API; delete `GPUParticleBackend.ts` round-trip path and `RootGpuParticleWorkload.ts` from production exports.
- [ ] `createAuraApp` `backend: "auto"`: select WebGPU only on Ultra tier with probe pass, never on Low/Medium; record selection reason in diagnostics.

---

## 15. Test requirements

All browser tests and perf captures run remotely on GitHub Actions `macos-14` (ANGLE Metal) per policy; nothing GPU-heavy runs on the Mac. Unit tests run in the normal CI unit job.

### 15.1 Unit (Vitest, `tests/unit/rendering/**`, `tests/unit/engine/**`)

- `quality/*`: tier table completeness, override validation, probe parsing, class table fixtures (≥ 10 strings per §6.4 class row, plus the runner string, `"Apple GPU"` and software rasterizers), calibration thresholds, cache key stability, governor sequences (down, up, lock, oscillation bound ≤ 2 direction changes in 600 frames at 1.2× load).
- `FrameStats`: percentiles, wrap, scopes, disjoint discard.
- `batching/*`: dedupe keys, plan grouping and `reasonsNotBatched`, pool add/remove/compact, draw-data row updates, multi-draw vs loop command equivalence on `MockRenderDevice`.
- `RenderTargetPool`: zero creations after warm frames.
- `ResourceRegistry`: rebuild completeness.
- Zero-allocation submission (acceptance of PRD 01 §6.7): `MockRenderDevice` frame of 1,000 items after 3 warm frames → `bufferCreates == 0`, `renderTargetsCreated == 0`, and no `new Map` in `ForwardPass` (spy on `Map` constructor during `render`).
- Engine: fps measured, `materialSpecKey`, volumetric fog submits no CPU pass, deprecated option mappings, `experimental-webgpu` throws.
- Phase 6: `UniformLayout` offsets, chunk manifest parity, WGSL snapshots.

### 15.2 Browser (Playwright, `tests/browser/perf/*.spec.ts`, macos-14)

- `no-readback.spec.ts` (18 games), `vao-leak.spec.ts` (10,000 frames), `context-restore.spec.ts` (4 games), `tier-switch-hitch.spec.ts` (benchmark 18, High↔Low, no frame > 50 ms), `precompile-hitch.spec.ts` (Aura Clash first hit), `governor.spec.ts` (benchmark 18 only, which is a local build: a benchmark-only `?loadMs=<n>` fragment loop in `benchmarks/quality-rebuild/aura3d/18-game-scene.ts`, never in engine or game code; assert render scale reaches the effective floor before the first feature step; remove load and assert recovery to the starting tier within 1,500 frames).
- `batching-pixel-identity.spec.ts`: 18 benchmark scenes, `batching: "on"` vs `"off"`, max per-pixel abs diff ≤ 2/255 and SSIM ≥ 0.999 (float summation order may differ by 1 LSB).
- `fps-agreement.spec.ts`: engine `frame.fps` within 10% of harness rAF fps on 3 games (Orbital Defense, Gravity Post, Deep Recovery).
- Phase 7: `webgpu-parity.spec.ts` cross-backend diff (Chrome on macos-14 with WebGPU enabled; skipped with a recorded reason if `navigator.gpu` is absent on the runner).

### 15.3 Perf captures (gating)

- `tools/quality-rebuild-capture` 18-game run: forced Medium + `adaptive=0`, viewports 1920x1080, 1280x720, 390x844; gate per §17.2 via `tools/perf-gate/`.
- `benchmarks/quality-rebuild --perf`: scenes 16-20; gate per §17.3.
- Two consecutive green runs required for any phase exit that cites perf.

---

## 16. Visual acceptance tests

Perf work must not buy speed with pixels, and tiers must look like tiers. Every row needs vision-model review (claude-opus-5.5 via Kiro Prism, same rubric as research/21 and research/23) plus human owner sign-off for the rows marked H.

| # | Scenes / games | Reference | Criterion | Threshold | Review |
|---|---|---|---|---|---|
| V1 | Benchmark 01-20, batched vs `batching: "off"` | Aura unbatched, same run | Pixel identity | SSIM ≥ 0.999, max per-channel diff ≤ 2/255 | automated |
| V2 | Benchmark 16-instancing, 20-instancing-100k | three.js r185 same scene (`benchmarks/quality-rebuild/three/`) | Instance field extent, spacing, rotation, per-instance colour match | Automated: the bounding box of instance-coloured pixels (HSL hue 0.50-0.72, saturation ≥ 0.25, matching the `instancingGrid` palette in `benchmarks/quality-rebuild/shared/procedural.ts:41`) has width and height within ±5% of three.js and centroid within 2% of frame width; vision score ≥ three.js − 0.5. Today's Aura grid (30% of authored extent) fails the automated check | automated + vision |
| V3 | Benchmark 19-draw-call-stress | three.js r185 `BatchedMesh` version | Same composition and shading; batching does not flatten material variety | vision score ≥ three.js − 0.5; automated: count of distinct (colour, roughness) clusters in the frame (k-means on lit pixels, k = 48) ≥ 40 of the 48 authored combinations (12 colours × 4 roughness) | automated + vision |
| V4 | Benchmark 01, 06, 13, 18 at deviceScaleFactor 2, High tier | three.js r185 at `setPixelRatio(2)` | Edge sharpness, no shimmer/stair-stepping on thin lines | anti_aliasing category ≥ three.js − 0.5 | vision + H |
| V5 | Benchmark 01-18 at each tier (Low, Medium, High, Ultra) | Aura High tier | Low still reads correctly (shadows present, materials distinguishable); Ultra ≥ High | Low overall ≥ High − 1.5; Medium ≥ High − 0.75; Ultra ≥ High; no category at Low drops to ≤ 2; automated: Low's shadow-region mean luminance in benchmark 12 is ≤ 0.8 × the lit-region mean (shadows not dropped) | automated + vision |
| V6 | 18 games, `03-mid` + `04-action` shots, forced Medium | Per-game category scores in research/21 until PRD 14 records an accepted baseline in `evidence/prd-14/baseline.json`; then that file | Perf changes do not lower visual categories | no category drops > 0.5 vs the reference for that game, scored in the same run against the reference image re-judged with the same model and prompt (pairwise, to remove judge drift) | vision + H |
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
| Live particles | 2,000 | 10,000 | 50,000 | 200,000 |
| GPU memory | ≤ 256 MB | ≤ 512 MB | ≤ 1 GB | ≤ 2 GB |
| JS heap at ready | ≤ 150 MB | ≤ 250 MB | ≤ 350 MB | ≤ 500 MB |
| Shader compile before first interactive frame | ≤ 1.5 s | ≤ 1.0 s | ≤ 1.0 s | ≤ 1.0 s |
| Compile stalls after ready | 0 frames > 50 ms from compile | same | same | same |
| Bundle added by this PRD (critical path) | ≤ 19 KB gzip total, itemised from §6.11 (tiers + resolver 3, governor 2, telemetry 2, batching 6 = R4 2 + R5 4, registry 3, warm-up 1, BVH/culler 2), measured by `pnpm check:bundle-size --splitting` (the current harness re-inlines dynamic imports, `ProductionRuntimeRenderer.ts:64-66`; the flag is a Phase 0 task, joint with PRD 15); net of removed WebGPU façades and CPU post kernels it must be ≤ 10 KB | same | same | same |
| Lazy chunks loaded at this tier | none | SAO (PRD 03) | GTAO, SSR, froxel fog | + temporal passes; WebGPU device chunk ≤ 120 KB gzip only if selected |
| Mobile | primary mobile tier | flagship phones | not selected on phones by auto | never on phones |

Mobile thermal rule: on `mobile === true`, the governor uses `targetFrameMs` 33.3 unless the app sets `targetFrameRate: 60`, and steps down after 120 frames instead of 300.

### 17.2 Runner gate (macos-14, Apple Paravirtual GPU via ANGLE Metal, 3 vCPU)

This is the only GPU environment available in CI today. It is far below the Low hardware class, so the gate is relative to what Orbital Defense and Vault Breakers already achieve on it (59.6 / 57.4 fps at 1080p, `report.slim.json`). Games run forced Medium settings with `adaptive=0`. Desktop viewports have DPR 1 on the runner; the emulated 390x844 DPR-3 viewport renders at Medium's 1.5 cap.

| Viewport | p50 interval | p95 interval | p99 | Readbacks | Draws |
|---|---|---|---|---|---|
| 1280x720 | ≤ 20 ms | ≤ 34 ms | ≤ 50 ms | 0 | ≤ 300 |
| 1920x1080 | ≤ 33 ms | ≤ 50 ms | ≤ 84 ms | 0 | ≤ 300 |
| 390x844 (DPR 3 emulated, backing at Medium DPR 1.5) | ≤ 33 ms | ≤ 50 ms | ≤ 84 ms | 0 | ≤ 300 |

All 18 games must pass, for two consecutive runs. A game that already passes must not regress by more than 15% p50. Engine `frame.fps` must agree with harness fps within 10%.

### 17.3 Benchmark perf gate (runner)

| Scene | Aura p50 vs three.js r185 p50, same runner | Draws |
|---|---|---|
| 16-instancing (10k) | ≤ 1.25× | ≤ 2 |
| 17-large-environment (576 buildings) | ≤ 1.25× | ≤ 100 (three.js reports 2,395; Aura 1,135 today) |
| 18-game-scene | ≤ 1.25× | ≤ 40 |
| 19-draw-call-stress (5,000) | ≤ 1.5× three.js `BatchedMesh` | ≤ 20 with multi-draw; ≤ 50 loop fallback |
| 20-instancing-100k | ≤ 1.25× | ≤ 2 |

### 17.4 CPU microbenchmarks (Node, runner)

- `ForwardPass` + `MockRenderDevice`, 1,000 items, 3 warm frames then 300 measured: p50 ≤ 2 ms, zero buffer/target creations.
- `planBatches` on 5,000 items: ≤ 15 ms (mount-time only).
- `BVH.queryFrustum` on 10,000 items: ≤ 0.3 ms.
- `QualityGovernor.sample`: ≤ 0.01 ms.

---

## 18. Browser coverage

| Browser | Backend | Coverage | CI |
|---|---|---|---|
| Chromium (Chrome/Edge) on macOS | WebGL2 via ANGLE Metal | Full: perf gates, visual gates | macos-14 (existing workflow) |
| WebKit (Safari engine) | WebGL2 | Functional + visual (V1, V5, V6); perf recorded, not gated (WebKit in Playwright is not Safari's shipping GPU process configuration) | add Playwright `webkit` project on macos-14 |
| Firefox | WebGL2 | Functional + visual; perf recorded, not gated | add Playwright `firefox` project on macos-14 |
| Chromium on Windows / Linux runners | WebGL2 via SwiftShader/WARP (no GPU) | Tier detection must return Low with `hard-floor`; functional smoke only | `windows-latest` job, 2 games |
| Any browser with `navigator.gpu` | WebGPU (Phase 7+) | V10 cross-backend diff; `auto` selection rules | macos-14 Chrome with WebGPU if adapter is available; otherwise job records "adapter unavailable" and the WebGPU phase exit cannot be claimed |

Feature availability (`WEBGL_multi_draw`, `KHR_parallel_shader_compile`, `EXT_disjoint_timer_query_webgl2`, unmasked renderer string) differs between browsers and drivers and is detected at runtime; every feature has the fallback listed in §6.11. Each CI job logs the `DeviceProbe` it saw so coverage claims name the actual capability set.

---

## 19. Mobile coverage

- **What CI can prove today:** layout and backing-store size at 390x844 DPR 3 (Playwright emulation on the macos-14 GPU). It cannot prove mobile GPU frame time or thermal behaviour.
- **Real-device lane (required for any mobile perf claim):** AWS Device Farm (via the `auraone-production-operator` profile and the gated remote-run pattern) running Chrome on 2 Android devices (one Adreno 6xx Low-class, one Adreno 7xx Medium-class) and Safari on 2 iPhones (iPhone 11 Low-class, iPhone 14/15 Medium-class). Each device runs the 18 games for 60 s at `quality: "auto"` and records `diagnostics().frame`, tier decision and governor steps. Until this lane runs, mobile budgets in §17.1 are labelled "unverified" in every report and README, and no mobile performance claim is made.
- **Mobile acceptance:** auto-detection lands on Low or Medium on all four devices; p50 ≤ 33.3 ms after 60 s (thermal); no governor oscillation (≤ 4 direction changes per minute); V9 passes on device screenshots, not only emulated ones.
- **Context loss:** run the restore test on one Android device (backgrounding the tab for 60 s is the realistic trigger).

---

## 20. Screenshots and evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd-11/<phase>/`, produced only by the remote workflows:

- `report.json` from `tools/quality-rebuild-capture` per phase, with `runs[].fps`, `runs[].engineFrame`, `fpsAgreement`, tier decision, governor log, `readbacksThisFrame`, draw/instance counts, heap, GPU memory.
- `perf-gate.json` from `tools/perf-gate/` listing every budget row with measured value, threshold, pass/fail.
- Benchmark `report.json` with `perf` blocks for scenes 16-20, and side-by-side JPEGs for 16, 19, 20 (V2, V3).
- Per-tier contact sheets (Low/Medium/High/Ultra) for benchmark 01-18 (V5) and 6 games (Deep Recovery, Courier Rush, Gravity Post, Turbo Drift, Aura Clash, Patrol Wing).
- DPR 2 crops of benchmark 01/06/13/18 next to three.js at DPR 2 (V4).
- Deep Recovery: 60-frame filmstrip before and after Phase 2 (V7).
- Context restore: pre-loss and post-restore screenshots with SSIM value (Phase 5).
- Vision review markdown for every V-row, with model id and prompt, alongside the images reviewed.
- WebGPU (Phase 7): cross-backend diff images (`diff.png` heatmap) and ΔE2000/SSIM table.
- A `CLAIMS.md` line per shipped claim, each linking to the report entry that proves it. Claims without a link are deleted.

---

## 21. Completion criteria

This PRD is complete when all of the following hold, on evidence produced by the remote workflows:

1. All 18 games pass the §17.2 runner gate for two consecutive runs, including Deep Recovery, Courier Rush and Gravity Post.
2. Engine-reported fps agrees with harness fps within 10% for all 18 games; `diagnosticsState.fps || 60` no longer exists.
3. Zero CPU readbacks and zero render-target creations in any production frame after ready, across all 18 games.
4. VAO/buffer counts flat over 10,000 frames on benchmark 16 and 20.
5. Benchmark perf gates (§17.3) pass; V1-V9 pass with the listed review.
6. Tier auto-detection is live by default, decisions are persisted and reported, the governor is on by default, and `qualityProfile` / `performanceQuality` are deprecated with mappings.
7. Context loss restores rendering on the 4 test games.
8. WebGPU: Phase 1 freeze complete; no document, README, skill, route name or diagnostic claims WebGPU rendering for games. Either G-WGPU was reviewed and recorded with a go/no-go decision, or Phases 6-8 are complete with V10 (and V11 for Phase 8) passing.
9. Mobile: either the real-device lane has run with the §19 acceptance met, or every mobile perf number is labelled "unverified" in reports and docs.
10. The owner, looking at the shipped games on a HiDPI laptop and a phone, judges them smooth and sharp. Counters alone do not meet this criterion.

---

## 22. Rollback considerations

- Each phase is a separate PR series; revert by phase. Phases 0 and 1 have no runtime behaviour risk for games (games never used WebGPU).
- Batching: `batching: "off"` per app, `batch: false` per node, and an engine-level kill switch `globalThis.__AURA3D_DISABLE_BATCHING__ = true` read at mount (documented for incident use, removed after two releases).
- Multi-draw: auto-disabled when `WEBGL_multi_draw` is absent; kill switch `__AURA3D_DISABLE_MULTIDRAW__` forces the loop fallback if a driver bug appears.
- Tiers: `quality: "medium"` + `adaptive: false` reproduces a fixed configuration; deleting the localStorage key resets detection.
- No-readback guard: in production it drops passes rather than throwing, so a missed CPU pass degrades visuals, not availability. Rolling back means re-allowing `execution: "cpu-deterministic"` per app, which is permitted only for debugging, never for a shipped route.
- WebGPU deletions: git revert restores files; deleted routes have redirects for one release.
- Context restore: if rebuild fails, `onDeviceLost` overlay offers reload; the previous behaviour (black canvas) is never restored silently.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Runner GPU too weak for Medium settings once PRD 02/03 add cascades, GTAO and froxels | Medium | Gate fails for reasons unrelated to waste | Gate is relative to Orbital Defense/Vault Breakers; if they fall below 60 after PRD 02/03 land, re-baseline thresholds from them with the change recorded; add a real-GPU runner (self-hosted or cloud GPU) through the provisioning scripts |
| Tier misclassification (masked renderer strings, new GPUs) | High | Wrong default quality | Calibration frames + governor correct it; class table versioned and updated from capture logs |
| Governor oscillation or visible popping when features step | Medium | Distracting quality changes | Hysteresis, feature-by-feature steps, warm-up of next-lower keys, lock during capture; V8 review |
| Dedupe breaks per-node material mutation in existing games | Medium | Wrong colours or shared edits | Copy-on-write; migration scan script; per-node `batch: false`; V1 pixel identity |
| Multi-draw driver bugs (ANGLE backends) | Low-medium | Corrupt draws on some devices | Loop fallback, kill switch, pixel-identity test per browser job |
| Transparent sorting changes from batching | Low | Halos, wrong overlap | Transparent items are never instanced or multi-drawn (passthrough, §11) |
| WebGPU work restarts before WebGL2 path is fixed | Medium | Repeats the sunk-cost pattern | G-WGPU gate is a written decision with evidence links; Phase 6 tasks blocked in tracker until recorded |
| WGSL chunks drift from GLSL | Medium (Phase 6+) | Backend visual divergence | Manifest parity test, naga validation, V10 cross-backend diff in the same CI run |
| Mobile claims made without real devices | High | Repeats fabricated-evidence pattern | §19 "unverified" labelling rule; completion criterion 9 |
| PRD 15 picks three.js `WebGPURenderer` | Unknown | Phases 6-8 wasted if started | G-WGPU item 4 requires PRD 15 decision first |
| Removing CPU volumetric makes Deep Recovery look flatter before PRD 07 lands | High | Temporary visual loss | Accepted: 0.5 fps is unplayable; V7 floor; PRD 07 GPU fog scheduled next |

---

## 24. Explicitly out of scope

- Shadow algorithms, cascade fitting, PCF/PCSS implementation (PRD 02); this PRD only sets per-tier parameters.
- Post kernels: GTAO, SSR, bloom, TAA, SMAA implementations (PRD 03).
- Particle simulation, VFX authoring and GPU volumetric fog (PRD 07); this PRD sets budgets and the WebGPU compute decision.
- The program generator, UBOs, uniform cache, `InstanceBuffer`, VAO fix, blend modes, DPR default and `ResolutionGovernor` implementation (PRD 01); this PRD measures them.
- Game content rebuilds and art direction (PRD 14), shared game runtime APIs (PRD 09).
- Package consolidation, bundle core budget, three.js adoption decision (PRD 15).
- Occlusion culling (hardware occlusion queries or Hi-Z), GPU-driven culling, indirect draws on WebGL2, deferred or visibility-buffer rendering, OffscreenCanvas/worker rendering, WebXR, ray tracing. Revisit after Phase 8 with measured need.
- Real-device lab procurement beyond the AWS Device Farm lane described in §19.

