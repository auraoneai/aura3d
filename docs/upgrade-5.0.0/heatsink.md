# Thermal Drift (`heatsink`): 5.0.1 upgrade guide

Source: plan section 5.3 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-heatsink`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: `src/shaders.ts` (8 GLSL hits), `heatHaze.ts` (2) as `effects.shaderPass`; `looks.preset("night-city")`; stack: SSR, volumetric fog, rain, snow, film grain, trail, `effects.particles`; own `createHud` x6; `instances.box` x23 for the city.
- Effort and risk: S wave 1; M for A5 lab. Visual risk: medium (night-city look uses an environment, regenerated neutral/indoor assets do not apply to a city HDRI but verify; 4.7.10 notes this game's selective-bloom history: bloom is inert on the software runner, do not re-open).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A6: heat-haze `effects.shaderPass` can read the new `"normal"` input (WebGL2 only) for refraction accuracy (optional S)
- [ ] A5 clustered lights evaluate for the 3 point + 1 rect + spot rig (EXPERIMENTAL flag)
- [ ] A12 skip (seeded city)
- [ ] A1 loader
- [ ] A2

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs heatsink` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
