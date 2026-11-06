# Gridlock Courier (`drift-and-deliver-port`): 5.0.1 upgrade guide

Source: plan section 5.18 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-drift-and-deliver-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 32 custom hits spread in `sky.ts` (4), `look.ts` (5), `fx.ts`, `shiftRuntime.ts`, `headlights.ts`, `water.ts`, `main.ts`; `instances.mesh` x12; banners with `text3D` SDF (`banners.ts:28`); `hdri` x3, `neutral` x2; AO, bloom, antiAlias x2; `game.phase`/`game.score` DOM-state heavy.
- Effort and risk: S wave 1, M-L lab. Visual risk: medium-high (60 s shots exceed the 30 min ACR window per 4.7.10 lesson 2; budget 14-17 min and about 0.17 USD per heavy view).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [x] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md)): `neutralFillIntensity` is 0 next to the HDRI (default path), so nothing to pin; 5.0.2 frame in `evidence/game-upgrades-502/drift-and-deliver-port/` is drawn and warm
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading/readiness helper, B2 partial `AuraApp` cast removed (`registerCourierFx(app.effects)`), lab flags via shared parser (default off)
- [ ] A5 headlights (skipped: EXPERIMENTAL, D1/D4, risks pixels): `lights.spot` with photometric/projected spot image (EXPERIMENTAL; scalar fallback), A4 for `headlights.ts`/`water.ts`, A1, A6 verify

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs drift-and-deliver-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
