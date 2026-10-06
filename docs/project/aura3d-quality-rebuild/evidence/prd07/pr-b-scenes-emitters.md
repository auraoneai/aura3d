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

- `vitest tests/qr/prd07` — 14 files, 46 tests green.
- `tsc -p tsconfig.build.json --noEmit` — clean; bench tsconfig clean.
- Flag-off: no `prd07.*` contributors, no `qualityRebuild.flags` → no
  `ProductionEffectSystem` — unchanged render path.

## NOT RUN

- Browser spec + all captures — remote-only per lane policy; runs in
  `prd07-vfx.yml` (browser job) and the capture/games jobs. Assertions above
  are unverified until CI green.
- `main.ts` page router globs top-level scene files only — `scenes/prd07/` and
  the `a3d-qr` URL param need prd12/prd15 wiring (qr-request issue filed as
  part of this PR's notes); lane adapters read `a3d-qr` themselves meanwhile.
