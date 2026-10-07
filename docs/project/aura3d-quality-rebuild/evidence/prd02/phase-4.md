# PRD-02 Phase 4 — shadow system (flag path)

Branch: `qr/prd02-engine-composition`. All changes are flag-gated under
`A3D_QR_LIGHTING` except the `DepthPass` variantResolver hook, which is a
no-op unless a resolver is supplied (flag-off path byte-identical).

## Landed

- `rendering/src/shadows/DirectionalCascadeFitter.ts` — stable-fit CSM on a
  plain `CascadeFitterCamera` (`{viewProjectionMatrix, near?, far?}`), no
  `instanceof PerspectiveCamera`. Practical-split reuse of
  `CascadedShadowMaps.computeSplits`; ortho centres snapped to
  `texelWorld = extent / mapSize`; each fit carries `viewProjection`
  ([0,1]³-biased sampling matrix) **and** `drawViewProjection` (unbiased
  rasterization matrix) — the two are deliberately distinct.
- `rendering/src/shadows/ShadowAtlas.ts` — spot/point tile planning on a
  1024² atlas reusing `createShadowAtlasPlan` (ShadowMap.ts). Point lights
  emit 6 tiles at 90° fov with the 1-texel guard baked into the allocation;
  each tile carries `scissor` + a tile-folded `drawViewProjection` (NDC into
  the atlas rect) since `RenderDevice` has no `setViewport`.
- `rendering/src/shadows/Prd02DepthShaderLibrary.ts` — C-11 real impl:
  `resolvePrd02ShadowCasterVariant` fills every key bit + the `features`
  map from registered `DepthVariantFeature`s; three lane features
  (`prd02.depthInstancing`, `prd02.depthAlpha`, `prd02.depthSkinning`)
  registered via `registerDepthVariantFeature`. Composed depth program
  (`aura3d/prd02-depth`) with `#if`d skinning (uniform palette,
  `u_jointPaletteMode=0`), uniform-array instancing
  (`u_instanceMatrices[64]` + `gl_InstanceID`, batches split), alpha-test
  discard; per-device program cache keyed `variantId:featureIds`;
  `precompilePrd02DepthVariants` uses `device.compileAsync` when present.
- `DepthPass.ts` — `variantResolver` + `depthVariantFeatures` + `scissor`
  options; variant path issues `instanceCount` draws, binds skinning
  palette + base-color/cutoff, forces a depth render state (cull `none`
  when `doubleSided`). Flag-off command shape unchanged (no `renderState`
  is added unless `scissor` is set, which no flag-off caller does).
- `rendering/src/shadows/ShadowSystem.ts` — `Prd02ShadowSystem`: per-frame
  fit → atlas plan → variant resolve → DepthPass renders into 2D depth
  targets (rgba8 color + depth texture until Q-01-5). Publishes
  `Prd02ShadowFrameUniforms` (the C-11 `ShadowFrameUniforms` plus
  `cascadeTextures[4]`, `localShadowMatrices[6×16]`,
  `localShadowIndexData` packed vec4 pairs). C-31: `diagnostics()` reports
  `cascadeCount`, `tiles`, `localLights`, `casterVariants`,
  `droppedFeatures` (a point light that loses any of its 6 faces reports
  `shadow.localLight:<i>`). No CPU readback anywhere on this path.
- `rendering/src/shaders/chunks/shadow_receive.glsl.ts` — rewritten to the
  C-11 contract: `sampler2DShadow` compare samplers
  (`u_prd02CascadeCompare0..3`, `u_prd02LocalCompare`), raw-depth sampler
  for PCSS, cascade matrix/split/texelWorld uniforms, world-unit normal
  bias (`N × texelWorld[c] × u_prd02NormalBias`), three filter kernels
  (HW tap / Castaño 5×5 tent / Vogel-16 disk) selected by
  `A3D_SHADOW_FILTER`. Sampler arrays avoided (ES 3.00 needs constant
  indices; `uploadUniforms` binds one unit per named uniform).
- `rendering/src/shadows/ShadowFrameBinding.ts` — binds the frame uniforms
  onto forward materials as `u_prd02*` parameters (per-frame material
  mutation, same convention as `u_lightData`).
- `rendering/src/shadows/Prd02ShadowsContributor.ts` — the `prd02.shadows`
  FrameContributor (flag `A3D_QR_LIGHTING`, phase `shadows`): resolves
  `RendererShadowOptions` → `ShadowSystemConfigInput` via
  `collectRendererShadowOptions`, collects shadowed lights from the scene
  snapshot (first `castsShadow` directional = sun; spot/point get
  deterministic tile slots), runs `system.update`, publishes
  `SHADOW_BLACKBOARD_KEY`, binds materials. Module sink
  `prd02ShadowDiagnostics()` feeds the C-31 `shadows` section
  (`Prd02LightingRuntime.diagnostics()` now returns real
  `shadows`/`droppedFeatures` values; `contactShadows.passExecuted` stays
  false until Phase 5).
- `renderer/ShadowOrchestration.ts` — flag gate after the `enabled===false`
  check: under `A3D_QR_LIGHTING` the legacy body is skipped entirely (no
  CPU readback, no `instanceof` gate — plain `CameraLike` reaches the
  contributor path).
- `engine/.../compiler/environment.ts` — `Prd02EnvironmentBindOptions.
  attachDevice` hook invoked inside `bindPrd02EnvironmentProbe`; the
  runtime seam passes `app.lighting.attachDevice` (C-28 counter wiring).
- `engine/src/lanes/prd02.ts` — `diagnostics()` returns the contributor's
  observed `shadows`/`droppedFeatures` via `prd02ShadowDiagnostics()`.

## Tests

`tests/unit/contracts/impl/prd02-shadow-system.test.ts` — 12 tests:
plain-object-camera cascade fit, pole-behind-camera light still fits,
texel-snap stability (sub-texel move ⇒ identical matrices), spot=1 /
point=6 tile planning, variant-key composition + define emission, system
update → uniforms + diagnostics + depth draws on MockRenderDevice,
precompile path, contributor flag gating, `u_prd02*` binding completeness.

## Pending (browser / later phases)

- `tests/qr/prd02/browser/casters.spec.ts` — skinned/instanced/alpha-test
  caster IoU + component-count assertions vs three (CI browser lane).
- `prd02-17` shimmer (≤1.5/255) + pole-behind-camera visual checks.
- `programCompileCount` delta-0 over frames 2–120 (needs real device;
  `MockRenderDevice` has no `getDiagnostics`).
- `readPixelsCalls` delta-0 browser check on a point-shadow scene.
- Q-01-5 depth-only targets (drop rgba8 color attachments).
- Forward-path integration of `a3d_sunShadow`/`a3d_localShadow` into the
  lit program + per-light `shadowIndex` stamping (compile side) — the
  sampling uniforms are bound; the punctual chunk's shadow call site is a
  follow-up within this phase's remaining work.
