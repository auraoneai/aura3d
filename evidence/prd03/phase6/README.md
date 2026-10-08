# PRD-03 Phase 6 evidence — SMAA, auto-exposure, custom passes

Branch `devin/qr-prd03-phase6-smaa-exposure`, flag `A3D_QR_POST` (flag-off
byte-identical — every new path lives inside the v2 seam or the flag-gated
registry).

## Checklist (§14)

- `post/shaders/smaa.glsl.ts` — verbatim three r185 port: colour edge
  detection, blending-weight pass (AreaTex/SearchTex lookups), neighbourhood
  blend. three's vertex-varying offsets are computed fragment-side with
  identical math (no custom vertex stage needed).
- `post/smaa/textures.ts` — lazy chunk: `SMAA_AREATEX_PNG` (160×560 RGB8,
  linear) + `SMAA_SEARCHTEX_PNG` (66×33 gray, nearest) extracted verbatim
  from three r185 `SMAAPass.js` with the MIT header; `import()`-ed and
  decoded via `createImageBitmap` only when AA resolves to smaa.
- `post/shaders/exposure.glsl.ts` — §8.9: 4×4 log2-luma block average
  (centre-weighted toggle) → 2× box-reduce to 1×1 → EV ping-pong adapt
  (`ev = mix(prev, clamp(-avgLog2 + log2(0.18) + comp, minEv, maxEv),
  1 - exp(-dt·speed))`, `speed = target > prev ? speedUp : speedDown`,
  `u_hasPrev` boots straight to target) → `hdr * exp2(ev)` multiply — zero
  readbacks, all GPU.
- Bridge (CCR-03-2): `effectiveOutput.autoExposure` →
  `PostPipelineOptions.autoExposure` gated by `tierResolution.autoExposure`
  (defaults minEv −4 / maxEv 4 / speedUp 3 / speedDown 1 / center-weighted /
  compensation 0).
- `app.addPostPass` → C-13 `registerPostPass` now executes: `v2Stages.ts`
  runs registered + `options.customPasses` descriptors at all five §6.1
  anchors (`customPassFragmentSource` prelude: `u_color`, `u_depthLinear`,
  `u_velocity`, `u_texelSize`, `u_time`; pool target by space). HDR anchors
  run inside `runV2HdrStages` (after-depth / before-taa / after-taa /
  before-tonemap); `after-tonemap` runs in `runV2LdrTail` between S10b and
  S11. `registerPostPass` enforces `space` (`POSTPROCESS_SPACE_INVALID:<id>`)
  and `gpuOnly` (`POSTPROCESS_PASS_NOT_GPU:<id>`) at registration. Pass
  callbacks see a truthful `FrameContributorContext`: CCR-03-12
  `postFrameContext {source, items, sceneDepth}` is stamped on
  `RendererPostProcessOptions` at both submit sites and forwarded through
  `PostprocessExecution`/`executePostGraphWebGL2`; `postBlackboard` persists
  per host (`tier` falls back to `QUALITY_TIERS.high` — no tier in render
  scope).
- `v2NeedsLdrTail` += `antiAliasing === "smaa"` + after-tonemap customs; the
  LDR tail unfuses FXAA (`AURA_FXAA_NO_DITHER` variant — finalize keeps the
  single dither) when a display custom splices S10b→S11.
- Apps: `apps/postprocessing-bloom` rewritten on `createAuraApp` +
  `output.preset:"neon-night"` HDR emissive (emissiveIntensity 3.4–7.4,
  inside the preset's [3,8] band) — replaces the threshold-0.08 Reinhard
  demo; new `apps/postprocessing-custom` demos `addPostPass` at
  `before-tonemap` (linear HDR warm tint) and `after-tonemap` (CRT
  scanlines) plus the `registerPostPass` space guard.

## Tests / gates

- `tests/unit/contracts/impl/prd03-post-phase6.test.ts` — 10 tests:
  `adaptEv` mirror (boot-to-target, clamp, speed selection, §14 convergence
  proxy ≤ 1.5 s at speedUp 3), custom-pass order at all five anchors with
  empty `skipped`, `POSTPROCESS_SPACE_INVALID` (both directions),
  `POSTPROCESS_PASS_NOT_GPU`, `v2NeedsLdrTail` routing, S8/S11 implemented.
- `tests/unit/contracts/impl/prd03-post-bridge.test.ts` — +2 CCR-03-2
  cases: the authored `output.autoExposure` bag lands (authored fields +
  defaults), `false`/absent stays off, Low tier gates it off.
- `prd03-post-bundle-split.test.ts` — `DEFERRED_ONLY_INPUTS` += phase-6 GLSL
  and `post/smaa/textures.ts` (the lazy PNG chunk must never reach the
  flag-off critical path).
- Typecheck: rendering `tsc -p` clean; repo-wide `tsc -p tsconfig.check.json`
  reports zero errors in every touched file (remaining reds are the
  pre-existing baseline in other lanes' tools/tests). ESLint: 0 errors on
  every touched file. Ownership: all files lane 03 except
  `contracts/post.ts` + `Renderer.ts` (lane 01 — CCR-03-2/CCR-03-12,
  declared F-03-32 / QR-03-20) and engine `contracts/post.ts` (lane 15 —
  additive `compensationEv`, QR-03-19).
- Unit run: 86/86 green across the touched spec files
  (phase6 + bridge + presets + tiers + bundle-split + codemod).

## Deferred (browser-only, §15.2)

- `post-smaa` edge-error spec on `prd03-thin-aa` (≤ FXAA, within 10 % of
  three `SMAAPass`) — remote captures.
- `post-auto-exposure` convergence spec on `prd03-tone-ramp` 21b (≤ 1.5 s,
  0 `readPixels` — the chain carries no readback path by construction).
- `post-custom-pass` readback spec (invert at `after-tonemap`; `> 1` values
  preserved at `before-tonemap`) — remote captures.

## Cross-lane declarations

- CONTRACTS F-03-32 (Appendix B, proposed).
- `evidence/prd03/phase6/qr-requests.md`: QR-03-18 (lane 13 catalog),
  QR-03-19 (lane 15 route alias), QR-03-20 (lane 01 contract file).
