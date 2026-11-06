# Grid Dispatch (`teleoperator`): 5.0.1 upgrade guide

Source: plan section 5.4 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-teleoperator`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: custom shaders `scanPulse.ts` (2, `effects.shaderPass` x2), `tailTrails.ts`, `scene.ts` (1); `sky.preetham` + gradient, rain, SSR, volumetric fog; `scatter` x10 hand-rolled; `createHud` x4; `output:` options x5 (`output.preset` family).
- Effort and risk: S wave 1, M with A4 pilot. Visual risk: low-medium.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A6 verify (rain + film grain + SSR): default capture at 960x540 draws on 5.0.2 (evidence/game-upgrades-502/teleoperator/after.png), no RENDERER_MOUNT_FAILED, no error-level console; only the two prd02.contactShadows warnings (also present before)
- [x] A10 P3 lab flag: `?gamut=p3` (and `?backend=auto|webgpu`) wired via `showcase-port-shared/lab-flags`, default OFF, backend report published on `__AURA3D_SHOWCASE_TELEOPERATOR__.backendReport` (flag path itself not captured)
- [x] A1 loading/readiness UI (5.0.3): boot screen now has a real progress bar driven by boot stages and `app.readiness({ stage: "first-frame" })` replaces the bare `ready()` with a typed outcome; evidence/game-upgrades-503/teleoperator/after-a1-boot-progress.png (bar at 38% mid-boot); default on (DOM only, game frame unchanged: before.png vs after.png)
- [ ] (skipped) A2 diagnostics overlay: the game already ships the safety-net panel on `?diag=1` (backend, draw calls, fps, warnings); `diagnostics: { overlay: true }` on the same flag duplicated it and printed `undefined:undefined` asset rows, so it was not wired
- [ ] (skipped, n/a) A3 backend: stays lab-flag only; 7 GLSL sources have no WGSL twins
- [x] A6 verify (5.0.3): after.png vs before.png at 960x540, 12 s settle: same rain, film grain, SSR, volumetric fog; console has only the two pre-existing prd02.contactShadows warnings (plus local-server font 404s)
- [x] A10 flagged frame: evidence/game-upgrades-503/teleoperator/after-a10-p3-flag.png (`?gamut=p3`, byte-identical to before.png in this sRGB headless capture: no visible P3 difference provable here); stays default OFF
- [ ] (skipped, n/a) A5/A7/A8/A9/A11/A13-A17: not in this game's 5.4 row
- [ ] (skipped, n/a) W-4 neutral pin: game is in group C of neutral-environment-exposure.md (own HDRI IBL, no neutral dependency)
- [ ] (skipped, EXPERIMENTAL D4, pixel risk; only last-train-port, silt-and-signal-port and roadster-rush are designated A4 pilots) A4 `tailTrails.ts`/`scanPulse.ts` as shader-graph pilot (small, additive)
- [ ] (skipped, n/a) A12 scatter/merge: the game has no scatter calls (the plan's "scatter x10" are `sunInscatter` fog fields); nothing to replace and seeded placement must not change

Verification

- [ ] GC, UT, CAP: UT 151/151 pass and tsc clean; GC has 1 pre-existing error (art-direction.audit.json stale vs direction.ts), CAP is parent-owned
- [ ] `node tools/game-checks/run.mjs teleoperator` clean: same 1 pre-existing error (art-direction.audit.json stale), no new ones
- [x] Before/after frames attached (evidence/game-upgrades-503/teleoperator/{before,after}.png, REA capture_browser_scenario, 960x540, 12 s; UT 151/151, tsc clean)
- [ ] (old line) Before/after frames attached (static bands) with the capture command, per game, before the change ships
