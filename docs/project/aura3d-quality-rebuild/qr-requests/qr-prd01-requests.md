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
