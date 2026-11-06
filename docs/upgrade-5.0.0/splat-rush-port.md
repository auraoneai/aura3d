# Splat (`splat-rush-port`): 5.0.1 upgrade guide

Source: plan section 5.16 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-splat-rush-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 46 custom hits (`world.ts` 11, `pickups.ts` 2, 9 `glsl:` blocks); hand-rolled particle pool (`sim.ts:167` `this.particles.push`, `world.ts:867,1070-1073` `particles.setTone/place/collapse` through instanced nodes); hand-built sky stages (`sky.stages`, `sky.cirrus`); `environments.neutral` + `hdri`; `effects.outline`; `pixelRatio` x6 (`quality` ladder).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (neutral environment regenerated, bespoke GLSL).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] replace instance-node particle pool with `effects.particles` / registered preset only if the per-particle tone/collapse behavior is expressible (M, medium risk), A4 for splat shader (L), A6 verify outline (S: outline uses a camera depth prepass that follows the depth convention), A9 none

Verification

- [ ] GC, UT (sim tests), CAP
- [ ] `node tools/game-checks/run.mjs splat-rush-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
