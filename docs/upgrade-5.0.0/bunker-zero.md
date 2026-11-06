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
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A5 (indoor bunker: best `NativeLightProbeGrid`/clustered-lights candidate; 4 point + 2 spot + rect lights)
- [ ] A3 lab (no GLSL-only shaders)
- [ ] A1
- [ ] A17 `scalarVolume` for fog shafts is optional EXPERIMENTAL

Verification

- [ ] GC (lighting, luma-band), UT, CAP
- [ ] `node tools/game-checks/run.mjs bunker-zero` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
