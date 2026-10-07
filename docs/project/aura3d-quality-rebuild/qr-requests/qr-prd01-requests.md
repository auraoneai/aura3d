# QR requests — lane 01 outbound

Status of lane 01's §13.4 requests (PRD-01 "Requests to other lanes"). The
contract mechanism is GitHub issues labelled `qr-request` + `to:prdNN`
(CONTRACTS §6.5); this file is the in-repo ledger mirror — the issue tracker
entries reference it. Each row is non-blocking: the "Meanwhile" column is what
lane 01 does until the change lands.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-03-1 | 03 | `agent-api/compiler/postprocess.ts`: with `A3D_QR_CORE_OUTPUT` on, publish `colorGrade.exposure × autoExposure` on the C-01 blackboard as `"prd03.exposure"` and stop sending `toneMapping.exposure` to the legacy present shader | C-05, C-13 | OutputPass uses `output.exposure` only |
| Q-03-2 | 03 | `RendererPostprocessPlan.ts`: tag passes `space: "linear-hdr" \| "display"`; `webgl2/LegacyPost.ts`: RGBA16F ping-pong + near/far from C-08 under `A3D_QR_CORE=v2` | C-13, C-08 | FrameGraph enforces `space` for `post-hdr` contributors only |
| Q-03-3 | 03 | `renderer/PostprocessExecution.ts`: remove the CPU readback chain, reject non-GPU passes with `POSTPROCESS_PASS_NOT_GPU:<name>` | C-13, C-28 | Deep Recovery FPS criterion integrated |
| Q-04-1 | 04 | per-class `programFeatures()` overrides on the five PBR material classes; drop `environmentBrdfLutTexture` once `u_dfgLut` is renderer-owned | C-03, C-02 | `program/MaterialFeatures.ts` default derivation covers all classes |
| Q-04-2 | 04 | `GLTFRenderResources.ts`: glTF `alphaMode: "BLEND"` → `blendMode: "alpha"`, `"MASK"` → `alphaMode: "mask"` | C-04 | `resolveBlendMode` maps the legacy `blend: true` |
| Q-07-1 | 07 | `SpriteFlipbook` `additive: true` → `blendMode: "additive"`; particles `materialMode: "additive-glow"` → `"additive"`; `AtmosphereWetness` hex parser → `parseAuraColor` | C-04, C-06 | `prd01-blend-modes` proves blend modes on lane quads |
| Q-09-1 | 09 | `GameAppRuntime.ts:127-139`: drive resolution through `Renderer.setRenderScaleCeiling` / `ResolutionGovernor` | C-27 | game apps keep today's governor with flag off |
| Q-10-1 | 10 | `LayeredSceneComposition.ts:648` `parseHexColor` and `WaterSurface.ts:188` → `parseAuraColorSrgb`/`parseAuraColor` | C-06 | duplicate parsers remain |
| Q-11-1 | 11 | `agent-api/app/rendererOptions.ts`: profiles stop setting `pixelRatio`/`preserveDrawingBuffer` under `A3D_QR_CORE=v2`; map `qualityProfile` → C-27 tier | C-27 | lane scenes pass explicit renderer options |
| Q-11-2 | 11 | `GameRenderPreset.ts:158` governor resolution step calls `ResolutionGovernor` | C-27 | unit test of `ResolutionGovernor` alone |
| Q-11-3 | 11 | `renderer/CullingBatching.ts`: use `MeshConsolidation.consolidateStatic` at mount, skip per-frame regrouping | C-07, C-01 | lane 01 measures static scenes without regrouping |
| Q-11-4 | 11 | `GameRenderPreset.ts:373/:450`: no `targetFormat:"rgba8"`/implicit tone map under `A3D_QR_CORE_OUTPUT`; `WebGPUDevice.ts` maps C-04 `blendMode`; `RendererTiming.ts` feeds C-28 `gpuMs` | C-04, C-27, C-28, C-29 | WebGPU keeps alpha-only blend meanwhile |
| Q-12-1 | 12 | C-33 step plugin `prd01-diagnostics` + C-33 metric plugins (mask IoU, region SSIM, ΔE2000, temporal σ); run the ACES-vs-AgX A/B at next G-PANEL | C-30, C-33 | `qr-prd01-core.yml` computes the same metrics with `tests/qr/prd01/metrics/` |
| Q-13-1 | 13 | template `screenshot.spec.ts` files → `app.capture()`; skills document `quality`/`output`/`tessellation`/`blend`/`rotationOrder` from `F-01-*` | C-05, C-40 | facts stay `proposed` until verified |
| Q-14-1 | 14 | `aura3d codemod core-v2 --write` per route; re-author Courier Rush + Material Asset Inspector group layouts; migrate class-(b) readback rows | C-39, R21 | lane scenes cover the mechanics |
| Q-15-1 | 15 | `index.ts` `configureCanvas`/resize/`devicePixelRatioSafe`/`setPerformanceQuality`: call `resolveCanvasPixelRatio` + `Renderer.setRenderScaleCeiling` under `A3D_QR_CORE=v2` | C-27, C-06 | DPR policy tested as pure function + lane scenes |
| Q-15-2 | 15 | `compiler/{geometry,primitives}.ts`: use `createPrimitiveGeometry`; emit `modelMatrix` without `size` + `RenderItem.geometryMatrix = S(size ⊙ fit)` | C-07 | lane scenes build primitives via `@aura3d/rendering` |
| Q-15-3 | 15 | `compiler/renderer.ts`: context `{ antialias: false, preserveDrawingBuffer: false, alpha: false, powerPreference }` under `A3D_QR_CORE=v2` | C-05, C-29 | lane canvases use the new attributes |
| Q-15-4 | 15 | `packages/lean/**`: route lean builders through `Renderer` + OutputPass; delete `LeanWebGL2Device.ts`/`LeanProductionRenderer.ts` | §3.8 | lean stays on the lean device (flag-off-equivalent) |
| Q-15-5 | 15 | `production-runtime/index.ts` re-export removals, export manifest, `BUNDLE_SIZES.md` renegotiation, exposure warning/type change | §4.4 | lane 01 reports bundle deltas in its PRs |
| Q-15-6 | 15 | `index.ts:14899-14934` primitive material: map `AuraMaterialSpec.blend`/`depthWrite`/`ior` into render state; physics call sites consume C-06 world TRS + C-07 capsule dims | C-06, C-07, C-15 | fields listed in `diagnosticOnly.prd01.ts` |
| Q-15-7 | 15 | PR 0b-1/T3.8 verbatim moves into lane 01's `compiler/{sceneGraph,color}.ts` | C-06 | lane 01 writes replacements in `agent-api/{sceneGraph,color}.ts`, wires after the move |

## Requests added by lane 01 (outside the PRD-01 table)

| ID | To | File / exact change | Reason |
|---|---|---|---|
| QR-OWN-1 | 15 | `.github/QR_OWNERSHIP.json`: add `tests/qr/prdNN/` (or `tests/qr/`) per-lane ownership mapping | `tests/qr/prd01/**` resolves to owner 15 today, but PRD-01 §16.4 assigns `tests/qr/prd01/` to lane 01. Lane 01 proceeds in these files; this request reconciles the JSON. |
| Q-15-8 | 15 | Migrate the 45 owner-15 class-(b) readback rows (`tests/browser/*`, `tools/*-parity/*`, `tests/visual/pbr-environment-pixels.spec.ts`, `apps/advanced-examples-gallery/src/main.ts`) to `app.capture()`; keep `agent-api/index.ts` `screenshot()` on same-task readback once `A3D_QR_CORE` removes `preserveDrawingBuffer` | C-05 | `evidence/prd01/readback-triage.json` |
| Q-12-2 | 12 | `tools/compare-engines/index.ts` root-canvas `toDataURL` readback → `app.capture()` | C-05 | `evidence/prd01/readback-triage.json` (class b) |
| Q-13-2 | 13 | `tools/agent-docs/simulation.ts` + `tools/agent-dogfood/index.ts` class-(b) readbacks → `app.capture()` | C-05 | `evidence/prd01/readback-triage.json` (class b) |
| Q-15-9 | 15 | `index.ts:9608` safe-basic catch: emit C-36 degradation `{code:"renderer-mount-failed"}` (lands in `diagnostics().degradations` + `onDegradation`) and honor `renderer.strictMount` (reject `ready()`, no safe-basic draw) under `A3D_QR_CORE` | C-36, C-05 | `onRendererError` forwarding handles the code verbatim once emitted; `renderer-mount-failure.spec.ts` asserts (1)-(3) today, (4) + no-safe-basic-draw at integrated I9 |
| Q-15-10 | 15 | `compiler/renderInput.ts`: adopt or supersede `setPrd01ModelMatrixCache` + `agent-api/sceneGraph.ts` `createModelMatrixCache` (static-node matrices + per-spec-array instance transform/color retention) when the `compiler/sceneGraph.ts` bridge lands; replace the module-level opt-in with a flag thread if one materializes | C-07, §15 Phase-6 | `prd01-scene-graph.test.ts` cache describe-block |

## PR D (Phase 2: resolution + readback) status notes — 2026-10-06

- §6.9: `renderer/PixelRatio.ts` `resolveCanvasPixelRatio` (explicit ??
  `resolution.pixelRatio` ?? `min(dpr, tier.maxPixelRatio)`, no [1,2] clamp —
  Ultra@DPR3 = 3), `resolveCanvasContextAttributes` (flag-on
  `{antialias:false, alpha:false, preserveDrawingBuffer:false,
  powerPreference:"high-performance"}`; flag-off baseline unchanged;
  `renderer.debug.preserveDrawingBuffer` opt-in + dev warning),
  `watchDevicePixelRatio` (matchMedia `(resolution: Xdppx)` re-arm chain).
- `ResolutionGovernor.ts`: `sample(frameMs, gpuMs?)` uses `gpuMs ?? frameMs`
  (C-28), renderScale in `[tier.minRenderScale, 1]` stepping 0.1 — down after
  30 consecutive > `targetFrameMs·1.1`, up after 120 < `targetFrameMs·0.8`;
  HiDPI floor `1/devicePixelRatio` unless `allowSubCssResolution`.
- `Renderer`: `options.resolution`/`qualityTier` opt-in (absent → bit-identical),
  `setRenderScaleCeiling`, `renderScale = min(ceiling, governor)`, per-frame
  `governor.sample` at `device.endFrame()` in both `render`/`renderAsync`,
  `resolutionReport` getter backing C-31 `resolution`
  (`pixelRatio/renderScale/ceiling/backing`), `resizeToDisplay` DPR through
  `resolveCanvasPixelRatio`, DPR-change watcher disposed with the renderer.
- `WebGL2DeviceOptions.powerPreference` plumbed to `getContext("webgl2", …)`
  (Q-15-3's call site stays lane 15's).
- C-31 `resolution`: `collectResolution` reads `Symbol.for("a3d.prd01.renderer")`
  (`PRD01_RENDERER`, the Q-15-1 seam) for the renderer report, else falls back
  to `screenshot()`/`app.canvas` for real backing/CSS dims; unobservable fields
  stay null.
- C-05 real `capture()` in the `lanes/prd01` output factory: `app.step()`
  renders a frame synchronously, then `readPixels` the default framebuffer in
  the same task (before compositing — `preserveDrawingBuffer` never set), rows
  flipped, `ImageBitmap`/`OffscreenCanvas→PNG Blob`; falls back to
  `app.screenshot()` on non-webgl2/disposed surfaces. `onRendererError` now
  forwards `diagnostics().degradations` verbatim (C-36 codes incl.
  `renderer-mount-failed`) before the plain `errors` pass-through.
- Readback triage committed (`evidence/prd01/readback-triage.json`,
  `tools/quality-rebuild-codemods/readback-triage.mjs`): 229 files, class
  a=176 / b=52 / c=1. No lane-01-owned class-(b) rows exist, so there was
  nothing to migrate in-tree; requests filed for the rest — Q-13-1 (templates),
  Q-14-1 (`apps/showcase-gravity-post`), Q-15-8 (45 owner-15 rows incl.
  `apps/advanced-examples-gallery`), Q-12-2 (`tools/compare-engines`), Q-13-2
  (`tools/agent-docs`/`agent-dogfood`). The single class-(c) row
  (`tests/clean-room/renderer-extension`) is owner 15.
- `Renderer.captureFrame` already did same-task readPixels; it is the provider
  readback (class a), not a class-(b) consumer.
- Harness `?tools=` routes: `canvas-dpr` (deviceScaleFactor:2 → backing 2× CSS,
  §6.9 attrs via `resolveCanvasContextAttributes`), `app-capture` (capture() vs
  same-task `toDataURL` MAD ≤ 1/255 at `a3d-qr=none`+`core`),
  `renderer-mount-failure` (patched `ProductionRuntimeRenderer.create` reject →
  ready() resolves, errors recorded, onRendererError fires; strictMount +
  `renderer-mount-failed` code recorded, asserted at I9 per spec note).
- `RenderBackendOptions.powerPreference` forwarded → `WebGL2DeviceOptions` →
  `getContext`; lane canvases pick the §6.9 attribute set via
  `resolveCanvasContextAttributes({flagOn})` (app mount's context attrs remain
  lane-15 wiring, Q-15-3).
- C-39 codemod `core-v2` (`tools/quality-rebuild-codemods/core-v2.ts` + `run.ts`):
  pure `source → code + rows` — pixelRatio overrides (`Math.min(cap,dpr)` and
  literal `1` → `renderer.resolution.maxPixelRatio`, other absolutes →
  `resolution.pixelRatio`; Turbo-Drift capture-only spread rewritten in place),
  `qualityProfile` → `quality` (production→high, safe-basic→low, else
  approximate), safe-basic classification rows, ambient irradiance review rows.
  Registered via `registerCodemod` + `core inspect-programs` in
  `commands/prd01/index.ts`. Evidence generated: `safe-basic-inventory.json`
  (140 entries / 94 files: 102 mode-select, 33 doc, 5 warning-assert) and
  `ambient-review.json` (48 sites, intensity→intensity/π).

## Incoming requests to lane 01

Recorded in PRD-01 §13.5 (Q-01-* from lanes 02, 03, 04, 06, 07, 08, 09, 15; R-01-*).
Disposition is unchanged: all accepted per §13.5 except lane 08's legacy
camera-fade patch (declined under §3.7).

## PR B (Phase 1) status notes — 2026-10-06

- C-06 real bodies landed in `agent-api/sceneGraph.ts` + `agent-api/color.ts`
  (still resolving to owner 15 per QR-OWN-1). The C-06 contract file
  (`contracts/sceneGraph.ts`, owner 15) exports free functions, not a slot —
  there is no `sceneGraphSlot.provide` to call; the flag-on path lands when
  Q-15-7's `compiler/{sceneGraph,color}.ts` verbatim move bridges to these
  impls. `AuraTransformSpec.quaternion`/`rotationOrder` are already on the spec
  type, so no compiler change is needed for the data path.
- C-07 instancing: `ForwardPass`/`contracts/renderItem.ts` already compose
  `u_modelViewProjection · instanceMatrix · position` (attribute path
  `a_instanceMatrix0..3`, uniform fallback, per-instance CPU fallback) —
  `u_modelMatrix · instance · u_geometryMatrix` holds because the geometry
  fold (`size ⊙ fit`) is baked into `modelMatrix` upstream by Q-15-2. No
  ForwardPass change was required; `instanceBufferSlot.provide` wires the real
  `InstanceBuffer` (doubling growth, dirty-range `updateBuffer`, VAO eviction).
- C-07 `createPrimitiveGeometry` + `Geometry` extensions (cylinder frusta,
  torus XY-plane, box, capsule ellipticity, litPlane segments) landed in
  `geometry/Primitives.ts` + `Geometry.ts`. Legacy `Geometry.cylinder` wall
  winding was verified outward-facing and preserved under the new layout.
- FrameGraph seam: `prd01.forwardTarget` blackboard key + `ctx.sceneDepth`
  filled from the forward target's depth texture; set in both render paths.
  Unflagged, additive-only plumbing (nothing consumes it yet → flag-off
  pixel-identical).

## PR C (Phase 2: blend modes + render targets) status notes — 2026-10-06

- C-04 blend modes: `BlendModes.ts` (queue policy), §6.8 factor tables +
  `renderStateKey` packing in `contracts/blend.ts`, `Material` C-04 fields
  (`blendMode`, `depthCompareV2`, `alphaToCoverage`; non-opaque →
  `depthWrite:false` default), `WebGL2StateCache` separate func/equation dedupe.
- Legacy custom-blend reachability (lane 03 Q-01-1): `{srcRGB, dstRGB, srcAlpha:ZERO, dstAlpha:ONE}` preserved verbatim through `resolveBlendMode` → `blendFuncSeparate`; the lane-03 case is pinned in `prd01-blend.test.ts`.
- ForwardPass: transparent bucket orders by `blendRank` (additive/multiply after the alpha group, order-independent), then back-to-front distance inside rank 0; `isTransparentRenderItem` consults `blendStateIsTransparent` (additive/multiply/custom are transparent even with `blend:false`); opaque items keep `blendRank` undefined → flag-off sort identical.
- Non-01 file edits (QR-OWN gaps; per PRD §5.1 assignment + ledger convention):
  - `webgl2/MultiDraw.ts` (owner 11): `blendMode`/`depthCompareV2`/`alphaToCoverage` application; legacy reset emitted only via `blendEquationDiffers` so flag-off never emits `blendEquationSeparate` on a fresh context; `uploadTextureUniform` now receives the declared uniform type for `GL_SAMPLER_2D_ARRAY` → `TEXTURE_2D_ARRAY` (lane 06 Q-01-3).
  - `webgl2/Samplers.ts` (owner 02): declared-type → target map (`sampler2DShadow`→2d, `samplerCube*`→cube, `sampler2DArray*`→2d-array) with `texture.dimension` fallback.
  - `webgl2/ContextLifecycle.ts` (owner 11): `clearRenderTarget(color, attachment?)` → `clearBufferfv` path.
  - `webgl2/Probe.ts` (owner 11): `readPixels(..., attachment?)` → `readBuffer` select/restore.
  - `RenderDevice.ts` (owner 11): descriptor +5 PR 0a fields, `RenderTarget` optional `dimension`/`layers`/`colorTextures`/`layerTargets`, `MockRenderDevice` builds feature targets incl. per-layer children + per-attachment pixel buffers.
  - `Texture.ts` (owner 06): `layers` stored; face-less cube allowed for GPU-attachment textures (upload path still requires `cubeFaces` for CPU data).
  - `WebGPUDevice.ts`/`LeanWebGL2Device.ts` (owner 15): `UNSUPPORTED_RENDER_TARGET_FEATURE` on the new fields.
- `RENDER_TARGET_FEATURE_PENDING`: no throw sites existed in trunk creation
  code (the PR 0a stub contract listed it as pending); `createRenderTarget`
  now implements `dimension`/`layers`/`depthOnly`/`depthCompare`/`colorAttachments`
  in `createFeatureRenderTarget` (per-layer child targets sharing parent GL
  resources, MRT `drawBuffers`, `TEXTURE_COMPARE_MODE` compare, depth-only
  `readBuffer(NONE)`).
- Appendix B: F-01-02 (`material.blend`) published verified.
- Browser spec `tests/qr/prd01/browser/render-targets.spec.ts` covers the §15:1096
  acceptance (depth-only cube 6 faces, 2-attachment distinct clears, sampler2DArray
  layer 3) via `?tools=render-targets` in the lane harness.

## PR E (Phase 3a: AuraFrame UBO) status notes — 2026-10-06

- `resources/UniformBlock.ts`: std140 packer (`layoutStd140`, `uniformBlockGlsl`,
  `UniformBlock`) + `FrameUniforms` binding the frozen `AURA_FRAME_BLOCK` at
  binding 0 (304 bytes; offsets 0/64/128/192/256/272/288).
- `frameUniformsSlot.provide` in `lanes/prd01.ts`; C-08 conformance covered by
  `tests/unit/contracts/impl/prd01-frame-uniforms.test.ts`.
- Non-01 file edits (QR-OWN gaps):
  - `RenderDevice.ts` (owner 11): optional `bindUniformBuffer(buffer, binding)`
    on the interface + `MockRenderDevice.uniformBufferBindings` records
    `{bufferId, binding}` and validates `usage === "uniform"`. Custodian-neutral
    seam: flag-off call sites never reach it.
  - `WebGL2Device.ts`: `createBuffer` maps `usage:"uniform"` →
    `gl.UNIFORM_BUFFER`; `bindUniformBuffer` → `bindBufferBase`.

## PR F (Phase 3b: program generator) status notes — 2026-10-06

- `program/ProgramFeatures.ts` (canonical normalize; sparse and explicit
  records share a key), `program/ProgramKey.ts` (re-export of frozen
  `computeProgramKey`), `program/ProgramGenerator.ts` (§6.4 assembly: defines,
  AuraFrame chunks, hook splicing in (order,id) order, default bodies,
  extension-lobe-pending C-36 sink, WGSL_PROGRAM_MISSING).
- `program/chunks/*.glsl.ts` (owner-11 directory for WGSL twins): lane-01
  GLSL chunks land there per PRD-01 §15's own file list — `common`, `colorspace`,
  `brdf` (r185 port), `normal`, `instancing`, `alpha`, `lights_legacy`,
  `indirect_default`, `fog_default`, `depth`. Lane 11's WGSL twins + UniformLayout
  are unaffected; no conflict expected (separate filenames).
- `contracts/program.ts`: `generateProgram` keeps the frozen signature and now
  delegates to the lane-01 impl via `installProgramGenerator` (installed by
  `lanes/prd01.ts` import). `PROGRAM_GENERATOR_PENDING` still throws if the lane
  barrel is never loaded.
- Splice convention (documented in ProgramGenerator.ts): feature `chunks[i]`
  lands at `hooks[min(i, len-1)]`, deduped by name; `*:pars` hooks emit at
  global scope, body hooks emit inside `main` replacing the lane-01 default.
  `vertex:deform` is canonical — the generator emits `a3dDeform(pos,nrm,tan)`
  iff a registered feature contributes, else the C-18 passthrough comment.
- Conformance: `tests/unit/contracts/impl/prd01-program-generator.test.ts`
  (23 tests: 13 representative snapshots incl. balanced braces + banned-token
  scan, bucketed/clustered lights, §8.5 order, §8.7 depth/distance, WGSL throw,
  500-record key-uniqueness, hook splice order, extension-lobe-pending,
  deform passthrough↔call, contract delegation). Browser spec
  `tests/qr/prd01/browser/program-generator-compile.spec.ts` compiles+links all
  13 cases on real WebGL2 via `?tools=program-compile`.

## PR G (Phase 5: tonemap A/B prep) status notes — 2026-10-06

- Q-15-1 seam landed lane-side: `ProductionWebGL2Renderer.auraRenderer` →
  `ProductionRuntimeRenderer.auraRenderer` → controller `auraRenderer` →
  `createAuraApp` attach at `Symbol.for("a3d.prd01.renderer")` (webgl2 only;
  undefined for WebGPU/disposed mounts). DPR/`setRenderScaleCeiling` wiring
  itself remains lane 15's.
- C-05 surface real under `A3D_QR_CORE_OUTPUT`: `setOutput`/`setOutputOverlay`
  forward through the seam once mount lands; earlier calls merge into
  `pendingOutput` and flush on the error-watch interval or at `capture()`.
  Flag-off keeps the DOM-overlay fallback and records requested-vs-applied.
- C-05 URL reader (`readAura3dTonemapQuery`, re-exported via `lanes/prd01.ts`):
  `?aura3d-tonemap=aces|agx` + `?aura3d-exp=<n>` (also `tm`/`exp` for the lane
  capture) win over `options.output`.
- A/B capture matrix: `tests/qr/prd01/capture.mjs` records `aces` + `agx` on
  the aura3d engine for every lane scene under `core`; the ramp scene keeps
  the full `aces|agx|neutral × 0.5|1|2` matrix on both engines. Aura harness
  reads `tm`/`exp` into `app.setOutput`.
- Q-12-1 filed in-repo: `evidence/prd01/decisions/tonemap-default.md` (gh is
  unauthenticated — no GitHub issue). `DEFAULT_TONE_MAPPING` stays `"aces"`;
  flipping it is a separate PR against the G-PANEL outcome.

## PR H (Phase 6: submission perf) status notes — 2026-10-06

- `ForwardPass.drawItem` steady state: per-device (WeakMap, survives the
  per-frame `new ForwardPass` rebuilds at `Renderer.ts:767` and
  `InterleavedTransparentPass.ts:73`) pipeline cache keyed on
  `shader.id|vertexFormatId|topology|renderStateId:flipBit|requiredAttrsId`
  and pooled `Map` uniform packets (`bindGenerated(material, shader, features,
  into)` writes in place). `RenderPipeline.constructedCount` dev counter backs
  the "0 constructions after frame 2" lane assertion. `uploadUniforms` keeps a
  per-program last-value cache (textures compare texture/sampler/transform,
  scalars `===`, arrays element-wise vs retained snapshot).
- Instancing (flagged path) is attribute-matrix only: persistent per-device
  `InstanceBuffer` slots (`instanceBufferSlot`) keyed on count/colors with
  pow2 capacity growth; slot resize disposes the old buffer (§6.1 eviction
  covers the VAOs). `u_instanceMatrices` still lands in the packet for
  legacy-carried material params but the generated program never declares it —
  upload is skipped by reflection. Legacy `u_instanceMatrices[64]` uniform
  path untouched for flag-off.
- VAO eviction (§6.1 declared unflagged fix): `WebGL2Buffer.onDispose` →
  `drawBinder.evictVertexArraysForBuffer(buffer.id)` — the binder reverse-indexes
  every VAO key by its vertex/index/instance buffer ids, `gl.deleteVertexArray`s
  matching entries and removes the buffer from `device.buffers`.
  `diagnostics.disposedBuffers` stays live via a monotonic counter.
- Fullscreen passes (`OutputPass`, `SceneDepthCopyPass`,
  `EnvironmentBackgroundPass`) cache geometry+pipeline per variant — the
  `createFullscreenTriangleGeometry()`+`new RenderPipeline` per execute was
  leaking a GPU buffer per frame.
- Compiler-side seam (lane-15 file, flag-gated — same pattern as the Phase-5
  `createAuraApp` seam): `renderInput.ts` `setPrd01ModelMatrixCache`, installed
  by `createAuraApp` when `A3D_QR_CORE` resolves on. Static nodes
  (`!node.animation`) reuse Phase-1's fingerprinted `createModelMatrixCache`
  (`agent-api/sceneGraph.ts`) — zero-alloc fingerprint compare on the hot path.
  `instanceTransforms`/`instanceColors`/model-instance arrays are retained per
  spec array (WeakMap on `node.instances`/`node.instanceColors` + numeric
  content fold; spec arrays are mount-frozen). Q-15-10: lane 15 to adopt or
  supersede this seam when compiler/sceneGraph.ts lands.
- Q-11-3 unchanged: `applyRendererOwnedStaticMeshConsolidation` already runs at
  `Renderer.ts:1593` gated on `source.staticMeshConsolidation`; renderInput's
  `source` is rebuilt per frame so flipping it here would re-merge every frame —
  the mount-site call is lane 11's. Unit coverage (576 static boxes → 1 item,
  conserved vertex count) is in `tests/qr/prd01/unit/submission-perf.test.ts`.
- Diagnostics: `prd01.programs` reports `deviceProgramCompiles` +
  ProgramCache `reused`/`keys`; `prd01.frameAllocations` reports C-28 counters
  + `cpuSubmitMs`/`cpuFrameMs` percentiles (`FrameStatsLike.percentiles`).
  `rendererProgramCachePeek` reads the cache without creating it.
- Lane capture assertions wired: lane adapter measures a steady-state window
  (default 120 frames; `measureFrames` option; `jsHeapDeltaBytes` via
  `performance.memory` — `partial` where unavailable) → capability rows
  `zero-program-compiles`, `zero-object-creates`, `zero-pipeline-constructions`,
  `js-heap-delta`. The 18-base-scene adapter asserts
  `deviceProgramCompiles` delta 0 over 30 post-settle frames (§17.2 I8).
- Deferred: `cpuSubmitMs ≤ 40% of flag-off` comparison is a lane-12 runner job —
  the numbers are recorded (`frameAllocations.cpuSubmitMs`); the ratio verdict
  lands in CI evidence.


