# Serpentine Sky Run (`serpentine-sky-run-port`): 5.0.1 upgrade guide

Source: plan section 5.17 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-serpentine-sky-run-port`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 59 custom hits (`world.ts` 15, `materials.ts` 10), sky via `sky.stars/moon/band`, `environments.neutral` + `preset`, motion blur, DoF, chromatic aberration, `effects.antiAlias` x2; `lookAt` hits are the colour-script function (`art/colorScript.ts:341`), not node `lookAt`. Source folder name `saiyan-snake-way-port` is a legacy brand name (check `brand-identifiers` stays green; do not surface in text).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] same pattern as 5.15 (A8, A4 limited, A6 verify, watch neutral environment shift)

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs serpentine-sky-run-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
