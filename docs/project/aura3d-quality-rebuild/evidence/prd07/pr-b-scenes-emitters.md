# PRD-07 PR B evidence — lane scenes + §6.2 emitter-option surface

Branch `devin/1791292686-prd07-scenes` (off `4de6835`).

## Landed

- **§6.2 emitter options → draw path.** `AuraParticleEmitterOptions` +
  `AuraLegacyParticleFields` in `contracts/effects.ts`; builder copies defined
  options onto the effect node (`withEmitterOptions`); `EffectNodeLowering`
  resolves `seed`, `blend` (validated against `alpha|premultiplied|additive|
  multiply`, beats materialMode defaults), `maxParticles` (cap 200 000, beats
  `particleCount`), `rate`, `lifetime`/`speed`/`size` ranges, `gravity`
  (number|vec3), `prewarm`, `drag`, `spread`, `direction`. `CpuEmitter` steps
  `prewarm` seconds at creation (capped 30 s / 1800 steps) so captures start at
  steady state.
- **Scenes (P1-T15):** `prd07-particles-fountain` (14-particles replica + blend/
  size), `prd07-flipbook` (fireball + smoke, two atlases, staggered start),
  `prd07-particles-stress` (13-emitter set, 50 000 cap, mixed additive/alpha,
  4-frame strip), each with Aura + three-r185 adapters under
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd07/`.
- **C-28 readbacks surface:** `ParticlePassDiagnostics.deviceCounters`
  (device `counters()`) → `EffectDiagnostics.deviceReadbacks` →
  `diagnostics().effects.deviceReadbacks`.
- **P1-T19 spec** `tests/qr/prd07/browser/particles-production.spec.ts` +
  harness: flags `vfx` asserts ≥1.5 % warm (R−B>15) fountain pixels,
  `drawCalls ≥ 1`, `pixelBacked` contains `particles`, `deviceReadbacks === 0`;
  flags none asserts no particle draws and <0.1 % warm pixels.
- **Tests:** `emitter-options.test.ts` (10), `scene-registry.test.ts` (5 —
  unique ids, `prd07-` prefix, both adapter files exist, owner `prd07`).

## Local verification

- `vitest tests/qr/prd07` — 18 files, 63 tests green.
- `tsc -p tsconfig.build.json --noEmit` — clean (rechecked after P1-T3/T9/T10 landings).
- `tsc -p tsconfig.build.json --noEmit` — clean; bench tsconfig clean.
- Flag-off: no `prd07.*` contributors, no `qualityRebuild.flags` → no
  `ProductionEffectSystem` — unchanged render path.

## Follow-on (post-6f5eacf)

- **P1-T3:** `collectParticleBudgetDiagnostics` gains `{ declared, observedLive: null,
  observedDraws: null }`; `gpuReady` unchanged. `vfx/diagnostics.ts` fills observed
  slots from the live system; `particle-budget.test.ts` (3) green.
- **P1-T9:** `particle.glsl.ts` rewritten per §8.1 — `SOFT_PARTICLES` (u_sceneDepth +
  u_depthLinearize, perspective+ortho linearize), `BLEND_ADDITIVE` (alpha-0 additive
  branch) vs `BLEND_ADDITIVE_FALLBACK` (×1.6 core), `u_outputColorSpace` encode per
  §6.2.7 (linear HDR vs sRGB), `o_reactive` at location 2. `ParticleBatchPass`
  resolves scene depth + output space once per frame; `softDistance`/`nearFade`
  plumbed node → LoweredBatchSpec → ParticleBatchDescriptor (contract extended).
  `deviceHonoursBlendMode` now probes `native-render-pipeline` capability — the
  LeanWebGL2 C-04 stub ignores blendMode, so the fallback path honestly applies
  there. Unit `particle-shader.test.ts` (7) + browser
  `particle-shader-compile.spec.ts` (all 256 define combos compile+link) written.
- **P1-T10:** `resolveOutputColorSpace(ctx)` added (`prd01.outputColorSpace`
  blackboard key, absent → legacy "srgb"); `soft-depth-harness`/`soft-depth.spec.ts`
  written — depth-RT plane at 2 m, particle at 1.9 m → centre alpha ×0.2857, beyond → 0.
- **P1-T19 flag-off sentinel:** flag-off spec now asserts the honest sentinel —
  `zeroPixelFrames ≥ 30` + `EFFECT_ZERO_PIXELS` error (ProductionEffectSystem is
  created flag-off precisely to report the old bug).

## Follow-on 2 (P1-T11/T12/T16)

- **P1-T11:** `agent-api/vfx/atlas.ts` (AuraVfxAtlasManifest v1 + builtin
  sequence table + validators) and `vfx/VfxAtlas.ts` — manifest fetch, tier
  page selection (1k low/medium, 2k high/ultra), KTX2-primary decode hook with
  `VFX_ATLAS_PNG_FALLBACK` on `AssetDecoderUnavailable`, twin-page rect scaling.
  `vfx-atlas.test.ts` (4) green.
- **P1-T12:** `tools/vfx-atlas-bake/bake.mjs` — deterministic seeded bake
  (mulberry32/hash2 noise, minimal PNG encoder, zlib level 9, no timestamps).
  Emits `aura-vfx-{1k,2k}.png` + `manifest.json` + `LICENSE.md` (CC0);
  `--size 256` twin-run sha256 verified byte-identical locally; KTX2 skipped
  when `toktx` absent (logged). Committed output at
  `packages/engine/assets/vfx/`; `vfx-atlas-bake.test.ts` (3) green.
  `aura3d vfx validate-atlas` extended for the manifest format: pages
  premultiplied (rgb ≤ a), POT, rect-in-page, ≥1px gutters.
- **P1-T16:** `prd07-vfx.yml` now has `unit`, `typecheck`, `bake` (re-bake +
  byte-diff), `browser` (lane playwright config), `capture` (`--flags vfx` +
  `--flags none`, §13.2 scenes + lane scene ids — `prd07-*` expanded since
  `--scenes` is exact-match), `games` (5 showcase games × both flag sets).
  Artefacts upload to `evidence/prd07/<run-id>/`; capability-degraded codes
  print as informational steps.

## NOT RUN

- Browser spec + all captures — remote-only per lane policy; runs in
  `prd07-vfx.yml` (browser job) and the capture/games jobs. Assertions above
  are unverified until CI green.
- `main.ts` page router globs top-level scene files only — `scenes/prd07/` and
  the `a3d-qr` URL param need prd12/prd15 wiring (qr-request issue filed as
  part of this PR's notes); lane adapters read `a3d-qr` themselves meanwhile.
