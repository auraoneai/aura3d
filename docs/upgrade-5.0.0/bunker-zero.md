# Bunker Zero (`bunker-zero`): 5.0.1 upgrade guide

Source: plan section 5.11 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-bunker-zero`, action). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Package/API: 0 custom shaders; stack: volumetric fog x2, film grain, chromatic aberration, AO, SSR, colorGrade; `createGame` (`src/main.ts:847`, ACES from `createGame` output); 14 GLB; floor-stencil `text3D` (`src/main.ts:336`).
- Effort and risk: S wave 1, M for A5 lab. Visual risk: medium (dark interior grading is sensitive to the regenerated neutral/indoor environment if the look uses `indoor`: check `src/art/direction.ts`).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4): not applicable, the look uses the catalogue HDRI `hangar_interior` via `environments.hdri` (`src/main.ts:191`), never `environments.neutral`; real-GPU frame of the same view is unchanged (evidence/game-upgrades-503/bunker-zero/{before,after}.png)
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A5 (indoor bunker: best `NativeLightProbeGrid`/clustered-lights candidate; 4 point + 2 spot + rect lights). SKIPPED, engine-blocked: a per-floor `NativeLightProbeGrid` (analytic fixture bounce) was implemented behind `?lighting=probes` and run on a real GPU (Apple M4 Max, ANGLE Metal): `app.lighting.attachIndirect` throws `AuraAdvancedLightingUnavailableError` because no renderer installs the `AdvancedLightingConsumer` (`installAdvancedLightingConsumer` has no caller outside tests), and with the `core`+`lighting` lanes on the frame throws `RenderDeviceError: The generated advanced-lighting program is not ready`. Code reverted, nothing shipped. IES `photometricProfile`/projected spot images need an admitted IES asset (none in repo) and the same generated lit path; clustered lights need that path too. All EXPERIMENTAL, no real-GPU proof possible
- [x] A3 lab (no GLSL-only shaders): `?backend=auto|webgpu` and `?gamut=p3` wired through the shared lab-flag parser, default OFF (EXPERIMENTAL; not captured on a WebGPU runner; `?worker=`/`?depth=` not wired)
- [x] A1 (`createLoadingProgress` over `mg.shell`, tracks `mg.ready()`; evidence/game-upgrades-502/bunker-zero/{before,after}.png, `?floor=1`, 960x540)
- [ ] A17 `scalarVolume` for fog shafts is optional EXPERIMENTAL: skipped, the existing volumetricFog shafts are the look-identity item and a scalar volume has no real-GPU proof

Verification

- [ ] GC (lighting, luma-band), UT, CAP
- [ ] `node tools/game-checks/run.mjs bunker-zero` clean
- [x] Before/after frames attached: evidence/game-upgrades-503/bunker-zero/{before,after}.png (real GPU Apple M4 Max via headless Chrome CDP, 960x540, `?floor=1&autostart=1`, 16 s; identical, no source change shipped)
