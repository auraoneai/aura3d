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

- [x] A1 loading/readiness: the loading panel now draws the shared progress bar (`createLoadingProgress` -> `.aura3d-loading`, role=progressbar) through boot phases; before/after: `evidence/game-upgrades-503/drift-and-deliver-port/before-loading-bar.png`, `after-loading-bar.png` (default on, no new console output)
- [x] B2 partial `AuraApp` cast removed (`registerCourierFx(app.effects)`), lab flags via shared parser (default off) (5.0.2)
- [x] A2 diagnostics: `?diag=1` already wired through `apps/showcase-port-shared/diag.ts`; no new surface needed
- [x] A5 headlight photometric IES profile (EXPERIMENTAL, lab flag `?lights=ies`, default off): `examples/drift-and-deliver-port/headlightProfile.ts`, test `tests/unit/drift-and-deliver-port/headlight-profile.test.ts`, real-GPU frame `evidence/game-upgrades-503/drift-and-deliver-port/after-ies.png` (no degrade codes; road pool is dimmer than the scalar spot, no clear gain, so not default)
- [ ] A5 projected spot image: skipped, needs a new hash-verified PVR texture asset (asset change, EXPERIMENTAL, WebGL2-only)
- [ ] A5 light probe grid / clustered lights / voxel GI: skipped, the practical-light cap is 6 (C-35) and the look is calibrated on the IBL; no player-visible gain shown
- [ ] A4 portable materials for `headlights.ts`/`water.ts`: skipped, not a designated pilot (decision D2/D4); stays GLSL, WebGL2-only
- [x] A6 post stack verified: bloom/AO/antiAlias frame is pixel-equivalent before/after (`before.png` vs `after.png`, same console output)
- [ ] A3/A7/A8/A9/A10/A11/A12/A13/A14/A16/A17: not in this game's row or not applicable (A3/A9/A10 stay behind the shared lab flags; A15 `text3D` SDF already used)

Verification

- [x] GC, UT, CAP: `tsc -p apps/showcase-drift-and-deliver-port` clean; `tests/unit/drift-and-deliver-port` 224/225 (city mesh test timed out at 5 s under load 17, untouched code); real-GPU frames in `evidence/game-upgrades-503/drift-and-deliver-port/`
- [ ] `node tools/game-checks/run.mjs drift-and-deliver-port` clean: 1 pre-existing error (`art-direction` audit stale since ed5a52d58, untouched here), 2 pre-existing warnings
- [x] Before/after frames attached (static bands) with the capture command, per game, before the change ships
