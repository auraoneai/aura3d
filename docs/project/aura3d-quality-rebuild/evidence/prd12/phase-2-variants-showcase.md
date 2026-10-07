# Lane 12 evidence — variants, showcase pipeline, ref scenes, games overlay

Scope: PRD-12 T2.1–T2.5, T3.2 (goldens store), T4.3 (canary), T4.5 (baseline seed), T5.1–T5.5.
Everything below is code that measures; nothing here asserts pixel claims.

## What landed

### T2.1–T2.5 broken-control variants
- `three/lib/variants.ts`, `aura3d/lib/variants.ts`: shared `applyVariantSpec` per engine.
  Three: all 7 controls (`no-shadows`, `no-ibl`, `dpr-half`, `no-aa`, `no-tonemap`, `flat-sky`, `albedo-only`).
  Aura: expressible subset `{no-shadows, no-ibl, dpr-half, flat-sky}`; `no-aa`/`no-tonemap`/`albedo-only`
  raise `NotExpressibleVariantError` — recorded as `not-expressible`, never faked.
- `three/common.ts` wires `variantDprScale`/`variantAntialias`/`variantToneMapped` into renderer creation.

### Showcase pipeline (§9.1)
- `three/lib/showcase.ts` `runThreeShowcase(spec, host)`: EffectComposer on an explicit
  `WebGLRenderTarget(w·dpr, h·dpr, {type: HalfFloatType, samples: 4})` — the default composer
  target has no multisampling. Pass order RenderPass → GTAOPass → UnrealBloomPass → SMAAPass →
  OutputPass (tone mapping + encode once).
- `three/lib/contact-shadows.ts`: port of `webgl_shadow_contact` (three has no addon for it):
  ortho shadow camera under the ground, MeshDepthMaterial RGBADepthPacking 512² target,
  horizontal/vertical blur ping-pong, ground plane opacity = darkness.
- `shared/types.ts` `ShowcaseSpec` (ao, aa, contactShadows, background, backgroundBlurriness,
  environmentStandIn, anisotropy, shadowRadius, assetTier) on `SceneSpec.showcase`.

### T2.3–T2.5 ref scenes (§9.3)
- `scenes/prd12/ref-scenes.ts`: `prd12-ref-01..06` registered **active** (registry only routes
  active scenes; admission is enforced downstream — every ref scene has no calibrated thresholds
  yet, so the gate emits `non-discriminating` until T2.6+T2.7 land).
- ref-01 automotive studio (carConcept, AgX, GTAO, contact shadows), ref-02 interior diorama
  (littlestTokyo "Take 001", RoomEnvironment stand-in), ref-03 character hero (soldier Walk,
  CSM 3 cascades, GroundedSkybox), ref-04 night street (bloom >1 emissives, fog), ref-05 arena
  (16 instanced props, 700 particles), ref-06 product turntable (damagedHelmet + antiqueCamera,
  8-frame orbit strip).
- All `assetTier: "stand-in"` — 1k HDRIs until lane 05 lands 2k admissions (Q-05-1).
- `shared/assets.ts`: `carConcept` + `littlestTokyo` model entries (hashes recorded),
  DRACO decoder files in `benchmarkAssetFiles()` — littlest-tokyo.glb is KHR_draco.
  Aura asset map mirrors both ids.

### T5.1–T5.5 games overlay + capture steps
- `capture-games.mjs`:
  - `--pr-build` flag; defaults ON on `pull_request` events, `--source production` opts out (T5.1).
  - Forbidden-param init script wraps `URLSearchParams.get/has/getAll` and logs reads of
    `capture|review|debug|a3d-debug|qr-debug|overview` into `__QR_FORBIDDEN_READS__`; on
    `captureContractMigrated` routes the run fails with `forbidden-capture-flag` (T5.2).
  - Engine self-reported fps (`diagnostics().fps`/`frameTiming`) vs rAF sampler: >20% relative
    disagreement records `fps-self-report-mismatch` (T5.5).
  - `recordVideo` enabled only when a timeline contains a `webm` step; finalized to
    `<run>__capture.webm` on context close.
- `steps/strip.mjs` (N-frame strip @ interval) + `steps/webm.mjs` (C-33 plugins) (T5.4).
- `games.prd12.json` (T5.3): all 18 games — `scenarios` mirror each game's own timeline shot
  ids (seeded, `freezeAt: end`, `cameraPose: gameplay`), `hudSelectors`/`keyboardHintSelectors`
  sourced from app DOM ids/classes/data-hud with generic fallbacks. `titleDeterministic` stays
  `null` until the T1.13 five-repeat measurement runs — measured, never assumed.

### Gate support
- `.gitattributes`: `goldens/**/*.png` + `refs/**/*.png` → LFS (T3.2).
- `goldens/manifest.json` (`aura3d.quality-gate.goldens/1`, empty entries — populated by the
  first admitted golden round, T2.7).
- `history/calibration-baseline.json` (`aura3d.quality-gate.calibration-baseline/1`): the frozen
  §6.8 bands — orbital-defense-3.0.1 1–2, benchmark-14-aura 0.5–1.5, three-r185-contract 4–7,
  ref-showcase-three ≥7 (T4.5).
- `refs/canary-01.png`: known-good canary frame (red cube, left) for the judge canary (T4.3).

## Verified locally
- Scoped `tsc -p benchmarks/quality-rebuild/tsconfig.typecheck.json`: 0 errors in lane-12 files
  (remaining failures are pre-existing prd06/prd11 files, not lane 12).
- `vitest` prd12 suites: 11/11 new+updated pass (`prd12-variants`, `prd12-registry` updated for
  the showcase profile).
- `node --check` on all touched `.mjs`; JSON overlays parse.

## qr-request opened
- games.json timeline adoption of `strip`/`webm` steps at the 04-action moment (lane 14 owns
  games.json; plugins + overlay land in this PR).

## NOT RUN (runner-required)
- Real captures of the ref scenes / variants (local captures are forbidden by lane rules).
- GTAOPass parameter tuning on real frames.
- `titleDeterministic` five-repeat measurement (needs runner job).
- fps-self-report-mismatch on real games (no engine frameTiming wired in some lanes yet —
  field is optional and the check no-ops when absent).
