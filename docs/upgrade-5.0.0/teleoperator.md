# Grid Dispatch (`teleoperator`): 5.0.1 upgrade guide

Source: plan section 5.4 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-teleoperator`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: custom shaders `scanPulse.ts` (2, `effects.shaderPass` x2), `tailTrails.ts`, `scene.ts` (1); `sky.preetham` + gradient, rain, SSR, volumetric fog; `scatter` x10 hand-rolled; `createHud` x4; `output:` options x5 (`output.preset` family).
- Effort and risk: S wave 1, M with A4 pilot. Visual risk: low-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A6 verify (rain + film grain + SSR)
- [ ] A10 P3 lab flag (the grade is `output:`-driven, so P3 is a one-line flag)
- [ ] A4 `tailTrails.ts`/`scanPulse.ts` as shader-graph pilot (small, additive)
- [ ] A12 deferred

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs teleoperator` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
