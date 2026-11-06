# Pip's Big Leap (`pips-big-leap`): 5.0.1 upgrade guide

Source: plan section 5.6 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-pips-big-leap`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Package/API: also `@aura3d/animation workspace:*` (only game with it); `scripts`: typecheck + vite build (from `ccdc9cfe7`).
- Legacy: 1 `material.custom` + 1 `effects.shaderPass` in `game/diorama.ts` (3 hits); 10 `looks.*` calls; `effects.auroraRibbon`, `sky.preetham`, snow, DoF; kit-heavy (`game.assetBoundPlatformerLevel`, `certifyPlatformerGeometry`, `jumpAssist`, `createLocomotion`); `instances.model` x2.
- Effort and risk: S, M with A4. Visual risk: low-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A1
- [ ] A4 pilot candidate (`diorama.ts` single shader)
- [ ] A6 verify DoF + volumetric fog
- [ ] A16 none

Verification

- [ ] GC, UT (certified platformer geometry tests), CAP
- [ ] `node tools/game-checks/run.mjs pips-big-leap` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
