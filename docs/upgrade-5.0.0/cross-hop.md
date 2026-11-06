# Cross Hop (`cross-hop`): 5.0.1 upgrade guide

Source: plan section 5.14 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-cross-hop`, platformer). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Package/API: 26 GLB / 77 aura-assets (biggest asset set), custom shader `src/game/core.ts` (2), DOM HUD in `game/ui.ts` (4 `createElement`), custom sky (`sky.clouds`, `sky.stars`, `sky.glow`) x8-ish, 6 `looks.*`; `instances.model` x12.
- Effort and risk: S-M. Visual risk: low.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading helper (`createLoadingProgress({ shell: g.shell })` in `src/main.ts`, tracks `g.ready()`); lab flags `?backend=` / `?gamut=` wired via the shared parser, default off
- [ ] A13 KTX2 or mesh compression: skipped, payload budget not measured here (risks pixels)
- [ ] A4 pilot for the single custom shader: skipped, EXPERIMENTAL and risks pixels (D4)
- [x] A12 skip (as planned); B2 partial `AuraApp` cast: none in this game (the `app.nodes as unknown as {...}` casts in `core.ts` are narrow node interfaces)

Verification

- [x] GC (0 errors, same 4 warnings as base), UT (`apps/showcase-cross-hop` vitest 8/8), typecheck clean
- [ ] CAP: parent-owned single ACR capture (local before/after frames are in `evidence/game-upgrades-502/cross-hop/`)
- [ ] `check-deploy` size budgets
- [ ] `node tools/game-checks/run.mjs cross-hop` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
