# The Bellkeeper's Walk (`where-the-wind-wanders-port`): 5.0.1 upgrade guide

Source: plan section 5.23 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-where-the-wind-wanders-port`, arcade). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 62 custom hits (`world.ts` 31, `paper-pass.ts` post pass), `sky.setUniform` x6, `geometry.dynamic` x13, `createLocomotion` x4, `qualityProfile` x2, `?` paper-grain `effects.shaderPass`.
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (paper pass reads depth/color; temporal rewrite).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A6: `paper-pass.ts` is a custom post pass: reconcile with the stable custom-pass input contract (`AuraPostPassInput`, optional `"normal"` input, WebGL2 only) (skipped in 5.0.2: HIGH visual risk, paper pass reads depth/color; needs a paired capture pass)
- [ ] A8 for hero (skipped in 5.0.2: hero already uses createLocomotion; its gait switch is hardened instead, see hero-animator-refresh.test.ts)
- [ ] A4 for world shaders (L) (skipped in 5.0.2: EXPERIMENTAL, not shipped by default, D1/D4)

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs where-the-wind-wanders-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
