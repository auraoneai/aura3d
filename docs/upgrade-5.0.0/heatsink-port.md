# Ion Circuit (`heatsink-port`): 5.0.1 upgrade guide

Source: plan section 5.19 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-heatsink-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: **63 custom hits** (`world.ts` 26, `materials.ts` 10, 10 `glsl:`), `geometry.dynamic` x8, `environments.capture` x2, sky shaders (`sky.twilight`, planet scale, moon), only `@aura3d/math` import in the 25 (vectors).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH (bespoke sky + capture env).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [x] `environments.neutral`/`capture` exposure resolved (default twilight look uses an HDRI, `capture` only under `?env=capture`; before/after frames match) (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 determinate loading bar (default on): `createLoadingProgress({ element })` drives `#loading-bar` (4 stages, 10/40/60/92/100 %), replacing the 5.0.2 text-percent hack; evidence `evidence/game-upgrades-503/heatsink-port/after-a1-loading.png` (mid-load frame; base shows only the status line)
- [x] Lab flags (`readLabFlags`/`labAppOptions`, default off; worker flag not wired, game has no createWorker): A3 `?backend=`, A10 `?gamut=p3` wired in main.ts (5.0.2)
- [x] A9 `?depth=reversed|logarithmic` now wired into the world camera via `labCameraOptions` (default off, EXPERIMENTAL, far plane is 4200 m); flagged frame `evidence/game-upgrades-503/heatsink-port/after-depth-reversed.png` renders identically to default on WebGL2, no new console errors
- [x] A2 diagnostics: already wired via `apps/showcase-heatsink-port/src/main.ts` (`?diag=1`)
- [x] B2 partial AuraApp cast: none present in this game

- [ ] A4 for `materials.ts` set (skipped: not a designated A4 pilot; stays GLSL, WebGL2-only. 10 GLSL specs read bespoke fog/twilight/pool uniforms, no pixel-diff harness exists for them)
- [ ] A5 lighting probes/IES/clustered/voxel GI (skipped: all surfaces except 11 Meshy model nodes are custom GLSL that do not sample engine lighting resources; EXPERIMENTAL with no lab flag in the shared parser; no real-GPU proof)
- [ ] A8 per-slot custom shader on Meshy models (skipped: the models already take HDRI + cascaded shadow lighting; a custom slot shader would change look identity with no measured gain)
- [ ] A12 scatter/merge, A13 KTX2, A7 workers (skipped: A12 changes seeded placement of buildProps; no KTX2 textures in game; no createWorker)
- [ ] A6 verify motion blur + chromatic aberration (twilight look enables them via postToggles; the 5.0.3 real-GPU frames at standstill show no artefact or console error, but both effects need speed to show; not isolated)

Verification

- [ ] GC, UT, CAP (GC and UT [17 files, 164 tests] pass; parent-owned CAP not run)
- [x] `node tools/game-checks/run.mjs heatsink-port` clean (0 errors, same 2 warnings as base)
- [x] Before/after frames attached (static bands) with the capture command: `evidence/game-upgrades-502/heatsink-port/{before,after}.png`; 5.0.3 REA capture (960x540, 11.5 s, `?autostart=1`, same view): `evidence/game-upgrades-503/heatsink-port/{before,after}.png` (frames match: HUD/scene unchanged; time differs only by sampling) (REA capture_browser_scenario, 960x540, `?autostart=1`, 11 s)
