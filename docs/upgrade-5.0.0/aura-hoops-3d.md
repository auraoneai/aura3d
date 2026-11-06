# Aura Hoops 3D (`aura-hoops-3d`): 5.0.1 upgrade guide

Source: plan section 5.7 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-aura-hoops-3d`, sports). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: no custom shaders (0 `material.custom`); heavy stack: rain + wet ground + lightning (`weather.wetGround`, `weather.lightningEverySeconds`), volumetric fog x4, light cones x3, SSR, AO, film grain, `effects.trail`; `text3D` SDF scoreboards (`src/diegetic.ts:22,33`); `typecheck` and `vite build` scripts added in `ccdc9cfe7`.
- Effort and risk: S wave 1, M for lab flags. Visual risk: low for wave 1; lab flags cannot ship by default.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] zero GLSL-only shaders): A3 `?backend=auto` lab
- [ ] A5 IES photometric profile on arena spotlights (EXPERIMENTAL, one non-clustered WebGL2 spot)
- [ ] A6 verify wet ground
- [ ] WebGPU wetness exists but a puddle-noise texture is not supported on WebGPU (4-to-5.md section 9) so do not use wetness textures
- [ ] A2

Verification

- [ ] GC, UT, CAP
- [ ] RG for A3/A5
- [ ] `node tools/game-checks/run.mjs aura-hoops-3d` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
