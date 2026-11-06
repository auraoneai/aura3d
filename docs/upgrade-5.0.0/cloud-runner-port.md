# Cumulus Dash (`cloud-runner-port`): 5.0.1 upgrade guide

Source: plan section 5.25 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-cloud-runner-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 52 custom hits (`world.ts` 15, `materials.ts` 11, `fx.ts` 1), `sky.rainbow/towers/sunDir` custom sky, `game.reducedMotion` handling (keep), `createLocomotion` x3, motion blur + DoF; example folder name carries a legacy brand (`kid-goku...`); only first-party visible text matters.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A4 limited (fx, sky), A6 verify motion blur (S5-WP06-06 changes taps), A1
- [ ] A10 skip

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs cloud-runner-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
