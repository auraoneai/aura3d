# Lane 03 Phase 4 — qr-request / ccr tracking

Requests lane 03 cannot satisfy inside its own ownership boundary
(CONTRACTS.md §4). Phase 0–3 rows live in `../phase0`, `../phase1`,
`../phase2`, `../phase3/qr-requests.md`.

## CCRs exercised (declared in CONTRACTS.md Appendix B)

| # | Touch | What | Status |
|---|---|---|---|
| CCR-03-10 | `packages/rendering/src/contracts/velocity.ts` (owner 01) | Additive `TemporalCameraMatrices` (`jittered`/`unjittered`/`previous`/`linZ`/`linZOutput`/`jitterClip`/`frameTime`) + `TemporalHistoryLike.prepare(...) → TemporalCameraMatrices` + `RenderTarget` type import. Row F-03-22. | LANDED (this PR) |
| CCR-03-11 | `packages/engine/src/agent-api/nodes/types.ts` (owner 15), `nodes/effects.ts` (owner 07) | Additive `AuraEffectNode` fields `shutter`/`samples`/`tileSize`/`timeScale` (§8.8), `falloff`/`multiBounce` (§8.3), `focusDistance`/`fStop`/`focalLength` (§8.9), `sharpness` (§8.6) + factory passthroughs on `depthOfField`/`motionBlur`. Row F-03-24. | LANDED (this PR) |
| — | `packages/engine/src/agent-api/app/createAuraApp.ts`, `compiler/renderInput.ts` (owner 15) | Flattened `app.addPostPass`/`app.setQualityTier`/`app.cutCamera` (C-13/C-14 delegates); `POST_LEGACY_POSTPROCESS` warn-drop + flag-on `staticBatching` from the resolved temporal bag. Row F-03-25. | LANDED (this PR) |
| — | `packages/rendering/src/Renderer.ts` (owner 01) | `>5 m` camera-translation auto-cut → `resetTemporalHistory("auto-reset: camera-jump")`; `cameraFrame.previousViewProjectionMatrix` stamped from `temporal.v2.previous` at both submit sites (render/renderAsync). Row F-03-25. | LANDED (this PR) |
| — | `tests/unit/rendering/{temporal-history-lifecycle,shader-variants-velocity}.test.ts` (owner 15 default — lane-03 test slots absent from QR_OWNERSHIP, QR-03-1) | Named files the Phase-4 checklist mandates: flag-on lifecycle case + velocity chunk/variant matrix. | LANDED (this PR) |
| — | `benchmarks/quality-rebuild/aura3d/common.ts` (owner 12; `aura3d/common.ts` row allows lanes 01,03,07,10,12,15) | `postExtras` lane extension: `effects.{antiAlias,motionBlur,depthOfField}` nodes + cameraPan/cameraCut stepping (C-22 `app.camera.setPose` first, runtime camera-node `setPosition` fallback). Row F-03-26. | LANDED (this PR) |

## Open qr-requests

| ID | Target lane | Ask | Impact | Status |
|---|---|---|---|---|
| QR-03-12 (filed #795) | 08 | `app.time.timeScale(channel)` session-level hook per C-23 (motion blur + game feel share the channel). Phase 4 ships the per-node `effects.motionBlur({timeScale})` path — the channel-wide path needs the lane-08 time controller. | MB `timeScale` works per-node; a global timeScale still needs lane-08. | open |
| QR-03-13 (filed #796) | 08 | `app.camera` (C-22 `AuraCameraController`) not present on `AuraApp` in this build — `postExtras.cameraPan/cameraCut` fall back to the runtime camera node's `setPosition` (position-only pan, fixed target). When C-22 lands the adapter uses `setPose` for position+target pans. | Pan/cut scenes run today at reduced fidelity (yaw pan). | open |
| QR-03-14 (filed #797) | 01 | Forward target needs location-1/2 attachments (velocity rg16f + reactive r8) — Q-01-2. Until it lands `prd03.velocity` stays opt-in under `A3D_QR_POST_VELOCITY_MRT` and S1-C camera velocity + the luminance-delta heuristic carry TAA. | Per-object velocity vs analytic is gated on the MRT attachments. | open |
| QR-03-15 (filed #788) | 12 | Scene router still does not glob `aura3d/scenes/prdNN/`/`three/scenes/prdNN/` — prd03-* scenes (incl. the three new Phase-4 ones) cannot be captured through the page router; adapters and index are registered. | All lane scene captures stay blocked. | open (carried from QR-03-2) |

## Notes

- `pipeline.taa` stamping guards on the *resolved* mode, not on authored intent:
  a `TAA_VELOCITY_COVERAGE` fallback must not let v2Stages re-arm TAA from a
  stale `pipeline.taa` bag (F-03-24). Authored `mode:"taa"` still stamps when no
  resolver ran.
- `TEMPORAL_UNSUPPORTED_GEOMETRY` survives flag-off only; flag-on deformed items
  are coverage misses (`moving` > `movingWithHistory`), which routes AA to
  msaa/smaa instead of throwing.
- `jitterClip`/`frameTime` ride on `TemporalCameraMatrices` (C-14) so the TAA
  resolve stage can reproduce the raster-time jitter exactly — the jitter is
  computed once per frame in `prepareV2` and shared by camera history + item
  MVPs.
- linZ ping-pong: `bindings.v2.linZOutput` is written by S1-A each frame and
  `commit()` promotes it to `linZ` for next frame's disocclusion input; S1-A
  falls back to a pooled target when no temporal bindings are provided.
