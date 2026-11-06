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
- [ ] `environments.neutral`/`capture` exposure resolved (W-4): not pinned (5.0.3). The game authors no neutral environment (it is in the "no neutral dependency" list of the exposure note) and the settled frame is unchanged between the 5.0.2 and 5.0.3 builds (`evidence/game-upgrades-503/cross-hop/{before,after}.png`)
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 shared loading helper (`createLoadingProgress({ shell: g.shell })` in `src/main.ts`, tracks `g.ready()`); lab flags `?backend=` / `?gamut=` wired via the shared parser, default off
- [ ] A13 KTX2 or mesh compression: skipped (5.0.3, measured): the 26 GLBs are 44 MB, of which 13.4 MB is 512 px PNG textures and 30.2 MB geometry; KTX2 would save at most about 9 MB (about 20 percent) but rewrites every GLB, which changes the content-hashed asset ids and adds the Basis decoder to the critical path, and meshopt/quantised geometry risks pixels on the look-identity bands
- [ ] A4 pilot for the single custom shader: skipped (5.0.3): not one of the three designated pilots, so `SHADE_*_GLSL` in `src/game/core.ts` stays GLSL and is marked WebGL2-only in a source comment
- [x] A1 (5.0.3) real progress: `src/game/loadingUx.ts` follows the 26 GLB downloads through resource timing (no extra requests), so the engine bar and label read `Loading Cross Hop (n/26 models)` instead of sitting at 5 percent, and "Ready" waits for `app.readiness({ stage: "first-frame" })` (bounded to 4 s). Evidence `evidence/game-upgrades-503/cross-hop/{before,after}-loading-a1.png`; unit tests `tests/loadingUx.test.ts`
- [x] A12 skip (as planned); B2 partial `AuraApp` cast: none in this game (the `app.nodes as unknown as {...}` casts in `core.ts` are narrow node interfaces)

Verification

- [x] GC (0 errors, same 4 warnings as base), UT (`apps/showcase-cross-hop` vitest 8/8), typecheck clean
- [ ] CAP: parent-owned single ACR capture (local before/after frames are in `evidence/game-upgrades-502/cross-hop/`)
- [ ] `check-deploy` size budgets
- [x] `node tools/game-checks/run.mjs cross-hop`: 0 errors, same 4 warnings as origin/main (5.0.3)
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
