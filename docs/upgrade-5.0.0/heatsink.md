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

- [x] A6 (lab flag `?hazeNormal=1`, default OFF, WebGL2 only): heat-haze `effects.shaderPass` reads the `"normal"` input (`HEAT_HAZE_NORMAL_GLSL` in `heatHaze.ts`); unit test in `tests/unit/heatsink/heat-haze.test.ts`; frames `evidence/game-upgrades-503/heatsink/`
- [x] A5 clustered lights (lab flag `?clustered=1`, default OFF, EXPERIMENTAL): `lighting.clustered { enabled: true, fallback: "forward" }` in `main.ts`; frames `evidence/game-upgrades-503/heatsink/`
- [x] A12 skip (seeded city): nothing to change
- [x] A1 loader: `createLoadingProgress` tracks `auraApp.ready()` on the existing boot card (no new pixels)
- [x] A2: engine diagnostics overlay via `?diag=1` only (default off); beacon `getApp` no longer uses the partial `as never` cast (B2)

Verification

- [x] GC, UT (tests/unit/heatsink 286/286); CAP is parent-owned and not run here
- [x] `node tools/game-checks/run.mjs heatsink`: 0 errors (2 pre-existing warnings)
- [x] Before/after frames: `evidence/game-upgrades-502/heatsink/{before,after}.png` (960x540, real GPU Apple M4 Max via Chrome CDP, `?autostart=1&qaManual=1`, 12 s settle)
