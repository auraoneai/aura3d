# Ion Circuit (`heatsink-port`): 5.0.1 upgrade guide

Source: plan section 5.19 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-heatsink-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: **63 custom hits** (`world.ts` 26, `materials.ts` 10, 10 `glsl:`), `geometry.dynamic` x8, `environments.capture` x2, sky shaders (`sky.twilight`, planet scale, moon), only `@aura3d/math` import in the 25 (vectors).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (bespoke sky + capture env).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A4 for `materials.ts` set
- [ ] A6 verify motion blur + chromatic aberration
- [ ] A9 optional (space-scale world)

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs heatsink-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
