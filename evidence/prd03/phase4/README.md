# PRD-03 Phase 4 evidence — temporal plumbing, TAA S5, DoF S6, motion blur S7

Branch: `devin/qr-prd03-phase4-taa-dof`. Flag `A3D_QR_POST`
(+ sub-flag `A3D_QR_POST_VELOCITY_MRT` — opt-in until Q-01-2 lands the
location-1/2 forward attachments). Flag-off rendering byte-identical.

## What landed

- `TemporalHistory.prepare` → `prepareV2` flag-on: no ForwardPass re-draw,
  no `TEMPORAL_UNSUPPORTED_GEOMETRY` throw (deformed items count as
  uncovered motion in `postVelocityCoverage` instead — conservative).
  Returns `TemporalGpuBindings.v2` with the C-14 camera matrices
  `{jittered, unjittered, previous}`, the linZ ping-pong pair, `jitterClip`
  and `frameTime` (C-23). Jitter computed once per frame and shared by
  camera history + item MVPs (raster and reprojection must agree).
- `contracts/velocity.ts`: `TemporalCameraMatrices` +
  `TemporalHistoryLike.prepare` (CCR-03-10, additive, lane-01 file).
- `forward/Velocity.ts` `bindVelocityUniforms`: binds
  `u_previousViewProjection`/`u_unjitteredViewProjection`/`u_previousModel`
  only when C-14 `cameraMatrices` are provided; rigid previous-matrix cache
  keyed by item label; coverage `{items, withVelocity, moving,
  movingWithHistory}` → TAA allowed only when `moving ==
  movingWithHistory`, else msaa/smaa fallback + `TAA_VELOCITY_COVERAGE`
  diagnostic.
- `post/chunks/velocity.glsl.ts` `prd03.velocity` feature: location-1
  velocity (Δndc·0.5, S1-C convention) + location-2 reactive mask. Opt-in
  `A3D_QR_POST_VELOCITY_MRT`. Deform-variant-free (deform upstream of the
  hook). `shader-variants-velocity.test.ts` asserts the ChunkHarness program.
- S1-A linear depth writes into `bindings.v2.linZOutput` when temporal
  bindings are provided (else pooled); `commit()` promotes it to `linZ` —
  S5 disocclusion input. S1-C camera-velocity pass reprojects through
  `prevVP·invUnjitteredVP` + closest-depth 3×3 dilate (`velocityDilate`).
- §8.6 TAA (S5), §8.9 metric DoF (S6), §8.8 motion blur (S7) wired in
  `v2Stages.ts`/`PostprocessExecution` (`v2PipelineNeedsDepth` covers them).
  `pipeline.taa` stamped only when the *resolved* mode is taa —
  coverage fallback cannot re-arm it.
- Bridge (`postBridge`): `motionBlur` emits `shutter = intensity·timeScale`
  (per-node C-23), `samples`→{8,12,16}, `tileSize`→{16,20};
  `POST_EFFECT_FIELDS` allowlists `shutter/maxBlur/samples/tileSize/
  timeScale`, AO `falloff`/`multiBounce`, DoF `focusDistance/fStop/
  focalLength`, antiAlias `sharpness` (CCR-03-11 fields on `AuraEffectNode`
  + factory passthroughs).
- App surface (C-13/C-14 flattened): `app.addPostPass`,
  `app.setQualityTier`, `app.cutCamera()` →
  `resetTemporalHistory("camera-cut")`. Renderer auto-cuts on >5 m camera
  translation between temporal frames; `cameraFrame.
  previousViewProjectionMatrix` = `temporal.v2.previous` at both submit
  sites. Legacy `postProcesses` catalog on the v2 chain warns
  `POST_LEGACY_POSTPROCESS` (`POST_POSTPROCESSES_MIGRATED`) and is dropped.
  `staticBatching` honors the resolved temporal bag flag-on.
- §16.1 Phase-4 scenes: `prd03-taa`, `prd03-motion-blur`,
  `prd03-cut-velocity` (specs + aura/three adapters; lane-local
  `postExtras` in `aura3d/common.ts` drives AA/MB/DoF nodes and
  cameraPan/cameraCut via `app.camera.setPose` or the runtime camera node).

## Unit results

`tests/unit/contracts/impl/prd03-phase4.test.ts`: 13/13
`tests/unit/rendering/temporal-history-lifecycle.test.ts`: 10/10 (new
flag-on case asserts zero ForwardPass draws + C-14 matrices)
`tests/unit/rendering/shader-variants-velocity.test.ts`: 7/7 (chunk
composition, location-1/2 outputs, sub-flag select, Δndc·0.5 convention)
Typecheck (repo-wide baseline broken — pre-existing): 0 errors in touched
files. Lint: 0 errors in touched files. Ownership: all files resolve to
03 or are declared CCR/§4-allowed rows above.

## Browser probes (remote lane)

`tests/browser/qr-prd03-phase4-harness.{ts,html}` +
`qr-prd03-phase4.spec.ts` — S1-C analytic velocity ±2%, TAA case a
(≤0.01 stddev), case c (cutCamera → no-history 2 LSB), motion-blur fps
relative-diff ≤10%, metric DoF focus-plane 2 LSB + bokeh 12.3 px ±15%.
Cases b/d/e gate on surfaces that land later (C-22 camera pose; skinned/
particle velocity needs Q-01-2) and self-report `untested`.

## Open qr-requests

See `qr-requests.md` (QR-03-12 session timeScale → lane-08, QR-03-13
`app.camera` C-22, QR-03-14 MRT attachments Q-01-2 → lane-01, QR-03-15
scene-router glob → lane-12).
