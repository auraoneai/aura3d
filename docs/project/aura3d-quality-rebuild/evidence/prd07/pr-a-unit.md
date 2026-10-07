# PRD-07 PR A — lane core + particle draw path + sky core (unit evidence)

Branch `qr/prd07-lane-core`. Unit/typecheck evidence; browser/GPU checks run
remotely (`macos-14`) — see the workflow run linked from the PR.

## What landed

- Lane barrels wired to all C-20/C-21 slots and every contract surface:
  `packages/rendering/src/lanes/prd07.ts`, `packages/engine/src/lanes/prd07.ts`.
- `app.effects` (C-38) and `app.atmosphere` real extensions behind
  `A3D_QR_VFX` / `A3D_QR_VFX_SKY`; stub surface preserved flag-off.
- Particle CPU path: `CpuEmitter` (deterministic mulberry32 sim),
  `writeEmitterInstances` in §6.2.1 layout, `ParticleInstanceRing`
  triple-buffer, `ParticleBatchPass` with §6.2.2 material-key coalescing,
  `ParticleSort` radix order, `BlendFallback` table, `SceneDepthAdapter`,
  `particle.glsl.ts` (premult/additive-fallback defines), contributors
  `prd07.particles/.sky/.decals/.volumetric`.
- `EffectNodeLowering` (particles, rain, snow, flipbook-sprite, fog/post/beam
  consumers) + `ProductionEffectSystem` (one per app, scene-rebuild,
  instance origin/stop, batch retirement).
- `EffectDiagnostics`: `trackDraw`/`endFrame` — `EFFECT_ZERO_PIXELS` after 30
  visible zero-draw frames (console.error once per node), `pixelBacked`
  lists effect **kinds** with `instancesDrawn > 0`; fog consumers exempt.
- Sky: `PreethamSky` (r185 CPU port + GPU shader `sky.glsl.ts`),
  `GradientSky`, `SkyEval`, `SkyBackgroundPass` (C-21 slot, horizonRadiance,
  renderToCubeFace), `fogChunks`.
- `sky` NodeHandler (validates spec union, `feature("vfx.sky")`,
  `option-ignored` on invalid), `setFog` handle extension,
  `look/fake-effect-names` (primitives named like VFX + effect nodes absent
  from `capabilities.effectsPixelBacked`), option-coverage rows,
  `diagnosticOnly.prd07.ts`, CLI `vfx validate-atlas` + codemod
  `vfx-pools-to-effects` (registered; CLI registry import pending — prd15
  file, see qr-request).
- C-40 rows F-07-02…F-07-04 (Appendix B, `proposed`).

## Verified locally (unit)

- `pnpm exec vitest run --config tests/qr/prd07/vitest.config.ts` →
  **12 files / 31 tests green** (batch-keying, blend-fallback,
  effect-system-binding, instance-layout, legacy-particle-mapping,
  look-lint, particle-sort, preetham-cpu-reference, presets,
  write-instances-determinism, zero-pixel-diagnostic, sky-preetham).
- `pnpm exec vitest run tests/unit/contracts/impl/prd07-registration.test.ts`
  → **3 tests green** (slot registration, flag-off contributor set).
- `pnpm exec tsc -p tsconfig.build.json --noEmit` → **clean**.
- `node tools/qr-ownership/check.mjs` → all files resolve to an owner.

## Key correctness checks that ran

- `preetham-cpu-reference.test.ts`: `preethamEvaluate` matches an independent
  transcription of the three.js r185 `Sky.js` fragment `texColor` at 16
  sky-hemisphere directions within **1e-4** (max observed diff ~1e-6).
- `write-instances-determinism.test.ts`: seed 1414 × 2,000 particles →
  byte-identical instance buffers across two runs.
- `batch-keying.test.ts`: two additive emitters → **1 draw**; additive +
  premultiplied → **2 draws**; ordering back-to-front with additive last.
- `zero-pixel-diagnostic.test.ts`: flags `none` + `effects.particles()` →
  `EFFECT_ZERO_PIXELS` after 30 frames; flags `vfx` + real draws through
  `MockRenderDevice` → `pixelBacked` contains `"particles"`, no errors;
  fog node never reports.
- `look-lint.test.ts`: 3 hits on fixture (2 fake primitives + 1 unbacked
  effect node), 0 false positives on backed scenes.

## NOT RUN (remote-only per policy)

- Browser/GPU specs (`particle-shader-compile`, `particles-production`,
  `soft-depth`, `sky-background`, `fog-background-match`, …): require the
  macos-14 runner + capture harness; wired in `prd07-vfx.yml` unit job for
  now — capture/browser jobs land with the PR B scenes.
- `prd07-particles-fountain` / `prd07-sky-*` benchmark scenes (PR B).
- `P1-T3` carved `nodes/particles.ts` budget diagnostics — pending (contract
  surface from PRD 03/04 carving).

## Known deviations / flagged to coordinator

- `setRendererQrFlags` (renderer/FrameGraph.ts) has **zero callers** — a
  PRD-15 wiring hole; `bindPrd07RendererFlags` in the rendering lane barrel
  bridges it for prd07 and is called from each extension factory (last app
  wins). Filed as qr-request.
- `packages/aura3d-cli/src/commands/registry.ts` does **not** import
  `commands/prd07/` — prd15-owned file; `vfx validate-atlas` /
  `vfx-pools-to-effects` register only when the module is imported. Filed as
  qr-request.
- §4.1 machine ownership map lists `agent-api/atmosphere/`,
  `compiler/atmosphere.ts`, `nodes/atmosphere.ts` for lane 07 while the §4.1
  prose + PRD §13.2 assign `agent-api/vfx/`, `compiler/{fog,effects,sky}.ts`,
  `nodes/{effects,sky,weather,particles}.ts`. Filed as qr-request.
- P1-T8 module landed as `production-runtime/effects/CpuEmitter.ts`
  (`writeEmitterInstances`) rather than `effects/ParticleSystem.ts`;
  P1-T14's `vfx/EffectSystemRegistry.ts` folded into
  `agent-api/vfx/{effects-api,bridge}.ts` + rendering `vfx/contributors.ts`.
- CCR-07-1 stands: `FrameContributorContext` has no canvas/app pointer;
  `agent-api/vfx/bridge.ts` publishes the feed via the production-runtime
  source WeakMap so contributors reach the per-app system through
  `ctx.source`.
